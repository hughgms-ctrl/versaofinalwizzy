import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const editableRoles = new Set(['admin', 'supervisor', 'agent']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization header' }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const caller = userData?.user;
    if (userError || !caller) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('user_id', caller.id)
      .maybeSingle();

    const body = await req.json();
    const requestedOrganizationId = typeof body.organizationId === 'string' ? body.organizationId : undefined;
    const organizationId = requestedOrganizationId || callerProfile?.organization_id || '';

    const { data: callerRole, error: callerRoleError } = await admin
      .from('organization_members')
      .select('role')
      .eq('user_id', caller.id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (callerRoleError) {
      return json({ error: callerRoleError.message }, 500);
    }

    if (!callerProfile || !callerRole || !['owner', 'admin', 'platform_admin'].includes(callerRole.role)) {
      return json({ error: 'Only owners and admins can update team members' }, 403);
    }

    const userId = String(body.userId || '');
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : undefined;
    const phone = typeof body.phone === 'string' ? body.phone.trim() : undefined;
    const role = typeof body.role === 'string' ? body.role : undefined;
    const workspaceIds = Array.isArray(body.workspaceIds) ? body.workspaceIds.map(String) : undefined;

    if (!userId) {
      return json({ error: 'Missing userId' }, 400);
    }

    const { data: targetMembership } = await admin
      .from('organization_members')
      .select('id, role')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!targetMembership) {
      return json({ error: 'User not found in your organization' }, 404);
    }

    if (targetMembership.role === 'owner' && userId !== caller.id) {
      return json({ error: 'Organization owner cannot be edited here' }, 403);
    }

    if (role !== undefined) {
      if (!editableRoles.has(role)) {
        return json({ error: 'Invalid role' }, 400);
      }
      if (userId === caller.id && callerRole.role === 'admin' && role !== 'admin') {
        return json({ error: 'Admins cannot demote themselves' }, 400);
      }

      const { data: updatedRole, error: updateRoleError } = await admin
        .from('user_roles')
        .update({ role })
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .select('id')
        .maybeSingle();

      if (updateRoleError) throw updateRoleError;

      if (!updatedRole) {
        const { error: insertRoleError } = await admin
          .from('user_roles')
          .insert({
            user_id: userId,
            organization_id: organizationId,
            role,
          });

        if (insertRoleError) throw insertRoleError;
      }
    }

    const profileUpdates: Record<string, string | null> = {};
    if (fullName !== undefined) profileUpdates.full_name = fullName;
    if (phone !== undefined) profileUpdates.phone = phone || null;

    if (Object.keys(profileUpdates).length > 0) {
      const { error } = await admin
        .from('profiles')
        .update(profileUpdates)
        .eq('user_id', userId);

      if (error) throw error;
    }

    if (workspaceIds !== undefined) {
      if (workspaceIds.length > 0) {
        const { data: validWorkspaces, error: workspaceError } = await admin
          .from('workspaces')
          .select('id')
          .eq('organization_id', organizationId)
          .in('id', workspaceIds);

        if (workspaceError) throw workspaceError;

        const validIds = new Set((validWorkspaces || []).map((workspace: any) => workspace.id));
        const invalidIds = workspaceIds.filter((id: string) => !validIds.has(id));
        if (invalidIds.length > 0) {
          return json({ error: 'One or more workspaces do not belong to your organization' }, 400);
        }
      }

      const { data: organizationWorkspaces, error: organizationWorkspacesError } = await admin
        .from('workspaces')
        .select('id')
        .eq('organization_id', organizationId);

      if (organizationWorkspacesError) throw organizationWorkspacesError;
      const organizationWorkspaceIds = (organizationWorkspaces || []).map((workspace: any) => workspace.id);

      let deleteQuery = admin
        .from('workspace_members')
        .delete()
        .eq('user_id', userId);

      if (organizationWorkspaceIds.length > 0) {
        deleteQuery = deleteQuery.in('workspace_id', organizationWorkspaceIds);
      } else {
        deleteQuery = deleteQuery.eq('workspace_id', '00000000-0000-0000-0000-000000000000');
      }

      const { error: deleteError } = await deleteQuery;

      if (deleteError) throw deleteError;

      if (workspaceIds.length > 0) {
        const { error: insertError } = await admin
          .from('workspace_members')
          .insert(workspaceIds.map((workspaceId: string) => ({
            workspace_id: workspaceId,
            user_id: userId,
          })));

        if (insertError) throw insertError;
      }
    }

    return json({ success: true });
  } catch (error) {
    console.error('Error in update-team-member:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
