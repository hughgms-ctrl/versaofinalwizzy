import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface WhatsAppInstance {
  id: string;
  organization_id: string;
  label: string | null;
  status: string;
  phone_number: string | null;
  zapi_instance_id: string | null;
  zapi_token: string | null;
  is_active: boolean;
  connected_at: string | null;
  disconnected_at: string | null;
  created_at: string;
}

export function useWhatsAppInstances() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['whatsapp-instances', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as WhatsAppInstance[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useDeleteWhatsAppInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      const { error } = await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('id', instanceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    },
  });
}

export function useUpdateInstanceLabel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ instanceId, label }: { instanceId: string; label: string }) => {
      const { error } = await supabase
        .from('whatsapp_instances')
        .update({ label })
        .eq('id', instanceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    },
  });
}
