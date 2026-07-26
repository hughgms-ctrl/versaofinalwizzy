import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { CampaignTriggerFields } from '@/components/campaigns/CampaignTriggerFields';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useTags } from '@/hooks/useTags';
import { useFlows, useCreateFlow } from '@/hooks/useFlows';
import { useCampaigns, useCreateCampaign } from '@/hooks/useCampaigns';
import { useCreateOrchestrationInstance } from '@/hooks/useAgentInstances';
import { enforceEntryCreationLimit } from '@/lib/entryFlow';

interface CreateOrchestrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Criação guiada e enxuta de orquestração: nome + gatilho da campanha (mesma
// UI de Campanhas, ver CampaignTriggerFields) -- sem workspace repetido (herda
// o já selecionado em Agentes) e sem agente inicial (entra depois como nó
// ai-handoff, montado direto no Flow Builder real; ver conversa com o
// usuário: "agente inicial dispensado, vai ser fornecido no flow builder").
// Ao confirmar, cria fluxo em branco + campanha + agent_instances (draft, sem
// agente ainda) e leva direto pro Flow Builder pra montar o resto.
export function CreateOrchestrationDialog({ open, onOpenChange }: CreateOrchestrationDialogProps) {
  const navigate = useNavigate();
  const { selectedWorkspaceId } = useWorkspaceContext();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: tags = [] } = useTags();
  const { data: existingFlows = [] } = useFlows();
  const { data: existingCampaigns = [] } = useCampaigns();

  const createFlow = useCreateFlow();
  const createCampaign = useCreateCampaign();
  const createInstance = useCreateOrchestrationInstance();

  const [name, setName] = useState('');
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [triggerType, setTriggerType] = useState('keyword');
  const [triggerKeyword, setTriggerKeyword] = useState('');
  const [matchType, setMatchType] = useState('exact');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const needsWorkspacePicker = !selectedWorkspaceId && workspaces.length > 1;

  useEffect(() => {
    if (!open) return;
    setName('');
    setWorkspaceId(selectedWorkspaceId || '');
    setTriggerType('keyword');
    setTriggerKeyword('');
    setMatchType('exact');
  }, [open, selectedWorkspaceId]);

  const isFormValid = name.trim().length > 0
    && ((triggerType !== 'keyword' && triggerType !== 'tag_added') || triggerKeyword.trim().length > 0);

  const handleSubmit = async () => {
    if (!isFormValid || isSubmitting) return;
    if (!enforceEntryCreationLimit('max_flows', existingFlows.length, 'fluxos')) return;
    if (!enforceEntryCreationLimit('max_campaigns', existingCampaigns.length, 'campanhas')) return;

    setIsSubmitting(true);
    try {
      const trimmedName = name.trim();
      const resolvedWorkspaceId = workspaceId || null;

      const flow = await createFlow.mutateAsync({
        name: trimmedName,
        workspace_id: resolvedWorkspaceId,
      });

      const campaign = await createCampaign.mutateAsync({
        name: trimmedName,
        flow_id: (flow as any).id,
        trigger_keyword: (triggerType === 'keyword' || triggerType === 'tag_added') ? triggerKeyword.trim() : '*',
        match_type: triggerType === 'keyword' ? matchType : triggerType,
        workspace_id: resolvedWorkspaceId,
        is_active: false,
      } as any);

      await createInstance.mutateAsync({
        flowId: (flow as any).id,
        campaignId: (campaign as any).id,
      });

      onOpenChange(false);
      navigate(`/flow-builder?id=${(flow as any).id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Criar orquestração</DialogTitle>
          <DialogDescription>
            Dê um nome e defina o gatilho da campanha -- o agente e o resto do fluxo você monta no Flow Builder, logo em seguida.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="grid gap-6 py-2">
            <div className="grid gap-2">
              <Label htmlFor="orchestration-name">Nome</Label>
              <Input
                id="orchestration-name"
                placeholder="Ex.: Qualificação de leads"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {needsWorkspacePicker && (
              <div className="grid gap-2">
                <Label htmlFor="orchestration-workspace">Workspace</Label>
                <Select value={workspaceId || 'none'} onValueChange={(v) => setWorkspaceId(v === 'none' ? '' : v)}>
                  <SelectTrigger id="orchestration-workspace">
                    <SelectValue placeholder="Selecione um workspace..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">Nenhum</span>
                    </SelectItem>
                    {workspaces.map((ws) => (
                      <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <CampaignTriggerFields
              triggerType={triggerType}
              onTriggerTypeChange={setTriggerType}
              triggerKeyword={triggerKeyword}
              onTriggerKeywordChange={setTriggerKeyword}
              matchType={matchType}
              onMatchTypeChange={setMatchType}
              tags={tags}
              webhookUrl=""
              onCopyWebhookUrl={() => {}}
              copied={false}
            />
          </div>
        </div>
        <DialogFooter className="mt-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!isFormValid || isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {isSubmitting ? 'Criando...' : 'Criar e ir para o Flow Builder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
