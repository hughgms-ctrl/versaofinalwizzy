import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

async function adminFetch(action: string, body?: any) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-dashboard?action=${action}`;
  const options: RequestInit = {
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  };

  if (body) {
    options.method = 'POST';
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => adminFetch('overview'),
    staleTime: 60 * 1000,
  });
}

export function useAdminClients() {
  return useQuery({
    queryKey: ['admin', 'clients'],
    queryFn: () => adminFetch('clients'),
    staleTime: 60 * 1000,
  });
}

export function useAdminPlans() {
  return useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => adminFetch('plans'),
    staleTime: 60 * 1000,
  });
}

export function useAdminSecurity() {
  return useQuery({
    queryKey: ['admin', 'security'],
    queryFn: () => adminFetch('security'),
    staleTime: 60 * 1000,
  });
}

export function useAdminGovernance() {
  return useQuery({
    queryKey: ['admin', 'governance'],
    queryFn: () => adminFetch('governance'),
    staleTime: 60 * 1000,
  });
}

export function useAdminApi() {
  return useQuery({
    queryKey: ['admin', 'api'],
    queryFn: () => adminFetch('api'),
    staleTime: 60 * 1000,
  });
}

export function useAdminWhatsAppIntegrations() {
  return useQuery({
    queryKey: ['admin', 'whatsapp-integrations'],
    queryFn: () => adminFetch('whatsapp_integrations'),
    staleTime: 30 * 1000,
  });
}

export type PaymentGatewayProvider = 'asaas' | 'stripe';

export function useAdminPaymentGateways() {
  return useQuery({
    queryKey: ['admin', 'payment-gateways'],
    queryFn: () => adminFetch('payment_gateways'),
    staleTime: 30 * 1000,
  });
}

export type AIModelFeature =
  | 'agents'
  | 'conversation_summary'
  | 'prompt_generation'
  | 'flow_generation'
  | 'transcription'
  | 'document_processing'
  | 'document_field_unification'
  | 'training_rules'
  | 'remarketing'
  | 'qualification_rules'
  | 'flow_ai';

export interface AdminAIModelStrategy {
  default_model: string;
  features: Record<AIModelFeature, string>;
}

export function useAdminAIModels() {
  return useQuery({
    queryKey: ['admin', 'ai-models'],
    queryFn: () => adminFetch('ai_models'),
    staleTime: 30 * 1000,
  });
}

export type AdminAIUsageMode = 'all' | 'own_api' | 'platform_api';

export interface AdminAIUsageFilters {
  date_from: string;
  date_to: string;
  ai_mode: AdminAIUsageMode;
}

export function useAdminAIUsage(filters: AdminAIUsageFilters) {
  return useQuery({
    queryKey: ['admin', 'ai-usage', filters],
    queryFn: () => adminFetch('ai_usage', filters),
    enabled: Boolean(filters.date_from && filters.date_to),
    staleTime: 30 * 1000,
  });
}

export function useUpdateAdminAIUsageSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: {
      openai_api_key?: string;
      openai_admin_key?: string;
      wizzy_ai_monthly_budget_usd?: number;
      alert_threshold_percent?: number;
    }) => adminFetch('update_ai_usage_settings', settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'ai-usage'] });
      toast.success('Configurações de consumo IA salvas');
    },
    onError: (err: Error, _show, context) => {
      if (context?.previousPlans) {
        queryClient.setQueryData(['admin', 'plans'], context.previousPlans);
      }
      toast.error(err.message);
    },
  });
}

export function useUpdateAdminAIModels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (strategy: AdminAIModelStrategy) => adminFetch('update_ai_models', strategy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'ai-models'] });
      toast.success('Modelos de IA salvos');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdatePaymentGatewayStrategy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (strategy: {
      active_provider: PaymentGatewayProvider;
      asaas_enabled: boolean;
      stripe_enabled: boolean;
      test_mode: boolean;
    }) => adminFetch('update_payment_gateway_strategy', strategy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'payment-gateways'] });
      toast.success('Gateway de pagamento salvo');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdatePaymentGatewayConnectionSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: {
      asaas_base_url?: string;
      asaas_api_key?: string;
      asaas_webhook_token?: string;
      stripe_secret_key?: string;
      stripe_publishable_key?: string;
      stripe_webhook_secret?: string;
      checkout_success_url?: string;
      checkout_cancel_url?: string;
    }) => adminFetch('update_payment_gateway_connection_settings', settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'payment-gateways'] });
      toast.success('Credenciais de pagamento salvas');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateWhatsAppStrategy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (strategy: {
      primary_provider: 'evolution' | 'uazapi';
      backup_provider: 'evolution' | 'uazapi';
      evolution_enabled: boolean;
      uazapi_enabled: boolean;
      auto_fallback_enabled: boolean;
    }) => adminFetch('update_whatsapp_strategy', strategy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'whatsapp-integrations'] });
      toast.success('Estratégia de WhatsApp salva');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateWhatsAppConnectionSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: {
      uazapi_base_url?: string;
      uazapi_admin_token?: string;
      evolution_base_url?: string;
      evolution_api_key?: string;
      webhook_url?: string;
    }) => adminFetch('update_whatsapp_connection_settings', settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'whatsapp-integrations'] });
      toast.success('Configurações de conexão salvas');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (plan: any) => adminFetch('update_plan', plan),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
      toast.success('Plano salvo com sucesso');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useToggleClientPlansMenu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (show: boolean) => adminFetch('toggle_client_plans_menu', { show }),
    onMutate: async (show) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'plans'] });
      const previousPlans = queryClient.getQueryData(['admin', 'plans']);

      queryClient.setQueryData(['admin', 'plans'], (current: any) => ({
        ...(current || {}),
        settings: {
          ...(current?.settings || {}),
          show_client_plans_menu: show,
        },
      }));
      queryClient.setQueryData(['platform-setting', 'show_client_plans_menu'], show);

      return { previousPlans };
    },
    onSuccess: (_, show) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['platform-setting', 'show_client_plans_menu'] });
      toast.success(show ? 'Área de Assinatura habilitada para clientes' : 'Área de Assinatura ocultada dos clientes');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAssignPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      organization_id: string;
      plan_id: string;
      payment_status?: 'paid' | 'trial' | 'manual';
      trial_ends_at?: string | null;
    }) => {
      const paymentStatus = data.payment_status || 'manual';
      const trialEndsAt = paymentStatus === 'trial' ? data.trial_ends_at : null;

      const { data: result, error } = await supabase
        .from('organization_plans')
        .upsert({
          organization_id: data.organization_id,
          plan_id: data.plan_id,
          status: 'active',
          payment_status: paymentStatus,
          trial_ends_at: trialEndsAt,
          current_period_start: new Date().toISOString(),
          current_period_end: trialEndsAt,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'organization_id' })
        .select()
        .single();

      if (error) throw error;
      return { result };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-org-plan', variables.organization_id] });
      queryClient.invalidateQueries({ queryKey: ['current-org-plan', variables.organization_id] });
      queryClient.invalidateQueries({ queryKey: ['profile-subscription-management', variables.organization_id] });
      queryClient.invalidateQueries({ queryKey: ['org-plan-modules', variables.organization_id] });
      toast.success('Plano atribuído com sucesso');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAdminOrgUsers(orgId: string | null) {
  return useQuery({
    queryKey: ['admin', 'org-users', orgId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-dashboard?action=org_users&org_id=${orgId}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    },
    enabled: !!orgId,
    staleTime: 30 * 1000,
  });
}

export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { user_id: string; block: boolean }) => adminFetch('block_user', data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'org-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] });
      toast.success(vars.block ? 'Usuário bloqueado' : 'Usuário desbloqueado');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteOrgUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { user_id: string }) => adminFetch('delete_org_user', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'org-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] });
      toast.success('Usuário excluído com sucesso');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (organization_id: string) => adminFetch('delete_organization', { organization_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] });
      toast.success('Organização excluída com sucesso');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAdminSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => adminFetch('get_settings'),
    staleTime: 30 * 1000,
  });
}

export type EntryFlowType =
  | 'payment_first'
  | 'signup_first_payment_after'
  | 'signup_onboarding_payment_access'
  | 'trial_auto'
  | 'trial_with_card'
  | 'manual_approval'
  | 'freemium'
  | 'demo_first'
  | 'onboarding_before_signup'
  | 'access_limited_payment';

export interface EntryFlowVariantInput {
  id?: string;
  name: string;
  flow_type: EntryFlowType;
  traffic_percent: number;
  is_control?: boolean;
  config?: Record<string, any>;
}

export interface EntryFlowExperimentInput {
  id?: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'paused' | 'ended';
  primary_metric: string;
  starts_at?: string | null;
  ends_at?: string | null;
  audience?: Record<string, any>;
  variants: EntryFlowVariantInput[];
}

export function useEntryFlows() {
  return useQuery({
    queryKey: ['admin', 'entry-flows'],
    queryFn: () => adminFetch('entry_flows'),
    staleTime: 30 * 1000,
  });
}

export function useUpdateEntryFlowSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: {
      ab_testing_enabled: boolean;
      default_flow_type: EntryFlowType;
      default_redirect: string;
      persist_assignment_days: number;
      flow_configs?: Record<string, any>;
    }) => adminFetch('update_entry_flow_settings', settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'entry-flows'] });
      toast.success('Fluxo padrao salvo');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSaveEntryFlowExperiment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (experiment: EntryFlowExperimentInput) => adminFetch('save_entry_flow_experiment', experiment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'entry-flows'] });
      toast.success('Experimento salvo');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteEntryFlowExperiment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminFetch('delete_entry_flow_experiment', { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'entry-flows'] });
      toast.success('Experimento excluido');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useToggleSignups() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (allow: boolean) => adminFetch('toggle_signups', { allow }),
    onSuccess: (_, allow) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      toast.success(allow ? 'Cadastros automáticos habilitados' : 'Cadastros automáticos desabilitados');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSecurityAlerts() {
  return useQuery({
    queryKey: ['admin', 'security-alerts'],
    queryFn: () => adminFetch('security_alerts'),
    staleTime: 30 * 1000,
  });
}

export function useAdminOrgDetails(orgId: string | null) {
  return useQuery({
    queryKey: ['admin', 'org-details', orgId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-dashboard?action=org_details&org_id=${orgId}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch org details');
      return res.json();
    },
    enabled: !!orgId,
    staleTime: 30 * 1000,
  });
}

export function useBlockIp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { ip_address: string; reason?: string }) => adminFetch('block_ip', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast.success('IP bloqueado com sucesso');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useApproveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { user_id: string }) => adminFetch('approve_user', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast.success('Usuário aprovado com sucesso');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['admin', 'pending-approvals'],
    queryFn: () => adminFetch('pending_approvals'),
    staleTime: 30 * 1000,
  });
}
