/**
 * Saídas geradas pelos botões das mensagens de follow-up.
 *
 * A alça é derivada do RÓTULO, não do id do botão: as tentativas costumam repetir
 * os mesmos botões ("Sim" na 1ª, na 2ª e na 3ª), e todas precisam cair na mesma
 * saída. Como o id vem do rótulo, apagar uma tentativa não quebra a aresta — só
 * renomear o botão quebra, o que é justo, porque aí a resposta virou outra coisa.
 *
 * O mesmo cálculo existe em supabase/functions/zapi-webhook (followUpHandleId) e
 * as duas versões precisam andar juntas.
 */

export interface FollowUpOutput {
  handleId: string;
  label: string;
}

export function followUpHandleId(label: string): string {
  // Sem acento, minúsculo, o resto vira "_": "Não, obrigado" -> fu_nao_obrigado.
  // Escrito sem escapes de regex de propósito, para a cópia em Deno do webhook
  // ser byte a byte a mesma coisa.
  const decomposed = (label || '').trim().normalize('NFD');
  let slug = '';
  for (const char of decomposed) {
    const code = char.charCodeAt(0);
    if (code >= 0x300 && code <= 0x36f) continue; // acento solto da decomposição
    const lower = char.toLowerCase();
    slug += (lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9') ? lower : '_';
  }
  slug = slug.replace(/_+/g, '_').replace(/^_/, '').replace(/_$/, '');

  if (slug) return `fu_${slug}`;

  // Rótulo só com emoji/símbolo: cai num hash estável para não perder a saída.
  let hash = 5381;
  for (let i = 0; i < label.length; i++) {
    hash = ((hash << 5) + hash + label.charCodeAt(i)) >>> 0;
  }
  return `fu_h${hash.toString(36)}`;
}

export function getFollowUpOutputs(data: Record<string, unknown> | undefined): FollowUpOutput[] {
  const steps = (data?.remarketingSteps as Array<{ buttons?: Array<{ label?: string }> }>) || [];
  const byHandle = new Map<string, FollowUpOutput>();

  for (const step of steps) {
    for (const button of step?.buttons || []) {
      const label = (button?.label || '').trim();
      if (!label) continue;
      const handleId = followUpHandleId(label);
      if (!byHandle.has(handleId)) byHandle.set(handleId, { handleId, label });
    }
  }

  return Array.from(byHandle.values());
}
