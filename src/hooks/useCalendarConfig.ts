import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface CalendarConfig {
  id: string;
  organization_id: string;
  user_id: string | null;
  display_name: string | null;
  google_refresh_token: string | null;
  google_access_token: string | null;
  google_email: string | null;
  calendar_id: string;
  availability_rules: any[];
  meeting_duration_minutes: number;
  booking_slug: string | null;
  is_connected: boolean;
  created_at: string;
  updated_at: string;
}

export interface CalendarBooking {
  id: string;
  organization_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  assigned_user_id: string | null;
  google_event_id: string | null;
  starts_at: string;
  ends_at: string;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  internal_summary: string | null;
  meet_link: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// Single config for the current user
export function useCalendarConfig() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['calendar-config'],
    queryFn: async (): Promise<CalendarConfig | null> => {
      const { data, error } = await supabase
        .from('calendar_configs' as any)
        .select('*')
        .eq('user_id', session!.user.id)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as CalendarConfig | null;
    },
    enabled: !!session,
  });
}

// All configs for the organization (owner/admin view)
export function useAllCalendarConfigs() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['calendar-configs-all'],
    queryFn: async (): Promise<CalendarConfig[]> => {
      const { data, error } = await supabase
        .from('calendar_configs' as any)
        .select('*')
        .eq('is_connected', true)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as CalendarConfig[];
    },
    enabled: !!session,
  });
}

export function useUpsertCalendarConfig() {
  const queryClient = useQueryClient();
  const { profile, session } = useAuth();

  return useMutation({
    mutationFn: async (config: Partial<CalendarConfig>) => {
      if (!profile?.organization_id) throw new Error('No organization');

      const payload = {
        ...config,
        organization_id: profile.organization_id,
        user_id: session!.user.id,
      };
      delete (payload as any).id;
      delete (payload as any).created_at;
      delete (payload as any).updated_at;

      const { data, error } = await supabase
        .from('calendar_configs' as any)
        .upsert(payload, { onConflict: 'organization_id,user_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-config'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-configs-all'] });
      toast({ title: 'Configuração da agenda salva!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    },
  });
}

export function useCalendarBookings(filterUserId?: string | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['calendar-bookings', filterUserId],
    queryFn: async (): Promise<CalendarBooking[]> => {
      let query = supabase
        .from('calendar_bookings' as any)
        .select('*')
        .order('starts_at', { ascending: true })
        .limit(200);

      if (filterUserId) {
        query = query.eq('assigned_user_id', filterUserId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as CalendarBooking[];
    },
    enabled: !!session,
  });
}

export function useDisconnectCalendar() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (configId: string) => {
      const { error } = await supabase
        .from('calendar_configs' as any)
        .update({
          is_connected: false,
          google_access_token: null,
          google_refresh_token: null,
          google_email: null,
        })
        .eq('id', configId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-config'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-configs-all'] });
      toast({ title: 'Agenda desconectada' });
    },
  });
}
