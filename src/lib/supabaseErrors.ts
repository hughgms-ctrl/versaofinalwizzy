export function isMissingRelationError(error: unknown) {
  const err = error as { code?: string; message?: string; details?: string } | null;
  const message = String(err?.message || err?.details || '').toLowerCase();
  return err?.code === 'PGRST205'
    || err?.code === '42P01'
    || message.includes('could not find the table')
    || message.includes('does not exist');
}

// `supabase.functions.invoke` devolve um FunctionsHttpError genérico ("non-2xx
// status code") quando a edge function responde 400 — a mensagem que escrevemos
// no corpo fica escondida em `error.context`. Sem isto, uma recusa explicada
// pelo back chega ao usuário como erro genérico.
export async function functionErrorMessage(error: unknown, fallback: string) {
  const err = error as { context?: { json?: () => Promise<{ error?: string }> }; message?: string } | null;
  if (err?.context && typeof err.context.json === 'function') {
    try {
      const body = await err.context.json();
      if (body?.error) return body.error;
    } catch {
      // corpo não era JSON — cai no fallback abaixo.
    }
  }
  return err?.message || fallback;
}
