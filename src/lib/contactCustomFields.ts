import type { ContactCustomField } from '@/hooks/useContactCustomFields';

/**
 * Leitura dos campos personalizados de um contato para EXIBIÇÃO.
 *
 * A definição do campo mora em `contact_custom_fields` (label, tipo) e o valor
 * em `contacts.metadata.custom_fields`. Quem escreve é a importação por
 * planilha, o nó "Salvar no Contato" do fluxo e a ferramenta da IA — nenhum
 * deles passa pela UI, então aqui o valor é tratado como texto de origem
 * desconhecida: nunca dá para assumir tipo, formato ou que a definição ainda
 * exista.
 */

export interface ResolvedCustomField {
  key: string;
  label: string;
  value: string;
  /** Valor gravado sob uma chave que não tem (ou não tem mais) definição. */
  orphan: boolean;
}

/**
 * Extrai `metadata.custom_fields` defendendo-se do metadata gravado como
 * STRING JSON — o mesmo caso que flow-execute e merge_contact_custom_fields
 * já tratam. Sem isso o painel mostraria "nenhum campo" para um contato que
 * tem dado.
 */
export function readContactCustomFields(metadata: unknown): Record<string, unknown> {
  let base: unknown = metadata;

  if (typeof base === 'string') {
    try {
      base = JSON.parse(base);
    } catch {
      return {};
    }
  }

  if (!base || typeof base !== 'object' || Array.isArray(base)) return {};

  const raw = (base as Record<string, unknown>).custom_fields;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  return raw as Record<string, unknown>;
}

/**
 * O `type` da definição é informativo: o fluxo e a IA gravam texto livre, então
 * ele orienta a formatação mas nunca descarta o que foi gravado — valor que não
 * casa com o tipo é mostrado como veio.
 */
export function formatCustomFieldValue(value: unknown, type?: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'object') return JSON.stringify(value);

  const text = String(value).trim();
  if (!text) return '';

  if (type === 'boolean') {
    if (/^(true|1|sim|yes)$/i.test(text)) return 'Sim';
    if (/^(false|0|nao|não|no)$/i.test(text)) return 'Não';
  }

  if (type === 'date') {
    // Formatado na mão a partir dos grupos, e não via `new Date`, porque
    // "2026-08-19" é lido como UTC e no fuso do Brasil voltaria como 18/08.
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  }

  return text;
}

/**
 * Cruza definições e valores. Devolve só o que tem valor preenchido — campo
 * vazio no painel do vendedor é ruído, não informação.
 */
export function resolveContactCustomFields(
  metadata: unknown,
  definitions: ContactCustomField[],
): ResolvedCustomField[] {
  const values = readContactCustomFields(metadata);
  const resolved: ResolvedCustomField[] = [];
  const known = new Set<string>();

  for (const definition of definitions) {
    known.add(definition.key);
    const value = formatCustomFieldValue(values[definition.key], definition.type);
    if (!value) continue;
    resolved.push({ key: definition.key, label: definition.label, value, orphan: false });
  }

  // Apagar a definição não apaga o valor já gravado (useContactCustomFields
  // deleta só o catálogo). Esconder esses valores aqui seria sumir com dado que
  // a triagem coletou, então eles aparecem rotulados pela própria chave.
  for (const [key, raw] of Object.entries(values)) {
    if (known.has(key)) continue;
    const value = formatCustomFieldValue(raw);
    if (!value) continue;
    resolved.push({ key, label: key, value, orphan: true });
  }

  return resolved;
}
