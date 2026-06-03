import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeBaseUrl(value?: string | null): string {
  return (value || '').trim().replace(/\/+$/, '');
}

async function loadConnectionSettings(supabase: any) {
  const { data: row } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'whatsapp_connection_settings')
    .maybeSingle();
  const value = row?.value || {};
  return {
    uazapiBaseUrl: normalizeBaseUrl(value.uazapi_base_url || Deno.env.get('UAZAPI_BASE_URL')),
  };
}

function findLabelId(payload: any, tagName: string): string | null {
  const normalizedName = tagName.trim().toLowerCase();
  const candidates = Array.isArray(payload)
    ? payload
    : payload?.labels || payload?.data || payload?.result || payload?.response || [];
  const labels = Array.isArray(candidates) ? candidates : [];
  const label = labels.find((item: any) =>
    String(item?.name || item?.label || item?.title || '').trim().toLowerCase() === normalizedName
  );
  return label?.id || label?.labelid || label?.labelId || label?.jid || null;
}

async function fetchJson(endpoint: string, token: string, body?: Record<string, unknown>, method = 'POST') {
  const response = await fetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json', token },
    body: body ? JSON.stringify(body) : null,
  });
  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = raw; }
  return { ok: response.ok, status: response.status, data, raw };
}

async function ensureUazapiLabel(baseUrl: string, token: string, tagName: string, color: string): Promise<string | null> {
  const readCandidates = [
    { endpoint: `${baseUrl}/label/find`, method: 'GET' },
    { endpoint: `${baseUrl}/labels`, method: 'GET' },
    { endpoint: `${baseUrl}/label/list`, method: 'GET' },
  ];

  for (const candidate of readCandidates) {
    const result = await fetchJson(candidate.endpoint, token, undefined, candidate.method);
    if (result.ok) {
      const id = findLabelId(result.data, tagName);
      if (id) return id;
    }
  }

  const createCandidates = [
    { endpoint: `${baseUrl}/label/edit`, body: { name: tagName, color } },
    { endpoint: `${baseUrl}/label/create`, body: { name: tagName, color } },
    { endpoint: `${baseUrl}/labels`, body: { name: tagName, color } },
  ];

  for (const candidate of createCandidates) {
    const result = await fetchJson(candidate.endpoint, token, candidate.body);
    if (result.ok) {
      return result.data?.id || result.data?.labelid || result.data?.labelId || findLabelId(result.data, tagName);
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const respond = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return respond(401, { error: 'Unauthorized' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) return respond(401, { error: 'Unauthorized' });

    const { contactId, tagId } = await req.json();
    if (!contactId || !tagId) return respond(400, { error: 'contactId and tagId are required' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (!profile?.organization_id) return respond(403, { error: 'No organization' });

    const { data: contact } = await supabase
      .from('contacts')
      .select('id, phone, organization_id')
      .eq('id', contactId)
      .maybeSingle();
    const { data: tag } = await supabase
      .from('tags')
      .select('id, name, color, organization_id')
      .eq('id', tagId)
      .maybeSingle();

    if (!contact || !tag || contact.organization_id !== profile.organization_id || tag.organization_id !== profile.organization_id) {
      return respond(403, { error: 'Acesso negado' });
    }

    const { data: conversation } = await supabase
      .from('conversations')
      .select('whatsapp_instance_id')
      .eq('contact_id', contact.id)
      .eq('organization_id', profile.organization_id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    let instance = null;
    if (conversation?.whatsapp_instance_id) {
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('id', conversation.whatsapp_instance_id)
        .eq('organization_id', profile.organization_id)
        .maybeSingle();
      instance = data;
    }
    if (!instance) {
      const { data: instances } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .eq('status', 'connected')
        .limit(1);
      instance = instances?.[0];
    }

    if (!instance) return respond(200, { success: false, error: 'No connected instance' });
    const provider = instance.provider === 'evolution' ? 'evolution' : 'uazapi';
    if (provider !== 'uazapi') {
      return respond(200, {
        success: true,
        skipped: true,
        provider,
        message: 'Etiquetas do WhatsApp ainda nao implementadas para Evolution; evitando chamada UAZAPI indevida.',
      });
    }
    if (!instance.zapi_token) return respond(200, { success: false, error: 'No connected instance' });

    const settings = await loadConnectionSettings(supabase);
    if (!settings.uazapiBaseUrl) return respond(200, { success: false, error: 'UAZAPI_BASE_URL not configured' });

    const labelId = await ensureUazapiLabel(settings.uazapiBaseUrl, instance.zapi_token, tag.name, tag.color);
    if (!labelId) return respond(200, { success: false, error: 'Could not create/find WhatsApp label' });

    const number = String(contact.phone || '').replace(/\D/g, '');
    const applyResult = await fetchJson(`${settings.uazapiBaseUrl}/chat/labels`, instance.zapi_token, {
      number,
      labelids: [labelId],
    });

    if (!applyResult.ok) {
      return respond(200, {
        success: false,
        error: `WhatsApp label apply failed: ${applyResult.status}`,
        details: applyResult.raw,
      });
    }

    return respond(200, { success: true, labelId, data: applyResult.data });
  } catch (error) {
    console.error('zapi-contact-tags error:', error);
    return respond(500, { error: error instanceof Error ? error.message : String(error) });
  }
});
