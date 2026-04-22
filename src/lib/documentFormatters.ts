import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Formata um valor conforme o tipo do campo do template
 * para exibição em PDFs e previews.
 */
export function formatFieldValue(value: unknown, fieldType?: string): string {
  if (value === null || value === undefined || value === "") return "";
  const str = String(value);

  switch (fieldType) {
    case "date": {
      // Aceita ISO yyyy-MM-dd ou dd/MM/yyyy
      let d = parse(str, "yyyy-MM-dd", new Date());
      if (!isValid(d)) d = parse(str, "dd/MM/yyyy", new Date());
      if (!isValid(d)) d = new Date(str);
      if (isValid(d)) return format(d, "dd/MM/yyyy", { locale: ptBR });
      return str;
    }
    case "cpf": {
      const digits = str.replace(/\D/g, "").padStart(11, "0").slice(-11);
      return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    }
    case "cnpj": {
      const digits = str.replace(/\D/g, "").padStart(14, "0").slice(-14);
      return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    }
    case "phone":
    case "tel": {
      const digits = str.replace(/\D/g, "");
      if (digits.length === 11) return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
      if (digits.length === 10) return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
      return str;
    }
    case "currency": {
      const num = Number(str.replace(/[^0-9,.-]/g, "").replace(",", "."));
      if (Number.isFinite(num)) {
        return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      }
      return str;
    }
    default:
      return str;
  }
}

/**
 * Substitui {{campo}} no texto/HTML pelos valores formatados.
 */
export function fillTemplate(
  template: string,
  data: Record<string, unknown>,
  fields: Array<{ name: string; type?: string }> = [],
): string {
  let out = template;
  const fieldMap = new Map(fields.map((f) => [f.name, f.type]));
  // Replace each placeholder
  out = out.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_, key) => {
    const v = data[key];
    if (v === undefined || v === null || v === "") return `{{${key}}}`;
    return formatFieldValue(v, fieldMap.get(key));
  });
  return out;
}
