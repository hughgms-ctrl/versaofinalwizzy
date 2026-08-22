import { useState, useEffect, useMemo } from "react";
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
import { ChevronRight, ChevronDown, Folder } from "lucide-react";
import {
    useCampaigns,
    useCreateCampaign,
    useUpdateCampaign,
    Campaign,
} from "@/hooks/useCampaigns";
import { useFlows } from "@/hooks/useFlows";
import { useFlowFolders } from "@/hooks/useFlowFolders";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useTags } from "@/hooks/useTags";
import { enforceEntryCreationLimit } from "@/lib/entryFlow";
import {
    FALLBACK_MATCH_TYPE,
    KEYWORD_TRIGGER_MATCH_TYPES,
    findFallbackConflicts,
    findKeywordCollisions,
} from "@/lib/campaignKeywordMatch";
import { CampaignTriggerFields } from "./CampaignTriggerFields";

interface CampaignDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    campaignToEdit?: Campaign | null;
    /** Folder the new campaign should be created in (when creating from inside an open folder). */
    folderId?: string | null;
}

export function CampaignDialog({
    open,
    onOpenChange,
    campaignToEdit,
    folderId = null,
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
    const [triggerTagIds, setTriggerTagIds] = useState<string[]>([]);
    const [triggerTagMatch, setTriggerTagMatch] = useState("any");
    const [triggerPriority, setTriggerPriority] = useState(0);
    const [interrompeFluxo, setInterrompeFluxo] = useState(false);

    const createCampaign = useCreateCampaign();
    const updateCampaign = useUpdateCampaign();
    const { data: flows } = useFlows();
    const { data: campaigns = [] } = useCampaigns();
    const { data: flowFolders = [] } = useFlowFolders();
    const { data: workspaces = [] } = useWorkspaces();
    const { selectedWorkspaceId } = useWorkspaceContext();
    const { data: tags = [] } = useTags();

    useEffect(() => {
        if (campaignToEdit && open) {
            setName(campaignToEdit.name);
            setFlowId(campaignToEdit.flow_id);

            // Infer triggerType from match_type
            if (KEYWORD_TRIGGER_MATCH_TYPES.includes(campaignToEdit.match_type)) {
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
            setTriggerTagIds(campaignToEdit.trigger_tag_ids ?? []);
            setTriggerTagMatch(campaignToEdit.trigger_tag_match ?? "any");
            setTriggerPriority(campaignToEdit.trigger_priority ?? 0);
            setInterrompeFluxo(campaignToEdit.interrompe_fluxo ?? false);
        } else if (open) {
            setName("");
            setTriggerKeyword("");
            setMatchType("exact");
            setFlowId("");
            setTriggerType("keyword");
            setWorkspaceId(selectedWorkspaceId && workspaces.some(w => w.id === selectedWorkspaceId) ? selectedWorkspaceId : "");
            setWebhookToken("");
            setTriggerTagIds([]);
            setTriggerTagMatch("any");
            setTriggerPriority(0);
            setInterrompeFluxo(false);
        }
    }, [campaignToEdit, open, flows, selectedWorkspaceId, workspaces]);

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

    // "Qualquer mensagem" é um match_type dentro do gatilho de palavra-chave, mas sem
    // texto próprio: não tem palavra para escrever, para validar nem para gravar.
    const isFallback = triggerType === 'keyword' && matchType === FALLBACK_MATCH_TYPE;

    const handleSubmit = () => {
        if (!name.trim() || !flowId) return;
        if (!campaignToEdit && !enforceEntryCreationLimit('max_campaigns', campaigns.length, 'campanhas')) return;

        // Validate keyword if it's keyword type
        if (triggerType === 'keyword' && !isFallback && !triggerKeyword.trim()) return;

        const payload: any = {
            name: name.trim(),
            trigger_keyword: isFallback
                ? "*"
                : (triggerType === 'keyword' || triggerType === 'tag_added') ? triggerKeyword.trim() : "*",
            match_type: triggerType === 'keyword' ? matchType : triggerType,
            flow_id: flowId,
            start_time: startTime,
            end_time: endTime,
            workspace_id: workspaceId || null,
            // Público e prioridade só valem para o gatilho de palavra-chave --
            // é o checkCampaignTriggers que os lê. Nos outros tipos zera, senão
            // trocar o gatilho deixaria um filtro invisível para trás.
            trigger_tag_ids: triggerType === 'keyword' ? triggerTagIds : [],
            trigger_tag_match: triggerType === 'keyword' ? triggerTagMatch : 'any',
            // "Qualquer mensagem" não usa prioridade: o webhook a avalia num segundo
            // passe, depois de todas as outras. Grava 0 para não deixar um número
            // sobrando que sugira uma disputa que não existe.
            trigger_priority: (triggerType === 'keyword' && !isFallback) ? triggerPriority : 0,
            // Só o gatilho de palavra-chave passa pelo ramo de fluxo ativo no
            // webhook; em tag/webhook a coluna não seria lida por ninguém.
            // Fallback + interromper é a combinação que tira a base inteira de dentro
            // dos fluxos: a tela não oferece, o webhook recusa e o banco tem CHECK.
            interrompe_fluxo: (triggerType === 'keyword' && !isFallback) ? interrompeFluxo : false,
        };

        if (campaignToEdit) {
            updateCampaign.mutate(
                { id: campaignToEdit.id, ...payload },
                { onSuccess: () => onOpenChange(false) }
            );
        } else {
            createCampaign.mutate(
                { ...payload, folder_id: folderId },
                { onSuccess: () => onOpenChange(false) }
            );
        }
    };

    // Quais campanhas ativas a mesma mensagem também dispararia. Recalcula a
    // cada tecla, mas é comparação de string sobre a lista já carregada.
    const collisions = useMemo(() => {
        if (triggerType !== 'keyword') return [];
        return findKeywordCollisions(
            {
                id: campaignToEdit?.id,
                trigger_keyword: triggerKeyword,
                match_type: matchType,
                trigger_priority: triggerPriority,
            },
            campaigns,
        );
    }, [triggerType, triggerKeyword, matchType, triggerPriority, campaigns, campaignToEdit?.id]);

    // Outra campanha "qualquer mensagem" ativa = sorteio entre as duas.
    const fallbackConflicts = useMemo(() => {
        if (!isFallback) return [];
        return findFallbackConflicts(
            { id: campaignToEdit?.id, match_type: FALLBACK_MATCH_TYPE, workspace_id: workspaceId || null },
            campaigns,
        );
    }, [isFallback, workspaceId, campaigns, campaignToEdit?.id]);

    const isSaving = createCampaign.isPending || updateCampaign.isPending;
    const isFormValid = name.trim() && flowId && (
        isFallback || (triggerType !== 'keyword' && triggerType !== 'tag_added') || triggerKeyword.trim()
    );

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

                    <CampaignTriggerFields
                        triggerType={triggerType}
                        onTriggerTypeChange={setTriggerType}
                        triggerKeyword={triggerKeyword}
                        onTriggerKeywordChange={setTriggerKeyword}
                        matchType={matchType}
                        onMatchTypeChange={(value) => {
                            setMatchType(value);
                            // Trocar para "qualquer mensagem" com "interromper" já marcado
                            // deixaria o estado guardando a combinação proibida -- e ela
                            // voltaria sozinha se a pessoa trocasse o tipo de novo.
                            if (value === FALLBACK_MATCH_TYPE) setInterrompeFluxo(false);
                        }}
                        tags={tags}
                        triggerTagIds={triggerTagIds}
                        onTriggerTagIdsChange={setTriggerTagIds}
                        triggerTagMatch={triggerTagMatch}
                        onTriggerTagMatchChange={setTriggerTagMatch}
                        triggerPriority={triggerPriority}
                        onTriggerPriorityChange={setTriggerPriority}
                        interrompeFluxo={interrompeFluxo}
                        onInterrompeFluxoChange={setInterrompeFluxo}
                        collisions={collisions}
                        fallbackConflicts={fallbackConflicts}
                        webhookUrl={webhookUrl}
                        onCopyWebhookUrl={handleCopyUrl}
                        copied={copied}
                        onRotateWebhookUrl={campaignToEdit ? handleRotateUrl : undefined}
                        isRotatingWebhookUrl={updateCampaign.isPending}
                    />

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
