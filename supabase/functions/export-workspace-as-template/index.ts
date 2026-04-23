// Export a workspace's selected agents/flows/tags/pipeline as a private template
// (workspace_templates) or as a platform package (platform_packages) when called by platform admin.
//
// Body:
//   workspace_id: uuid (required)
//   name, icon, color, description, master_prompt
//   include_agent_ids: uuid[]
//   include_flow_ids: uuid[]
//   include_tag_ids: uuid[]
//   include_pipeline_id: uuid | null
//   as_platform: boolean (only platform admins) — saves to platform_packages instead
//   platform_kind: 'area' | 'objective' (when as_platform=true)
//   parent_package_id: uuid | null (when as_platform=true and kind=objective)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

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
    const {
      workspace_id,
      name,
      icon = null,
      color = null,
      description = null,
      master_prompt = null,
      include_agent_ids = [],
      include_flow_ids = [],
      include_tag_ids = [],
      include_pipeline_id = null,
      as_platform = false,
      platform_kind = 'area',
      parent_package_id = null,
    } = body || {};

    if (!workspace_id) return json({ error: 'workspace_id is required' }, 400);
    if (!name || !String(name).trim()) return json({ error: 'name is required' }, 400);

    // Resolve org + role of caller
    const { data: profile } = await admin
      .from('profiles').select('organization_id').eq('user_id', user.id).maybeSingle();
    const organizationId = profile?.organization_id;
    if (!organizationId) return json({ error: 'No organization' }, 400);

    // Validate workspace belongs to this org
    const { data: ws } = await admin
      .from('workspaces').select('id, organization_id')
      .eq('id', workspace_id).maybeSingle();
    if (!ws || ws.organization_id !== organizationId) {
      // exception for platform admin saving as platform package
      const { data: isPlatform } = await admin.rpc('is_platform_admin', { _user_id: user.id });
      if (!(as_platform && isPlatform)) return json({ error: 'Workspace not in your org' }, 403);
    }

    // Permission check for org-scope
    if (!as_platform) {
      const [{ data: isOwner }, { data: isAdmin }] = await Promise.all([
        admin.rpc('has_role_in_org', { _user_id: user.id, _role: 'owner', _org_id: organizationId }),
        admin.rpc('has_role_in_org', { _user_id: user.id, _role: 'admin', _org_id: organizationId }),
      ]);
      if (!isOwner && !isAdmin) return json({ error: 'Only owner/admin can create templates' }, 403);
    } else {
      const { data: isPlatform } = await admin.rpc('is_platform_admin', { _user_id: user.id });
      if (!isPlatform) return json({ error: 'Only platform admin can save as platform package' }, 403);
    }

    // Load selected agents
    const agents_template: any[] = [];
    if (include_agent_ids.length > 0) {
      const { data } = await admin.from('ai_agents')
        .select('name,description,function_role,prompt_base,persona,is_active')
        .in('id', include_agent_ids)
        .eq('organization_id', organizationId);
      (data || []).forEach((a) => agents_template.push(a));
    }

    // Load selected flows
    const flows_template: any[] = [];
    if (include_flow_ids.length > 0) {
      const { data } = await admin.from('flows')
        .select('name,description,nodes,edges,trigger_type,trigger_config,master_prompt,is_master_active')
        .in('id', include_flow_ids)
        .eq('organization_id', organizationId);
      (data || []).forEach((f) => flows_template.push(f));
    }

    // Load selected tags
    const tags_template: any[] = [];
    if (include_tag_ids.length > 0) {
      const { data } = await admin.from('tags')
        .select('name,color,description')
        .in('id', include_tag_ids)
        .eq('organization_id', organizationId);
      (data || []).forEach((t) => tags_template.push(t));
    }

    // Load pipeline
    let pipeline_template: Record<string, unknown> = {};
    if (include_pipeline_id) {
      const { data: pipe } = await admin.from('pipelines')
        .select('name,description')
        .eq('id', include_pipeline_id)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (pipe) {
        const { data: cols } = await admin.from('pipeline_columns')
          .select('name,color,order')
          .eq('pipeline_id', include_pipeline_id)
          .order('order');
        pipeline_template = {
          name: pipe.name,
          description: pipe.description,
          columns: (cols || []).map((c) => ({ name: c.name, color: c.color })),
        };
      }
    }

    if (as_platform) {
      const { data: created, error } = await admin.from('platform_packages').insert({
        kind: platform_kind,
        parent_package_id: platform_kind === 'objective' ? parent_package_id : null,
        name,
        slug: slugify(String(name)) + '-' + Date.now().toString(36),
        icon, color, description,
        master_prompt,
        agents_template, flows_template, tags_template, pipeline_template,
        is_published: false,
        version: 1,
      } as never).select('*').single();
      if (error) throw error;
      return json({ ok: true, target: 'platform_packages', record: created });
    }

    const { data: created, error } = await admin.from('workspace_templates').insert({
      organization_id: organizationId,
      workspace_id,
      created_by: user.id,
      name, icon, color, description,
      master_prompt,
      agents_template, flows_template, tags_template, pipeline_template,
      source: 'workspace_export',
    } as never).select('*').single();
    if (error) throw error;

    return json({ ok: true, target: 'workspace_templates', record: created });
  } catch (err) {
    console.error('export-workspace-as-template error:', err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
