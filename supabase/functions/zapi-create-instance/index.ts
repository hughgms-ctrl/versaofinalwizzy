import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type Provider = 'evolution' | 'uazapi';

function normalizeBaseUrl(value?: string | null) {
  return (value || '').trim().replace(/\/$/, '');
}

function defaultProviderSettings() {
  return {
    rejectCall: true,
    msgCall: 'No momento não atendemos chamadas por WhatsApp. Envie uma mensagem de texto.',
    groupsIgnore: true,
    alwaysOnline: false,
    readMessages: false,
    readStatus: false,
    syncFullHistory: true,
  };
}

function extractInstances(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.instances)) return payload.instances;
  return [];
}

function extractQr(data: any): string | null {
  return (
    data?.qrcode?.base64 ||
    data?.qrcode?.code ||
    data?.qrcode ||
    data?.qr ||
    data?.base64 ||
    data?.code ||
    data?.instance?.qrcode ||
    data?.data?.qrcode ||
    data?.data?.qr ||
    null
  );
}

async function loadWhatsAppPlatformConfig(supabase: any, supabaseUrl: string) {
  const { data: settingsRows } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', ['whatsapp_provider_strategy', 'whatsapp_connection_settings']);

  const strategy = (settingsRows || []).find((s: any) => s.key === 'whatsapp_provider_strategy')?.value || {};
  const connection = (settingsRows || []).find((s: any) => s.key === 'whatsapp_connection_settings')?.value || {};

  const primary = (strategy.primary_provider || 'evolution') as Provider;
  const backup = (strategy.backup_provider || 'uazapi') as Provider;
  const evolutionEnabled = strategy.evolution_enabled ?? true;
  const uazapiEnabled = strategy.uazapi_enabled ?? true;
  const provider: Provider =
    primary === 'evolution' && evolutionEnabled ? 'evolution' :
    primary === 'uazapi' && uazapiEnabled ? 'uazapi' :
    backup === 'evolution' && evolutionEnabled ? 'evolution' :
    backup === 'uazapi' && uazapiEnabled ? 'uazapi' :
    'evolution';

  return {
    provider,
    webhookUrl: String(connection.webhook_url || `${supabaseUrl}/functions/v1/zapi-webhook`).trim(),
    uazapiBaseUrl: normalizeBaseUrl(connection.uazapi_base_url || Deno.env.get('UAZAPI_BASE_URL')),
    uazapiAdminToken: connection.uazapi_admin_token || Deno.env.get('UAZAPI_ADMIN_TOKEN') || '',
    evolutionBaseUrl: normalizeBaseUrl(connection.evolution_base_url || Deno.env.get('EVOLUTION_BASE_URL')),
    evolutionApiKey: connection.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY') || '',
  };
}

async function createUazapiInstance(config: any, instanceName: string) {
  if (!config.uazapiBaseUrl || !config.uazapiAdminToken) {
    throw new Error('UAZAPI não configurada no painel admin');
  }

  let endpoint = '/instance/init';
  let response = await fetch(`${config.uazapiBaseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', admintoken: config.uazapiAdminToken },
    body: JSON.stringify({ name: instanceName }),
  });

  if (response.status === 404) {
    endpoint = '/instance/create';
    response = await fetch(`${config.uazapiBaseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', admintoken: config.uazapiAdminToken },
      body: JSON.stringify({ name: instanceName }),
    });
  }

  const raw = await response.text();
  if (!response.ok && response.status !== 409) {
    throw new Error(`Falha ao criar instância UAZAPI: ${raw}`);
  }

  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch (_) {}

  const data = payload.instance || payload.data || payload;
  let externalId = data.id || data.name || data.instanceId || instanceName;
  let token = payload.token || data.token || data.key;

  if (response.status === 409 || !token) {
    const listResp = await fetch(`${config.uazapiBaseUrl}/instance/list`, {
      headers: { admintoken: config.uazapiAdminToken },
    });
    if (listResp.ok) {
      const listPayload = await listResp.json();
      const matched = extractInstances(listPayload).find((i: any) =>
        i.name === instanceName || i.instanceName === instanceName || i.id === externalId
      );
      if (matched) {
        token = matched.token || matched.key || matched.instanceToken;
        externalId = matched.id || matched.name || externalId;
      }
    }
  }

  if (!token) throw new Error('UAZAPI não retornou token da instância');

  await fetch(`${config.uazapiBaseUrl}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify({ url: config.webhookUrl, enabled: true }),
  }).catch((err) => console.error('UAZAPI webhook config error:', err));

  return { externalId, token, qrCode: null };
}

async function createEvolutionInstance(config: any, instanceName: string) {
  if (!config.evolutionBaseUrl || !config.evolutionApiKey) {
    throw new Error('Evolution API não configurada no painel admin');
  }

  const settings = defaultProviderSettings();
  const body = {
    instanceName,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
    ...settings,
    webhook: {
      url: config.webhookUrl,
      byEvents: false,
      base64: true,
      webhookByEvents: false,
      webhookBase64: true,
      events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'PRESENCE_UPDATE'],
    },
  };

  const response = await fetch(`${config.evolutionBaseUrl}/instance/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.evolutionApiKey },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  if (!response.ok && response.status !== 409) {
    throw new Error(`Falha ao criar instância Evolution: ${raw}`);
  }

  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch (_) {}

  const instance = payload.instance || payload.data?.instance || payload.data || payload;
  const hash = payload.hash || payload.data?.hash || {};
  const externalId = instance.instanceId || instance.id || instance.name || instanceName;
  const instanceApiKey = hash.apikey || instance.apikey || config.evolutionApiKey;
  let qrCode = extractQr(payload);

  if (!qrCode) {
    try {
      const connectResp = await fetch(`${config.evolutionBaseUrl}/instance/connect/${instanceName}`, {
        method: 'GET',
        headers: { apikey: config.evolutionApiKey },
      });
      if (connectResp.ok) {
        const connectPayload = await connectResp.json();
        qrCode = extractQr(connectPayload);
      }
    } catch (err) {
      console.error('Evolution QR fetch after create failed:', err);
    }
  }

  return { externalId, token: instanceApiKey, qrCode };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: orgPlan } = await supabase
      .from('organization_plans')
      .select('plan:platform_plans(features)')
      .eq('organization_id', profile.organization_id)
      .maybeSingle();

    const maxWhatsappNumbers = Number((orgPlan as any)?.plan?.features?.limits?.max_whatsapp_numbers || 0);
    if (maxWhatsappNumbers > 0) {
      const { data: currentInstances, error: countError } = await supabase
        .from('whatsapp_instances')
        .select('id, status, phone_number, zapi_instance_id, zapi_token, evolution_instance_name, evolution_instance_id, evolution_api_key')
        .eq('organization_id', profile.organization_id);

      if (countError) throw countError;
      const currentWhatsappNumbers = (currentInstances || []).filter((instance: any) => (
        instance.status === 'connected' ||
        instance.phone_number ||
        instance.zapi_instance_id ||
        instance.zapi_token ||
        instance.evolution_instance_name ||
        instance.evolution_instance_id ||
        instance.evolution_api_key
      )).length;
      if (currentWhatsappNumbers >= maxWhatsappNumbers) {
        return new Response(JSON.stringify({
          error: `Limite de números WhatsApp atingido neste plano (${currentWhatsappNumbers}/${maxWhatsappNumbers}). Faça upgrade para conectar mais números.`,
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const config = await loadWhatsAppPlatformConfig(supabase, supabaseUrl);
    const provider = config.provider;
    const settings = defaultProviderSettings();
    const instanceName = `wizzy-${provider}-${profile.organization_id.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`;
    const label = body.label || `Número ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    const created = provider === 'evolution'
      ? await createEvolutionInstance(config, instanceName)
      : await createUazapiInstance(config, instanceName);

    const insertPayload: Record<string, any> = {
      organization_id: profile.organization_id,
      provider,
      zapi_instance_id: created.externalId || instanceName,
      zapi_token: created.token,
      status: 'pending',
      label,
      is_active: false,
      provider_settings: settings,
    };

    if (provider === 'evolution') {
      insertPayload.evolution_instance_name = instanceName;
      insertPayload.evolution_instance_id = created.externalId;
      insertPayload.evolution_api_key = created.token;
    }

    const { data: newInstance, error: insertError } = await supabase
      .from('whatsapp_instances')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: 'Failed to create instance', details: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      provider,
      instanceId: newInstance.id,
      externalInstanceId: created.externalId,
      status: 'pending',
      qrCode: created.qrCode,
      settings,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error', details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
