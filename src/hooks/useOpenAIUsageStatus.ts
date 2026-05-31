import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

async function callOpenAIUsageStatus(body?: any) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-usage-status`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Falha ao consultar consumo OpenAI');
  return json;
}

export function useOpenAIUsageStatus(enabled = true) {
  return useQuery({
    queryKey: ['openai-usage-status'],
    queryFn: () => callOpenAIUsageStatus(),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useUpdateOpenAIUsageSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: {
      openai_admin_key?: string;
      credit_balance_usd: number;
      alert_threshold_percent: number;
    }) => callOpenAIUsageStatus(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['openai-usage-status'] });
      toast({ title: 'Monitoramento OpenAI salvo' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao salvar monitoramento', description: error.message, variant: 'destructive' });
    },
  });
}
