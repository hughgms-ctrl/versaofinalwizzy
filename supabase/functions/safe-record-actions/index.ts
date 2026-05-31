import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | { type: 'delete_tag'; tagId: string }
  | { type: 'delete_conversation'; conversationId: string }
  | { type: 'set_conversation_workspace'; conversationId: string; workspaceId: string | null };

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) throw new Error('Usuário não autenticado');

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('user_id', userData.user.id)
      .single();

    if (profileError || !profile?.organization_id) throw new Error('Perfil não encontrado');
    const organizationId = profile.organization_id;
    const action = (await req.json()) as Action;

    if (action.type === 'delete_tag') {
      await deleteTag(admin, organizationId, action.tagId);
    } else if (action.type === 'delete_conversation') {
      await deleteConversation(admin, organizationId, action.conversationId);
    } else if (action.type === 'set_conversation_workspace') {
      await setConversationWorkspace(admin, organizationId, action.conversationId, action.workspaceId);
    } else {
      throw new Error('Ação inválida');
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Erro inesperado' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function deleteTag(admin: any, organizationId: string, tagId: string) {
  const { data: tag, error: tagError } = await admin
    .from('tags')
    .select('id, organization_id')
    .eq('id', tagId)
    .eq('organization_id', organizationId)
    .single();

  if (tagError || !tag) throw new Error('Tag não encontrada');

  const { data: workspaces = [] } = await admin
    .from('workspaces')
    .select('id, filter_tag_ids')
    .eq('organization_id', organizationId);

  for (const workspace of workspaces) {
    const nextTagIds = (workspace.filter_tag_ids || []).filter((id: string) => id !== tagId);
    if (nextTagIds.length !== (workspace.filter_tag_ids || []).length) {
      await admin.from('workspaces').update({ filter_tag_ids: nextTagIds }).eq('id', workspace.id);
    }
  }

  const { data: widgets = [] } = await admin
    .from('widgets')
    .select('id, tag_id, tag_ids')
    .eq('organization_id', organizationId);

  for (const widget of widgets) {
    const nextTagIds = (widget.tag_ids || []).filter((id: string) => id !== tagId);
    const patch: Record<string, unknown> = {};
    if (widget.tag_id === tagId) patch.tag_id = null;
    if (nextTagIds.length !== (widget.tag_ids || []).length) patch.tag_ids = nextTagIds;
    if (Object.keys(patch).length > 0) {
      await admin.from('widgets').update(patch).eq('id', widget.id);
    }
  }

  const { data: pipelines = [] } = await admin
    .from('pipelines')
    .select('id')
    .eq('organization_id', organizationId);
  const pipelineIds = pipelines.map((pipeline: any) => pipeline.id);

  if (pipelineIds.length > 0) {
    const { data: columns = [] } = await admin
      .from('pipeline_columns')
      .select('id, auto_add_tag_ids')
      .in('pipeline_id', pipelineIds);

    for (const column of columns) {
      const nextTagIds = (column.auto_add_tag_ids || []).filter((id: string) => id !== tagId);
      if (nextTagIds.length !== (column.auto_add_tag_ids || []).length) {
        await admin.from('pipeline_columns').update({ auto_add_tag_ids: nextTagIds }).eq('id', column.id);
      }
    }
  }

  await admin.from('contact_tags').delete().eq('tag_id', tagId);
  const { error } = await admin.from('tags').delete().eq('id', tagId).eq('organization_id', organizationId);
  if (error) throw error;
}

async function deleteConversation(admin: any, organizationId: string, conversationId: string) {
  const { data: conversation, error: conversationError } = await admin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .single();

  if (conversationError || !conversation) throw new Error('Conversa não encontrada');

  await clearConversationReference(admin, 'generated_documents', organizationId, conversationId);
  await clearConversationReference(admin, 'document_signatures', organizationId, conversationId);
  await clearConversationReference(admin, 'widget_submissions', organizationId, conversationId);
  await clearConversationReference(admin, 'calendar_bookings', organizationId, conversationId);
  await clearConversationReference(admin, 'quiz_submissions', organizationId, conversationId);
  await clearConversationReference(admin, 'cases', organizationId, conversationId);

  const { error } = await admin
    .from('conversations')
    .delete()
    .eq('id', conversationId)
    .eq('organization_id', organizationId);

  if (error) throw error;
}

async function clearConversationReference(
  admin: any,
  table: string,
  organizationId: string,
  conversationId: string,
) {
  const { error } = await admin
    .from(table)
    .update({ conversation_id: null })
    .eq('conversation_id', conversationId)
    .eq('organization_id', organizationId);

  if (!error) return;

  const ignorableCodes = new Set(['42P01', '42703']);
  if (ignorableCodes.has(error.code)) return;

  throw error;
}

async function setConversationWorkspace(
  admin: any,
  organizationId: string,
  conversationId: string,
  workspaceId: string | null,
) {
  const { data: conversation, error: conversationError } = await admin
    .from('conversations')
    .select('id, contact_id, organization_id')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .single();

  if (conversationError || !conversation) throw new Error('Conversa não encontrada');

  if (workspaceId) {
    const { data: workspace, error: workspaceError } = await admin
      .from('workspaces')
      .select('id')
      .eq('id', workspaceId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single();

    if (workspaceError || !workspace) throw new Error('Workspace não encontrado');
  }

  const { error: conversationUpdateError } = await admin
    .from('conversations')
    .update({ workspace_id: workspaceId })
    .eq('id', conversationId)
    .eq('organization_id', organizationId);
  if (conversationUpdateError) throw conversationUpdateError;

  const { error: contactUpdateError } = await admin
    .from('contacts')
    .update({ workspace_id: workspaceId })
    .eq('id', conversation.contact_id)
    .eq('organization_id', organizationId);
  if (contactUpdateError) throw contactUpdateError;
}
