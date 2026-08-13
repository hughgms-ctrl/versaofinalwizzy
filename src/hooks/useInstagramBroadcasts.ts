import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Disparo de DM para contatos do Instagram.
 *
 * O público nunca é "toda a base": a Meta só permite DM comum dentro da janela
 * de 24 horas contada a partir da última mensagem que a PESSOA enviou. Enviar
 * para base fria derruba a conta do cliente — e a conta é dele.
 *
 * Por isso o disparo não é criado por INSERT daqui: a política de RLS não dá
 * INSERT a ninguém e a lista é montada pela edge function
 * `instagram-broadcast-create`, que recalcula o público no servidor. Se a lista
 * viesse pronta do navegador, bastaria o console para mandar para quem quisesse.
 */

export interface InstagramBroadcast {
  id: string;
  organization_id: string;
  instagram_account_id: string;
  name: string;
  message: string;
  button: { label: string; url: string } | null;
  audience: { tag_ids?: string[]; window_hours?: number };
  status: 'sending' | 'completed' | 'cancelled';
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
  completed_at: string | null;
}

const BROADCASTS = 'instagram_broadcasts' as 'contacts';

export function useInstagramBroadcasts() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['instagram-broadcasts', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await (supabase.from(BROADCASTS) as any)
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as InstagramBroadcast[];
    },
    enabled: !!profile?.organization_id,
    // Um disparo em andamento muda de número a cada minuto (a drenagem roda
    // nesse ritmo); sem o refetch a tela pareceria travada em "0 enviados".
    refetchInterval: (query) =>
      (query.state.data as InstagramBroadcast[] | undefined)?.some((b) => b.status === 'sending')
        ? 15_000
        : false,
  });
}

/**
 * Quantas pessoas estão alcançáveis AGORA.
 *
 * Mostrado antes do envio porque é o número que causa espanto: uma base de
 * 2.000 contatos vira 80 destinatários, e sem explicar por quê o cliente acha
 * que a ferramenta está quebrada. O cálculo aqui é só para exibição — quem vale
 * é o do servidor, no momento do disparo.
 */
export function useInstagramAudienceCount(accountId: string | undefined, tagIds: string[]) {
  return useQuery({
    queryKey: ['instagram-audience', accountId, [...tagIds].sort().join(',')],
    queryFn: async () => {
      if (!accountId) return { eligible: 0, total: 0 };

      const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { count: total } = await (supabase.from('instagram_contacts' as 'contacts') as any)
        .select('id', { count: 'exact', head: true })
        .eq('instagram_account_id', accountId);

      const { data: open } = await (supabase.from('instagram_conversations' as 'contacts') as any)
        .select('contact_id')
        .eq('instagram_account_id', accountId)
        .neq('status', 'archived')
        .gte('last_inbound_at', windowStart)
        .limit(5000);

      let eligibleIds: string[] = (open || []).map((c: any) => c.contact_id);

      if (tagIds.length && eligibleIds.length) {
        const { data: tagged } = await (supabase.from('instagram_contact_tags' as 'contacts') as any)
          .select('instagram_contact_id')
          .in('tag_id', tagIds)
          .in('instagram_contact_id', eligibleIds);
        const allowed = new Set((tagged || []).map((t: any) => t.instagram_contact_id));
        eligibleIds = eligibleIds.filter((id) => allowed.has(id));
      }

      return { eligible: eligibleIds.length, total: total || 0 };
    },
    enabled: !!accountId,
    staleTime: 30_000,
  });
}

export function useCreateInstagramBroadcast() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (payload: {
      accountId: string;
      name: string;
      message: string;
      button?: { label: string; url: string } | null;
      tagIds?: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke('instagram-broadcast-create', {
        body: payload,
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      // O corpo de erro da função traz a razão útil ("ninguém alcançável"), que
      // o FunctionsHttpError esconde atrás de um "non-2xx status code" genérico.
      if (data?.error) throw new Error(data.detail || data.error);
      if (error) throw error;
      return data as { broadcastId: string; recipients: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-broadcasts'] });
    },
  });
}

export function useCancelInstagramBroadcast() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (broadcastId: string) => {
      const { error } = await (supabase.from(BROADCASTS) as any)
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', broadcastId)
        .eq('status', 'sending');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-broadcasts'] });
    },
  });
}
