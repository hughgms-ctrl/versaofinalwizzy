// Clone a platform_package into the caller's workspace_templates.
// Body: { package_id: uuid, workspace_id: uuid }
// Caller must be owner/admin of the org and the workspace must belong to that org.
// Package must have is_clonable = true.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Invalid session' }, 401);

    const body = await req.json().catch(() => ({}));
    const package_id = body?.package_id as string | undefined;
    const workspace_id = body?.workspace_id as string | undefined;
    if (!package_id || !workspace_id) {
      return json({ error: 'package_id and workspace_id are required' }, 400);
    }

    const { data: profile } = await admin
      .from('profiles').select('organization_id').eq('user_id', user.id).maybeSingle();
    const organizationId = profile?.organization_id;
    if (!organizationId) return json({ error: 'No organization' }, 400);

    // Permission
    const [{ data: isOwner }, { data: isAdmin }] = await Promise.all([
      admin.rpc('has_role_in_org', { _user_id: user.id, _role: 'owner', _org_id: organizationId }),
      admin.rpc('has_role_in_org', { _user_id: user.id, _role: 'admin', _org_id: organizationId }),
    ]);
    if (!isOwner && !isAdmin) return json({ error: 'Only owner/admin can clone' }, 403);

    // Workspace belongs to org
    const { data: ws } = await admin.from('workspaces').select('id,organization_id')
      .eq('id', workspace_id).maybeSingle();
    if (!ws || ws.organization_id !== organizationId) {
      return json({ error: 'Workspace not in your org' }, 403);
    }

    // Load package and check is_clonable
    const { data: pkg, error: pkgErr } = await admin.from('platform_packages')
      .select('*').eq('id', package_id).maybeSingle();
    if (pkgErr || !pkg) return json({ error: 'Package not found' }, 404);
    if (pkg.is_clonable === false) return json({ error: 'Package is not clonable' }, 403);

    const { data: created, error } = await admin.from('workspace_templates').insert({
      organization_id: organizationId,
      workspace_id,
      created_by: user.id,
      name: pkg.name,
      icon: pkg.icon,
      color: pkg.color,
      description: pkg.description,
      master_prompt: pkg.master_prompt,
      agents_template: pkg.agents_template || [],
      flows_template: pkg.flows_template || [],
      tags_template: pkg.tags_template || [],
      pipeline_template: pkg.pipeline_template || {},
      source: 'cloned_from_package',
      source_package_id: pkg.id,
    } as never).select('*').single();
    if (error) throw error;

    return json({ ok: true, record: created });
  } catch (err) {
    console.error('clone-package-to-workspace error:', err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
