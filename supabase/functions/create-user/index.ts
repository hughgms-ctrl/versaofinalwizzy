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
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create user with admin API (skips email confirmation)
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError) {
      console.error('Error creating user:', createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = newUser.user.id;

    // The trigger handle_new_user already created a profile and role with a new org
    // We need to:
    // 1. Delete the auto-created organization (if it's different)
    // 2. Update the profile to point to the correct organization
    // 3. Update the role to the correct one

    // Get the auto-created profile
    const { data: autoProfile } = await supabase
      .from('profiles')
      .select('id, organization_id')
      .eq('user_id', userId)
      .single();

    if (autoProfile) {
      const autoOrgId = autoProfile.organization_id;

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

      // Create correct role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          organization_id: organizationId,
          role: role,
        });

      if (roleError) {
        console.error('Error creating role:', roleError);
      }

      // Create default permissions based on role
      const defaultPermissions: Record<string, boolean | string> = {
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

      // Supervisor gets default permissions enabled
      if (role === 'supervisor') {
        defaultPermissions.can_access_conversations = true;
        defaultPermissions.can_access_pipeline = true;
        defaultPermissions.can_access_reports = true;
        defaultPermissions.can_access_team = true;
        defaultPermissions.can_access_scheduled = true;
      }

      // Agent gets only conversations access by default
      if (role === 'agent') {
        defaultPermissions.can_access_conversations = true;
      }

      const { error: permError } = await supabase
        .from('user_permissions')
        .insert(defaultPermissions);

      if (permError) {
        console.error('Error creating permissions:', permError);
      }

      // Delete auto-created whatsapp instance (if any)
      await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('organization_id', autoOrgId);

      // Delete auto-created organization (if different from target)
      if (autoOrgId !== organizationId) {
        await supabase
          .from('organizations')
          .delete()
          .eq('id', autoOrgId);
      }
    }

    return new Response(
      JSON.stringify({ success: true, userId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in create-user function:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});