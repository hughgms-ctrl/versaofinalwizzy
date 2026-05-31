import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parses a date string (YYYY-MM-DD) into a Date object without timezone issues.
 * Use this whenever you need to create a Date object from a date-only string.
 */
export function parseDateOnly(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  
  // Add time to prevent timezone shift
  return new Date(dateString + "T12:00:00");
}

/**
 * Formata uma data string (YYYY-MM-DD) para o formato brasileiro sem problemas de timezone.
 * Evita o bug onde datas são exibidas um dia antes devido à conversão UTC.
 */
export function formatDateBR(dateString: string | null | undefined): string {
  if (!dateString) return "";
  
  // Parse the date string directly to avoid timezone issues
  const parts = dateString.split("-");
  if (parts.length !== 3) {
    // Fallback for other formats
    const date = new Date(dateString + "T12:00:00");
    return date.toLocaleDateString("pt-BR");
  }
  
  const [year, month, day] = parts;
  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
}

/**
 * Formata uma data string para exibição curta (DD/MM) sem problemas de timezone.
 */
export function formatDateShort(dateString: string | null | undefined): string {
  if (!dateString) return "";
  
  const parts = dateString.split("-");
  if (parts.length !== 3) {
    const date = new Date(dateString + "T12:00:00");
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
  
  const [, month, day] = parts;
  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}`;
}

/**
 * Formata uma data string para exibição com opções.
 */
export function formatDateWithOptions(
  dateString: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateString) return "";
  
  // Add time to prevent timezone shift
  const date = new Date(dateString + "T12:00:00");
  return date.toLocaleDateString("pt-BR", options);
}

/**
 * Formata o nome de um usuário para exibição resumida.
 * Usa mais caracteres do sobrenome para diferenciação.
 * Ex: "Hugo Gomes da Silva" -> "Hugo Gomes"
 * Ex: "Lucas Alves" -> "Lucas Alves"
 * Ex: "Lucas de Angelo" -> "Lucas Angelo"
 */
export function formatUserName(fullName: string | null | undefined): string {
  if (!fullName) return "";
  
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return "";
  
  const firstName = parts[0];
  
  // Find the last significant name part (ignoring prepositions like "da", "de", "dos")
  const prepositions = ["da", "de", "do", "das", "dos", "e"];
  let lastName = "";
  
  for (let i = parts.length - 1; i >= 1; i--) {
    if (!prepositions.includes(parts[i].toLowerCase())) {
      lastName = parts[i];
      break;
    }
  }
  
  return lastName ? `${firstName} ${lastName}` : firstName;
}

/**
 * Verifica se uma tarefa está atrasada.
 * Atrasada = dia seguinte ao vencimento (due_date < hoje à meia-noite)
 */
export function isTaskOverdue(dueDate: string | null | undefined, status?: string | null): boolean {
  if (!dueDate || status === "completed") return false;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const dueDateParsed = parseDateOnly(dueDate);
  if (!dueDateParsed) return false;
  
  dueDateParsed.setHours(0, 0, 0, 0);
  
  // Atrasada: due_date é anterior a hoje (dia seguinte ao vencimento)
  return dueDateParsed < today;
}

/**
 * Verifica se uma tarefa está "a vencer em breve".
 * A vencer em breve = 3 dias antes até o dia do vencimento (inclusive)
 */
export function isTaskDueSoon(dueDate: string | null | undefined, status?: string | null): boolean {
  if (!dueDate || status === "completed") return false;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const dueDateParsed = parseDateOnly(dueDate);
  if (!dueDateParsed) return false;
  
  dueDateParsed.setHours(0, 0, 0, 0);
  
  // Se já está atrasada, não é "a vencer em breve"
  if (dueDateParsed < today) return false;
  
  // Calcular 3 dias antes de hoje
  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  
  // A vencer em breve: due_date está entre hoje e 3 dias à frente (inclusive)
  return dueDateParsed >= today && dueDateParsed <= threeDaysFromNow;
}
