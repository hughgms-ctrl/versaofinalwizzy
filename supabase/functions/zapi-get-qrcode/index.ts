import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function extractQr(data: Record<string, any> | null): string | null {
  if (!data) return null;
  return (
    data?.qrcode?.base64 ||
    data?.qrcode?.code ||
    data.qrcode ||
    data.qr ||
    data.value ||
    data.base64 ||
    data.code ||
    data?.instance?.qrcode ||
    data?.data?.qrcode ||
    data?.data?.qr ||
    null
  );
}

function normalizeBaseUrl(value?: string | null) {
  return (value || '').trim().replace(/\/$/, '');
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
    evolutionBaseUrl: normalizeBaseUrl(value.evolution_base_url || Deno.env.get('EVOLUTION_BASE_URL')),
    evolutionApiKey: value.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY') || '',
    webhookUrl: String(value.webhook_url || `${Deno.env.get('SUPABASE_URL')}/functions/v1/zapi-webhook`).trim(),
  };
}

// Mesmas configurações usadas em zapi-create-instance, para recriar a instância
// idêntica ao re-parear.
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

// Re-pareamento "do zero" de uma instância Evolution: apaga a instância no
// servidor e recria com o MESMO nome. Necessário porque o ciclo logout→connect
// deixa a sessão Baileys "open" mas SURDA a mensagens recebidas (não re-registra
// o listener de messages.upsert) — e nem reconfigurar webhook nem /instance/restart
// curam isso; só uma criação limpa. Mantém o nome, então o registro no banco, os
// workspaces e as conversas continuam válidos. Retorna o QR para reparear.
async function repairEvolutionInstance(
  evolutionBaseUrl: string,
  apiKey: string,
  instanceName: string,
  webhookUrl: string,
): Promise<{ qrCode: string | null; instanceApiKey: string | null }> {
  // 1) Apaga a instância no servidor (best-effort: pode não existir / estar logada).
  try {
    const delResp = await fetch(`${evolutionBaseUrl}/instance/delete/${instanceName}`, {
      method: 'DELETE',
      headers: { apikey: apiKey },
    });
    console.log(`[REPAIR] delete ${instanceName}: ${delResp.status}`);
  } catch (e) {
    console.warn(`[REPAIR] delete failed (continuing): ${String(e)}`);
  }

  // 2) Recria limpa com o mesmo nome (idêntico ao zapi-create-instance).
  const createBody = {
    instanceName,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
    ...defaultProviderSettings(),
    webhook: {
      url: webhookUrl,
      byEvents: false,
      base64: true,
      webhookByEvents: false,
      webhookBase64: true,
      events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'PRESENCE_UPDATE'],
    },
  };

  const createResp = await fetch(`${evolutionBaseUrl}/instance/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify(createBody),
  });
  const createRaw = await createResp.text();
  if (!createResp.ok && createResp.status !== 409) {
    throw new Error(`Evolution create falhou (${createResp.status}): ${createRaw}`);
  }

  let payload: any = {};
  try { payload = createRaw ? JSON.parse(createRaw) : {}; } catch (_) {}
  const hash = payload.hash || payload.data?.hash || {};
  const instanceApiKey = hash.apikey || payload.instance?.apikey || null;
  let qrCode = extractQr(payload);

  // 3) Se o create não trouxe QR, busca via connect.
  if (!qrCode) {
    try {
      const connectResp = await fetch(`${evolutionBaseUrl}/instance/connect/${instanceName}`, {
        method: 'GET',
        headers: { apikey: apiKey },
      });
      if (connectResp.ok) {
        const connectPayload = await connectResp.json().catch(() => ({}));
        qrCode = extractQr(connectPayload);
      }
    } catch (e) {
      console.warn(`[REPAIR] connect after create failed: ${String(e)}`);
    }
  }

  return { qrCode, instanceApiKey };
}

// Reconfigura o webhook da instância no provedor. O logout (zapi-disconnect)
// derruba a sessão e o webhook configurado se perde; ao reconectar precisamos
// reaplicá-lo ANTES do pareamento, senão a Evolution não tem para onde enviar
// MESSAGES_UPSERT/CONNECTION_UPDATE e a instância "conecta" mas não recebe nem
// confirma envios. Best-effort: nunca bloqueia a geração do QR.
async function ensureWebhookConfigured(
  supabaseUrl: string,
  serviceRoleKey: string,
  instance: any,
): Promise<void> {
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/zapi-configure-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        organization_id: instance.organization_id,
        instanceId: instance.id,
      }),
    });
    const text = await resp.text().catch(() => '');
    console.log(`[DEBUG] Webhook reconfig (instance ${instance.id}): ${resp.status} ${text.substring(0, 200)}`);
  } catch (e) {
    console.error(`[DEBUG] Webhook reconfig failed for instance ${instance.id}:`, e);
  }
}

function isPayloadConnected(payload: any): boolean {
  const state = String(
    payload?.state ??
    payload?.status ??
    payload?.instance?.state ??
    payload?.instance?.status ??
    payload?.data?.state ??
    payload?.data?.status ??
    ''
  ).toLowerCase();
  return (
    payload?.connected === true ||
    payload?.instance?.connected === true ||
    payload?.data?.connected === true ||
    state === 'connected' ||
    state === 'open' ||
    state === 'online' ||
    payload?.loggedIn === true ||
    payload?.instance?.loggedIn === true
  );
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
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const connectionSettings = await loadConnectionSettings(supabase);

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

    // Get instanceId / forceRepair from query or body
    let requestedInstanceId: string | null = new URL(req.url).searchParams.get('instanceId');
    let forceRepair = new URL(req.url).searchParams.get('forceRepair') === 'true';
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        requestedInstanceId = requestedInstanceId || body.instanceId || null;
        if (body.forceRepair === true) forceRepair = true;
      } catch { /* no body */ }
    }

    // Find instance
    let instance;
    if (requestedInstanceId) {
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('id', requestedInstanceId)
        .eq('organization_id', profile.organization_id)
        .maybeSingle();
      instance = data;
    } else {
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      instance = data;
    }

    if (!instance) {
      return new Response(JSON.stringify({ error: 'No instance found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!instance.zapi_token) {
      return new Response(JSON.stringify({ error: 'Instance not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const provider = instance.provider || 'uazapi';

    // Self-heal da API key: a Evolution usa uma key global (do servidor). Cada
    // instância guarda uma cópia em `evolution_api_key` carimbada na criação. Se
    // a key global muda, essa cópia fica velha e o ENVIO (zapi-send-message) e a
    // configuração de webhook (zapi-configure-webhook) — que priorizam a key da
    // instância — passam a falhar com 401, MESMO o connect/QR funcionando (ele
    // usa a key global). Ressincronizamos a cópia ANTES de reconfigurar o webhook
    // para que tudo passe a usar a key correta.
    if (
      provider === 'evolution' &&
      connectionSettings.evolutionApiKey &&
      instance.evolution_api_key !== connectionSettings.evolutionApiKey
    ) {
      await supabase
        .from('whatsapp_instances')
        .update({ evolution_api_key: connectionSettings.evolutionApiKey })
        .eq('id', instance.id);
      instance.evolution_api_key = connectionSettings.evolutionApiKey;
      console.log(`[DEBUG] Synced stale evolution_api_key from global settings for instance ${instance.id}`);
    }

    // Reaplica o webhook ANTES de (re)conectar. Sem isso, após um logout a
    // instância reconecta mas para de receber mensagens e de confirmar envios
    // (webhook drift). É idempotente, então rodar sempre é seguro. Roda depois do
    // self-heal da key para que o configure-webhook use a key correta.
    await ensureWebhookConfigured(supabaseUrl, supabaseKey, instance);

    if (provider === 'evolution') {
      const evolutionBaseUrl = connectionSettings.evolutionBaseUrl;
      const evolutionApiKey = connectionSettings.evolutionApiKey;
      const instanceName = instance.evolution_instance_name || instance.zapi_instance_id;

      if (!evolutionBaseUrl || !evolutionApiKey || !instanceName) {
        return new Response(JSON.stringify({ error: 'Evolution API not configured' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Re-pareamento "do zero": apaga e recria a instância (mesmo nome). Usado
      // quando a instância conecta mas ficou SURDA a mensagens recebidas — estado
      // que o connect/restart não cura. Força um QR novo para reparear limpo.
      if (forceRepair) {
        console.log(`[REPAIR] Forcing fresh re-pair for Evolution instance ${instanceName}`);
        try {
          const { qrCode, instanceApiKey } = await repairEvolutionInstance(
            evolutionBaseUrl,
            evolutionApiKey,
            instanceName,
            connectionSettings.webhookUrl,
          );

          await supabase
            .from('whatsapp_instances')
            .update({
              status: 'connecting',
              is_active: true,
              connected_at: null,
              disconnected_at: null,
              // Mantém a key da instância sincronizada com a global; só sobrescreve
              // se a recriação devolveu uma key própria nova.
              ...(instanceApiKey ? { evolution_api_key: instanceApiKey } : { evolution_api_key: evolutionApiKey }),
            })
            .eq('id', instance.id);

          if (!qrCode) {
            return new Response(JSON.stringify({
              error: 'No QR code available',
              note: 'Instância recriada, mas o QR ainda não ficou pronto. Tente novamente em instantes.',
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          return new Response(JSON.stringify({
            qrCode,
            connected: false,
            instanceId: instance.id,
            provider,
            repaired: true,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (e) {
          console.error('[REPAIR] Failed:', e);
          return new Response(JSON.stringify({
            error: 'Falha ao re-parear a instância Evolution',
            details: String(e),
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      console.log(`[DEBUG] Connecting Evolution instance ${instanceName}`);
      const connectResp = await fetch(`${evolutionBaseUrl}/instance/connect/${instanceName}`, {
        method: 'GET',
        headers: { apikey: evolutionApiKey },
      });
      const connectRaw = await connectResp.text();

      if (!connectResp.ok) {
        return new Response(JSON.stringify({
          error: 'Failed to connect Evolution instance',
          code: connectResp.status,
          details: connectRaw,
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let connectData: any = {};
      try { connectData = connectRaw ? JSON.parse(connectRaw) : {}; } catch (_) {}

      if (isPayloadConnected(connectData)) {
        await supabase
          .from('whatsapp_instances')
          .update({
            status: 'connected',
            is_active: true,
            connected_at: new Date().toISOString(),
            disconnected_at: null,
          })
          .eq('id', instance.id);

        return new Response(JSON.stringify({ connected: true, instanceId: instance.id, provider }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const qrCode = extractQr(connectData);
      if (!qrCode) {
        return new Response(JSON.stringify({
          error: 'No QR code available',
          details: connectData,
          note: 'A instância Evolution pode estar inicializando. Tente novamente em instantes.',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase
        .from('whatsapp_instances')
        .update({ status: 'connecting', is_active: true })
        .eq('id', instance.id);

      return new Response(JSON.stringify({
        qrCode,
        connected: false,
        instanceId: instance.id,
        provider,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Call /instance/connect with the instance token
    console.log(`[DEBUG] Connecting instance ${instance.id} via ${connectionSettings.uazapiBaseUrl}/instance/connect`);

    const connectResp = await fetch(`${connectionSettings.uazapiBaseUrl}/instance/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: instance.zapi_token,
      },
    });

    const connectRaw = await connectResp.text();
    console.log(`Connect response: ${connectResp.status}`, connectRaw.substring(0, 300));

    if (!connectResp.ok) {
      return new Response(JSON.stringify({
        error: 'Failed to connect instance',
        code: connectResp.status,
        details: connectRaw,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let connectData;
    try {
      connectData = JSON.parse(connectRaw);
    } catch {
      connectData = {};
    }

    const isConnected = isPayloadConnected(connectData);

    if (isConnected) {
      await supabase
        .from('whatsapp_instances')
        .update({
          status: 'connected',
          is_active: true,
          connected_at: new Date().toISOString(),
          disconnected_at: null,
        })
        .eq('id', instance.id);

      return new Response(JSON.stringify({ connected: true, instanceId: instance.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Extract QR code from connect response
    let qrCode = extractQr(connectData);

    // Step 3: If no QR in connect response, try dedicated QR endpoints
    if (!qrCode) {
      console.log('No QR in connect response, trying /instance/qr');
      const qrEndpoints = ['/instance/qr', '/instance/qrcode'];

      for (const endpoint of qrEndpoints) {
        if (qrCode) break;
        try {
            const qrResp = await fetch(`${connectionSettings.uazapiBaseUrl}${endpoint}`, {
            method: 'GET',
            headers: { token: instance.zapi_token },
          });
          if (qrResp.ok) {
            const qrRaw = await qrResp.text();
            console.log(`${endpoint} response:`, qrRaw.substring(0, 200));
            try {
              const qrData = JSON.parse(qrRaw);
              qrCode = extractQr(qrData);
            } catch {
              // Maybe it's raw base64/text QR
              if (qrRaw.length > 50 && !qrRaw.startsWith('{')) {
                qrCode = qrRaw.trim();
              }
            }
          }
        } catch (e) {
          console.log(`${endpoint} failed:`, e);
        }
      }
    }

    if (!qrCode) {
      console.error('[DEBUG] No QR code found in connectData or dedicated endpoints. Full connectData:', JSON.stringify(connectData));
      return new Response(JSON.stringify({
        error: 'No QR code available',
        details: connectData,
        note: 'A instância pode estar inicializando. Tente recarregar a página em instantes.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update instance status
    await supabase
      .from('whatsapp_instances')
      .update({ status: 'connecting', is_active: true })
      .eq('id', instance.id);

    return new Response(JSON.stringify({
      qrCode,
      connected: false,
      instanceId: instance.id,
      provider,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', message: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
