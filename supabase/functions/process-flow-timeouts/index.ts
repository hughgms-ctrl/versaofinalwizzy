import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { moveConversationToPipeline } from '../_shared/pipelineMove.ts';
import { resumeFlow } from '../_shared/flowResume.ts';
import {
  MAX_EVOLUTION_REPLY_BUTTONS,
  evolutionButtonsAccepted,
  evolutionTargetFrom,
  sendEvolutionReplyButtons,
} from '../_shared/evolutionButtons.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Janela de espera após a última tentativa de follow-up, antes de rotear pela saída
 * "Não respondeu". Precisa ser generosa: os botões da última mensagem só funcionam
 * enquanto a execução continua parada no nó. O nó pode sobrescrever com
 * remarketingFinalWaitMinutes, ou desligar o roteamento com remarketingRouteOnTimeout.
 */
const DEFAULT_FINAL_WAIT_MINUTES = 1440; // 24h

/**
 * Rede de proteção: por quanto tempo uma execução pode ficar em 'running'.
 *
 * 'running' não é um estado de espera -- significa "o motor está executando
 * ISTO agora". O motor é o promise de background do flow-execute, e um isolate
 * de edge function não vive mais que poucos minutos: passado esse teto, uma
 * linha ainda em 'running' está provavelmente morta. Por isso o corte pode ser
 * generoso e mesmo assim nunca matar execução viva.
 *
 * A conta é assimétrica de propósito. Fechar uma execução que ainda estava viva
 * custa um fluxo interrompido no meio. Deixar uma zumbi aberta custa a conversa
 * INTEIRA daquele lead muda para sempre -- o webhook trata 'running' como fluxo
 * ativo, e nem campanha nem agente independente são consultados. O segundo é
 * muito pior, então na dúvida a gente fecha.
 */
const RUNNING_STUCK_MINUTES = Number(Deno.env.get('FLOW_RUNNING_STUCK_MINUTES') || '15');
// B7: com heartbeat por nó (flow-execute grava last_heartbeat_at a cada nó),
// uma execução 'running' sem batimento há 3 min está morta — nenhum nó leva
// isso. Execuções sem heartbeat (coluna nula: código antigo) continuam no
// corte conservador de started_at.
const HEARTBEAT_STUCK_MINUTES = Number(Deno.env.get('FLOW_HEARTBEAT_STUCK_MINUTES') || '3');

/**
 * CRITICAL SAFETY: Check if a contact responded AFTER the last follow-up message.
 * This MUST check after the LAST follow-up, NOT after execution start.
 * Reason: contacts often send messages BEFORE follow-ups begin (initial flow interaction),
 * which should NOT cancel the follow-up sequence.
 */
async function contactRespondedAfterLastFollowUp(
  supabase: any,
  conversationId: string,
  executionStartedAt: string
): Promise<boolean> {
  // FASE 3E: 1 query em vez de 2. Buscamos as mensagens posteriores ao início da
  // execução (janela recente) e computamos em memória, preservando a semântica.
  const { data: rows } = await supabase
    .from('messages')
    .select('created_at, is_from_bot, direction, metadata')
    .eq('conversation_id', conversationId)
    .gt('created_at', executionStartedAt)
    .order('created_at', { ascending: true });

  return computeRespondedAfterLastFollowUp(rows || [], executionStartedAt);
}

/**
 * Lógica pura (sem I/O) de `contactRespondedAfterLastFollowUp`, para reuso com
 * mensagens pré-carregadas em lote. `rows` já deve estar filtrado por
 * created_at > executionStartedAt.
 */
function computeRespondedAfterLastFollowUp(
  rows: any[],
  executionStartedAt: string
): boolean {
  const startMs = new Date(executionStartedAt).getTime();
  const relevant = rows.filter((m: any) => new Date(m.created_at).getTime() > startMs);

  // 1. Última mensagem de follow-up de remarketing enviada NESTA execução.
  let lastFollowUpMs: number | null = null;
  for (const m of relevant) {
    if (m.is_from_bot === true && (m.metadata?.source) === 'remarketing_followup') {
      const ms = new Date(m.created_at).getTime();
      if (lastFollowUpMs === null || ms > lastFollowUpMs) lastFollowUpMs = ms;
    }
  }

  // 2. Sem follow-up ainda (step 0): respondeu se houve INBOUND não-bot após o início.
  if (lastFollowUpMs === null) {
    return relevant.some((m: any) => m.is_from_bot === false && m.direction === 'inbound');
  }

  // 3. Respondeu se houve mensagem não-bot após o último follow-up desta execução.
  return relevant.some((m: any) => m.is_from_bot === false && new Date(m.created_at).getTime() > lastFollowUpMs!);
}

function getNowInSaoPauloHHMM(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function toMinutes(hhmm: string, fallback: string): number {
  const [h, m] = (hhmm || fallback).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) {
    const [fh, fm] = fallback.split(':').map(Number);
    return fh * 60 + fm;
  }
  return h * 60 + m;
}

function isWithinQuietHours(nowHHMM: string, quietStart: string, quietEnd: string): boolean {
  const nowMin = toMinutes(nowHHMM, '00:00');
  const startMin = toMinutes(quietStart, '22:00');
  const endMin = toMinutes(quietEnd, '08:00');

  if (startMin <= endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }

  // Overnight window (e.g. 19:00 -> 08:00)
  return nowMin >= startMin || nowMin < endMin;
}

function minutesUntilQuietEnd(nowHHMM: string, quietEnd: string): number {
  const nowMin = toMinutes(nowHHMM, '00:00');
  const endMin = toMinutes(quietEnd, '08:00');

  if (nowMin < endMin) {
    return endMin - nowMin;
  }

  return (24 * 60 - nowMin) + endMin;
}

type Provider = 'evolution' | 'uazapi';

function normalizeBaseUrl(value?: string | null): string {
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
  };
}

// Espelha replaceVariables de flow-execute. Antes esta versão só trocava as
// chaves que existiam em variables e deixava o resto literal, então o follow-up
// mandava "Olá {{name}}" para o cliente mesmo depois do motor já estar corrigido.
const VARIABLE_ALIASES: Record<string, string[]> = {
  name: ['nome'],
  nome: ['name'],
  phone: ['telefone'],
  telefone: ['phone'],
};

function lookupVariable(variables: Record<string, any>, varName: string): unknown {
  const direct = variables[varName];
  if (direct !== undefined && direct !== null && direct !== '') return direct;

  for (const alias of VARIABLE_ALIASES[varName] || []) {
    const value = variables[alias];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

// "Olá {{name}}, tudo bem?" sem nome viraria "Olá , tudo bem?". Só roda em linha
// que perdeu variável, para não reformatar texto escrito de propósito.
function tidyLineAfterEmptyVariable(line: string): string {
  return line
    .replace(/[ \t]+([,;:!?.])/g, '$1')
    .replace(/([,;:])\s*(?=[,;:])/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]*[,;:][ \t]*/, '')
    .replace(/[ \t]+$/, '')
    .replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}

function replaceVars(text: string, variables: Record<string, any> | null | undefined): string {
  const vars = variables || {};
  return (text || '').split('\n').map((line) => {
    let hasEmptyVariable = false;
    const replaced = line.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
      const value = lookupVariable(vars, varName);
      if (value === undefined) {
        hasEmptyVariable = true;
        return '';
      }
      return String(value);
    });

    return hasEmptyVariable ? tidyLineAfterEmptyVariable(replaced) : replaced;
  }).join('\n');
}

function getProvider(instance: any): Provider {
  if (instance?.provider === 'evolution' || instance?.evolution_instance_name || instance?.evolution_instance_id) {
    return 'evolution';
  }
  return 'uazapi';
}

function guessMimeType(type: string, mediaUrl?: string): string {
  const lower = (mediaUrl || '').toLowerCase();
  if (type === 'image') {
    if (lower.includes('.png')) return 'image/png';
    if (lower.includes('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
  if (type === 'audio') {
    if (lower.includes('.ogg')) return 'audio/ogg';
    if (lower.includes('.mpeg') || lower.includes('.mp3')) return 'audio/mpeg';
    if (lower.includes('.webm')) return 'audio/webm';
    return 'audio/mp4';
  }
  if (type === 'video') {
    if (lower.includes('.webm')) return 'video/webm';
    if (lower.includes('.3gp')) return 'video/3gpp';
    return 'video/mp4';
  }
  if (type === 'document') {
    if (lower.includes('.pdf')) return 'application/pdf';
    return 'application/octet-stream';
  }
  return 'application/octet-stream';
}

function fileNameFromUrl(mediaUrl?: string, fallback = 'arquivo') {
  if (!mediaUrl) return fallback;
  try {
    const pathname = new URL(mediaUrl).pathname;
    const name = pathname.split('/').filter(Boolean).pop();
    return name || fallback;
  } catch {
    return fallback;
  }
}

async function parseProviderMessageId(response: Response): Promise<string | null> {
  try {
    const result = await response.clone().json();
    return result?.messageId || result?.id || result?.ID || result?.key?.id || null;
  } catch {
    return null;
  }
}

async function loadConversationInstance(supabase: any, organizationId: string, conversationInstanceId?: string | null) {
  // Instância designada: única permitida, buscada sem filtro de status. Se não
  // existe, devolvemos null em vez de cair no primeiro número conectado da org.
  if (conversationInstanceId) {
    const { data } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', conversationInstanceId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    return data || null;
  }

  const { data } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'connected')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function sendFollowUpProviderMessage(params: {
  settings: Awaited<ReturnType<typeof loadConnectionSettings>>;
  instance: any;
  phone: string;
  messageText: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  buttons?: Array<{ id?: string; label: string }> | null;
}) {
  const { settings, instance, phone, messageText, mediaUrl } = params;
  const provider = getProvider(instance);
  const normalizedPhone = phone.replace(/\D/g, '');
  const mediaType = (params.mediaType || 'image') as 'image' | 'video' | 'audio' | 'document';
  const hasMedia = !!mediaUrl;

  // Quick-reply buttons: native on UAZAPI and Evolution (text-only, up to 3).
  // Sem caminho nativo, viram lista numerada no texto — mesma regra do flow-execute.
  const buttons = (params.buttons || []).filter((b) => (b?.label || '').trim());
  const buttonsText = buttons.length ? buttons.map((b, i) => `${i + 1}. ${b.label}`).join('\n') : '';
  const fallbackText = buttonsText ? `${messageText}\n\n${buttonsText}`.trim() : messageText;
  const canSendNativeButtons = buttons.length > 0 && buttons.length <= MAX_EVOLUTION_REPLY_BUTTONS && !hasMedia;

  if (provider === 'evolution') {
    const evolutionBaseUrl = settings.evolutionBaseUrl;
    const evolutionApiKey = instance.evolution_api_key || settings.evolutionApiKey || instance.zapi_token;
    const evolutionInstanceName = instance.evolution_instance_name || instance.zapi_instance_id || instance.evolution_instance_id;
    if (!evolutionBaseUrl || !evolutionApiKey || !evolutionInstanceName) {
      throw new Error('Evolution API not configured for follow-up');
    }

    if (hasMedia) {
      const body: Record<string, unknown> = mediaType === 'audio'
        ? { number: normalizedPhone, audio: mediaUrl, delay: 1000, linkPreview: true }
        : {
          number: normalizedPhone,
          mediatype: mediaType,
          mimetype: guessMimeType(mediaType, mediaUrl || undefined),
          caption: fallbackText || undefined,
          media: mediaUrl,
          fileName: fileNameFromUrl(mediaUrl || undefined, `${mediaType}-${Date.now()}`),
          delay: 1000,
          linkPreview: true,
        };
      const endpoint = mediaType === 'audio'
        ? `${evolutionBaseUrl}/message/sendWhatsAppAudio/${evolutionInstanceName}`
        : `${evolutionBaseUrl}/message/sendMedia/${evolutionInstanceName}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionApiKey },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Evolution media send failed: ${response.status} ${await response.text()}`);
      // Audio has no caption on Evolution — nothing but the media itself goes out.
      return { provider, zapiMessageId: await parseProviderMessageId(response), msgType: mediaType, sentText: mediaType === 'audio' ? '' : fallbackText, nativeButtons: false };
    }

    if (canSendNativeButtons) {
      try {
        // O id de cada botão é o próprio rótulo: o casamento da resposta do
        // follow-up é por rótulo, e alguns aparelhos devolvem só o id.
        const nativeResponse = await sendEvolutionReplyButtons(
          { baseUrl: evolutionBaseUrl, apiKey: evolutionApiKey, instanceName: evolutionInstanceName },
          {
            phone: normalizedPhone,
            text: messageText,
            buttons: buttons.map((b) => ({ id: b.label, label: b.label })),
          },
        );

        const accepted = await evolutionButtonsAccepted(nativeResponse);
        if (accepted.ok) {
          console.log('[FLOW TIMEOUTS] Native Evolution follow-up buttons sent successfully');
          // Native buttons render separately, so the saved text is just the message body.
          return { provider, zapiMessageId: await parseProviderMessageId(nativeResponse), msgType: 'text', sentText: messageText, nativeButtons: true };
        }
        console.log(`[FLOW TIMEOUTS] Native Evolution buttons failed (${accepted.detail}) — falling back to text`);
      } catch (nativeErr) {
        console.log(`[FLOW TIMEOUTS] Native Evolution buttons exception: ${nativeErr} — falling back to text`);
      }
    }

    const response = await fetch(`${evolutionBaseUrl}/message/sendText/${evolutionInstanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: evolutionApiKey },
      body: JSON.stringify({ number: normalizedPhone, text: fallbackText, delay: 1000, linkPreview: true }),
    });
    if (!response.ok) throw new Error(`Evolution text send failed: ${response.status} ${await response.text()}`);
    return { provider, zapiMessageId: await parseProviderMessageId(response), msgType: 'text', sentText: fallbackText, nativeButtons: false };
  }

  if (!settings.uazapiBaseUrl || !instance.zapi_token) {
    throw new Error('UAZAPI not configured for follow-up');
  }

  if (hasMedia) {
    const body: Record<string, unknown> = {
      number: normalizedPhone,
      file: mediaUrl,
      type: mediaType,
      mimetype: guessMimeType(mediaType, mediaUrl || undefined),
      mimeType: guessMimeType(mediaType, mediaUrl || undefined),
      fileName: fileNameFromUrl(mediaUrl || undefined, `${mediaType}-${Date.now()}`),
    };
    if (fallbackText) body.caption = fallbackText;
    if (mediaType === 'audio') body.ptt = true;
    const response = await fetch(`${settings.uazapiBaseUrl}/send/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: instance.zapi_token },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`UAZAPI media send failed: ${response.status} ${await response.text()}`);
    return { provider, zapiMessageId: await parseProviderMessageId(response), msgType: mediaType, sentText: fallbackText, nativeButtons: false };
  }

  if (canSendNativeButtons) {
    try {
      // /send/menu é o endpoint unificado da UAZAPI (button/list/poll). Cada opção
      // vai só com o rótulo: sem "|id" a UAZAPI usa o próprio texto como id, que é
      // exatamente o que o casamento da resposta do follow-up espera. O pipe é o
      // separador do formato, então some com ele no rótulo.
      const nativeResponse = await fetch(`${settings.uazapiBaseUrl}/send/menu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: instance.zapi_token },
        body: JSON.stringify({
          number: normalizedPhone,
          type: 'button',
          text: messageText,
          choices: buttons.map((b) => String(b.label || '').replace(/\|/g, '/')),
        }),
      });

      if (nativeResponse.ok) {
        const nativeResult = await nativeResponse.clone().json().catch(() => ({}));
        if (!nativeResult?.error) {
          console.log('[FLOW TIMEOUTS] Native follow-up buttons sent successfully');
          // Native buttons render separately, so the saved text is just the message body.
          return { provider, zapiMessageId: await parseProviderMessageId(nativeResponse), msgType: 'text', sentText: messageText, nativeButtons: true };
        }
        console.log(`[FLOW TIMEOUTS] Native buttons returned error: ${JSON.stringify(nativeResult)} — falling back to text`);
      } else {
        console.log(`[FLOW TIMEOUTS] Native buttons failed (${nativeResponse.status}): ${await nativeResponse.text()} — falling back to text`);
      }
    } catch (nativeErr) {
      console.log(`[FLOW TIMEOUTS] Native buttons exception: ${nativeErr} — falling back to text`);
    }
  }

  const response = await fetch(`${settings.uazapiBaseUrl}/send/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: instance.zapi_token },
    body: JSON.stringify({ number: normalizedPhone, text: fallbackText }),
  });
  if (!response.ok) throw new Error(`UAZAPI text send failed: ${response.status} ${await response.text()}`);
  return { provider, zapiMessageId: await parseProviderMessageId(response), msgType: 'text', sentText: fallbackText, nativeButtons: false };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const connectionSettings = await loadConnectionSettings(supabase);

    console.log('[FLOW TIMEOUTS] Checking for timed-out flow executions...');

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 0: REDE DE PROTEÇÃO — execuções presas em 'running'
    //
    // Independe de causa. O bug conhecido era o zapi-webhook fechar a execução
    // anterior como 'running' antes de retomar (corrigido), mas qualquer update
    // perdido produz o mesmo estrago: isolate morto no meio do fluxo, deploy que
    // derruba o worker, exceção fora do try. O sintoma é sempre o mesmo e é o
    // pior possível -- a conversa do lead fica muda, sem erro em lugar nenhum.
    //
    // Fechamos como 'failed' (não 'completed'): 'completed' mentiria dizendo que
    // o fluxo chegou ao fim, e o motivo em error_message é o que permite achar
    // essas linhas depois e distinguir zumbi de fim normal.
    //
    // NÃO mexemos em service_mode/ai_agent_id da conversa: não sabemos onde o
    // fluxo morreu nem o que ele já tinha configurado, e devolver a conversa
    // para 'ativo' na marra derrubaria um handoff de IA legítimo. Fechar a
    // execução já basta para destravar campanhas e agente independente.
    // ═══════════════════════════════════════════════════════════════════
    const runningCutoff = new Date(Date.now() - RUNNING_STUCK_MINUTES * 60 * 1000).toISOString();
    const heartbeatCutoff = new Date(Date.now() - HEARTBEAT_STUCK_MINUTES * 60 * 1000).toISOString();

    // Com heartbeat: sem batimento há HEARTBEAT_STUCK_MINUTES, ou sem batimento
    // nenhum e started_at além do corte antigo. Se a coluna ainda não existe
    // (migration 20260830140000 pendente), o PostgREST recusa o filtro e a
    // varredura cai para o critério antigo, só por started_at.
    let zombieExecs: any[] | null = null;
    let zombieErr: any = null;
    {
      const withHeartbeat = await supabase
        .from('flow_executions')
        .select('id, flow_id, conversation_id, current_node_id, started_at')
        .eq('status', 'running')
        .or(`last_heartbeat_at.lt.${heartbeatCutoff},and(last_heartbeat_at.is.null,started_at.lt.${runningCutoff})`)
        .limit(200);
      zombieExecs = withHeartbeat.data;
      zombieErr = withHeartbeat.error;
      if (zombieErr) {
        console.warn('[FLOW TIMEOUTS] Varredura com heartbeat indisponível, usando started_at:', zombieErr.message);
        const legacy = await supabase
          .from('flow_executions')
          .select('id, flow_id, conversation_id, current_node_id, started_at')
          .eq('status', 'running')
          .lt('started_at', runningCutoff)
          .limit(200);
        zombieExecs = legacy.data;
        zombieErr = legacy.error;
      }
    }

    if (zombieErr) {
      // Não aborta o cron: as outras fases continuam valendo.
      console.error('[FLOW TIMEOUTS] Zombie sweep query error:', zombieErr);
    }

    let zombiesClosed = 0;
    if (zombieExecs?.length) {
      for (const exec of zombieExecs) {
        const ageMin = Math.round((Date.now() - new Date(exec.started_at).getTime()) / 60000);
        console.warn(
          `[FLOW TIMEOUTS] Zumbi: execução ${exec.id} em 'running' há ${ageMin}min ` +
          `(flow=${exec.flow_id} conversa=${exec.conversation_id} nó=${exec.current_node_id || '-'}) — fechando como failed.`
        );
      }

      // Um update só para o lote. O filtro por status repete de propósito: se
      // alguma dessas linhas voltou a mexer entre o select e agora (execução
      // viva que acabou de terminar), ela não está mais em 'running' e o update
      // não a alcança -- em vez de sobrescrever um 'completed' legítimo.
      // Sem .select() aqui: o PostgREST reaplica o filtro por status na
      // representação devolvida, e como o patch tira a linha de 'running' o
      // retorno viria sempre vazio (mesma armadilha do claimScheduled,
      // 6f9f2bd4). A contagem real vem da releitura logo abaixo.
      const zombieIds = zombieExecs.map((e: any) => e.id);
      const { error: closeErr } = await supabase
        .from('flow_executions')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          timeout_at: null,
          error_message: `Execução presa em 'running' (sem heartbeat há ${HEARTBEAT_STUCK_MINUTES}min ou iniciada há mais de ${RUNNING_STUCK_MINUTES}min) — fechada pela rede de proteção do process-flow-timeouts.`,
        })
        .in('id', zombieIds)
        .eq('status', 'running');

      if (closeErr) {
        console.error('[FLOW TIMEOUTS] Zombie sweep update error:', closeErr);
      } else {
        // Todas estavam 'running' na seleção; as que agora estão 'failed' foram
        // fechadas por esta varredura.
        const { data: nowFailed } = await supabase
          .from('flow_executions')
          .select('id')
          .in('id', zombieIds)
          .eq('status', 'failed');
        zombiesClosed = nowFailed?.length || 0;
        console.log(`[FLOW TIMEOUTS] Rede de proteção fechou ${zombiesClosed} execução(ões) zumbi.`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1: AUTO-FIX — Find stuck executions (waiting_input, no timeout, step 0)
    // These are executions that should have had a timeout set but didn't
    // ═══════════════════════════════════════════════════════════════════
    const { data: stuckExecs } = await supabase
      .from('flow_executions')
      .select('id, current_node_id, flow_id, remarketing_step, started_at, conversation_id, flow:flows(nodes)')
      .eq('status', 'waiting_input')
      .is('timeout_at', null)
      .eq('remarketing_step', 0)
      .limit(20);

    let autoFixed = 0;
    for (const exec of (stuckExecs || [])) {
      const nodes = (exec.flow?.nodes || []) as any[];
      const node = nodes.find((n: any) => n.id === exec.current_node_id);
      const steps = node?.data?.remarketingSteps as any[] || [];
      
      if (steps.length > 0) {
        // SAFETY: Before auto-fixing, verify contact hasn't already responded
        const responded = await contactRespondedAfterLastFollowUp(
          supabase, exec.conversation_id, exec.started_at
        );
        
        if (responded) {
          // Contact responded — this execution should be completed, not fixed
          console.log(`[FLOW TIMEOUTS] Auto-fix skipped for exec ${exec.id}: contact already responded`);
          continue;
        }

        const firstStep = steps[0];
        const delayMs = (firstStep.delayMinutes || 1) * 60 * 1000;
        await supabase.from('flow_executions').update({
          timeout_at: new Date(Date.now() + delayMs).toISOString(),
        }).eq('id', exec.id);
        console.log(`[FLOW TIMEOUTS] Auto-fixed stuck exec ${exec.id}: timeout in ${firstStep.delayMinutes}min`);
        autoFixed++;
      }
    }
    if (autoFixed > 0) console.log(`[FLOW TIMEOUTS] Auto-fixed ${autoFixed} stuck executions.`);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1.5: RECOVERY — Catch-up old quiet-hours schedules that were pushed to the wrong day
    // (legacy bug for chat follow-up created during silent period)
    // ═══════════════════════════════════════════════════════════════════
    const nowIso = new Date().toISOString();
    const nowBR = getNowInSaoPauloHHMM();

    const { data: quietRecoveryCandidates } = await supabase
      .from('flow_executions')
      .select('id, started_at, timeout_at, variables')
      .eq('status', 'waiting_input')
      .eq('remarketing_step', 0)
      .not('timeout_at', 'is', null)
      .gt('timeout_at', nowIso)
      .eq('variables->>source', 'chat_follow_up')
      .eq('variables->>remarketingQuietHours', 'true')
      .limit(200);

    let recoveredFromQuietBug = 0;
    for (const exec of (quietRecoveryCandidates || [])) {
      const vars = (exec.variables || {}) as Record<string, any>;
      const steps = (vars.remarketingSteps as any[]) || [];
      if (!steps.length) continue;

      const quietStart = String(vars.remarketingQuietStart || '22:00');
      const quietEnd = String(vars.remarketingQuietEnd || '08:00');
      const isQuietNow = isWithinQuietHours(nowBR, quietStart, quietEnd);
      if (isQuietNow) continue;

      const firstDelayMinutes = Number(steps[0]?.delayMinutes || 1);
      const expectedFirstSendAtMs = new Date(exec.started_at).getTime() + firstDelayMinutes * 60 * 1000;

      if (expectedFirstSendAtMs <= Date.now()) {
        await supabase
          .from('flow_executions')
          .update({ timeout_at: new Date(Date.now() - 1000).toISOString() })
          .eq('id', exec.id);

        recoveredFromQuietBug++;
      }
    }

    if (recoveredFromQuietBug > 0) {
      console.log(`[FLOW TIMEOUTS] Recovered ${recoveredFromQuietBug} quiet-hours executions stuck in future schedule.`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1.8: SMART DELAY — retoma execuções paradas no "Atraso Inteligente"
    // O nó já gravou current_node_id como o PRÓXIMO nó; aqui só destravamos e
    // mandamos o motor seguir. Sem checagem de "respondeu": um atraso é uma
    // pausa programada, não uma espera por resposta do contato.
    // ═══════════════════════════════════════════════════════════════════
    const { data: delayedExecs } = await supabase
      .from('flow_executions')
      .select('id, flow_id, conversation_id, current_node_id, variables')
      .eq('status', 'waiting_delay')
      .not('timeout_at', 'is', null)
      .lt('timeout_at', nowIso)
      .limit(50);

    let delaysResumed = 0;
    for (const exec of (delayedExecs || [])) {
      try {
        if (!exec.current_node_id) {
          console.error(`[FLOW TIMEOUTS] Smart delay exec ${exec.id} has no current_node_id — completing`);
          await supabase.from('flow_executions').update({
            status: 'completed',
            timeout_at: null,
            completed_at: new Date().toISOString(),
            error_message: 'Smart delay without a resume node',
          }).eq('id', exec.id);
          continue;
        }

        // flow-execute SEMPRE cria uma execução nova (não reaproveita esta), então
        // encerramos a atual antes de chamar. Deixá-la aberta a manteria para
        // sempre como "fluxo ativo" e travaria os gatilhos da conversa.
        // Fechar ANTES da chamada também evita reprocessar a cada rodada do cron
        // caso o fetch falhe.
        await supabase.from('flow_executions').update({
          status: 'completed',
          timeout_at: null,
          completed_at: new Date().toISOString(),
        }).eq('id', exec.id);

        console.log(`[FLOW TIMEOUTS] Smart delay elapsed for exec ${exec.id} — resuming at node ${exec.current_node_id}`);

        await resumeFlow({
          flowId: exec.flow_id,
          conversationId: exec.conversation_id,
          startNodeId: exec.current_node_id,
          // Liga a execução nova à que acabou de fechar: as duas são a MESMA
          // passagem do contato pelo fluxo, só fatiada pela espera. Sem isso o
          // histórico mostraria cada trecho como uma entrada independente.
          resumedFromExecutionId: exec.id,
          // As variáveis acumuladas até aqui precisam atravessar a espera —
          // senão o trecho depois do atraso perde o que o fluxo já coletou.
          variables: exec.variables || {},
          reason: 'atraso inteligente vencido',
        });

        delaysResumed++;
      } catch (delayErr) {
        console.error(`[FLOW TIMEOUTS] Error resuming smart delay exec ${exec.id}:`, delayErr);
      }
    }
    if (delaysResumed > 0) console.log(`[FLOW TIMEOUTS] Resumed ${delaysResumed} smart-delay executions.`);

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2: Process timed-out executions (send follow-ups or route)
    // ═══════════════════════════════════════════════════════════════════
    const { data: timedOut, error } = await supabase
      .from('flow_executions')
      .select('id, flow_id, conversation_id, current_node_id, variables, remarketing_step, organization_id, started_at, flow:flows(nodes, edges, name)')
      .eq('status', 'waiting_input')
      .not('timeout_at', 'is', null)
      .lt('timeout_at', new Date().toISOString())
      .limit(50);

    if (error) {
      console.error('[FLOW TIMEOUTS] Query error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!timedOut || timedOut.length === 0) {
      console.log('[FLOW TIMEOUTS] No timed-out executions found.');
      return new Response(JSON.stringify({ success: true, processed: 0, autoFixed, recoveredFromQuietBug, delaysResumed }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[FLOW TIMEOUTS] Found ${timedOut.length} timed-out executions.`);
    let processed = 0;

    // ─── FASE 3E: pré-carga em lote (elimina o N+1 dentro do loop) ───────────
    const convIds = [...new Set(timedOut.map((e: any) => e.conversation_id).filter(Boolean))];

    const convById = new Map<string, any>();
    if (convIds.length) {
      const { data: convRows } = await supabase
        .from('conversations')
        .select('id, contact_id, organization_id, whatsapp_instance_id, service_mode, metadata')
        .in('id', convIds);
      for (const c of convRows || []) convById.set(c.id, c);
    }

    const contactById = new Map<string, any>();
    const contactIds = [...new Set([...convById.values()].map((c: any) => c.contact_id).filter(Boolean))];
    if (contactIds.length) {
      const { data: contactRows } = await supabase
        .from('contacts')
        // name entra aqui porque o follow-up resolve {{name}} na mensagem; sem a
        // coluna a variável nunca tinha valor e a chave crua ia para o cliente.
        .select('id, phone, name')
        .in('id', contactIds);
      for (const ct of contactRows || []) contactById.set(ct.id, ct);
    }

    // Instâncias conectadas das orgs envolvidas — resolvidas em memória.
    const orgIds = [...new Set([...convById.values()].map((c: any) => c.organization_id).filter(Boolean))];
    const connectedInstancesByOrg = new Map<string, any[]>();
    const instanceById = new Map<string, any>();
    if (orgIds.length) {
      // Sem filtro de status: a instância DESIGNADA da conversa precisa ser
      // encontrada mesmo caída/dessincronizada, senão o follow-up cairia no
      // fallback por organização e sairia pelo número de outro workspace.
      const { data: instRows } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .in('organization_id', orgIds)
        .order('updated_at', { ascending: false });
      for (const inst of instRows || []) {
        instanceById.set(inst.id, inst);
        if (inst.status !== 'connected') continue;
        if (!connectedInstancesByOrg.has(inst.organization_id)) connectedInstancesByOrg.set(inst.organization_id, []);
        connectedInstancesByOrg.get(inst.organization_id)!.push(inst);
      }
    }

    const resolveInstance = (organizationId: string, conversationInstanceId?: string | null) => {
      // Conversa com número próprio: é o ÚNICO permitido. Não achou (instância
      // apagada)? Falha — nunca substituímos pelo número de outro workspace.
      if (conversationInstanceId) {
        const inst = instanceById.get(conversationInstanceId);
        if (inst && inst.organization_id === organizationId) return inst;
        console.warn(
          `[FLOW TIMEOUTS] Instância designada ${conversationInstanceId} não encontrada na org ${organizationId}; ` +
          `follow-up não enviado (sem fallback para outro número).`,
        );
        return null;
      }
      return (connectedInstancesByOrg.get(organizationId) || [])[0] || null;
    };

    // Mensagens posteriores ao started_at mais antigo — uma query para o cálculo
    // de "contato respondeu" de todas as execuções (computeRespondedAfterLastFollowUp).
    const respondedRowsByConv = new Map<string, any[]>();
    const startedAts = timedOut.map((e: any) => e.started_at).filter(Boolean).sort();
    if (convIds.length && startedAts.length) {
      const { data: msgRows } = await supabase
        .from('messages')
        .select('conversation_id, created_at, is_from_bot, direction, metadata')
        .in('conversation_id', convIds)
        .gt('created_at', startedAts[0])
        .order('created_at', { ascending: true });
      for (const m of msgRows || []) {
        if (!respondedRowsByConv.has(m.conversation_id)) respondedRowsByConv.set(m.conversation_id, []);
        respondedRowsByConv.get(m.conversation_id)!.push(m);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    for (const exec of timedOut) {
      try {
        // ═══════════════════════════════════════════════════════════════
        // SAFETY CHECK 0: Is the AI paused or disabled for this conversation?
        // Chat follow-ups are AI-triggered actions — if the user paused/disabled
        // the AI, we MUST NOT keep sending automated follow-up messages.
        // ═══════════════════════════════════════════════════════════════
        const execVarsEarly = (exec.variables || {}) as Record<string, any>;
        const isChatFollowUpEarly = execVarsEarly.source === 'chat_follow_up';

        if (isChatFollowUpEarly) {
          const convCheck = convById.get(exec.conversation_id) || null;

          const pausedUntil = (convCheck?.metadata as any)?.ai_paused_until;
          const isPaused = pausedUntil === 'permanent' || (pausedUntil && new Date(pausedUntil).getTime() > Date.now());
          const aiDisabled = convCheck?.service_mode && convCheck.service_mode !== 'ia';

          if (isPaused || aiDisabled) {
            console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: AI is paused/disabled (service_mode=${convCheck?.service_mode}, paused=${isPaused}) — CANCELING chat follow-up`);
            await supabase.from('flow_executions').update({
              status: 'completed',
              timeout_at: null,
              remarketing_step: 0,
              completed_at: new Date().toISOString(),
              error_message: 'Cancelled: AI was paused or disabled by human agent',
            }).eq('id', exec.id);
            processed++;
            continue;
          }
        }

        // ═══════════════════════════════════════════════════════════════
        // SAFETY CHECK: Did the contact respond after the last follow-up?
        // This is the CRITICAL check that prevents sending follow-ups 
        // to contacts who already responded.
        // ═══════════════════════════════════════════════════════════════
        const responded = computeRespondedAfterLastFollowUp(
          respondedRowsByConv.get(exec.conversation_id) || [], exec.started_at
        );

        if (responded) {
          console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: contact responded after last follow-up — CANCELING remaining follow-ups`);
          
          // Route via 'responded' edge if available, otherwise complete
          const nodes = (exec.flow?.nodes || []) as any[];
          const edges = (exec.flow?.edges || []) as any[];
          const respondedEdge = edges.find((e: any) => e.source === exec.current_node_id && e.sourceHandle === 'responded');
          
          if (respondedEdge) {
            await supabase.from('flow_executions').update({
              status: 'running',
              current_node_id: respondedEdge.target,
              timeout_at: null,
              remarketing_step: 0,
            }).eq('id', exec.id);

            await resumeFlow({
              flowId: exec.flow_id,
              conversationId: exec.conversation_id,
              startNodeId: respondedEdge.target,
              // Mesma passagem do contato: sem as variáveis a retomada perde tudo que o
              // fluxo já coletou antes da espera.
              variables: exec.variables || {},
              reason: 'follow-up: contato respondeu',
            });
          } else {
            await supabase.from('flow_executions').update({
              status: 'completed',
              timeout_at: null,
              remarketing_step: 0,
              completed_at: new Date().toISOString(),
            }).eq('id', exec.id);
          }
          
          processed++;
          continue;
        }

        const nodes = (exec.flow?.nodes || []) as any[];
        const edges = (exec.flow?.edges || []) as any[];
        const currentNodeId = exec.current_node_id;
        const currentStep = exec.remarketing_step || 0;

        // Find the current node to check for remarketing steps
        const currentNode = nodes.find((n: any) => n.id === currentNodeId);
        // Chat follow-ups store steps in variables, flow nodes store in node data
        const execVars = (exec.variables || {}) as Record<string, any>;
        const isChatFollowUp = execVars.source === 'chat_follow_up';
        const remarketingSteps = isChatFollowUp
          ? (execVars.remarketingSteps as any[] || [])
          : (currentNode?.data?.remarketingSteps as any[] || []);

        // ═══════════════════════════════════════════════════════════════
        // QUIET HOURS: Pause sending during configured silent period
        // ═══════════════════════════════════════════════════════════════
        const quietHoursEnabled = isChatFollowUp
          ? (execVars.remarketingQuietHours === true)
          : (currentNode?.data?.remarketingQuietHours === true);
        if (quietHoursEnabled && remarketingSteps.length > 0 && currentStep < remarketingSteps.length) {
          const quietStart = String(isChatFollowUp ? (execVars.remarketingQuietStart || '22:00') : (currentNode?.data?.remarketingQuietStart || '22:00'));
          const quietEnd = String(isChatFollowUp ? (execVars.remarketingQuietEnd || '08:00') : (currentNode?.data?.remarketingQuietEnd || '08:00'));
          const nowBR = getNowInSaoPauloHHMM();

          if (isWithinQuietHours(nowBR, quietStart, quietEnd)) {
            const minutesToResume = Math.max(1, minutesUntilQuietEnd(nowBR, quietEnd));
            const resumeAt = new Date(Date.now() + minutesToResume * 60 * 1000);

            console.log(
              `[FLOW TIMEOUTS] Exec ${exec.id}: quiet hours active (${nowBR} in ${quietStart}-${quietEnd}). Rescheduling to ${resumeAt.toISOString()}`
            );

            await supabase.from('flow_executions').update({
              timeout_at: resumeAt.toISOString(),
            }).eq('id', exec.id);
            continue;
          }
        }

        // ═══════════════════════════════════════════════════════════════
        // SEND FOLLOW-UP or ROUTE via timeout edge
        // ═══════════════════════════════════════════════════════════════
        if (remarketingSteps.length > 0 && currentStep < remarketingSteps.length) {
          const step = remarketingSteps[currentStep];
          console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: sending remarketing step ${currentStep + 1}/${remarketingSteps.length}`);
          const stepHasContent = !!(step.message || step.mediaUrl || (step.buttons as any[])?.length);
          let followUpSent = !stepHasContent;

          if (stepHasContent) {
            const conv = convById.get(exec.conversation_id) || null;

            if (conv) {
              const contact = contactById.get(conv.contact_id) || null;

              const instance = resolveInstance(conv.organization_id, conv.whatsapp_instance_id);

              if (contact?.phone && instance) {
                // Execuções antigas gravaram variables vazio (o motor só passou a
                // semear name/phone depois), e o follow-up roda dias após o start.
                // Semear a partir do contato aqui conserta as que já estão na fila
                // sem depender do que foi gravado no disparo.
                const variables: Record<string, any> = { ...(exec.variables || {}) };
                if (!variables.name && contact.name?.trim()) variables.name = contact.name.trim();
                if (!variables.phone && contact.phone) variables.phone = contact.phone;

                const messageText = replaceVars(step.message || '', variables);

                const hasMedia = !!step.mediaUrl;
                const mediaType = step.mediaType || 'image';
                const stepButtons = ((step.buttons || []) as Array<{ id?: string; label: string }>)
                  .filter((b) => (b?.label || '').trim())
                  .map((b) => ({ ...b, label: replaceVars(b.label, variables) }));

                try {
                  console.log(`[FLOW TIMEOUTS] Sending follow-up via ${getProvider(instance)}: step=${currentStep + 1}, media=${hasMedia ? mediaType : 'none'}, buttons=${stepButtons.length}`);
                  const { provider, zapiMessageId, msgType, sentText, nativeButtons } = await sendFollowUpProviderMessage({
                    settings: connectionSettings,
                    instance,
                    phone: contact.phone,
                    messageText,
                    mediaUrl: step.mediaUrl,
                    mediaType,
                    buttons: stepButtons,
                  });

                  // Save to messages table
                  if (zapiMessageId || messageText || hasMedia || stepButtons.length) {
                    await supabase.from('messages').insert({
                      conversation_id: exec.conversation_id,
                      content: sentText || '',
                      type: msgType,
                      direction: 'outbound',
                      is_from_bot: true,
                      media_url: hasMedia ? step.mediaUrl : null,
                      zapi_message_id: zapiMessageId,
                      metadata: {
                        source: 'remarketing_followup',
                        remarketing_step: currentStep + 1,
                        flow_name: exec.flow?.name || null,
                        provider,
                        ...(stepButtons.length ? {
                          type: 'buttons',
                          native_buttons: nativeButtons,
                          buttons: stepButtons.map((b) => b.label),
                        } : {}),
                      },
                    });

                    await supabase.from('conversations').update({ 
                      last_message_at: new Date().toISOString() 
                    }).eq('id', exec.conversation_id);
                    followUpSent = true;

                    console.log(`[FLOW TIMEOUTS] ✅ Remarketing step ${currentStep + 1} sent for exec ${exec.id}`);
                  }
                } catch (sendErr) {
                  console.error(`[FLOW TIMEOUTS] Error sending follow-up message:`, sendErr);
                }
              } else {
                console.error(`[FLOW TIMEOUTS] Missing phone or instance for exec ${exec.id}`);
              }
            }
          }

          if (!followUpSent) {
            const retryAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
            await supabase.from('flow_executions').update({
              timeout_at: retryAt,
              error_message: 'Follow-up send failed; retry scheduled',
            }).eq('id', exec.id);
            console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: follow-up was not sent; retry scheduled at ${retryAt}`);
            processed++;
            continue;
          }

          // Schedule next step
          const nextStepIndex = currentStep + 1;
          let nextTimeoutAt: string | null = null;

          if (nextStepIndex < remarketingSteps.length) {
            const nextStep = remarketingSteps[nextStepIndex];
            const delayMs = nextStep.delayMinutes * 60 * 1000;
            nextTimeoutAt = new Date(Date.now() + delayMs).toISOString();
            console.log(`[FLOW TIMEOUTS] Next step ${nextStepIndex + 1} scheduled in ${nextStep.delayMinutes}min`);
          } else {
            // Última tentativa enviada. Rotear pelo timeout 1s depois matava os botões
            // dessa última mensagem: a execução saía do nó antes de o contato clicar,
            // e o clique não achava mais os remarketingSteps (cai no fluxo genérico).
            // Agora a janela de espera é configurável no nó, e pode ser desligada.
            const nodeDataForWait = isChatFollowUp ? execVars : (currentNode?.data || {});
            const routeOnTimeout = nodeDataForWait.remarketingRouteOnTimeout !== false;

            if (!routeOnTimeout) {
              nextTimeoutAt = null;
              console.log(`[FLOW TIMEOUTS] All ${remarketingSteps.length} steps sent — timeout routing OFF, waiting indefinitely for a reply`);
            } else {
              const configuredWait = Number(nodeDataForWait.remarketingFinalWaitMinutes);
              const waitMinutes = Number.isFinite(configuredWait) && configuredWait > 0
                ? configuredWait
                : DEFAULT_FINAL_WAIT_MINUTES;
              nextTimeoutAt = new Date(Date.now() + waitMinutes * 60 * 1000).toISOString();
              console.log(`[FLOW TIMEOUTS] All ${remarketingSteps.length} steps sent — waiting ${waitMinutes}min for a reply before the timeout edge`);
            }
          }

          await supabase.from('flow_executions').update({
            remarketing_step: nextStepIndex,
            timeout_at: nextTimeoutAt,
          }).eq('id', exec.id);

          processed++;
        } else {
          // All remarketing steps exhausted (or none configured) — route via timeout edge
          const timeoutEdge = edges.find((e: any) => e.source === currentNodeId && e.sourceHandle === 'timeout');

          if (timeoutEdge) {
            const nextNodeId = timeoutEdge.target;
            console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: all steps exhausted, routing via timeout edge to ${nextNodeId}`);

            await supabase.from('flow_executions').update({
              status: 'running',
              current_node_id: nextNodeId,
              timeout_at: null,
              remarketing_step: 0,
              variables: { ...(exec.variables || {}), _timeout: true },
            }).eq('id', exec.id);

            await resumeFlow({
              flowId: exec.flow_id,
              conversationId: exec.conversation_id,
              startNodeId: nextNodeId,
              variables: { ...(exec.variables || {}), _timeout: true },
              reason: 'follow-up esgotado, aresta timeout',
            });

            processed++;
          } else {
            // No timeout edge — complete the flow
            console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: no timeout edge, completing flow.`);
            await supabase.from('flow_executions').update({
              status: 'completed',
              timeout_at: null,
              remarketing_step: 0,
              completed_at: new Date().toISOString(),
            }).eq('id', exec.id);

            const { data: convData } = await supabase
              .from('conversations')
              .select('metadata')
              .eq('id', exec.conversation_id)
              .single();

            const cleanMeta = { ...(convData?.metadata || {}) };
            delete cleanMeta.ai_handoff_context;
            cleanMeta.flow_ended_at = new Date().toISOString();

            await supabase.from('conversations').update({
              service_mode: 'ativo',
              ai_agent_id: null,
              metadata: cleanMeta,
            }).eq('id', exec.conversation_id);

            // ═══════════════════════════════════════════════════════════════
            // PIPELINE MOVE: Move conversation when follow-up exhausted
            // ═══════════════════════════════════════════════════════════════
            const execVarsMove = (exec.variables || {}) as Record<string, any>;
            const movePipelineId = execVarsMove.movePipelineId;
            const moveColumnId = execVarsMove.moveColumnId;

            if (movePipelineId && moveColumnId) {
              console.log(`[FLOW TIMEOUTS] Exec ${exec.id}: moving conversation to pipeline ${movePipelineId} column ${moveColumnId}`);
              
              const { fromColumnId, error: moveError } = await moveConversationToPipeline(
                supabase, exec.conversation_id, movePipelineId, moveColumnId,
              );
              if (moveError) console.error(`[FLOW TIMEOUTS] Exec ${exec.id}: move error:`, moveError);

              // Log stage change
              await supabase.from('conversation_stage_history').insert({
                conversation_id: exec.conversation_id,
                pipeline_id: movePipelineId,
                from_column_id: fromColumnId,
                to_column_id: moveColumnId,
                changed_by_type: 'followup_exhausted',
                organization_id: exec.organization_id,
              });

              console.log(`[FLOW TIMEOUTS] ✅ Conversation moved after follow-up exhaustion`);
            }

            processed++;
          }
        }
      } catch (execError) {
        console.error(`[FLOW TIMEOUTS] Error processing exec ${exec.id}:`, execError);
      }
    }

    console.log(`[FLOW TIMEOUTS] ✅ Processed ${processed} executions, auto-fixed ${autoFixed}, recovered ${recoveredFromQuietBug}, delays resumed ${delaysResumed}, zombies closed ${zombiesClosed}.`);

    return new Response(JSON.stringify({ success: true, processed, autoFixed, recoveredFromQuietBug, delaysResumed, zombiesClosed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[FLOW TIMEOUTS] Fatal error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
