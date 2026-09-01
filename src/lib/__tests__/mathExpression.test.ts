import { describe, it, expect } from 'vitest';
import {
  evaluateMathExpression,
  formatMathResult,
  parseLooseNumber,
  substituteNumericVariables,
} from '@/lib/mathExpression';

// Este arquivo cobre a cópia de src/lib. O gêmeo em
// supabase/functions/_shared/mathExpression.ts é byte a byte o mesmo corpo —
// se um mudar sem o outro, a prévia da tela passa a mentir sobre a execução.

const value = (expression: string) => {
  const result = evaluateMathExpression(expression);
  if (result.status === 'error') throw new Error(`esperava sucesso, veio: ${result.error}`);
  return result.value;
};

const error = (expression: string) => {
  const result = evaluateMathExpression(expression);
  if (result.status === 'ok') throw new Error(`esperava erro, veio: ${result.value}`);
  return result.error;
};

describe('evaluateMathExpression', () => {
  it('respeita a precedência e os parênteses', () => {
    expect(value('2 + 3 * 4')).toBe(14);
    expect(value('(2 + 3) * 4')).toBe(20);
    expect(value('10 - 4 - 3')).toBe(3);
    expect(value('100 / 5 / 2')).toBe(10);
  });

  it('entende sinal unário e potência à direita', () => {
    expect(value('-5 + 8')).toBe(3);
    expect(value('3 - -2')).toBe(5);
    expect(value('2 ^ 3 ^ 2')).toBe(512);
    expect(value('2 ^ -1')).toBe(0.5);
  });

  it('tem as funções da barra de ajuda', () => {
    expect(value('round(2.567, 2)')).toBe(2.57);
    expect(value('floor(2.9)')).toBe(2);
    expect(value('ceil(2.1)')).toBe(3);
    expect(value('abs(0 - 7)')).toBe(7);
    expect(value('sqrt(81)')).toBe(9);
    expect(value('pow(2, 10)')).toBe(1024);
    expect(value('min(4, 2, 9)')).toBe(2);
    expect(value('max(4, 2, 9)')).toBe(9);
  });

  it('recusa divisão por zero em vez de devolver infinito', () => {
    expect(error('10 / 0')).toContain('divisão por zero');
    expect(error('10 % 0')).toContain('divisão por zero');
  });

  it('recusa qualquer coisa que não seja aritmética', () => {
    // O ponto do parser próprio: nada disso pode virar código.
    expect(error('1; fetch("http://x")')).toBeTruthy();
    expect(error('Deno.exit()')).toBeTruthy();
    expect(error('pi * 2')).toContain('nome desconhecido');
    expect(error('2 +')).toBeTruthy();
    expect(error('(2 + 3')).toContain('falta ")"');
    expect(error('2 3')).toContain('sobrou');
    expect(error('')).toContain('vazia');
  });
});

describe('parseLooseNumber', () => {
  it('lê o que o contato realmente digita', () => {
    expect(parseLooseNumber('1234.56')).toBe(1234.56);
    expect(parseLooseNumber('R$ 1.234,56')).toBe(1234.56);
    expect(parseLooseNumber('1,5')).toBe(1.5);
    expect(parseLooseNumber('45%')).toBe(45);
    expect(parseLooseNumber('-20')).toBe(-20);
    expect(parseLooseNumber(7)).toBe(7);
  });

  it('trata separador repetido como milhar', () => {
    expect(parseLooseNumber('1.234.567')).toBe(1234567);
    expect(parseLooseNumber('1,234,567')).toBe(1234567);
    expect(parseLooseNumber('1,234,567.89')).toBe(1234567.89);
  });

  it('devolve null para o que não é número', () => {
    expect(parseLooseNumber('João')).toBeNull();
    expect(parseLooseNumber('')).toBeNull();
    expect(parseLooseNumber(null)).toBeNull();
    expect(parseLooseNumber('Rua 25 de Março')).toBeNull();
  });
});

describe('substituteNumericVariables', () => {
  const vars: Record<string, unknown> = { preco: 'R$ 100,50', quantidade: '3', nome: 'João' };
  const resolve = (name: string) => vars[name];

  it('troca a variável por número entre parênteses', () => {
    const result = substituteNumericVariables('{{preco}} * {{quantidade}}', resolve, true);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.expression).toBe('(100.5) * (3)');
    expect(value(result.expression)).toBe(301.5);
  });

  it('mantém o sinal do número negativo isolado', () => {
    const result = substituteNumericVariables('10 - {{desconto}}', () => '-5', true);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(value(result.expression)).toBe(15);
  });

  it('recusa variável de texto com o nome dela no erro', () => {
    const result = substituteNumericVariables('{{nome}} + 1', resolve, true);
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.error).toContain('{{nome}}');
  });

  it('conta variável vazia como zero só quando pedido', () => {
    const zero = substituteNumericVariables('{{faltando}} + 1', () => '', true);
    expect(zero.status).toBe('ok');
    if (zero.status === 'ok') expect(value(zero.expression)).toBe(1);

    const strict = substituteNumericVariables('{{faltando}} + 1', () => '', false);
    expect(strict.status).toBe('error');
    if (strict.status === 'error') expect(strict.error).toContain('{{faltando}}');
  });
});

describe('formatMathResult', () => {
  it('formata nos três modos', () => {
    expect(formatMathResult(1234.5, 2, 'round', 'plain')).toBe('1234.50');
    expect(formatMathResult(1234.5, 2, 'round', 'br')).toBe('1.234,50');
    expect(formatMathResult(1234.5, 2, 'round', 'currency')).toBe('R$ 1.234,50');
    expect(formatMathResult(-1234.5, 2, 'round', 'currency')).toBe('R$ -1.234,50');
  });

  it('honra o modo de arredondamento', () => {
    expect(formatMathResult(2.555, 2, 'round', 'plain')).toBe('2.56');
    expect(formatMathResult(2.555, 2, 'floor', 'plain')).toBe('2.55');
    expect(formatMathResult(2.551, 2, 'ceil', 'plain')).toBe('2.56');
    expect(formatMathResult(2.5, 0, 'round', 'plain')).toBe('3');
  });

  it('no automático não inventa nem corta casa', () => {
    expect(formatMathResult(2.5, -1, 'round', 'plain')).toBe('2.5');
    expect(formatMathResult(10, -1, 'round', 'plain')).toBe('10');
  });

  it('o _num do nó volta a ser lido como número', () => {
    // O {{total_num}} existe para a Condição, que faz Number(a) > Number(b).
    const formatted = formatMathResult(1234.5, 2, 'round', 'currency');
    const numeric = formatMathResult(1234.5, 2, 'round', 'plain');
    expect(Number.isNaN(Number(formatted))).toBe(true);
    expect(Number(numeric)).toBe(1234.5);
  });
});
