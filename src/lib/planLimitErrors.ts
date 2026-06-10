export function isPlanLimitError(error: unknown, resource?: 'workspace' | 'team' | 'whatsapp') {
  const message = getPlanLimitErrorMessage(error).toLowerCase();
  if (!message.includes('limite')) return false;
  if (!resource) return true;
  if (resource === 'workspace') return message.includes('workspace');
  if (resource === 'team') return message.includes('usu') || message.includes('membro');
  if (resource === 'whatsapp') return message.includes('whatsapp') || message.includes('número') || message.includes('numero');
  return false;
}

export function getPlanLimitErrorMessage(error: unknown) {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
