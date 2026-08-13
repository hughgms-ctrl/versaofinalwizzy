import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Tag } from './useTags';

/**
 * Contatos do Instagram.
 *
 * Tabela própria, e não `contacts`: `contacts.phone` é NOT NULL — a lista de
 * contatos da Wizzy é, por definição, uma lista de telefones. Um perfil do
 * Instagram tem @ e IGSID, e pode nunca revelar telefone. Foi decisão desde a
 * migration original do canal ("no auto-merge across channels"), porque a Wizzy
 * não tem como saber que dois perfis são a mesma pessoa.
 *
 * O vínculo existe, mas é ato humano: `linked_contact_id`.
 */

export interface InstagramContact {
  id: string;
  organization_id: string;
  instagram_account_id: string;
  igsid: string;
  username: string | null;
  name: string | null;
  profile_pic_url: string | null;
  /** Informado pela própria pessoa em resposta a uma automação de coleta. */
  email: string | null;
  first_inbound_at: string | null;
  linked_contact_id: string | null;
  linked_at: string | null;
  created_at: string;
  instagram_contact_tags?: Array<{ tag_id: string; tags: Tag | null }>;
  instagram_conversations?: Array<{
    id: string;
    last_message_at: string | null;
    last_inbound_at: string | null;
    status: string;
    unread_count: number;
  }>;
  /** Contato da Wizzy vinculado, quando houver. */
  contacts?: { id: string; name: string | null; phone: string } | null;
}

const CONTACTS = 'instagram_contacts' as 'contacts';

/**
 * A janela de 24h da Meta: só dá para mandar DM comum para quem escreveu nas
 * últimas 24 horas. É o dado mais consequente da tela — define quem é
 * alcançável hoje e quem só será alcançado se voltar a falar.
 */
export function isWindowOpen(contact: InstagramContact): boolean {
  const lastInbound = contact.instagram_conversations?.[0]?.last_inbound_at;
  if (!lastInbound) return false;
  return Date.now() - new Date(lastInbound).getTime() < 24 * 60 * 60 * 1000;
}

export function useInstagramContacts(accountId?: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['instagram-contacts', profile?.organization_id, accountId],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      let query = (supabase.from(CONTACTS) as any)
        .select(`
          *,
          instagram_contact_tags(tag_id, tags(id, name, color)),
          instagram_conversations(id, last_message_at, last_inbound_at, status, unread_count),
          contacts:linked_contact_id(id, name, phone)
        `)
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false })
        // Teto de segurança: a tela filtra e pagina no cliente, e trazer uma
        // base inteira de dezenas de milhares travaria o navegador.
        .limit(2000);

      if (accountId) query = query.eq('instagram_account_id', accountId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as InstagramContact[];
    },
    enabled: !!profile?.organization_id,
    staleTime: 30_000,
  });
}

/**
 * Vincula (ou desvincula) o perfil do Instagram a um contato da Wizzy.
 *
 * Sempre por ação humana: dois cadastros com o mesmo nome não são prova de
 * serem a mesma pessoa, e unir os errados só aparece quando a mensagem vai para
 * quem não devia.
 */
export function useLinkInstagramContact() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ instagramContactId, contactId }: {
      instagramContactId: string;
      contactId: string | null;
    }) => {
      const { error } = await (supabase.from(CONTACTS) as any)
        .update({
          linked_contact_id: contactId,
          linked_at: contactId ? new Date().toISOString() : null,
          linked_by: contactId ? user?.id ?? null : null,
        })
        .eq('id', instagramContactId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-contacts'] });
    },
  });
}

/** Etiquetas do perfil, na tabela de junção própria do canal. */
export function useToggleInstagramContactTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ instagramContactId, tagId, add }: {
      instagramContactId: string;
      tagId: string;
      add: boolean;
    }) => {
      if (add) {
        const { error } = await (supabase.from('instagram_contact_tags' as 'contacts') as any)
          .upsert(
            { instagram_contact_id: instagramContactId, tag_id: tagId, added_by_type: 'manual' },
            { onConflict: 'instagram_contact_id,tag_id' },
          );
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('instagram_contact_tags' as 'contacts') as any)
          .delete()
          .eq('instagram_contact_id', instagramContactId)
          .eq('tag_id', tagId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-contacts'] });
    },
  });
}
