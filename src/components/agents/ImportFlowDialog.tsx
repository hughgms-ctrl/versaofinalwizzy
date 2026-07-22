import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useFlows } from '@/hooks/useFlows';
import { useAgentInstances, useImportFlowAsInstance } from '@/hooks/useAgentInstances';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';

interface DetectedAgent {
  agentId: string;
  agentName: string;
}

interface ImportFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

// Pega um fluxo já construído direto no Flow Builder (fora deste sistema) e
// passa a tratá-lo como orquestração aqui -- sem criar fluxo/agente/campanha
// novos, só linka o que já existe (ver conversa com o usuário: "puxar um
// fluxo que já existe... exemplo agente master que está em previdenciário").
// Detecta o agente automaticamente (primeiro nó "Agente de IA" do fluxo) e a
// campanha vinculada (se houver) -- mesma lógica de "agente principal" já
// usada em buildStepsGraph no apply-agent-template.
export function ImportFlowDialog({ open, onOpenChange, onImported }: ImportFlowDialogProps) {
  const { data: flows = [] } = useFlows();
  const { data: instances = [] } = useAgentInstances();
  const { availableWorkspaces } = useWorkspaceContext();
  const importFlow = useImportFlowAsInstance();

  const [flowId, setFlowId] = useState('');
  const [detected, setDetected] = useState<DetectedAgent | 'checking' | 'none' | null>(null);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [campaignId, setCampaignId] = useState<string>('');

  const alreadyImportedFlowIds = new Set(instances.map((i) => i.flow_id));
  const importableFlows = flows.filter((f) => !alreadyImportedFlowIds.has(f.id));

  const getWorkspaceName = (id: string | null) => availableWorkspaces?.find((w: any) => w.id === id)?.name;

  const reset = () => {
    setFlowId('');
    setDetected(null);
    setCampaigns([]);
    setCampaignId('');
  };

  const handlePickFlow = async (id: string) => {
    setFlowId(id);
    setDetected('checking');
    setCampaigns([]);
    setCampaignId('');

    const flow = flows.find((f) => f.id === id);
    const aiNode = (flow?.nodes || []).find((n: any) => n.type === 'ai-handoff');
    if (!aiNode?.data?.agentId) {
      setDetected('none');
      return;
    }
    setDetected({ agentId: aiNode.data.agentId, agentName: aiNode.data.agentName || 'Agente' });

    const { data } = await supabase.from('campaigns').select('id, name').eq('flow_id', id);
    const found = (data as any[]) || [];
    setCampaigns(found);
    if (found.length === 1) setCampaignId(found[0].id);
  };

  const handleImport = () => {
    if (!flowId || !detected || detected === 'checking' || detected === 'none') return;
    importFlow.mutate(
      { flowId, aiAgentId: detected.agentId, campaignId: campaignId || null },
      { onSuccess: () => { onOpenChange(false); onImported?.(); } },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Importar fluxo existente</DialogTitle>
          <DialogDescription>
            Pega um fluxo já construído direto no construtor de fluxos e passa a tratá-lo como orquestração aqui --
            sem criar nada novo, só linka o que já existe.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>Fluxo</Label>
            <Select value={flowId} onValueChange={handlePickFlow}>
              <SelectTrigger><SelectValue placeholder="Escolher fluxo..." /></SelectTrigger>
              <SelectContent>
                {importableFlows.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}{getWorkspaceName(f.workspace_id) ? ` (${getWorkspaceName(f.workspace_id)})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {importableFlows.length === 0 && (
              <p className="text-xs text-muted-foreground">Todos os fluxos já estão vinculados a uma orquestração.</p>
            )}
          </div>

          {detected === 'checking' && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Procurando o agente dentro do fluxo...
            </p>
          )}

          {detected === 'none' && (
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <p>Esse fluxo não tem nenhuma etapa de "Agente de IA" -- não dá pra importar como orquestração.</p>
            </div>
          )}

          {detected && detected !== 'checking' && detected !== 'none' && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Agente encontrado: <span className="font-medium text-foreground">{detected.agentName}</span>
              </p>
              {campaigns.length > 1 && (
                <div className="space-y-2">
                  <Label>Campanha vinculada</Label>
                  <Select value={campaignId} onValueChange={setCampaignId}>
                    <SelectTrigger><SelectValue placeholder="Escolher campanha..." /></SelectTrigger>
                    <SelectContent>
                      {campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {campaigns.length === 1 && (
                <p className="text-xs text-muted-foreground">
                  Campanha vinculada: <span className="font-medium text-foreground">{campaigns[0].name}</span>
                </p>
              )}
              {campaigns.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma campanha vinculada a esse fluxo ainda -- a orquestração entra como rascunho.</p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!flowId || detected === 'checking' || detected === 'none' || !detected || importFlow.isPending}
            onClick={handleImport}
          >
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
