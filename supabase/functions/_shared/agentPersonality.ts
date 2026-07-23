// Gera o bloco de personalidade que entra no prompt real a partir dos campos
// estruturados do agente (behavior_style, response_length, tone_style,
// emoji_usage) -- ver conversa com o usuário: "tem que gerir de fato o
// comportamento", não só ficar decorativo. Este é o ÚNICO lugar que traduz
// seleção -> frase; qualquer ajuste de texto muda aqui e vale pra toda
// conversa nova, sem precisar reaplicar em cada agente.
//
// Sem seleção em nenhum campo (agentes criados antes desta feature) -> string
// vazia, sem efeito nenhum no prompt (comportamento igual ao que já era).

const BEHAVIOR_PHRASES: Record<string, string> = {
  formal: 'Use uma linguagem formal e respeitosa.',
  informal: 'Use uma linguagem informal e descontraída, como numa conversa natural de WhatsApp.',
};

const RESPONSE_LENGTH_PHRASES: Record<string, string> = {
  curto: 'Mantenha as respostas curtas e diretas, sem rodeios.',
  moderado: 'Use respostas de tamanho moderado -- nem curtas demais, nem muito longas.',
  explicativo: 'Pode elaborar mais as respostas quando isso ajudar a explicar melhor.',
};

const TONE_PHRASES: Record<string, string> = {
  neutro: 'Mantenha um tom neutro e profissional.',
  caloroso: 'Seja caloroso e demonstre empatia genuína com a pessoa.',
};

const EMOJI_PHRASES: Record<string, string> = {
  nunca: 'Não use emojis.',
  moderado: 'Use emojis com moderação, no máximo um por mensagem.',
  frequente: 'Sinta-se à vontade para usar emojis com frequência.',
};

export function buildPersonalityBlock(agent: {
  behavior_style?: string | null;
  response_length?: string | null;
  tone_style?: string | null;
  emoji_usage?: string | null;
} | null | undefined): string {
  if (!agent) return '';
  const lines = [
    agent.behavior_style ? BEHAVIOR_PHRASES[agent.behavior_style] : null,
    agent.tone_style ? TONE_PHRASES[agent.tone_style] : null,
    agent.response_length ? RESPONSE_LENGTH_PHRASES[agent.response_length] : null,
    agent.emoji_usage ? EMOJI_PHRASES[agent.emoji_usage] : null,
  ].filter(Boolean);
  if (lines.length === 0) return '';
  return `PERSONALIDADE:\n${lines.join('\n')}`;
}
