import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BEHAVIOR_STYLE_OPTIONS,
  RESPONSE_LENGTH_OPTIONS,
  TONE_STYLE_OPTIONS,
  EMOJI_USAGE_OPTIONS,
} from '@/lib/agentPersonality';

export interface AgentPersonalityValue {
  behaviorStyle: string;
  responseLength: string;
  toneStyle: string;
  emojiUsage: string;
}

export const EMPTY_PERSONALITY: AgentPersonalityValue = {
  behaviorStyle: 'informal',
  responseLength: 'moderado',
  toneStyle: 'neutro',
  emojiUsage: 'moderado',
};

// 4 campos fixos de personalidade (sem texto livre -- ver conversa com o
// usuário) reaproveitados em todo lugar que cria/edita um agente base: criar
// agente simples, editor completo do agente, criação inline dentro de uma
// etapa de orquestração, e o modal rápido de edição.
export function AgentPersonalityFields({ value, onChange }: {
  value: AgentPersonalityValue;
  onChange: (patch: Partial<AgentPersonalityValue>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Comportamento</Label>
        <Select value={value.behaviorStyle} onValueChange={(v) => onChange({ behaviorStyle: v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {BEHAVIOR_STYLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Tom</Label>
        <Select value={value.toneStyle} onValueChange={(v) => onChange({ toneStyle: v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TONE_STYLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Tamanho das respostas</Label>
        <Select value={value.responseLength} onValueChange={(v) => onChange({ responseLength: v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RESPONSE_LENGTH_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Emojis</Label>
        <Select value={value.emojiUsage} onValueChange={(v) => onChange({ emojiUsage: v })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EMOJI_USAGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
