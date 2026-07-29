import { describe, it, expect } from 'vitest';
import { followUpHandleId, getFollowUpOutputs } from '../followUpHandles';

// Este cálculo é duplicado em supabase/functions/zapi-webhook/index.ts. Se um dos
// dois mudar, a aresta desenhada no editor deixa de ser encontrada no roteamento —
// por isso os casos abaixo travam o formato do id, não só o comportamento.
describe('followUpHandleId', () => {
  it('normaliza acento, caixa e pontuação', () => {
    expect(followUpHandleId('Sim')).toBe('fu_sim');
    expect(followUpHandleId('Não')).toBe('fu_nao');
    expect(followUpHandleId('Não, obrigado')).toBe('fu_nao_obrigado');
    expect(followUpHandleId('Quero saber MAIS!')).toBe('fu_quero_saber_mais');
    expect(followUpHandleId('Opção 2')).toBe('fu_opcao_2');
  });

  it('ignora espaço nas pontas, para o rótulo digitado com sobra casar', () => {
    expect(followUpHandleId('  Depois  ')).toBe(followUpHandleId('Depois'));
  });

  it('cai num hash estável quando não sobra nada do rótulo', () => {
    const emojiOnly = followUpHandleId('👍');
    expect(emojiOnly).toMatch(/^fu_h[a-z0-9]+$/);
    expect(followUpHandleId('👍')).toBe(emojiOnly);
    expect(followUpHandleId('🔥')).not.toBe(emojiOnly);
  });
});

describe('getFollowUpOutputs', () => {
  const stepsWith = (buttons: Array<Array<string>>) => ({
    remarketingSteps: buttons.map((labels, i) => ({
      id: `s${i}`,
      delayMinutes: 10,
      message: '',
      buttons: labels.map((label, j) => ({ id: `b${i}${j}`, label })),
    })),
  });

  it('deduplica o mesmo rótulo repetido entre tentativas', () => {
    const outputs = getFollowUpOutputs(stepsWith([['Sim', 'Não'], ['Sim', 'Não']]));
    expect(outputs.map((o) => o.handleId)).toEqual(['fu_sim', 'fu_nao']);
  });

  it('mantém o rótulo da primeira ocorrência e ignora botão vazio', () => {
    const outputs = getFollowUpOutputs(stepsWith([['Sim', '   '], ['SIM']]));
    expect(outputs).toEqual([{ handleId: 'fu_sim', label: 'Sim' }]);
  });

  it('não gera saída quando não há follow-up ou botões', () => {
    expect(getFollowUpOutputs(undefined)).toEqual([]);
    expect(getFollowUpOutputs({})).toEqual([]);
    expect(getFollowUpOutputs(stepsWith([[]]))).toEqual([]);
  });
});
