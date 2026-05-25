import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface DriveConfig {
  id: string;
  organization_id: string;
  google_refresh_token: string | null;
  google_access_token: string | null;
  google_email: string | null;
  folder_id: string | null;
  backup_frequency: string;
  last_backup_at: string | null;
  backup_includes: Record<string, boolean>;
  is_connected: boolean;
  created_at: string;
  updated_at: string;
}

export interface DriveBackupLog {
  id: string;
  organization_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  file_count: number;
  data_size_bytes: number | null;
  error_message: string | null;
  created_at: string;
}

export function useDriveConfig() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['drive-config'],
    queryFn: async (): Promise<DriveConfig | null> => {
      const { data, error } = await supabase
        .from('drive_configs' as any)
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as DriveConfig | null;
    },
    enabled: !!session,
  });
}

export function useUpsertDriveConfig() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (config: Partial<DriveConfig>) => {
      if (!profile?.organization_id) throw new Error('No organization');

      const payload = {
        ...config,
        organization_id: profile.organization_id,
      };
      delete (payload as any).id;
      delete (payload as any).created_at;
      delete (payload as any).updated_at;

      const { data, error } = await supabase
        .from('drive_configs' as any)
        .upsert(payload, { onConflict: 'organization_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-config'] });
      toast({ title: 'Configuração do Drive salva!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDriveBackupLogs() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['drive-backup-logs'],
    queryFn: async (): Promise<DriveBackupLog[]> => {
      const { data, error } = await supabase
        .from('drive_backup_logs' as any)
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []) as unknown as DriveBackupLog[];
    },
    enabled: !!session,
  });
}

export function useTriggerDriveBackup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('google-drive-backup');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-backup-logs'] });
      toast({ title: 'Backup iniciado!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao iniciar backup', description: error.message, variant: 'destructive' });
    },
  });
}
