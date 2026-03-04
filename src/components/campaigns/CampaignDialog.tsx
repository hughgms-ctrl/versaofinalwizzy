import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Hand, MessageSquareText, UserPlus, Webhook, Copy, Check, ChevronRight, ChevronDown, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    useCreateCampaign,
    useUpdateCampaign,
    Campaign,
} from "@/hooks/useCampaigns";
import { useFlows } from "@/hooks/useFlows";
import { useFlowFolders } from "@/hooks/useFlowFolders";

interface CampaignDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    campaignToEdit?: Campaign | null;
}

export function CampaignDialog({
    open,
    onOpenChange,
    campaignToEdit,
}: CampaignDialogProps) {
    const [name, setName] = useState("");
    const [triggerKeyword, setTriggerKeyword] = useState("");
    const [matchType, setMatchType] = useState("exact");
    const [flowId, setFlowId] = useState("");
    const [triggerType, setTriggerType] = useState("keyword");
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

    const createCampaign = useCreateCampaign();
    const updateCampaign = useUpdateCampaign();
    const { data: flows } = useFlows();
    const { data: flowFolders = [] } = useFlowFolders();

    useEffect(() => {
        if (campaignToEdit && open) {
            setName(campaignToEdit.name);
            setFlowId(campaignToEdit.flow_id);

            // Infer triggerType from match_type
            if (['exact', 'contains', 'starts_with'].includes(campaignToEdit.match_type)) {
                setTriggerType("keyword");
                setTriggerKeyword(campaignToEdit.trigger_keyword);
                setMatchType(campaignToEdit.match_type);
            } else {
                setTriggerType(campaignToEdit.match_type);
                setTriggerKeyword(campaignToEdit.trigger_keyword || "");
            }
        } else if (open) {
            setName("");
            setTriggerKeyword("");
            setMatchType("exact");
            setFlowId("");
            setTriggerType("keyword");
        }
    }, [campaignToEdit, open]);

    const handleSubmit = () => {
        if (!name.trim() || !flowId) return;

        // Validate keyword if it's keyword type
        if (triggerType === 'keyword' && !triggerKeyword.trim()) return;

        const payload = {
            name: name.trim(),
            trigger_keyword: triggerType === 'keyword' ? triggerKeyword.trim() : "*",
            match_type: triggerType === 'keyword' ? matchType : triggerType,
            flow_id: flowId,
        };

        if (campaignToEdit) {
            updateCampaign.mutate(
                { id: campaignToEdit.id, ...payload },
                { onSuccess: () => onOpenChange(false) }
            );
        } else {
            createCampaign.mutate(payload, { onSuccess: () => onOpenChange(false) });
        }
    };

    const isSaving = createCampaign.isPending || updateCampaign.isPending;
    const isFormValid = name.trim() && flowId && (triggerType !== 'keyword' || triggerKeyword.trim());

    const triggerOptions = [
        {
            id: 'keyword',
            label: 'Palavra-chave',
            description: 'Quando o cliente envia uma mensagem com palavra específica',
            icon: MessageSquareText,
        },
        {
            id: 'new_conversation',
            label: 'Nova Conversa',
            description: 'Quando um novo contato inicia uma conversa',
            icon: UserPlus,
        },
        {
            id: 'webhook',
            label: 'Webhook',
            description: 'Disparado por uma chamada HTTP externa',
            icon: Webhook,
        },
        {
            id: 'manual',
            label: 'Manual',
            description: 'Disparado manualmente pelo operador',
            icon: Hand,
        },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {campaignToEdit ? "Editar Campanha" : "Nova Campanha"}
                    </DialogTitle>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Nome da Campanha</Label>
                        <Input
                            id="name"
                            placeholder="Ex: Promoção Black Friday"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label>Gatilho (Como a campanha inicia?)</Label>
                        <RadioGroup
                            value={triggerType}
                            onValueChange={setTriggerType}
                            className="space-y-3 mt-2"
                        >
                            {triggerOptions.map((option) => {
                                const Icon = option.icon;
                                const isSelected = triggerType === option.id;

                                return (
                                    <div key={option.id}>
                                        <Label
                                            htmlFor={option.id}
                                            className={cn(
                                                "flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all hover:bg-muted/50",
                                                isSelected
                                                    ? "border-primary bg-primary/5 hover:bg-primary/5"
                                                    : "border-border"
                                            )}
                                        >
                                            <RadioGroupItem value={option.id} id={option.id} className="mt-1" />
                                            <div className={cn(
                                                "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                                                isSelected ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-muted text-muted-foreground"
                                            )}>
                                                <Icon className="h-5 w-5" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-semibold text-foreground">{option.label}</p>
                                                <p className="text-[13px] text-muted-foreground mt-0.5">{option.description}</p>
                                            </div>
                                        </Label>

                                        {/* Mostrar opções extras se for Palavra Chave */}
                                        {isSelected && option.id === 'keyword' && (
                                            <div className="mt-4 ml-14 space-y-4 p-4 rounded-lg border bg-muted/10">
                                                <div className="grid gap-2">
                                                    <Label htmlFor="keyword" className="text-xs">Palavras-chave</Label>
                                                    <Textarea
                                                        id="keyword"
                                                        placeholder="Ex: QUERO, SIM, promoção"
                                                        value={triggerKeyword}
                                                        onChange={(e) => setTriggerKeyword(e.target.value)}
                                                        className="min-h-[60px] text-sm"
                                                    />
                                                    <p className="text-[10px] text-muted-foreground">
                                                        Separe as palavras por vírgula.
                                                    </p>
                                                </div>

                                                <div className="grid gap-2">
                                                    <Label className="text-xs">Regra</Label>
                                                    <Select value={matchType} onValueChange={setMatchType}>
                                                        <SelectTrigger className="h-9">
                                                            <SelectValue placeholder="Selecione a regra" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="exact">Mensagem exata (só a palavra)</SelectItem>
                                                            <SelectItem value="contains">Contém a palavra na frase</SelectItem>
                                                            <SelectItem value="starts_with">Frase começa com a palavra</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        )}

                                        {/* Mensagem para Webhook */}
                                        {isSelected && option.id === 'webhook' && (
                                            <div className="mt-4 ml-14 p-4 rounded-lg border bg-primary/5 text-sm text-muted-foreground">
                                                <p>A URL do webhook será gerada e associada ao ID do Fluxo selecionado abaixo. Use a documentação para disparar este fluxo via API.</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </RadioGroup>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="flow">Ação (Qual fluxo disparar?)</Label>
                        <Select value={flowId} onValueChange={setFlowId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione um fluxo..." />
                            </SelectTrigger>
                            <SelectContent>
                                {(() => {
                                    const activeFlows = flows?.filter(f => f.is_active) || [];
                                    const rootFlows = activeFlows.filter(f => !f.folder_id);
                                    const foldersWithFlows = flowFolders.filter(folder =>
                                        activeFlows.some(f => f.folder_id === folder.id)
                                    );
                                    if (activeFlows.length === 0) {
                                        return (
                                            <SelectItem value="none" disabled>
                                                Nenhum fluxo disponível
                                            </SelectItem>
                                        );
                                    }
                                    return (
                                        <>
                                            {rootFlows.length > 0 && (
                                                <SelectGroup>
                                                    {rootFlows.map((flow) => (
                                                        <SelectItem key={flow.id} value={flow.id}>
                                                            {flow.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectGroup>
                                            )}
                                            {foldersWithFlows.map((folder) => {
                                                const isOpen = expandedFolders.has(folder.id);
                                                const folderFlows = activeFlows.filter(f => f.folder_id === folder.id);
                                                return (
                                                    <SelectGroup key={folder.id}>
                                                        <div
                                                            className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-muted-foreground cursor-pointer hover:bg-muted/50 rounded-sm select-none"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setExpandedFolders(prev => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(folder.id)) next.delete(folder.id);
                                                                    else next.add(folder.id);
                                                                    return next;
                                                                });
                                                            }}
                                                        >
                                                            {isOpen ? (
                                                                <ChevronDown className="h-3 w-3" />
                                                            ) : (
                                                                <ChevronRight className="h-3 w-3" />
                                                            )}
                                                            <Folder className="h-3.5 w-3.5" />
                                                            {folder.name}
                                                        </div>
                                                        {isOpen && folderFlows.map((flow) => (
                                                            <SelectItem key={flow.id} value={flow.id} className="pl-7">
                                                                {flow.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectGroup>
                                                );
                                            })}
                                        </>
                                    );
                                })()}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter className="mt-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!isFormValid || isSaving}
                    >
                        {isSaving ? "Salvando..." : "Salvar Campanha"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
