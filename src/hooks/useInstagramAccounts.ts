import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface InstagramAccount {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  ig_business_account_id: string | null;
  ig_username: string | null;
  facebook_page_id: string | null;
  status: 'pending' | 'connected' | 'disconnected' | 'error';
  scopes: string[];
  label: string | null;
  is_active: boolean;
  token_expires_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  created_at: string;
}

// instagram_accounts is not in the generated Supabase types yet, so we cast the
// table name to a known one ('contacts') to bypass the type check, exactly like
// other recently-added tables in this codebase do (see useCampaignFolders.ts).
const INSTAGRAM_ACCOUNTS = 'instagram_accounts' as 'contacts';

export function useInstagramAccounts() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['instagram-accounts', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await (supabase
        .from(INSTAGRAM_ACCOUNTS)
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: true }) as unknown as Promise<{ data: any[] | null; error: any }>);
      if (error) throw error;
      return (data || []) as InstagramAccount[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useConnectInstagramAccount() {
  const { session } = useAuth();

  return useMutation({
    mutationFn: async ({ organizationId, workspaceId }: { organizationId?: string; workspaceId?: string | null }) => {
      const response = await supabase.functions.invoke('instagram-oauth-start', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { organizationId, workspaceId },
      });
      if (response.error) throw new Error(response.error.message);
      if (!response.data?.url) throw new Error('Falha ao gerar link de conexão com o Instagram');
      return response.data.url as string;
    },
  });
}

export function useDisconnectInstagramAccount() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instagramAccountId: string) => {
      const response = await supabase.functions.invoke('instagram-disconnect', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: { instagramAccountId },
      });
      if (response.error) throw new Error(response.error.message);
      if (response.data?.error) throw new Error(response.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-accounts'] });
    },
  });
}

export function useCheckInstagramStatus() {
  const { session, profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await supabase.functions.invoke(
        `instagram-check-status?organizationId=${profile?.organization_id || ''}`,
        { headers: { Authorization: `Bearer ${session?.access_token}` } },
      );
      if (response.error) throw new Error(response.error.message);
      return response.data?.accounts as InstagramAccount[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-accounts'] });
    },
  });
}
