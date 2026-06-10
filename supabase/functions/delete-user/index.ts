import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertActiveOrganizationAccess, getLegacyOrganizationRole, isMissingRelationError } from '../_shared/access.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get caller's info
    const { data: { user: caller }, error: callerError } = await supabase.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, '')
    );

    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const userId = body?.userId;
    const requestedOrganizationId = typeof body?.organizationId === 'string' ? body.organizationId : undefined;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Missing userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', caller.id)
      .single();

    const organizationId = requestedOrganizationId || callerProfile?.organization_id;

    if (!callerProfile || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'Caller profile not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await assertActiveOrganizationAccess(supabase, caller.id, organizationId, { module: 'team', requireManager: true });

    // Prevent deleting yourself
    if (userId === caller.id) {
      return new Response(
        JSON.stringify({ error: 'You cannot delete yourself' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: targetMembership, error: targetMembershipError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (targetMembershipError && !isMissingRelationError(targetMembershipError)) throw targetMembershipError;
    const effectiveTargetMembership = targetMembership
      || (targetMembershipError && isMissingRelationError(targetMembershipError)
        ? await getLegacyOrganizationRole(supabase, userId, organizationId)
        : null);

    if (!effectiveTargetMembership) {
      return new Response(
        JSON.stringify({ error: 'User not found in your organization' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (effectiveTargetMembership.role === 'owner') {
      return new Response(
        JSON.stringify({ error: 'Cannot delete the organization owner' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: organizationWorkspaces, error: workspacesError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('organization_id', organizationId);

    if (workspacesError) throw workspacesError;

    const organizationWorkspaceIds = (organizationWorkspaces || []).map((workspace: any) => workspace.id);
    if (organizationWorkspaceIds.length > 0) {
      await supabase
        .from('workspace_members')
        .delete()
        .eq('user_id', userId)
        .in('workspace_id', organizationWorkspaceIds);
    }

    await supabase
      .from('user_permissions')
      .delete()
      .eq('user_id', userId)
      .eq('organization_id', organizationId);

    await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('organization_id', organizationId);

    const { error: memberDeleteError } = await supabase
      .from('organization_members')
      .delete()
      .eq('user_id', userId)
      .eq('organization_id', organizationId);
    if (memberDeleteError && !isMissingRelationError(memberDeleteError)) throw memberDeleteError;

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in delete-user function:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
