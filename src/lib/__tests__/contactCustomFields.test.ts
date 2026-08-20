import { describe, it, expect } from 'vitest';
import {
  readContactCustomFields,
  formatCustomFieldValue,
  resolveContactCustomFields,
} from '../contactCustomFields';
import type { ContactCustomField } from '@/hooks/useContactCustomFields';

function def(key: string, label: string, type: ContactCustomField['type'] = 'text'): ContactCustomField {
  return {
    id: key,
    organization_id: 'org',
    key,
    label,
    type,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  };
}

describe('readContactCustomFields', () => {
  it('lê o objeto normal', () => {
    expect(readContactCustomFields({ custom_fields: { gargalo: 'trafego' } })).toEqual({ gargalo: 'trafego' });
  });

  it('lê metadata gravado como string JSON', () => {
    const metadata = JSON.stringify({ custom_fields: { gargalo: 'trafego' } });
    expect(readContactCustomFields(metadata)).toEqual({ gargalo: 'trafego' });
  });

  it('não quebra com metadata nulo, string inválida ou custom_fields de outro tipo', () => {
    expect(readContactCustomFields(null)).toEqual({});
    expect(readContactCustomFields('nao e json')).toEqual({});
    expect(readContactCustomFields({ custom_fields: 'texto' })).toEqual({});
    expect(readContactCustomFields({ custom_fields: ['a'] })).toEqual({});
  });
});

describe('formatCustomFieldValue', () => {
  it('formata booleano vindo como texto ou como boolean', () => {
    expect(formatCustomFieldValue(true)).toBe('Sim');
    expect(formatCustomFieldValue('false', 'boolean')).toBe('Não');
    expect(formatCustomFieldValue('sim', 'boolean')).toBe('Sim');
  });

  it('formata data ISO sem deslocar o dia pelo fuso', () => {
    expect(formatCustomFieldValue('2026-08-19', 'date')).toBe('19/08/2026');
    expect(formatCustomFieldValue('2026-08-19T23:30:00Z', 'date')).toBe('19/08/2026');
  });

  it('devolve como veio o que não casa com o tipo', () => {
    expect(formatCustomFieldValue('semana que vem', 'date')).toBe('semana que vem');
    expect(formatCustomFieldValue('talvez', 'boolean')).toBe('talvez');
  });

  it('trata vazio e nulo como sem valor', () => {
    expect(formatCustomFieldValue(null)).toBe('');
    expect(formatCustomFieldValue(undefined)).toBe('');
    expect(formatCustomFieldValue('   ')).toBe('');
  });
});

describe('resolveContactCustomFields', () => {
  const definitions = [def('gargalo', 'Gargalo'), def('nivel', 'Nível de consciência')];

  it('usa o label da definição e ignora campo sem valor', () => {
    const metadata = { custom_fields: { gargalo: 'trafego', nivel: '' } };
    expect(resolveContactCustomFields(metadata, definitions)).toEqual([
      { key: 'gargalo', label: 'Gargalo', value: 'trafego', orphan: false },
    ]);
  });

  it('mostra valor cuja definição foi apagada, rotulado pela chave', () => {
    const metadata = { custom_fields: { gargalo: 'trafego', objecao_antiga: 'preço' } };
    const resolved = resolveContactCustomFields(metadata, definitions);
    expect(resolved).toHaveLength(2);
    expect(resolved[1]).toEqual({
      key: 'objecao_antiga',
      label: 'objecao_antiga',
      value: 'preço',
      orphan: true,
    });
  });

  it('segue a ordem das definições, não a do metadata', () => {
    const metadata = { custom_fields: { nivel: 'consciente', gargalo: 'trafego' } };
    expect(resolveContactCustomFields(metadata, definitions).map(f => f.key)).toEqual(['gargalo', 'nivel']);
  });

  it('devolve vazio quando o contato não tem campo nenhum', () => {
    expect(resolveContactCustomFields({ note: 'oi' }, definitions)).toEqual([]);
  });
});
