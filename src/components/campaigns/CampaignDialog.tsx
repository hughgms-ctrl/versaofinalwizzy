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
import { Hand, MessageSquareText, UserPlus, Webhook, Copy, Check, ChevronRight, ChevronDown, Folder, Tag, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    useCampaigns,
    useCreateCampaign,
    useUpdateCampaign,
    Campaign,
} from "@/hooks/useCampaigns";
import { useFlows } from "@/hooks/useFlows";
import { useFlowFolders } from "@/hooks/useFlowFolders";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useTags } from "@/hooks/useTags";
import { enforceEntryCreationLimit } from "@/lib/entryFlow";

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
    const [startTime, setStartTime] = useState("00:00");
    const [endTime, setEndTime] = useState("23:59");
    const [workspaceId, setWorkspaceId] = useState<string>("");
    const [webhookToken, setWebhookToken] = useState<string>("");
    const [copied, setCopied] = useState(false);

    const createCampaign = useCreateCampaign();
    const updateCampaign = useUpdateCampaign();
    const { data: flows } = useFlows();
    const { data: campaigns = [] } = useCampaigns();
    const { data: flowFolders = [] } = useFlowFolders();
    const { data: workspaces = [] } = useWorkspaces();
    const { data: tags = [] } = useTags();

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
            setStartTime(campaignToEdit.start_time ?? "00:00");
            setEndTime(campaignToEdit.end_time ?? "23:59");
            setWorkspaceId((campaignToEdit as any).workspace_id || "");
            setWebhookToken(campaignToEdit.webhook_token || "");
        } else if (open) {
            setName("");
            setTriggerKeyword("");
            setMatchType("exact");
            setFlowId("");
            setTriggerType("keyword");
            setWorkspaceId("");
            setWebhookToken("");
        }
    }, [campaignToEdit, open, flows]);

    const webhookUrl = webhookToken
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/campaign-webhook/${webhookToken}`
        : "";

    const handleCopyUrl = () => {
        if (!webhookUrl) return;
        navigator.clipboard.writeText(webhookUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRotateUrl = () => {
        if (!campaignToEdit?.id) return;
        const newToken = crypto.randomUUID();
        setWebhookToken(newToken);
        updateCampaign.mutate({ id: campaignToEdit.id, webhook_token: newToken } as any);
    };

    const handleSubmit = () => {
        if (!name.trim() || !flowId) return;
        if (!campaignToEdit && !enforceEntryCreationLimit('max_campaigns', campaigns.length, 'campanhas')) return;

        // Validate keyword if it's keyword type
        if (triggerType === 'keyword' && !triggerKeyword.trim()) return;

        const payload: any = {
            name: name.trim(),
            trigger_keyword: (triggerType === 'keyword' || triggerType === 'tag_added') ? triggerKeyword.trim() : "*",
            match_type: triggerType === 'keyword' ? matchType : triggerType,
            flow_id: flowId,
            start_time: startTime,
            end_time: endTime,
            workspace_id: workspaceId || null,
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
    const isFormValid = name.trim() && flowId && ((triggerType !== 'keyword' && triggerType !== 'tag_added') || triggerKeyword.trim());

    const triggerOptions = [
        {
            id: 'keyword',
            label: 'Palavra-chave',
            description: 'Quando o cliente envia uma mensagem com palavra específica',
            icon: MessageSquareText,
        },
        {
            id: 'tag_added',
            label: 'Tag Adicionada',
            description: 'Quando uma tag específica é adicionada ao contato',
            icon: Tag,
        },
        {
            id: 'webhook',
            label: 'Webhook',
            description: 'Disparado por uma chamada HTTP externa',
            icon: Webhook,
        },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[550px] max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>
                        {campaignToEdit ? "Editar Campanha" : "Nova Campanha"}
                    </DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto pr-2">
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

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="start_time">Início (HH:MM)</Label>
                            <Input
                                id="start_time"
                                type="time"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="end_time">Fim (HH:MM)</Label>
                            <Input
                                id="end_time"
                                type="time"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                            />
                        </div>
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

                                        {/* Mostrar opções se for Tag Adicionada */}
                                        {isSelected && option.id === 'tag_added' && (
                                            <div className="mt-4 ml-14 space-y-4 p-4 rounded-lg border bg-muted/10">
                                                <div className="grid gap-2">
                                                    <Label className="text-xs">Tag</Label>
                                                    <Select value={triggerKeyword} onValueChange={setTriggerKeyword}>
                                                        <SelectTrigger className="h-9">
                                                            <SelectValue placeholder="Selecione a tag" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {tags.map((tag) => (
                                                                <SelectItem key={tag.id} value={tag.id}>
                                                                    <div className="flex items-center gap-2">
                                                                        <div 
                                                                            className="w-3 h-3 rounded-full" 
                                                                            style={{ backgroundColor: tag.color || '#6366f1' }}
                                                                        />
                                                                        {tag.name}
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        )}

                                        {/* Mensagem para Webhook */}
                                        {isSelected && option.id === 'webhook' && (
                                            <div className="mt-4 ml-14 p-4 rounded-lg border bg-primary/5 space-y-3">
                                                <p className="text-sm text-foreground font-medium">Como utilizar este webhook?</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Faça uma requisição HTTP <strong>POST</strong> para a URL abaixo enviando o número e os dados do contato. Cada contato cria/atualiza o cadastro, abre uma conversa e dispara o fluxo selecionado.
                                                </p>
                                                {webhookUrl ? (
                                                    <>
                                                        <div className="grid gap-1.5">
                                                            <Label className="text-xs">URL do Webhook (POST)</Label>
                                                            <div className="flex items-center gap-2">
                                                                <code className="flex-1 bg-background border rounded px-2 py-1.5 text-[10px] sm:text-xs text-muted-foreground break-all font-mono">
                                                                    {webhookUrl}
                                                                </code>
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="icon"
                                                                    className="h-8 w-8 shrink-0"
                                                                    onClick={handleCopyUrl}
                                                                    title="Copiar URL"
                                                                >
                                                                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                                                                </Button>
                                                            </div>
                                                        </div>

                                                        <div className="bg-background border rounded p-3 mt-1">
                                                            <code className="text-[10px] sm:text-xs text-muted-foreground break-all whitespace-pre-wrap font-mono">
                                                                {`curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"phone": "5511999999999", "name": "João", "cpf": "123"}'`}
                                                            </code>
                                                        </div>

                                                        <p className="text-[11px] text-muted-foreground">
                                                            Para disparar para vários contatos de uma vez, envie uma lista: <code className="font-mono">[{`{"phone": "..."}`}, {`{"phone": "..."}`}]</code> (até 100 por chamada).
                                                        </p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            Os campos enviados ficam disponíveis no fluxo como <code className="font-mono">{`{{phone}}`}</code>, <code className="font-mono">{`{{name}}`}</code>, <code className="font-mono">{`{{cpf}}`}</code> etc.
                                                        </p>

                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 px-2 text-xs text-muted-foreground"
                                                            onClick={handleRotateUrl}
                                                            disabled={updateCampaign.isPending}
                                                        >
                                                            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                                            Gerar nova URL
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <p className="text-xs text-muted-foreground italic mt-2">
                                                        Salve a campanha primeiro para ver a URL do webhook.
                                                    </p>
                                                )}
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
                                    const allFlows = (flows || []).filter(f => 
                                      !workspaceId || !f.workspace_id || f.workspace_id === workspaceId
                                    );
                                    const rootFlows = allFlows.filter(f => !f.folder_id);
                                    const foldersToRender = flowFolders.filter(folder =>
                                      allFlows.some(f => f.folder_id === folder.id)
                                    );
                                    if (allFlows.length === 0 && foldersToRender.length === 0) {
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
                                            {foldersToRender.map((folder) => {
                                                const folderFlows = allFlows.filter(f => f.folder_id === folder.id);
                                                const isSelectedFolder = folderFlows.some(f => f.id === flowId);
                                                const isOpen = expandedFolders.has(folder.id) || isSelectedFolder;
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

                    {/* Workspace */}
                    {workspaces.length > 0 && (
                        <div className="grid gap-2">
                            <Label htmlFor="workspace">Workspace (opcional)</Label>
                            <Select value={workspaceId || "none"} onValueChange={(v) => setWorkspaceId(v === "none" ? "" : v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione um workspace..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">
                                        <span className="text-muted-foreground">Nenhum</span>
                                    </SelectItem>
                                    {workspaces.map((ws) => (
                                        <SelectItem key={ws.id} value={ws.id}>
                                            <div className="flex items-center gap-2">
                                                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ws.color }} />
                                                {ws.name}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground">
                                Contatos que entrarem por esta campanha serão atribuídos a este workspace.
                            </p>
                        </div>
                    )}
                    </div>
                </div>
                <DialogFooter className="mt-2 pt-2 border-t">
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
