import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Clock, Send, Save, FolderOpen, Trash2, ArrowRightCircle } from 'lucide-react';
import { RemarketingStepsEditor } from '@/components/flow/RemarketingStepsEditor';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { DbMessage } from '@/hooks/useConversations';
import { usePipelines, usePipelineColumns } from '@/hooks/usePipelines';
import { useFollowUpTemplates, useSaveFollowUpTemplate, useDeleteFollowUpTemplate } from '@/hooks/useFollowUpTemplates';

interface ChatFollowUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  organizationId: string;
  lastMessage: DbMessage | null;
}

export function ChatFollowUpDialog({
  open,
  onOpenChange,
  conversationId,
  organizationId,
  lastMessage,
}: ChatFollowUpDialogProps) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [selectedColumnId, setSelectedColumnId] = useState<string>('');

  const [localData, setLocalData] = useState<Record<string, unknown>>({
    remarketingSteps: [
      { id: 'step-1', delayMinutes: 10, message: '' },
    ],
    remarketingQuietHours: false,
    remarketingQuietStart: '22:00',
    remarketingQuietEnd: '08:00',
    remarketingContext: '',
  });

  const { data: pipelines } = usePipelines();
  const { data: columns } = usePipelineColumns(selectedPipelineId || null);
  const { data: templates } = useFollowUpTemplates();
  const saveTemplate = useSaveFollowUpTemplate();
  const deleteTemplate = useDeleteFollowUpTemplate();

  const handleChange = (key: string, value: unknown) => {
    setLocalData(prev => ({ ...prev, [key]: value }));
  };

  const steps = (localData.remarketingSteps as any[]) || [];
  const hasValidSteps = steps.length > 0 && steps.every((s: any) => s.message?.trim());

  const loadTemplate = (tpl: any) => {
    setLocalData(prev => ({
      ...prev,
      remarketingSteps: tpl.steps || [],
      remarketingQuietHours: tpl.quiet_hours || false,
      remarketingQuietStart: tpl.quiet_start || '22:00',
      remarketingQuietEnd: tpl.quiet_end || '08:00',
    }));
    setSelectedPipelineId(tpl.move_pipeline_id || '');
    setSelectedColumnId(tpl.move_column_id || '');
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      toast({ title: 'Digite um nome para o modelo', variant: 'destructive' });
      return;
    }
    saveTemplate.mutate({
      name: templateName.trim(),
      steps,
      quiet_hours: (localData.remarketingQuietHours as boolean) || false,
      quiet_start: (localData.remarketingQuietStart as string) || '22:00',
      quiet_end: (localData.remarketingQuietEnd as string) || '08:00',
      move_pipeline_id: selectedPipelineId || null,
      move_column_id: selectedColumnId || null,
    }, {
      onSuccess: () => {
        setShowSaveTemplate(false);
        setTemplateName('');
      },
    });
  };

  const handleActivate = async () => {
    if (!hasValidSteps) {
      toast({ title: 'Preencha todas as mensagens', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      let { data: systemFlow } = await supabase
        .from('flows')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('trigger_type', 'chat_follow_up')
        .maybeSingle();

      if (!systemFlow) {
        const { data: newFlow, error: flowError } = await supabase
          .from('flows')
          .insert({
            name: '__Sistema: Follow-up do Chat',
            organization_id: organizationId,
            trigger_type: 'chat_follow_up',
            is_active: true,
            visible_in_chat: false,
            nodes: [],
            edges: [],
          })
          .select('id')
          .single();
        if (flowError) throw flowError;
        systemFlow = newFlow;
      }

      await supabase
        .from('flow_executions')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('flow_id', systemFlow.id)
        .in('status', ['waiting_input', 'running']);

      const now = new Date();
      const firstStep = steps[0];
      const timeoutAt = new Date(now.getTime() + (firstStep.delayMinutes * 60 * 1000));

      const execPayload = {
        flow_id: systemFlow.id,
        conversation_id: conversationId,
        organization_id: organizationId,
        status: 'waiting_input',
        remarketing_step: 0,
        timeout_at: timeoutAt.toISOString(),
        variables: {
          remarketingSteps: steps,
          remarketingQuietHours: localData.remarketingQuietHours,
          remarketingQuietStart: localData.remarketingQuietStart,
          remarketingQuietEnd: localData.remarketingQuietEnd,
          source: 'chat_follow_up',
          triggerMessageId: lastMessage?.id,
          movePipelineId: selectedPipelineId || null,
          moveColumnId: selectedColumnId || null,
        } as unknown as import('@/integrations/supabase/types').Json,
        current_node_id: 'chat-follow-up',
        execution_log: [{
          type: 'chat_follow_up_started',
          timestamp: now.toISOString(),
          steps: steps.length,
          startedBy: session?.user?.id,
        }] as unknown as import('@/integrations/supabase/types').Json,
      };

      const { error: execError } = await supabase
        .from('flow_executions')
        .insert(execPayload);

      if (execError) throw execError;

      queryClient.invalidateQueries({ queryKey: ['follow-up-status'] });
      queryClient.invalidateQueries({ queryKey: ['flow-executions'] });

      const moveInfo = selectedPipelineId && selectedColumnId
        ? ' Ao final sem resposta, o contato será movido no pipeline.'
        : '';

      toast({
        title: 'Follow-up ativado',
        description: `${steps.length} tentativa(s) programada(s).${moveInfo}`,
      });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Follow-up error:', error);
      toast({
        title: 'Erro ao ativar follow-up',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Programar Follow-up
          </DialogTitle>
        </DialogHeader>

        {/* Templates section — collapsible select */}
        {templates && templates.length > 0 && (
          <Select
            onValueChange={(val) => {
              const tpl = templates.find((t) => t.id === val);
              if (tpl) loadTemplate(tpl);
            }}
          >
            <SelectTrigger className="h-8 text-xs gap-1.5">
              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              <SelectValue placeholder="Carregar modelo salvo..." />
            </SelectTrigger>
            <SelectContent>
              {templates.map((tpl) => (
                <div key={tpl.id} className="flex items-center justify-between pr-1">
                  <SelectItem value={tpl.id} className="flex-1 text-xs">
                    {tpl.name}
                  </SelectItem>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-destructive shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTemplate.mutate(tpl.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </SelectContent>
          </Select>
        )}

        {lastMessage && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border text-sm">
            <p className="text-[10px] text-muted-foreground mb-1">Sua última mensagem:</p>
            <p className="text-foreground line-clamp-3">{lastMessage.content}</p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Se o cliente não responder, as mensagens abaixo serão enviadas automaticamente na sequência configurada.
          O follow-up é cancelado automaticamente quando o cliente responder.
        </p>

        <RemarketingStepsEditor
          localData={localData}
          handleChange={handleChange}
        />

        {/* Pipeline move on exhaustion */}
        <div className="space-y-2 border-t border-border/50 pt-3">
          <Label className="text-xs font-semibold flex items-center gap-1.5">
            <ArrowRightCircle className="h-3.5 w-3.5" />
            Ao esgotar tentativas sem resposta
          </Label>
          <p className="text-[10px] text-muted-foreground">
            Mover o contato para uma coluna específica do pipeline quando todas as tentativas forem esgotadas.
          </p>
          <Select value={selectedPipelineId} onValueChange={(v) => { setSelectedPipelineId(v); setSelectedColumnId(''); }}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecionar pipeline (opcional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum (não mover)</SelectItem>
              {(pipelines || []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPipelineId && selectedPipelineId !== 'none' && columns && columns.length > 0 && (
            <Select value={selectedColumnId} onValueChange={setSelectedColumnId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecionar coluna" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Save as template */}
        <div className="border-t border-border/50 pt-3">
          {showSaveTemplate ? (
            <div className="flex items-center gap-2">
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Nome do modelo..."
                className="h-8 text-xs flex-1"
              />
              <Button size="sm" className="h-8 text-xs gap-1" onClick={handleSaveTemplate} disabled={saveTemplate.isPending}>
                {saveTemplate.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Salvar
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowSaveTemplate(false)}>
                ✕
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-xs"
              onClick={() => setShowSaveTemplate(true)}
              disabled={!hasValidSteps}
            >
              <Save className="h-3.5 w-3.5" />
              Salvar como modelo
            </Button>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleActivate}
            disabled={isSaving || !hasValidSteps}
            className="gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Ativar Follow-up
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
