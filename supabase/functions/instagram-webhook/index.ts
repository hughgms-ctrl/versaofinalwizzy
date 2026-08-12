import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ensureInstagramContact,
  ensureInstagramConversation,
  findInstagramAccountByBusinessId,
  loadInstagramAppConfig,
  reserveInstagramSendSlot,
  sendInstagramButtonMessage,
  sendInstagramMessage,
  verifyWebhookSignature,
} from '../_shared/instagramProvider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
};

function textResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** O que a mensagem recebida representa, para decidir qual gatilho ela aciona. */
interface IngestedMessage {
  contact: any;
  conversation: any;
  messageType: string;
  text: string;
  /** Primeira mensagem que este contato manda — base do gatilho first_message. */
  isFirstMessage: boolean;
}

async function handleMessagingEvent(
  supabase: any,
  account: any,
  messagingEvent: any,
): Promise<IngestedMessage | null> {
  const senderId = messagingEvent?.sender?.id;
  const isEcho = messagingEvent?.message?.is_echo === true;
  // Echoes are Meta replaying our own outbound sends back through the webhook —
  // we already record those at send time, so skip to avoid duplicate rows.
  if (!senderId || senderId === account.ig_business_account_id || isEcho) return null;

  const messageText = messagingEvent?.message?.text || null;
  const igMessageId = messagingEvent?.message?.mid || null;
  if (!messageText && !messagingEvent?.message?.attachments?.length) return null;

  const contact = await ensureInstagramContact(supabase, account, senderId);
  const conversation = await ensureInstagramConversation(supabase, account, contact);

  const attachment = messagingEvent?.message?.attachments?.[0];
  const messageType = attachment?.type === 'image' ? 'image'
    : attachment?.type === 'video' ? 'video'
    : attachment?.type === 'audio' ? 'audio'
    // Menção da conta no story de outra pessoa: chega como anexo, não como
    // resposta. É um gatilho distinto do story_reply.
    : attachment?.type === 'story_mention' ? 'story_mention'
    : messagingEvent?.message?.reply_to?.story ? 'story_reply'
    : 'text';

  await supabase.from('instagram_messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    type: messageType,
    content: messageText,
    media_url: attachment?.payload?.url || null,
    ig_message_id: igMessageId,
  });

  await supabase.from('instagram_conversations').update({
    last_message_at: new Date().toISOString(),
    last_message_direction: 'inbound',
    // Opens Meta's 24-hour messaging window. Tracked separately from
    // last_message_at (which our own outbound sends also bump) because only a
    // message FROM the person opens the window — this is what
    // instagram-process-followups checks before sending a normal DM.
    last_inbound_at: new Date().toISOString(),
    unread_count: (conversation.unread_count || 0) + 1,
  }).eq('id', conversation.id);

  // Marca a primeira mensagem do contato de forma atômica: o UPDATE só encontra
  // a linha enquanto first_inbound_at for NULL, então duas mensagens que
  // cheguem juntas não disparam o gatilho de boas-vindas duas vezes.
  const { data: firstMarked } = await supabase
    .from('instagram_contacts')
    .update({ first_inbound_at: new Date().toISOString() })
    .eq('id', contact.id)
    .is('first_inbound_at', null)
    .select('id');

  return {
    contact,
    conversation,
    messageType,
    text: messageText || '',
    isFirstMessage: (firstMarked?.length || 0) > 0,
  };
}

/**
 * Entrega a mensagem a um fluxo que estava esperando resposta desta conversa.
 *
 * Tem precedência sobre disparar fluxo novo: quem já está numa jornada e
 * responde está continuando aquela conversa, não começando outra. Sem isto, a
 * resposta a uma pergunta do fluxo poderia iniciar uma segunda jornada em
 * paralelo — e o índice de "uma execução viva por conversa" recusaria a
 * entrada, com a resposta da pessoa se perdendo.
 *
 * Devolve true quando havia execução esperando.
 */
async function resumeWaitingFlow(
  supabase: any,
  serviceRoleKey: string,
  supabaseUrl: string,
  conversationId: string,
  replyText: string,
): Promise<boolean> {
  const { data: waiting } = await supabase
    .from('instagram_flow_executions')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('status', 'waiting_input')
    .maybeSingle();

  if (!waiting) return false;

  await fetch(`${supabaseUrl}/functions/v1/instagram-flow-execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
    body: JSON.stringify({ resumeExecutionId: waiting.id, replyText }),
  }).catch((err) => console.error('[instagram-webhook] retomada de fluxo falhou:', err));

  return true;
}

/**
 * Dispara os fluxos visuais cujo gatilho casa com o evento.
 *
 * Fluxos e regras simples convivem: quem quer "comentou → recebe DM" usa a
 * regra; quem precisa de ramificação e espera usa o fluxo. Os dois são
 * consultados para o mesmo evento.
 */
async function triggerFlows(
  supabase: any,
  account: any,
  serviceRoleKey: string,
  supabaseUrl: string,
  triggerTypes: string[],
  event: Record<string, unknown>,
  text: string,
) {
  const { data: flows } = await supabase
    .from('instagram_flows')
    .select('id, trigger_type, trigger_config')
    .eq('instagram_account_id', account.id)
    .in('trigger_type', triggerTypes)
    .eq('is_active', true);

  for (const flow of flows || []) {
    const isComment = flow.trigger_type === 'comment_keyword';
    const keywordApplies = flow.trigger_type === 'dm_keyword'
      || flow.trigger_type === 'story_reply'
      || isComment;
    if (keywordApplies && !matchesKeywords(flow.trigger_config, text, !isComment)) continue;

    // Escopo por post, quando o gatilho é comentário.
    if (isComment && !matchesPostScope(flow.trigger_config, event.mediaId as string | undefined)) {
      continue;
    }

    await fetch(`${supabaseUrl}/functions/v1/instagram-flow-execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ flowId: flow.id, event }),
    }).catch((err) => console.error('[instagram-webhook] disparo de fluxo falhou:', err));
  }
}

/**
 * Testa o texto recebido contra as palavras-chave configuradas.
 *
 * `emptyMeansAny` separa dois mundos que o mesmo campo vazio significa coisas
 * opostas:
 *
 *  - mensagem e resposta a story (true): sem palavra-chave, vale qualquer
 *    texto. É o caso de uso mais comum — responder quem reagiu ao story, seja
 *    lá o que tenha escrito.
 *  - comentário (false): sem palavra-chave, NÃO vale nada. Uma regra de
 *    comentário que responde a todo mundo responderia também a críticas e spam,
 *    e nunca foi intenção de quem simplesmente deixou o campo em branco.
 *
 * Quem quer "qualquer comentário" agora tem como dizer isso de propósito:
 * `keyword_mode: 'any'`, escolhido na tela.
 */
function matchesKeywords(config: any, text: string, emptyMeansAny = true): boolean {
  if (config?.keyword_mode === 'any') return true;

  const keywords: string[] = (config?.keywords || [])
    .map((k: string) => String(k).toLowerCase().trim())
    .filter(Boolean);

  if (!keywords.length) return emptyMeansAny;

  const lowerText = String(text || '').toLowerCase();
  const matches = keywords.map((k) => lowerText.includes(k));
  return config?.match_type === 'all' ? matches.every(Boolean) : matches.some(Boolean);
}

/**
 * O comentário veio de uma publicação em que esta automação vale?
 *
 * `next_post` só passa depois que o vinculador (instagram-bind-next-post) achou
 * a publicação nova e gravou o id. Antes disso a lista está vazia e a regra não
 * vale para nenhum post — o que é o comportamento certo: "vale na próxima" não
 * pode significar "vale em todas enquanto a próxima não sai".
 */
function matchesPostScope(config: any, mediaId: string | null | undefined): boolean {
  const scope = config?.scope || 'all_posts';
  if (scope === 'all_posts') return true;

  const ids: string[] = config?.media_ids || [];
  if (!ids.length || !mediaId) return false;
  return ids.includes(mediaId);
}

/**
 * Dispara as regras cujo gatilho é uma mensagem recebida (DM, resposta a story,
 * menção em story, primeira mensagem).
 *
 * Diferente do comentário, aqui a pessoa acabou de escrever para a empresa — ou
 * seja, a janela de 24h está aberta e o envio é DM comum, endereçada por IGSID.
 * Quem decide isso é o rule-execute, a partir do `event.type`.
 */
async function handleMessageTriggers(
  supabase: any,
  account: any,
  serviceRoleKey: string,
  supabaseUrl: string,
  webhookEventId: string,
  ingested: IngestedMessage,
) {
  const triggerTypes: string[] = [];
  if (ingested.messageType === 'story_reply') triggerTypes.push('story_reply');
  else if (ingested.messageType === 'story_mention') triggerTypes.push('story_mention');
  else triggerTypes.push('dm_keyword');
  if (ingested.isFirstMessage) triggerTypes.push('first_message');

  const { data: rules } = await supabase
    .from('instagram_automation_rules')
    .select('*')
    .eq('instagram_account_id', account.id)
    .in('trigger_type', triggerTypes)
    .eq('is_active', true);

  for (const rule of rules || []) {
    // Palavra-chave só filtra onde ela faz sentido. Menção em story não traz
    // texto nosso para casar, e "primeira mensagem" é sobre ser a primeira,
    // não sobre o que foi dito.
    const keywordApplies = rule.trigger_type === 'dm_keyword' || rule.trigger_type === 'story_reply';
    if (keywordApplies && !matchesKeywords(rule.trigger_config, ingested.text)) continue;

    await fetch(`${supabaseUrl}/functions/v1/instagram-rule-execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({
        ruleId: rule.id,
        webhookEventId,
        event: {
          type: 'message',
          messageType: ingested.messageType,
          text: ingested.text,
          fromIgsid: ingested.contact.igsid,
          fromUsername: ingested.contact.username,
          conversationId: ingested.conversation.id,
        },
      }),
    }).catch((err) => console.error('[instagram-webhook] rule-execute (message) falhou:', err));
  }
}

// Responde ao toque num quick reply enviado pela automação.
//
// Este é o momento em que a janela de 24h ABRE: o toque é uma mensagem da
// pessoa, ao contrário do clique num botão web_url, que só abre o navegador e
// deixa a janela fechada. Por isso o link é enviado agora, e não antes — aqui
// ele é um DM comum legítimo.
//
// Devolve true quando tratou o payload, para o chamador saber que já cuidou do
// envio (a mensagem em si continua sendo registrada normalmente).
async function handleQuickReplyPostback(
  supabase: any,
  account: any,
  supabaseUrl: string,
  messagingEvent: any,
): Promise<boolean> {
  const rawPayload = messagingEvent?.message?.quick_reply?.payload;
  if (!rawPayload) return false;

  let parsed: any = null;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    return false;
  }
  // Só payloads que nós mesmos emitimos (ver instagram-rule-execute).
  if (parsed?.k !== 'ig_link' || !parsed?.t) return false;

  const senderId = messagingEvent?.sender?.id;
  if (!senderId) return false;

  try {
    return await deliverTrackedLink(supabase, account, supabaseUrl, senderId, parsed.t, {
      quick_reply_payload: parsed,
    });
  } catch (error) {
    console.error('[instagram-webhook] quick reply handler error:', error);
    return false;
  }
}

/**
 * Envia o link prometido, uma vez só.
 *
 * Dois caminhos chegam aqui — o toque no quick reply e a resposta com o e-mail
 * — e os dois têm o mesmo problema: podem acontecer mais de uma vez. A chip
 * continua na conversa depois de tocada, e nada impede a pessoa de responder
 * duas vezes. A reserva no banco (claim_instagram_link_send) é o que garante
 * que só o primeiro chegue à Meta.
 *
 * Devolve true quando o assunto está resolvido — inclusive no caso de o link já
 * ter sido enviado antes, em que não há nada a fazer.
 */
async function deliverTrackedLink(
  supabase: any,
  account: any,
  supabaseUrl: string,
  senderId: string,
  linkId: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  const { data: link } = await supabase
    .from('instagram_tracked_links')
    .select('id, destination_url, link_message, link_label')
    .eq('id', linkId)
    .maybeSingle();
  if (!link?.destination_url) return false;

  // Reservar ANTES de gastar cota: um toque repetido não deve consumir o slot
  // de outra pessoa esperando resposta.
  const { data: claimed, error: claimError } = await supabase
    .rpc('claim_instagram_link_send', { p_link_id: link.id });
  if (claimError) {
    console.error('[instagram-webhook] claim_instagram_link_send falhou:', claimError);
    return false;
  }
  if (claimed !== true) return true; // já enviado antes; nada a fazer

  // O envio do link também consome cota da conta — se o teto estourou, não
  // insistir. A pessoa acabou de abrir a janela de 24h, então o follow-up
  // agendado ainda alcança ela mesmo que este envio não saia agora.
  const hasSlot = await reserveInstagramSendSlot(supabase, account.id, 'automation');
  if (!hasSlot) {
    console.warn('[instagram-webhook] entrega de link sem cota de envio', { accountId: account.id });
    // Devolve o direito de envio: sem isto, o link ficaria marcado como enviado
    // sem nunca ter saído, e a pessoa nunca o receberia.
    await supabase.from('instagram_tracked_links')
      .update({ link_sent_at: null })
      .eq('id', link.id);
    return false;
  }

  const contact = await ensureInstagramContact(supabase, account, senderId);
  const conversation = await ensureInstagramConversation(supabase, account, contact);

  const redirectUrl = `${supabaseUrl}/functions/v1/instagram-link-redirect?id=${link.id}`;
  // Texto gravado junto do link na criação. O padrão cobre os links criados
  // antes desta coluna existir.
  const text = link.link_message || 'Perfeito! Aqui está o link 👇';
  const result = await sendInstagramButtonMessage(
    account,
    { id: senderId },
    text,
    link.link_label || 'Acessar',
    redirectUrl,
  );

  if (result.ok) {
    await supabase.from('instagram_messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      type: 'text',
      content: text,
      ig_message_id: result.igMessageId,
      is_from_bot: true,
      metadata: { ...metadata, tracked_link_id: link.id },
    });
    await supabase.from('instagram_conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_direction: 'outbound',
    }).eq('id', conversation.id);
  } else {
    console.error('[instagram-webhook] falha ao enviar link:', result.responseText?.slice(0, 300));
    // Falhou na Meta: liberar para uma nova tentativa.
    await supabase.from('instagram_tracked_links')
      .update({ link_sent_at: null })
      .eq('id', link.id);
  }
  return true;
}

/**
 * A mensagem é a resposta a uma pergunta que a automação fez?
 *
 * Este é o primeiro caso em que uma REGRA (não um fluxo) espera resposta. Sem
 * esta checagem, quem respondesse "ana@email.com" cairia nos gatilhos normais:
 * a automação de DM veria uma mensagem nova e mandaria a pergunta outra vez.
 *
 * Devolve true quando consumiu a mensagem.
 */
async function handlePendingCollection(
  supabase: any,
  account: any,
  supabaseUrl: string,
  ingested: IngestedMessage,
): Promise<boolean> {
  // Só texto é resposta a uma pergunta escrita. Uma foto ou uma menção em story
  // que chegue no meio da espera não é tentativa de responder — gastaria uma
  // das três chances e ainda faria a automação avisar "isso não parece um
  // e-mail" a quem não estava respondendo nada.
  if (!ingested.text.trim()) return false;

  const { data: pending } = await supabase
    .from('instagram_pending_collections')
    .select('*')
    .eq('conversation_id', ingested.conversation.id)
    .eq('status', 'waiting')
    .maybeSingle();

  if (!pending) return false;

  const config = pending.collect_config || {};
  // Deliberadamente permissiva: a pessoa costuma escrever "meu email é x@y.com"
  // em vez de só o endereço, e recusar isso seria recusar a resposta certa.
  const match = String(ingested.text || '').match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const email = match?.[0]?.replace(/[.,;:]+$/, '') || null;

  if (!email) {
    const attempts = (pending.attempts || 0) + 1;
    // Teto de 3: quem responde outra coisa três vezes não vai responder na
    // quarta, e cada aviso gasta cota de envio da conta. Depois disso a espera
    // é encerrada e a conversa volta ao comportamento normal.
    const exhausted = attempts >= 3;

    await supabase.from('instagram_pending_collections').update({
      attempts,
      status: exhausted ? 'abandoned' : 'waiting',
      completed_at: exhausted ? new Date().toISOString() : null,
    }).eq('id', pending.id);

    if (!exhausted && config.invalid_text) {
      const hasSlot = await reserveInstagramSendSlot(supabase, account.id, 'automation');
      if (hasSlot) {
        const result = await sendInstagramMessage(
          account,
          { id: ingested.contact.igsid },
          config.invalid_text,
        );
        if (result.ok) {
          await supabase.from('instagram_messages').insert({
            conversation_id: ingested.conversation.id,
            direction: 'outbound',
            type: 'text',
            content: config.invalid_text,
            ig_message_id: result.igMessageId,
            is_from_bot: true,
            metadata: { collection_id: pending.id, attempt: attempts },
          });
          await supabase.from('instagram_conversations').update({
            last_message_at: new Date().toISOString(),
            last_message_direction: 'outbound',
          }).eq('id', ingested.conversation.id);
        }
      }
    }
    return true;
  }

  await supabase.from('instagram_contacts')
    .update({ email })
    .eq('id', pending.contact_id);

  await supabase.from('instagram_pending_collections').update({
    status: 'collected',
    collected_value: email,
    completed_at: new Date().toISOString(),
  }).eq('id', pending.id);

  if (pending.tracked_link_id) {
    await deliverTrackedLink(
      supabase, account, supabaseUrl, ingested.contact.igsid, pending.tracked_link_id,
      { collection_id: pending.id },
    );
  }

  return true;
}

async function handleCommentChange(
  supabase: any,
  account: any,
  serviceRoleKey: string,
  supabaseUrl: string,
  webhookEventId: string,
  value: any,
) {
  const commentId = value?.id;
  const fromIgsid = value?.from?.id;
  const text = value?.text || '';
  const mediaId = value?.media?.id || null;

  // Skip comments authored by the business account itself (e.g. our own public
  // reply, which also arrives as a `comments` change) to avoid feedback loops.
  if (!commentId || !fromIgsid || fromIgsid === account.ig_business_account_id) return;

  await ensureInstagramContact(supabase, account, fromIgsid, value?.from?.username);

  const { data: rules } = await supabase
    .from('instagram_automation_rules')
    .select('*')
    .eq('instagram_account_id', account.id)
    .eq('trigger_type', 'comment_keyword')
    .eq('is_active', true);

  for (const rule of rules || []) {
    if (!matchesPostScope(rule.trigger_config, mediaId)) continue;
    // `false`: comentário sem palavra-chave não dispara — ver matchesKeywords.
    if (!matchesKeywords(rule.trigger_config, text, false)) continue;

    // Delegate the actual action pipeline (like/reply/DM/tag/...) to
    // instagram-rule-execute, keeping the webhook handler focused on ingest +
    // matching. Awaited (not fire-and-forget) since edge functions don't
    // guarantee background work continues after the response is sent.
    await fetch(`${supabaseUrl}/functions/v1/instagram-rule-execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({
        ruleId: rule.id,
        webhookEventId,
        event: { type: 'comment', commentId, mediaId, text, fromIgsid, fromUsername: value?.from?.username },
      }),
    }).catch((err) => console.error('[instagram-webhook] rule-execute call failed:', err));
  }

  // Fluxos visuais com gatilho de comentário. O commentId vai junto: é ele que
  // permite ao fluxo abrir com uma private reply, a única forma de alcançar
  // quem só comentou.
  await triggerFlows(supabase, account, serviceRoleKey, supabaseUrl, ['comment_keyword'], {
    type: 'comment',
    commentId,
    mediaId,
    text,
    fromIgsid,
    fromUsername: value?.from?.username,
  }, text);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const verifyToken = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const appConfig = await loadInstagramAppConfig(supabase);
    if (mode === 'subscribe' && verifyToken && verifyToken === appConfig.webhookVerifyToken) {
      return textResponse(challenge || '');
    }
    return textResponse('Forbidden', 403);
  }

  if (req.method !== 'POST') {
    return textResponse('Method not allowed', 405);
  }

  const rawBody = await req.text();

  try {
    const appConfig = await loadInstagramAppConfig(supabase);
    const signatureValid = await verifyWebhookSignature(req, rawBody, appConfig.appSecret);
    if (!signatureValid) {
      console.error('[instagram-webhook] invalid signature');
      // Log even on rejection — otherwise a signing-secret mismatch looks
      // identical to "Meta never called us at all" when debugging, since
      // nothing lands in instagram_webhook_events either way.
      let rawForLog: any = null;
      try { rawForLog = JSON.parse(rawBody || '{}'); } catch { rawForLog = { _unparsed: rawBody?.slice(0, 2000) }; }
      await supabase.from('instagram_webhook_events').insert({
        event_type: 'signature_rejected',
        raw_payload: rawForLog,
        processed: false,
        error: 'invalid_signature',
      });
      return jsonResponse({ error: 'invalid signature' }, 401);
    }

    const payload = JSON.parse(rawBody || '{}');
    const entries: any[] = payload?.entry || [];

    for (const entry of entries) {
      const igBusinessAccountId = entry?.id;
      const account = igBusinessAccountId
        ? await findInstagramAccountByBusinessId(supabase, igBusinessAccountId)
        : null;

      const { data: eventRow } = await supabase
        .from('instagram_webhook_events')
        .insert({
          organization_id: account?.organization_id || null,
          instagram_account_id: account?.id || null,
          event_type: entry?.changes?.length ? 'comment' : entry?.messaging?.length ? 'message' : 'unknown',
          raw_payload: entry,
          processed: !!account,
          error: account ? null : 'unrecognized_instagram_account',
        })
        .select('id')
        .single();

      if (!account) {
        console.error('[instagram-webhook] no instagram_accounts row for ig_business_account_id', igBusinessAccountId);
        continue;
      }

      for (const change of entry?.changes || []) {
        if (change.field === 'comments') {
          await handleCommentChange(supabase, account, serviceRoleKey, supabaseUrl, eventRow?.id, change.value);
        }
        // 'mentions' and other change fields land here in later phases.
      }

      for (const messagingEvent of entry?.messaging || []) {
        // Registrar ANTES de responder: é este insert que grava last_inbound_at
        // e portanto abre a janela de 24h. Responder primeiro faria o envio
        // acontecer com a janela ainda fechada no nosso registro.
        const ingested = await handleMessagingEvent(supabase, account, messagingEvent);
        const handledAsQuickReply = await handleQuickReplyPostback(
          supabase, account, supabaseUrl, messagingEvent,
        );

        // O toque num quick reply nosso não deve acionar regra de palavra-chave:
        // o rótulo da chip ("Quero sim!") casaria com a regra de DM que contém
        // "quero", e a pessoa receberia o link e a automação de boas-vindas ao
        // mesmo tempo. O postback já teve a resposta dele.
        if (ingested && !handledAsQuickReply) {
          // Quem já está numa jornada e responde está continuando aquela
          // conversa. Só quem não está é candidato a entrar numa nova.
          //
          // A coleta vem antes do fluxo por ser a espera mais específica: uma
          // pergunta direta ("qual seu e-mail?") acabou de ser feita a esta
          // pessoa, e a resposta é dela. Deixar o fluxo consumir a mensagem
          // faria a automação perguntar de novo em seguida.
          const collected = await handlePendingCollection(
            supabase, account, supabaseUrl, ingested,
          );

          const resumed = collected || await resumeWaitingFlow(
            supabase, serviceRoleKey, supabaseUrl, ingested.conversation.id, ingested.text,
          );

          if (!resumed) {
            await handleMessageTriggers(
              supabase, account, serviceRoleKey, supabaseUrl, eventRow?.id, ingested,
            );

            const triggerTypes = ingested.messageType === 'story_reply' ? ['story_reply']
              : ingested.messageType === 'story_mention' ? ['story_mention']
              : ['dm_keyword'];
            if (ingested.isFirstMessage) triggerTypes.push('first_message');

            await triggerFlows(supabase, account, serviceRoleKey, supabaseUrl, triggerTypes, {
              type: 'message',
              messageType: ingested.messageType,
              text: ingested.text,
              fromIgsid: ingested.contact.igsid,
              fromUsername: ingested.contact.username,
            }, ingested.text);
          }
        }
      }
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('[instagram-webhook] error:', error);
    // Still return 200 so Meta doesn't retry-storm a payload we can't parse;
    // the raw event (if it got far enough to be logged) is in
    // instagram_webhook_events for replay/debugging.
    return jsonResponse({ success: false }, 200);
  }
});
