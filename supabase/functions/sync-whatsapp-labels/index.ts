// ═══════════════════════════════════════════════════════════════════════════
// sync-whatsapp-labels — reconciliação de etiquetas do WhatsApp Business
// ═══════════════════════════════════════════════════════════════════════════
// O zapi-webhook trata LABELS_EDIT/LABELS_ASSOCIATION em tempo real, mas
// webhook perdido = drift silencioso, e etiquetas criadas ANTES do webhook
// nunca chegam por evento. Este job corrige as duas coisas:
//
//   1) Catálogo (sempre): GET /label/findLabels/{instance} na Evolution API →
//      upsert em whatsapp_labels + criação/vínculo da tag da org.
//   2) Associações (opcional): a Evolution NÃO tem endpoint que devolva as
//      etiquetas por chat; a fonte de verdade é a coluna "Chat"."labels"
//      (JSONB) do Postgres dela, mantida pelo Baileys via addLabel/removeLabel.
//      Se o secret EVOLUTION_DB_URL estiver configurado, lemos essa coluna e
//      reconciliamos contact_tags (inserindo como added_by_type='whatsapp' e
//      removendo apenas linhas 'whatsapp' — tag manual/flow/ai é intenção do
//      usuário no Wizzy e não é derrubada por reconciliação).
//
// Chamadas: cron diário (sem auth, com throttle de 30min via platform_job_runs),
// service role (sem throttle) ou usuário logado (restrito à própria org).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Client as PgClient } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const JOB_KEY = 'sync-whatsapp-labels';
const ANON_THROTTLE_MS = 30 * 60 * 1000;

const WHATSAPP_LABEL_COLORS = [
  '#FF9485', '#64C4FF', '#FFD429', '#DFAEF0', '#99B6C1',
  '#55CCB3', '#D3A91D', '#F74848', '#6D7CCE', '#8B6990',
  '#D1D451', '#00D0E2', '#FFC5C7', '#790611', '#00A62F',
  '#8FF6BB', '#C70362', '#0068C7', '#5A0A46', '#00DBDE',
];

function whatsappLabelColorToHex(color: unknown): string {
  const idx = Number(color);
  if (Number.isInteger(idx) && idx >= 0 && idx < WHATSAPP_LABEL_COLORS.length) {
    return WHATSAPP_LABEL_COLORS[idx];
  }
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return '#6366f1';
}

function normalizeBaseUrl(value?: string | null): string {
  return (value || '').trim().replace(/\/+$/, '');
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

// Listas internas do WhatsApp que o findLabels devolve misturadas com etiquetas
// reais (confirmado na v2.3.6 viva: Favoritos/Grupos/No lidas/Comunidades).
// Não viram tag — e mapeamentos antigos delas são limpos pelo stale-check.
const WHATSAPP_SYSTEM_LIST_NAMES = new Set([
  'favoritos', 'grupos', 'comunidades', 'nao lidas', 'no lidas',
  'favorites', 'groups', 'communities', 'unread',
]);

function isWhatsappSystemList(name: string): boolean {
  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return WHATSAPP_SYSTEM_LIST_NAMES.has(normalized);
}

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function loadConnectionSettings(supabase: any) {
  const { data: row } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'whatsapp_connection_settings')
    .maybeSingle();
  const value = row?.value || {};
  return {
    evolutionBaseUrl: normalizeBaseUrl(value.evolution_base_url || Deno.env.get('EVOLUTION_BASE_URL')),
    evolutionApiKey: value.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY') || '',
  };
}

// Variantes de dígitos de um telefone para casar remoteJid ↔ contacts.phone
// (com/sem 55, com/sem o 9 de celular BR). Mesma heurística do zapi-webhook.
function phoneKeyVariants(raw: string): string[] {
  const digits = String(raw).split('@')[0].split(':')[0].replace(/\D/g, '');
  if (!digits) return [];
  const variants = new Set<string>([digits]);
  const withLocal = (local: string) => {
    variants.add(local);
    variants.add(`55${local}`);
    if (local.length === 10) {
      variants.add(`${local.slice(0, 2)}9${local.slice(2)}`);
      variants.add(`55${local.slice(0, 2)}9${local.slice(2)}`);
    }
    if (local.length === 11 && local[2] === '9') {
      variants.add(`${local.slice(0, 2)}${local.slice(3)}`);
      variants.add(`55${local.slice(0, 2)}${local.slice(3)}`);
    }
  };
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    withLocal(digits.slice(2));
  } else if (digits.length === 10 || digits.length === 11) {
    withLocal(digits);
  }
  return Array.from(variants);
}

function parseChatLabels(value: unknown): string[] {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item: any) => {
      if (typeof item === 'string' || typeof item === 'number') return String(item);
      return String(item?.id ?? item?.labelId ?? '');
    })
    .filter(Boolean);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function ensureTagForLabel(supabase: any, organizationId: string, name: string, colorHex: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('tags')
    .select('id')
    .eq('organization_id', organizationId)
    .ilike('name', escapeLikePattern(name))
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: inserted, error } = await supabase
    .from('tags')
    .upsert(
      { organization_id: organizationId, name, color: colorHex },
      { onConflict: 'organization_id,name' },
    )
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[SYNC_LABELS] ensureTagForLabel failed:', error);
    return null;
  }
  return inserted?.id || null;
}

// ── 1) Catálogo de etiquetas da instância via Evolution API ──
async function syncInstanceCatalog(supabase: any, settings: any, instance: any) {
  const apiKey = instance.evolution_api_key || settings.evolutionApiKey || instance.zapi_token;
  const evoName = instance.evolution_instance_name || instance.zapi_instance_id;
  if (!settings.evolutionBaseUrl || !apiKey || !evoName) {
    return { instanceId: instance.id, success: false, error: 'evolution_not_configured' };
  }

  const response = await fetch(`${settings.evolutionBaseUrl}/label/findLabels/${evoName}`, {
    headers: { apikey: apiKey },
  }).catch((error) => {
    console.error('[SYNC_LABELS] findLabels fetch failed:', error);
    return null;
  });
  if (!response || !response.ok) {
    return { instanceId: instance.id, success: false, error: `findLabels_${response?.status || 'network'}` };
  }

  const body = await response.json().catch(() => null);
  const labels = Array.isArray(body) ? body : (Array.isArray(body?.labels) ? body.labels : []);

  const seen = new Set<string>();
  for (const label of labels) {
    const labelId = String(label?.labelId ?? label?.id ?? '').trim();
    const name = String(label?.name || '').trim();
    if (!labelId || !name) continue;
    seen.add(labelId);
    const tagId = await ensureTagForLabel(supabase, instance.organization_id, name, whatsappLabelColorToHex(label?.color));
    const { error } = await supabase.from('whatsapp_labels').upsert({
      organization_id: instance.organization_id,
      whatsapp_instance_id: instance.id,
      label_id: labelId,
      name,
      color: label?.color === null || label?.color === undefined ? null : String(label.color),
      tag_id: tagId,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'whatsapp_instance_id,label_id' });
    if (error) console.error('[SYNC_LABELS] whatsapp_labels upsert failed:', error);
  }

  // Mapeamentos que sumiram do catálogo = etiqueta apagada no WhatsApp.
  const { data: stale } = await supabase
    .from('whatsapp_labels')
    .select('id, label_id, tag_id')
    .eq('whatsapp_instance_id', instance.id)
    .is('deleted_at', null);
  for (const mapping of stale || []) {
    if (seen.has(mapping.label_id)) continue;
    await supabase
      .from('whatsapp_labels')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', mapping.id);
    if (mapping.tag_id) {
      const { data: rows } = await supabase
        .from('contact_tags')
        .select('id, contacts!inner(organization_id)')
        .eq('tag_id', mapping.tag_id)
        .eq('added_by_type', 'whatsapp')
        .eq('contacts.organization_id', instance.organization_id)
        .limit(1000);
      const ids = (rows || []).map((row: any) => row.id);
      if (ids.length) await supabase.from('contact_tags').delete().in('id', ids);
    }
  }

  return { instanceId: instance.id, success: true, labels: seen.size };
}

// ── 2) Associações chat↔etiqueta via Postgres da Evolution ──
async function fetchChatLabelsFromEvolutionDb(pg: PgClient, evoInstanceName: string): Promise<Map<string, string[]>> {
  const result = await pg.queryObject<{ jid: string; labels: unknown }>(
    `SELECT c."remoteJid" AS jid, c."labels" AS labels
     FROM "Chat" c
     JOIN "Instance" i ON i.id = c."instanceId"
     WHERE i.name = $1 AND c."labels" IS NOT NULL`,
    [evoInstanceName],
  );
  const map = new Map<string, string[]>();
  for (const row of result.rows) {
    const jid = String(row.jid || '');
    if (!jid || jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@newsletter')) continue;
    const labelIds = parseChatLabels(row.labels);
    if (labelIds.length) map.set(jid, labelIds);
  }
  return map;
}

// A maioria dos chats da Evolution usa remoteJid @lid (endereçamento anônimo,
// sem telefone — confirmado no banco vivo: ~85% dos chats). A tabela
// IsOnWhatsapp (global, sem instanceId) guarda o par lid ↔ jid de telefone.
// Precisa de GRANT SELECT pro usuário read-only; sem o grant, seguimos sem
// resolução de lid (chats @lid ficam de fora e são logados).
async function loadLidMap(pg: PgClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const result = await pg.queryObject<{ remoteJid: string; lid: string }>(
      `SELECT "remoteJid", lid FROM "IsOnWhatsapp" WHERE lid IS NOT NULL`,
    );
    for (const row of result.rows) {
      const lidDigits = String(row.lid || '').split('@')[0].replace(/\D/g, '');
      const phoneJid = String(row.remoteJid || '');
      if (lidDigits && phoneJid) map.set(lidDigits, phoneJid);
    }
  } catch (error) {
    console.warn('[SYNC_LABELS] IsOnWhatsapp unavailable (missing GRANT?); @lid chats will be skipped:', String(error).slice(0, 120));
  }
  return map;
}

async function loadOrgContactIndex(supabase: any, organizationId: string): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from('contacts')
      .select('id, phone')
      .eq('organization_id', organizationId)
      .range(from, from + pageSize - 1);
    if (error) {
      console.error('[SYNC_LABELS] contacts page failed:', error);
      break;
    }
    for (const contact of page || []) {
      for (const variant of phoneKeyVariants(contact.phone || '')) {
        if (!index.has(variant)) index.set(variant, contact.id);
      }
    }
    if (!page || page.length < pageSize) break;
  }
  return index;
}

async function reconcileOrgAssociations(
  supabase: any,
  pg: PgClient,
  organizationId: string,
  instances: any[],
  lidMap: Map<string, string>,
) {
  // labelId→tagId por instância (etiquetas vivas e mapeadas)
  const instanceMappings = new Map<string, Map<string, string>>();
  const mappedTagIds = new Set<string>();
  for (const instance of instances) {
    const { data: mappings } = await supabase
      .from('whatsapp_labels')
      .select('label_id, tag_id')
      .eq('whatsapp_instance_id', instance.id)
      .is('deleted_at', null)
      .not('tag_id', 'is', null);
    const byLabel = new Map<string, string>();
    for (const mapping of mappings || []) {
      byLabel.set(mapping.label_id, mapping.tag_id);
      mappedTagIds.add(mapping.tag_id);
    }
    instanceMappings.set(instance.id, byLabel);
  }
  if (!mappedTagIds.size) return { inserted: 0, removed: 0, chats: 0 };

  const contactIndex = await loadOrgContactIndex(supabase, organizationId);

  // Estado desejado: contato → tags que o WhatsApp diz que ele tem
  // (união entre as instâncias da org — mesmo tag em 2 números não some
  // quando só um deles tem a etiqueta).
  const desired = new Map<string, Set<string>>();
  let chatCount = 0;
  let unresolvedLids = 0;
  for (const instance of instances) {
    const evoName = instance.evolution_instance_name || instance.zapi_instance_id;
    const byLabel = instanceMappings.get(instance.id);
    if (!evoName || !byLabel?.size) continue;
    const chatLabels = await fetchChatLabelsFromEvolutionDb(pg, evoName);
    chatCount += chatLabels.size;
    for (const [jid, labelIds] of chatLabels) {
      // @lid não contém o telefone — resolve via IsOnWhatsapp (lid → jid real)
      let lookupJid = jid;
      if (jid.includes('@lid')) {
        const mapped = lidMap.get(jid.split('@')[0].replace(/\D/g, ''));
        if (!mapped) {
          unresolvedLids++;
          continue;
        }
        lookupJid = mapped;
      }
      let contactId: string | undefined;
      for (const variant of phoneKeyVariants(lookupJid)) {
        contactId = contactIndex.get(variant);
        if (contactId) break;
      }
      if (!contactId) continue;
      const tagSet = desired.get(contactId) || new Set<string>();
      for (const labelId of labelIds) {
        const tagId = byLabel.get(labelId);
        if (tagId) tagSet.add(tagId);
      }
      if (tagSet.size) desired.set(contactId, tagSet);
    }
  }

  // Estado atual no Wizzy (só das tags mapeadas desta org)
  const current: Array<{ id: string; contact_id: string; tag_id: string; added_by_type: string }> = [];
  const tagIdList = Array.from(mappedTagIds);
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from('contact_tags')
      .select('id, contact_id, tag_id, added_by_type, contacts!inner(organization_id)')
      .in('tag_id', tagIdList)
      .eq('contacts.organization_id', organizationId)
      .range(from, from + pageSize - 1);
    if (error) {
      console.error('[SYNC_LABELS] contact_tags page failed:', error);
      // Sem o estado atual completo não dá pra remover com segurança.
      return { inserted: 0, removed: 0, chats: chatCount, error: 'contact_tags_read_failed' };
    }
    for (const row of page || []) current.push(row);
    if (!page || page.length < pageSize) break;
  }

  const currentPairs = new Set(current.map((row) => `${row.contact_id}:${row.tag_id}`));

  const toInsert: Array<{ contact_id: string; tag_id: string; added_by: null; added_by_type: string }> = [];
  for (const [contactId, tagSet] of desired) {
    for (const tagId of tagSet) {
      if (!currentPairs.has(`${contactId}:${tagId}`)) {
        toInsert.push({ contact_id: contactId, tag_id: tagId, added_by: null, added_by_type: 'whatsapp' });
      }
    }
  }

  const toRemoveIds = current
    .filter((row) => row.added_by_type === 'whatsapp' && !desired.get(row.contact_id)?.has(row.tag_id))
    .map((row) => row.id);

  let inserted = 0;
  for (const batch of chunk(toInsert, 500)) {
    const { error } = await supabase
      .from('contact_tags')
      .upsert(batch, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true });
    if (error) console.error('[SYNC_LABELS] insert batch failed:', error);
    else inserted += batch.length;
  }

  let removed = 0;
  for (const batch of chunk(toRemoveIds, 500)) {
    const { error } = await supabase.from('contact_tags').delete().in('id', batch);
    if (error) console.error('[SYNC_LABELS] delete batch failed:', error);
    else removed += batch.length;
  }

  return { inserted, removed, chats: chatCount, unresolvedLids };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let bodyData: any = {};
    try { bodyData = await req.json(); } catch { /* corpo vazio ok (cron) */ }

    // ── Auth: service role > usuário (própria org) > anônimo/cron (throttle) ──
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    let mode: 'service' | 'user' | 'anon' = 'anon';
    let userOrgId: string | null = null;
    if (token && token === serviceRoleKey) {
      mode = 'service';
    } else if (token && token !== anonKey) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return respond({ error: 'Unauthorized' }, 401);
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userData.user.id)
        .maybeSingle();
      if (!profile?.organization_id) return respond({ error: 'No organization' }, 403);
      mode = 'user';
      userOrgId = profile.organization_id;
    }

    if (mode === 'anon') {
      const { data: jobRun } = await supabase
        .from('platform_job_runs')
        .select('last_run_at')
        .eq('job_key', JOB_KEY)
        .maybeSingle();
      if (jobRun?.last_run_at && Date.now() - new Date(jobRun.last_run_at).getTime() < ANON_THROTTLE_MS) {
        return respond({ success: false, throttled: true }, 429);
      }
      await supabase.from('platform_job_runs').upsert({ job_key: JOB_KEY, last_run_at: new Date().toISOString() });
    }

    const settings = await loadConnectionSettings(supabase);
    if (!settings.evolutionBaseUrl) {
      return respond({ success: false, error: 'evolution_base_url_not_configured' });
    }

    let instanceQuery = supabase
      .from('whatsapp_instances')
      .select('id, organization_id, provider, evolution_instance_name, evolution_api_key, zapi_instance_id, zapi_token, status')
      .eq('provider', 'evolution');
    if (mode === 'user') instanceQuery = instanceQuery.eq('organization_id', userOrgId);
    else if (bodyData.organizationId) instanceQuery = instanceQuery.eq('organization_id', bodyData.organizationId);
    if (bodyData.instanceId) instanceQuery = instanceQuery.eq('id', bodyData.instanceId);

    const { data: instances } = await instanceQuery;
    let targets = (instances || []).filter((instance: any) =>
      instance.evolution_instance_name || instance.zapi_instance_id);
    if (!targets.length) return respond({ success: true, message: 'no_evolution_instances' });

    // Reconciliação é por org (união das instâncias irmãs): sincronizar só uma
    // instância poderia remover associação legítima vinda de outro número da
    // mesma org. Com filtro por instanceId, expandimos para as irmãs.
    if (bodyData.instanceId) {
      const orgIds = Array.from(new Set(targets.map((instance: any) => instance.organization_id)));
      const { data: siblings } = await supabase
        .from('whatsapp_instances')
        .select('id, organization_id, provider, evolution_instance_name, evolution_api_key, zapi_instance_id, zapi_token, status')
        .eq('provider', 'evolution')
        .in('organization_id', orgIds);
      const expanded = (siblings || []).filter((instance: any) =>
        instance.evolution_instance_name || instance.zapi_instance_id);
      if (expanded.length) targets = expanded;
    }

    // ── 1) Catálogo por instância ──
    const catalogResults = [];
    for (const instance of targets) {
      catalogResults.push(await syncInstanceCatalog(supabase, settings, instance));
    }

    // ── 2) Associações por org (precisa do Postgres da Evolution) ──
    const evolutionDbUrl = Deno.env.get('EVOLUTION_DB_URL') || '';
    const associationResults: Record<string, unknown> = {};
    if (evolutionDbUrl) {
      const pg = new PgClient(evolutionDbUrl);
      try {
        await pg.connect();
        const lidMap = await loadLidMap(pg);
        const byOrg = new Map<string, any[]>();
        for (const instance of targets) {
          const list = byOrg.get(instance.organization_id) || [];
          list.push(instance);
          byOrg.set(instance.organization_id, list);
        }
        for (const [orgId, orgInstances] of byOrg) {
          try {
            associationResults[orgId] = await reconcileOrgAssociations(supabase, pg, orgId, orgInstances, lidMap);
          } catch (orgError) {
            console.error(`[SYNC_LABELS] org ${orgId} reconcile failed:`, orgError);
            associationResults[orgId] = { error: String(orgError) };
          }
        }
      } catch (pgError) {
        console.error('[SYNC_LABELS] Evolution DB connection failed:', pgError);
        associationResults.error = 'evolution_db_unreachable';
      } finally {
        try { await pg.end(); } catch { /* já fechado */ }
      }
    } else {
      associationResults.skipped = 'EVOLUTION_DB_URL not configured — catalog-only sync';
    }

    return respond({ success: true, mode, catalog: catalogResults, associations: associationResults });
  } catch (error) {
    console.error('[SYNC_LABELS] error:', error);
    return respond({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
