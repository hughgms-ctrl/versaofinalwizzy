// Activate a platform package or workspace template for an organization.
// source: 'platform' (default) reads from platform_packages
// source: 'workspace' reads from workspace_templates
// Materializes ai_agents, flows, tags, master_prompts and pipeline columns.
// Idempotent: skips records already created (by name) for this org.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface AgentTemplate {
  name: string;
  description?: string;
  function_role?: string;
  prompt_base?: string;
  persona?: string;
  is_active?: boolean;
}
interface TagTemplate { name: string; color?: string; description?: string }
interface PipelineColumnTemplate { name: string; color?: string }
interface PipelineTemplateShape { name?: string; description?: string; columns?: PipelineColumnTemplate[] }
interface FlowTemplate {
  name: string;
  description?: string;
  nodes?: unknown[];
  edges?: unknown[];
  trigger_type?: string;
  trigger_config?: Record<string, unknown>;
  master_prompt?: string;
  is_master_active?: boolean;
}

interface NormalizedPackage {
  id: string;
  name: string;
  kind: 'area' | 'objective' | 'template';
  version: number;
  master_prompt: string | null;
  agents_template: AgentTemplate[];
  flows_template: FlowTemplate[];
  tags_template: TagTemplate[];
  pipeline_template: PipelineTemplateShape | null;
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
    const packageId = body?.package_id as string | undefined;
    const templateId = body?.template_id as string | undefined;
    const source = (body?.source as 'platform' | 'workspace' | undefined) || (templateId ? 'workspace' : 'platform');
    const targetWorkspaceId = (body?.workspace_id as string | undefined) || null;

    if (source === 'platform' && !packageId) return json({ error: 'package_id is required' }, 400);
    if (source === 'workspace' && !templateId) return json({ error: 'template_id is required' }, 400);

    // Resolve org from caller profile (do not trust client orgId)
    const { data: profile } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    const organizationId = profile?.organization_id;
    if (!organizationId) return json({ error: 'No organization' }, 400);

    // Load source
    let pkg: NormalizedPackage;
    if (source === 'platform') {
      const { data, error } = await admin
        .from('platform_packages')
        .select('*')
        .eq('id', packageId!)
        .maybeSingle();
      if (error || !data) return json({ error: 'Package not found' }, 404);
      pkg = {
        id: data.id,
        name: data.name,
        kind: data.kind,
        version: data.version || 1,
        master_prompt: data.master_prompt,
        agents_template: Array.isArray(data.agents_template) ? data.agents_template : [],
        flows_template: Array.isArray(data.flows_template) ? data.flows_template : [],
        tags_template: Array.isArray(data.tags_template) ? data.tags_template : [],
        pipeline_template: data.pipeline_template || null,
      };
    } else {
      const { data, error } = await admin
        .from('workspace_templates')
        .select('*')
        .eq('id', templateId!)
        .eq('organization_id', organizationId) // safety: same org only
        .maybeSingle();
      if (error || !data) return json({ error: 'Template not found' }, 404);
      pkg = {
        id: data.id,
        name: data.name,
        kind: 'template',
        version: 1,
        master_prompt: data.master_prompt,
        agents_template: Array.isArray(data.agents_template) ? data.agents_template : [],
        flows_template: Array.isArray(data.flows_template) ? data.flows_template : [],
        tags_template: Array.isArray(data.tags_template) ? data.tags_template : [],
        pipeline_template: data.pipeline_template || null,
      };
    }

    const summary = {
      agents_created: 0, agents_skipped: 0,
      flows_created: 0, flows_skipped: 0,
      tags_created: 0, tags_skipped: 0,
      master_prompt_created: false,
      pipeline_created: false,
    };

    // 1) Master prompt
    if (pkg.master_prompt && pkg.master_prompt.trim().length > 0) {
      const { data: existingMp } = await admin
        .from('master_prompts').select('id')
        .eq('organization_id', organizationId).eq('name', pkg.name)
        .maybeSingle();
      if (!existingMp) {
        await admin.from('master_prompts').insert({
          organization_id: organizationId,
          name: pkg.name,
          niche: pkg.kind === 'area' ? pkg.name : (pkg.kind === 'template' ? 'template' : 'objetivo'),
          content: pkg.master_prompt,
          is_active: false,
        } as never);
        summary.master_prompt_created = true;
      }
    }

    // 2) Agents
    for (const a of pkg.agents_template) {
      if (!a?.name) continue;
      const { data: existing } = await admin.from('ai_agents').select('id')
        .eq('organization_id', organizationId).eq('name', a.name).maybeSingle();
      if (existing) { summary.agents_skipped++; continue; }
      const insertPayload: Record<string, unknown> = {
        organization_id: organizationId,
        name: a.name,
        description: a.description || null,
        function_role: a.function_role || 'recepcao',
        prompt_base: a.prompt_base || '',
        persona: a.persona || null,
        is_active: a.is_active ?? true,
      };
      if (targetWorkspaceId) insertPayload.workspace_id = targetWorkspaceId;
      const { error: insErr } = await admin.from('ai_agents').insert(insertPayload as never);
      if (!insErr) summary.agents_created++;
    }

    // 3) Tags
    for (const t of pkg.tags_template) {
      if (!t?.name) continue;
      const { data: existing } = await admin.from('tags').select('id')
        .eq('organization_id', organizationId).eq('name', t.name).maybeSingle();
      if (existing) { summary.tags_skipped++; continue; }
      const { error: insErr } = await admin.from('tags').insert({
        organization_id: organizationId,
        name: t.name,
        color: t.color || '#3b82f6',
        description: t.description || null,
      } as never);
      if (!insErr) summary.tags_created++;
    }

    // 4) Flows
    for (const f of pkg.flows_template) {
      if (!f?.name) continue;
      const { data: existing } = await admin.from('flows').select('id')
        .eq('organization_id', organizationId).eq('name', f.name).maybeSingle();
      if (existing) { summary.flows_skipped++; continue; }
      const baseNodes = Array.isArray(f.nodes) && f.nodes.length > 0
        ? f.nodes
        : [{ id: 'start-1', type: 'start', position: { x: 250, y: 200 }, data: { label: 'Início' } }];
      const insertPayload: Record<string, unknown> = {
        organization_id: organizationId,
        name: f.name,
        description: f.description || null,
        nodes: baseNodes,
        edges: f.edges || [],
        trigger_type: f.trigger_type || 'manual',
        trigger_config: f.trigger_config || {},
        master_prompt: f.master_prompt || null,
        is_master_active: f.is_master_active ?? false,
        is_active: false,
        created_by: user.id,
      };
      if (targetWorkspaceId) insertPayload.workspace_id = targetWorkspaceId;
      const { error: insErr } = await admin.from('flows').insert(insertPayload as never);
      if (!insErr) summary.flows_created++;
    }

    // 5) Pipeline
    const pipeTpl = pkg.pipeline_template;
    if (pipeTpl && pipeTpl.name && Array.isArray(pipeTpl.columns) && pipeTpl.columns.length > 0) {
      const { data: existingPipe } = await admin.from('pipelines').select('id')
        .eq('organization_id', organizationId).eq('name', pipeTpl.name).maybeSingle();
      if (!existingPipe) {
        const { data: newPipe, error: pipeErr } = await admin.from('pipelines').insert({
          organization_id: organizationId,
          name: pipeTpl.name,
          description: pipeTpl.description || null,
          workspace_ids: targetWorkspaceId ? [targetWorkspaceId] : [],
        } as never).select('id').single<{ id: string }>();
        if (!pipeErr && newPipe?.id) {
          const colsPayload = pipeTpl.columns.map((c, idx) => ({
            pipeline_id: newPipe.id,
            name: c.name,
            color: c.color || '#94a3b8',
            order: idx,
          }));
          await admin.from('pipeline_columns').insert(colsPayload as never);
          summary.pipeline_created = true;
        }
      }
    }

    // 6) Track activation only for platform packages
    if (source === 'platform') {
      const { data: existingAct } = await admin.from('activated_packages').select('id')
        .eq('organization_id', organizationId).eq('package_id', packageId!).maybeSingle();
      if (existingAct) {
        await admin.from('activated_packages').update({
          activated_version: pkg.version,
          activated_at: new Date().toISOString(),
          activated_by: user.id,
          metadata: summary as never,
        } as never).eq('id', existingAct.id);
      } else {
        await admin.from('activated_packages').insert({
          organization_id: organizationId,
          package_id: packageId!,
          activated_version: pkg.version,
          activated_by: user.id,
          metadata: summary as never,
        } as never);
      }
    }

    return json({ ok: true, summary, source, package: { id: pkg.id, name: pkg.name, kind: pkg.kind } }, 200);
  } catch (err) {
    console.error('activate-package error:', err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
