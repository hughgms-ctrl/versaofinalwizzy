import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessError, assertActiveOrganizationAccess, isMissingRelationError } from '../_shared/access.ts';

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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user: caller }, error: callerError } = await supabase.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, '')
    );

    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { email, fullName, phone, role, password, organizationId } = await req.json();

    if (!email || !fullName || !role || !password || !organizationId) {
      console.error('Missing fields:', { email, fullName, role, hasPassword: !!password, organizationId });
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios ausentes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await assertActiveOrganizationAccess(supabase, caller.id, organizationId, { module: 'team', requireManager: true });

    const { data: orgPlan, error: orgPlanError } = await supabase
      .from('organization_plans')
      .select('plan:platform_plans(max_team_members)')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (orgPlanError) throw orgPlanError;

    const maxTeamMembers = Number((orgPlan as any)?.plan?.max_team_members || 0);
    if (maxTeamMembers > 0) {
      const { count: organizationMemberCount, error: organizationMemberCountError } = await supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId);

      if (organizationMemberCountError && !isMissingRelationError(organizationMemberCountError)) throw organizationMemberCountError;
      let current = organizationMemberCount || 0;
      if (organizationMemberCountError && isMissingRelationError(organizationMemberCountError)) {
        const { count: profileCount, error: profileCountError } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId);
        if (profileCountError) throw profileCountError;
        current = profileCount || 0;
      }
      if (current >= maxTeamMembers) {
        return new Response(
          JSON.stringify({ error: `Limite de usuÃ¡rios atingido neste plano (${current}/${maxTeamMembers}). FaÃ§a upgrade para adicionar mais membros.` }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Create user with admin API (skips email confirmation)
    console.log(`Creating user: ${email} for org: ${organizationId}`);
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError) {
      console.error('Error in auth.admin.createUser:', createError);
      return new Response(
        JSON.stringify({ error: createError.message === 'User already registered' ? 'Email já cadastrado no sistema.' : createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!newUser?.user) {
      throw new Error('Falha ao criar usuário: Retorno vazio do Auth');
    }

    const userId = newUser.user.id;
    console.log(`User created with ID: ${userId}. Waiting for profile trigger...`);

    // The trigger handle_new_user already created a profile and role with a new org
    // We need to wait a bit to ensure the trigger has finished in all replicas if necessary
    let autoProfile = null;
    let retries = 0;
    while (!autoProfile && retries < 5) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, organization_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (data) {
        autoProfile = data;
      } else {
        console.log(`Profile not found, retry ${retries + 1}...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }
    }

    if (!autoProfile) {
      console.error('Profile trigger did not complete in time');
      // If profile is missing, we try to create it manually as a fallback
      const { error: manualProfileError } = await supabase
        .from('profiles')
        .insert({
          user_id: userId,
          organization_id: organizationId,
          full_name: fullName,
        });

      if (manualProfileError) {
        console.error('Failed to create profile manually:', manualProfileError);
        throw new Error('Falha ao criar perfil do usuário no banco de dados.');
      }
    } else {
      console.log(`Found auto-created profile in personal org: ${autoProfile.organization_id}. Adding membership to org: ${organizationId}`);

      // Keep the user's own organization intact. This account can participate in many organizations.
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          phone: phone || null,
        })
        .eq('user_id', userId);

      if (profileUpdateError) {
        console.error('Error updating profile:', profileUpdateError);
        return new Response(
          JSON.stringify({ error: profileUpdateError.message || 'Falha ao vincular usuario a organizacao.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Ensure membership and organization-scoped role are set correctly.
    const { error: memberError } = await supabase
      .from('organization_members')
      .upsert({
        user_id: userId,
        organization_id: organizationId,
        role: role,
      }, { onConflict: 'organization_id,user_id' });

    if (memberError) {
      if (isMissingRelationError(memberError)) {
        console.warn('organization_members table not available; using legacy profile/user_roles membership only');
      } else {
      console.error('Error setting organization membership:', memberError);
      throw memberError;
      }
    }

    const { error: roleError } = await supabase
      .from('user_roles')
      .upsert({
        user_id: userId,
        organization_id: organizationId,
        role: role,
      });

    if (roleError) {
      console.error('Error setting role:', roleError);
    }

    // Create default permissions based on role
    const defaultPermissions: any = {
      user_id: userId,
      organization_id: organizationId,
      can_access_conversations: false,
      can_access_pipeline: false,
      can_access_flows: false,
      can_access_reports: false,
      can_access_agents: false,
      can_access_settings: false,
      can_access_team: false,
      can_access_scheduled: false,
      conversations_filter_type: 'all',
      pipeline_access_type: 'all',
    };

    if (role === 'supervisor') {
      defaultPermissions.can_access_conversations = true;
      defaultPermissions.can_access_pipeline = true;
      defaultPermissions.can_access_reports = true;
      defaultPermissions.can_access_team = true;
      defaultPermissions.can_access_scheduled = true;
    } else if (role === 'agent') {
      defaultPermissions.can_access_conversations = true;
    } else if (role === 'admin') {
      defaultPermissions.can_access_conversations = true;
      defaultPermissions.can_access_pipeline = true;
      defaultPermissions.can_access_flows = true;
      defaultPermissions.can_access_reports = true;
      defaultPermissions.can_access_agents = true;
      defaultPermissions.can_access_settings = true;
      defaultPermissions.can_access_team = true;
      defaultPermissions.can_access_scheduled = true;
    }

    const { error: permError } = await supabase
      .from('user_permissions')
      .upsert(defaultPermissions, { onConflict: 'user_id, organization_id' });

    if (permError) {
      console.error('Error creating permissions:', permError);
    }

    return new Response(
      JSON.stringify({ success: true, userId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    if (error instanceof AccessError) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: error.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const errorMessage = error.message || 'Unknown error';
    console.error('Critical error in create-user function:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
