import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decode as decodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { resumeFlow } from '../_shared/flowResume.ts';

declare const EdgeRuntime: any;

// Gatilho "qualquer mensagem": campanha sem texto próprio, que atende quem não casou
// com nenhuma outra. Vive em campaigns.match_type junto com exact/contains/etc, mas
// não é comparada como os outros -- ver o segundo passe em checkCampaignTriggers.
const FALLBACK_MATCH_TYPE = 'fallback';

// Sanitiza identificadores de instância vindos do payload do provedor antes de
// interpolá-los em filtros PostgREST (.or(`col.eq.${id}`)). Sem isso, um payload
// com vírgula/ponto (ex.: instanceName "x,zapi_instance_id.neq.__none__") injeta
// condições OR extras e, com service_role (bypassa RLS), permitiria UPDATE em massa
// (disconnect global) em todas as orgs. IDs/nomes legítimos são alfanuméricos com
// hífen/underscore; qualquer outro caractere invalida o identificador (vira ''),
// o que apenas resulta em "instância não encontrada" — nunca em cross-tenant.
function sanitizeInstanceIdentifier(value: unknown): string {
  const v = String(value || '');
  return /^[A-Za-z0-9_-]+$/.test(v) ? v : '';
}

function runBackground(promise: Promise<any>) {
  if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
    EdgeRuntime.waitUntil(promise);
  } else {
    promise.catch(err => console.error('Background task error:', err));
  }
}

// 8 seconds debounce window — coalesces fragmented inbound messages so AI sees one input.
const AI_DEBOUNCE_MS = 8000;

/**
 * Schedule (or reschedule) an orchestrator trigger after a debounce window.
 * Each call writes a new token to conversations.metadata.pending_ai_trigger.
 * After the wait, we reread the conversation; if our token still matches, we proceed,
 * concatenating the inbound messages received during the window. Otherwise we abort
 * (a newer message took over).
 */
function scheduleDebouncedOrchestrator(
  supabase: any,
  conversationId: string,
  serviceRoleKey: string,
  orchestratorBody: Record<string, unknown>,
  initialMessageContent: string,
) {
  const token = crypto.randomUUID();
  const scheduledFor = new Date(Date.now() + AI_DEBOUNCE_MS).toISOString();

  const task = (async () => {
    try {
      // 1. Tag conversation with our pending trigger token
      const { data: convNow } = await supabase
        .from('conversations')
        .select('metadata')
        .eq('id', conversationId)
        .single();
      const meta = { ...(convNow?.metadata || {}) };
      meta.pending_ai_trigger = { token, scheduled_for: scheduledFor };
      await supabase.from('conversations').update({ metadata: meta }).eq('id', conversationId);

      // 2. Wait the debounce window
      await new Promise(r => setTimeout(r, AI_DEBOUNCE_MS));

      // 3. Reread — only proceed if we are still the most recent trigger
      const { data: convAfter } = await supabase
        .from('conversations')
        .select('metadata, last_message_at')
        .eq('id', conversationId)
        .single();
      const currentToken = convAfter?.metadata?.pending_ai_trigger?.token;
      if (currentToken !== token) {
        console.log(`[DEBOUNCE] Token mismatch for conv ${conversationId} — newer trigger took over, skipping`);
        return;
      }

      // 4. Aggregate recent inbound messages (within window + small buffer)
      const sinceIso = new Date(Date.now() - AI_DEBOUNCE_MS - 5000).toISOString();
      const { data: recentMsgs } = await supabase
        .from('messages')
        .select('content, created_at, direction')
        .eq('conversation_id', conversationId)
        .eq('direction', 'inbound')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: true });

      const combined = (recentMsgs || [])
        .map((m: any) => (m.content || '').trim())
        .filter(Boolean)
        .join('\n');
      const finalContent = combined || initialMessageContent || '[mídia]';

      // 5. Clear the pending trigger marker
      const cleanedMeta = { ...(convAfter?.metadata || {}) };
      delete cleanedMeta.pending_ai_trigger;
      await supabase.from('conversations').update({ metadata: cleanedMeta }).eq('id', conversationId);

      // 6. Fire the orchestrator
      const finalBody = { ...orchestratorBody, messageContent: finalContent };
      console.log(`[DEBOUNCE] Firing orchestrator for ${conversationId} with ${(recentMsgs || []).length} aggregated msgs`);
      await fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/agent-orchestrator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
        body: JSON.stringify(finalBody),
      });
    } catch (e) {
      console.error(`[DEBOUNCE] Error in scheduled orchestrator for ${conversationId}:`, e);
    }
  })();

  runBackground(task);
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Garante o código de país de forma country-aware: números nacionais BR crus
// ganham 55; números que já trazem código de país (ex.: EUA +1) são preservados.
// Delega em withCountryCode para não duplicar a heurística.
function ensureCountryCode(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 10) return '';
  return withCountryCode(clean);
}

// List of valid Brazilian DDDs
const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99
]);

function isValidPhoneNumber(phone: string): boolean {
  if (!phone) return false;
  const clean = phone.replace(/\D/g, '');

  if (clean.startsWith('55')) {
    if (clean.length < 12 || clean.length > 15) return false;
    const ddd = parseInt(clean.substring(2, 4), 10);
    return VALID_DDDS.has(ddd);
  }

  // Número com outro código de país (E.164 internacional, ex.: EUA +1).
  // Não exigimos DDD brasileiro — apenas um comprimento plausível de E.164.
  return clean.length >= 10 && clean.length <= 15;
}

function cleanPhone(raw: string): string {
  if (!raw) return '';
  const stripped = raw.replace(/@.*$/, '').replace(/[:\s\-\+\(\)]/g, '').replace(/\D/g, '');
  const preserved = withCountryCode(stripped);
  if (preserved && isValidPhoneNumber(preserved)) return preserved;
  const candidates = uniquePhones([ensureCountryCode(stripped), ...phoneVariants(stripped)]);
  return candidates.find(isValidPhoneNumber) || preserved || stripped || '';
}

function uniquePhones(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => !!value && value.length >= 8)));
}

function firstString(...values: any[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function firstObject(...values: any[]): any | null {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  }
  return null;
}

/**
 * Texto de uma resposta a botão/lista nativo do WhatsApp.
 *
 * O formato muda conforme o tipo de mensagem enviada e a versão do aparelho:
 * botão antigo (buttonsResponseMessage), botão de template
 * (templateButtonReplyMessage), lista (listResponseMessage) e o formato atual
 * que a Evolution usa, nativeFlow (interactiveResponseMessage, com display_text
 * e id dentro de um JSON em paramsJson).
 *
 * Devolve o texto exibido quando existe e o id da opção quando não — o
 * casamento com as saídas do nó aceita os dois.
 */
function extractInteractiveReplyText(reply: any): string | null {
  const nativeFlow = reply.nativeFlowResponseMessage || reply.NativeFlowResponseMessage;
  let nativeFlowText: string | null = null;
  let nativeFlowId: string | null = null;
  if (nativeFlow?.paramsJson || nativeFlow?.ParamsJson) {
    try {
      const params = JSON.parse(nativeFlow.paramsJson || nativeFlow.ParamsJson);
      nativeFlowText = params?.display_text || params?.displayText || null;
      nativeFlowId = params?.id || params?.selectedId || null;
    } catch {
      // paramsJson malformado: sobra o texto do corpo, tratado abaixo.
    }
  }

  const singleSelect = reply.singleSelectReply || reply.SingleSelectReply;

  // O nativeFlow vem antes do corpo de propósito: no quick_reply da Evolution o
  // body.text é o texto genérico "Sent a quick reply", que não casa com saída
  // nenhuma — o rótulo real está no paramsJson.
  const value = reply.selectedDisplayText || reply.SelectedDisplayText
    || nativeFlowText
    || nativeFlowId
    || reply.title || reply.Title
    || reply.selectedButtonId || reply.SelectedButtonId
    || reply.selectedId || reply.SelectedId
    || singleSelect?.selectedRowId || singleSelect?.SelectedRowId
    || reply.body?.text || reply.Body?.text
    || null;

  return value ? String(value).trim() : null;
}

function firstNonEmptyObject(...values: any[]): any | null {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) return value;
  }
  return null;
}

function normalizeExternalMessageId(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : trimmed;
}

function findObjectDeep(root: any, predicate: (value: any, path: string[]) => boolean, maxDepth = 8): { value: any; path: string[] } | null {
  const seen = new WeakSet<object>();
  const walk = (value: any, path: string[], depth: number): { value: any; path: string[] } | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (seen.has(value)) return null;
    seen.add(value);
    if (predicate(value, path)) return { value, path };
    if (depth >= maxDepth) return null;

    for (const [key, child] of Object.entries(value)) {
      const found = walk(child, [...path, key], depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(root, [], 0);
}

function findContextInfoDeep(root: any): { value: any; path: string[] } | null {
  return findObjectDeep(root, (value) =>
    !!(
      value.stanzaId
      || value.StanzaId
      || value.quotedMessageId
      || value.quotedStanzaId
      || value.quotedMessageID
      || value.quotedMessage
      || value.QuotedMessage
    )
  );
}

function findKeyPathsDeep(root: any, pattern: RegExp, maxDepth = 8, limit = 30): string[] {
  const paths: string[] = [];
  const seen = new WeakSet<object>();
  const walk = (value: any, path: string[], depth: number) => {
    if (!value || typeof value !== 'object' || seen.has(value) || paths.length >= limit) return;
    seen.add(value);
    if (depth >= maxDepth) return;

    for (const [key, child] of Object.entries(value)) {
      const nextPath = [...path, key];
      if (pattern.test(key)) paths.push(nextPath.join('.'));
      if (child && typeof child === 'object') walk(child, nextPath, depth + 1);
      if (paths.length >= limit) return;
    }
  };
  walk(root, [], 0);
  return paths;
}

function extractMediaUrlFromObject(media: any): string | null {
  if (!media || typeof media !== 'object') return null;
  return firstString(
    media.url,
    media.URL,
    media.mediaUrl,
    media.mediaURL,
    media.media_url,
    media.fileUrl,
    media.fileURL,
    media.file_url,
    media.audioUrl,
    media.audioURL,
    media.audio_url,
    media.pttUrl,
    media.pttURL,
    media.ptt_url,
    media.voiceUrl,
    media.voiceURL,
    media.voice_url,
    media.downloadUrl,
    media.downloadURL,
    media.download_url,
    media.link,
    media.path,
    media.media?.url,
    media.media?.URL,
    media.media?.fileUrl,
    media.media?.fileURL,
    media.data?.url,
    media.data?.URL,
    media.data?.fileUrl,
    media.data?.fileURL,
    media.data?.downloadUrl,
    media.data?.downloadURL,
  );
}

function extractBase64FromObject(media: any): string | null {
  if (!media || typeof media !== 'object') return null;
  const value = firstString(
    media.base64,
    media.Base64,
    media.base64Data,
    media.base64_data,
    media.audioBase64,
    media.audio_base64,
    media.data?.base64,
    media.data?.base64Data,
    media.data?.base64_data,
    media.media?.base64,
    media.media?.base64Data,
    media.media,
  );
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return null;
  return value;
}

function extractMimeTypeFromObject(media: any): string | null {
  if (!media || typeof media !== 'object') return null;
  return firstString(
    media.mimetype,
    media.mimeType,
    media.MimeType,
    media.mime_type,
    media.contentType,
    media.content_type,
    media.type,
    media.media?.mimetype,
    media.media?.mimeType,
    media.data?.mimetype,
    media.data?.mimeType,
    media.data?.contentType,
  );
}

function normalizeBaseUrl(value?: string | null): string {
  return (value || '').trim().replace(/\/+$/, '');
}

/**
 * Alça de saída gerada por um botão de mensagem de follow-up.
 * Cópia exata de src/components/flow/nodes/followUpOutputs.tsx — as duas precisam
 * produzir o mesmo id, senão a aresta desenhada no editor não é encontrada aqui.
 */
function followUpHandleId(label: string): string {
  const decomposed = (label || '').trim().normalize('NFD');
  let slug = '';
  for (const char of decomposed) {
    const code = char.charCodeAt(0);
    if (code >= 0x300 && code <= 0x36f) continue;
    const lower = char.toLowerCase();
    slug += (lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9') ? lower : '_';
  }
  slug = slug.replace(/_+/g, '_').replace(/^_/, '').replace(/_$/, '');

  if (slug) return `fu_${slug}`;

  let hash = 5381;
  for (let i = 0; i < label.length; i++) {
    hash = ((hash << 5) + hash + label.charCodeAt(i)) >>> 0;
  }
  return `fu_h${hash.toString(36)}`;
}

/**
 * Casa a resposta do contato com os botões da mensagem de follow-up que foi enviada.
 * Ordem: rótulo exato > número (a lista numerada do fallback em texto) > parcial.
 * O parcial fica por último de propósito: com botões "Não" e "Não sei", "não sei"
 * precisa ganhar do "Não" que apareceria primeiro num casamento único.
 */
function matchFollowUpButtonHandle(
  node: any,
  remarketingStep: number,
  userText: string,
): { handleId: string; exact: boolean } | null {
  const steps = (node?.data?.remarketingSteps || []) as any[];
  const text = (userText || '').trim().toLowerCase();
  // remarketing_step 0 = nenhuma tentativa saiu ainda, então nenhum botão foi mostrado.
  if (!steps.length || !text || !remarketingStep) return null;

  // O contador já aponta para a próxima tentativa; a enviada é a anterior.
  const sentIndex = Math.min(Math.max(remarketingStep - 1, 0), steps.length - 1);
  const sentStep = steps[sentIndex];
  const ordered = [sentStep, ...steps.filter((_: any, i: number) => i !== sentIndex)];

  const labelsOf = (step: any) =>
    ((step?.buttons || []) as any[])
      .map((b: any) => (b?.label || '').trim())
      .filter(Boolean);

  for (const step of ordered) {
    const labels = labelsOf(step);
    if (!labels.length) continue;

    for (const label of labels) {
      if (text === label.toLowerCase()) return { handleId: followUpHandleId(label), exact: true };
    }

    if (step === sentStep) {
      const index = Number(text);
      if (Number.isInteger(index) && index >= 1 && index <= labels.length) {
        return { handleId: followUpHandleId(labels[index - 1]), exact: true };
      }
    }

    for (const label of labels) {
      const lower = label.toLowerCase();
      if (text.includes(lower) || lower.includes(text)) {
        return { handleId: followUpHandleId(label), exact: false };
      }
    }
  }

  return null;
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

function isEncryptedWhatsAppMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('mmg.whatsapp.net')
    || lower.includes('whatsapp.net')
    || lower.includes('/mms/')
    || lower.includes('enc=')
    || lower.includes('media-key')
    || lower.includes('mediakey');
}

function isProbablyBase64(value?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.startsWith('data:')) return trimmed.includes('base64,');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return false;
  return /^[A-Za-z0-9+/=_-]{80,}$/.test(trimmed.replace(/\s+/g, ''));
}

function isUsefulMediaAnalysis(value?: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return ![
    '[transcrição não disponível]',
    '[transcriã§ã£o nã£o disponã­vel]',
    '[áudio não disponível]',
    '[ãudio nã£o disponã­vel]',
    '[erro na transcrição]',
    '[erro na transcriã§ã£o]',
    '[áudio inaudível]',
    '[ãudio inaudã­vel]',
  ].includes(normalized);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function isLocalStorageUrl(url?: string | null): boolean {
  if (!url) return false;
  return url.includes('/storage/v1/object/public/chat-media/');
}

function normalizeBase64Candidate(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('http://') || trimmed.startsWith('https://')) return null;
  if (trimmed.startsWith('data:') && trimmed.includes('base64,')) {
    return trimmed.split('base64,')[1] || null;
  }
  return trimmed;
}

function extractDownloadedMedia(data: any): { base64: string | null; mimeType: string | null; url: string | null } {
  const candidateBase64 = firstString(
    data?.base64,
    data?.Base64,
    data?.base64Data,
    data?.base64Url,
    data?.base64_url,
    data?.fileBase64,
    data?.file_base64,
    data?.data?.base64,
    data?.data?.Base64,
    data?.data?.base64Data,
    data?.data?.base64Url,
    data?.data?.base64_url,
    data?.data?.fileBase64,
    data?.data?.file_base64,
    data?.media?.base64,
    data?.media?.Base64,
    data?.media?.base64Data,
    data?.media?.base64Url,
    data?.media?.base64_url,
    data?.result?.base64,
    data?.result?.Base64,
    data?.result?.base64Data,
    data?.result?.base64Url,
    data?.result?.base64_url,
    data?.response?.base64,
    data?.response?.base64Data,
    typeof data === 'string' ? data : null,
  );

  const candidateUrl = firstString(
    data?.fileUrl,
    data?.fileURL,
    data?.file_url,
    data?.downloadUrl,
    data?.downloadURL,
    data?.download_url,
    data?.mediaUrl,
    data?.mediaURL,
    data?.media_url,
    data?.url,
    data?.URL,
    data?.link,
    data?.data?.fileUrl,
    data?.data?.fileURL,
    data?.data?.file_url,
    data?.data?.downloadUrl,
    data?.data?.downloadURL,
    data?.data?.download_url,
    data?.data?.mediaUrl,
    data?.data?.mediaURL,
    data?.data?.media_url,
    data?.data?.url,
    data?.data?.URL,
    data?.data?.link,
    data?.media?.fileUrl,
    data?.media?.fileURL,
    data?.media?.file_url,
    data?.media?.downloadUrl,
    data?.media?.downloadURL,
    data?.media?.download_url,
    data?.media?.url,
    data?.result?.fileUrl,
    data?.result?.fileURL,
    data?.result?.file_url,
    data?.result?.downloadUrl,
    data?.result?.downloadURL,
    data?.result?.download_url,
    data?.result?.mediaUrl,
    data?.result?.mediaURL,
    data?.result?.media_url,
    data?.result?.url,
    data?.result?.URL,
    data?.response?.fileUrl,
    data?.response?.downloadUrl,
    data?.response?.url,
  );

  return {
    base64: normalizeBase64Candidate(candidateBase64),
    mimeType: firstString(
      data?.mimetype,
      data?.mimeType,
      data?.MimeType,
      data?.contentType,
      data?.type,
      data?.data?.mimetype,
      data?.data?.mimeType,
      data?.data?.contentType,
      data?.data?.type,
      data?.media?.mimetype,
      data?.media?.mimeType,
      data?.media?.contentType,
      data?.media?.type,
      data?.result?.mimetype,
      data?.result?.mimeType,
      data?.result?.contentType,
      data?.result?.type,
      data?.response?.mimetype,
      data?.response?.mimeType,
    ),
    url: candidateUrl && !isEncryptedWhatsAppMediaUrl(candidateUrl) ? candidateUrl : null,
  };
}

// Retorna o número em E.164 completo, de forma country-aware.
// - Já começa com 55 (Brasil) → mantém.
// - Número NACIONAL brasileiro cru (10 díg. = DDD+8; ou 11 díg. com o 9º dígito
//   de celular) com DDD válido → prefixa 55.
// - Qualquer outro caso é tratado como número internacional que JÁ traz o
//   código de país (ex.: EUA +1), como vem no JID do WhatsApp → preserva.
//   ANTES o código forçava 55 em QUALQUER número de 10-11 dígitos, o que
//   corrompia números estrangeiros (ex.: 18572664160 virava 5518572664160).
function withCountryCode(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (!clean) return '';
  if (clean.startsWith('55')) return clean;
  const ddd = parseInt(clean.substring(0, 2), 10);
  if (clean.length === 10 && VALID_DDDS.has(ddd)) return `55${clean}`;
  if (clean.length === 11 && clean[2] === '9' && VALID_DDDS.has(ddd)) return `55${clean}`;
  return clean;
}

function withoutCountryCode(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  return clean.startsWith('55') ? clean.slice(2) : clean;
}

function phoneVariants(raw: string): string[] {
  const clean = raw.replace(/@.*$/, '').replace(/\D/g, '');
  if (!clean) return [];

  const variants = new Set<string>();
  const add = (value: string) => {
    if (!value) return;
    variants.add(value);
    const with55 = withCountryCode(value);
    if (with55) variants.add(with55);
    const no55 = withoutCountryCode(value);
    if (no55) variants.add(no55);
  };

  add(clean);

  const local = withoutCountryCode(clean);
  if (local.length === 10) {
    // DDD + 8 digits -> possible mobile form with 9 after DDD
    add(`${local.slice(0, 2)}9${local.slice(2)}`);
  }
  if (local.length === 11 && local[2] === '9') {
    // DDD + 9 + 8 digits -> legacy form without 9
    add(`${local.slice(0, 2)}${local.slice(3)}`);
  }

  return uniquePhones(Array.from(variants));
}

function canonicalPhone(raw: string): string {
  const clean = raw.replace(/@.*$/, '').replace(/\D/g, '');
  if (!clean) return '';
  const preserved = withCountryCode(clean);
  return preserved || clean;
}

function normalizeProviderMessageId(value: any): string {
  if (!value) return '';
  return String(value).replace(/^\s+|\s+$/g, '').replace(/^true_/, '').replace(/^false_/, '');
}

function receiptPatchFromStatus(statusValue: any) {
  const now = new Date().toISOString();
  const status = String(statusValue ?? '').toLowerCase();
  const ack = Number(statusValue);
  const patch: any = {};

  if (ack >= 2 || ['delivery_ack', 'delivered', 'delivery'].includes(status)) {
    patch.delivered_at = now;
  }

  if (ack >= 3 || ['read', 'read_ack', 'played', 'played_ack'].includes(status)) {
    patch.delivered_at = now;
    patch.read_at = now;
  }

  if (ack >= 4 || ['played', 'played_ack'].includes(status)) {
    patch.metadata = { played_at: now };
  }

  return patch;
}

async function updateMessageReceiptByProviderId(supabase: any, msgId: any, statusValue: any, conversationId?: string | null) {
  const rawId = String(msgId || '').trim();
  const normalizedId = normalizeProviderMessageId(msgId);
  if (!normalizedId) return false;

  const updateData = receiptPatchFromStatus(statusValue);
  if (Object.keys(updateData).length === 0) return false;

  const idCandidates = Array.from(new Set([
    rawId,
    normalizedId,
    `true_${normalizedId}`,
    `false_${normalizedId}`,
  ].filter(Boolean)));

  if (updateData.metadata) {
    let existingQuery = supabase
      .from('messages')
      .select('metadata')
      .in('zapi_message_id', idCandidates);
    if (conversationId) existingQuery = existingQuery.eq('conversation_id', conversationId);
    const { data: existing } = await existingQuery.maybeSingle();
    updateData.metadata = { ...(existing?.metadata || {}), ...updateData.metadata };
  }

  let updateQuery = supabase
    .from('messages')
    .update(updateData)
    .in('zapi_message_id', idCandidates);
  if (conversationId) updateQuery = updateQuery.eq('conversation_id', conversationId);
  const { error } = await updateQuery;

  if (error) {
    console.error('[RECEIPT] Failed to update message receipt:', error);
    return false;
  }
  return true;
}

function extractRevokedMessageInfo(payload: any): { messageId: string; fromMe: boolean | null } {
  const data = payload?.data || {};
  const key = data?.key || payload?.key || payload?.message?.key || {};
  const protocolMessage = data?.message?.protocolMessage
    || payload?.message?.protocolMessage
    || payload?.event?.Message?.protocolMessage
    || payload?.event?.message?.protocolMessage
    || {};
  const protocolKey = protocolMessage?.key || {};
  const eventInfo = payload?.event?.Info || payload?.event?.info || {};
  const msg = payload?.message || {};

  const messageId =
    protocolKey?.id ||
    protocolMessage?.messageKey?.id ||
    protocolMessage?.id ||
    key?.id ||
    msg?.msgid ||
    msg?.id ||
    eventInfo?.ID ||
    eventInfo?.Id ||
    eventInfo?.id ||
    payload?.messageId ||
    payload?.id ||
    '';

  const rawFromMe =
    protocolKey?.fromMe ??
    key?.fromMe ??
    eventInfo?.IsFromMe ??
    eventInfo?.isFromMe ??
    msg?.fromMe ??
    payload?.fromMe;

  const fromMe = rawFromMe === true || rawFromMe === 'true'
    ? true
    : rawFromMe === false || rawFromMe === 'false'
      ? false
      : null;

  return { messageId: String(messageId || ''), fromMe };
}

async function handleRevokedMessage(supabase: any, payload: any) {
  const { messageId, fromMe } = extractRevokedMessageInfo(payload);
  const normalizedId = normalizeProviderMessageId(messageId);
  if (!normalizedId) {
    return respond({ success: true, ignored: true, reason: 'revoked_without_message_id' });
  }

  const idCandidates = Array.from(new Set([
    messageId,
    normalizedId,
    `true_${normalizedId}`,
    `false_${normalizedId}`,
  ].filter(Boolean)));

  const { data: message } = await supabase
    .from('messages')
    .select('id, direction, content, type, media_url, metadata')
    .in('zapi_message_id', idCandidates)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!message) {
    return respond({ success: true, ignored: true, reason: 'revoked_message_not_found' });
  }

  if (fromMe === true) {
    const metadata = {
      ...(message.metadata || {}),
      whatsapp_deleted: true,
      whatsapp_deleted_by_us: true,
      whatsapp_deleted_at: new Date().toISOString(),
      whatsapp_delete_source: 'whatsapp',
      original_type: message.type,
      original_content: message.content,
      original_media_url: message.media_url,
    };

    await supabase
      .from('messages')
      .update({
        content: message.type === 'image' ? 'Imagem apagada no WhatsApp' : 'Mensagem apagada no WhatsApp',
        type: 'text',
        media_url: null,
        metadata,
      })
      .eq('id', message.id);

    return respond({ success: true, marked_deleted: true, source: 'whatsapp_self_delete' });
  }

  const metadata = {
    ...(message.metadata || {}),
    whatsapp_revoked: true,
    revoked_by_contact_at: new Date().toISOString(),
  };

  await supabase
    .from('messages')
    .update({ metadata })
    .eq('id', message.id);

  return respond({ success: true, preserved: true, source: 'contact_delete' });
}

async function upsertContactPresenceByPhone(
  supabase: any,
  rawPhone: string,
  instanceId: string,
  instanceName: string,
  presenceType = 'online',
  ttlMs = 60000,
) {
  const phone = cleanPhone(rawPhone);
  if (!phone) return false;

  const { data: whatsappInstance } = await supabase
    .from('whatsapp_instances')
    .select('id, organization_id')
    .or([
      instanceId ? `zapi_instance_id.eq.${instanceId}` : '',
      instanceName ? `zapi_instance_id.eq.${instanceName}` : '',
      instanceName ? `evolution_instance_name.eq.${instanceName}` : '',
      instanceId ? `evolution_instance_id.eq.${instanceId}` : '',
    ].filter(Boolean).join(','))
    .maybeSingle();

  if (!whatsappInstance) return false;

  const variants = phoneVariants(phone);
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', whatsappInstance.organization_id)
    .in('phone', variants.length > 0 ? variants : [phone])
    .limit(1)
    .maybeSingle();

  if (!contact) return false;

  await supabase.from('contact_presence').upsert({
    contact_id: contact.id,
    organization_id: whatsappInstance.organization_id,
    presence_type: presenceType,
    started_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  }, { onConflict: 'contact_id' });

  return true;
}

function isGroupChat(chatid: string): boolean {
  return chatid?.includes('@g.us') || chatid?.includes('@broadcast') || false;
}

function cleanOriginPhone(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).split('@')[0].split(':')[0];
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

function getConnectedPhoneSnapshot(instance: any, payload?: any): string | null {
  const candidates = [
    instance?.phone_number,
    instance?.logical_phone,
    instance?.provider_settings?.phone_number,
    instance?.provider_settings?.phoneNumber,
    instance?.provider_settings?.connected_phone,
    instance?.provider_settings?.connectedPhone,
    payload?.connected_phone,
    payload?.connectedPhone,
    payload?.phone_number,
    payload?.phoneNumber,
    payload?.instancePhone,
    payload?.instance_phone,
    payload?.owner,
    payload?.ownerJid,
    payload?.me?.id,
    payload?.me?.jid,
    payload?.data?.owner,
    payload?.data?.ownerJid,
    payload?.data?.me?.id,
    payload?.data?.me?.jid,
  ];

  for (const candidate of candidates) {
    const phone = cleanOriginPhone(candidate);
    if (phone) return phone;
  }

  return null;
}

async function recordConversationOriginAudit(
  supabase: any,
  params: {
    organizationId: string;
    conversationId: string;
    whatsappInstance?: any;
    messageId?: string | null;
    connectedPhone?: string | null;
    capturedFrom: string;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    const instance = params.whatsappInstance || {};
    const { error } = await supabase.rpc('record_conversation_origin_audit', {
      _organization_id: params.organizationId,
      _conversation_id: params.conversationId,
      _whatsapp_instance_id: instance.id || null,
      _message_id: params.messageId || null,
      _connected_phone: params.connectedPhone || getConnectedPhoneSnapshot(instance) || null,
      _provider: instance.provider || null,
      _provider_instance_id: instance.evolution_instance_id || instance.zapi_instance_id || null,
      _provider_instance_name: instance.evolution_instance_name || instance.zapi_instance_id || null,
      _captured_from: params.capturedFrom,
      _metadata: params.metadata || {},
    });

    if (error) console.error('[ORIGIN_AUDIT] Failed to record origin:', error);
  } catch (error) {
    console.error('[ORIGIN_AUDIT] Failed to record origin:', error);
  }
}

// ── RATE LIMITING for webhook ──
const webhookRateStore = new Map<string, { count: number; resetAt: number }>()
const WEBHOOK_RATE_LIMIT = 300 // per minute per IP
const WEBHOOK_WINDOW_MS = 60_000

function checkWebhookRate(ip: string): boolean {
  const now = Date.now()
  const entry = webhookRateStore.get(ip)
  if (!entry || now > entry.resetAt) {
    webhookRateStore.set(ip, { count: 1, resetAt: now + WEBHOOK_WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= WEBHOOK_RATE_LIMIT
}

// ── AI PAUSE CHECK ──
function isAIPaused(metadata: any): boolean {
  const pausedUntil = metadata?.ai_paused_until;
  if (!pausedUntil) return false;
  if (pausedUntil === 'permanent') return true;
  // Check if the pause time has expired
  const pauseDate = new Date(pausedUntil);
  if (isNaN(pauseDate.getTime())) return false;
  return Date.now() < pauseDate.getTime();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate monitoring (log-only, never reject to avoid losing messages)
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    if (!checkWebhookRate(clientIP)) {
      console.warn(`[RATE_MONITOR] High webhook volume from IP: ${clientIP.substring(0, 8)}*** — processing normally`);
    }

    // Webhook signature validation (UAZAPI token-based)
    const webhookToken = req.headers.get('x-webhook-token') || req.headers.get('x-api-key') || '';
    const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN') || '';
    // If ZAPI_CLIENT_TOKEN is configured and a token header is present, validate it
    if (zapiClientToken && webhookToken && webhookToken !== zapiClientToken) {
      console.warn('[WEBHOOK_AUTH] Invalid webhook token received');
      return new Response(JSON.stringify({ error: 'Invalid webhook token' }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json();

    // UAZAPI uses EventType, not type
    console.log('UAZAPI Full Payload:', JSON.stringify(payload, null, 2));

    const eventType = (payload.EventType || payload.eventType || payload.type || payload.event || '').toLowerCase();
    const instanceId = sanitizeInstanceIdentifier(payload.instanceId);
    const instanceName = sanitizeInstanceIdentifier(payload.instanceName || payload.userID || payload.instance);
    const lookupIdentifier = instanceId || instanceName;

    console.log('=== UAZAPI WEBHOOK ===');
    console.log('EventType:', eventType, '| InstanceId:', instanceId, '| InstanceName:', instanceName);

    if (lookupIdentifier) {
      try {
        const auditFilters = [];
        if (instanceId) auditFilters.push(`zapi_instance_id.eq.${instanceId}`);
        if (instanceName) auditFilters.push(`zapi_instance_id.eq.${instanceName}`);
        if (instanceName) auditFilters.push(`evolution_instance_name.eq.${instanceName}`);
        if (instanceId) auditFilters.push(`evolution_instance_id.eq.${instanceId}`);

        if (auditFilters.length > 0) {
          const { data: auditInstance } = await supabase
            .from('whatsapp_instances')
            .select('id, organization_id, phone_number')
            .or(auditFilters.join(','))
            .maybeSingle();

          if (auditInstance) {
            await supabase.from('whatsapp_connection_logs').insert({
              organization_id: auditInstance.organization_id,
              instance_id: auditInstance.id,
              event_type: 'webhook_received',
              phone_number: auditInstance.phone_number,
              details: {
                eventType,
                instanceId,
                instanceName,
                payloadKeys: Object.keys(payload || {}),
                dataKeys: payload?.data ? Object.keys(payload.data) : [],
                messageKeys: payload?.data?.message ? Object.keys(payload.data.message) : [],
                key: payload?.data?.key || null,
                received_at: new Date().toISOString(),
              },
            });
          }
        }
      } catch (auditError) {
        console.error('[WEBHOOK_AUDIT] Failed to record webhook receipt:', auditError);
      }
    }

    if (eventType.includes('revoked') || eventType.includes('revoke')) {
      return await handleRevokedMessage(supabase, payload);
    }

    const payloadHasProtocolRevoke =
      payload?.data?.message?.protocolMessage?.type ||
      payload?.message?.protocolMessage?.type ||
      payload?.event?.Message?.protocolMessage?.type;
    if (payloadHasProtocolRevoke && String(payloadHasProtocolRevoke).toLowerCase().includes('revoke')) {
      return await handleRevokedMessage(supabase, payload);
    }

    // System events to ignore
    if (['connectfailure', 'qr', 'qrtimeout', 'historysync',
      'notification', 'e2e_notification', 'ciphertext', 'protocol'].includes(eventType)) {
      return respond({ success: true, ignored: true, reason: 'system_event' });
    }

    // Handle connection events
    if (eventType === 'connected' || eventType === 'pairsuccess' || eventType === 'connection_update' || eventType === 'connection.update') {
      const connectionState = String(payload.data?.state || payload.state || payload.status || '').toLowerCase();
      if ((eventType === 'connection_update' || eventType === 'connection.update') && !['open', 'connected', 'online'].includes(connectionState)) {
        if (['close', 'closed', 'disconnected', 'loggedout'].includes(connectionState) && (instanceId || instanceName)) {
          await supabase
            .from('whatsapp_instances')
            .update({ status: 'disconnected', is_active: false, disconnected_at: new Date().toISOString() })
            .or([
              instanceId ? `zapi_instance_id.eq.${instanceId}` : '',
              instanceName ? `zapi_instance_id.eq.${instanceName}` : '',
              instanceName ? `evolution_instance_name.eq.${instanceName}` : '',
              instanceId ? `evolution_instance_id.eq.${instanceId}` : '',
            ].filter(Boolean).join(','));
        }
        return respond({ success: true, ignored: true, reason: 'connection_not_open', state: connectionState });
      }

      console.log(`[BOOTSTRAP] Instance ${instanceName} connected. Triggering sync...`);

      // Update instance status in background
      const payloadTokenConn = payload.token || '';
      if (instanceId || instanceName || payloadTokenConn) {
        const updateQuery = supabase.from('whatsapp_instances')
          .update({ status: 'connected', is_active: true, connected_at: new Date().toISOString() });
        
        const orFilters = [];
        if (instanceId) orFilters.push(`zapi_instance_id.eq.${instanceId}`);
        if (instanceName) orFilters.push(`zapi_instance_id.eq.${instanceName}`);
        if (instanceName) orFilters.push(`evolution_instance_name.eq.${instanceName}`);
        if (instanceId) orFilters.push(`evolution_instance_id.eq.${instanceId}`);
        if (payloadTokenConn) orFilters.push(`zapi_token.eq.${payloadTokenConn}`);
        
        updateQuery.or(orFilters.join(','))
          .then(({ error }: { error: any }) => {
            if (error) console.error('Error updating instance on connect:', error);
          });
      }

      // Trigger sync functions in background
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const baseUrl = Deno.env.get('SUPABASE_URL')!;

      const syncPromise = fetch(`${baseUrl}/functions/v1/zapi-sync-chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({
          instanceId: instanceId || instanceName,
          instanceName: instanceName
        }),
      });
      runBackground(syncPromise);

      // Reaplica o webhook DEPOIS que a conexão sobe. O re-pareamento da Evolution
      // derruba a inscrição de MESSAGES_UPSERT (mensagens recebidas): todos os
      // outros eventos seguem chegando — connection/send/presence/messages.update —
      // menos o de mensagem recebida. Como connection.update É entregue de forma
      // confiável a cada reconexão, este é o ponto certo para curar o drift sem
      // depender do app nem de reconectar manualmente.
      const reconfigureWebhookPromise = (async () => {
        try {
          const reFilters: string[] = [];
          if (instanceId) reFilters.push(`zapi_instance_id.eq.${instanceId}`);
          if (instanceName) reFilters.push(`zapi_instance_id.eq.${instanceName}`);
          if (instanceName) reFilters.push(`evolution_instance_name.eq.${instanceName}`);
          if (instanceId) reFilters.push(`evolution_instance_id.eq.${instanceId}`);
          if (payloadTokenConn) reFilters.push(`zapi_token.eq.${payloadTokenConn}`);
          if (!reFilters.length) {
            console.warn('[WEBHOOK_REHEAL] No identifiers to resolve instance; skipping reconfigure');
            return;
          }
          const { data: connectedInstance } = await supabase
            .from('whatsapp_instances')
            .select('id, organization_id')
            .or(reFilters.join(','))
            .limit(1)
            .maybeSingle();
          if (!connectedInstance?.id) {
            console.warn('[WEBHOOK_REHEAL] Could not resolve instance to reconfigure webhook');
            return;
          }
          const resp = await fetch(`${baseUrl}/functions/v1/zapi-configure-webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
            body: JSON.stringify({
              organization_id: connectedInstance.organization_id,
              instanceId: connectedInstance.id,
            }),
          });
          const text = await resp.text().catch(() => '');
          console.log(`[WEBHOOK_REHEAL] Reconfigured webhook for instance ${connectedInstance.id} after connect: ${resp.status} ${text.substring(0, 200)}`);
        } catch (e) {
          console.error('[WEBHOOK_REHEAL] Failed to reconfigure webhook after connect:', e);
        }
      })();
      runBackground(reconfigureWebhookPromise);

      return respond({ success: true, message: 'connection_handled' });
    }

    // Handle read receipts / message status updates before generic message events.
    const receiptEventTypes = ['readreceipt', 'ack', 'messages.update', 'messages_update', 'messages-update', 'message.update', 'message_update', 'status.update', 'status_update', 'message_status'];
    if (receiptEventTypes.includes(eventType)) {
      return await handleReadReceipt(supabase, payload);
    }

    // Handle presence
    const presenceEventTypes = ['presence', 'chatpresence', 'presence.update', 'presence_update', 'presence-update', 'presences'];
    if (presenceEventTypes.includes(eventType)) {
      return await handlePresence(supabase, payload, instanceId, instanceName);
    }

    // Handle WhatsApp Business label events (Evolution: labels.edit / labels.association)
    const labelEventTypes = ['labels.edit', 'labels_edit', 'labels-edit', 'labels.association', 'labels_association', 'labels-association'];
    if (labelEventTypes.includes(eventType)) {
      try {
        return await handleLabelEvent(supabase, payload, instanceId, instanceName, eventType);
      } catch (labelError) {
        console.error('[WEBHOOK] handleLabelEvent crashed but returning 200 to prevent retry loop:', labelError);
        return respond({ success: false, error: 'label_handler_error', detail: String(labelError) });
      }
    }

    // Handle message and media events - catch ALL possible UAZAPI event types for messages/media
    const messageEventTypes = ['messages', 'message', 'media', 'document', 'audio', 'video', 'image', 'sticker', 'location', 'contact', 'ptt', 'messages-upsert', 'messages.upsert', 'messages_upsert', 'send_message'];
    if (messageEventTypes.includes(eventType)) {
      try {
        return await handleMessage(supabase, payload, instanceId, instanceName, eventType);
      } catch (msgError) {
        console.error('[WEBHOOK] handleMessage crashed but returning 200 to prevent retry loop:', msgError);
        return respond({ success: false, error: 'message_handler_error', detail: String(msgError) });
      }
    }

    // Handle call events
    if (eventType.startsWith('call')) {
      return respond({ success: true, ignored: true, reason: 'call_event' });
    }

    // Handle chat updates (UAZAPI sends these too) - extract message from it
    if (eventType === 'chats' || eventType === 'chat') {
      // Chat update events sometimes contain messages
      if (payload.message?.msgid || payload.event?.Info?.ID) {
        try {
          return await handleMessage(supabase, payload, instanceId, instanceName, eventType);
        } catch (msgError) {
          console.error('[WEBHOOK] handleMessage (chat) crashed:', msgError);
          return respond({ success: false, error: 'message_handler_error', detail: String(msgError) });
        }
      }
      return respond({ success: true, ignored: true, reason: 'chat_update' });
    }


    console.log('Ignoring unknown event type:', eventType);
    return respond({ success: true, ignored: true, type: eventType });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function respond(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleMessage(supabase: any, payload: any, instanceId: string, instanceName: string, eventType: string) {
  // Log payload keys for diagnostics (helps identify media field names)
  console.log(`[WEBHOOK handleMessage] Payload keys: ${Object.keys(payload).join(', ')}`);
  if (payload.event) {
    console.log(`[WEBHOOK handleMessage] event keys: ${Object.keys(payload.event).join(', ')}`);
    if (payload.event.Message) {
      console.log(`[WEBHOOK handleMessage] event.Message keys: ${Object.keys(payload.event.Message).join(', ')}`);
    }
  }

  // ==================================================================
  // UAZAPI sends messages in TWO possible formats:
  //   Format A (wuzapi/UAZAPI native):
  //     payload.type = "Message"
  //     payload.event = { Info: { ID, IsFromMe, MessageSource: { Chat } }, Message: { conversation, audioMessage, imageMessage, ... } }
  //     payload.base64, payload.mimeType (for media)
  //   Format B (legacy/alternative):
  //     payload.message = { msgid, fromMe, type, content, chatid, ... }
  //     payload.chat = { phone, wa_chatid, ... }
  // We handle BOTH formats by normalizing into common variables.
  // ==================================================================

  const event = payload.event || {};
  const eventInfo = event.Info || event.info || {};
  const eventMessage = event.Message || event.message || {};
  const evolutionData = payload.data || {};
  const evolutionKey = evolutionData.key || {};
  const evolutionMessage = evolutionData.message || {};
  const msgSource = eventInfo.MessageSource || eventInfo.messageSource || eventInfo;
  const msg = payload.message || {};
  const chat = payload.chat || {};

  // --- Extract phone (JID -> phone) ---
  const evolutionRemoteJidAlt = evolutionKey.remoteJidAlt || evolutionKey.remoteJid_alt || evolutionKey.remoteJidAlternative || '';
  const evolutionParticipantAlt = evolutionKey.participantAlt || evolutionKey.participant_alt || '';
  const evolutionRemoteJid = evolutionRemoteJidAlt || evolutionKey.remoteJid || '';
  const chatJid = msgSource.Chat || msgSource.chat || eventInfo.Chat || eventInfo.chat || evolutionRemoteJid || '';
  const senderJid = msgSource.Sender || msgSource.sender || eventInfo.Sender || eventInfo.sender || evolutionParticipantAlt || evolutionKey.participant || '';
  const chatid = msg.chatid || chat.wa_chatid || chatJid || '';

  if (isGroupChat(chatid) || chatid.includes('@g.us')) {
    return respond({ success: true, ignored: true, reason: 'group_message' });
  }

  // Skip LID identifiers only when Evolution did not provide the real WhatsApp JID alternative.
  if ((chatid.includes('@lid') && !evolutionRemoteJidAlt) || (senderJid.includes('@lid') && !evolutionParticipantAlt && !evolutionRemoteJidAlt)) {
    console.log('Skipping @lid message without alternate WhatsApp JID');
    return respond({ success: true, ignored: true, reason: 'lid_message' });
  }

  // Chat @lid: o remoteJid anônimo é a ÚNICA chave que os eventos de etiqueta
  // trazem (labels.association manda chatId=<lid>@lid, sem telefone). A mensagem
  // é a única hora em que o WhatsApp entrega o lid e o telefone real juntos —
  // guardamos o par no contato para resolver a etiqueta depois sem depender do
  // Postgres da Evolution.
  const rawChatJid = String(evolutionKey.remoteJid || chatid || '');
  const contactLid = rawChatJid.includes('@lid')
    ? rawChatJid.split('@')[0].replace(/\D/g, '')
    : '';

  let phone = '';
  // Try UAZAPI JID format first
  if (chatJid && !chatJid.includes('@lid')) {
    phone = cleanPhone(chatJid.split('@')[0]);
  }
  // Fallback to legacy format
  if (!phone && chat.phone) phone = cleanPhone(chat.phone);
  if (!phone && chatid) phone = cleanPhone(chatid);
  if (!phone && msg.phone) phone = cleanPhone(msg.phone);
  if (!phone && evolutionRemoteJidAlt) phone = cleanPhone(evolutionRemoteJidAlt);
  if (!phone && evolutionKey.remoteJid) phone = cleanPhone(evolutionKey.remoteJid);

  if (!phone || !isValidPhoneNumber(phone)) {
    console.log('Skipping invalid phone:', phone, 'chatJid:', chatJid, 'chatid:', chatid);
    return respond({ success: true, ignored: true, reason: 'invalid_phone' });
  }

  // --- Extract fromMe, msgId, pushName ---
  const fromMe = (eventInfo.IsFromMe ?? eventInfo.isFromMe) || msg.fromMe === true || msg.fromMe === 'true' || evolutionKey.fromMe === true;
  const msgId = eventInfo.ID || eventInfo.Id || eventInfo.id || msg.msgid || msg.id || msg.key?.id || evolutionKey.id || '';
  const pushName = eventInfo.PushName || eventInfo.pushName || chat.wa_contactName || chat.name || chat.wa_name || msg.senderName || evolutionData.pushName || '';

  // --- Determine message type and content ---
  let textContent: string | null = null;
  let messageType = 'text';
  let mediaUrl: string | null = null;

  // Check UAZAPI native format first (payload.event.Message sub-objects)
  const conversationText = eventMessage.conversation || eventMessage.Conversation || evolutionMessage.conversation;
  const extendedText = eventMessage.extendedTextMessage || eventMessage.ExtendedTextMessage || evolutionMessage.extendedTextMessage;
  const imageMsg = firstObject(
    eventMessage.imageMessage, eventMessage.ImageMessage, evolutionMessage.imageMessage, evolutionMessage.image,
    payload.imageMessage, payload.image, msg.imageMessage, msg.image, evolutionData.imageMessage, evolutionData.image,
  );
  const audioMsg = firstObject(
    eventMessage.audioMessage, eventMessage.AudioMessage, eventMessage.pttMessage, eventMessage.PTTMessage,
    eventMessage.voiceMessage, eventMessage.VoiceMessage, evolutionMessage.audioMessage, evolutionMessage.audio,
    evolutionMessage.pttMessage, evolutionMessage.ptt, evolutionMessage.voiceMessage, evolutionMessage.voice,
    payload.audioMessage, payload.AudioMessage, payload.audio, payload.ptt, payload.voice,
    msg.audioMessage, msg.AudioMessage, msg.audio, msg.ptt, msg.voice,
    evolutionData.audioMessage, evolutionData.audio, evolutionData.ptt, evolutionData.voice,
  );
  const videoMsg = firstObject(
    eventMessage.videoMessage, eventMessage.VideoMessage, evolutionMessage.videoMessage, evolutionMessage.video,
    payload.videoMessage, payload.video, msg.videoMessage, msg.video, evolutionData.videoMessage, evolutionData.video,
  );
  const documentMsg = firstObject(
    eventMessage.documentMessage, eventMessage.DocumentMessage, evolutionMessage.documentMessage, evolutionMessage.document,
    payload.documentMessage, payload.document, msg.documentMessage, msg.document, evolutionData.documentMessage, evolutionData.document,
  );
  const stickerMsg = firstObject(
    eventMessage.stickerMessage, eventMessage.StickerMessage, evolutionMessage.stickerMessage, evolutionMessage.sticker,
    payload.stickerMessage, payload.sticker, msg.stickerMessage, msg.sticker, evolutionData.stickerMessage, evolutionData.sticker,
  );
  const locationMsg = eventMessage.locationMessage || eventMessage.LocationMessage || evolutionMessage.locationMessage;
  const contactMsg = eventMessage.contactMessage || eventMessage.ContactMessage || evolutionMessage.contactMessage;

  // Toque em botão/lista nativo não chega como texto: vem numa mensagem de
  // resposta própria, que varia com o formato usado no envio e com o aparelho.
  // Sem isto o texto sai vazio e o fluxo não casa a escolha com nenhuma saída.
  const interactiveReply = firstObject(
    eventMessage.interactiveResponseMessage, eventMessage.InteractiveResponseMessage,
    eventMessage.buttonsResponseMessage, eventMessage.ButtonsResponseMessage,
    eventMessage.templateButtonReplyMessage, eventMessage.TemplateButtonReplyMessage,
    eventMessage.listResponseMessage, eventMessage.ListResponseMessage,
    evolutionMessage.interactiveResponseMessage, evolutionMessage.buttonsResponseMessage,
    evolutionMessage.templateButtonReplyMessage, evolutionMessage.listResponseMessage,
    payload.interactiveResponseMessage, payload.buttonsResponseMessage,
    payload.templateButtonReplyMessage, payload.listResponseMessage,
    msg.interactiveResponseMessage, msg.buttonsResponseMessage,
    msg.templateButtonReplyMessage, msg.listResponseMessage,
  );

  if (interactiveReply) {
    messageType = 'text';
    textContent = extractInteractiveReplyText(interactiveReply);
    console.log(`[WEBHOOK] Interactive reply detected -> "${textContent}"`);
  } else if (conversationText) {
    messageType = 'text';
    textContent = conversationText;
  } else if (extendedText) {
    messageType = 'text';
    textContent = extendedText.text || extendedText.Text || '';
  } else if (imageMsg) {
    messageType = 'image';
    textContent = imageMsg.caption || imageMsg.Caption || null;
    mediaUrl = extractMediaUrlFromObject(imageMsg);
  } else if (audioMsg) {
    messageType = 'audio';
    mediaUrl = extractMediaUrlFromObject(audioMsg);
    console.log('[DEBUG] Audio message detected:', JSON.stringify(audioMsg));
  } else if (videoMsg) {
    messageType = 'video';
    textContent = videoMsg.caption || videoMsg.Caption || null;
    mediaUrl = extractMediaUrlFromObject(videoMsg);
  } else if (documentMsg) {
    messageType = 'document';
    textContent = documentMsg.fileName || documentMsg.FileName || documentMsg.title || null;
    mediaUrl = extractMediaUrlFromObject(documentMsg);
    console.log('[DEBUG] Document message detected:', JSON.stringify(documentMsg));
  } else if (stickerMsg) {
    messageType = 'sticker';
    mediaUrl = extractMediaUrlFromObject(stickerMsg);
  } else if (locationMsg) {
    messageType = 'location';
    const lat = locationMsg.degreesLatitude || locationMsg.DegreesLatitude || 0;
    const lng = locationMsg.degreesLongitude || locationMsg.DegreesLongitude || 0;
    textContent = locationMsg.name || locationMsg.address || `${lat}, ${lng}`;
  } else if (contactMsg) {
    messageType = 'contact';
    textContent = contactMsg.displayName || contactMsg.DisplayName || '';
  } else if (payload.caption || payload.text || payload.content) {
    // Fallback for media payloads that might have root fields
    textContent = payload.caption || payload.text || (typeof payload.content === 'string' ? payload.content : null);

    const pType = String(payload.type || payload.mediaType || payload.messageType || eventType || '').toLowerCase();
    if (pType === 'image') messageType = 'image';
    else if (pType === 'audio' || pType === 'ptt' || pType.includes('audio') || pType.includes('ptt') || pType.includes('voice')) messageType = 'audio';
    else if (pType === 'video') messageType = 'video';
    else if (pType === 'document') messageType = 'document';
  } else {
    // Fallback to legacy format parsing (UAZAPI native format)
    const content = msg.content || {};
    if (typeof content === 'string') {
      textContent = content;
    } else if (content.text) {
      textContent = content.text;
    } else if (msg.text) {
      textContent = typeof msg.text === 'string' ? msg.text : msg.text?.message || null;
    } else if (msg.conversation) {
      textContent = msg.conversation;
    }

    // UAZAPI uses msg.messageType (e.g. "AudioMessage", "ImageMessage") which is more specific
    // than msg.type which is often just "media" for all media types
    const msgTypeRaw = msg.messageType || msg.type || chat.wa_lastMessageType || '';
    const msgType = msgTypeRaw.toLowerCase();

    // Extract media URL from content.URL (UAZAPI puts encrypted WhatsApp URL there)
    // or from msg.mediaUrl / msg.media.url
    const contentMediaUrl = (typeof content === 'object' && content !== null) ? extractMediaUrlFromObject(content) : null;
    const legacyMediaUrl = extractMediaUrlFromObject(msg) || extractMediaUrlFromObject(msg.media) || contentMediaUrl || null;

    if (msgType.includes('image')) {
      messageType = 'image';
      mediaUrl = legacyMediaUrl;
      if (!textContent) textContent = content.caption || msg.caption || null;
    } else if (msgType.includes('audio') || msgType.includes('ptt') || msgType.includes('voice')) {
      messageType = 'audio';
      mediaUrl = legacyMediaUrl;
    } else if (msgType.includes('video')) {
      messageType = 'video';
      mediaUrl = legacyMediaUrl;
      if (!textContent) textContent = content.caption || msg.caption || null;
    } else if (msgType.includes('document')) {
      messageType = 'document';
      mediaUrl = legacyMediaUrl;
      if (!textContent) textContent = content.fileName || content.title || msg.fileName || null;
    } else if (msgType.includes('sticker')) {
      messageType = 'sticker';
      mediaUrl = legacyMediaUrl;
    } else if (msgType.includes('location')) {
      messageType = 'location';
    } else if (msgType.includes('contact')) {
      messageType = 'contact';
    }
  }

  // --- Extract quoted/reply context ---
  // WhatsApp reply messages contain contextInfo with stanzaId (original message ID)
  let quotedMessageMeta: any = null;
  const explicitContextInfo = firstNonEmptyObject(
    extendedText?.contextInfo,
    extendedText?.ContextInfo,
    imageMsg?.contextInfo,
    imageMsg?.ContextInfo,
    audioMsg?.contextInfo,
    audioMsg?.ContextInfo,
    videoMsg?.contextInfo,
    videoMsg?.ContextInfo,
    documentMsg?.contextInfo,
    documentMsg?.ContextInfo,
    stickerMsg?.contextInfo,
    stickerMsg?.ContextInfo,
    eventMessage?.contextInfo,
    eventMessage?.ContextInfo,
    eventMessage?.messageContextInfo,
    eventMessage?.MessageContextInfo,
    evolutionMessage?.contextInfo,
    evolutionMessage?.ContextInfo,
    evolutionMessage?.messageContextInfo,
    evolutionData?.contextInfo,
    evolutionData?.messageContextInfo,
    msg?.contextInfo,
    msg?.ContextInfo,
    payload?.contextInfo,
    payload?.messageContextInfo,
    payload?.data?.contextInfo,
    payload?.data?.messageContextInfo,
  );
  const deepContextInfo = findContextInfoDeep(payload);
  const contextInfo = deepContextInfo?.value || explicitContextInfo || null;
  
  if (contextInfo) {
    const stanzaId = contextInfo.stanzaId
      || contextInfo.StanzaId
      || contextInfo.quotedMessageId
      || contextInfo.quotedStanzaId
      || contextInfo.quotedMessageID
      || contextInfo.id
      || null;
    const participant = contextInfo.participant || contextInfo.Participant || null;
    const quotedMsg = contextInfo.quotedMessage || contextInfo.QuotedMessage || null;
    
    if (stanzaId) {
      let quotedText = null;
      if (quotedMsg) {
        quotedText = quotedMsg.conversation || quotedMsg.Conversation
          || quotedMsg.extendedTextMessage?.text || quotedMsg.ExtendedTextMessage?.Text
          || quotedMsg.imageMessage?.caption || quotedMsg.ImageMessage?.Caption
          || quotedMsg.videoMessage?.caption || quotedMsg.VideoMessage?.Caption
          || quotedMsg.documentMessage?.fileName || quotedMsg.DocumentMessage?.FileName
          || (quotedMsg.audioMessage || quotedMsg.AudioMessage ? 'Audio' : null)
          || (quotedMsg.imageMessage || quotedMsg.ImageMessage ? 'Imagem' : null)
          || (quotedMsg.videoMessage || quotedMsg.VideoMessage ? 'Video' : null)
          || (quotedMsg.documentMessage || quotedMsg.DocumentMessage ? 'Documento' : null)
          || null;
      }
      quotedMessageMeta = {
        zapi_message_id: stanzaId,
        normalized_zapi_message_id: normalizeExternalMessageId(stanzaId),
        content: quotedText,
        participant: participant,
        context_path: deepContextInfo?.path?.join('.') || 'explicit',
        context_keys: Object.keys(contextInfo).slice(0, 20),
        quoted_message_keys: quotedMsg && typeof quotedMsg === 'object' ? Object.keys(quotedMsg).slice(0, 20) : [],
      };
      console.log(`[WEBHOOK] Quoted message detected: stanzaId=${stanzaId}, text=${quotedText?.substring(0, 50) || 'none'}`);
    }
  }

  // Skip protocol/system messages
  if (eventMessage.protocolMessage || eventMessage.ProtocolMessage) {
    return respond({ success: true, ignored: true, reason: 'protocol_message' });
  }

  // Skip empty text messages (but allow media-only messages)
  // Media messages have messageType != 'text' OR have base64 data
  const hasBase64 = !!(payload.base64 || payload.Base64);
  const isMediaType = ['image', 'audio', 'video', 'document', 'sticker'].includes(messageType);
  if (!textContent && !mediaUrl && !isMediaType && !hasBase64) {
    console.log(`[WEBHOOK] Skipping empty message: type=${messageType}, hasBase64=${hasBase64}, isMediaType=${isMediaType}`);
    return respond({ success: true, ignored: true, reason: 'empty_message' });
  }

  console.log(`[WEBHOOK] Processing message: type=${messageType}, fromMe=${fromMe}, phone=${phone}, hasBase64=${hasBase64}, isMediaType=${isMediaType}, mimeType=${payload.mimeType || payload.MimeType || 'none'}`);

  // Handle media upload (UAZAPI sends media as base64 in the payload)
  // Try multiple field name variations for base64 and mimeType (Evolution v1/v2, Z-API, Wuzapi)
  let base64Data = payload.base64 || payload.Base64 || null;
  if (!base64Data && payload.data?.message?.base64) base64Data = payload.data.message.base64;
  if (!base64Data && payload.message?.base64) base64Data = payload.message.base64;
  if (!base64Data && payload.data?.base64) base64Data = payload.data.base64;
  if (!base64Data && eventMessage?.base64) base64Data = eventMessage.base64;
  if (!base64Data) base64Data = extractBase64FromObject(imageMsg) || extractBase64FromObject(audioMsg) || extractBase64FromObject(videoMsg) || extractBase64FromObject(documentMsg) || extractBase64FromObject(stickerMsg);

  let mimeType = payload.mimeType || payload.MimeType || payload.mimetype || null;
  if (!mimeType) mimeType = payload.data?.message?.mimetype || payload.message?.mimetype || payload.data?.mimetype;
  if (!mimeType) mimeType = documentMsg?.mimetype || audioMsg?.mimetype || videoMsg?.mimetype || imageMsg?.mimetype || null;
  if (!mimeType) mimeType = extractMimeTypeFromObject(documentMsg) || extractMimeTypeFromObject(audioMsg) || extractMimeTypeFromObject(videoMsg) || extractMimeTypeFromObject(imageMsg) || extractMimeTypeFromObject(stickerMsg);

  let directMediaUrl = firstString(
    mediaUrl,
    payload.mediaUrl,
    payload.MediaUrl,
    payload.media_url,
    payload.fileUrl,
    payload.fileURL,
    payload.audioUrl,
    payload.audioURL,
    payload.downloadUrl,
    payload.downloadURL,
    msg.mediaUrl,
    msg.MediaUrl,
    msg.media_url,
    msg.fileUrl,
    msg.fileURL,
    msg.audioUrl,
    msg.audioURL,
    extractMediaUrlFromObject(msg.media),
    extractMediaUrlFromObject(payload.media),
    extractMediaUrlFromObject(payload.data),
  );
  if (directMediaUrl && isEncryptedWhatsAppMediaUrl(directMediaUrl)) {
    console.log(`[WEBHOOK] Ignoring encrypted WhatsApp media URL; will download/decrypt before saving: ${directMediaUrl.substring(0, 80)}`);
    directMediaUrl = null;
    mediaUrl = null;
  }

  const connectionSettings = await loadConnectionSettings(supabase);

  // Fetch WhatsApp Instance early for API calls
  // Robust lookup: try zapi_instance_id first, then fallback to zapi_token
  const payloadToken = payload.token || '';
  let whatsappInstance: any = null;
  let instanceError: any = null;

  // Strategy 1: lookup by zapi_instance_id (instanceId or instanceName)
  if (instanceId || instanceName) {
    const orFilters = [];
    if (instanceId) orFilters.push(`zapi_instance_id.eq.${instanceId}`);
    if (instanceName) orFilters.push(`zapi_instance_id.eq.${instanceName}`);
    if (instanceName) orFilters.push(`evolution_instance_name.eq.${instanceName}`);
    if (instanceId) orFilters.push(`evolution_instance_id.eq.${instanceId}`);
    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .or(orFilters.join(','))
      .maybeSingle();
    whatsappInstance = data;
    instanceError = error;
  }

  // Strategy 2: fallback lookup by zapi_token from payload
  if (!whatsappInstance && payloadToken) {
    console.log(`[WEBHOOK] Fallback: looking up instance by token`);
    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('zapi_token', payloadToken)
      .maybeSingle();
    whatsappInstance = data;
    instanceError = error;
  }

  if (instanceError || !whatsappInstance) {
    console.error(`[WEBHOOK] Instance not found for ID: ${instanceId}, Name: ${instanceName}, Token: ${payloadToken ? 'present' : 'absent'}. EventType: ${eventType}`);
    console.log(`[WEBHOOK] Full payload for debug:`, JSON.stringify(payload));
    return respond({ success: false, error: 'instance_not_found', instanceId, instanceName });
  }

  const webhookProvider = whatsappInstance.provider === 'evolution' || whatsappInstance.evolution_instance_name || whatsappInstance.evolution_instance_id
    ? 'evolution'
    : 'uazapi';
  const mediaRecoveryDiagnostics: any[] = [];

  if (base64Data && !isProbablyBase64(base64Data)) {
    mediaRecoveryDiagnostics.push({
      provider: 'payload',
      skipped: 'invalid_base64_candidate',
      messageType,
      valueType: typeof base64Data,
      preview: String(base64Data).slice(0, 80),
    });
    base64Data = null;
  }

  // Fetch missing Base64 directly from UAZAPI if not in payload
  if (!base64Data && isMediaType && whatsappInstance && msgId && webhookProvider === 'uazapi') {
    try {
      console.log(`[WEBHOOK] Fetching decrypted media via /message/download for ID: ${msgId}...`);
      const uazapiBaseUrl = connectionSettings.uazapiBaseUrl;
      if (!uazapiBaseUrl) throw new Error('UAZAPI base URL not configured');

      const mediaMessage = eventMessage || msg.message || msg || {};
      const mediaKey = {
        id: msgId,
        remoteJid: chatJid || `${phone}@s.whatsapp.net`,
        fromMe,
        participant: senderJid || undefined,
      };
      const requestCandidates = [
        {
          endpoint: `${uazapiBaseUrl}/message/download`,
          body: { id: msgId, return_base64: true, generate_mp3: messageType === 'audio', return_link: true },
        },
        {
          endpoint: `${uazapiBaseUrl}/message/download`,
          body: { messageId: msgId, return_base64: true, generate_mp3: messageType === 'audio', return_link: true },
        },
        {
          endpoint: `${uazapiBaseUrl}/message/download`,
          body: { msgId, return_base64: true, generate_mp3: messageType === 'audio', return_link: true },
        },
        {
          endpoint: `${uazapiBaseUrl}/chat/getBase64FromMediaMessage/${instanceName || whatsappInstance.zapi_instance_id || whatsappInstance.evolution_instance_name || ''}`,
          body: { message: { key: mediaKey, message: mediaMessage }, convertToMp4: false },
        },
        {
          endpoint: `${uazapiBaseUrl}/chat/getBase64FromMediaMessage/${instanceName || whatsappInstance.zapi_instance_id || whatsappInstance.evolution_instance_name || ''}`,
          body: { key: mediaKey, message: mediaMessage, convertToMp4: false },
        },
      ].filter(candidate => !candidate.endpoint.endsWith('/'));

      for (const candidate of requestCandidates) {
        const resp = await fetch(candidate.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': whatsappInstance.zapi_token,
          },
          body: JSON.stringify(candidate.body),
        });

        const raw = await resp.text();
        if (!resp.ok) {
          console.error(`[WEBHOOK] UAZAPI media download failed ${resp.status} at ${candidate.endpoint}: ${raw.substring(0, 300)}`);
          continue;
        }

        let data: any = null;
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = raw; }
        const downloaded = extractDownloadedMedia(data);

        if (isProbablyBase64(downloaded.base64)) {
          base64Data = downloaded.base64;
          if (!mimeType) mimeType = downloaded.mimeType;
          console.log(`[WEBHOOK] Successfully downloaded media: ${base64Data.length} chars, mimeType=${mimeType || 'none'}`);
          break;
        }

        if (downloaded.url) {
          directMediaUrl = downloaded.url;
          if (!mimeType) mimeType = downloaded.mimeType;
          console.log(`[WEBHOOK] Using temporary decrypted URL from API: ${directMediaUrl}`);
          break;
        }

        console.warn(`[WEBHOOK] UAZAPI media download returned no usable base64/url at ${candidate.endpoint}. Keys: ${data && typeof data === 'object' ? Object.keys(data).join(',') : 'raw'}`);
      }
    } catch (e) {
      console.error('[WEBHOOK] Media Download API exception:', e);
    }
  }

  // Evolution webhooks often include only the WhatsApp media stub. Convert it
  // to base64 through Evolution before falling back to a temporary URL.
  if (!base64Data && isMediaType && whatsappInstance && msgId && webhookProvider === 'evolution') {
    try {
      const evolutionBaseUrl = connectionSettings.evolutionBaseUrl;
      const evolutionApiKey = whatsappInstance.evolution_api_key || connectionSettings.evolutionApiKey;
      const evolutionInstanceName = whatsappInstance.evolution_instance_name || instanceName || whatsappInstance.zapi_instance_id;
      if (evolutionBaseUrl && evolutionApiKey && evolutionInstanceName) {
        console.log(`[WEBHOOK] Fetching decrypted media via Evolution for ID: ${msgId}...`);
        const mediaMessage = firstNonEmptyObject(evolutionMessage, eventMessage, msg.message, msg) || {};
        const typedMediaMessage = firstNonEmptyObject(audioMsg, imageMsg, videoMsg, documentMsg, stickerMsg, mediaMessage) || {};
        const mediaKey = {
          id: msgId,
          remoteJid: evolutionRemoteJid || chatJid || `${phone}@s.whatsapp.net`,
          fromMe,
          participant: evolutionParticipantAlt || evolutionKey.participant || senderJid || undefined,
        };
        const bodyCandidates = [
          {
            label: 'docs_key_id_only',
            message: {
              key: {
                id: msgId,
              },
            },
            convertToMp4: false,
          },
          {
            label: 'docs_key_id_only_convert_true',
            message: {
              key: {
                id: msgId,
              },
            },
            convertToMp4: true,
          },
          {
            label: 'key_full',
            message: {
              key: mediaKey,
            },
            convertToMp4: false,
          },
          {
            label: 'key_full_with_message',
            message: {
              key: mediaKey,
              message: mediaMessage,
            },
            convertToMp4: false,
          },
          {
            label: 'typed_message',
            message: {
              key: mediaKey,
              message: { [messageType === 'audio' ? 'audioMessage' : `${messageType}Message`]: typedMediaMessage },
            },
            convertToMp4: false,
          },
          {
            label: 'flat_key_with_message',
            key: mediaKey,
            message: mediaMessage,
            convertToMp4: false,
          },
          {
            label: 'flat_message_id',
            messageId: msgId,
            key: mediaKey,
            convertToMp4: false,
          },
        ];

        for (const requestBody of bodyCandidates) {
          const { label, ...evolutionRequestBody } = requestBody as any;
          const resp = await fetch(`${evolutionBaseUrl}/chat/getBase64FromMediaMessage/${evolutionInstanceName}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': evolutionApiKey,
            },
            body: JSON.stringify(evolutionRequestBody),
          });

          const raw = await resp.text();
          if (!resp.ok) {
            console.error(`[WEBHOOK] Evolution media download failed: ${resp.status} ${raw}`);
            mediaRecoveryDiagnostics.push({
              provider: 'evolution',
              label: label || null,
              status: resp.status,
              error: raw.substring(0, 300),
              bodyKeys: Object.keys(evolutionRequestBody || {}),
              messageKeys: Object.keys(evolutionRequestBody?.message || {}),
            });
            continue;
          }

          let data: any = null;
          try { data = raw ? JSON.parse(raw) : {}; } catch { data = { base64: raw }; }
          const downloaded = extractDownloadedMedia(data);
          if (isProbablyBase64(downloaded.base64)) base64Data = downloaded.base64;
          mimeType = mimeType || downloaded.mimeType;
          directMediaUrl = directMediaUrl || downloaded.url;
          mediaRecoveryDiagnostics.push({
            provider: 'evolution',
            label: label || null,
            status: resp.status,
            hasBase64: !!base64Data,
            hasUrl: !!directMediaUrl,
            mimeType: mimeType || null,
            responseKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 12) : ['raw'],
          });
          console.log(`[WEBHOOK] Evolution media result: hasBase64=${!!base64Data}, mimeType=${mimeType || 'none'}, hasUrl=${!!directMediaUrl}`);
          if (base64Data || directMediaUrl) break;
        }
      } else {
        console.warn('[WEBHOOK] Evolution media download skipped: missing base URL, API key, or instance name');
        mediaRecoveryDiagnostics.push({
          provider: 'evolution',
          skipped: 'missing_config',
          hasBaseUrl: !!evolutionBaseUrl,
          hasApiKey: !!evolutionApiKey,
          hasInstanceName: !!evolutionInstanceName,
        });
      }
    } catch (e) {
      console.error('[WEBHOOK] Evolution media download exception:', e);
      mediaRecoveryDiagnostics.push({
        provider: 'evolution',
        exception: e instanceof Error ? e.message : String(e),
      });
    }
  } else if (isMediaType && !base64Data && !msgId) {
    mediaRecoveryDiagnostics.push({
      provider: webhookProvider,
      skipped: 'missing_message_id',
      messageType,
      instanceProvider: whatsappInstance.provider || null,
      instanceId: whatsappInstance.id || null,
    });
  } else if (isMediaType && !base64Data && webhookProvider !== 'evolution') {
    mediaRecoveryDiagnostics.push({
      provider: webhookProvider,
      skipped: 'not_evolution',
      messageType,
      instanceProvider: whatsappInstance.provider || null,
      instanceId: whatsappInstance.id || null,
      hasEvolutionInstanceName: !!whatsappInstance.evolution_instance_name,
      hasEvolutionInstanceId: !!whatsappInstance.evolution_instance_id,
    });
  }

  console.log(`[WEBHOOK] Media check: hasBase64=${!!base64Data} (${base64Data ? base64Data.length + ' chars' : '0'}), mimeType=${mimeType}, directUrl=${!!directMediaUrl}`);

  if (base64Data && !mimeType && base64Data.startsWith('data:')) {
    const match = base64Data.match(/^data:([^;,]+)[;,]/i);
    if (match?.[1]) mimeType = match[1];
  }

  if (base64Data && !mimeType) {
    if (messageType === 'audio') mimeType = 'audio/ogg';
    else if (messageType === 'image') mimeType = 'image/jpeg';
    else if (messageType === 'video') mimeType = 'video/mp4';
    else if (messageType === 'sticker') mimeType = 'image/webp';
    else mimeType = 'application/octet-stream';
  }

  if (base64Data && mimeType && !mimeType.includes('/')) {
    if (messageType === 'audio') mimeType = 'audio/ogg';
    else if (messageType === 'image') mimeType = 'image/jpeg';
    else if (messageType === 'video') mimeType = 'video/mp4';
    else if (messageType === 'sticker') mimeType = 'image/webp';
    else mimeType = 'application/octet-stream';
  }

  if (!base64Data && directMediaUrl && isMediaType && !isLocalStorageUrl(directMediaUrl)) {
    try {
      console.log(`[WEBHOOK] Fetching external media URL before storing: ${directMediaUrl.substring(0, 100)}`);
      const headers: Record<string, string> = {};
      if (webhookProvider === 'evolution') {
        const evolutionApiKey = whatsappInstance.evolution_api_key || connectionSettings.evolutionApiKey;
        if (evolutionApiKey) headers.apikey = evolutionApiKey;
      } else if (whatsappInstance.zapi_token) {
        headers.token = whatsappInstance.zapi_token;
      }
      const resp = await fetch(directMediaUrl, { headers });
      const contentType = resp.headers.get('content-type') || '';
      if (resp.ok && !contentType.toLowerCase().includes('text/html') && !contentType.toLowerCase().includes('application/json')) {
        const buffer = await resp.arrayBuffer();
        if (buffer.byteLength > 128) {
          base64Data = arrayBufferToBase64(buffer);
          mimeType = mimeType || contentType || (messageType === 'image' ? 'image/jpeg' : messageType === 'audio' ? 'audio/ogg' : 'application/octet-stream');
          directMediaUrl = null;
          console.log(`[WEBHOOK] External media fetched: ${buffer.byteLength} bytes, mimeType=${mimeType}`);
        } else {
          console.warn(`[WEBHOOK] External media too small: ${buffer.byteLength} bytes`);
        }
      } else {
        console.warn(`[WEBHOOK] External media fetch failed or returned non-media: status=${resp.status}, contentType=${contentType}`);
      }
    } catch (e) {
      console.error('[WEBHOOK] External media fetch exception:', e);
    }
  }

  if (base64Data && mimeType) {
    try {
      const normalizedMimeType = mimeType.toLowerCase().split(';')[0].trim();
      const uploadContentType = normalizedMimeType || mimeType;
      const extMap: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
        'audio/ogg': 'ogg', 'application/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac', 'audio/webm': 'webm',
        'video/mp4': 'mp4', 'video/3gpp': '3gp',
        'application/pdf': 'pdf', 'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/vnd.ms-powerpoint': 'ppt',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
        'text/plain': 'txt',
      };

      // Try to get file extension from multiple sources
      const docFileName = documentMsg?.fileName || documentMsg?.FileName || payload.fileName || '';
      const extFromMap = extMap[normalizedMimeType] || extMap[mimeType];
      const extFromFileName = docFileName ? docFileName.split('.').pop() : null;
      const ext = extFromMap || extFromFileName || 'bin';

      const safeId = (msgId || String(Date.now())).replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `${safeId}.${ext}`;
      const storagePath = `webhook-media/${fileName}`;

      console.log(`[WEBHOOK] Uploading media: path=${storagePath}, mimeType=${mimeType}, uploadContentType=${uploadContentType}, base64Length=${base64Data.length}`);

      let pureBase64 = base64Data;
      if (pureBase64.includes('base64,')) {
        pureBase64 = pureBase64.split('base64,')[1];
      }
      // Clean up whitespaces and convert base64url characters
      pureBase64 = pureBase64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
      const padLen = 4 - (pureBase64.length % 4);
      if (padLen < 4 && padLen > 0) pureBase64 += '='.repeat(padLen);

      const binaryData = decodeBase64(pureBase64);

      // Try upload, create bucket if it doesn't exist
      let uploadResult = await supabase.storage
        .from('chat-media')
        .upload(storagePath, binaryData, { contentType: uploadContentType, upsert: true });

      if (uploadResult.error) {
        console.error('[WEBHOOK] First upload attempt failed:', uploadResult.error.message);

        // If bucket doesn't exist, try to create it
        if (uploadResult.error.message?.includes('not found') || uploadResult.error.message?.includes('Bucket')) {
          console.log('[WEBHOOK] Attempting to create chat-media bucket...');
          await supabase.storage.createBucket('chat-media', { public: true });

          // Retry upload
          uploadResult = await supabase.storage
            .from('chat-media')
            .upload(storagePath, binaryData, { contentType: uploadContentType, upsert: true });
        }
      }

      if (!uploadResult.error) {
        const { data: publicUrl } = supabase.storage.from('chat-media').getPublicUrl(storagePath);
        mediaUrl = publicUrl?.publicUrl || null;
        console.log(`[WEBHOOK] Media uploaded successfully: ${mediaUrl}`);
      } else {
        console.error('[WEBHOOK] Final upload error:', uploadResult.error);
        mediaRecoveryDiagnostics.push({
          provider: 'supabase_storage',
          error: uploadResult.error.message || String(uploadResult.error),
          path: storagePath,
          mimeType,
          uploadContentType,
        });
      }
    } catch (e) {
      console.error('[WEBHOOK] Media upload exception:', e);
      mediaRecoveryDiagnostics.push({
        provider: 'supabase_storage',
        exception: e instanceof Error ? e.message : String(e),
        messageType,
        mimeType: mimeType || null,
      });
    }
  } else if (directMediaUrl && !isEncryptedWhatsAppMediaUrl(directMediaUrl)) {
    mediaUrl = directMediaUrl;
    console.log(`[WEBHOOK] Using direct media URL: ${mediaUrl}`);
  }

  if (mediaUrl && isEncryptedWhatsAppMediaUrl(mediaUrl)) {
    console.warn(`[WEBHOOK] Refusing to save encrypted WhatsApp media URL as final media_url: ${mediaUrl.substring(0, 100)}`);
    mediaUrl = null;
  }

  if (isMediaType && !mediaUrl) {
    console.warn(`[WEBHOOK] WARNING: Media message type=${messageType} but no base64 or URL found! Payload keys: ${Object.keys(payload).join(', ')}`);
    // Still save the message so user sees it (even without actual media file)
    if (!textContent) {
      textContent = messageType === 'audio' ? '🎵 Áudio' : messageType === 'document' ? '📄 Documento' : `📎 ${messageType}`;
    }
  }

  const organizationId = whatsappInstance.organization_id;
  const fallbackWorkspaceIds = await resolveWorkspacesForInstance(supabase, organizationId, whatsappInstance.id);
  const fallbackWorkspaceId = fallbackWorkspaceIds.length === 1 ? fallbackWorkspaceIds[0] : null;

  // Find or create contact
  // If the message is fromMe, pushName is our own pushName, not the client's.
  // We should pass null so we don't accidentally rename the client's profile.
  const contactNameToSave = fromMe ? null : pushName;
  let contact = await findOrCreateContact(
    supabase,
    phone,
    organizationId,
    contactNameToSave,
    chat.imagePreview || chat.image || null,
    fallbackWorkspaceId,
    contactLid,
  );

  // Fetch profile from UAZAPI if no name
  if (!contact.name && phone) {
    try {
      const uazapiBaseUrl = Deno.env.get('UAZAPI_BASE_URL')!;
      const resp = await fetch(`${uazapiBaseUrl}/contact/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'token': whatsappInstance.zapi_token },
        body: JSON.stringify({ number: phone }),
      });
      if (resp.ok) {
        const profileData = await resp.json();
        const profileName = profileData.name || profileData.pushname || profileData.notify;
        const profilePic = profileData.profilePicUrl || profileData.profilePictureUrl || profileData.imgUrl;
        const updateData: any = {};
        if (profileName) updateData.name = profileName;
        if (profilePic) updateData.avatar_url = profilePic;
        if (Object.keys(updateData).length > 0) {
          await supabase.from('contacts').update(updateData).eq('id', contact.id);
          contact = { ...contact, ...updateData };
        }
      }
    } catch (e) {
      console.error('Profile fetch error:', e);
    }
  }

  // Find or create conversation for THIS specific contact
  const conversation = await findOrCreateConversation(
    supabase,
    contact.id,
    organizationId,
    whatsappInstance.id,
    whatsappInstance.phone_number,
    // O workspace da conversa sai do NÚMERO que recebeu a mensagem, e só dele.
    // Antes, quando a instância não resolvia para nenhum workspace, isto caía em
    // `contact.workspace_id` — o workspace do CRM, que não tem relação com o
    // número. Bastava o contato ter ficado apontando para um workspace antigo
    // (ex.: conversas movidas na mão, contatos não) para a primeira mensagem nova
    // recriar a conversa lá, inclusive em workspace sem número algum.
    fallbackWorkspaceId,
  );
  const connectedPhoneSnapshot = getConnectedPhoneSnapshot(whatsappInstance, payload);
  await recordConversationOriginAudit(supabase, {
    organizationId,
    conversationId: conversation.id,
    whatsappInstance,
    connectedPhone: connectedPhoneSnapshot,
    capturedFrom: 'zapi-webhook:conversation',
    metadata: {
      eventType,
      instanceId,
      instanceName,
      messageProviderId: msgId || null,
    },
  });

  if (!fromMe) {
    await supabase.from('contact_presence').upsert({
      contact_id: contact.id,
      organization_id: organizationId,
      presence_type: 'online',
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    }, { onConflict: 'contact_id' });
  }

  // Check for duplicate message (Deduplication)
  if (msgId) {
    const { data: existing } = await supabase
      .from('messages').select('*')
      .eq('conversation_id', conversation.id)
      .eq('zapi_message_id', msgId).maybeSingle();

    if (existing) {
      console.log(`[WEBHOOK] Duplicate message detected (msgId: ${msgId}). Updating status only.`);

      // If it exists, just update timestamps/metadata if needed and skip insert
      await updateMessageReceiptByProviderId(
        supabase,
        msgId,
        evolutionData.status || evolutionData.message?.status || msg.ack || payload.ack || payload.status,
        conversation.id,
      );
      if (fromMe) {
        // If it's an eco and we already have it, it's definitely the one we sent.
        return respond({ success: true, duplicate: true });
      }

      // If it's NOT from me (inbound) and we have it, it's also a duplicate.
      return respond({ success: true, duplicate: true });
    }
  }

  // Determine final is_from_bot status
  // For outbound (fromMe) messages:
  //   - If conversation is in IA mode, the orchestrator/flow-execute already saves the message
  //     to the DB with is_from_bot=true. The webhook echo arrives later (race condition).
  //     We must SKIP to avoid duplicates. Wait briefly and re-check dedup.
  //   - If conversation is NOT in IA mode, the message was sent by a human via zapi-send-message
  //     which saves synchronously before the echo. Dedup above should catch it, but as safety:
  let finalIsFromBot = false;
  if (fromMe) {
    if (conversation.service_mode === 'ia') {
      // In IA mode, the AI system (orchestrator/flow-execute) saves its own messages.
      // The webhook echo is just a confirmation — skip it to avoid duplicates.
      // Wait a moment for the orchestrator to finish saving, then re-check dedup.
      await new Promise(r => setTimeout(r, 2000));
      if (msgId) {
        const { data: nowExists } = await supabase
          .from('messages').select('id')
          .eq('conversation_id', conversation.id)
          .eq('zapi_message_id', msgId).maybeSingle();
        if (nowExists) {
          console.log(`[WEBHOOK] IA mode echo dedup (after wait): msgId=${msgId} already saved by orchestrator.`);
          await updateMessageReceiptByProviderId(
            supabase,
            msgId,
            evolutionData.status || evolutionData.message?.status || msg.ack || payload.ack || payload.status,
            conversation.id,
          );
          return respond({ success: true, duplicate: true, ia_echo: true });
        }
      }
      // If still not found after wait, it's NOT an orchestrator message — the
      // orchestrator always inserts with is_from_bot=true synchronously before
      // sending (see agent-orchestrator), so dedup above would have caught a
      // genuine (even slow) AI message. Not found here means a human sent it
      // straight from the connected phone while the conversation happened to
      // be in IA mode — save as human, not bot.
      finalIsFromBot = false;
      console.log(`[WEBHOOK] IA mode outbound not found after wait — saving as human/native-app message (not orchestrator).`);
    } else {
      // Not in IA mode — this echo is from a human-sent message OR a message sent from WhatsApp native app.
      // zapi-send-message saves synchronously, so dedup above should have caught it.
      // If we reach here, it means the message wasn't found by the initial zapi_message_id dedup.
      // This can happen if:
      //   1. zapi-send-message saved with a slightly different msgId format
      //   2. The message was sent from WhatsApp native app (no sent_by)
      if (msgId) {
        // Check for human-sent (via Wizzy) messages
        const { data: existingSentByHuman } = await supabase
          .from('messages')
          .select('id, sent_by')
          .eq('conversation_id', conversation.id)
          .eq('zapi_message_id', msgId)
          .not('sent_by', 'is', null)
          .maybeSingle();
        if (existingSentByHuman) {
          console.log(`[WEBHOOK] Human echo dedup: msgId=${msgId}, sent_by=${existingSentByHuman.sent_by}`);
          await updateMessageReceiptByProviderId(
            supabase,
            msgId,
            evolutionData.status || evolutionData.message?.status || msg.ack || payload.ack || payload.status,
            conversation.id,
          );
          return respond({ success: true, duplicate: true, human_sent: true });
        }
        // Also check for native-app messages (no sent_by) - these are echoes of messages sent directly from WhatsApp
        // The initial dedup at line 1927 ALREADY checks ALL messages by zapi_message_id, so if we reach here
        // it means no match was found at all. This means it's a genuinely new message — save it.
        console.log(`[WEBHOOK] fromMe non-IA: no existing record for msgId=${msgId} — saving as native-app outbound message.`);
      }
      // Not found in any dedup check — save as human outbound (is_from_bot=false)
      // This covers: WhatsApp native app messages, or Wizzy messages where the echo arrived before the save
      finalIsFromBot = false;
    }
  }

  // Build metadata with quoted message info if present
  let messageMetadata: any = {};
  if (quotedMessageMeta) {
    // Try to resolve the quoted message's internal ID by zapi_message_id
    let resolvedQuotedId: string | null = null;
    let resolvedQuotedSender: string | null = null;
    if (quotedMessageMeta.zapi_message_id) {
      const quotedIdCandidates = Array.from(new Set([
        quotedMessageMeta.zapi_message_id,
        quotedMessageMeta.normalized_zapi_message_id,
        normalizeExternalMessageId(quotedMessageMeta.zapi_message_id),
      ].filter(Boolean)));

      let quotedRow: any = null;
      const { data: exactRows } = await supabase
        .from('messages')
        .select('id, direction, content, type, media_url, zapi_message_id')
        .eq('conversation_id', conversation.id)
        .in('zapi_message_id', quotedIdCandidates.length > 0 ? quotedIdCandidates : ['__none__'])
        .limit(1);

      quotedRow = exactRows?.[0] || null;

      if (!quotedRow && quotedMessageMeta.normalized_zapi_message_id) {
        const { data: recentRows } = await supabase
          .from('messages')
          .select('id, direction, content, type, media_url, zapi_message_id')
          .eq('conversation_id', conversation.id)
          .not('zapi_message_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(80);

        quotedRow = (recentRows || []).find((row: any) =>
          normalizeExternalMessageId(row.zapi_message_id) === quotedMessageMeta.normalized_zapi_message_id
          || String(row.zapi_message_id || '').includes(quotedMessageMeta.normalized_zapi_message_id)
        ) || null;
      }

      if (quotedRow) {
        resolvedQuotedId = quotedRow.id;
        resolvedQuotedSender = quotedRow.direction === 'inbound' ? (contact.name || phone) : 'Você';
        // Use the stored content if webhook didn't provide it
        if (!quotedMessageMeta.content && quotedRow.content) {
          quotedMessageMeta.content = quotedRow.content;
        }
        if (!quotedMessageMeta.content && quotedRow.type && quotedRow.type !== 'text') {
          quotedMessageMeta.content = quotedRow.type === 'image'
            ? 'Imagem'
            : quotedRow.type === 'audio'
              ? 'Audio'
              : quotedRow.type === 'video'
                ? 'Video'
                : quotedRow.type === 'document'
                  ? 'Documento'
                  : 'Midia';
        }
      }
    }
    messageMetadata.quoted_message = {
      id: resolvedQuotedId || null,
      zapi_message_id: quotedMessageMeta.zapi_message_id,
      normalized_zapi_message_id: quotedMessageMeta.normalized_zapi_message_id || null,
      content: quotedMessageMeta.content || null,
      sender: resolvedQuotedSender || quotedMessageMeta.participant || null,
      resolved: !!resolvedQuotedId,
      diagnostics: {
        context_path: quotedMessageMeta.context_path || null,
        context_keys: quotedMessageMeta.context_keys || [],
        quoted_message_keys: quotedMessageMeta.quoted_message_keys || [],
      },
    };
  } else if (!fromMe) {
    const contextLikePaths = findKeyPathsDeep(payload, /context|quoted|stanza|reply|participant/i);
    messageMetadata.reply_context_scan = {
      found: false,
      eventType,
      payloadKeys: Object.keys(payload || {}).slice(0, 30),
      dataKeys: payload?.data && typeof payload.data === 'object' ? Object.keys(payload.data).slice(0, 30) : [],
      messageKeys: payload?.data?.message && typeof payload.data.message === 'object' ? Object.keys(payload.data.message).slice(0, 30) : [],
      eventMessageKeys: eventMessage && typeof eventMessage === 'object' ? Object.keys(eventMessage).slice(0, 30) : [],
      contextLikePaths,
    };
  }

  if (isMediaType && !mediaUrl && mediaRecoveryDiagnostics.length > 0) {
    messageMetadata.media_recovery = {
      provider: webhookProvider,
      messageType,
      msgId,
      instanceProvider: whatsappInstance.provider || null,
      instanceId: whatsappInstance.id || null,
      evolutionInstanceName: whatsappInstance.evolution_instance_name || null,
      evolutionInstanceId: whatsappInstance.evolution_instance_id || null,
      attempts: mediaRecoveryDiagnostics.slice(-5),
    };
  } else if (isMediaType && !mediaUrl) {
    messageMetadata.media_recovery = {
      provider: webhookProvider,
      messageType,
      msgId,
      instanceProvider: whatsappInstance.provider || null,
      instanceId: whatsappInstance.id || null,
      evolutionInstanceName: whatsappInstance.evolution_instance_name || null,
      evolutionInstanceId: whatsappInstance.evolution_instance_id || null,
      attempts: [],
      skipped: 'no_recovery_attempt_recorded',
    };
  }

  if (Object.keys(messageMetadata).length === 0) {
    messageMetadata = null;
  }

  // Insert message into the CORRECT conversation
  const { data: savedMessage, error: messageError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      content: textContent,
      type: messageType,
      direction: fromMe ? 'outbound' : 'inbound',
      is_from_bot: finalIsFromBot,
      media_url: mediaUrl,
      zapi_message_id: msgId || null,
      ...(messageMetadata ? { metadata: messageMetadata } : {}),
    })
    .select().maybeSingle();

  if (messageError) {
    console.error('Error inserting message:', messageError);
    throw messageError;
  }

  if (savedMessage?.id) {
    await recordConversationOriginAudit(supabase, {
      organizationId,
      conversationId: conversation.id,
      whatsappInstance,
      messageId: savedMessage.id,
      connectedPhone: connectedPhoneSnapshot,
      capturedFrom: 'zapi-webhook:message',
      metadata: {
        eventType,
        instanceId,
        instanceName,
        messageProviderId: msgId || null,
        direction: fromMe ? 'outbound' : 'inbound',
      },
    });
  }

  // Update conversation timestamps
  const updateData: any = { last_message_at: new Date().toISOString(), status: 'open' };
  if (!fromMe) updateData.unread_count = (conversation.unread_count || 0) + 1;
  await supabase.from('conversations').update(updateData).eq('id', conversation.id);

  console.log(`Message saved: ${msgId} for contact ${phone} in conversation ${conversation.id}`);

  let mediaAnalysisPromise: Promise<string | null> | null = null;

  // Auto-transcribe media messages in background (audio, image, video)
  if (savedMessage && mediaUrl && ['audio', 'image', 'video'].includes(messageType)) {
    console.log(`[WEBHOOK] Triggering auto-transcription for ${messageType} message ${savedMessage.id}`);
    mediaAnalysisPromise = (async () => {
      try {
        // Call transcribe-media with service role key. The function resolves
        // whether this org uses platform AI or its own API key.
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const resp = await fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/transcribe-media`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            messageId: savedMessage.id,
            mediaUrl: mediaUrl,
            mediaType: messageType,
            organizationId: organizationId,
          }),
        });
        if (resp.ok) {
          const result = await resp.json();
          console.log(`[WEBHOOK] Auto-transcription result for ${savedMessage.id}: ${result.transcription?.substring(0, 80) || 'empty'}`);
          return result.transcription || null;
        } else {
          console.log(`[WEBHOOK] Auto-transcription failed: ${resp.status}`);
          return null;
        }
      } catch (e) {
        console.error('[WEBHOOK] Auto-transcription error:', e);
        return null;
      }
    })();
    runBackground(mediaAnalysisPromise);
  }

  if (!fromMe && !textContent && messageType === 'audio' && mediaAnalysisPromise) {
    const transcription = await Promise.race([
      mediaAnalysisPromise,
      new Promise<null>(resolve => setTimeout(() => resolve(null), 12000)),
    ]);
    if (isUsefulMediaAnalysis(transcription)) {
      textContent = transcription;
      console.log(`[WEBHOOK] Using audio transcription as trigger text: "${String(transcription).substring(0, 80)}"`);
    } else {
      console.log('[WEBHOOK] Audio transcription not available before trigger routing; falling back to media placeholder');
    }
  }

  // Trigger AI agent or Campaigns if needed
  if (!fromMe) {
    const triggerText = textContent || '';
    console.log(`Checking triggers for message: "${triggerText}" type=${messageType} in org: ${organizationId}`);
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Check for active flow execution FIRST. A conversation with a flow already
    // running/waiting_input must keep that flow — Campaign Trigger matching used to run
    // before this check (and unconditionally on every message), so a reply that happened
    // to match another campaign's keyword could silently hijack an in-progress
    // conversation into a different flow. Campaign Triggers now only apply when there is
    // no active flow execution (see the `else` branch below).
    const { data: activeFlowExec } = await supabase
      .from('flow_executions')
      .select('id, status, current_node_id, flow_id, variables, remarketing_step, flow:flows(nodes, edges, master_prompt, is_master_active, name)')
      .eq('conversation_id', conversation.id)
      // waiting_delay = parado num "Atraso Inteligente". Continua sendo fluxo
      // ativo: sem ele aqui, uma mensagem do contato durante a espera cairia
      // no Campaign Trigger e dispararia um segundo fluxo em paralelo.
      .in('status', ['running', 'waiting_input', 'waiting_delay'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeFlowExec) {
      console.log(`[WEBHOOK] Active flow execution ${activeFlowExec.id} (status=${activeFlowExec.status}, node=${activeFlowExec.current_node_id})`);

      // 1b. COMANDO INTERNO NO MEIO DO FLUXO. A regra do bloco acima ("conversa com
      // fluxo ativo pertence ao fluxo") continua valendo para toda campanha -- menos
      // as marcadas com interrompe_fluxo, que existem exatamente para este caso: o
      // organizador escreve "gerar relatorio" no meio de um atendimento e recebe o
      // relatório, em vez de a mensagem ser engolida como resposta do fluxo aberto.
      //
      // O fluxo interrompido NÃO é cancelado e NÃO recebe esta mensagem: fica parado
      // no nó em que estava e volta a ser o fluxo ativo depois (a busca lá em cima é
      // por started_at DESC, então enquanto a campanha roda ela é a de cima, e quando
      // termina a antiga reassume). Por isso também não vale interromper um fluxo
      // para recomeçar ele mesmo -- é o que o excludeFlowId corta.
      //
      // Isto precisa ficar ANTES de qualquer ramo de retomada: depois, a mensagem já
      // teria sido consumida como resposta do fluxo.
      if (triggerText) {
        const interruptTrigger = await checkCampaignTriggers(supabase, organizationId, contact.id, triggerText, {
          onlyInterruptors: true,
          excludeFlowId: activeFlowExec.flow_id,
        });

        if (interruptTrigger) {
          console.log(`[CAMPAIGN INTERRUPT] Campanha ${interruptTrigger.campaignId} interrompe o fluxo ${activeFlowExec.flow_id}; execução ${activeFlowExec.id} fica parada em ${activeFlowExec.current_node_id} (status=${activeFlowExec.status})`);
          return await startCampaignFlow(supabase, {
            organizationId,
            conversation,
            contact,
            phone,
            triggerText,
            savedMessageId: savedMessage.id,
            serviceRoleKey,
            ...interruptTrigger,
          });
        }
      }

      // Check if the flow is paused at an ai-handoff node
      const flowNodes = (activeFlowExec.flow?.nodes || []) as any[];
      const currentNode = flowNodes.find((n: any) => n.id === activeFlowExec.current_node_id);
      const isAtAIHandoff = currentNode?.type === 'ai-handoff';
      const isAtContentBlockWaiting = currentNode?.type === 'content-block' && currentNode.data?.waitForResponse;
      const isAtActionFlow = currentNode?.type === 'action-flow' && (currentNode.data?.waitForResponse || (currentNode.data?.remarketingSteps as any[])?.length > 0);
      const isAtMessageButtons = currentNode?.type === 'message-buttons';
      const isAtMessageList = currentNode?.type === 'message-list';

      // Botão de follow-up com saída própria desenhada no fluxo: tem precedência
      // sobre o 'responded', porque é uma resposta específica, não "respondeu algo".
      const followUpMatch = activeFlowExec.status === 'waiting_input'
        ? matchFollowUpButtonHandle(currentNode, (activeFlowExec as any).remarketing_step || 0, triggerText || '')
        : null;
      const followUpHandle = followUpMatch?.handleId || null;
      const followUpEdge = followUpHandle
        ? ((activeFlowExec.flow?.edges || []) as any[]).find(
            (e: any) => e.source === activeFlowExec.current_node_id && e.sourceHandle === followUpHandle
          )
        : null;
      if (followUpHandle) {
        console.log(`[WEBHOOK] Follow-up button matched handle=${followUpHandle} (exact=${followUpMatch?.exact}), edge=${followUpEdge ? followUpEdge.target : 'nenhuma (cai no fluxo normal)'}`);
      }

      if (isAtAIHandoff && activeFlowExec.status === 'waiting_input') {
        // Check if AI is paused by the human agent
        if (isAIPaused(conversation.metadata)) {
          console.log(`[WEBHOOK] AI is PAUSED for conversation ${conversation.id} — skipping orchestrator`);
        } else {
        console.log(`[WEBHOOK] Flow paused at ai-handoff node — routing message to agent-orchestrator`);

        // Get the ai_handoff_context from conversation metadata
        const convMetadata = conversation.metadata || {};
        const handoffContext = convMetadata.ai_handoff_context || {};

        const orchestratorBody: Record<string, unknown> = {
          conversationId: conversation.id,
          messageContent: triggerText || '[mídia]',
          messageId: savedMessage.id, // Pass messageId for hydration/transcription sync
          flowExecutionId: activeFlowExec.id, // So orchestrator can advance the flow
        };

        // Pass master prompt override from flow context
        if (handoffContext.masterPromptOverride) {
          orchestratorBody.masterPromptOverride = handoffContext.masterPromptOverride;
        }
        if (handoffContext.additionalContext) {
          orchestratorBody.additionalContext = handoffContext.additionalContext;
        }

        scheduleDebouncedOrchestrator(supabase, conversation.id, serviceRoleKey, orchestratorBody, triggerText || '[mídia]');
        } // end else (not paused)
      } else if (isAtActionFlow && activeFlowExec.status === 'waiting_input') {
        // action-flow node waiting for response — user responded! Route via 'responded' handle
        console.log(`[WEBHOOK] action-flow waiting_input — user responded! Routing via 'responded' handle`);

        const flowEdges = (activeFlowExec.flow?.edges || []) as any[];
        const respondedEdge = flowEdges.find((e: any) => e.source === activeFlowExec.current_node_id && e.sourceHandle === 'responded');
        const fallbackEdge = flowEdges.find((e: any) => e.source === activeFlowExec.current_node_id && !e.sourceHandle);
        const respondedTarget = followUpEdge?.target || respondedEdge?.target || fallbackEdge?.target || null;

        console.log(`[WEBHOOK] action-flow responded edge target: ${respondedTarget}`);

        if (respondedTarget) {
          // Clear timeout and remarketing, advance to responded node
          await supabase.from('flow_executions').update({
            // 'running' aqui era o zumbi: quem escreveu isto contava que o
            // flow-execute CONTINUASSE esta execucao a partir de current_node_id.
            // Ele nao continua nenhuma -- sempre insere outra (ver o insert em
            // flow-execute/index.ts). A linha ficava em 'running' sem ninguem
            // rodando, e como o webhook trata 'running' como fluxo ativo, a
            // conversa emudecia assim que a execucao de verdade terminasse.
            // Fechar aqui e o mesmo contrato ja usado no atraso inteligente
            // (process-flow-timeouts, fase 1.8) e na volta do sub-fluxo.
            status: 'completed',
            completed_at: new Date().toISOString(),
            current_node_id: respondedTarget,
            timeout_at: null,
            remarketing_step: 0,
          }).eq('id', activeFlowExec.id);

          runBackground(resumeFlow({
            flowId: activeFlowExec.flow_id,
            conversationId: conversation.id,
            startNodeId: respondedTarget,
            variables: (activeFlowExec as any).variables || {},
            triggerMessage: triggerText || '[mídia]',
            // As duas linhas sao a MESMA passagem do contato pelo fluxo,
            // so fatiada pela resposta dele. Sem este elo o historico
            // vira N execucoes soltas e root_execution_id se perde.
            resumedFromExecutionId: activeFlowExec.id,
            reason: 'action-flow respondido',
          }));
        } else {
          // No responded edge — flow STOPS here. Complete and cleanup.
          console.log(`[WEBHOOK] action-flow has NO responded edge — flow STOPS`);
          await supabase.from('flow_executions').update({
            status: 'completed',
            timeout_at: null,
            completed_at: new Date().toISOString(),
          }).eq('id', activeFlowExec.id);

          // Cleanup: reset service_mode and ai_agent_id
          const { data: convMeta } = await supabase.from('conversations').select('metadata').eq('id', conversation.id).single();
          const cleanMeta = { ...(convMeta?.metadata || {}) };
          delete cleanMeta.ai_handoff_context;
          cleanMeta.flow_ended_at = new Date().toISOString();
          await supabase.from('conversations').update({
            service_mode: 'ativo', ai_agent_id: null, metadata: cleanMeta,
          }).eq('id', conversation.id);
        }
      } else if (isAtContentBlockWaiting && activeFlowExec.status === 'waiting_input') {
        // Content block is waiting for user response — save variable and resume flow via 'responded' handle
        console.log(`[WEBHOOK] Content block waiting_input — saving response and resuming flow`);
        
        // Save the response to flow variables
        const existingVars = (activeFlowExec as any).variables || {};
        const saveVariable = currentNode.data?.saveVariable;
        if (saveVariable && triggerText) {
          existingVars[saveVariable] = triggerText;
        }

        // Find the 'responded' edge from this content-block node
        const flowEdges = (activeFlowExec.flow?.edges || []) as any[];
        const respondedEdge = flowEdges.find((e: any) => e.source === activeFlowExec.current_node_id && e.sourceHandle === 'responded');
        const nextEdge = followUpEdge || respondedEdge || flowEdges.find((e: any) => e.source === activeFlowExec.current_node_id);
        const nextNodeId = nextEdge?.target || null;

        if (nextNodeId) {
          await supabase.from('flow_executions').update({
            // 'running' aqui era o zumbi: quem escreveu isto contava que o
            // flow-execute CONTINUASSE esta execucao a partir de current_node_id.
            // Ele nao continua nenhuma -- sempre insere outra (ver o insert em
            // flow-execute/index.ts). A linha ficava em 'running' sem ninguem
            // rodando, e como o webhook trata 'running' como fluxo ativo, a
            // conversa emudecia assim que a execucao de verdade terminasse.
            // Fechar aqui e o mesmo contrato ja usado no atraso inteligente
            // (process-flow-timeouts, fase 1.8) e na volta do sub-fluxo.
            status: 'completed',
            completed_at: new Date().toISOString(),
            current_node_id: nextNodeId,
            variables: existingVars,
            timeout_at: null,
            remarketing_step: 0,
          }).eq('id', activeFlowExec.id);

          runBackground(resumeFlow({
            flowId: activeFlowExec.flow_id,
            conversationId: conversation.id,
            startNodeId: nextNodeId,
            variables: existingVars,
            triggerMessage: triggerText || '[mídia]',
            // As duas linhas sao a MESMA passagem do contato pelo fluxo,
            // so fatiada pela resposta dele. Sem este elo o historico
            // vira N execucoes soltas e root_execution_id se perde.
            resumedFromExecutionId: activeFlowExec.id,
            reason: 'bloco de conteudo respondido',
          }));
        } else {
          // No next node — flow STOPS here. Complete and cleanup.
          console.log(`[WEBHOOK] Content block has NO outgoing edge — flow STOPS`);
          await supabase.from('flow_executions').update({
            status: 'completed',
            variables: existingVars,
            completed_at: new Date().toISOString(),
            timeout_at: null,
            remarketing_step: 0,
          }).eq('id', activeFlowExec.id);

          // Cleanup: reset service_mode and ai_agent_id
          const { data: convMeta2 } = await supabase.from('conversations').select('metadata').eq('id', conversation.id).single();
          const cleanMeta2 = { ...(convMeta2?.metadata || {}) };
          delete cleanMeta2.ai_handoff_context;
          cleanMeta2.flow_ended_at = new Date().toISOString();
          await supabase.from('conversations').update({
            service_mode: 'ativo', ai_agent_id: null, metadata: cleanMeta2,
          }).eq('id', conversation.id);
        }
      } else if ((isAtMessageButtons || isAtMessageList) && activeFlowExec.status === 'waiting_input') {
        // Message buttons/list waiting for user choice — match response to specific option handle
        console.log(`[WEBHOOK] ${currentNode.type} waiting_input — matching user response to option`);
        
        const flowEdges = (activeFlowExec.flow?.edges || []) as any[];
        const userResponse = (triggerText || '').trim().toLowerCase();
        let matchedHandle: string | null = null;

        // Casamento em duas passadas: exato/número antes de parcial. Numa passada só,
        // a opção "Não" ganharia de "Não sei" só por vir antes na lista.
        // O tipo do casamento é devolvido junto porque o parcial não pode ganhar de um
        // casamento exato num botão do follow-up (ver a escolha da aresta abaixo).
        let matchedExact = false;
        const matchOption = (options: string[], handlePrefix: string, ids?: string[]): string | null => {
          // Botão nativo volta como o rótulo na maioria dos aparelhos, mas alguns
          // devolvem o id da opção ("btn_0") — aceita os dois antes do parcial.
          for (let i = 0; i < options.length; i++) {
            const optionId = ids?.[i]?.toLowerCase();
            if (
              userResponse === options[i].toLowerCase() ||
              userResponse === String(i + 1) ||
              (!!optionId && userResponse === optionId) ||
              userResponse === `${handlePrefix}${i}`
            ) {
              matchedExact = true;
              return `${handlePrefix}${i}`;
            }
          }
          for (let i = 0; i < options.length; i++) {
            const option = options[i].toLowerCase();
            if (userResponse.includes(option) || option.includes(userResponse)) {
              return `${handlePrefix}${i}`;
            }
          }
          return null;
        };

        if (isAtMessageButtons) {
          const buttons = (currentNode.data?.buttons || []) as Array<{ id: string; label: string }>;
          matchedHandle = matchOption(buttons.map((b) => b.label || ''), 'btn_', buttons.map((b) => b.id || ''));
          if (matchedHandle) console.log(`[WEBHOOK] Matched button handle: ${matchedHandle}`);
        } else {
          // List: match rows
          const sections = (currentNode.data?.sections || []) as Array<{ title: string; rows: Array<{ id: string; title: string }> }>;
          const allRows = sections.flatMap((section) => section.rows || []);
          matchedHandle = matchOption(allRows.map((r) => r.title || ''), 'row_');
          if (matchedHandle) console.log(`[WEBHOOK] Matched list row handle: ${matchedHandle}`);
        }

        // Find the target edge: specific handle match > 'responded' fallback > any edge
        let targetEdge = matchedHandle ? flowEdges.find((e: any) => e.source === activeFlowExec.current_node_id && e.sourceHandle === matchedHandle) : null;
        // A opção do próprio nó vem primeiro (o botão do follow-up costuma repetir
        // o rótulo dela); a saída exclusiva do follow-up entra quando não casou.
        // Exceção: com o rótulo batendo exatamente num botão do follow-up, a saída dele
        // ganha do casamento PARCIAL do nó — senão "Quero saber mais" (follow-up) seria
        // engolido pelo "Quero" (bloco) e o clique iria para a saída errada.
        if (targetEdge && !matchedExact && followUpEdge && followUpMatch?.exact) {
          console.log(`[WEBHOOK] Follow-up exact match beats partial node match — using ${followUpHandle}`);
          targetEdge = followUpEdge;
        }
        if (!targetEdge) targetEdge = followUpEdge || null;
        if (!targetEdge) {
          // Fallback: try 'responded' handle or any edge without specific handle
          targetEdge = flowEdges.find((e: any) => e.source === activeFlowExec.current_node_id && e.sourceHandle === 'responded');
        }
        if (!targetEdge) {
          targetEdge = flowEdges.find((e: any) => e.source === activeFlowExec.current_node_id && !e.sourceHandle);
        }
        const nextNodeId = targetEdge?.target || null;

        console.log(`[WEBHOOK] ${currentNode.type}: matchedHandle=${matchedHandle}, nextNodeId=${nextNodeId}`);

        if (nextNodeId) {
          const existingVars = (activeFlowExec as any).variables || {};
          existingVars._lastChoice = triggerText || '';
          existingVars._lastChoiceHandle = matchedHandle || 'none';

          await supabase.from('flow_executions').update({
            // 'running' aqui era o zumbi: quem escreveu isto contava que o
            // flow-execute CONTINUASSE esta execucao a partir de current_node_id.
            // Ele nao continua nenhuma -- sempre insere outra (ver o insert em
            // flow-execute/index.ts). A linha ficava em 'running' sem ninguem
            // rodando, e como o webhook trata 'running' como fluxo ativo, a
            // conversa emudecia assim que a execucao de verdade terminasse.
            // Fechar aqui e o mesmo contrato ja usado no atraso inteligente
            // (process-flow-timeouts, fase 1.8) e na volta do sub-fluxo.
            status: 'completed',
            completed_at: new Date().toISOString(),
            current_node_id: nextNodeId,
            variables: existingVars,
            timeout_at: null,
            remarketing_step: 0,
          }).eq('id', activeFlowExec.id);

          runBackground(resumeFlow({
            flowId: activeFlowExec.flow_id,
            conversationId: conversation.id,
            startNodeId: nextNodeId,
            variables: existingVars,
            triggerMessage: triggerText || '[mídia]',
            // As duas linhas sao a MESMA passagem do contato pelo fluxo,
            // so fatiada pela resposta dele. Sem este elo o historico
            // vira N execucoes soltas e root_execution_id se perde.
            resumedFromExecutionId: activeFlowExec.id,
            reason: 'botao/lista escolhido',
          }));
        } else {
          // No matching edge — flow STOPS
          console.log(`[WEBHOOK] ${currentNode.type} has NO matching edge — flow STOPS`);
          await supabase.from('flow_executions').update({
            status: 'completed',
            timeout_at: null,
            completed_at: new Date().toISOString(),
          }).eq('id', activeFlowExec.id);

          const { data: convMetaBtn } = await supabase.from('conversations').select('metadata').eq('id', conversation.id).single();
          const cleanMetaBtn = { ...(convMetaBtn?.metadata || {}) };
          delete cleanMetaBtn.ai_handoff_context;
          cleanMetaBtn.flow_ended_at = new Date().toISOString();
          await supabase.from('conversations').update({
            service_mode: 'ativo', ai_agent_id: null, metadata: cleanMetaBtn,
          }).eq('id', conversation.id);
        }
      } else if (activeFlowExec.status === 'waiting_input') {
        // Flow is waiting for input at a non-AI node (e.g., user-input)
        // First check if this node has any outgoing edge — if not, flow stops
        const flowEdgesGeneric = (activeFlowExec.flow?.edges || []) as any[];
        const hasOutgoingEdge = flowEdgesGeneric.some((e: any) => e.source === activeFlowExec.current_node_id);

        if (followUpEdge) {
          // Botão do follow-up com saída própria: avança por ela em vez de reexecutar o nó.
          console.log(`[WEBHOOK] Follow-up button routing to ${followUpEdge.target}`);
          const varsWithChoice = { ...((activeFlowExec as any).variables || {}) };
          const inputVariable = currentNode?.data?.variableName;
          if (inputVariable && triggerText) varsWithChoice[String(inputVariable)] = triggerText;

          await supabase.from('flow_executions').update({
            // 'running' aqui era o zumbi: quem escreveu isto contava que o
            // flow-execute CONTINUASSE esta execucao a partir de current_node_id.
            // Ele nao continua nenhuma -- sempre insere outra (ver o insert em
            // flow-execute/index.ts). A linha ficava em 'running' sem ninguem
            // rodando, e como o webhook trata 'running' como fluxo ativo, a
            // conversa emudecia assim que a execucao de verdade terminasse.
            // Fechar aqui e o mesmo contrato ja usado no atraso inteligente
            // (process-flow-timeouts, fase 1.8) e na volta do sub-fluxo.
            status: 'completed',
            completed_at: new Date().toISOString(),
            current_node_id: followUpEdge.target,
            variables: varsWithChoice,
            timeout_at: null,
            remarketing_step: 0,
          }).eq('id', activeFlowExec.id);

          runBackground(resumeFlow({
            flowId: activeFlowExec.flow_id,
            conversationId: conversation.id,
            startNodeId: followUpEdge.target,
            variables: varsWithChoice,
            triggerMessage: triggerText || '[mídia]',
            // As duas linhas sao a MESMA passagem do contato pelo fluxo,
            // so fatiada pela resposta dele. Sem este elo o historico
            // vira N execucoes soltas e root_execution_id se perde.
            resumedFromExecutionId: activeFlowExec.id,
            reason: 'botao de follow-up',
          }));
        } else if (!hasOutgoingEdge) {
          console.log(`[WEBHOOK] Node ${activeFlowExec.current_node_id} has NO outgoing edge — flow STOPS`);
          await supabase.from('flow_executions').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            timeout_at: null,
            remarketing_step: 0,
          }).eq('id', activeFlowExec.id);

          const { data: convMeta3 } = await supabase.from('conversations').select('metadata').eq('id', conversation.id).single();
          const cleanMeta3 = { ...(convMeta3?.metadata || {}) };
          delete cleanMeta3.ai_handoff_context;
          cleanMeta3.flow_ended_at = new Date().toISOString();
          await supabase.from('conversations').update({
            service_mode: 'ativo', ai_agent_id: null, metadata: cleanMeta3,
          }).eq('id', conversation.id);
        } else {
          console.log(`[WEBHOOK] Flow waiting_input at node ${activeFlowExec.current_node_id} — resuming flow execution`);

          // Este ramo nao fechava a execucao de jeito nenhum: reexecuta o MESMO
          // no, entao a linha antiga ficava em waiting_input enquanto a nova
          // nascia e parava no mesmo lugar. Duas linhas vivas no mesmo no, uma
          // a mais por mensagem -- a busca por started_at DESC escondia isso
          // enquanto a de cima fosse a certa. Fecha antes de chamar, como os
          // outros ramos.
          await supabase.from('flow_executions').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            timeout_at: null,
            remarketing_step: 0,
          }).eq('id', activeFlowExec.id);

          runBackground(resumeFlow({
            flowId: activeFlowExec.flow_id,
            conversationId: conversation.id,
            startNodeId: activeFlowExec.current_node_id,
            variables: (activeFlowExec as any).variables || {},
            triggerMessage: triggerText || '[mídia]',
            resumedFromExecutionId: activeFlowExec.id,
            reason: 'waiting_input generico',
          }));
        }
      } else {
        // Cai aqui todo status que nao e 'waiting_input': 'running' e
        // 'waiting_delay'. O log dizia "Flow is running" para os dois, o que
        // escondeu por completo o caso do atraso inteligente -- e escondeu os
        // zumbis, que apareciam em log exatamente como um fluxo saudavel.
        //
        // Sao situacoes diferentes, e so uma delas justifica descartar:
        //  - 'running': o motor esta executando agora, e questao de segundos.
        //    Descartar e certo -- a mensagem chegou no meio de um passo.
        //  - 'waiting_delay': o fluxo esta parado num atraso que pode durar
        //    horas. Nao espera o contato falar nada, mas a mensagem dele e
        //    engolida do mesmo jeito: nem campanha, nem agente independente.
        //    Ver a analise no final -- a mudanca de comportamento aqui e
        //    decisao de negocio, nao foi feita junto com a correcao do zumbi.
        console.log(
          `[WEBHOOK] Execução ${activeFlowExec.id} em '${activeFlowExec.status}' ` +
          `(nó=${activeFlowExec.current_node_id || '-'}) — mensagem não consumida por ela ` +
          `e gatilhos independentes não consultados.`
        );
      }
    } else {
      // 2. No active flow — check Campaign Triggers (keyword/webhook match starts a new flow).
      // Only reached when there's no flow already running for this conversation.
      if (triggerText) {
        // allowFallback só para mensagem de texto de verdade. Áudio e figurinha já não
        // chegam aqui (não têm textContent, então triggerText é ''), mas imagem, vídeo
        // e documento COM legenda chegam -- e uma legenda de foto não é alguém pedindo
        // boas-vindas. As campanhas com palavra-chave continuam valendo para todas
        // elas: o corte é só do gatilho "qualquer mensagem".
        const campaignTrigger = await checkCampaignTriggers(supabase, organizationId, contact.id, triggerText, {
          allowFallback: messageType === 'text',
        });

        if (campaignTrigger) {
          console.log('Campaign trigger matched:', JSON.stringify(campaignTrigger));
          return await startCampaignFlow(supabase, {
            organizationId,
            conversation,
            contact,
            phone,
            triggerText,
            savedMessageId: savedMessage.id,
            serviceRoleKey,
            ...campaignTrigger,
          });
        }
      }

      // 3. No campaign match either — Check for Master Prompt / AI routing
      // Also check if service_mode is 'ia' but flow just ended — if so, the service_mode
      // might be stale from a previous flow that didn't clean up properly
      let shouldTrigger = false;
      
      if (conversation.service_mode === 'ia') {
        // Double-check: if there's a flow_ended_at flag, the 'ia' mode might be stale
        const flowEndedAt = conversation.metadata?.flow_ended_at;
        if (flowEndedAt) {
          const elapsedMs = Date.now() - new Date(flowEndedAt).getTime();
          if (elapsedMs < 60000) {
            console.log(`[WEBHOOK] service_mode=ia but flow ended ${Math.round(elapsedMs/1000)}s ago — NOT triggering agent`);
            // Force reset to ativo (humano no comando) since it's stale
            await supabase.from('conversations').update({ service_mode: 'ativo', ai_agent_id: null }).eq('id', conversation.id);
            shouldTrigger = false;
          } else {
            shouldTrigger = true;
          }
        } else {
          shouldTrigger = true;
        }
      }

      if (!shouldTrigger && triggerText) {
        shouldTrigger = await checkMasterPromptTriggers(supabase, organizationId, contact.id, triggerText, conversation.id);
      }

      // Check if AI is paused by human agent
      if (shouldTrigger && isAIPaused(conversation.metadata)) {
        console.log(`[WEBHOOK] AI is PAUSED for conversation ${conversation.id} — skipping standalone orchestrator trigger`);
        shouldTrigger = false;
      }

      if (shouldTrigger) {
        console.log(`[WEBHOOK] Triggering agent-orchestrator for conversation ${conversation.id}. Mode: ${conversation.service_mode}, Text: "${triggerText}"`);
        const orchestratorBody: Record<string, unknown> = { 
          conversationId: conversation.id, 
          messageContent: triggerText || '[mídia]',
          messageId: savedMessage.id // Pass messageId for hydration
        };

        scheduleDebouncedOrchestrator(supabase, conversation.id, serviceRoleKey, orchestratorBody, triggerText || '[mídia]');
      }
    }
  }
  return respond({ success: true, messageId: savedMessage.id });
}

async function handleReadReceipt(supabase: any, payload: any) {
  const data = payload.data || {};
  const key = data.key || payload.key || {};
  const msg = payload.message || data.message || {};
  const instanceId = sanitizeInstanceIdentifier(payload.instanceId || data.instanceId);
  const instanceName = sanitizeInstanceIdentifier(payload.instanceName || payload.userID || payload.instance || data.instance);

  const msgId =
    msg.msgid ||
    msg.id ||
    key.id ||
    data.keyId ||
    data.id ||
    payload.id ||
    payload.messageId ||
    data.messageId ||
    payload.msgid;

  const status =
    msg.ack ??
    data.ack ??
    payload.ack ??
    data.status ??
    payload.status ??
    payload.statusMessage ??
    payload.update?.status;

  if (!msgId) return respond({ success: true, ignored: true, reason: 'receipt_without_message_id' });

  const updated = await updateMessageReceiptByProviderId(supabase, msgId, status);
  const normalizedStatus = String(status || '').toLowerCase();
  const remoteJid = data.remoteJid || key.remoteJidAlt || key.remoteJid || payload.remoteJid || '';
  if (remoteJid && ['read', 'read_ack', 'played', 'played_ack'].includes(normalizedStatus)) {
    await upsertContactPresenceByPhone(supabase, remoteJid, instanceId, instanceName, 'online', 60000);
  }
  return respond({ success: true, updated, msgId: normalizeProviderMessageId(msgId), status });
}

async function handlePresence(supabase: any, payload: any, instanceId: string, instanceName: string) {
  const chat = payload.chat || {};
  const data = payload.data || {};
  const key = data.key || {};
  const presences = data.presences || payload.presences || {};
  const presenceJid = Object.keys(presences || {})[0];
  const presenceNode = presenceJid ? presences[presenceJid] : null;

  const rawPhone =
    chat.phone ||
    chat.wa_chatid ||
    payload.chatId ||
    payload.sender ||
    payload.number ||
    data.id ||
    data.remoteJid ||
    data.jid ||
    data.participant ||
    key.remoteJidAlt ||
    key.participantAlt ||
    key.remoteJid ||
    presenceJid ||
    '';
  const phone = cleanPhone(rawPhone);

  if (!phone) {
    console.log(`[Presence] No phone found in payload for instanceId=${instanceId}, instanceName=${instanceName}`);
    return new Response(JSON.stringify({ error: 'Phone not found' }), { status: 400 });
  }

  // Identify instance for presence
  const { data: whatsappInstance, error: presenceInstanceError } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .or([
      instanceId ? `zapi_instance_id.eq.${instanceId}` : '',
      instanceName ? `zapi_instance_id.eq.${instanceName}` : '',
      instanceName ? `evolution_instance_name.eq.${instanceName}` : '',
      instanceId ? `evolution_instance_id.eq.${instanceId}` : '',
    ].filter(Boolean).join(','))
    .maybeSingle();

  if (presenceInstanceError || !whatsappInstance) {
    console.warn(`[WEBHOOK presence] No instance found: ID=${instanceId}, Name=${instanceName}`);
    return respond({ success: true, ignored: true, reason: 'instance_not_found' });
  }

    const variants = phoneVariants(phone);
    const { data: contact } = await supabase.from('contacts').select('id')
      .eq('organization_id', whatsappInstance.organization_id)
      .in('phone', variants.length > 0 ? variants : [phone])
      .limit(1)
      .maybeSingle();
    if (!contact) return respond({ success: true });

    const state = String(
      payload.state ||
      payload.presenceType ||
      payload.presence ||
      data.presence ||
      data.lastKnownPresence ||
      data.status ||
      presenceNode?.lastKnownPresence ||
      presenceNode?.presence ||
      presenceNode?.status ||
      ''
    ).toLowerCase();
    let presenceType: string;
    switch (state) {
      case 'composing': case 'typing': presenceType = 'typing'; break;
      case 'recording': presenceType = 'recording'; break;
      case 'online': case 'available': case 'active': case 'composing_online': presenceType = 'online'; break;
      default: presenceType = 'offline';
    }

    await supabase.from('contact_presence').upsert({
      contact_id: contact.id, organization_id: whatsappInstance.organization_id,
      presence_type: presenceType, started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30000).toISOString(),
    }, { onConflict: 'contact_id' });

    return respond({ success: true });
}

// ========== HELPERS ==========

  async function resolveWorkspacesForInstance(supabase: any, organizationId: string, whatsappInstanceId?: string | null): Promise<string[]> {
    if (whatsappInstanceId) {
      const { data: instanceWorkspaces } = await supabase
        .from('workspaces')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('whatsapp_instance_id', whatsappInstanceId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      if (instanceWorkspaces?.length) return instanceWorkspaces.map((workspace: any) => workspace.id);
    }

    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
      .limit(2);

    return workspaces?.length === 1 ? [workspaces[0].id] : [];
  }

  async function findOrCreateContact(supabase: any, phone: string, organizationId: string, name: string | null, avatarUrl: string | null, workspaceId?: string | null, lid?: string) {
    const variants = phoneVariants(phone);
    const canonical = canonicalPhone(phone);

    // Try any known representation first. Providers sometimes disagree about:
    // country code, the Brazilian ninth digit, or append a transient trailing digit.
    const { data: existingContacts } = await supabase
      .from('contacts').select('*')
      .eq('organization_id', organizationId)
      .in('phone', variants.length > 0 ? variants : [phone])
      .order('updated_at', { ascending: false })
      .limit(20);

    const existing = (existingContacts || []).sort((a: any, b: any) => {
      const aPhone = canonicalPhone(a.phone || '');
      const bPhone = canonicalPhone(b.phone || '');
      const aCanonical = aPhone === canonical || a.metadata?.canonical_phone === canonical;
      const bCanonical = bPhone === canonical || b.metadata?.canonical_phone === canonical;
      if (aCanonical !== bCanonical) return aCanonical ? -1 : 1;
      const aHasCountryCode = String(a.phone || '').replace(/\D/g, '').startsWith('55');
      const bHasCountryCode = String(b.phone || '').replace(/\D/g, '').startsWith('55');
      if (aHasCountryCode !== bHasCountryCode) return aHasCountryCode ? -1 : 1;
      return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
    })[0];

    if (existing) {
      if ((existingContacts || []).length > 1) {
        await mergeDuplicateContactConversations(
          supabase,
          organizationId,
          existing,
          (existingContacts || []).filter((contact: any) => contact.id !== existing.id),
        );
      }

      const updateData: any = {};
      if (name && !existing.name) updateData.name = name;
      if (avatarUrl && !existing.avatar_url) updateData.avatar_url = avatarUrl;
      if (workspaceId && !existing.workspace_id) updateData.workspace_id = workspaceId;
      const metadata = { ...(existing.metadata || {}) };
      const aliases = uniquePhones([...(metadata.phone_aliases || []), phone, canonical, ...variants]);
      updateData.metadata = { ...metadata, phone_aliases: aliases, canonical_phone: canonical };
      if (lid) updateData.metadata.wa_lid = lid;
      if (Object.keys(updateData).length > 0) {
        await supabase.from('contacts').update(updateData).eq('id', existing.id);
      }

      // Mensagem chegou por um número de OUTRO workspace: a conversa nasce lá
      // (regra "workspace = número"), então o contato também precisa aparecer
      // lá -- senão o time vê a conversa e não acha a ficha de quem está
      // falando. O contato NÃO é movido: continua visível no workspace de
      // origem.
      const sharedWorkspaces: string[] = existing.shared_workspace_ids || [];
      const ownerWorkspace = updateData.workspace_id ?? existing.workspace_id;
      if (workspaceId && ownerWorkspace !== workspaceId && !sharedWorkspaces.includes(workspaceId)) {
        const { error: shareError } = await supabase.rpc('share_contact_with_workspace', {
          _contact_id: existing.id,
          _workspace_id: workspaceId,
        });
        if (shareError) {
          console.error('[CONTACT] Falha ao compartilhar contato com workspace:', shareError);
        } else {
          updateData.shared_workspace_ids = [...sharedWorkspaces, workspaceId];
        }
      }

      return { ...existing, ...updateData };
    }

    // Create new
    const { data: newContact, error } = await supabase
      .from('contacts')
      .insert({
        phone: canonical,
        name: name || null,
        avatar_url: avatarUrl || null,
        organization_id: organizationId,
        workspace_id: workspaceId || null,
        metadata: {
          phone_aliases: uniquePhones([phone, canonical, ...variants]),
          canonical_phone: canonical,
          ...(lid ? { wa_lid: lid } : {}),
        },
      })
      .select().single();
    if (error) throw error;
    return newContact;
  }

  async function mergeDuplicateContactConversations(
    supabase: any,
    organizationId: string,
    keeperContact: any,
    duplicateContacts: any[],
  ) {
    if (!duplicateContacts.length) return;

    try {
      const scopeKey = (conversation: any) => conversation.whatsapp_instance_id || 'no_instance';
      const { data: keeperConversations } = await supabase
        .from('conversations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('contact_id', keeperContact.id)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      const keeperByScope = new Map<string, any>();
      for (const conversation of keeperConversations || []) {
        const key = scopeKey(conversation);
        if (!keeperByScope.has(key)) keeperByScope.set(key, conversation);
      }

      for (const duplicateContact of duplicateContacts) {
        const { data: duplicateConversations } = await supabase
          .from('conversations')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('contact_id', duplicateContact.id)
          .order('last_message_at', { ascending: false, nullsFirst: false });

        for (const duplicateConversation of duplicateConversations || []) {
          const key = scopeKey(duplicateConversation);
          let targetConversation = keeperByScope.get(key);

          if (!targetConversation) {
            const { data: movedConversation, error: moveError } = await supabase
              .from('conversations')
              .update({
                contact_id: keeperContact.id,
                metadata: {
                  ...(duplicateConversation.metadata || {}),
                  merged_from_contact_ids: [duplicateContact.id],
                },
              })
              .eq('id', duplicateConversation.id)
              .select()
              .maybeSingle();
            if (!moveError && movedConversation) keeperByScope.set(key, movedConversation);
            continue;
          }

          if (duplicateConversation.id === targetConversation.id) continue;

          await supabase
            .from('messages')
            .update({ conversation_id: targetConversation.id })
            .eq('conversation_id', duplicateConversation.id);

          const mergedIds = [
            ...((targetConversation.metadata || {}).merged_conversation_ids || []),
            duplicateConversation.id,
          ];

          const newestLastMessage =
            new Date(duplicateConversation.last_message_at || 0).getTime() >
            new Date(targetConversation.last_message_at || 0).getTime()
              ? duplicateConversation.last_message_at
              : targetConversation.last_message_at;

          await supabase
            .from('conversations')
            .update({
              last_message_at: newestLastMessage || new Date().toISOString(),
              unread_count: (targetConversation.unread_count || 0) + (duplicateConversation.unread_count || 0),
              metadata: {
                ...(targetConversation.metadata || {}),
                merged_conversation_ids: Array.from(new Set(mergedIds)),
              },
            })
            .eq('id', targetConversation.id);

          await supabase
            .from('conversations')
            .delete()
            .eq('id', duplicateConversation.id);
        }

        const duplicateMetadata = { ...(duplicateContact.metadata || {}) };
        duplicateMetadata.merged_into_contact_id = keeperContact.id;
        duplicateMetadata.merged_at = new Date().toISOString();
        await supabase
          .from('contacts')
          .update({ metadata: duplicateMetadata })
          .eq('id', duplicateContact.id);
      }
    } catch (error) {
      console.error('[CONTACT_MERGE] Failed to merge duplicate contact conversations:', error);
    }
  }

  async function findOrCreateConversation(supabase: any, contactId: string, organizationId: string, whatsappInstanceId: string, sourcePhone?: string, workspaceId?: string | null) {
    // A same customer can talk to different company numbers. Conversation identity
    // must include the receiving WhatsApp instance to avoid cross-company routing.
    let existingQuery = supabase
      .from('conversations').select('*')
      .eq('contact_id', contactId).eq('organization_id', organizationId);

    existingQuery = whatsappInstanceId
      ? existingQuery.eq('whatsapp_instance_id', whatsappInstanceId)
      : existingQuery.is('whatsapp_instance_id', null);

    const { data: existing } = await existingQuery
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (existing) {
      const updates: any = {};
      // PREENCHE, NÃO MOVE. Antes isto reescrevia o workspace da conversa a cada
      // mensagem recebida, sempre que a instância resolvia para um workspace só.
      // Com dois workspaces disputando o mesmo número, basta o vínculo mudar uma
      // vez para que TODA conversa que receba mensagem migre junto — e o usuário
      // vê conversas trocando de workspace sozinhas. Reparo de workspace errado
      // agora é operação explícita (docs/sanear-conversas-workspace-errado.sql),
      // não efeito colateral de uma mensagem chegar.
      if (workspaceId && !existing.workspace_id) updates.workspace_id = workspaceId;

      if (!existing.source_phone && sourcePhone) updates.source_phone = sourcePhone;
      if (Object.keys(updates).length > 0) {
        await supabase.from('conversations').update(updates).eq('id', existing.id);
      }
      return { ...existing, ...updates };
    }

    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({
        contact_id: contactId, organization_id: organizationId,
        whatsapp_instance_id: whatsappInstanceId, source_phone: sourcePhone || null,
        workspace_id: workspaceId || null,
        status: 'open', unread_count: 0,
      })
      .select().single();

    if (error) {
      if (error.code === '23505') {
        let raceQuery = supabase
          .from('conversations').select('*')
          .eq('contact_id', contactId).eq('organization_id', organizationId);

        raceQuery = whatsappInstanceId
          ? raceQuery.eq('whatsapp_instance_id', whatsappInstanceId)
          : raceQuery.is('whatsapp_instance_id', null);

        // Corrida na MESMA instância: recupera a conversa recém-criada por outro
        // request. Escopo por instância ativo (idx_conversations_contact_org_instance_unique),
        // então o 23505 só ocorre para (contato, org, instância) idêntico — NÃO
        // mesclamos com conversa de outra instância (cada número = um chat).
        const { data: raceExisting } = await raceQuery.limit(1).maybeSingle();
        if (raceExisting) return raceExisting;
      }
      throw error;
    }
    return newConv;
  }

  async function checkMasterPromptTriggers(supabase: any, organizationId: string, contactId: string, messageContent: string, conversationId: string): Promise<boolean> {
    // Check if a flow just ended recently (within last 30 seconds) — if so, don't re-trigger
    const { data: convCheck } = await supabase
      .from('conversations')
      .select('metadata')
      .eq('id', conversationId)
      .single();
    
    const flowEndedAt = convCheck?.metadata?.flow_ended_at;
    if (flowEndedAt) {
      const elapsedMs = Date.now() - new Date(flowEndedAt).getTime();
      if (elapsedMs < 60000) { // 60 seconds grace period
        console.log(`[WEBHOOK] Skipping master prompt triggers — flow ended ${Math.round(elapsedMs/1000)}s ago`);
        return false;
      }
    }

    const { data: masterPrompts } = await supabase
      .from('master_prompts')
      .select('id, trigger_type, trigger_tags, trigger_keywords')
      .eq('organization_id', organizationId).eq('is_active', true)
      .neq('trigger_type', 'disabled');
    if (!masterPrompts?.length) return false;

    for (const mp of masterPrompts) {
      if (mp.trigger_type === 'tag' && mp.trigger_tags?.length > 0) {
        const { data: contactTags } = await supabase
          .from('contact_tags').select('tag_id')
          .eq('contact_id', contactId).in('tag_id', mp.trigger_tags);
        if (contactTags?.length > 0) {
          await supabase.from('conversations').update({ service_mode: 'ia' }).eq('id', conversationId);
          return true;
        }
      }
      if (mp.trigger_type === 'keyword' && mp.trigger_keywords?.length > 0) {
        const msgLower = messageContent.toLowerCase().trim();
        for (const kw of mp.trigger_keywords) {
          if (!kw.value) continue;
          let matched = false;
          const msgNormalized = normalizeText(msgLower);
          const kwNormalized = normalizeText(kw.value);
          switch (kw.match_type) {
            case 'exact': matched = msgNormalized === kwNormalized; break;
            case 'contains': {
              const words = kwNormalized.split(',').map((w: string) => w.trim()).filter(Boolean);
              matched = words.some((w: string) => msgNormalized.includes(w));
              break;
            }
            case 'starts_with': matched = msgNormalized.startsWith(kwNormalized); break;
          }
          if (matched) {
            await supabase.from('conversations').update({ service_mode: 'ia' }).eq('id', conversationId);
            return true;
          }
        }
      }
    }
    return false;
  }
  // Check for exact, contains, or starts_with matches in active campaigns.
  //
  // Duas coisas que faltavam aqui e que mudam o comportamento do produto:
  //
  // 1. PÚBLICO. Antes, a função só olhava o TEXTO. Qualquer contato da
  //    organização que digitasse a palavra-chave disparava a campanha — não havia
  //    como restringir. Palavra-chave comum ("sim", "quero", "lista") virava
  //    gatilho aberto para a base inteira, e comando interno pelo WhatsApp era
  //    impossível de montar. Agora, campanha com trigger_tag_ids preenchido só
  //    casa se o contato passar no filtro; sem tags configuradas, nada muda.
  //
  // 2. ORDEM. Não havia ORDER BY: entre duas campanhas com textos que se
  //    sobrepõem, ganhava a que o banco entregasse primeiro. Agora é
  //    trigger_priority DESC e, no empate, created_at ASC — arbitrário, mas
  //    estável, que é o que faltava.
  //
  // Palavra casou mas o público não? Segue para a PRÓXIMA campanha em vez de
  // desistir: é justamente assim que "campanha restrita ao staff" e "campanha
  // aberta ao lead" convivem na mesma palavra-chave, decididas por prioridade.
  //
  // 3. FLUXO EM ANDAMENTO. Por padrão esta função só é chamada com a conversa livre.
  //    Com `onlyInterruptors`, ela é chamada TAMBÉM com fluxo ativo, e aí o conjunto
  //    se restringe às campanhas marcadas com interrompe_fluxo -- é uma segunda
  //    consulta ao mesmo lugar, não uma segunda lista de campanhas em memória.
  //    `excludeFlowId` tira da disputa o fluxo que já está rodando: interromper um
  //    fluxo para começar ele mesmo de novo seria laço.
  //
  // 4. QUALQUER MENSAGEM (match_type = 'fallback'). Campanha sem texto próprio, para
  //    quem escreveu algo que nenhuma campanha reconheceu -- o lead que apagou a
  //    mensagem pronta do anúncio e digitou outra coisa caía no vazio: sem campanha,
  //    sem fluxo, sem aviso. Ela é avaliada num SEGUNDO PASSE sobre a mesma lista, só
  //    depois de o primeiro terminar sem nenhum casamento. Isso é o que garante que
  //    ela nunca ganhe de uma palavra-chave específica -- não depende de
  //    trigger_priority, que ela nem consulta. Duas restrições vêm junto:
  //      - `allowFallback` só é ligado para mensagem de TEXTO. Áudio, figurinha e
  //        mídia não acionam boas-vindas (mídia com legenda tem triggerText e chegaria
  //        aqui; é o chamador que corta pelo messageType).
  //      - nunca no modo interruptor. "Casa com tudo" + "interrompe fluxo" tiraria a
  //        base inteira de dentro dos fluxos com qualquer mensagem.
  async function checkCampaignTriggers(
    supabase: any,
    organizationId: string,
    contactId: string,
    messageContent: string,
    options?: { onlyInterruptors?: boolean; excludeFlowId?: string | null; allowFallback?: boolean },
  ): Promise<{ flowId: string, campaignId: string } | null> {
    const onlyInterruptors = options?.onlyInterruptors === true;
    // A recusa no modo interruptor é aqui, e não só na tela: a coluna é texto livre e
    // um INSERT direto no banco chegaria com as duas coisas marcadas.
    const allowFallback = options?.allowFallback === true && !onlyInterruptors;

    // interrompe_fluxo só entra no SELECT no modo interruptor. Enquanto a migration
    // não estiver aplicada, coluna inexistente derruba o SELECT INTEIRO no PostgREST
    // (não é erro de linha, é erro de query) -- e levaria junto toda campanha por
    // palavra-chave. Assim o estrago fica contido: o modo interruptor devolve null,
    // o fluxo retoma como sempre retomou, e o resto segue funcionando.
    let campaignsQuery = supabase
      .from('campaigns')
      .select(
        onlyInterruptors
          ? 'id, trigger_keyword, match_type, flow_id, is_active, trigger_tag_ids, trigger_tag_match, trigger_priority, interrompe_fluxo'
          : 'id, trigger_keyword, match_type, flow_id, is_active, trigger_tag_ids, trigger_tag_match, trigger_priority',
      )
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (onlyInterruptors) campaignsQuery = campaignsQuery.eq('interrompe_fluxo', true);

    const { data: campaigns, error: campaignsError } = await campaignsQuery
      .order('trigger_priority', { ascending: false })
      .order('created_at', { ascending: true });

    if (campaignsError) {
      console.error(`Error fetching campaigns${onlyInterruptors ? ' (modo interruptor)' : ''}:`, campaignsError);
      return null;
    }

    console.log(`Found ${campaigns?.length || 0} active${onlyInterruptors ? ' interrupting' : ''} campaigns for org ${organizationId}`);

    if (!campaigns?.length) return null;

    // Tags do contato: carregadas UMA vez, e só se alguma campanha tiver filtro
    // de público. Org que não usa o recurso não paga query nenhuma por mensagem.
    let contactTagIds: Set<string> | null = null;
    const loadContactTagIds = async (): Promise<Set<string>> => {
      if (contactTagIds) return contactTagIds;
      const { data: rows } = await supabase
        .from('contact_tags')
        .select('tag_id')
        .eq('contact_id', contactId);
      contactTagIds = new Set((rows || []).map((r: any) => r.tag_id));
      return contactTagIds;
    };

    const audienceAllows = async (campaign: any): Promise<boolean> => {
      const required: string[] = Array.isArray(campaign.trigger_tag_ids) ? campaign.trigger_tag_ids : [];
      if (!required.length) return true;

      const has = await loadContactTagIds();
      const mode = campaign.trigger_tag_match || 'any';

      if (mode === 'all') return required.every((t) => has.has(t));
      if (mode === 'none') return !required.some((t) => has.has(t));
      return required.some((t) => has.has(t));
    };

    const msgLower = messageContent.toLowerCase().trim();
    console.log(`Comparing message "${msgLower}" against campaigns...`);

    const msgNormalized = normalizeText(msgLower);

    // Casamento por TEXTO. Devolve o termo que casou (serve de log) ou null.
    const matchedKeywordOf = (campaign: any): string | null => {
      if (!campaign.trigger_keyword) return null;

      // words might be comma separated "sim, quero, gosto"
      const keywords = campaign.trigger_keyword.split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean);
      console.log(`Campaign ${campaign.id} keywords:`, keywords, `Match type: ${campaign.match_type}`);

      // "all_words": E lógico -- todos os termos da lista precisam aparecer na
      // mensagem, em qualquer ordem. Ignora pontuação e espaço extra dos dois
      // lados, que é o que costuma quebrar gatilho de anúncio copiado.
      if (campaign.match_type === 'all_words') {
        const msgWords = stripPunctuation(msgNormalized);
        const terms = keywords
          .map((k: string) => stripPunctuation(normalizeText(k)))
          .filter(Boolean);

        return terms.length && terms.every((t: string) => msgWords.includes(t))
          ? terms.join(' + ')
          : null;
      }

      for (const kw of keywords) {
        let matched = false;
        const kwNormalized = normalizeText(kw);
        switch (campaign.match_type) {
          case 'exact':
            matched = msgNormalized === kwNormalized;
            break;
          case 'contains':
            matched = msgNormalized.includes(kwNormalized);
            break;
          case 'starts_with':
            matched = msgNormalized.startsWith(kwNormalized);
            break;
          default:
            matched = msgNormalized === kwNormalized;
        }

        if (matched) return kw;
      }

      return null;
    };

    // Tudo que NÃO é texto: laço de fluxo e público. Vale igual para os dois passes --
    // a campanha "qualquer mensagem" respeita trigger_tag_ids exatamente como as
    // outras, e é disso que depende o uso normal dela (match 'none' com uma etiqueta,
    // para pegar só quem ainda não foi identificado).
    const campaignIsEligible = async (campaign: any, matchedLabel: string): Promise<boolean> => {
      // O fluxo que já está rodando não pode ser reiniciado por ele mesmo.
      if (options?.excludeFlowId && campaign.flow_id === options.excludeFlowId) {
        console.log(`[WEBHOOK] Campaign ${campaign.id} casou com "${matchedLabel}" mas aponta para o fluxo que já está ativo (${campaign.flow_id}) — ignorando para não virar laço`);
        return false;
      }

      if (!(await audienceAllows(campaign))) {
        console.log(`[WEBHOOK] Campaign ${campaign.id} casou com "${matchedLabel}" mas o contato ${contactId} está fora do público (match=${campaign.trigger_tag_match}) — seguindo para a próxima`);
        return false;
      }

      return true;
    };

    // PASSE 1 -- campanhas com texto próprio, na ordem trigger_priority DESC /
    // created_at ASC. As 'fallback' ficam de fora deste passe inteiro: é aqui, e não
    // na prioridade, que mora a garantia de que elas nunca ganham de uma palavra-chave.
    for (const campaign of campaigns) {
      if (campaign.match_type === FALLBACK_MATCH_TYPE) continue;

      const matchedKeyword = matchedKeywordOf(campaign);
      if (!matchedKeyword) continue;
      if (!(await campaignIsEligible(campaign, matchedKeyword))) continue;

      console.log(`MATCH FOUND! Campaign: ${campaign.id}, Keyword: ${matchedKeyword}, priority: ${campaign.trigger_priority}`);
      return { flowId: campaign.flow_id, campaignId: campaign.id };
    }

    // PASSE 2 -- "qualquer mensagem". Só chega aqui quem passou por todas as campanhas
    // acima sem casar com nenhuma. Sem consulta nova: é a mesma lista já carregada.
    if (allowFallback) {
      for (const campaign of campaigns) {
        if (campaign.match_type !== FALLBACK_MATCH_TYPE) continue;
        if (!(await campaignIsEligible(campaign, '(qualquer mensagem)'))) continue;

        console.log(`[WEBHOOK] Nenhuma campanha reconheceu "${msgLower}" — caindo na campanha "qualquer mensagem" ${campaign.id}`);
        return { flowId: campaign.flow_id, campaignId: campaign.id };
      }
    }

    console.log(`[WEBHOOK] No campaign match found for message: ${msgLower}${allowFallback ? '' : ' (gatilho "qualquer mensagem" não consultado nesta mensagem)'}`);
    return null;
  }

  // Início de uma campanha por palavra-chave: dado o par (campanha, fluxo) que o
  // checkCampaignTriggers escolheu, faz todo o resto -- modo IA, workspace, contador,
  // horário comercial (fila, quando está fora) e a chamada do flow-execute.
  //
  // Virou função porque agora são DOIS os pontos de entrada: a conversa livre (o caso
  // de sempre) e a campanha interruptora, que entra com um fluxo já parado na conversa.
  // Os dois precisam do mesmo tratamento -- inclusive a fila de fora de horário, que
  // seria o detalhe fácil de esquecer numa segunda cópia disto.
  async function startCampaignFlow(
    supabase: any,
    args: {
      organizationId: string;
      conversation: any;
      contact: any;
      phone: string;
      triggerText: string;
      savedMessageId: string;
      serviceRoleKey: string;
      flowId: string;
      campaignId: string;
    },
  ): Promise<Response> {
    const { organizationId, conversation, contact, phone, triggerText, savedMessageId, serviceRoleKey } = args;
    const campaignFlowId = args.flowId;
    const campaignId = args.campaignId;
    console.log(`[CAMPAIGN TRIGGERED] Starting flow ${campaignFlowId} for conversation ${conversation.id}`);
    // Mark as IA mode
    await supabase.from('conversations').update({ service_mode: 'ia' }).eq('id', conversation.id);

    // Apply campaign workspace if configured
    const { data: campaignFull } = await supabase.from('campaigns').select('name, workspace_id, start_time, end_time').eq('id', campaignId).single();

    // Seed flow variables from the trigger/campaign context so keyword-triggered
    // flows can use {{phone}}, {{name}}, {{campaign_id}}, {{campaign_name}} —
    // matching what campaign-webhook already passes and what the UI advertises.
    const campaignVariables = {
      phone,
      name: contact.name || '',
      campaign_id: campaignId,
      campaign_name: campaignFull?.name || '',
    };
    // PREENCHE, NÃO MOVE. Uma palavra-chave de campanha do workspace B não
    // pode arrastar para B a conversa que já vive no workspace A: era assim
    // que conversas do "Comercial" apareciam no "Comercial 2" — só as dos
    // contatos que dispararam a palavra-chave, daí "não são todas, algumas".
    if (campaignFull?.workspace_id && !conversation.workspace_id) {
      console.log(`[CAMPAIGN] Assigning workspace ${campaignFull.workspace_id} from campaign`);
      // Mesma regra para o CONTATO: a guarda acima olha a conversa, mas o
      // contato pode já ter dono (workspace A) mesmo com a conversa sem
      // workspace -- e aí este update o arrastaria para B. A RPC adota só se
      // ele estiver sem workspace; tendo dono, ela apenas o faz aparecer aqui
      // também.
      const { error: campaignShareError } = await supabase.rpc('share_contact_with_workspace', {
        _contact_id: contact.id,
        _workspace_id: campaignFull.workspace_id,
      });
      if (campaignShareError) {
        console.error('[CAMPAIGN] Falha ao dar visibilidade do contato ao workspace:', campaignShareError);
      }
      await supabase.from('conversations').update({ workspace_id: campaignFull.workspace_id }).eq('id', conversation.id);
    } else if (campaignFull?.workspace_id) {
      console.log(`[CAMPAIGN] Conversa ${conversation.id} já pertence ao workspace ${conversation.workspace_id} — campanha não move`);
    }

    // Increment campaign counter
    await supabase.rpc('increment_campaign_count', { campaign_id: campaignId });

    // Get organization timezone
    const { data: orgData } = await supabase.from('organizations').select('timezone').eq('id', organizationId).single();
    const orgTimezone = orgData?.timezone || 'America/Sao_Paulo';

    // Check if within business hours using org timezone
    const now = new Date();
    const bzTimeStr = new Intl.DateTimeFormat('pt-BR', {
        timeZone: orgTimezone,
        hour: '2-digit', minute: '2-digit', hour12: false
    }).format(now);

    const startT = campaignFull?.start_time || "00:00";
    const endT = campaignFull?.end_time || "23:59";

    let isOutsideHours = false;
    if (startT <= endT) {
        isOutsideHours = bzTimeStr < startT || bzTimeStr > endT;
    } else {
        // Crosses midnight
        isOutsideHours = bzTimeStr < startT && bzTimeStr > endT;
    }

    if (isOutsideHours) {
      console.log(`[CAMPAIGN QUEUED] Outside hours (${bzTimeStr} vs ${startT}-${endT}). Adding to queue.`);

      // Calculate when the queue should run (next start time) in UTC
      const [sHour, sMin] = startT.split(':').map(Number);
      const [cHour] = bzTimeStr.split(':').map(Number);

      // Get org timezone offset by comparing UTC and local representations
      const localNow = new Date(now.toLocaleString("en-US", { timeZone: orgTimezone }));
      const offsetMs = localNow.getTime() - now.getTime();

      // Build the target date in org local time, then convert to UTC
      const localDate = new Date(localNow);
      if (cHour >= sHour) {
          // It's after start hour but outside hours (means it's after end time), schedule for tomorrow
          localDate.setDate(localDate.getDate() + 1);
      }
      localDate.setHours(sHour, sMin, 0, 0);

      // Convert local time back to real UTC by subtracting the offset
      const scheduledUTC = new Date(localDate.getTime() - offsetMs);

      console.log(`[CAMPAIGN QUEUED] Scheduled for ${scheduledUTC.toISOString()} (${startT} ${orgTimezone})`);

      await supabase.from('campaign_queue').insert({
        organization_id: organizationId,
        campaign_id: campaignId,
        conversation_id: conversation.id,
        contact_id: contact.id,
        message_content: triggerText,
        variables: campaignVariables,
        scheduled_for: scheduledUTC.toISOString(),
        status: 'pending'
      });
      return respond({ success: true, messageId: savedMessageId, queued: true });
    }

    console.log(`[WEBHOOK] Invoking flow-execute for campaign ${campaignId}, flow ${campaignFlowId}`);
    // Call flow execution engine — await to ensure it starts (don't fire-and-forget)
    const flowExecPromise = (async () => {
      try {
        const resp = await fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/flow-execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({
            flowId: campaignFlowId,
            conversationId: conversation.id,
            triggerMessage: triggerText || '[mídia]',
            variables: campaignVariables
          }),
        });
        if (!resp.ok) {
          const errText = await resp.text();
          console.error(`[WEBHOOK] flow-execute failed for campaign ${campaignId}: ${resp.status} ${errText}`);
        } else {
          console.log(`[WEBHOOK] flow-execute started successfully for campaign ${campaignId}`);
        }
      } catch (err) {
        console.error(`[WEBHOOK] flow-execute fetch error for campaign ${campaignId}:`, err);
      }
    })();
    runBackground(flowExecPromise);

    return respond({ success: true, messageId: savedMessageId, triggeredCampaign: true });
  }

  function normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      // Espa\u00e7o duplicado / quebra de linha no meio da frase n\u00e3o pode quebrar o
      // gatilho -- \u00e9 o erro mais comum ao colar a palavra-chave de um an\u00fancio.
      .replace(/\s+/g, " ")
      .trim();
  }

  // S\u00f3 para o modo "todas as palavras": troca pontua\u00e7\u00e3o por espa\u00e7o, sen\u00e3o
  // "houston," nunca casa com o termo "houston".
  function stripPunctuation(text: string): string {
    return text.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  }

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// WHATSAPP BUSINESS LABELS (Evolution API)
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// A Evolution emite (whatsapp.baileys.service.ts, sendDataWebhook):
//   labels.edit        \u2192 data = { id, name, color (\u00edndice 0-19), deleted?, ... }
//   labels.association \u2192 data = { instance, type: 'add'|'remove', chatId, labelId }
// N\u00e3o existe GET oficial de "labels do contato X" \u2014 por isso cada evento \u00e9
// persistido aqui na hora, e a function sync-whatsapp-labels reconcilia o drift.

// Paleta de cores de etiqueta do WhatsApp, indexada 0-19. A cor exata importa
// pouco (\u00e9 s\u00f3 a cor default da tag criada); o fallback cobre \u00edndices novos.
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

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

// O findLabels da Evolution devolve tamb\u00e9m as LISTAS internas do WhatsApp
// (Favoritos/Grupos/N\u00e3o lidas/Comunidades) misturadas com etiquetas reais \u2014
// confirmado na inst\u00e2ncia viva (v2.3.6). Sincronizar essas viraria tag lixo
// ("N\u00e3o lidas" taggearia contato em massa). Compara\u00e7\u00e3o com acentos removidos
// porque a pr\u00f3pria Evolution grava os nomes j\u00e1 sem acento ("No lidas").
const WHATSAPP_SYSTEM_LIST_NAMES = new Set([
  'favoritos', 'grupos', 'comunidades', 'nao lidas', 'no lidas',
  'favorites', 'groups', 'communities', 'unread',
]);

function isWhatsappSystemList(name: string): boolean {
  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return WHATSAPP_SYSTEM_LIST_NAMES.has(normalized);
}

// A Evolution grava o nome da etiqueta sem nenhum caractere fora do ASCII
// imprimível (label.name.replace(/[^ -~]/g, '') no fonte da v2.3.6), então
// "Orçamento" volta como "Oramento" no findLabels. Só o evento labels.edit
// chega com o nome original. Comparar as duas versões pelo mesmo filtro impede
// que a mesma etiqueta vire duas tags na org.
function asciiLabelKey(name: string): string {
  return String(name || '').replace(/[^ -~]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function findTagByAsciiName(
  supabase: any,
  organizationId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const key = asciiLabelKey(name);
  if (!key) return null;
  const { data: tags } = await supabase
    .from('tags')
    .select('id, name')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
    .limit(1000);
  return (tags || []).find((tag: any) => asciiLabelKey(tag.name) === key) || null;
}

// Acha (case-insensitive) ou cria a tag da org correspondente \u00e0 etiqueta.
// A unique (organization_id, name) resolve corrida entre webhooks concorrentes.
async function ensureTagForLabel(supabase: any, organizationId: string, name: string, colorHex: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('tags')
    .select('id')
    .eq('organization_id', organizationId)
    .ilike('name', escapeLikePattern(name))
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  // A tag pode ter nascido pelo catálogo, que chega sem acento ("Oramento").
  // É a mesma etiqueta: reaproveita e devolve o nome original pra ela.
  const asciiMatch = await findTagByAsciiName(supabase, organizationId, name);
  if (asciiMatch?.id) {
    if (asciiMatch.name !== name && !/[^ -~]/.test(asciiMatch.name)) {
      const { error: renameError } = await supabase
        .from('tags')
        .update({ name })
        .eq('id', asciiMatch.id);
      if (renameError) console.error('[LABELS] rename tag failed:', renameError);
    }
    return asciiMatch.id;
  }

  const { data: inserted, error } = await supabase
    .from('tags')
    .upsert(
      { organization_id: organizationId, name, color: colorHex },
      { onConflict: 'organization_id,name' },
    )
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[LABELS] ensureTagForLabel failed:', error);
    const { data: retry } = await supabase
      .from('tags')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('name', escapeLikePattern(name))
      .limit(1)
      .maybeSingle();
    return retry?.id || null;
  }
  return inserted?.id || null;
}

async function upsertWhatsappLabelMapping(
  supabase: any,
  instance: any,
  label: { labelId: string; name: string; color: unknown },
): Promise<string | null> {
  const tagId = await ensureTagForLabel(
    supabase,
    instance.organization_id,
    label.name,
    whatsappLabelColorToHex(label.color),
  );
  const { error } = await supabase.from('whatsapp_labels').upsert({
    organization_id: instance.organization_id,
    whatsapp_instance_id: instance.id,
    label_id: label.labelId,
    name: label.name,
    color: label.color === null || label.color === undefined ? null : String(label.color),
    tag_id: tagId,
    deleted_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'whatsapp_instance_id,label_id' });
  if (error) console.error('[LABELS] whatsapp_labels upsert failed:', error);
  return tagId;
}

// Etiqueta chegou numa associa\u00e7\u00e3o sem termos o cat\u00e1logo dela (criada antes do
// webhook estar inscrito em LABELS_EDIT). Busca em /label/findLabels e mapeia.
async function hydrateLabelFromEvolution(supabase: any, instance: any, labelId: string): Promise<{ tag_id: string | null } | null> {
  try {
    const settings = await loadConnectionSettings(supabase);
    const baseUrl = settings.evolutionBaseUrl;
    const apiKey = instance.evolution_api_key || settings.evolutionApiKey || instance.zapi_token;
    const evoName = instance.evolution_instance_name || instance.zapi_instance_id;
    if (!baseUrl || !apiKey || !evoName) return null;

    const response = await fetch(`${baseUrl}/label/findLabels/${evoName}`, { headers: { apikey: apiKey } });
    if (!response.ok) {
      console.warn(`[LABELS] findLabels failed: ${response.status}`);
      return null;
    }
    const body = await response.json().catch(() => null);
    const list = Array.isArray(body) ? body : (Array.isArray(body?.labels) ? body.labels : []);
    // Resposta real da v2.3.6: [{ id: '5', name, color: '0', predefinedId }]
    // (o labelId do WhatsApp vem no campo `id`; `labelId` é fallback defensivo)
    const found = list.find((item: any) => String(item?.labelId ?? item?.id ?? '') === labelId);
    if (!found?.name) return null;
    if (isWhatsappSystemList(String(found.name))) return null;

    const tagId = await upsertWhatsappLabelMapping(supabase, instance, {
      labelId,
      name: String(found.name).trim(),
      color: found.color,
    });
    return { tag_id: tagId };
  } catch (error) {
    console.error('[LABELS] hydrateLabelFromEvolution failed:', error);
    return null;
  }
}

async function handleLabelEvent(supabase: any, payload: any, instanceId: string, instanceName: string, eventType: string) {
  const data = payload.data || payload;

  const orFilters = [
    instanceId ? `zapi_instance_id.eq.${instanceId}` : '',
    instanceName ? `zapi_instance_id.eq.${instanceName}` : '',
    instanceName ? `evolution_instance_name.eq.${instanceName}` : '',
    instanceId ? `evolution_instance_id.eq.${instanceId}` : '',
  ].filter(Boolean);
  if (!orFilters.length) return respond({ success: false, error: 'instance_not_identified' });

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('id, organization_id, provider, evolution_instance_name, evolution_api_key, zapi_instance_id, zapi_token')
    .or(orFilters.join(','))
    .maybeSingle();
  if (!instance) {
    console.warn(`[LABELS] Instance not found: ID=${instanceId}, Name=${instanceName}`);
    return respond({ success: false, error: 'instance_not_found' });
  }

  if (eventType.includes('association')) {
    return await handleLabelAssociation(supabase, instance, data);
  }
  return await handleLabelEdit(supabase, instance, data);
}

async function handleLabelEdit(supabase: any, instance: any, data: any) {
  const labelId = String(data.id ?? data.labelId ?? '').trim();
  if (!labelId) return respond({ success: true, ignored: true, reason: 'label_without_id' });

  if (data.deleted === true) {
    const { data: mapping } = await supabase
      .from('whatsapp_labels')
      .select('id, tag_id')
      .eq('whatsapp_instance_id', instance.id)
      .eq('label_id', labelId)
      .maybeSingle();
    if (mapping) {
      await supabase
        .from('whatsapp_labels')
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', mapping.id);
      // S\u00f3 derruba associa\u00e7\u00f5es que ESTA sync criou; tags manuais/flow/ai s\u00e3o
      // inten\u00e7\u00e3o do usu\u00e1rio no Wizzy e sobrevivem \u00e0 exclus\u00e3o da etiqueta.
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
    return respond({ success: true, labelId, deleted: true });
  }

  const name = String(data.name || '').trim();
  if (!name) return respond({ success: true, ignored: true, reason: 'label_without_name' });
  if (isWhatsappSystemList(name)) return respond({ success: true, ignored: true, reason: 'system_list' });

  const tagId = await upsertWhatsappLabelMapping(supabase, instance, { labelId, name, color: data.color });
  return respond({ success: true, labelId, tagId });
}

async function handleLabelAssociation(supabase: any, instance: any, data: any) {
  const action = String(data.type || '').toLowerCase();
  const chatId = String(data.chatId || data.chatid || '');
  const labelId = String(data.labelId || data.labelid || '').trim();
  if (!labelId || !chatId || !['add', 'remove'].includes(action)) {
    return respond({ success: true, ignored: true, reason: 'association_incomplete' });
  }
  // Etiquetas em grupos n\u00e3o t\u00eam contato correspondente no Wizzy.
  if (isGroupChat(chatId)) return respond({ success: true, ignored: true, reason: 'group_chat' });

  // chatId @lid não contém o telefone (endereçamento anônimo — a maioria dos
  // chats hoje). Duas formas de traduzir lid→contato, nesta ordem:
  //   1) o mapa que o próprio Wizzy monta: toda mensagem recebida grava o lid
  //      do chat em contacts.metadata.wa_lid, então quem já conversou com a
  //      empresa resolve aqui mesmo, na hora, sem nenhuma dependência externa;
  //   2) a tabela IsOnWhatsapp no Postgres da Evolution, que só a
  //      sync-whatsapp-labels alcança — delegamos a ela em background,
  //      escopada à instância (corrige em segundos, não no cron).
  let lidContactId: string | null = null;
  if (chatId.includes('@lid')) {
    const lid = chatId.split('@')[0].replace(/\D/g, '');
    const { data: byLid } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', instance.organization_id)
      .eq('metadata->>wa_lid', lid)
      .limit(1)
      .maybeSingle();
    lidContactId = byLid?.id || null;

    if (!lidContactId) {
      const baseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      runBackground(fetch(`${baseUrl}/functions/v1/sync-whatsapp-labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ instanceId: instance.id }),
      }));
      return respond({ success: true, deferred: true, reason: 'lid_chat_delegated_to_reconciliation' });
    }
  }

  let { data: mapping } = await supabase
    .from('whatsapp_labels')
    .select('id, tag_id')
    .eq('whatsapp_instance_id', instance.id)
    .eq('label_id', labelId)
    .maybeSingle();

  if (!mapping?.tag_id && action === 'add') {
    mapping = await hydrateLabelFromEvolution(supabase, instance, labelId) || mapping;
  }
  if (!mapping?.tag_id) {
    return respond({ success: true, ignored: true, reason: 'label_not_mapped', labelId });
  }

  let contact: { id: string } | null = lidContactId ? { id: lidContactId } : null;
  if (!contact) {
    const phone = cleanPhone(chatId);
    if (!phone) return respond({ success: true, ignored: true, reason: 'invalid_phone' });
    const variants = phoneVariants(phone);
    const { data: byPhone } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', instance.organization_id)
      .in('phone', variants.length ? variants : [phone])
      .limit(1)
      .maybeSingle();
    contact = byPhone || null;
  }
  if (!contact) {
    // Chat etiquetado que nunca conversou com o Wizzy \u2014 nada a sincronizar.
    return respond({ success: true, ignored: true, reason: 'contact_not_found' });
  }

  if (action === 'remove') {
    // Remo\u00e7\u00e3o no aparelho remove no Wizzy independente da origem: o estado do
    // WhatsApp \u00e9 a fonte de verdade para o par (contato, tag mapeada).
    await supabase
      .from('contact_tags')
      .delete()
      .eq('contact_id', contact.id)
      .eq('tag_id', mapping.tag_id);
    return respond({ success: true, action, contactId: contact.id, tagId: mapping.tag_id });
  }

  const { error } = await supabase.from('contact_tags').upsert({
    contact_id: contact.id,
    tag_id: mapping.tag_id,
    added_by: null,
    added_by_type: 'whatsapp',
  }, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true });
  if (error) console.error('[LABELS] contact_tags upsert failed:', error);
  return respond({ success: !error, action, contactId: contact.id, tagId: mapping.tag_id });
}
