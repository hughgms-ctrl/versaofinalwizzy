// Cache de `platform_settings` por isolate.
//
// `platform_settings` e a linha mais lida do banco: cada envio de mensagem lia
// `whatsapp_connection_settings` e `whatsapp_provider_strategy` (duas consultas
// separadas), e o orquestrador de IA lia as mesmas chaves de novo, mais a
// estrategia de modelo. Sao valores de configuracao da PLATAFORMA — mudam
// quando alguem mexe no admin, nao a cada mensagem.
//
// O cache vive no isolate (some quando ele recicla), com validade curta: uma
// mudanca no admin entra em no maximo TTL segundos. Se a leitura falhar e
// houver valor antigo em memoria, ele e reaproveitado — melhor um valor de 2
// minutos atras do que cair no default e mandar a mensagem pelo provedor errado.

const DEFAULT_TTL_MS = 60_000;

interface CacheEntry {
  value: any;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function getPlatformSetting(
  supabase: any,
  key: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<any> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const { data, error } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.error(`[PLATFORM_SETTINGS] Falha ao ler ${key}:`, error.message);
    if (cached) return cached.value;
    return null;
  }

  const value = data?.value ?? null;
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/** Para quem grava a configuracao e precisa ler o valor novo no mesmo isolate. */
export function invalidatePlatformSetting(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}
