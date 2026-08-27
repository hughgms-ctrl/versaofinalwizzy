import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, MessageSquarePlus } from 'lucide-react';
import { useCreateConversation } from '@/hooks/useConversations';
import { PhoneNumberInput } from '@/components/shared/PhoneNumberInput';
import { DEFAULT_COUNTRY, toE164, validateNationalNumber, type Country } from '@/lib/countries';
import { toast } from '@/hooks/use-toast';

interface NewConversationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConversationCreated?: (conversation: any) => void;
    workspaceId?: string | null;
}

export function NewConversationDialog({ open, onOpenChange, onConversationCreated, workspaceId }: NewConversationDialogProps) {
    const [name, setName] = useState('');
    const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
    // Numero NACIONAL (sem o codigo do pais) -- o E.164 e montado ao salvar,
    // igual ao cadastro de contato. Aqui o telefone tambem cria o contato, e
    // um 55 chutado em numero estrangeiro gera um jid que nao existe.
    const [phone, setPhone] = useState('');
    const [error, setError] = useState<string | null>(null);
    const createConversation = useCreateConversation();

    const handleCreate = async () => {
        const invalid = validateNationalNumber(country, phone);
        if (invalid) {
            setError(invalid);
            return;
        }
        setError(null);

        try {
            const result = await createConversation.mutateAsync({
                name: name.trim() || null,
                phone: toE164(country, phone),
                // Ja vem com o codigo do pais escolhido: o hook nao deve chutar o 55.
                phoneIsE164: true,
                workspaceId: workspaceId || null,
            });

            onOpenChange(false);
            setName('');
            setPhone('');
            setCountry(DEFAULT_COUNTRY);

            if (onConversationCreated && result?.conversation) {
                onConversationCreated(result.conversation);
            }
        } catch (error) {
            console.error(error);
            toast({
                title: "Erro ao iniciar conversa",
                description: error instanceof Error ? error.message : "Não foi possível criar a conversa.",
                variant: "destructive",
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <MessageSquarePlus className="h-5 w-5 text-primary" />
                        </div>
                    </div>
                    <DialogTitle>Nova Conversa</DialogTitle>
                    <DialogDescription>
                        Inicie um atendimento com um novo número de telefone.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="phone">Telefone (obrigatório)</Label>
                        <PhoneNumberInput
                            id="phone"
                            country={country}
                            onCountryChange={(next) => {
                                setCountry(next);
                                setError(null);
                            }}
                            value={phone}
                            onChange={(value) => {
                                setPhone(value);
                                if (error) setError(null);
                            }}
                            onEnter={handleCreate}
                            placeholder={country.iso2 === 'br' ? '(11) 99999-9999' : 'Número sem o código do país'}
                        />
                        {error ? (
                            <p className="text-[11px] text-destructive">{error}</p>
                        ) : (
                            <p className="text-[10px] text-muted-foreground">
                                Escolha o país e digite o número sem o +{country.dialCode}. Colar o número
                                completo (ex: +1 415 555 0100) também funciona.
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="name">Nome (opcional)</Label>
                        <Input
                            id="name"
                            placeholder="Ex: João Silva"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoComplete="off"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button
                        onClick={handleCreate}
                        disabled={!phone.trim() || createConversation.isPending}
                        className="gap-2"
                    >
                        {createConversation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <MessageSquarePlus className="h-4 w-4" />
                        )}
                        Iniciar Conversa
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
