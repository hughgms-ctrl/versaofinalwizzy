import { describe, it, expect } from 'vitest';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  findCountryByDialPrefix,
  findCountryByIso,
  toE164,
  validateNationalNumber,
} from '../countries';

const br = findCountryByIso('br')!;
const us = findCountryByIso('us')!;
const pt = findCountryByIso('pt')!;
const pe = findCountryByIso('pe')!;

describe('countries', () => {
  it('tem Brasil como padrão e uma lista sem código de discagem vazio', () => {
    expect(DEFAULT_COUNTRY.iso2).toBe('br');
    expect(COUNTRIES.length).toBeGreaterThan(100);
    expect(COUNTRIES.every((c) => /^\d+$/.test(c.dialCode))).toBe(true);
    expect(COUNTRIES.every((c) => /^[a-z]{2}$/.test(c.iso2))).toBe(true);
  });

  it('não repete país na lista', () => {
    const isos = COUNTRIES.map((c) => c.iso2);
    expect(new Set(isos).size).toBe(isos.length);
  });
});

describe('toE164', () => {
  it('monta o número com o código do país escolhido', () => {
    expect(toE164(br, '11999999999')).toBe('5511999999999');
    expect(toE164(us, '(415) 555-0100')).toBe('14155550100');
    expect(toE164(pt, '912 345 678')).toBe('351912345678');
  });

  it('descarta o zero de tronco, que não existe em E.164', () => {
    expect(toE164(findCountryByIso('gb')!, '07911123456')).toBe('447911123456');
  });

  it('não confunde DDD 55 com código de país repetido', () => {
    // 55 é o DDD de Santa Maria (RS): o número nacional fica inteiro.
    expect(toE164(br, '5599999999')).toBe('555599999999');
  });

  it('devolve vazio quando não há dígito', () => {
    expect(toE164(br, '')).toBe('');
    expect(toE164(br, '()-')).toBe('');
  });
});

describe('findCountryByDialPrefix', () => {
  it('resolve o empate de +1 a favor dos Estados Unidos', () => {
    expect(findCountryByDialPrefix('14155550100')?.iso2).toBe('us');
  });

  it('prefere o prefixo mais longo', () => {
    // 351 (Portugal) ganha de 35 (que não existe) e de 3 (idem).
    expect(findCountryByDialPrefix('351912345678')?.iso2).toBe('pt');
    // 55 (Brasil) e não 5 solto.
    expect(findCountryByDialPrefix('5511999999999')?.iso2).toBe('br');
  });

  it('devolve undefined para lixo', () => {
    expect(findCountryByDialPrefix('')).toBeUndefined();
    expect(findCountryByDialPrefix('abc')).toBeUndefined();
  });
});

describe('validateNationalNumber', () => {
  it('aceita celular e fixo brasileiro com DDD válido', () => {
    expect(validateNationalNumber(br, '11999999999')).toBeNull();
    expect(validateNationalNumber(br, '1133334444')).toBeNull();
  });

  it('recusa DDD inexistente e tamanho errado no Brasil', () => {
    expect(validateNationalNumber(br, '10999999999')).toMatch(/DDD/);
    expect(validateNationalNumber(br, '999999999')).toMatch(/DDD \+ 8 ou 9/);
  });

  it('aceita número estrangeiro que o cadastro antigo recusava', () => {
    expect(validateNationalNumber(us, '4155550100')).toBeNull();
    expect(validateNationalNumber(pt, '912345678')).toBeNull();
    expect(validateNationalNumber(pe, '987654321')).toBeNull();
    // País sem regra de tamanho declarada: passa pelo piso do E.164.
    expect(validateNationalNumber(findCountryByIso('ar')!, '91112345678')).toBeNull();
  });

  it('cobra o campo vazio e o teto de 15 dígitos do E.164', () => {
    expect(validateNationalNumber(br, '')).toMatch(/Digite/);
    expect(validateNationalNumber(us, '12345678901234567')).toMatch(/longo demais/);
  });

  it('explica o tamanho esperado quando o país tem regra declarada', () => {
    expect(validateNationalNumber(us, '415555')).toMatch(/10 dígitos/);
  });
});

describe('número estrangeiro digitado sem o + com o Brasil selecionado', () => {
  it('recusa 11 dígitos sem o 9 depois do DDD e aponta o país provável', () => {
    // O caso real: +1 469 988 0705 (EUA) digitado como 14699880705 com a
    // bandeira do Brasil. Antes virava 5514699880705 e o WhatsApp recusava.
    const motivo = validateNationalNumber(br, '14699880705');
    expect(motivo).toMatch(/9 depois do DDD/);
    expect(motivo).toMatch(/Estados Unidos/);
    expect(toE164(us, '4699880705')).toBe('14699880705');
  });

  it('não atrapalha celular e fixo brasileiros de verdade', () => {
    expect(validateNationalNumber(br, '14999880705')).toBeNull();
    expect(validateNationalNumber(br, '1433334444')).toBeNull();
  });
});
