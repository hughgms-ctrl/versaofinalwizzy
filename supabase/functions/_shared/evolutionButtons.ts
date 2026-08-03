/**
 * Botões de resposta rápida nativos da Evolution API (/message/sendButtons).
 *
 * A Evolution monta o corpo da mensagem como `*title*` + `\n\n` + `description`,
 * então o título é a primeira linha em negrito — não um cabeçalho separado. Se
 * `title` não for enviado, o texto sai literalmente como "*undefined*".
 *
 * Só botões do tipo `reply` são usados aqui, e o WhatsApp aceita no máximo 3
 * (acima disso a própria Evolution devolve 400).
 *
 * A escolha do contato volta no webhook como `interactiveResponseMessage` com
 * `nativeFlowResponseMessage.paramsJson` = `{"display_text":"...","id":"..."}`.
 */

export const MAX_EVOLUTION_REPLY_BUTTONS = 3;

export interface EvolutionTarget {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
}

export interface QuickReplyButton {
  id?: string;
  label: string;
}

/**
 * Separa o texto do nó no par título/corpo que a Evolution exige.
 * Sem título explícito, a primeira linha vira o título (fica em negrito) e o
 * resto vira o corpo; texto de uma linha só vira o título inteiro.
 */
export function splitButtonsText(
  text: string,
  explicitTitle?: string | null,
): { title: string; description?: string } {
  const body = String(text || '').trim();
  const title = String(explicitTitle || '').trim();
  if (title) return { title, description: body || undefined };

  const breakAt = body.indexOf('\n');
  if (breakAt > 0) {
    const head = body.slice(0, breakAt).trim();
    const rest = body.slice(breakAt + 1).trim();
    if (head) return { title: head, description: rest || undefined };
  }

  return { title: body || 'Escolha uma opção' };
}

export function evolutionTargetFrom(
  baseUrl?: string | null,
  apiKey?: string | null,
  instanceName?: string | null,
): EvolutionTarget | null {
  if (!baseUrl || !apiKey || !instanceName) return null;
  return { baseUrl, apiKey, instanceName };
}

export async function sendEvolutionReplyButtons(
  target: EvolutionTarget,
  params: {
    phone: string;
    text: string;
    title?: string | null;
    footer?: string | null;
    buttons: QuickReplyButton[];
    delayMs?: number;
  },
): Promise<Response> {
  const { title, description } = splitButtonsText(params.text, params.title);

  const buttons = params.buttons
    .filter((b) => String(b?.label || '').trim())
    .slice(0, MAX_EVOLUTION_REPLY_BUTTONS)
    .map((b, index) => ({
      type: 'reply',
      displayText: String(b.label).trim(),
      // A Evolution rejeita id vazio, e é esse id que volta no paramsJson da resposta.
      id: String(b.id || '').trim() || `btn_${index}`,
    }));

  const body: Record<string, unknown> = {
    number: params.phone.replace(/\D/g, ''),
    title,
    buttons,
    delay: params.delayMs ?? 1000,
  };
  if (description) body.description = description;
  const footer = String(params.footer || '').trim();
  if (footer) body.footer = footer;

  return await fetch(`${target.baseUrl}/message/sendButtons/${target.instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: target.apiKey },
    body: JSON.stringify(body),
  });
}

/**
 * A Evolution responde 200/201 com o payload da mensagem em caso de sucesso e,
 * em algumas falhas, 200 com `error` no corpo — por isso os dois cheques.
 */
export async function evolutionButtonsAccepted(response: Response): Promise<{ ok: boolean; detail: string }> {
  if (!response.ok) {
    return { ok: false, detail: `HTTP ${response.status}: ${await response.text().catch(() => '')}` };
  }
  const result = await response.clone().json().catch(() => ({} as Record<string, unknown>));
  if (result && typeof result === 'object' && (result as Record<string, unknown>).error) {
    return { ok: false, detail: JSON.stringify(result) };
  }
  return { ok: true, detail: '' };
}
