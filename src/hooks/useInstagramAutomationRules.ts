import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

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
  button?: { label: string; url: string };
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
  trigger_type: 'comment_keyword';
  trigger_config: {
    keywords: string[];
    match_type: 'any' | 'all';
    scope: 'all_posts' | 'specific_media';
    media_ids: string[];
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
