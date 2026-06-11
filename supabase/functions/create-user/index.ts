import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessError, assertActiveOrganizationAccess, isMissingRelationError } from '../_shared/access.ts';

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
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const { data: { user: caller }, error: callerError } = await supabase.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, ''),
    );

    if (callerError || !caller) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.fullName || '').trim();
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const role = String(body.role || 'agent');
    const password = String(body.password || '');
    const organizationId = String(body.organizationId || '');
    const workspaceIds = Array.isArray(body.workspaceIds) ? body.workspaceIds.map(String) : [];

    if (!email || !fullName || !role || !organizationId) {
      return json({ error: 'Campos obrigatorios ausentes' }, 400);
    }
    if (!editableRoles.has(role)) {
      return json({ error: 'Cargo invalido' }, 400);
    }

    await assertActiveOrganizationAccess(supabase, caller.id, organizationId, { module: 'team', requireManager: true });
    await assertTeamLimit(supabase, organizationId, email);
    await assertWorkspaceOwnership(supabase, organizationId, workspaceIds);

    const existingUser = await findUserByEmail(supabase, email);
    let userId = existingUser?.id || null;

    if (!userId) {
      if (!password || password.length < 8) {
        return json({ error: 'Senha temporaria deve ter pelo menos 8 caracteres' }, 400);
      }

      const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          phone: phone || null,
          invited_organization_id: organizationId,
          invited_role: role,
        },
      });

      if (createError) {
        const duplicate = createError.message === 'User already registered'
          ? await findUserByEmail(supabase, email)
          : null;
        if (!duplicate) {
          return json({ error: createError.message }, 400);
        }
        userId = duplicate.id;
      } else {
        userId = createdUser?.user?.id || null;
      }
    }

    if (!userId) throw new Error('Falha ao localizar usuario');

    await ensureProfile(supabase, {
      userId,
      organizationId,
      fullName,
      phone,
      preferExistingOrganization: Boolean(existingUser),
    });
    await upsertOrganizationMember(supabase, userId, organizationId, role, caller.id);
    await upsertRole(supabase, userId, organizationId, role);
    await upsertDefaultPermissions(supabase, userId, organizationId, role);
    await setWorkspaceMemberships(supabase, userId, organizationId, workspaceIds);

    return json({
      success: true,
      userId,
      existingUser: Boolean(existingUser),
      workspaceIds,
    });
  } catch (error: any) {
    if (error instanceof AccessError) return json({ error: error.message }, error.status);
    console.error('Critical error in create-user function:', error);
    return json({ error: error.message || 'Unknown error' }, 500);
  }
});

async function findUserByEmail(admin: any, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data?.users?.find((user: any) => String(user.email || '').toLowerCase() === email);
    if (found) return found;
    if (!data?.users || data.users.length < 1000) break;
  }
  return null;
}

async function assertTeamLimit(admin: any, organizationId: string, email: string) {
  const { data: orgPlan, error: orgPlanError } = await admin
    .from('organization_plans')
    .select('plan:platform_plans(max_team_members)')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (orgPlanError) throw orgPlanError;

  const maxTeamMembers = Number((orgPlan as any)?.plan?.max_team_members || 0);
  if (maxTeamMembers <= 0) return;

  const existingUser = await findUserByEmail(admin, email);
  if (existingUser) {
    const { data: existingMembership, error: existingMembershipError } = await admin
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', existingUser.id)
      .maybeSingle();
    if (existingMembershipError && !isMissingRelationError(existingMembershipError)) throw existingMembershipError;
    if (existingMembership) return;
  }

  const { count, error } = await admin
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  if (error && !isMissingRelationError(error)) throw error;
  if ((count || 0) >= maxTeamMembers) {
    throw new AccessError(`Limite de usuarios atingido neste plano (${count}/${maxTeamMembers}). Faca upgrade para adicionar mais membros.`, 403);
  }
}

async function assertWorkspaceOwnership(admin: any, organizationId: string, workspaceIds: string[]) {
  if (workspaceIds.length === 0) return;
  const { data, error } = await admin
    .from('workspaces')
    .select('id')
    .eq('organization_id', organizationId)
    .in('id', workspaceIds);

  if (error) throw error;
  const validIds = new Set((data || []).map((workspace: any) => workspace.id));
  const invalidIds = workspaceIds.filter((id) => !validIds.has(id));
  if (invalidIds.length > 0) {
    throw new AccessError('Um ou mais workspaces nao pertencem a esta organizacao', 400);
  }
}

async function ensureProfile(
  admin: any,
  args: {
    userId: string;
    organizationId: string;
    fullName: string;
    phone: string;
    preferExistingOrganization: boolean;
  },
) {
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, organization_id')
    .eq('user_id', args.userId)
    .maybeSingle();

  if (error) throw error;

  if (!profile) {
    const { error: insertError } = await admin
      .from('profiles')
      .insert({
        user_id: args.userId,
        organization_id: args.organizationId,
        full_name: args.fullName,
        phone: args.phone || null,
      });
    if (insertError) throw insertError;
    return;
  }

  const updates: Record<string, string | null> = {
    full_name: args.fullName,
    phone: args.phone || null,
  };

  if (!args.preferExistingOrganization) {
    updates.organization_id = args.organizationId;
  }

  const { error: updateError } = await admin
    .from('profiles')
    .update(updates)
    .eq('user_id', args.userId);

  if (updateError) throw updateError;
}

async function upsertOrganizationMember(admin: any, userId: string, organizationId: string, role: string, createdBy: string) {
  const { error } = await admin
    .from('organization_members')
    .upsert({
      user_id: userId,
      organization_id: organizationId,
      role,
      created_by: createdBy,
    }, { onConflict: 'organization_id,user_id' });

  if (error && !isMissingRelationError(error)) throw error;
}

async function upsertRole(admin: any, userId: string, organizationId: string, role: string) {
  const { data: updatedRole, error: updateError } = await admin
    .from('user_roles')
    .update({ role })
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .select('id')
    .maybeSingle();

  if (updateError) throw updateError;
  if (updatedRole) return;

  const { error: insertError } = await admin
    .from('user_roles')
    .insert({
      user_id: userId,
      organization_id: organizationId,
      role,
    });

  if (insertError) throw insertError;
}

async function upsertDefaultPermissions(admin: any, userId: string, organizationId: string, role: string) {
  const permissions: any = {
    user_id: userId,
    organization_id: organizationId,
    can_access_dashboard: true,
    can_access_conversations: false,
    can_access_contacts: false,
    can_access_groups: false,
    can_access_pipeline: false,
    can_access_flows: false,
    can_access_campaigns: false,
    can_access_reports: false,
    can_access_agents: false,
    can_access_settings: false,
    can_access_integrations: false,
    can_access_team: false,
    can_access_scheduled: false,
    can_access_calendar: false,
    can_access_tools: false,
    can_access_tool_widgets: false,
    can_access_tool_documents: false,
    can_access_tool_quiz: false,
    can_access_tool_wizzy_flow: false,
    can_access_tool_carousel: false,
    can_access_tool_cnis: false,
    conversations_filter_type: 'all',
    pipeline_access_type: 'all',
  };

  if (role === 'supervisor') {
    permissions.can_access_conversations = true;
    permissions.can_access_contacts = true;
    permissions.can_access_groups = true;
    permissions.can_access_pipeline = true;
    permissions.can_access_reports = true;
    permissions.can_access_team = true;
    permissions.can_access_scheduled = true;
    permissions.can_access_calendar = true;
  } else if (role === 'agent') {
    permissions.can_access_conversations = true;
    permissions.can_access_contacts = true;
    permissions.can_access_groups = true;
  } else if (role === 'admin') {
    permissions.can_access_conversations = true;
    permissions.can_access_contacts = true;
    permissions.can_access_groups = true;
    permissions.can_access_pipeline = true;
    permissions.can_access_flows = true;
    permissions.can_access_campaigns = true;
    permissions.can_access_reports = true;
    permissions.can_access_agents = true;
    permissions.can_access_settings = true;
    permissions.can_access_integrations = true;
    permissions.can_access_team = true;
    permissions.can_access_scheduled = true;
    permissions.can_access_calendar = true;
    permissions.can_access_tools = true;
    permissions.can_access_tool_widgets = true;
    permissions.can_access_tool_documents = true;
    permissions.can_access_tool_quiz = true;
    permissions.can_access_tool_wizzy_flow = true;
    permissions.can_access_tool_carousel = true;
    permissions.can_access_tool_cnis = true;
  }

  const { error } = await admin
    .from('user_permissions')
    .upsert(permissions, { onConflict: 'user_id,organization_id' });

  if (error) throw error;
}

async function setWorkspaceMemberships(admin: any, userId: string, organizationId: string, workspaceIds: string[]) {
  const { data: organizationWorkspaces, error: workspacesError } = await admin
    .from('workspaces')
    .select('id')
    .eq('organization_id', organizationId);

  if (workspacesError) throw workspacesError;

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

  if (workspaceIds.length === 0) return;

  const { error: insertError } = await admin
    .from('workspace_members')
    .insert(workspaceIds.map((workspaceId) => ({
      user_id: userId,
      workspace_id: workspaceId,
    })));

  if (insertError) throw insertError;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
