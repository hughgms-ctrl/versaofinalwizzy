import { useEffect, useRef } from 'react';

/**
 * Uma inscricao de realtime por chave, nao por componente montado.
 *
 * Varios hooks daqui (lista de conversas, follow-up) sao montados por mais de um
 * componente ao mesmo tempo — a lista, o detalhe da conversa, o board do funil e
 * dialogos que so querem os dados. Cada montagem abrindo o proprio canal
 * significa o mesmo evento chegando N vezes e, pior, N vezes o trabalho de
 * reagir a ele (buscas pontuais, patches, refetch).
 *
 * O refcount aqui e o mesmo padrao do PresenceStore (useContactPresence): o
 * primeiro assinante cria, o ultimo a sair derruba.
 */
type Teardown = () => void;

interface SharedEntry {
  refCount: number;
  teardown: Teardown;
}

const registry = new Map<string, SharedEntry>();

export function acquireSharedSubscription(key: string, start: () => Teardown): Teardown {
  let entry = registry.get(key);

  if (!entry) {
    entry = { refCount: 0, teardown: start() };
    registry.set(key, entry);
  }

  entry.refCount++;
  let released = false;

  return () => {
    if (released) return;
    released = true;

    const current = registry.get(key);
    if (!current) return;

    current.refCount--;
    if (current.refCount > 0) return;

    registry.delete(key);
    current.teardown();
  };
}

/**
 * `start` e lido por ref: a inscricao so e recriada quando a CHAVE muda, entao a
 * chave precisa conter tudo que o `start` usa (org, id da conversa, etc.).
 */
export function useSharedRealtimeSubscription(key: string | null, start: () => Teardown) {
  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => {
    if (!key) return;
    return acquireSharedSubscription(key, () => startRef.current());
  }, [key]);
}
