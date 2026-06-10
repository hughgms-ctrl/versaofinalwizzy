import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

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
  const { selectedOrganizationId } = useWorkspaceContext();
  const organizationId = selectedOrganizationId || profile?.organization_id || null;
  
  return useQuery({
    queryKey: ['team-members', organizationId],
    queryFn: async (): Promise<TeamMember[]> => {
      if (!organizationId) return [];

      const { data: members, error: membersError } = await (supabase as any)
        .from('organization_members')
        .select('id, user_id, role, created_at')
        .eq('organization_id', organizationId);

      if (membersError) throw membersError;
      if (!members?.length) return [];

      const userIds = members.map((member: any) => member.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, avatar_url, phone, created_at')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

      return members.map((member: any) => {
        const memberProfile = profileMap.get(member.user_id);
        return {
        id: memberProfile?.id || member.id,
        user_id: member.user_id,
        name: memberProfile?.full_name || 'Membro',
        email: '', // Email is in auth.users which we can't access directly
        phone: memberProfile?.phone || null,
        role: (member.role || 'agent') as TeamMember['role'],
        avatar_url: memberProfile?.avatar_url || null,
        created_at: member.created_at,
        };
      });
    },
    enabled: !!organizationId,
  });
}
