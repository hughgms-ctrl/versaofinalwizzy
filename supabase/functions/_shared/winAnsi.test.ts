// deno test --allow-net supabase/functions/_shared/winAnsi.test.ts
//
// O caso que originou o modulo: um relatorio escrito por um no de IA, com 2.635
// caracteres, trazia um 0x7F invisivel. O pdf-lib recusou, o erro subiu do meio
// da renderizacao e o PDF inteiro deixou de existir. O teste central aqui e o
// ultimo: TODO caractere que sai do sanitizador tem que ser desenhavel.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import {
  drawSafeText,
  logWinAnsiReport,
  resetWinAnsiReport,
  sanitizeWinAnsi,
  winAnsiReport,
} from "./winAnsi.ts";

/**
 * A string do incidente: controle invisivel (0x7F), emoji, seta, bullet, aspas
 * curvas e um espaco de largura zero -- tudo junto, como vem de um modelo.
 */
const TEXTO_RUIM =
  "Relatorio do evento → 245 inscritos\n" +
  "• Presenca ≥ 80% ✅\n" +
  "“Superou a expectativa”, disse o organizador… \u{1F600}\u{1F4CA}\n" +
  "Temperatura media: 27°C — sensacao ‘abafada’\n" +
  "Faixa etaria ≤ 25 anos: 38%​";

async function paginaDeTeste() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  return { doc, font, page: doc.addPage([595.28, 841.89]) };
}

Deno.test("gera o PDF do texto que derrubava a geracao, e registra o que trocou", async () => {
  resetWinAnsiReport();
  const { doc, font, page } = await paginaDeTeste();

  // Um relatorio de verdade tem alguns milhares de caracteres; o texto ruim
  // repetido chega perto disso e ainda cobre o caso "um byte no meio de muito".
  const relatorio = TEXTO_RUIM.repeat(16);
  assert(relatorio.length > 2500, "o teste precisa ter o tamanho do caso real");
  assert(relatorio.includes(""), "o caractere do incidente tem que estar la");

  let y = 800;
  for (const linha of relatorio.split("\n")) {
    drawSafeText(page, linha, { x: 40, y, size: 9, font });
    y -= 12;
  }
  const bytes = await doc.save();

  // 1) O PDF existe. Era exatamente isso que o 0x7F impedia.
  assert(bytes.length > 0);
  assertEquals(
    new TextDecoder().decode(bytes.slice(0, 5)),
    "%PDF-",
    "a saida tem que ser um PDF de verdade",
  );

  // 2) O log lista o que virou "?" -- e so isso.
  const { total, distintos } = winAnsiReport();
  const codigos = distintos.map((d) => d.codigo).sort();
  assertEquals(codigos, ["U+1F4CA", "U+1F600"]);
  assertEquals(total, 32, "dois emojis por copia, dezesseis copias");

  // O 0x7F saiu sem substituto (passo 1) e a seta tinha equivalente (passo 2):
  // nenhum dos dois pode aparecer na lista de nao mapeados.
  assert(!codigos.includes("U+007F"));
  assert(!codigos.includes("U+2192"));

  let logado = "";
  const warnOriginal = console.warn;
  console.warn = (msg: string) => {
    logado = msg;
  };
  try {
    logWinAnsiReport("teste");
  } finally {
    console.warn = warnOriginal;
  }
  assertStringIncludes(logado, "32 caractere(s)");
  assertStringIncludes(logado, "U+1F600");
  assertStringIncludes(logado, "x16");
});

Deno.test("passo 1: controle sai sem substituto, quebra de linha fica", () => {
  resetWinAnsiReport();
  assertEquals(sanitizeWinAnsi("ab"), "ab");
  assertEquals(sanitizeWinAnsi("ab"), "ab");
  assertEquals(sanitizeWinAnsi("ab"), "ab");
  assertEquals(
    sanitizeWinAnsi("linha 1\r\nlinha 2\rlinha 3\nlinha 4"),
    "linha 1\nlinha 2\nlinha 3\nlinha 4",
  );
  assertEquals(sanitizeWinAnsi("col1\tcol2"), "col1 col2");
  // Invisivel nao vira "?": o "?" e para quem falta mapeamento, e caractere de
  // controle nao tem o que mapear.
  assertEquals(winAnsiReport().total, 0);
});

Deno.test("passo 2: equivalentes obvios", () => {
  resetWinAnsiReport();
  assertEquals(sanitizeWinAnsi("a → b"), "a -> b");
  assertEquals(sanitizeWinAnsi("✓ feito"), "v feito");
  assertEquals(sanitizeWinAnsi("‑‒–—"), "----");
  assertEquals(sanitizeWinAnsi("‘x’ “y”"), "'x' \"y\"");
  assertEquals(sanitizeWinAnsi("etc…"), "etc...");
  assertEquals(sanitizeWinAnsi("≥ 10 e ≤ 20"), ">= 10 e <= 20");
  assertEquals(sanitizeWinAnsi("☐ ☑"), "[ ] [x]");
  assertEquals(sanitizeWinAnsi("a b"), "a b");
  assertEquals(sanitizeWinAnsi("nota​final"), "notafinal");
  assertEquals(winAnsiReport().total, 0, "quem tem equivalente nao conta como perdido");

  // "•" e "°" sao WinAnsi de verdade e ficam como estao -- o marcador
  // de lista do PDF ja e desenhado com o bullet literal.
  assertEquals(sanitizeWinAnsi("• item a 27°C"), "• item a 27°C");
});

Deno.test("passo 3: o que sobra vira ? e e contado", () => {
  resetWinAnsiReport();
  assertEquals(sanitizeWinAnsi("nota \u{1F600} e 中"), "nota ? e ?");
  const { total, distintos } = winAnsiReport();
  assertEquals(total, 2);
  assertEquals(distintos.map((d) => d.codigo), ["U+1F600", "U+4E2D"]);
  // Emoji e um code point so: nao pode virar dois "?" nem contar duas vezes.
  assertEquals(sanitizeWinAnsi("\u{1F600}").length, 1);
});

Deno.test("sanitizar duas vezes da o mesmo resultado", () => {
  resetWinAnsiReport();
  const uma = sanitizeWinAnsi(TEXTO_RUIM);
  assertEquals(sanitizeWinAnsi(uma), uma);
});

Deno.test("nada que saia do sanitizador derruba o drawText", async () => {
  resetWinAnsiReport();
  const { font, page } = await paginaDeTeste();

  // Varredura ampla: todo o BMP baixo (onde mora o que a IA escreve), mais os
  // suplementares dos emojis. Uma falha aqui e um PDF que nao existe em
  // producao, entao o teste cobre o intervalo em vez de uma lista escolhida.
  const pontos: number[] = [];
  for (let cp = 0; cp <= 0x2fff; cp++) pontos.push(cp);
  for (const cp of [0xfeff, 0xfffd, 0x1f600, 0x1f4ca, 0x1f929, 0x2b50, 0xff0d]) pontos.push(cp);

  for (const cp of pontos) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue; // metade de par substituto
    const limpo = sanitizeWinAnsi(String.fromCodePoint(cp));
    // "\n" nao e desenhavel por drawText de linha unica; e quem chama que quebra.
    if (limpo === "" || limpo === "\n") continue;
    try {
      drawSafeText(page, limpo, { x: 10, y: 10, size: 8, font });
    } catch (e) {
      throw new Error(
        `U+${cp.toString(16).toUpperCase()} sobreviveu como ${JSON.stringify(limpo)}: ${e}`,
      );
    }
  }
});
