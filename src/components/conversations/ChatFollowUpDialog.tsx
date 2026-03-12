import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Clock, Send } from 'lucide-react';
import { RemarketingStepsEditor } from '@/components/flow/RemarketingStepsEditor';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { DbMessage } from '@/hooks/useConversations';

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
  const [localData, setLocalData] = useState<Record<string, unknown>>({
    remarketingSteps: [
      { id: 'step-1', delayMinutes: 10, message: '' },
    ],
    remarketingQuietHours: false,
    remarketingQuietStart: '22:00',
    remarketingQuietEnd: '08:00',
    remarketingContext: '',
  });

  const handleChange = (key: string, value: unknown) => {
    setLocalData(prev => ({ ...prev, [key]: value }));
  };

  const steps = (localData.remarketingSteps as any[]) || [];
  const hasValidSteps = steps.length > 0 && steps.every((s: any) => s.message?.trim());

  const handleActivate = async () => {
    if (!hasValidSteps) {
      toast({ title: 'Preencha todas as mensagens', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      // Create a special "chat-follow-up" flow execution
      // We'll create a minimal flow entry or use a system flow
      // For simplicity, we create a flow_execution with a special flow_id pattern
      
      // First, find or create a system follow-up flow for this org
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

      // Cancel any existing follow-up for this conversation
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

      toast({
        title: 'Follow-up ativado',
        description: `${steps.length} tentativa(s) programada(s). Será cancelado automaticamente quando o cliente responder.`,
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
