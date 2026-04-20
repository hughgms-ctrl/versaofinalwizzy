import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface CaseTaskNotification {
  id: string;
  organization_id: string;
  template_task_id: string | null;
  case_task_id: string | null;
  notify_on_create: boolean;
  notify_days_before: number;
  notify_on_overdue: boolean;
  notify_channel: string;
  created_at: string;
  updated_at: string;
}

export function useTemplateTaskNotification(templateTaskId: string | null) {
  return useQuery({
    queryKey: ['task-notification', 'template', templateTaskId],
    queryFn: async (): Promise<CaseTaskNotification | null> => {
      if (!templateTaskId) return null;
      const { data, error } = await (supabase as any)
        .from('case_task_notifications')
        .select('*')
        .eq('template_task_id', templateTaskId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!templateTaskId,
  });
}

export function useUpsertTemplateTaskNotification() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      template_task_id: string;
      notify_on_create: boolean;
      notify_days_before: number;
      notify_on_overdue: boolean;
    }) => {
      if (!profile?.organization_id) throw new Error('Sem organização');

      const { data: existing } = await (supabase as any)
        .from('case_task_notifications')
        .select('id')
        .eq('template_task_id', input.template_task_id)
        .maybeSingle();

      if (existing) {
        const { error } = await (supabase as any)
          .from('case_task_notifications')
          .update({
            notify_on_create: input.notify_on_create,
            notify_days_before: input.notify_days_before,
            notify_on_overdue: input.notify_on_overdue,
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('case_task_notifications')
          .insert({
            organization_id: profile.organization_id,
            template_task_id: input.template_task_id,
            notify_on_create: input.notify_on_create,
            notify_days_before: input.notify_days_before,
            notify_on_overdue: input.notify_on_overdue,
            notify_channel: 'whatsapp',
          });
        if (error) throw error;
      }
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['task-notification', 'template', v.template_task_id] });
      toast({ title: 'Notificação salva' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });
}

export function useCaseTaskNotifications(caseTaskId: string | null) {
  return useQuery({
    queryKey: ['task-notification', 'case', caseTaskId],
    queryFn: async (): Promise<CaseTaskNotification | null> => {
      if (!caseTaskId) return null;
      const { data, error } = await (supabase as any)
        .from('case_task_notifications')
        .select('*')
        .eq('case_task_id', caseTaskId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!caseTaskId,
  });
}

export function useUpsertCaseTaskNotification() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      case_task_id: string;
      notify_on_create: boolean;
      notify_days_before: number;
      notify_on_overdue: boolean;
      notify_channel?: string;
    }) => {
      if (!profile?.organization_id) throw new Error('Sem organização');

      const { data: existing } = await (supabase as any)
        .from('case_task_notifications')
        .select('id')
        .eq('case_task_id', input.case_task_id)
        .maybeSingle();

      const payload = {
        notify_on_create: input.notify_on_create,
        notify_days_before: input.notify_days_before,
        notify_on_overdue: input.notify_on_overdue,
        notify_channel: input.notify_channel || 'whatsapp',
      };

      if (existing) {
        const { error } = await (supabase as any)
          .from('case_task_notifications')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('case_task_notifications')
          .insert({
            organization_id: profile.organization_id,
            case_task_id: input.case_task_id,
            ...payload,
          });
        if (error) throw error;
      }
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['task-notification', 'case', v.case_task_id] });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });
}
