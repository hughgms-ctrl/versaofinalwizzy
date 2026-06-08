import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  resolveWhatsAppInstance,
  getEvolutionConfig,
  sendWhatsAppMessage,
  WhatsAppSendType,
} from '../_shared/whatsappProvider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type GroupAction =
  | 'sync'
  | 'list'
  | 'participants'
  | 'updateParticipant'
  | 'create'
  | 'updateSubject'
  | 'updateDescription'
  | 'updatePicture'
  | 'send';

interface GroupRequest {
  action: GroupAction;
  groupJid?: string;
  groupId?: string;
  // create
  subject?: string;
  description?: string;
  participants?: string[];
  // updateParticipant
  participantAction?: 'add' | 'remove' | 'promote' | 'demote';
  // updatePicture
  image?: string;
  // send
  text?: string | null;
  type?: WhatsAppSendType;
  mediaUrl?: string | null;
  caption?: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Build a participant JID (Evolution expects xxxxx@s.whatsapp.net)
function toParticipantJid(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) return value;
  if (value.includes('@')) return value;
  const digits = value.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

// Normalize a group entry from Evolution fetchAllGroups into our row shape
function mapGroup(raw: any): {
  group_jid: string;
  name: string | null;
  description: string | null;
  picture_url: string | null;
  participant_count: number;
  is_admin: boolean;
  participants: Array<{ jid: string; isAdmin: boolean }>;
  raw: any;
} | null {
  const groupJid = raw?.id || raw?.jid || raw?.groupJid || '';
  if (!groupJid || !String(groupJid).includes('@g.us')) return null;

  const participantsRaw: any[] = Array.isArray(raw?.participants) ? raw.participants : [];
  const participants = participantsRaw.map((p: any) => ({
    jid: p?.id || p?.jid || '',
    isAdmin: p?.admin === 'admin' || p?.admin === 'superadmin' || p?.isAdmin === true,
  })).filter((p) => p.jid);

  return {
    group_jid: groupJid,
    name: raw?.subject || raw?.name || null,
    description: raw?.desc || raw?.description || null,
    picture_url: raw?.pictureUrl || raw?.profilePicUrl || null,
    participant_count: typeof raw?.size === 'number' ? raw.size : participants.length,
    // is_admin is best-effort; some payloads expose subjectOwner / isCommunity etc.
    is_admin: raw?.isAdmin === true,
    participants,
    raw,
  };
}

async function evolutionFetch(
  baseUrl: string,
  apiKey: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: init?.method || 'GET',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: init?.body != null ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { ok: res.ok, status: res.status, json: parsed, text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: 'Invalid token' }, 401);

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();
    if (!profile) return json({ error: 'Profile not found' }, 404);

    const organizationId = profile.organization_id as string;
    const payload = await req.json() as GroupRequest;
    const action = payload.action;

    // list reads straight from the DB
    if (action === 'list') {
      const { data: groups, error } = await supabase
        .from('whatsapp_groups')
        .select('*')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true });
      if (error) return json({ error: error.message }, 500);
      return json({ groups: groups || [] });
    }

    const instance = await resolveWhatsAppInstance(supabase, organizationId, null);
    if (!instance) return json({ error: 'Nenhuma instância WhatsApp conectada' }, 404);

    // The `send` action works for any provider via the shared sender.
    if (action === 'send') {
      const groupJid = payload.groupJid || '';
      if (!groupJid) return json({ error: 'groupJid é obrigatório' }, 400);

      const result = await sendWhatsAppMessage(supabase, {
        organizationId,
        phone: groupJid,
        isGroup: true,
        text: payload.text ?? null,
        type: payload.type,
        mediaUrl: payload.mediaUrl ?? null,
        caption: payload.caption ?? null,
        conversationInstanceId: instance.id,
      });

      if (!result.ok) {
        return json({ error: `${result.provider} ${result.status}: ${result.responseText.slice(0, 300)}` }, 502);
      }
      return json({ ok: true, messageId: result.zapiMessageId, provider: result.provider });
    }

    // Remaining actions are group management — Evolution API only.
    const provider = instance.provider === 'evolution' ? 'evolution' : 'uazapi';
    if (provider !== 'evolution') {
      return json({ error: 'Gerenciamento de grupos disponível apenas para Evolution API' }, 400);
    }

    const { baseUrl, apiKey, instanceName } = await getEvolutionConfig(supabase, instance);
    if (!baseUrl || !apiKey || !instanceName) {
      return json({ error: 'Evolution API não configurada para esta instância' }, 400);
    }

    switch (action) {
      case 'sync': {
        const res = await evolutionFetch(
          baseUrl,
          apiKey,
          `/group/fetchAllGroups/${instanceName}?getParticipants=true`,
        );
        if (!res.ok) return json({ error: `Evolution ${res.status}: ${res.text.slice(0, 300)}` }, 502);

        const list: any[] = Array.isArray(res.json) ? res.json : (res.json?.groups || []);
        const rows = list.map(mapGroup).filter(Boolean) as NonNullable<ReturnType<typeof mapGroup>>[];

        const nowIso = new Date().toISOString();
        let upserted = 0;
        for (const row of rows) {
          const { error } = await supabase
            .from('whatsapp_groups')
            .upsert({
              organization_id: organizationId,
              whatsapp_instance_id: instance.id,
              group_jid: row.group_jid,
              name: row.name,
              description: row.description,
              picture_url: row.picture_url,
              participant_count: row.participant_count,
              is_admin: row.is_admin,
              participants: row.participants,
              raw: row.raw,
              last_synced_at: nowIso,
            }, { onConflict: 'organization_id,group_jid' });
          if (!error) upserted++;
        }
        return json({ ok: true, synced: upserted, total: rows.length });
      }

      case 'participants': {
        const groupJid = payload.groupJid;
        if (!groupJid) return json({ error: 'groupJid é obrigatório' }, 400);
        const res = await evolutionFetch(
          baseUrl,
          apiKey,
          `/group/participants/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
        );
        if (!res.ok) return json({ error: `Evolution ${res.status}: ${res.text.slice(0, 300)}` }, 502);
        const participants = res.json?.participants || res.json || [];
        return json({ ok: true, participants });
      }

      case 'updateParticipant': {
        const groupJid = payload.groupJid;
        if (!groupJid || !payload.participantAction || !payload.participants?.length) {
          return json({ error: 'groupJid, participantAction e participants são obrigatórios' }, 400);
        }
        const res = await evolutionFetch(
          baseUrl,
          apiKey,
          `/group/updateParticipant/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
          {
            method: 'POST',
            body: {
              action: payload.participantAction,
              participants: payload.participants.map(toParticipantJid),
            },
          },
        );
        if (!res.ok) return json({ error: `Evolution ${res.status}: ${res.text.slice(0, 300)}` }, 502);
        return json({ ok: true, result: res.json });
      }

      case 'create': {
        if (!payload.subject || !payload.participants?.length) {
          return json({ error: 'subject e participants são obrigatórios' }, 400);
        }
        const res = await evolutionFetch(baseUrl, apiKey, `/group/create/${instanceName}`, {
          method: 'POST',
          body: {
            subject: payload.subject,
            description: payload.description || undefined,
            participants: payload.participants.map(toParticipantJid),
          },
        });
        if (!res.ok) return json({ error: `Evolution ${res.status}: ${res.text.slice(0, 300)}` }, 502);

        const mapped = mapGroup(res.json) || mapGroup(res.json?.groupInfo) || null;
        if (mapped) {
          await supabase.from('whatsapp_groups').upsert({
            organization_id: organizationId,
            whatsapp_instance_id: instance.id,
            group_jid: mapped.group_jid,
            name: mapped.name || payload.subject,
            description: mapped.description || payload.description || null,
            picture_url: mapped.picture_url,
            participant_count: mapped.participant_count,
            is_admin: true,
            participants: mapped.participants,
            raw: res.json,
            last_synced_at: new Date().toISOString(),
          }, { onConflict: 'organization_id,group_jid' });
        }
        return json({ ok: true, result: res.json });
      }

      case 'updateSubject': {
        if (!payload.groupJid || !payload.subject) return json({ error: 'groupJid e subject são obrigatórios' }, 400);
        const res = await evolutionFetch(
          baseUrl,
          apiKey,
          `/group/updateGroupSubject/${instanceName}?groupJid=${encodeURIComponent(payload.groupJid)}`,
          { method: 'POST', body: { subject: payload.subject } },
        );
        if (!res.ok) return json({ error: `Evolution ${res.status}: ${res.text.slice(0, 300)}` }, 502);
        await supabase.from('whatsapp_groups')
          .update({ name: payload.subject })
          .eq('organization_id', organizationId)
          .eq('group_jid', payload.groupJid);
        return json({ ok: true });
      }

      case 'updateDescription': {
        if (!payload.groupJid) return json({ error: 'groupJid é obrigatório' }, 400);
        const res = await evolutionFetch(
          baseUrl,
          apiKey,
          `/group/updateGroupDescription/${instanceName}?groupJid=${encodeURIComponent(payload.groupJid)}`,
          { method: 'POST', body: { description: payload.description || '' } },
        );
        if (!res.ok) return json({ error: `Evolution ${res.status}: ${res.text.slice(0, 300)}` }, 502);
        await supabase.from('whatsapp_groups')
          .update({ description: payload.description || null })
          .eq('organization_id', organizationId)
          .eq('group_jid', payload.groupJid);
        return json({ ok: true });
      }

      case 'updatePicture': {
        if (!payload.groupJid || !payload.image) return json({ error: 'groupJid e image são obrigatórios' }, 400);
        const res = await evolutionFetch(
          baseUrl,
          apiKey,
          `/group/updateGroupPicture/${instanceName}?groupJid=${encodeURIComponent(payload.groupJid)}`,
          { method: 'POST', body: { image: payload.image } },
        );
        if (!res.ok) return json({ error: `Evolution ${res.status}: ${res.text.slice(0, 300)}` }, 502);
        await supabase.from('whatsapp_groups')
          .update({ picture_url: payload.image })
          .eq('organization_id', organizationId)
          .eq('group_jid', payload.groupJid);
        return json({ ok: true });
      }

      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (error: any) {
    console.error('[zapi-groups] error:', error?.message || error);
    return json({ error: error?.message || 'Erro interno' }, 500);
  }
});
