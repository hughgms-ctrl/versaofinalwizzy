import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  resolveWhatsAppInstance,
  resolveWorkspaceInstanceBinding,
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
  // Número designado da operação. `instanceId` é o número do workspace aberto no
  // app; `workspaceId` serve para carimbar a linha e para resolver o número
  // quando o cliente não mandou o id. Sem isso caímos no fallback por
  // organização, que responde pelo primeiro número conectado da org — era assim
  // que a lista mostrava os grupos de OUTRO número.
  instanceId?: string | null;
  workspaceId?: string | null;
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

// Um mesmo grupo pode ser visto por dois números da mesma organização, então a
// chave real é (org, número, grupo). Enquanto a migration que troca a UNIQUE
// antiga (org, grupo) não for aplicada à mão, caímos de volta na chave antiga —
// aí o grupo compartilhado fica com o último número que sincronizou.
async function upsertGroups(
  supabase: any,
  rows: Record<string, unknown>[],
): Promise<{ error: any; legacyKey: boolean }> {
  if (!rows.length) return { error: null, legacyKey: false };

  const { error } = await supabase
    .from('whatsapp_groups')
    .upsert(rows, { onConflict: 'organization_id,whatsapp_instance_id,group_jid' });
  if (!error) return { error: null, legacyKey: false };

  const message = String(error.message || '');
  const missingConstraint = error.code === '42P10' || /no unique|exclusion constraint|constraint matching/i.test(message);
  if (!missingConstraint) return { error, legacyKey: false };

  console.warn('[zapi-groups] índice (org, instância, grupo) ausente; usando a chave antiga (org, grupo).');
  const { error: legacyError } = await supabase
    .from('whatsapp_groups')
    .upsert(rows, { onConflict: 'organization_id,group_jid' });
  return { error: legacyError, legacyKey: true };
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

    // Número designado: preferimos o id mandado pelo cliente (número do
    // workspace aberto), depois o número atrelado ao workspace. Só quando não há
    // workspace nenhum é que caímos no fallback por organização.
    let designatedInstanceId = payload.instanceId || null;
    let workspaceId: string | null = null;
    if (payload.workspaceId) {
      const binding = await resolveWorkspaceInstanceBinding(supabase, organizationId, payload.workspaceId);
      if (binding.blocked && !designatedInstanceId) {
        return json({
          error: 'Este workspace não tem um número de WhatsApp associado. Associe um número ao workspace para usar os grupos.',
        }, 400);
      }
      // Só carimbamos o workspace quando ele é da org e aponta para o número usado.
      if (binding.workspaceInstanceId) {
        if (!designatedInstanceId) designatedInstanceId = binding.workspaceInstanceId;
        if (binding.workspaceInstanceId === designatedInstanceId) workspaceId = payload.workspaceId;
      }
    }

    // list reads straight from the DB
    if (action === 'list') {
      let listQuery = supabase
        .from('whatsapp_groups')
        .select('*')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true });
      if (designatedInstanceId) listQuery = listQuery.eq('whatsapp_instance_id', designatedInstanceId);
      const { data: groups, error } = await listQuery;
      if (error) return json({ error: error.message }, 500);
      return json({ groups: groups || [] });
    }

    const instance = await resolveWhatsAppInstance(supabase, organizationId, designatedInstanceId);
    if (!instance) {
      return json({
        error: designatedInstanceId
          ? 'O número atrelado a este workspace não foi encontrado nesta organização.'
          : 'Nenhuma instância WhatsApp conectada',
      }, 404);
    }

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
        const mappedRows = list.map(mapGroup).filter(Boolean) as NonNullable<ReturnType<typeof mapGroup>>[];
        // O upsert em lote não aceita o mesmo group_jid duas vezes no mesmo
        // comando (ON CONFLICT não pode tocar a mesma linha 2x).
        const byJid = new Map<string, typeof mappedRows[number]>();
        for (const row of mappedRows) byJid.set(row.group_jid, row);
        const rows = [...byJid.values()];

        const nowIso = new Date().toISOString();
        const payloadRows = rows.map((row) => ({
          organization_id: organizationId,
          workspace_id: workspaceId,
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
        }));

        // Upsert em lote: o laço linha a linha estourava o tempo da função em
        // contas com muitos grupos e a lista ficava sem atualizar.
        const { error: upsertError, legacyKey } = await upsertGroups(supabase, payloadRows);
        if (upsertError) return json({ error: upsertError.message }, 500);

        // Só apagamos o que é DESTE número e não veio mais no fetch (grupo do
        // qual a instância saiu). O código antigo apagava tudo que fosse de
        // outra instância, então cada sincronização de um número zerava os
        // grupos dos outros workspaces.
        let removed = 0;
        const { data: stale } = await supabase
          .from('whatsapp_groups')
          .delete()
          .eq('organization_id', organizationId)
          .eq('whatsapp_instance_id', instance.id)
          .lt('last_synced_at', nowIso)
          .select('id');
        removed += stale?.length || 0;

        const { data: neverSynced } = await supabase
          .from('whatsapp_groups')
          .delete()
          .eq('organization_id', organizationId)
          .eq('whatsapp_instance_id', instance.id)
          .is('last_synced_at', null)
          .select('id');
        removed += neverSynced?.length || 0;

        // Linhas órfãs: o número que as sincronizou foi excluído (FK SET NULL),
        // então elas não pertencem a nenhum número e apareciam para todo mundo.
        const { data: orphans } = await supabase
          .from('whatsapp_groups')
          .delete()
          .eq('organization_id', organizationId)
          .is('whatsapp_instance_id', null)
          .select('id');
        removed += orphans?.length || 0;

        return json({
          ok: true,
          synced: payloadRows.length,
          total: rows.length,
          removed,
          instanceId: instance.id,
          legacyKey,
        });
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
          await upsertGroups(supabase, [{
            organization_id: organizationId,
            workspace_id: workspaceId,
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
          }]);
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
          .eq('whatsapp_instance_id', instance.id)
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
          .eq('whatsapp_instance_id', instance.id)
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
          .eq('whatsapp_instance_id', instance.id)
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
