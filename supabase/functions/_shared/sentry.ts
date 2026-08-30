// Envio de evento para o Sentry de dentro de uma edge function.
//
// O Sentry do projeto so cobre o navegador (`src/main.tsx` + `sentry-tunnel`).
// Nada do backend chega la: quando um cron para ou uma mensagem fica presa na
// fila de reprocesso, o unico rastro e o log da function — que ninguem olha as
// 3 da manha.
//
// Nao ha SDK de Deno aqui de proposito: o formato de envelope do Sentry e
// simples o bastante para montar a mao, e uma dependencia a mais no caminho de
// um job de saude e uma coisa a mais para quebrar.
//
// DSN e chave PUBLICA (a mesma ja versionada em sentry-tunnel/index.ts): serve
// para escrever evento, nao para ler nada.

const DEFAULT_DSN =
  'https://e182c0b36f3c05825b22c0b0c5743cab@o4511028911734784.ingest.us.sentry.io/4511028921761792';

const DSN = Deno.env.get('SENTRY_DSN') || DEFAULT_DSN;

const dsnMatch = DSN.match(
  /^https:\/\/([a-zA-Z0-9]+)@o(\d+)\.ingest\.([a-zA-Z0-9-]+)\.sentry\.io\/(\d+)$/,
);

const [, publicKey, orgId, region, projectId] = dsnMatch || [];
const envelopeUrl = dsnMatch
  ? `https://o${orgId}.ingest.${region}.sentry.io/api/${projectId}/envelope/`
  : '';

const SENTRY_TIMEOUT_MS = 5_000;

export type SentryLevel = 'fatal' | 'error' | 'warning' | 'info';

export interface SentryEvent {
  message: string;
  level?: SentryLevel;
  /** Vira filtro e agrupamento no Sentry. Ex.: { check: 'cron_parado' } */
  tags?: Record<string, string>;
  /** Contexto livre que aparece no evento. */
  extra?: Record<string, unknown>;
  /**
   * Como agrupar. Sem isto o Sentry agrupa pela mensagem — e uma mensagem com
   * numero dentro ("3 eventos presos") abriria uma issue nova a cada rodada.
   */
  fingerprint?: string[];
  /** Nome da function/job de origem. */
  serverName?: string;
}

/**
 * Manda um evento e devolve se conseguiu. NUNCA lanca: observabilidade quebrada
 * nao pode derrubar o trabalho que estava sendo observado.
 */
export async function captureToSentry(event: SentryEvent): Promise<boolean> {
  if (!envelopeUrl) {
    console.error('[SENTRY] DSN invalido; evento nao enviado:', event.message);
    return false;
  }

  const eventId = crypto.randomUUID().replace(/-/g, '');
  const sentAt = new Date().toISOString();

  const body = {
    event_id: eventId,
    timestamp: sentAt,
    platform: 'javascript',
    level: event.level || 'error',
    logger: 'edge-function',
    server_name: event.serverName || 'edge-function',
    environment: Deno.env.get('SENTRY_ENVIRONMENT') || 'production',
    message: { formatted: event.message },
    tags: { runtime: 'deno', ...(event.tags || {}) },
    extra: event.extra || {},
    ...(event.fingerprint ? { fingerprint: event.fingerprint } : {}),
  };

  const envelope =
    `${JSON.stringify({ event_id: eventId, sent_at: sentAt })}\n` +
    `${JSON.stringify({ type: 'event' })}\n` +
    `${JSON.stringify(body)}\n`;

  try {
    const response = await fetch(envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}`,
      },
      body: envelope,
      signal: AbortSignal.timeout(SENTRY_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[SENTRY] Recusou o evento (${response.status}):`, await response.text().catch(() => ''));
      return false;
    }

    return true;
  } catch (error) {
    console.error('[SENTRY] Falha ao enviar evento:', error instanceof Error ? error.message : String(error));
    return false;
  }
}
