import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const partsDir = join(root, "tools", "cnis-runner", "installer-parts");
const outputPath = join(root, "public", "downloads", "wizzy-prev-runner-win.exe");
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

const output = createWriteStream(outputPath);
try {
  for (const part of parts) {
    await pipeline(createReadStream(join(partsDir, part)), output, { end: false });
  }
} finally {
  output.end();
}

const actualSize = statSync(outputPath).size;
if (actualSize !== expectedSize) {
  throw new Error(`Instalador montado com tamanho invalido: ${actualSize}. Esperado: ${expectedSize}.`);
}

console.log(`Instalador do Wizzy Prev Runner montado em ${outputPath}`);
