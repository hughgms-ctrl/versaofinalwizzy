/**
 * Texto seguro para as fontes padrao do pdf-lib (Helvetica e familia).
 *
 * Essas fontes so codificam WinAnsi. Um unico caractere fora da tabela faz o
 * `drawText` levantar `WinAnsi cannot encode "..." (0x....)` -- e como o erro
 * sobe do meio da renderizacao, o PDF INTEIRO deixa de existir. Foi o que
 * aconteceu com um relatorio de 2.635 caracteres escrito por um no de IA: um
 * 0x7F invisivel no meio do texto e o organizador ficou sem relatorio.
 *
 * A decisao aqui e explicita: nenhum caractere nao codificavel pode falhar a
 * geracao. Um PDF com "?" no lugar de uma seta e entregue e util; um PDF que
 * nao existe nao e. Por isso este modulo NUNCA lanca -- ele substitui e avisa.
 *
 * Ordem do tratamento:
 *   1. Controle (C0 e C1, incluindo 0x7F) sai sem substituto. Sao invisiveis;
 *      virar "?" so espalharia sujeira visivel. "\n" sobrevive porque quem
 *      chama depende dele para quebrar linha, e "\t" vira espaco.
 *   2. Quem tem equivalente obvio e mapeado (seta -> "->", "✓" -> "v", ...).
 *   3. O resto que estiver fora de WinAnsi vira "?" -- visivel de proposito,
 *      para alguem perceber que faltou um mapeamento.
 *   4. O passo 3 e contado e sai no log. E assim que a lista do passo 2 cresce.
 *
 * A tabela de encodaveis foi levantada CONTRA o pdf-lib 1.17.1 (drawText de
 * cada code point, vendo qual lanca), nao deduzida da especificacao: acima de
 * 0xFF passam exatamente os 27 especiais do CP1252 -- e so eles.
 */

/** Os 27 code points acima de 0xFF que o WinAnsi do pdf-lib aceita. */
const WIN_ANSI_ESPECIAIS = new Set<number>([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/**
 * Substituicoes do passo 2.
 *
 * Entra aqui quem NAO e codificavel -- e tambem alguns codificaveis cuja versao
 * ASCII o texto ja usava antes (aspas curvas, travessao, reticencias): manter o
 * mapeamento evita mudar, de tabela, a aparencia de documento que ja existe.
 *
 * NAO entram "•" (U+2022) nem "°" (U+00B0): os dois sao WinAnsi de verdade, o
 * marcador de lista do PDF ja e desenhado com o bullet literal, e trocar por
 * "-" ou " graus" pioraria o que hoje sai certo.
 */
const MAPA: Record<string, string> = {
  // Espacos exoticos viram espaco comum -- inclusive o NBSP, que e codificavel
  // mas atrapalha a quebra de linha de quem mede palavra por palavra.
  " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
  " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
  " ": " ", " ": " ", "　": " ",

  // Largura zero: some sem deixar rastro, como os de controle.
  "​": "", "‌": "", "‍": "", "⁠": "", "﻿": "",

  // Tracos de todo tipo -- inclusive o hifen nao separavel e o sinal de menos,
  // que sao os que de fato quebram a geracao.
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-",
  "―": "-", "−": "-", "－": "-",

  // Aspas e afins.
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
  "ʼ": "'", "＇": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"',
  "＂": '"',
  "‹": "<", "›": ">",

  "…": "...", "‥": "..",

  // Marcadores que nao sao o bullet do WinAnsi.
  "‣": "-", "⁃": "-", "∙": "-", "▪": "-", "▫": "-",
  "▸": "-", "○": "-", "●": "-", "◦": "-", "❖": "-",

  // Setas.
  "←": "<-", "→": "->", "↔": "<->", "↑": "^", "↓": "v",
  "⇐": "<=", "⇒": "=>", "⇔": "<=>",
  "⟵": "<-", "⟶": "->", "⟷": "<->",
  "➔": "->", "➡": "->", "➜": "->", "➞": "->",

  // Certo e errado.
  "✓": "v", "✔": "v", "✅": "v",
  "✕": "x", "✖": "x", "✗": "x", "✘": "x", "❌": "x",

  // Caixas de marcacao de formulario.
  "☐": "[ ]", "☑": "[x]", "☒": "[x]",

  // Matematica de relatorio.
  "≤": "<=", "≥": ">=", "≠": "!=", "≈": "~",
  "∞": "inf", "⁄": "/", "∕": "/",

  // Graus: o simbolo comum ("°") fica como esta; estes tres e que nao passam.
  "℃": " graus C", "℉": " graus F", "˚": "°",

  // Abreviacoes tipograficas.
  "№": "No.", "℗": "(P)", "℠": "(SM)",
};

/**
 * Atalho: se o texto so tem ASCII imprimivel, Latin-1 alto e "\n", nada a
 * fazer. Vale porque `sanitizeWinAnsi` e chamado tambem na MEDICAO de largura,
 * token a token, e quase todo token ja esta limpo.
 */
const RE_SUSPEITO = /[^\n\x20-\x7e¡-ÿ]/;

function codificavel(cp: number): boolean {
  if (cp >= 0x20 && cp <= 0x7e) return true;
  // 0xA0 (NBSP) fica de fora de proposito: e tratado no MAPA.
  if (cp >= 0xa1 && cp <= 0xff) return true;
  return WIN_ANSI_ESPECIAIS.has(cp);
}

// Relatorio do passo 4. O estado e do modulo (e nao de um objeto passado de mao
// em mao) porque o ponto de sanitizacao e chamado de dezenas de lugares fundos
// na renderizacao. Duas requisicoes concorrentes no mesmo isolate somam os
// contadores -- para um log de diagnostico isso e aceitavel; para qualquer
// outra coisa nao seria.
const substituidos = new Map<number, number>();

/** Zera o relatorio. Chamar no inicio de cada requisicao. */
export function resetWinAnsiReport(): void {
  substituidos.clear();
}

/** Instantaneo do que foi substituido, na ordem em que apareceu. */
export function winAnsiReport(): { total: number; distintos: Array<{ char: string; codigo: string; vezes: number }> } {
  let total = 0;
  const distintos = [...substituidos.entries()].map(([cp, vezes]) => {
    total += vezes;
    return {
      char: String.fromCodePoint(cp),
      codigo: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
      vezes,
    };
  });
  return { total, distintos };
}

/**
 * Escreve no log o que caiu no passo 3, se caiu alguma coisa.
 *
 * So os primeiros distintos: a lista existe para alguem ler e ACRESCENTAR no
 * MAPA, nao para reproduzir o documento inteiro no log.
 */
export function logWinAnsiReport(contexto: string, limite = 8): void {
  const { total, distintos } = winAnsiReport();
  if (total === 0) return;
  const amostra = distintos
    .slice(0, limite)
    .map((d) => `${d.codigo} "${d.char}" x${d.vezes}`)
    .join(", ");
  const resto = distintos.length > limite ? ` (+${distintos.length - limite} outros)` : "";
  console.warn(
    `[winansi] ${contexto}: ${total} caractere(s) sem equivalente trocado(s) por "?" -- ${amostra}${resto}. ` +
      `Vale acrescentar os recorrentes ao MAPA de _shared/winAnsi.ts.`,
  );
}

/**
 * Devolve o texto com tudo que o WinAnsi nao codifica removido, mapeado ou
 * trocado por "?". Idempotente: rodar duas vezes da o mesmo resultado, o que
 * deixa medir e desenhar com a mesma string sem coordenacao entre os dois.
 */
export function sanitizeWinAnsi(text: string | null | undefined): string {
  if (text === null || text === undefined) return "";
  const str = String(text);
  if (!RE_SUSPEITO.test(str)) return str;

  let out = "";
  // Quebra de linha normalizada antes do laco: "\r\n" viraria "\n" mais um
  // caractere de controle solto.
  for (const ch of str.replace(/\r\n?/g, "\n")) {
    const cp = ch.codePointAt(0)!;

    // 1. Controle: fora, sem substituto.
    if (ch === "\n") { out += "\n"; continue; }
    if (ch === "\t") { out += " "; continue; }
    if (cp < 0x20 || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f)) continue;

    // 2. Equivalente conhecido.
    const mapeado = MAPA[ch];
    if (mapeado !== undefined) { out += mapeado; continue; }

    // 3. Passa direto se o WinAnsi da conta; senao, "?" visivel e contado.
    if (codificavel(cp)) { out += ch; continue; }
    out += "?";
    substituidos.set(cp, (substituidos.get(cp) ?? 0) + 1);
  }
  return out;
}

/** Alvo minimo de `drawSafeText` -- na pratica um PDFPage do pdf-lib. */
interface AlvoDeTexto {
  // deno-lint-ignore no-explicit-any
  drawText(text: string, options?: any): void;
}

/**
 * O UNICO caminho para escrever texto num PDF.
 *
 * Sanitizar na origem de cada texto tambem funcionaria -- ate alguem
 * acrescentar uma origem nova. Aqui a garantia e estrutural: se o texto foi
 * parar na pagina, passou por `sanitizeWinAnsi`.
 */
// deno-lint-ignore no-explicit-any
export function drawSafeText(alvo: AlvoDeTexto, text: string, options?: any): void {
  alvo.drawText(sanitizeWinAnsi(text), options);
}

/**
 * Largura do texto COMO ELE VAI SER DESENHADO. Medir o original e desenhar o
 * sanitizado desalinha a quebra de linha quando a substituicao muda o tamanho
 * ("→" vira duas letras, emoji vira uma).
 */
export function measureSafeText(
  font: { widthOfTextAtSize(text: string, size: number): number },
  text: string,
  size: number,
): number {
  return font.widthOfTextAtSize(sanitizeWinAnsi(text), size);
}
