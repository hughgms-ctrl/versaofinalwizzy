import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Action =
  | { type: 'delete_tag'; tagId: string }
  | { type: 'delete_conversation'; conversationId: string }
  | { type: 'set_conversation_workspace'; conversationId: string; workspaceId: string | null }
  | { type: 'set_contacts_workspace'; contactIds: string[]; workspaceId: string | null }
  | { type: 'bulk_add_to_campaign'; contactIds: string[]; campaignId: string };

// Máximo de contatos aceitos por chamada em ações em massa (proteção contra lotes gigantes).
const MAX_BULK_ITEMS = 100;

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

    let result: Record<string, unknown> = { success: true };

    if (action.type === 'delete_tag') {
      await deleteTag(admin, organizationId, action.tagId);
    } else if (action.type === 'delete_conversation') {
      await deleteConversation(admin, organizationId, action.conversationId);
    } else if (action.type === 'set_conversation_workspace') {
      await setConversationWorkspace(admin, organizationId, action.conversationId, action.workspaceId);
    } else if (action.type === 'set_contacts_workspace') {
      await setContactsWorkspace(admin, organizationId, action.contactIds, action.workspaceId);
    } else if (action.type === 'bulk_add_to_campaign') {
      result = { success: true, ...(await bulkAddToCampaign(admin, organizationId, action.campaignId, action.contactIds)) };
    } else {
      throw new Error('Ação inválida');
    }

    return new Response(JSON.stringify(result), {
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

async function setContactsWorkspace(
  admin: any,
  organizationId: string,
  contactIds: string[],
  workspaceId: string | null,
) {
  if (!contactIds?.length) throw new Error('Nenhum contato informado');
  if (contactIds.length > MAX_BULK_ITEMS) throw new Error(`Máximo de ${MAX_BULK_ITEMS} contatos por chamada.`);

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

  const { error: contactsUpdateError } = await admin
    .from('contacts')
    .update({ workspace_id: workspaceId })
    .in('id', contactIds)
    .eq('organization_id', organizationId);
  if (contactsUpdateError) throw contactsUpdateError;

  const { error: conversationsUpdateError } = await admin
    .from('conversations')
    .update({ workspace_id: workspaceId })
    .in('contact_id', contactIds)
    .eq('organization_id', organizationId);
  if (conversationsUpdateError) throw conversationsUpdateError;
}

// --- Helpers copiados de campaign-webhook (não compartilhados via módulo para
// não arriscar regressão no webhook público em produção) ---

const SP_OFFSET_MINUTES = -3 * 60;

function parseHHMM(value: string | null | undefined, fallback: string): { h: number; m: number } {
  const [h, m] = String(value || fallback).split(':').map((n) => parseInt(n, 10));
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

function computeWindow(startTime?: string | null, endTime?: string | null): { within: boolean; scheduledFor: string | null } {
  const nowSp = new Date(Date.now() + SP_OFFSET_MINUTES * 60000);
  const y = nowSp.getUTCFullYear();
  const mo = nowSp.getUTCMonth();
  const d = nowSp.getUTCDate();

  const start = parseHHMM(startTime, '00:00');
  const end = parseHHMM(endTime, '23:59');

  const nowMin = nowSp.getUTCHours() * 60 + nowSp.getUTCMinutes();
  const startMin = start.h * 60 + start.m;
  const endMin = end.h * 60 + end.m;

  if (nowMin >= startMin && nowMin <= endMin) {
    return { within: true, scheduledFor: null };
  }

  const targetDay = nowMin > endMin ? d + 1 : d;
  const utcMs = Date.UTC(y, mo, targetDay, start.h, start.m) - SP_OFFSET_MINUTES * 60000;
  return { within: false, scheduledFor: new Date(utcMs).toISOString() };
}

async function resolveCampaignInstance(admin: any, organizationId: string, workspaceId?: string | null) {
  if (workspaceId) {
    const { data: workspace } = await admin
      .from('workspaces')
      .select('whatsapp_instance_id')
      .eq('id', workspaceId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (workspace?.whatsapp_instance_id) {
      const { data: instance } = await admin
        .from('whatsapp_instances')
        .select('id, phone_number, logical_phone')
        .eq('id', workspace.whatsapp_instance_id)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (instance?.id) return instance;
    }
  }

  const { data: instance } = await admin
    .from('whatsapp_instances')
    .select('id, phone_number, logical_phone')
    .eq('organization_id', organizationId)
    .eq('status', 'connected')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return instance || null;
}

async function bulkAddToCampaign(
  admin: any,
  organizationId: string,
  campaignId: string,
  contactIds: string[],
) {
  if (!contactIds?.length) throw new Error('Nenhum contato informado');
  if (contactIds.length > MAX_BULK_ITEMS) throw new Error(`Máximo de ${MAX_BULK_ITEMS} contatos por chamada.`);

  const { data: campaign, error: campaignError } = await admin
    .from('campaigns')
    .select('id, name, organization_id, flow_id, is_active, start_time, end_time, workspace_id')
    .eq('id', campaignId)
    .eq('organization_id', organizationId)
    .single();

  if (campaignError || !campaign) throw new Error('Campanha não encontrada');
  if (!campaign.is_active) throw new Error('Campanha inativa');

  const campaignInstance = await resolveCampaignInstance(admin, organizationId, campaign.workspace_id);
  const window = computeWindow(campaign.start_time, campaign.end_time);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  let triggered = 0;
  let queued = 0;
  let skipped = 0;

  for (const contactId of contactIds) {
    try {
      const { data: contact, error: contactError } = await admin
        .from('contacts')
        .select('id, phone, name')
        .eq('id', contactId)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (contactError || !contact) {
        skipped++;
        continue;
      }

      // Encontra ou cria a conversa, igual campaign-webhook.
      let conversationId: string | null = null;
      let existingConversationQuery = admin
        .from('conversations')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('contact_id', contactId);

      existingConversationQuery = campaignInstance?.id
        ? existingConversationQuery.eq('whatsapp_instance_id', campaignInstance.id)
        : existingConversationQuery.is('whatsapp_instance_id', null);

      const { data: existingConv } = await existingConversationQuery
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingConv) {
        conversationId = existingConv.id;
        await admin.from('conversations').update({ status: 'open' }).eq('id', conversationId);
      } else {
        const { data: newConv, error: convError } = await admin
          .from('conversations')
          .insert({
            organization_id: organizationId,
            contact_id: contactId,
            status: 'open',
            workspace_id: campaign.workspace_id || null,
            whatsapp_instance_id: campaignInstance?.id || null,
            source_phone: campaignInstance?.phone_number || campaignInstance?.logical_phone || null,
            metadata: { source: 'contacts_bulk_action', campaign_id: campaign.id },
          })
          .select('id')
          .single();

        if (convError || !newConv) {
          skipped++;
          continue;
        }
        conversationId = newConv.id;
      }

      const variables = { phone: contact.phone, name: contact.name, campaign_id: campaign.id, campaign_name: campaign.name };

      if (window.within) {
        await admin.rpc('increment_campaign_count', { campaign_id: campaign.id });

        const flowPromise = fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ flowId: campaign.flow_id, conversationId, variables }),
        });
        flowPromise.catch((err) => console.error('[bulk_add_to_campaign] flow-execute error:', err));

        triggered++;
      } else {
        await admin.from('campaign_queue').insert({
          organization_id: organizationId,
          campaign_id: campaign.id,
          conversation_id: conversationId,
          contact_id: contactId,
          scheduled_for: window.scheduledFor,
          status: 'pending',
          variables,
        });
        queued++;
      }
    } catch (err) {
      console.error('[bulk_add_to_campaign] item error:', err);
      skipped++;
    }
  }

  return { triggered, queued, skipped };
}
