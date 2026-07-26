import { useEffect, useState } from 'react';
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
import { AlertTriangle, Loader2, Mic } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useTags } from '@/hooks/useTags';
import { useAgentTemplateDetail } from '@/hooks/useAgentTemplates';
import type { AgentTemplate } from './AgentTemplateGallery';
import { findRecordedMedia, recordedMediaMessage } from '@/lib/templateMediaCheck';

interface CollidingCampaign {
  id: string;
  name: string;
  trigger_keyword: string;
}

interface ApplyTemplateWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: AgentTemplate | null;
  onApplied?: () => void;
}

// Aplica um template da galeria: cria fluxo, agente(s) e campanha novos pra
// organização a partir do snapshot salvo do template (backend resolve tudo
// via `action: 'apply', templateId`, sem passar por nenhum parser de etapas).
// Criação "do zero" e edição de orquestração NÃO passam mais por aqui -- a
// orquestração agora é sempre editada direto no Flow Builder real (ver
// CreateOrchestrationDialog.tsx e a faixa de contexto em FlowBuilderPage.tsx).
export function ApplyTemplateWizard({ open, onOpenChange, template, onApplied }: ApplyTemplateWizardProps) {
  const { toast } = useToast();
  const { availableWorkspaces, selectedWorkspaceId } = useWorkspaceContext();
  const { data: tags = [] } = useTags();
  // Só pra avisar de áudio/vídeo pré-gravado no template antes de ativar (ver
  // conversa com o usuário).
  const { data: templateDetail } = useAgentTemplateDetail(template?.id || null);
  const mediaWarning = templateDetail ? recordedMediaMessage(findRecordedMedia(templateDetail.flowSnapshot.nodes)) : null;

  const [step, setStep] = useState<'workspace' | 'applying' | 'review' | 'activating'>('workspace');
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [triggerKeyword, setTriggerKeyword] = useState('');
  const [colliding, setColliding] = useState<CollidingCampaign[]>([]);
  const [checkingKeyword, setCheckingKeyword] = useState(false);
  const [goalTagId, setGoalTagId] = useState<string>('');
  const [savingGoal, setSavingGoal] = useState(false);

  const scopedTags = workspaceId ? tags.filter((t) => !t.workspace_id || t.workspace_id === workspaceId) : tags;

  useEffect(() => {
    if (!open) return;
    setStep(availableWorkspaces.length > 1 ? 'workspace' : 'applying');
    setWorkspaceId(
      availableWorkspaces.length === 1
        ? availableWorkspaces[0].id
        : (selectedWorkspaceId && availableWorkspaces.some((w) => w.id === selectedWorkspaceId) ? selectedWorkspaceId : '')
    );
    setInstanceId(null);
    setCampaignId(null);
    setTriggerKeyword('');
    setColliding([]);
    setGoalTagId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id]);

  useEffect(() => {
    if (step !== 'applying' || !template) return;
    (async () => {
      const { data, error } = await supabase.functions.invoke('apply-agent-template', {
        body: { action: 'apply', templateId: template.id, workspaceId: workspaceId || null },
      });
      if (error || data?.error) {
        toast({ title: 'Erro ao criar orquestração', description: error?.message || data?.error, variant: 'destructive' });
        onOpenChange(false);
        return;
      }
      setInstanceId(data.instance.id);
      setCampaignId(data.campaign.id);
      setTriggerKeyword(data.campaign.trigger_keyword);
      setColliding(data.collidingCampaigns || []);
      setStep('review');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const recheckKeyword = async () => {
    if (!instanceId || !triggerKeyword.trim()) return;
    setCheckingKeyword(true);
    try {
      const { data, error } = await supabase.functions.invoke('apply-agent-template', {
        body: { action: 'check_keyword', instanceId, triggerKeyword },
      });
      if (error || data?.error) {
        toast({ title: 'Erro ao checar gatilho', description: error?.message || data?.error, variant: 'destructive' });
        return;
      }
      setColliding(data.collidingCampaigns || []);
    } finally {
      setCheckingKeyword(false);
    }
  };

  const saveGoalTag = async () => {
    if (!instanceId) return;
    setSavingGoal(true);
    const { data, error } = await supabase.functions.invoke('apply-agent-template', {
      body: { action: 'set_goal_tag', instanceId, goalTagId: goalTagId || null },
    });
    setSavingGoal(false);
    if (error || data?.error) {
      toast({ title: 'Erro ao salvar objetivo', description: error?.message || data?.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Objetivo salvo', description: goalTagId ? 'A conversão passa a ser calculada por essa tag.' : 'Objetivo removido -- a conversão deixa de ser mostrada.' });
  };

  const activate = async () => {
    if (!instanceId) return;
    setStep('activating');
    const { data, error } = await supabase.functions.invoke('apply-agent-template', {
      body: { action: 'activate', instanceId },
    });
    if (error || data?.error) {
      toast({ title: 'Erro ao ativar', description: error?.message || data?.error, variant: 'destructive' });
      setStep('review');
      return;
    }
    toast({
      title: 'Agente ativado',
      description: 'O template está aplicado e a campanha está ativa.',
    });
    onOpenChange(false);
    onApplied?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{template ? `Aplicar template: ${template.name}` : 'Aplicar template'}</DialogTitle>
          <DialogDescription>
            Isso cria um fluxo, um agente e uma campanha novos pra sua organização, a partir deste template.
          </DialogDescription>
        </DialogHeader>

        {step === 'workspace' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Workspace</Label>
              <Select value={workspaceId} onValueChange={setWorkspaceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o workspace..." />
                </SelectTrigger>
                <SelectContent>
                  {availableWorkspaces.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O número de WhatsApp e o pipeline usados serão os já configurados para esse workspace.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button disabled={!workspaceId} onClick={() => setStep('applying')}>Continuar</Button>
            </DialogFooter>
          </div>
        )}

        {(step === 'applying' || step === 'activating') && (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            {step === 'applying' ? 'Criando fluxo, agente(s) e campanha...' : 'Ativando...'}
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Criado como rascunho. Confira a palavra-chave que vai disparar esse atendimento antes de ativar.
            </p>

            {mediaWarning && (
              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <Mic className="h-4 w-4 shrink-0" />
                <p>{mediaWarning}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="trigger-keyword">Palavra-chave de gatilho</Label>
              <div className="flex gap-2">
                <Input
                  id="trigger-keyword"
                  value={triggerKeyword}
                  onChange={(e) => setTriggerKeyword(e.target.value)}
                />
                <Button variant="outline" size="sm" onClick={recheckKeyword} disabled={checkingKeyword}>
                  {checkingKeyword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Checar'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-tag">Objetivo de conversão (opcional)</Label>
              <div className="flex gap-2">
                <Select value={goalTagId || 'none'} onValueChange={(v) => setGoalTagId(v === 'none' ? '' : v)}>
                  <SelectTrigger id="goal-tag">
                    <SelectValue placeholder="Sem objetivo definido" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem objetivo definido</SelectItem>
                    {scopedTags.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={saveGoalTag} disabled={savingGoal}>
                  {savingGoal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Quando um contato que passou por essa orquestração recebe essa tag, conta como conversão -- é isso que aparece no card em "Meus agentes" e na galeria.
              </p>
            </div>

            {colliding.length > 0 && (
              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Esse gatilho já está em uso.</p>
                  <p className="mt-1">
                    {colliding.map((c) => c.name).join(', ')} já {colliding.length > 1 ? 'usam' : 'usa'} uma palavra-chave parecida —
                    seus leads podem se misturar entre as campanhas. Você pode trocar a palavra-chave acima, ou ativar mesmo assim.
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Deixar como rascunho</Button>
              <Button onClick={activate}>{colliding.length > 0 ? 'Ativar mesmo assim' : 'Ativar'}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
