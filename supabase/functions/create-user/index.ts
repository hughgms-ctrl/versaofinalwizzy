import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const { email, fullName, role, password, organizationId } = await req.json();

    if (!email || !fullName || !role || !password || !organizationId) {
      console.error('Missing fields:', { email, fullName, role, hasPassword: !!password, organizationId });
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios ausentes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      const autoOrgId = autoProfile.organization_id;
      console.log(`Found auto-created Org: ${autoOrgId}. Updating to Org: ${organizationId}`);

      // Update profile to correct organization
      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({
          organization_id: organizationId,
          full_name: fullName,
        })
        .eq('user_id', userId);

      if (profileUpdateError) {
        console.error('Error updating profile:', profileUpdateError);
      }

      // Delete the auto-created role
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Delete auto-created whatsapp instance (if any)
      await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('organization_id', autoOrgId);

      // Delete auto-created organization (if different from target)
      if (autoOrgId && autoOrgId !== organizationId) {
        const { error: deleteOrgError } = await supabase
          .from('organizations')
          .delete()
          .eq('id', autoOrgId);

        if (deleteOrgError) {
          console.error('Error deleting auto-org:', deleteOrgError);
        }
      }
    }

    // Ensure user_roles is set correctly
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
    const errorMessage = error.message || 'Unknown error';
    console.error('Critical error in create-user function:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});