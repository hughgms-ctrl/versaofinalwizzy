import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface TeamMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'owner' | 'admin' | 'supervisor' | 'agent';
  avatar_url: string | null;
  created_at: string;
}

export function useTeamMembers() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['team-members', profile?.organization_id],
    queryFn: async (): Promise<TeamMember[]> => {
      if (!profile?.organization_id) return [];

      // Fetch profiles with their roles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, avatar_url, phone, created_at')
        .eq('organization_id', profile.organization_id);

      if (profilesError) throw profilesError;
      if (!profiles) return [];

      // Fetch roles for these users
      const userIds = profiles.map(p => p.user_id);
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds);

      if (rolesError) throw rolesError;

      // Create a map of user_id to role
      const roleMap = new Map<string, string>();
      roles?.forEach(r => roleMap.set(r.user_id, r.role));

      // Combine data
      return profiles.map(p => ({
        id: p.id,
        user_id: p.user_id,
        name: p.full_name,
        email: '', // Email is in auth.users which we can't access directly
        phone: p.phone,
        role: (roleMap.get(p.user_id) || 'agent') as TeamMember['role'],
        avatar_url: p.avatar_url,
        created_at: p.created_at,
      }));
    },
    enabled: !!profile?.organization_id,
  });
}
