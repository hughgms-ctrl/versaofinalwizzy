import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveWhatsAppInstance, resolveWorkspaceInstanceBinding, sendWhatsAppMessage } from '../_shared/whatsappProvider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// MODOS DE EXECUÇÃO
//
// 1) Modo job (normal): o cron despacha UM http_post por agendamento vencido —
//    no máximo um por organização — e cada invocação recebe { scheduled_id } e
//    cuida só daquele disparo. É isso que permite N orgs enviarem em paralelo:
//    o delay antibloqueio de uma org deixa de consumir o tempo das outras.
//
// 2) Modo varredura (compatibilidade): invocação SEM scheduled_id processa a
//    fila em série, como antes. Existe para o caso de a migration do cron ainda
//    não ter subido quando esta função subir — sem ela, o cron antigo (que posta
//    body vazio) pararia de enviar qualquer coisa. Também serve para disparo
//    manual da função. Não é o caminho normal.
// ============================================================================

// Orçamento de tempo do modo job. Edge Functions têm limite de wall-clock na
// casa dos ~400s; ficamos bem abaixo de propósito — o resume via
// scheduled_message_contacts já garante que nada se perde entre execuções, e
// orçamento curto significa lock liberado mais cedo se a função morrer.
const MAX_RUN_MS_JOB = 240_000;

// Orçamento do modo varredura: precisa caber na janela de 1 minuto do cron.
const MAX_RUN_MS_SCAN = 50_000;

// Uma linha 'processing' mais antiga que isto é considerada lock órfão (a função
// morreu no meio) e pode ser retomada. Um job saudável renova updated_at a cada
// HEARTBEAT_MS, então nunca é confundido com órfão por mais longo que seja.
// Precisa ser IGUAL ao intervalo usado pelo dispatcher no cron.
const STALE_LOCK_MS = 3 * 60_000;

// Frequência com que o job em andamento renova o lock.
const HEARTBEAT_MS = 30_000;

// Quantos contatos pendentes buscar por página dentro do lote.
const CONTACT_PAGE_SIZE = 25;

// Timeout do fetch para flow-execute. Fluxo é síncrono e pode ser longo, mas
// sem teto uma chamada pendurada trava o job até o lock expirar.
const FLOW_TIMEOUT_MS = 120_000;

interface ScheduledMessage {
  id: string;
  name: string | null;
  organization_id: string;
  workspace_id: string | null;
  content_type: 'message' | 'flow';
  message_content: string | null;
  media_url: string | null;
  media_type: string | null;
  flow_id: string | null;
  target_type: 'single' | 'tag' | 'manual' | 'group' | 'groups';
  contact_id: string | null;
  tag_id: string | null;
  group_jids: string[] | null;
  recurrence_type: string;
  recurrence_end_at: string | null;
  scheduled_at: string;
  next_execution_at: string | null;
  execution_count: number;
  // Envio em lotes (opcional). batch_size_max null/0 = desligado.
  batch_size_max: number | null;
  batch_pause_minutes: number | null;
  batch_current_target: number | null;
  batch_sent_count: number | null;
  batch_paused_until: string | null;
  // Progresso por JID no envio para grupos (ver sendMessageToGroups).
  group_progress: Record<string, GroupProgressEntry> | null;
  // Retrato congelado da última execução (ver buildRunSummary).
  last_run_summary: Record<string, unknown> | null;
}

interface GroupProgressEntry {
  status: 'sent' | 'failed';
  error?: string;
}

interface Contact {
  id: string;
  name: string | null;
  phone: string;
  organization_id: string;
}

async function resolveScheduledInstance(
  supabase: any,
  scheduled: ScheduledMessage,
): Promise<{ instance: any; blocked: boolean }> {
  const binding = await resolveWorkspaceInstanceBinding(
    supabase,
    scheduled.organization_id,
    scheduled.workspace_id,
  );

  // Workspace sem número associado: não enviamos por outro número da org.
  if (binding.blocked) {
    return { instance: null, blocked: true };
  }

  const instance = await resolveWhatsAppInstance(
    supabase,
    scheduled.organization_id,
    binding.workspaceInstanceId,
  );
  return { instance, blocked: false };
}

const WORKSPACE_WITHOUT_NUMBER_ERROR =
  'Workspace sem número de WhatsApp conectado. Conecte um número ao workspace para enviar mensagens.';

// Folga na comparação do carimbo do claim (ver claimScheduled): cobre a defasagem
// de relógio entre a edge function e o Postgres. Curta de propósito — tem que ser
// bem menor que HEARTBEAT_MS, senão o carimbo recente de OUTRO worker caberia na
// janela e dois workers processariam o mesmo job. Perder um claim custa 3 min de
// espera; assumir um lock alheio custa envio duplicado.
const CLAIM_STAMP_TOLERANCE_MS = 5_000;

/**
 * Lock atômico: assume o agendamento em UM único UPDATE cuja cláusula WHERE
 * carrega a regra inteira (está pendente OU o lock está órfão). Dois workers
 * que corram pelo mesmo job serializam no lock de linha do Postgres e o segundo
 * reavalia o WHERE contra a versão nova — encontrando 0 linhas. Sem isso, um
 * despacho duplicado do cron viraria envio duplicado.
 *
 * A pausa entre lotes entra na condição de propósito: o dispatcher já filtra por
 * ela, mas quem garante a cadência do número é este UPDATE. Assim uma invocação
 * manual não fura a pausa antibloqueio.
 *
 * ATENÇÃO — por que existe o passo 2 (reconferência):
 * o WHERE deste UPDATE filtra exatamente as colunas que o próprio UPDATE escreve
 * (status e updated_at). O PostgREST aplica o filtro TAMBÉM na representação que
 * devolve, e a linha já gravada não casa mais com nenhum dos dois ramos — então
 * `data` volta VAZIO mesmo com a gravação tendo acontecido, e sem erro nenhum.
 * Confiar só no retorno fazia o job ser marcado 'processing' e nunca ser
 * processado: travava em 'processing' até o lock vencer, era re-clamado, travava
 * de novo — disparo parado sem uma única linha de erro no log.
 *
 * Retorna a linha JÁ ATUALIZADA (batch_*, group_progress etc. frescos) ou null.
 */
async function claimScheduled(supabase: any, scheduledId: string): Promise<ScheduledMessage | null> {
  const claimStartedAt = Date.now();
  const now = new Date(claimStartedAt).toISOString();
  const staleBefore = new Date(claimStartedAt - STALE_LOCK_MS).toISOString();

  // Passo 1: o UPDATE condicional — quem de fato serializa dois workers.
  const { data, error } = await supabase
    .from('scheduled_messages')
    .update({ status: 'processing', updated_at: now })
    .eq('id', scheduledId)
    .or(
      `and(status.eq.pending,or(batch_paused_until.is.null,batch_paused_until.lte.${now})),` +
      `and(status.eq.processing,updated_at.lt.${staleBefore})`,
    )
    .select('*');

  if (error) {
    console.error(`[scheduled ${scheduledId}] claim failed:`, error);
    return null;
  }

  if (data && data[0]) return data[0];

  // Passo 2: sem representação. Ou o UPDATE não casou (outro worker chegou antes,
  // pausa ainda vigente) ou casou e o PostgREST filtrou a linha de volta. Uma
  // releitura decide: se a linha está 'processing' com carimbo desta chamada, o
  // lock é nosso. Carimbo mais velho = de outro worker; não assumimos.
  const { data: row, error: reReadError } = await supabase
    .from('scheduled_messages')
    .select('*')
    .eq('id', scheduledId)
    .maybeSingle();

  if (reReadError) {
    console.error(`[scheduled ${scheduledId}] claim re-read failed:`, reReadError);
    return null;
  }
  if (!row || row.status !== 'processing') return null;

  // O trigger update_updated_at_column sobrescreve updated_at com o now() da
  // transação, então comparamos por janela, não por igualdade.
  const stampedAt = Date.parse(row.updated_at);
  if (!Number.isFinite(stampedAt) || stampedAt < claimStartedAt - CLAIM_STAMP_TOLERANCE_MS) {
    // Carimbo de outro worker (ou defasagem de relógio maior que a tolerância).
    // Logamos porque, se isto se repetir sempre para o mesmo job, o sintoma é
    // exatamente o do incidente de 17/08: disparo parado sem erro nenhum.
    console.warn(
      `[scheduled ${scheduledId}] claim não assumido: updated_at=${row.updated_at} ` +
      `(claim iniciado em ${new Date(claimStartedAt).toISOString()})`,
    );
    return null;
  }

  console.warn(`[scheduled ${scheduledId}] claim sem representação do PostgREST; assumido pela releitura`);
  return row as ScheduledMessage;
}

/**
 * Renova o lock enquanto o job roda. Sem isto, um job legítimo mais longo que
 * STALE_LOCK_MS seria tratado como órfão e um segundo worker o pegaria,
 * reenviando para quem ainda estivesse pendente.
 *
 * O filtro por status='processing' faz o heartbeat virar no-op assim que o job
 * termina, então uma corrida com o update final não desfaz nada.
 */
function startHeartbeat(supabase: any, scheduledId: string): () => void {
  const timer = setInterval(() => {
    supabase
      .from('scheduled_messages')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', scheduledId)
      .eq('status', 'processing')
      .then(
        ({ error }: any) => { if (error) console.error(`[scheduled ${scheduledId}] heartbeat error:`, error); },
        (err: any) => console.error(`[scheduled ${scheduledId}] heartbeat threw:`, err),
      );
  }, HEARTBEAT_MS);

  return () => clearInterval(timer);
}

type JobOutcome = 'processed' | 'partial' | 'failed';

/**
 * Executa UM agendamento já lockado, até terminar ou até o orçamento de tempo.
 * Devolve o job para 'pending' quando parou no meio — o cron retoma no próximo
 * minuto usando o progresso persistido.
 */
async function runScheduledJob(
  supabase: any,
  scheduled: ScheduledMessage,
  deadlineAt: number,
): Promise<JobOutcome> {
  try {
    // Grupos: envio direto para os JIDs, sem contato/conversa.
    if (scheduled.target_type === 'group' || scheduled.target_type === 'groups') {
      const groups = await sendMessageToGroups(supabase, scheduled, deadlineAt);
      if (!groups.done) {
        await supabase.from('scheduled_messages').update({ status: 'pending' }).eq('id', scheduled.id);
        return 'partial';
      }
      return await finalizeGroups(supabase, scheduled);
    }

    // Contatos (single/tag/manual): materializa o progresso em
    // scheduled_message_contacts (se ainda não existir) e processa em lote.
    await ensureProgressRows(supabase, scheduled);

    const batch = await processContactCampaign(supabase, scheduled, deadlineAt);

    if (batch.done) {
      // Terminou a campanha inteira: finaliza (ou reprograma recorrência).
      return await finalizeCampaign(supabase, scheduled);
    }

    // Ainda há contatos pendentes (ou o lote entrou em pausa): devolve para
    // 'pending' para o cron retomar (mantém next_execution_at atual).
    await supabase.from('scheduled_messages').update({ status: 'pending' }).eq('id', scheduled.id);
    return 'partial';
  } catch (err: any) {
    console.error(`Error processing scheduled message ${scheduled.id}:`, err);
    await supabase
      .from('scheduled_messages')
      .update({
        status: 'failed',
        error_message: err?.message || 'Erro ao processar',
      })
      .eq('id', scheduled.id);
    return 'failed';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const scheduledId: string | null = body?.scheduled_id || body?.scheduledId || null;

    // ---------- Modo job: uma invocação dedicada a um agendamento ----------
    if (scheduledId) {
      const scheduled = await claimScheduled(supabase, scheduledId);
      if (!scheduled) {
        // Já está sendo processado por outro worker, ou mudou de status entre
        // o despacho e a chegada. Não é erro.
        return new Response(
          JSON.stringify({ message: 'Skipped (not claimable)', scheduled_id: scheduledId }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const stopHeartbeat = startHeartbeat(supabase, scheduled.id);
      try {
        const outcome = await runScheduledJob(supabase, scheduled, Date.now() + MAX_RUN_MS_JOB);
        return new Response(
          JSON.stringify({ message: 'Processing complete', scheduled_id: scheduled.id, outcome }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      } finally {
        stopHeartbeat();
      }
    }

    // ---------- Modo varredura: compatibilidade com o cron antigo ----------
    const startedAt = Date.now();
    const deadlineAt = startedAt + MAX_RUN_MS_SCAN;
    const now = new Date().toISOString();
    const staleBefore = new Date(Date.now() - STALE_LOCK_MS).toISOString();

    const { data: scheduledMessages, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select('id')
      .or(
        // Pendente e vencido, E fora de pausa entre lotes (sem pausa ou já expirada).
        `and(status.eq.pending,next_execution_at.lte.${now},or(batch_paused_until.is.null,batch_paused_until.lte.${now})),` +
        `and(status.eq.processing,updated_at.lt.${staleBefore})`,
      )
      .order('next_execution_at', { ascending: true })
      .limit(50);

    if (fetchError) throw fetchError;

    if (!scheduledMessages || scheduledMessages.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No scheduled messages to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let processed = 0;
    let failed = 0;

    for (const row of scheduledMessages as Array<{ id: string }>) {
      if (Date.now() > deadlineAt) break;

      const scheduled = await claimScheduled(supabase, row.id);
      if (!scheduled) continue;

      const stopHeartbeat = startHeartbeat(supabase, scheduled.id);
      try {
        const outcome = await runScheduledJob(supabase, scheduled, deadlineAt);
        if (outcome === 'failed') failed++; else processed++;
      } finally {
        stopHeartbeat();
      }
    }

    // Achou trabalho e não conseguiu tocar em nada: com um cron de um chamador só,
    // isso não é disputa entre workers — é o claim falhando. Grita no log, porque
    // no incidente de 17/08 este exato estado (total>0, processed=0, failed=0) foi
    // a única pista de que o disparo estava morto.
    if (scheduledMessages.length > 0 && processed === 0 && failed === 0) {
      console.error(
        `[scheduled] ${scheduledMessages.length} agendamento(s) vencido(s) e nenhum foi assumido — claim travado?`,
      );
    }

    return new Response(
      JSON.stringify({
        message: 'Processing complete',
        mode: 'scan',
        processed,
        failed,
        total: scheduledMessages.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('Error in process-scheduled-messages:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

/**
 * Garante que exista uma linha em scheduled_message_contacts por contato-alvo,
 * unificando o rastreamento de progresso de single/tag/manual. Assim o lote
 * consegue retomar entre execuções do cron sem reenviar quem já recebeu.
 * - manual: as linhas já são criadas na tela de agendamento — nada a fazer.
 * - single: cria 1 linha se não houver.
 * - tag: materializa os contatos da tag (uma vez) capturando a membership atual.
 */
async function ensureProgressRows(supabase: any, scheduled: ScheduledMessage): Promise<void> {
  if (scheduled.target_type === 'manual') return;

  const { count } = await supabase
    .from('scheduled_message_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('scheduled_message_id', scheduled.id);
  if ((count || 0) > 0) return;

  let contactIds: string[] = [];
  if (scheduled.target_type === 'single' && scheduled.contact_id) {
    contactIds = [scheduled.contact_id];
  } else if (scheduled.target_type === 'tag' && scheduled.tag_id) {
    contactIds = await fetchTagContactIds(supabase, scheduled.tag_id);
  }

  if (contactIds.length === 0) return;

  const rows = contactIds.map((cid) => ({
    scheduled_message_id: scheduled.id,
    contact_id: cid,
    status: 'pending',
  }));

  // Insere em blocos com ON CONFLICT DO NOTHING (idempotente se rodar 2x).
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from('scheduled_message_contacts')
      .upsert(chunk, { onConflict: 'scheduled_message_id,contact_id', ignoreDuplicates: true });
    if (error) console.error(`[scheduled ${scheduled.id}] ensureProgressRows upsert failed:`, error);
  }
}

// Busca todos os contact_ids de uma tag paginando contact_tags (sem cap de ~1000).
async function fetchTagContactIds(supabase: any, tagId: string): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('contact_tags')
      .select('contact_id')
      .eq('tag_id', tagId)
      .range(from, from + pageSize - 1);
    if (error) {
      console.error('fetchTagContactIds error:', error);
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) ids.push(row.contact_id);
    if (data.length < pageSize) break;
  }
  return ids;
}

/**
 * FASE 3C: pré-carrega as conversas existentes dos contatos em UMA query e cria
 * as faltantes (em corrida, recupera a existente). Retorna Map contact_id → conversa.
 */
async function preloadConversations(
  supabase: any,
  scheduled: ScheduledMessage,
  contacts: Contact[],
  scheduledInstanceId: string | null,
  scheduledInstance: any,
): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  const ids = contacts.map((c) => c.id);
  if (ids.length === 0) return map;

  let query = supabase
    .from('conversations')
    .select('id, whatsapp_instance_id, contact_id')
    .in('contact_id', ids);
  query = scheduledInstanceId
    ? query.eq('whatsapp_instance_id', scheduledInstanceId)
    : query.is('whatsapp_instance_id', null);

  const { data: existing } = await query;
  for (const conv of existing || []) {
    if (!map.has(conv.contact_id)) map.set(conv.contact_id, conv);
  }

  // Cria as conversas faltantes uma a uma (NÃO em lote): um insert em lote é
  // tudo-ou-nada — se uma linha colidir com o índice único
  // (contact_id, organization_id, COALESCE(whatsapp_instance_id, zero)), TODAS
  // falhariam e os envios seriam pulados silenciosamente. Em caso de falha,
  // re-SELECT recupera a conversa existente (corrida/colisão) e loga o erro real.
  const missing = contacts.filter((c) => !map.has(c.id));
  for (const c of missing) {
    const { data: created, error: insErr } = await supabase
      .from('conversations')
      .insert({
        contact_id: c.id,
        organization_id: c.organization_id,
        workspace_id: scheduled.workspace_id || null,
        whatsapp_instance_id: scheduledInstanceId,
        source_phone: scheduledInstance?.phone_number || scheduledInstance?.logical_phone || null,
        status: 'open',
      })
      .select('id, whatsapp_instance_id, contact_id')
      .single();

    if (created) {
      map.set(c.id, created);
      continue;
    }

    let again = supabase
      .from('conversations')
      .select('id, whatsapp_instance_id, contact_id')
      .eq('contact_id', c.id)
      .eq('organization_id', c.organization_id);
    again = scheduledInstanceId
      ? again.eq('whatsapp_instance_id', scheduledInstanceId)
      : again.is('whatsapp_instance_id', null);
    const { data: refound } = await again.maybeSingle();

    if (refound) {
      map.set(c.id, refound);
    } else {
      console.error(`[scheduled ${scheduled.id}] could not create/find conversation for contact ${c.id}:`, insErr);
    }
  }

  return map;
}

// Busca uma página de contatos ainda pendentes deste agendamento.
async function fetchPendingContactPage(
  supabase: any,
  scheduledId: string,
  pageSize: number,
): Promise<Contact[]> {
  const { data } = await supabase
    .from('scheduled_message_contacts')
    // `name` é obrigatório aqui: alimenta a variável {{name}} do fluxo agendado.
    .select('contact_id, contacts(id, name, phone, organization_id)')
    .eq('scheduled_message_id', scheduledId)
    .eq('status', 'pending')
    .limit(pageSize);
  return (data || []).map((r: any) => r.contacts).filter(Boolean);
}

async function markContact(
  supabase: any,
  scheduledId: string,
  contactId: string,
  status: 'sent' | 'failed',
  errorMessage?: string,
): Promise<void> {
  await supabase
    .from('scheduled_message_contacts')
    .update({
      status,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
      error_message: errorMessage || null,
    })
    .eq('scheduled_message_id', scheduledId)
    .eq('contact_id', contactId);
}

/**
 * Envia para UM contato e GRAVA a mensagem imediatamente (não acumula pro fim).
 * Isso faz a mensagem aparecer no chat na hora e garante que, se a função for
 * interrompida, o que já saiu no WhatsApp já está registrado no banco.
 */
async function sendOneContact(
  supabase: any,
  scheduled: ScheduledMessage,
  contact: Contact,
  conversation: any,
  scheduledInstanceId: string | null,
): Promise<void> {
  const phone = contact.phone.replace(/\D/g, '');
  let sendType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';
  if (scheduled.media_url) {
    if (scheduled.media_type?.startsWith('image')) sendType = 'image';
    else if (scheduled.media_type?.startsWith('audio')) sendType = 'audio';
    else if (scheduled.media_type?.startsWith('video')) sendType = 'video';
    else sendType = 'document';
  }

  const sendResult = await sendWhatsAppMessage(supabase, {
    organizationId: scheduled.organization_id,
    phone,
    text: scheduled.message_content,
    type: sendType,
    mediaUrl: scheduled.media_url,
    caption: scheduled.message_content,
    conversationInstanceId: conversation.whatsapp_instance_id || scheduledInstanceId,
  });

  console.log(`[scheduled ${scheduled.id}] ${sendResult.provider} -> ${phone}: ${sendResult.status}`);

  if (!sendResult.ok) {
    throw new Error(`${sendResult.provider} ${sendResult.status}: ${sendResult.responseText.slice(0, 300)}`);
  }

  // Grava a mensagem JÁ (aparece no chat na hora).
  const { error: msgErr } = await supabase.from('messages').insert({
    conversation_id: conversation.id,
    content: scheduled.message_content,
    type: scheduled.media_url ? (scheduled.media_type?.split('/')[0] || 'document') : 'text',
    media_url: scheduled.media_url,
    direction: 'outbound',
    is_from_bot: true,
    zapi_message_id: sendResult.zapiMessageId,
    metadata: {
      source: 'scheduled_message',
      scheduled_id: scheduled.id,
      provider: sendResult.provider,
      provider_response: sendResult.responseJson || sendResult.responseText,
    },
  });
  if (msgErr) {
    // A mensagem já foi ENVIADA; logamos mas não derrubamos o envio.
    console.error(`[scheduled ${scheduled.id}] message insert failed for contact ${contact.id}:`, msgErr);
  }

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);
}

async function runFlowForContact(
  scheduled: ScheduledMessage,
  conversation: any,
  contact: Contact,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  // Sem isto o fluxo agendado roda com variables={} e {{name}} sai vazio —
  // ao contrário da campanha, que já semeia nome/telefone.
  const variables = {
    name: contact.name || '',
    phone: contact.phone || '',
    schedule_id: scheduled.id,
    schedule_name: scheduled.name || '',
  };

  let r: Response;
  try {
    r = await fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        flowId: scheduled.flow_id,
        conversationId: conversation.id,
        organizationId: scheduled.organization_id,
        variables,
      }),
      signal: AbortSignal.timeout(FLOW_TIMEOUT_MS),
    });
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error(`flow-execute nao respondeu em ${FLOW_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  }

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`flow-execute ${r.status}: ${t.slice(0, 300)}`);
  }
}

/**
 * Processa contatos pendentes até esgotar o orçamento de tempo.
 * Retorna { done: true } quando não há mais pendentes (campanha completa),
 * ou { done: false } quando parou por tempo/pausa de lote (há contatos restantes).
 */
async function processContactCampaign(
  supabase: any,
  scheduled: ScheduledMessage,
  deadlineAt: number,
): Promise<{ done: boolean }> {
  const { instance: scheduledInstance, blocked: workspaceBlocked } = await resolveScheduledInstance(supabase, scheduled);
  if (workspaceBlocked) {
    console.error(`[scheduled ${scheduled.id}] ${WORKSPACE_WITHOUT_NUMBER_ERROR}`);
    // Marca todos os pendentes como falha para o resumo refletir o motivo real.
    await supabase
      .from('scheduled_message_contacts')
      .update({ status: 'failed', error_message: WORKSPACE_WITHOUT_NUMBER_ERROR })
      .eq('scheduled_message_id', scheduled.id)
      .eq('status', 'pending');
    return { done: true };
  }

  const scheduledInstanceId = scheduledInstance?.id || null;
  const delayMs = ((scheduled as any).delay_between_contacts || 0) * 1000;
  const isFlow = scheduled.content_type === 'flow' && !!scheduled.flow_id;

  // Envio em lotes: se batch_size_max > 0, envia um lote (tamanho sorteado de 1
  // até o máximo), grava a pausa entre lotes e devolve o job para o cron retomar
  // após a pausa. batchSent/batchTarget são persistidos para sobreviver ao resume.
  const batchMax = scheduled.batch_size_max || 0;
  const batchEnabled = batchMax > 0;
  const batchPauseMinutes = scheduled.batch_pause_minutes || 0;
  let batchTarget = scheduled.batch_current_target || 0;
  let batchSent = scheduled.batch_sent_count || 0;

  if (batchEnabled && batchTarget <= 0) {
    // Começa um novo lote: sorteia o tamanho (1..batchMax).
    batchTarget = 1 + Math.floor(Math.random() * batchMax);
    batchSent = 0;
    await supabase
      .from('scheduled_messages')
      .update({ batch_current_target: batchTarget, batch_sent_count: 0 })
      .eq('id', scheduled.id);
  }

  // Grava o progresso do lote antes de sair por orçamento de tempo (para o
  // próximo run continuar o mesmo lote de onde parou).
  const saveBatchProgress = async () => {
    if (batchEnabled) {
      await supabase
        .from('scheduled_messages')
        .update({ batch_sent_count: batchSent, batch_current_target: batchTarget })
        .eq('id', scheduled.id);
    }
  };

  let firstSend = true;

  while (true) {
    if (Date.now() > deadlineAt) { await saveBatchProgress(); return { done: false }; }

    const page = await fetchPendingContactPage(supabase, scheduled.id, CONTACT_PAGE_SIZE);
    if (page.length === 0) return { done: true };

    const convByContact = await preloadConversations(supabase, scheduled, page, scheduledInstanceId, scheduledInstance);

    for (const contact of page) {
      if (Date.now() > deadlineAt) { await saveBatchProgress(); return { done: false }; }

      // Delay antibloqueio entre envios (pula o primeiro para não gastar orçamento).
      if (!firstSend && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      firstSend = false;

      const conversation = convByContact.get(contact.id);
      if (!conversation) {
        await markContact(supabase, scheduled.id, contact.id, 'failed', `Não foi possível obter/criar conversa para o contato ${contact.id}`);
        continue;
      }

      try {
        if (isFlow) {
          await runFlowForContact(scheduled, conversation, contact);
        } else {
          await sendOneContact(supabase, scheduled, contact, conversation, scheduledInstanceId);
        }
        await markContact(supabase, scheduled.id, contact.id, 'sent');
      } catch (err: any) {
        console.error(`Error sending to contact ${contact.id}:`, err?.message || err);
        await markContact(supabase, scheduled.id, contact.id, 'failed', err?.message || String(err));
      }

      // Cada contato processado (sucesso ou falha) consome uma vaga do lote:
      // o objetivo é limitar a cadência de disparos, não só os que deram certo.
      if (batchEnabled) {
        batchSent++;
        if (batchSent >= batchTarget) {
          // Lote completo: agenda a pausa e zera o estado para sortear um novo
          // lote no próximo run. Se ainda houver pendentes, o cron retoma após a
          // pausa (a query ignora agendamentos com batch_paused_until no futuro).
          const resumeAt = new Date(Date.now() + batchPauseMinutes * 60_000).toISOString();
          await supabase
            .from('scheduled_messages')
            .update({
              batch_paused_until: resumeAt,
              batch_sent_count: 0,
              batch_current_target: null,
            })
            .eq('id', scheduled.id);
          return { done: false };
        }
      }
    }
  }
}

/**
 * Fecha a campanha após todos os contatos serem processados: calcula o status
 * final (ou a próxima recorrência) e grava o resumo de sucesso/falha parcial.
 */
async function finalizeCampaign(
  supabase: any,
  scheduled: ScheduledMessage,
): Promise<JobOutcome> {
  const { count: sentCount } = await supabase
    .from('scheduled_message_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('scheduled_message_id', scheduled.id)
    .eq('status', 'sent');
  const { count: failCount } = await supabase
    .from('scheduled_message_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('scheduled_message_id', scheduled.id)
    .eq('status', 'failed');

  const sent = sentCount || 0;
  const fail = failCount || 0;

  // Retrato congelado desta execução para o painel do disparo. Precisa ser
  // montado ANTES de resetProgressForRecurrence(), que apaga/zera as linhas de
  // progresso — sem isto, o histórico da ocorrência some quando a próxima
  // começa e o painel passaria a mostrar os números da execução seguinte.
  const runSummary = await buildRunSummary(supabase, scheduled, sent, fail);

  // Puxa a última mensagem de erro real para o resumo.
  let lastError: string | undefined;
  if (fail > 0) {
    const { data: errRow } = await supabase
      .from('scheduled_message_contacts')
      .select('error_message')
      .eq('scheduled_message_id', scheduled.id)
      .eq('status', 'failed')
      .not('error_message', 'is', null)
      .limit(1)
      .maybeSingle();
    lastError = errRow?.error_message || undefined;
  }

  // Nada enviado e houve falha → falha real.
  if (sent === 0 && fail > 0) {
    await supabase
      .from('scheduled_messages')
      .update({
        status: 'failed',
        error_message: lastError || 'Falha em todos os envios',
        last_executed_at: new Date().toISOString(),
        execution_count: (scheduled.execution_count || 0) + 1,
        last_run_summary: runSummary,
      })
      .eq('id', scheduled.id);
    return 'failed';
  }

  if (sent === 0 && fail === 0) {
    // Nenhum contato-alvo encontrado.
    await supabase
      .from('scheduled_messages')
      .update({
        status: 'failed',
        error_message: 'Nenhum contato encontrado para envio',
        last_run_summary: runSummary,
      })
      .eq('id', scheduled.id);
    return 'failed';
  }

  const next = calculateNextExecution(scheduled);
  const partialError = fail > 0
    ? `${sent} enviada(s), ${fail} falharam. Último erro: ${lastError || 'desconhecido'}`
    : null;

  // Recorrência continua: prepara o progresso para a próxima ocorrência.
  if (next.status === 'pending') {
    await resetProgressForRecurrence(supabase, scheduled);
  }

  await supabase
    .from('scheduled_messages')
    .update({ ...next, error_message: partialError, last_run_summary: runSummary })
    .eq('id', scheduled.id);
  return 'processed';
}

// Teto de contatos não entregues guardados no resumo. É uma lista para o
// usuário reenviar à mão; acima disso vira ruído e incha o JSON à toa.
const SUMMARY_UNDELIVERED_LIMIT = 200;

/**
 * Monta o retrato congelado da execução que acabou de fechar.
 *
 * Só guarda o que o produto mostra: contagens e QUEM não recebeu (nome/telefone).
 * A mensagem de erro técnica de cada contato fica DE FORA de propósito — ela não
 * é exibida ao usuário final, só existe nos logs e no SQL de suporte.
 */
async function buildRunSummary(
  supabase: any,
  scheduled: ScheduledMessage,
  sent: number,
  fail: number,
): Promise<Record<string, unknown>> {
  let undelivered: Array<{ name: string | null; phone: string | null }> = [];

  if (fail > 0) {
    const { data } = await supabase
      .from('scheduled_message_contacts')
      .select('contact:contacts(name, phone)')
      .eq('scheduled_message_id', scheduled.id)
      .eq('status', 'failed')
      .limit(SUMMARY_UNDELIVERED_LIMIT);

    undelivered = (data || [])
      .map((row: any) => row.contact)
      .filter(Boolean)
      .map((c: any) => ({ name: c.name ?? null, phone: c.phone ?? null }));
  }

  return {
    finished_at: new Date().toISOString(),
    total: sent + fail,
    sent,
    failed: fail,
    undelivered,
    undelivered_truncated: fail > undelivered.length,
  };
}

// Prepara scheduled_message_contacts para a próxima ocorrência de uma recorrência.
// tag: apaga as linhas (re-materializa na próxima execução, pegando a membership atual).
// single/manual: reseta as linhas existentes para 'pending'.
async function resetProgressForRecurrence(supabase: any, scheduled: ScheduledMessage): Promise<void> {
  // Zera o estado de lote e o progresso de grupos para a próxima ocorrência
  // começar do zero.
  await supabase
    .from('scheduled_messages')
    .update({
      batch_sent_count: 0,
      batch_current_target: null,
      batch_paused_until: null,
      group_progress: {},
    })
    .eq('id', scheduled.id);

  if (scheduled.target_type === 'tag') {
    await supabase
      .from('scheduled_message_contacts')
      .delete()
      .eq('scheduled_message_id', scheduled.id);
    return;
  }
  await supabase
    .from('scheduled_message_contacts')
    .update({ status: 'pending', sent_at: null, error_message: null })
    .eq('scheduled_message_id', scheduled.id);
}

/**
 * Envia para os grupos, respeitando o orçamento de tempo e persistindo o
 * progresso POR JID em scheduled_messages.group_progress.
 *
 * O progresso é o que torna o resume seguro: sem ele, um disparo para muitos
 * grupos com delay estoura o tempo, o lock vira órfão e a execução seguinte
 * reenviaria para TODOS os grupos desde o início.
 *
 * Retorna { done: false } quando parou por tempo (ainda há JIDs pendentes).
 */
async function sendMessageToGroups(
  supabase: any,
  scheduled: ScheduledMessage,
  deadlineAt: number,
): Promise<{ done: boolean }> {
  const groupJids = Array.isArray(scheduled.group_jids) ? scheduled.group_jids : [];
  const delayMs = ((scheduled as any).delay_between_contacts || 0) * 1000;
  const progress: Record<string, GroupProgressEntry> = { ...(scheduled.group_progress || {}) };

  let sendType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';
  if (scheduled.media_url) {
    if (scheduled.media_type?.startsWith('image')) sendType = 'image';
    else if (scheduled.media_type?.startsWith('audio')) sendType = 'audio';
    else if (scheduled.media_type?.startsWith('video')) sendType = 'video';
    else sendType = 'document';
  }

  // Se já processamos algum grupo num run anterior, o delay vale para o primeiro
  // desta rodada também (a cadência é do número, não da invocação).
  let firstSend = Object.keys(progress).length === 0;

  for (const groupJid of groupJids) {
    if (progress[groupJid]) continue; // já processado (sucesso ou falha)
    if (Date.now() > deadlineAt) return { done: false };

    if (!firstSend && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    firstSend = false;

    try {
      const sendResult = await sendWhatsAppMessage(supabase, {
        organizationId: scheduled.organization_id,
        phone: groupJid,
        isGroup: true,
        text: scheduled.message_content,
        type: sendType,
        mediaUrl: scheduled.media_url,
        caption: scheduled.message_content,
      });

      console.log(`[scheduled ${scheduled.id}] group ${sendResult.provider} -> ${groupJid}: ${sendResult.status}`);

      if (!sendResult.ok) {
        throw new Error(`${sendResult.provider} ${sendResult.status}: ${sendResult.responseText.slice(0, 300)}`);
      }
      progress[groupJid] = { status: 'sent' };
    } catch (err: any) {
      console.error(`Error sending to group ${groupJid}:`, err?.message || err);
      progress[groupJid] = { status: 'failed', error: String(err?.message || err).slice(0, 300) };
    }

    // Persiste a CADA grupo: se a função morrer aqui, o resume não reenvia.
    const { error: progErr } = await supabase
      .from('scheduled_messages')
      .update({ group_progress: progress })
      .eq('id', scheduled.id);
    if (progErr) console.error(`[scheduled ${scheduled.id}] group_progress update failed:`, progErr);
  }

  return { done: true };
}

/**
 * Fecha um disparo para grupos, lendo as contagens de group_progress.
 */
async function finalizeGroups(supabase: any, scheduled: ScheduledMessage): Promise<JobOutcome> {
  const { data: fresh } = await supabase
    .from('scheduled_messages')
    .select('group_progress')
    .eq('id', scheduled.id)
    .maybeSingle();

  const progress: Record<string, GroupProgressEntry> = fresh?.group_progress || {};
  const entries = Object.entries(progress);
  const sent = entries.filter(([, v]) => v?.status === 'sent').length;
  const fail = entries.filter(([, v]) => v?.status === 'failed').length;
  const lastError = entries.find(([, v]) => v?.status === 'failed' && v?.error)?.[1]?.error;

  const runSummary = {
    finished_at: new Date().toISOString(),
    total: sent + fail,
    sent,
    failed: fail,
    // Para grupos não há nome/telefone: identificamos pelo JID.
    undelivered: entries.filter(([, v]) => v?.status === 'failed').map(([jid]) => ({ name: null, phone: jid })),
    undelivered_truncated: false,
  };

  if (sent === 0 && fail > 0) {
    await supabase
      .from('scheduled_messages')
      .update({
        status: 'failed',
        error_message: lastError || 'Falha em todos os envios para grupos',
        last_executed_at: new Date().toISOString(),
        execution_count: (scheduled.execution_count || 0) + 1,
        last_run_summary: runSummary,
      })
      .eq('id', scheduled.id);
    return 'failed';
  }

  if (sent === 0 && fail === 0) {
    await supabase
      .from('scheduled_messages')
      .update({
        status: 'failed',
        error_message: 'Nenhum grupo encontrado para envio',
        last_run_summary: runSummary,
      })
      .eq('id', scheduled.id);
    return 'failed';
  }

  const next = calculateNextExecution(scheduled);
  const partialError = fail > 0
    ? `${sent} enviada(s), ${fail} falharam. Último erro: ${lastError || 'desconhecido'}`
    : null;

  // Recorrência continua: zera o progresso para a próxima ocorrência reenviar
  // para todos os grupos.
  if (next.status === 'pending') {
    await supabase
      .from('scheduled_messages')
      .update({ group_progress: {} })
      .eq('id', scheduled.id);
  }

  await supabase
    .from('scheduled_messages')
    .update({ ...next, error_message: partialError, last_run_summary: runSummary })
    .eq('id', scheduled.id);
  return 'processed';
}

function calculateNextExecution(scheduled: ScheduledMessage): Record<string, any> {
  const now = new Date();
  const executionCount = (scheduled.execution_count || 0) + 1;

  // If no recurrence, mark as sent
  if (scheduled.recurrence_type === 'once') {
    return {
      status: 'sent',
      last_executed_at: now.toISOString(),
      execution_count: executionCount,
    };
  }

  // Calculate next execution based on recurrence
  const currentExecution = new Date(scheduled.next_execution_at || scheduled.scheduled_at);
  let nextExecution: Date;

  switch (scheduled.recurrence_type) {
    case 'daily':
      nextExecution = new Date(currentExecution);
      nextExecution.setDate(nextExecution.getDate() + 1);
      break;
    case 'weekly':
      nextExecution = new Date(currentExecution);
      nextExecution.setDate(nextExecution.getDate() + 7);
      break;
    case 'monthly':
      nextExecution = new Date(currentExecution);
      nextExecution.setMonth(nextExecution.getMonth() + 1);
      break;
    default:
      return {
        status: 'sent',
        last_executed_at: now.toISOString(),
        execution_count: executionCount,
      };
  }

  // Check if recurrence has ended
  if (scheduled.recurrence_end_at && nextExecution > new Date(scheduled.recurrence_end_at)) {
    return {
      status: 'sent',
      last_executed_at: now.toISOString(),
      execution_count: executionCount,
    };
  }

  return {
    status: 'pending',
    last_executed_at: now.toISOString(),
    next_execution_at: nextExecution.toISOString(),
    execution_count: executionCount,
  };
}
