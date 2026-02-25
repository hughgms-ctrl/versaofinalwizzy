import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

// ============================================
// TYPES
// ============================================

export interface ConversationStatus {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  order: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  order: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeadSource {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  order: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIAgent {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  is_active: boolean;
  persona: string | null;
  knowledge_base: Json[] | null;
  created_at: string;
  updated_at: string;
}

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ============================================
// CONVERSATION STATUSES
// ============================================

export function useConversationStatuses() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['conversation-statuses'],
    queryFn: async (): Promise<ConversationStatus[]> => {
      const { data, error } = await supabase
        .from('conversation_statuses')
        .select('*')
        .order('order', { ascending: true });

      if (error) throw error;
      return (data || []) as ConversationStatus[];
    },
    enabled: !!session,
  });
}

export function useCreateConversationStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; color?: string; order?: number }) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .single();

      if (!profile?.organization_id) throw new Error('Organização não encontrada');

      const { data: result, error } = await supabase
        .from('conversation_statuses')
        .insert({
          organization_id: profile.organization_id,
          name: data.name,
          color: data.color || '#6366f1',
          order: data.order || 0,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-statuses'] });
      toast({ title: 'Status criado', description: 'O status foi criado com sucesso.' });
    },
    onError: () => {
      toast({ title: 'Erro ao criar status', variant: 'destructive' });
    },
  });
}

export function useUpdateConversationStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ConversationStatus> }) => {
      const { error } = await supabase
        .from('conversation_statuses')
        .update(data)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-statuses'] });
      toast({ title: 'Status atualizado' });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar status', variant: 'destructive' });
    },
  });
}

export function useDeleteConversationStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('conversation_statuses')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-statuses'] });
      toast({ title: 'Status removido' });
    },
    onError: () => {
      toast({ title: 'Erro ao remover status', variant: 'destructive' });
    },
  });
}

// ============================================
// DEPARTMENTS
// ============================================

export function useDepartments() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['departments'],
    queryFn: async (): Promise<Department[]> => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('order', { ascending: true });

      if (error) throw error;
      return (data || []) as Department[];
    },
    enabled: !!session,
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; color?: string; order?: number }) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .single();

      if (!profile?.organization_id) throw new Error('Organização não encontrada');

      const { data: result, error } = await supabase
        .from('departments')
        .insert({
          organization_id: profile.organization_id,
          name: data.name,
          color: data.color || '#6366f1',
          order: data.order || 0,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast({ title: 'Departamento criado' });
    },
    onError: () => {
      toast({ title: 'Erro ao criar departamento', variant: 'destructive' });
    },
  });
}

export function useUpdateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Department> }) => {
      const { error } = await supabase
        .from('departments')
        .update(data)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast({ title: 'Departamento atualizado' });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar departamento', variant: 'destructive' });
    },
  });
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast({ title: 'Departamento removido' });
    },
    onError: () => {
      toast({ title: 'Erro ao remover departamento', variant: 'destructive' });
    },
  });
}

// ============================================
// LEAD SOURCES (ORIGENS)
// ============================================

export function useLeadSources() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['lead-sources'],
    queryFn: async (): Promise<LeadSource[]> => {
      const { data, error } = await supabase
        .from('lead_sources')
        .select('*')
        .order('order', { ascending: true });

      if (error) throw error;
      return (data || []) as LeadSource[];
    },
    enabled: !!session,
  });
}

export function useCreateLeadSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; color?: string; order?: number }) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .single();

      if (!profile?.organization_id) throw new Error('Organização não encontrada');

      const { data: result, error } = await supabase
        .from('lead_sources')
        .insert({
          organization_id: profile.organization_id,
          name: data.name,
          color: data.color || '#6366f1',
          order: data.order || 0,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-sources'] });
      toast({ title: 'Origem criada' });
    },
    onError: () => {
      toast({ title: 'Erro ao criar origem', variant: 'destructive' });
    },
  });
}

export function useUpdateLeadSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<LeadSource> }) => {
      const { error } = await supabase
        .from('lead_sources')
        .update(data)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-sources'] });
      toast({ title: 'Origem atualizada' });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar origem', variant: 'destructive' });
    },
  });
}

export function useDeleteLeadSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('lead_sources')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-sources'] });
      toast({ title: 'Origem removida' });
    },
    onError: () => {
      toast({ title: 'Erro ao remover origem', variant: 'destructive' });
    },
  });
}

// ============================================
// AI AGENTS
// ============================================

export function useAIAgents() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['ai-agents'],
    queryFn: async (): Promise<AIAgent[]> => {
      const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as AIAgent[];
    },
    enabled: !!session,
  });
}

export function useCreateAIAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; description?: string; persona?: string }) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .single();

      if (!profile?.organization_id) throw new Error('Organização não encontrada');

      const { data: result, error } = await supabase
        .from('ai_agents')
        .insert({
          organization_id: profile.organization_id,
          name: data.name,
          description: data.description || null,
          persona: data.persona || null,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      toast({ title: 'Agente IA criado' });
    },
    onError: () => {
      toast({ title: 'Erro ao criar agente IA', variant: 'destructive' });
    },
  });
}

export function useUpdateAIAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AIAgent> }) => {
      const { error } = await supabase
        .from('ai_agents')
        .update(data)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      toast({ title: 'Agente IA atualizado' });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar agente IA', variant: 'destructive' });
    },
  });
}

export function useDeleteAIAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_agents')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      toast({ title: 'Agente IA removido' });
    },
    onError: () => {
      toast({ title: 'Erro ao remover agente IA', variant: 'destructive' });
    },
  });
}

// ============================================
// UPDATE CONVERSATION ATTRIBUTES
// ============================================

export function useUpdateConversationAttributes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      conversationId, 
      data 
    }: { 
      conversationId: string; 
      data: {
        service_mode?: 'ia' | 'ativo' | 'pendente' | 'arquivado';
        conversation_status_id?: string | null;
        department_id?: string | null;
        lead_source_id?: string | null;
        ai_agent_id?: string | null;
        assigned_to?: string | null;
        intervened_by?: string | null;
        intervened_at?: string | null;
      }
    }) => {
      const { error } = await supabase
        .from('conversations')
        .update(data)
        .eq('id', conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar conversa', variant: 'destructive' });
    },
  });
}

// ============================================
// INTERVENE IN CONVERSATION
// ============================================

export function useInterveneConversation() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profile?.id) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('conversations')
        .update({
          service_mode: 'ativo',
          assigned_to: profile.user_id,
          intervened_by: profile.id,
          intervened_at: new Date().toISOString(),
        })
        .eq('id', conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ 
        title: 'Você assumiu a conversa', 
        description: 'A conversa está agora em modo ativo.' 
      });
    },
    onError: () => {
      toast({ title: 'Erro ao intervir na conversa', variant: 'destructive' });
    },
  });
}
