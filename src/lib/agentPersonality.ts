// Campos estruturados de personalidade do agente base -- ver conversa com o
// usuário: em vez de descrever tom/personalidade em texto livre no prompt,
// vira uma seleção fixa de opções. Só os rótulos pra UI moram aqui; a frase
// de verdade que entra no prompt é gerada no backend
// (supabase/functions/_shared/agentPersonality.ts), que é quem realmente
// governa o comportamento -- este arquivo nunca é lido em runtime de conversa.

export type BehaviorStyle = 'formal' | 'informal';
export type ResponseLength = 'curto' | 'moderado' | 'explicativo';
export type ToneStyle = 'neutro' | 'caloroso';
export type EmojiUsage = 'nunca' | 'moderado' | 'frequente';

export const BEHAVIOR_STYLE_OPTIONS: { value: BehaviorStyle; label: string }[] = [
  { value: 'formal', label: 'Formal' },
  { value: 'informal', label: 'Informal' },
];

export const RESPONSE_LENGTH_OPTIONS: { value: ResponseLength; label: string }[] = [
  { value: 'curto', label: 'Curtas e diretas' },
  { value: 'moderado', label: 'Moderado' },
  { value: 'explicativo', label: 'Mais explicativas' },
];

export const TONE_STYLE_OPTIONS: { value: ToneStyle; label: string }[] = [
  { value: 'neutro', label: 'Neutro / profissional' },
  { value: 'caloroso', label: 'Caloroso / empático' },
];

export const EMOJI_USAGE_OPTIONS: { value: EmojiUsage; label: string }[] = [
  { value: 'nunca', label: 'Nunca' },
  { value: 'moderado', label: 'Moderado' },
  { value: 'frequente', label: 'Frequente' },
];
