import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessError, assertActiveOrganizationAccess } from '../_shared/access.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DEFAULT_CALL_REJECT_MESSAGE = 'No momento não atendemos chamadas por WhatsApp. Envie uma mensagem de texto.';

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
    evolutionBaseUrl: normalizeBaseUrl(value.evolution_base_url || Deno.env.get('EVOLUTION_BASE_URL')),
    evolutionApiKey: value.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY') || '',
  };
}

// Monta o bloco de settings da Evolution a partir do que está salvo na instância.
// O /settings/set SUBSTITUI o conjunto inteiro, então precisamos reenviar todos os
// campos — mandar só rejectCall zeraria groupsIgnore/syncFullHistory.
function buildEvolutionSettings(instance: any, blockCalls: boolean, rejectMessage: string | null) {
  const saved = (instance?.provider_settings || {}) as Record<string, any>;
  return {
    rejectCall: blockCalls,
    // Com rejectCall=false a Evolution ignora msgCall; mandamos vazio para não
    // deixar texto pendurado numa instância que passou a aceitar ligação.
    msgCall: blockCalls ? (rejectMessage || DEFAULT_CALL_REJECT_MESSAGE) : '',
    groupsIgnore: saved.groupsIgnore ?? true,
    alwaysOnline: saved.alwaysOnline ?? false,
    readMessages: saved.readMessages ?? false,
    readStatus: saved.readStatus ?? false,
    syncFullHistory: saved.syncFullHistory ?? true,
  };
}

async function applyEvolutionSettings(
  instance: any,
  settings: Record<string, any>,
  evolutionBaseUrl: string,
  defaultApiKey: string,
) {
  const instanceName = instance.evolution_instance_name || instance.zapi_instance_id;
  const apiKey = instance.evolution_api_key || defaultApiKey || instance.zapi_token;
  if (!evolutionBaseUrl || !apiKey || !instanceName) {
    return { applied: false, error: 'Evolution API não configurada para esta instância' };
  }

  // Versões diferentes da Evolution aceitam o corpo cru ou embrulhado em
  // { settings }. Mesmo padrão de tentativa dupla usado no zapi-configure-webhook.
  const attempts = [settings, { settings }];
  let lastError = '';

  for (const body of attempts) {
    try {
      const response = await fetch(`${evolutionBaseUrl}/settings/set/${instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify(body),
      });
      const raw = await response.text();
      if (response.ok) {
        console.log(`[CALL_SETTINGS] Evolution ${instanceName} rejectCall=${settings.rejectCall}: ${raw.substring(0, 200)}`);
        return { applied: true };
      }
      lastError = `${response.status}: ${raw.substring(0, 300)}`;
    } catch (error) {
      lastError = String(error);
    }
  }

  return { applied: false, error: lastError || 'Falha ao aplicar settings na Evolution' };
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

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const instanceId = String(body.instanceId || '').trim();
    if (!instanceId) {
      return new Response(JSON.stringify({ error: 'instanceId é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', instanceId)
      .maybeSingle();

    if (!instance) {
      return new Response(JSON.stringify({ error: 'Instância não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await assertActiveOrganizationAccess(supabase, user.id, instance.organization_id, {
      module: 'integrations',
      requireManager: true,
    });

    const blockCalls = body.blockCalls === undefined ? instance.block_calls !== false : body.blockCalls !== false;
    const rawMessage = body.rejectMessage === undefined ? instance.call_reject_message : body.rejectMessage;
    const rejectMessage = rawMessage === null ? null : (String(rawMessage || '').trim() || null);

    const settings = buildEvolutionSettings(instance, blockCalls, rejectMessage);

    // Aplica no provedor ANTES de salvar: se a Evolution recusar, o banco não pode
    // dizer que a chamada passa enquanto o provedor continua cortando.
    let providerResult: { applied: boolean; error?: string } = { applied: false, error: 'provider_not_supported' };
    if (instance.provider === 'evolution') {
      const connection = await loadConnectionSettings(supabase);
      providerResult = await applyEvolutionSettings(instance, settings, connection.evolutionBaseUrl, connection.evolutionApiKey);
      if (!providerResult.applied) {
        return new Response(JSON.stringify({
          error: 'Não foi possível aplicar a configuração de chamadas no provedor.',
          details: providerResult.error,
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { error: updateError } = await supabase
      .from('whatsapp_instances')
      .update({
        block_calls: blockCalls,
        call_reject_message: rejectMessage,
        // provider_settings espelha o que foi enviado ao provedor; é dele que o
        // re-pareamento (zapi-get-qrcode) reconstrói a instância.
        provider_settings: { ...(instance.provider_settings || {}), ...settings },
      })
      .eq('id', instanceId);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({
      success: true,
      blockCalls,
      rejectMessage,
      providerApplied: providerResult.applied,
      provider: instance.provider,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.error('[CALL_SETTINGS] Error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
