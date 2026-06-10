export function isMissingRelationError(error: unknown) {
  const err = error as { code?: string; message?: string; details?: string } | null;
  const message = String(err?.message || err?.details || '').toLowerCase();
  return err?.code === 'PGRST205'
    || err?.code === '42P01'
    || message.includes('could not find the table')
    || message.includes('does not exist');
}
