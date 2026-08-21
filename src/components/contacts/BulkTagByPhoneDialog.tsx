import { useState, useMemo } from 'react';
import { Loader2, Search, Tag as TagIcon, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTags } from '@/hooks/useTags';
import { useBulkAddTag, useBulkRemoveTag } from '@/hooks/useContactBulkActions';
import { parsePhoneList, phoneVariants } from '@/lib/phoneVariants';
import { toast } from 'sonner';

interface BulkTagByPhoneDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface MatchRow {
    /** O que a pessoa colou, já reduzido a dígitos. */
    typed: string;
    contactId: string | null;
    contactName: string | null;
}

// Um `.in('phone', ...)` por vez não pode carregar 50 telefones x 4 variantes
// numa URL só sem risco de estourar o limite de querystring do PostgREST.
const VARIANTS_PER_QUERY = 200;

/**
 * Aplicar (ou tirar) uma tag colando uma lista de telefones.
 *
 * A barra de ações em massa já existia, mas ela age sobre o que está SELECIONADO
 * na lista -- serve para dez contatos que você já achou. Marcar presença de
 * cinquenta pessoas depois de um evento é outro problema: você tem a lista de
 * telefones na mão e não tem como achar cada um na tela. Sem isto, o caminho era
 * webhook por contato ou SQL na mão.
 */
export function BulkTagByPhoneDialog({ open, onOpenChange }: BulkTagByPhoneDialogProps) {
    const { profile } = useAuth();
    const organizationId = profile?.organization_id;
    const { data: tags = [] } = useTags();
    const bulkAddTag = useBulkAddTag();
    const bulkRemoveTag = useBulkRemoveTag();

    const [rawText, setRawText] = useState('');
    const [tagId, setTagId] = useState('');
    const [action, setAction] = useState<'add' | 'remove'>('add');
    const [isChecking, setIsChecking] = useState(false);
    const [matches, setMatches] = useState<MatchRow[] | null>(null);

    const { phones, invalid } = useMemo(() => parsePhoneList(rawText), [rawText]);

    const found = matches?.filter((m) => m.contactId) ?? [];
    const notFound = matches?.filter((m) => !m.contactId) ?? [];
    const isApplying = bulkAddTag.isPending || bulkRemoveTag.isPending;

    const reset = () => {
        setRawText('');
        setTagId('');
        setAction('add');
        setMatches(null);
    };

    // Texto novo invalida a conferência anterior: aplicar em cima de um resultado
    // velho aplicaria a tag numa lista que não é mais a que está na tela.
    const handleTextChange = (value: string) => {
        setRawText(value);
        setMatches(null);
    };

    const handleCheck = async () => {
        if (!organizationId || phones.length === 0) return;
        setIsChecking(true);
        try {
            // Cada telefone digitado vira suas variantes (com/sem 55, com/sem o
            // nono dígito). Busca todas de uma vez e depois mapeia de volta.
            const variantsByPhone = new Map<string, string[]>();
            const allVariants = new Set<string>();
            for (const phone of phones) {
                const variants = phoneVariants(phone);
                variantsByPhone.set(phone, variants);
                variants.forEach((v) => allVariants.add(v));
            }

            const variantList = Array.from(allVariants);
            const byStoredPhone = new Map<string, { id: string; name: string | null }>();

            for (let i = 0; i < variantList.length; i += VARIANTS_PER_QUERY) {
                const slice = variantList.slice(i, i + VARIANTS_PER_QUERY);
                const { data, error } = await supabase
                    .from('contacts')
                    .select('id, name, phone')
                    .eq('organization_id', organizationId)
                    .in('phone', slice);

                if (error) throw error;
                for (const row of data || []) {
                    byStoredPhone.set(row.phone, { id: row.id, name: row.name });
                }
            }

            const rows: MatchRow[] = phones.map((typed) => {
                const hit = (variantsByPhone.get(typed) || [])
                    .map((v) => byStoredPhone.get(v))
                    .find(Boolean);
                return {
                    typed,
                    contactId: hit?.id ?? null,
                    contactName: hit?.name ?? null,
                };
            });

            setMatches(rows);
        } catch (e) {
            console.error('BulkTagByPhoneDialog: falha ao conferir', e);
            toast.error('Não foi possível conferir a lista.');
        } finally {
            setIsChecking(false);
        }
    };

    const handleApply = () => {
        const contactIds = found.map((m) => m.contactId!).filter(Boolean);
        if (!tagId || contactIds.length === 0) return;

        const mutation = action === 'add' ? bulkAddTag : bulkRemoveTag;
        mutation.mutate(
            { contactIds, tagId },
            {
                onSuccess: () => {
                    onOpenChange(false);
                    reset();
                },
            },
        );
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                onOpenChange(next);
                if (!next) reset();
            }}
        >
            <DialogContent className="sm:max-w-[560px] max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Aplicar tag por lista de telefones</DialogTitle>
                    <DialogDescription>
                        Cole os telefones, confira quem foi encontrado e aplique a tag de uma vez.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="phone_list" className="text-xs">Telefones</Label>
                        <Textarea
                            id="phone_list"
                            value={rawText}
                            onChange={(e) => handleTextChange(e.target.value)}
                            placeholder={'11999999999\n+55 21 98888-7777\n5531977776666'}
                            className="min-h-[140px] font-mono text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Um por linha, ou separados por vírgula. Não importa se tem +55, parênteses ou traço —
                            e o nono dígito do celular é conferido nas duas formas.
                        </p>
                        {phones.length > 0 && (
                            <p className="text-[11px] text-muted-foreground">
                                {phones.length} telefone(s) na lista
                                {invalid.length > 0 && ` — ${invalid.length} linha(s) ignorada(s) por não parecerem telefone`}
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-2">
                            <Label className="text-xs">Ação</Label>
                            <Select value={action} onValueChange={(v) => setAction(v as 'add' | 'remove')}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="add">Adicionar tag</SelectItem>
                                    <SelectItem value="remove">Remover tag</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label className="text-xs">Tag</Label>
                            <Select value={tagId} onValueChange={setTagId}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {tags.map((tag) => (
                                        <SelectItem key={tag.id} value={tag.id}>
                                            <div className="flex items-center gap-2">
                                                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                                                {tag.name}
                                            </div>
                                        </SelectItem>
                                    ))}
                                    {!tags.length && <SelectItem value="none" disabled>Nenhuma tag criada</SelectItem>}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleCheck}
                        disabled={phones.length === 0 || isChecking}
                    >
                        {isChecking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                        Conferir quem está na base
                    </Button>

                    {matches && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-xs">
                                <Check className="h-3.5 w-3.5 text-green-600" />
                                <span className="font-medium text-foreground">{found.length} encontrado(s)</span>
                                {notFound.length > 0 && (
                                    <>
                                        <AlertCircle className="h-3.5 w-3.5 text-amber-600 ml-2" />
                                        <span className="text-muted-foreground">{notFound.length} sem cadastro</span>
                                    </>
                                )}
                            </div>

                            {notFound.length > 0 && (
                                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                                    <p className="text-[11px] text-foreground mb-1.5">
                                        Estes telefones não têm contato na base e vão ficar de fora:
                                    </p>
                                    <div className="max-h-24 overflow-y-auto font-mono text-[10px] text-muted-foreground space-y-0.5">
                                        {notFound.map((m) => <div key={m.typed}>{m.typed}</div>)}
                                    </div>
                                </div>
                            )}

                            {found.length > 0 && (
                                <div className="rounded-lg border p-3">
                                    <div className="max-h-32 overflow-y-auto text-[11px] space-y-0.5">
                                        {found.map((m) => (
                                            <div key={m.typed} className="flex items-center justify-between gap-2">
                                                <span className="truncate">{m.contactName || 'Sem nome'}</span>
                                                <span className="font-mono text-[10px] text-muted-foreground shrink-0">{m.typed}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isApplying}>
                        Cancelar
                    </Button>
                    <Button onClick={handleApply} disabled={!tagId || found.length === 0 || isApplying}>
                        {isApplying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TagIcon className="h-4 w-4 mr-2" />}
                        {action === 'add' ? 'Adicionar' : 'Remover'} em {found.length} contato(s)
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
