import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useFlowExecution() {
  return useMutation({
    mutationFn: async ({ flowId, conversationId }: { flowId: string; conversationId: string }) => {
      const { data, error } = await supabase.functions.invoke('flow-execute', {
        body: { flowId, conversationId },
      });

      if (error) throw error;
      if (!data.success && data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      if (data.status === 'waiting_input') {
        toast.info('Fluxo aguardando resposta do cliente');
      } else {
        toast.success('Fluxo executado com sucesso!');
      }
    },
    onError: (error) => {
      console.error('Error executing flow:', error);
      toast.error('Erro ao executar fluxo');
    },
  });
}
