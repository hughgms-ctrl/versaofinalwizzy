// Avaliador da expressão do nó "Cálculo" do construtor de fluxos.
//
// GÊMEO: supabase/functions/_shared/mathExpression.ts. O motor (flow-execute)
// usa a cópia de lá; esta aqui existe para a prévia da tela. Se um dos dois
// mudar, o outro muda junto — senão a prévia mente sobre o que vai acontecer
// com o lead.
//
// Nada de eval(): a expressão é escrita pelo dono do fluxo, mas os VALORES
// vêm do que o contato digitou. "1; fetch(...)" não pode virar código.

export type MathRoundMode = 'round' | 'floor' | 'ceil';
export type MathOutputFormat = 'plain' | 'br' | 'currency';

// O discriminante é uma string e não um `ok: boolean` de propósito: o tsconfig
// da aplicação roda com strict:false, e sem strictNullChecks o TypeScript não
// estreita união por literal booleano — o `.error` viraria erro de compilação
// dentro do próprio if que garante o erro.
export type MathEvalResult =
  | { status: 'ok'; value: number }
  | { status: 'error'; error: string };

export type MathSubstitutionResult =
  | { status: 'ok'; expression: string; used: Record<string, number> }
  | { status: 'error'; error: string };

// Expressão maior que isso é sempre erro de configuração (ou um texto inteiro
// colado no campo por acidente), e o parser não precisa apanhar por isso.
const MAX_EXPRESSION_LENGTH = 500;

// Aridade [mín, máx] de cada função aceita. round(x) e round(x, 2) são duas
// formas do mesmo nome, por isso o intervalo.
const FUNCTION_ARITY: Record<string, [number, number]> = {
  abs: [1, 1],
  round: [1, 2],
  floor: [1, 1],
  ceil: [1, 1],
  sqrt: [1, 1],
  pow: [2, 2],
  min: [1, 20],
  max: [1, 20],
};

export const MATH_FUNCTION_NAMES = Object.keys(FUNCTION_ARITY);

function callFunction(name: string, args: number[]): number {
  switch (name) {
    case 'abs': return Math.abs(args[0]);
    case 'round': {
      const places = args.length > 1 ? Math.trunc(args[1]) : 0;
      return roundTo(args[0], places, 'round');
    }
    case 'floor': return Math.floor(args[0]);
    case 'ceil': return Math.ceil(args[0]);
    case 'sqrt': {
      if (args[0] < 0) throw new Error('raiz quadrada de número negativo');
      return Math.sqrt(args[0]);
    }
    case 'pow': return Math.pow(args[0], args[1]);
    case 'min': return Math.min(...args);
    case 'max': return Math.max(...args);
    default: throw new Error(`função desconhecida "${name}"`);
  }
}

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ident'; value: string }
  | { kind: 'op'; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    const isDigit = ch >= '0' && ch <= '9';
    const isLeadingDot = ch === '.' && input[i + 1] >= '0' && input[i + 1] <= '9';
    if (isDigit || isLeadingDot) {
      let j = i;
      while (j < input.length && input[j] >= '0' && input[j] <= '9') j++;
      if (input[j] === '.') {
        j++;
        while (j < input.length && input[j] >= '0' && input[j] <= '9') j++;
      }
      tokens.push({ kind: 'num', value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[a-zA-Z_0-9]/.test(input[j])) j++;
      tokens.push({ kind: 'ident', value: input.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }

    if ('+-*/%^(),'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch });
      i++;
      continue;
    }

    // É aqui que cai o texto que sobrou de uma variável não numérica: em vez de
    // calcular errado, a expressão inteira é recusada.
    throw new Error(`caractere inválido "${ch}"`);
  }

  return tokens;
}

/**
 * Avalia uma expressão aritmética já com as variáveis trocadas por números.
 *
 * Gramática (descida recursiva):
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/' | '%') unary)*
 *   unary   := ('-' | '+') unary | power
 *   power   := primary ('^' unary)?          -- associativo à direita
 *   primary := número | '(' expr ')' | função '(' expr (',' expr)* ')'
 */
export function evaluateMathExpression(expression: string): MathEvalResult {
  const raw = String(expression ?? '').trim();
  if (!raw) return { status: 'error', error: 'expressão vazia' };
  if (raw.length > MAX_EXPRESSION_LENGTH) {
    return { status: 'error', error: `expressão longa demais (máximo ${MAX_EXPRESSION_LENGTH} caracteres)` };
  }

  try {
    const tokens = tokenize(raw);
    if (tokens.length === 0) return { status: 'error', error: 'expressão vazia' };

    let pos = 0;
    const peek = (): Token | undefined => tokens[pos];
    const isOp = (value: string) => {
      const token = peek();
      return !!token && token.kind === 'op' && token.value === value;
    };

    const parsePrimary = (): number => {
      const token = peek();
      if (!token) throw new Error('expressão incompleta');

      if (token.kind === 'num') { pos++; return token.value; }

      if (token.kind === 'ident') {
        const name = token.value;
        const arity = FUNCTION_ARITY[name];
        if (!arity) throw new Error(`nome desconhecido "${name}"`);
        pos++;
        if (!isOp('(')) throw new Error(`falta "(" depois de ${name}`);
        pos++;
        const args: number[] = [parseExpr()];
        while (isOp(',')) { pos++; args.push(parseExpr()); }
        if (!isOp(')')) throw new Error(`falta ")" em ${name}`);
        pos++;
        if (args.length < arity[0] || args.length > arity[1]) {
          throw new Error(`${name} recebeu ${args.length} argumento(s)`);
        }
        return callFunction(name, args);
      }

      if (token.value === '(') {
        pos++;
        const value = parseExpr();
        if (!isOp(')')) throw new Error('falta ")"');
        pos++;
        return value;
      }

      throw new Error(`operador "${token.value}" fora de lugar`);
    };

    const parsePower = (): number => {
      const base = parsePrimary();
      if (isOp('^')) {
        pos++;
        // Expoente por parseUnary: 2 ^ -1 e 2 ^ 3 ^ 2 (= 2^9) funcionam.
        return Math.pow(base, parseUnary());
      }
      return base;
    };

    const parseUnary = (): number => {
      if (isOp('-')) { pos++; return -parseUnary(); }
      if (isOp('+')) { pos++; return parseUnary(); }
      return parsePower();
    };

    const parseTerm = (): number => {
      let left = parseUnary();
      while (isOp('*') || isOp('/') || isOp('%')) {
        const op = (tokens[pos++] as { value: string }).value;
        const right = parseUnary();
        if ((op === '/' || op === '%') && right === 0) throw new Error('divisão por zero');
        if (op === '*') left = left * right;
        else if (op === '/') left = left / right;
        else left = left % right;
      }
      return left;
    };

    const parseExpr = (): number => {
      let left = parseTerm();
      while (isOp('+') || isOp('-')) {
        const op = (tokens[pos++] as { value: string }).value;
        const right = parseTerm();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    };

    const value = parseExpr();
    if (pos < tokens.length) {
      throw new Error(`sobrou "${tokens[pos].value}" no fim da expressão`);
    }
    if (!Number.isFinite(value)) throw new Error('o resultado não é um número válido');

    return { status: 'ok', value };
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Lê um número de um valor que veio do mundo real: resposta do contato, coluna
 * de planilha, retorno de webhook. Aceita "R$ 1.234,56", "1234.56", "45%".
 *
 * Separador: com os dois presentes, o ÚLTIMO manda (o outro é milhar). Sozinho
 * e repetido ("1.234.567") é milhar; sozinho e único é decimal — ou seja
 * "1.234" vale 1,234 e não mil duzentos e trinta e quatro, a mesma regra dos
 * números escritos direto na expressão.
 */
export function parseLooseNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  // \s do JS já cobre o espaço não separável que vem colado de planilha.
  const text = String(raw ?? '').replace(/\s/g, '');
  if (!text) return null;

  // Tolera rótulo curto na frente ("R$", "US$") e unidade curta atrás ("%",
  // "kg"). O limite de tamanho é o que separa "R$ 1.234,56" de "Rua 25 de
  // Março": frase com número dentro não é número, e virar 25 caladinho seria
  // pior do que recusar.
  const match = text.match(/^[^0-9+-]{0,4}([+-]?[0-9][0-9.,]*)[^0-9]{0,3}$/);
  if (!match) return null;

  const core = match[1];
  const sign = core[0] === '-' ? -1 : 1;
  let digits = core.replace(/^[+-]/, '');

  const lastComma = digits.lastIndexOf(',');
  const lastDot = digits.lastIndexOf('.');

  let decimalSep = '';
  if (lastComma >= 0 && lastDot >= 0) decimalSep = lastComma > lastDot ? ',' : '.';
  else if (lastComma >= 0) decimalSep = digits.indexOf(',') === lastComma ? ',' : '';
  else if (lastDot >= 0) decimalSep = digits.indexOf('.') === lastDot ? '.' : '';

  if (decimalSep) {
    const thousands = decimalSep === ',' ? '.' : ',';
    digits = digits.split(thousands).join('').replace(decimalSep, '.');
  } else {
    digits = digits.replace(/[.,]/g, '');
  }

  if (!/^[0-9]+(\.[0-9]+)?$/.test(digits)) return null;

  const value = Number(digits);
  return Number.isFinite(value) ? sign * value : null;
}

/** Arredonda em `places` casas, corrigindo antes o 1.005 do ponto flutuante. */
export function roundTo(value: number, places: number, mode: MathRoundMode): number {
  const safePlaces = Math.min(Math.max(Math.trunc(places), 0), 10);
  const factor = Math.pow(10, safePlaces);
  const scaled = Number((value * factor).toPrecision(12));
  const rounded = mode === 'floor' ? Math.floor(scaled) : mode === 'ceil' ? Math.ceil(scaled) : Math.round(scaled);
  return rounded / factor;
}

/** 1234.5 -> "1.234,50". Na mão, para dar o mesmo texto no Deno e no navegador. */
function toBrazilianDigits(fixed: string): string {
  const negative = fixed.startsWith('-');
  const [intPart, decPart] = fixed.replace('-', '').split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped}${decPart ? `,${decPart}` : ''}`;
}

/**
 * Número -> o texto que vai para dentro da variável do fluxo.
 * `decimals` negativo = automático (não arredonda, só não inventa zero).
 */
export function formatMathResult(
  value: number,
  decimals: number,
  roundMode: MathRoundMode,
  format: MathOutputFormat,
): string {
  const auto = decimals < 0;
  const places = auto ? 0 : Math.min(Math.max(Math.trunc(decimals), 0), 10);
  const fixed = auto
    ? String(Number(value.toPrecision(12)))
    : roundTo(value, places, roundMode).toFixed(places);

  if (format === 'plain') return fixed;
  const br = toBrazilianDigits(fixed);
  return format === 'currency' ? `R$ ${br}` : br;
}

/**
 * Troca cada {{variável}} da expressão pelo número correspondente, entre
 * parênteses (para -5 não virar "3--5"). É aqui que o valor do contato deixa
 * de ser texto: depois disso a expressão só tem número e operador.
 */
export function substituteNumericVariables(
  expression: string,
  resolve: (name: string) => unknown,
  missingAsZero: boolean,
): MathSubstitutionResult {
  const used: Record<string, number> = {};
  let failure = '';

  const replaced = String(expression ?? '').replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    if (failure) return '0';

    const raw = resolve(name);
    const isEmpty = raw === undefined || raw === null || String(raw).trim() === '';

    if (isEmpty) {
      if (missingAsZero) {
        used[name] = 0;
        return '(0)';
      }
      failure = `a variável {{${name}}} está vazia`;
      return '0';
    }

    const parsed = parseLooseNumber(raw);
    if (parsed === null) {
      failure = `a variável {{${name}}} não é um número (valor: "${String(raw).slice(0, 40)}")`;
      return '0';
    }

    used[name] = parsed;
    return `(${parsed})`;
  });

  if (failure) return { status: 'error', error: failure };
  return { status: 'ok', expression: replaced, used };
}
