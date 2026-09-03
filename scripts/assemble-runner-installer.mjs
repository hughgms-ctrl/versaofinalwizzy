import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const partsDir = join(root, "tools", "cnis-runner", "installer-parts");
const outputPath = join(root, "public", "downloads", "wizzy-prev-runner-win.exe");
const temporaryOutputPath = `${outputPath}.tmp`;
const expectedSize = 347_721_242;

if (!existsSync(partsDir)) {
  throw new Error(`Pasta de partes nao encontrada: ${partsDir}`);
}

const parts = readdirSync(partsDir)
  .filter((name) => /^wizzy-prev-runner-win\.exe\.part\d+$/.test(name))
  .sort((a, b) => a.localeCompare(b));

if (parts.length === 0) {
  throw new Error(`Nenhuma parte do instalador encontrada em ${partsDir}`);
}

mkdirSync(dirname(outputPath), { recursive: true });

async function* readParts() {
  for (const part of parts) {
    yield* createReadStream(join(partsDir, part));
  }
}

// Uma unica pipeline controla o ciclo de vida do arquivo. Reutilizar o mesmo
// WriteStream em varias pipelines com `end: false` pode encerrar a montagem
// antes de todos os buffers terem sido efetivamente gravados.
await pipeline(Readable.from(readParts()), createWriteStream(temporaryOutputPath));

const actualSize = statSync(temporaryOutputPath).size;
if (actualSize !== expectedSize) {
  throw new Error(`Instalador montado com tamanho invalido: ${actualSize}. Esperado: ${expectedSize}.`);
}

renameSync(temporaryOutputPath, outputPath);

console.log(`Instalador do Wizzy Prev Runner montado em ${outputPath}`);
