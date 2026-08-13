/**
 * Leitura de planilhas (CSV / XLSX) para a importação de contatos.
 *
 * O SheetJS (`xlsx`) é pesado (~400 kB) e só faz sentido quando o usuário abre o
 * modal de importação, então ele é carregado sob demanda com import() dinâmico —
 * nunca entra no bundle inicial do app.
 */

export interface ParsedSheet {
  /** Cabeçalhos na ordem original das colunas. */
  headers: string[];
  /** Linhas como objeto header -> valor (string já normalizada). */
  rows: Record<string, string>[];
}

export const ACCEPTED_FILE_TYPES = '.csv,.txt,.xlsx,.xls';

/** Limite defensivo: acima disso o navegador sofre para montar o preview. */
export const MAX_ROWS = 20000;

/**
 * Detecta o separador de um CSV olhando a primeira linha.
 * Excel em pt-BR exporta com ';' — assumir ',' quebraria a planilha inteira,
 * lendo tudo como uma coluna só.
 */
export function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = -1;
  for (const candidate of candidates) {
    // Conta só ocorrências FORA de aspas, senão um campo "Silva, João"
    // faria a vírgula ganhar em um arquivo separado por ';'.
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < headerLine.length; i++) {
      const char = headerLine[i];
      if (char === '"') {
        if (inQuotes && headerLine[i + 1] === '"') i++;
        else inQuotes = !inQuotes;
      } else if (char === candidate && !inQuotes) {
        count++;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/**
 * Parser de CSV conforme RFC 4180: trata aspas, aspas escapadas ("") e quebras
 * de linha DENTRO de um campo entre aspas — o caso que quebra qualquer
 * implementação ingênua baseada em split('\n').
 */
export function parseCsv(text: string): ParsedSheet {
  // Remove BOM (U+FEFF): o próprio app exporta CSV com BOM
  // (ContactBulkActionsBar), e sem isto o primeiro cabeçalho viria com um
  // caractere invisível grudado e nunca casaria no mapeamento.
  const content = text.replace(/^\uFEFF/, '');
  if (!content.trim()) return { headers: [], rows: [] };

  const firstBreak = content.search(/\r?\n/);
  const headerLine = firstBreak === -1 ? content : content.slice(0, firstBreak);
  const delimiter = detectDelimiter(headerLine);

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      record.push(field);
      field = '';
    } else if (char === '\r') {
      // ignora: o \n seguinte fecha o registro
    } else if (char === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }
  // Último registro (arquivo sem quebra de linha final).
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  if (records.length === 0) return { headers: [], rows: [] };

  const headers = dedupeHeaders(records[0].map((h) => h.trim()));
  const rows = records
    .slice(1)
    .map((values) => toRow(headers, values))
    .filter(isNotEmptyRow);

  return { headers, rows };
}

/**
 * Cabeçalhos vazios ou repetidos viram chaves distintas — como o objeto da linha
 * é indexado por cabeçalho, dois "Telefone" fariam a segunda coluna sobrescrever
 * silenciosamente a primeira.
 */
function dedupeHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((header, index) => {
    const base = header || `Coluna ${index + 1}`;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

function toRow(headers: string[], values: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  headers.forEach((header, index) => {
    row[header] = (values[index] ?? '').trim();
  });
  return row;
}

function isNotEmptyRow(row: Record<string, string>): boolean {
  return Object.values(row).some((value) => value !== '');
}

/** Lê .xlsx/.xls carregando o SheetJS sob demanda. */
async function parseExcel(file: File): Promise<ParsedSheet> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  // header: 1 devolve matriz crua (linhas de células), que é o que precisamos
  // para tratar o cabeçalho igual ao CSV. defval mantém colunas vazias
  // alinhadas; raw: false formata datas/números como o usuário os vê na planilha.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });

  if (matrix.length === 0) return { headers: [], rows: [] };

  const headers = dedupeHeaders(matrix[0].map((cell) => String(cell ?? '').trim()));
  const rows = matrix
    .slice(1)
    .map((values) => toRow(headers, values.map((cell) => String(cell ?? ''))))
    .filter(isNotEmptyRow);

  return { headers, rows };
}

/** Ponto de entrada: decide o parser pela extensão do arquivo. */
export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const name = file.name.toLowerCase();
  const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');

  const parsed = isExcel ? await parseExcel(file) : parseCsv(await readAsText(file));

  if (parsed.headers.length === 0) {
    throw new Error('Não foi possível ler nenhuma coluna. Confira se o arquivo tem uma linha de cabeçalho.');
  }
  if (parsed.rows.length === 0) {
    throw new Error('O arquivo não tem nenhuma linha de dados além do cabeçalho.');
  }
  if (parsed.rows.length > MAX_ROWS) {
    throw new Error(`O arquivo tem ${parsed.rows.length} linhas. O limite é ${MAX_ROWS} por importação.`);
  }

  return parsed;
}

/**
 * Lê o arquivo como texto tentando UTF-8 e caindo para windows-1252.
 * CSV salvo pelo Excel em Windows costuma vir em ANSI: lido como UTF-8, "João"
 * viraria "Jo�o".
 */
async function readAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  // U+FFFD é o caractere de substituição: se apareceu, a decodificação falhou.
  if (!utf8.includes('�')) return utf8;
  try {
    return new TextDecoder('windows-1252').decode(buffer);
  } catch {
    return utf8;
  }
}

// ---------------------------------------------------------------------------
// Sugestão automática de mapeamento
// ---------------------------------------------------------------------------

const normalizeHeader = (header: string): string =>
  header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// Dicas por destino. `strong` casa como palavra inteira do cabeçalho e vale mais
// que `weak`, que só precisa aparecer no meio do texto.
//
// 'contato' é dica FRACA dos dois lados de propósito: "Contato" sozinho costuma
// ser o telefone, mas "Nome do contato" é o nome e "E-mail do contato" é o
// e-mail. Como dica fraca, ela só decide quando não há nada melhor.
const TARGET_HINTS: Array<{ target: string; strong: string[]; weak: string[] }> = [
  {
    target: 'phone',
    strong: ['telefone', 'phone', 'celular', 'whatsapp', 'whats', 'numero', 'number', 'fone', 'tel'],
    weak: ['telefone', 'phone', 'celular', 'whatsapp', 'whats', 'numero', 'number', 'fone', 'contato'],
  },
  {
    target: 'email',
    strong: ['email', 'mail', 'correio', 'emailcontato'],
    weak: ['email', 'mail', 'correio'],
  },
  {
    target: 'name',
    strong: ['nome', 'name', 'nomecompleto', 'fullname', 'cliente', 'razaosocial'],
    weak: ['nome', 'name', 'cliente', 'contato'],
  },
];

/**
 * Nota de afinidade entre um cabeçalho e um destino. 0 = não serve.
 * Maior é melhor.
 */
function scoreHeader(header: string, hints: { strong: string[]; weak: string[] }): number {
  const normalized = normalizeHeader(header);
  if (!normalized) return 0;
  // Cabeçalho idêntico à dica: o sinal mais forte possível ("Telefone" -> phone).
  if (hints.strong.includes(normalized)) return 100;
  // Contém uma dica forte ("Telefone celular", "Nome completo").
  if (hints.strong.some((hint) => normalized.includes(hint))) return 50;
  // Só a dica fraca ("Contato" para telefone).
  if (hints.weak.some((hint) => normalized.includes(hint))) return 10;
  return 0;
}

/**
 * Chuta o mapeamento inicial das colunas para o usuário só conferir.
 * Retorna header -> 'phone' | 'name' | 'email'.
 *
 * Avalia TODOS os pares (coluna, destino) e resolve pelo melhor primeiro, em vez
 * de deixar cada destino pegar gulosamente a primeira coluna que serve. Sem isso
 * uma planilha ["Nome", "E-mail do contato"] mapeava o e-mail como telefone (a
 * palavra "contato" é dica de telefone), e ["Contato", "Telefone"] dava o
 * telefone para "Contato", deixando a coluna "Telefone" de fora.
 */
export function suggestMapping(headers: string[]): Record<string, string> {
  const candidates: Array<{ header: string; target: string; score: number }> = [];

  for (const hints of TARGET_HINTS) {
    for (const header of headers) {
      const score = scoreHeader(header, hints);
      if (score > 0) candidates.push({ header, target: hints.target, score });
    }
  }

  // Melhor nota primeiro. Empate: telefone ganha, por ser o único obrigatório.
  const targetPriority: Record<string, number> = { phone: 0, email: 1, name: 2 };
  candidates.sort(
    (a, b) => b.score - a.score || targetPriority[a.target] - targetPriority[b.target],
  );

  const mapping: Record<string, string> = {};
  const takenTargets = new Set<string>();

  for (const candidate of candidates) {
    if (mapping[candidate.header] || takenTargets.has(candidate.target)) continue;
    mapping[candidate.header] = candidate.target;
    takenTargets.add(candidate.target);
  }

  return mapping;
}
