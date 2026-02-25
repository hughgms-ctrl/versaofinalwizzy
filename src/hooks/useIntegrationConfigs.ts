import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export type AIProvider = 'lovable' | 'openai' | 'gemini';

export type AIFeature = 'agents' | 'conversation_summary' | 'prompt_generation' | 'flow_generation' | 'transcription';

export interface IntegrationConfig {
  id: string;
  organization_id: string;
  ai_provider: AIProvider;
  default_model: string;
  openai_api_key: string | null;
  gemini_api_key: string | null;
  agents_provider: AIProvider | null;
  agents_model: string | null;
  conversation_summary_provider: AIProvider | null;
  conversation_summary_model: string | null;
  prompt_generation_provider: AIProvider | null;
  prompt_generation_model: string | null;
  flow_generation_provider: AIProvider | null;
  flow_generation_model: string | null;
  transcription_provider: AIProvider | null;
  transcription_model: string | null;
  created_at: string;
  updated_at: string;
}

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  lovable: 'Wizzy IA (Padrão)',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
};

export const MODELS_BY_PROVIDER: Record<AIProvider, { value: string; label: string }[]> = {
  lovable: [
    { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (Rápido)' },
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (Equilibrado)' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (Avançado)' },
    { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'openai/gpt-5', label: 'GPT-5 (Premium)' },
  ],
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Rápido)' },
    { value: 'gpt-4o', label: 'GPT-4o (Equilibrado)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Econômico)' },
  ],
  gemini: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Rápido)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Avançado)' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Econômico)' },
  ],
};

export const FEATURE_LABELS: Record<AIFeature, { label: string; description: string }> = {
  agents: { label: 'Agentes de IA', description: 'Orquestrador e agentes especializados' },
  conversation_summary: { label: 'Resumo de Conversas', description: 'Análise e resumo de conversas' },
  prompt_generation: { label: 'Geração de Prompts', description: 'Assistente de criação de prompts' },
  flow_generation: { label: 'Geração de Fluxos', description: 'Criação de fluxos via prompt' },
  transcription: { label: 'Transcrição', description: 'Transcrição de áudio e análise de mídia' },
};

export function useIntegrationConfig() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['integration-config'],
    queryFn: async (): Promise<IntegrationConfig | null> => {
      const { data, error } = await supabase
        .from('integration_configs' as any)
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as IntegrationConfig | null;
    },
    enabled: !!session,
  });
}

export function useUpsertIntegrationConfig() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (config: Partial<IntegrationConfig>) => {
      if (!profile?.organization_id) throw new Error('No organization');
      
      const payload = {
        ...config,
        organization_id: profile.organization_id,
      };
      delete (payload as any).id;
      delete (payload as any).created_at;
      delete (payload as any).updated_at;

      const { data, error } = await supabase
        .from('integration_configs' as any)
        .upsert(payload, { onConflict: 'organization_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-config'] });
      toast({ title: 'Configurações de integração salvas!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    },
  });
}
