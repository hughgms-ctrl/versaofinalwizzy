import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * O que dispara a regra.
 *
 * `comment_keyword` nasce de um comentário em post — o único caso em que a DM
 * sai como private reply. Os demais nascem de uma mensagem que a pessoa enviou,
 * o que abre a janela de 24h e faz o envio ser DM comum.
 */
export type InstagramTriggerType =
  | 'comment_keyword'
  | 'dm_keyword'
  | 'story_reply'
  | 'story_mention'
  | 'first_message';

export type InstagramRuleActionType =
  | 'like_comment'
  | 'reply_comment_public'
  | 'send_dm'
  | 'create_contact'
  | 'add_tag'
  | 'notify_assignee';

export interface InstagramRuleAction {
  type: InstagramRuleActionType;
  text?: string;
  tag?: string;
  // send_dm only: adds a link button to the DM (tracked via a Wizzy
  // short-link redirect, so click-through can be detected).
  //
  // `message` é o texto da DM que ENTREGA o link quando ele não vai na primeira
  // mensagem — o caso do quick reply e o da coleta de e-mail, em que a entrega
  // acontece depois, na resposta da pessoa. Ignorado quando o link já sai no
  // botão da primeira DM.
  button?: { label: string; url: string; message?: string };
  // send_dm only: a primeira DM faz uma pergunta e a automação espera a
  // resposta para gravá-la no contato. Hoje só e-mail — é o único dado que o
  // Instagram não entrega e que o cliente precisa levar para fora da Wizzy.
  //
  // Enquanto espera, a próxima mensagem da pessoa é lida como resposta e não
  // dispara gatilho novo (ver instagram_pending_collections).
  collect?: {
    field: 'email';
    /** Resposta que não parece um e-mail. Até 3 tentativas. */
    invalidText?: string;
    /** Confirmação enviada junto com o link, depois de gravar. */
    successText?: string;
  };
  // send_dm only: sends the DM with a quick-reply chip instead of the link
  // button. Tapping it is a real message from the person, which opens Meta's
  // 24-hour window — the link then goes out in a second message. A web_url
  // button click does not open that window, so follow-ups after it are skipped.
  quickReply?: { enabled: boolean; label: string };
  // send_dm only: schedules a delayed follow-up message after waitValue
  // waitUnit(s), branching on whether the button link was clicked.
  followup?: {
    waitValue: number;
    waitUnit: 'minutes' | 'hours' | 'days';
    clickedText: string;
    notClickedText: string;
  };
}

export interface InstagramAutomationRule {
  id: string;
  organization_id: string;
  instagram_account_id: string;
  workspace_id: string | null;
  name: string;
  trigger_type: InstagramTriggerType;
  trigger_config: {
    keywords: string[];
    match_type: 'any' | 'all';
    /**
     * 'any' dispensa palavra-chave: qualquer comentário serve. Ausente vale
     * como 'specific', que é como toda regra criada antes do modo guiado se
     * comporta — sem palavra-chave, nunca dispara.
     */
    keyword_mode?: 'specific' | 'any';
    /** Só usados por comment_keyword. */
    scope: 'all_posts' | 'specific_media' | 'next_post';
    media_ids: string[];
    /**
     * Só em next_post: quando o vinculador achou o post novo e gravou o id em
     * media_ids. Antes disso a regra existe mas ainda não vale para nada.
     */
    next_post_bound_at?: string | null;
  };
  actions: InstagramRuleAction[];
  is_active: boolean;
  rate_limit: { max_per_contact_per_day?: number };
  created_at: string;
  updated_at: string;
}

export interface InstagramRuleExecution {
  id: string;
  rule_id: string;
  webhook_event_id: string | null;
  contact_id: string | null;
  status: 'success' | 'error' | 'skipped';
  steps: Array<{ type: string; status: string; detail?: string }>;
  error: string | null;
  created_at: string;
}

// instagram_automation_rules / instagram_rule_executions aren't in the
// generated Supabase types yet — cast to a known table name to bypass the
// type check, same convention as useCampaignFolders.ts.
const RULES = 'instagram_automation_rules' as 'contacts';
const EXECUTIONS = 'instagram_rule_executions' as 'contacts';

export function useInstagramAutomationRules() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['instagram-automation-rules', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await (supabase
        .from(RULES)
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false }) as unknown as Promise<{ data: any[] | null; error: any }>);
      if (error) throw error;
      return (data || []) as InstagramAutomationRule[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useUpsertInstagramAutomationRule() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (rule: Partial<InstagramAutomationRule> & { id?: string }) => {
      const { id, ...rest } = rule;
      const payload = { ...rest, organization_id: profile?.organization_id };
      const table = supabase.from(RULES) as any;
      if (id) {
        const { error } = await table.update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await table.insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-automation-rules'] });
    },
  });
}

export function useDeleteInstagramAutomationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await (supabase.from(RULES) as any).delete().eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-automation-rules'] });
    },
  });
}

export function useToggleInstagramAutomationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleId, isActive }: { ruleId: string; isActive: boolean }) => {
      const { error } = await (supabase.from(RULES) as any)
        .update({ is_active: isActive })
        .eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-automation-rules'] });
    },
  });
}

export function useInstagramRuleExecutions(ruleIds: string[]) {
  return useQuery({
    queryKey: ['instagram-rule-executions', ruleIds],
    queryFn: async () => {
      if (!ruleIds.length) return [];
      const { data, error } = await (supabase.from(EXECUTIONS) as any)
        .select('*')
        .in('rule_id', ruleIds)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as InstagramRuleExecution[];
    },
    enabled: ruleIds.length > 0,
  });
}
