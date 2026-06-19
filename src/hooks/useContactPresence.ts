import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface ContactPresence {
  contact_id: string;
  presence_type: 'typing' | 'recording' | 'online' | 'offline';
  started_at: string;
  expires_at: string;
}

type Listener = () => void;

/**
 * Store de presença compartilhado por organização.
 *
 * Antes (Fase < 6): cada `useContactPresence` abria 1 canal websocket
 * `presence:${contactId}` + 1 `setInterval(5000)`. Em listas / trocas de
 * conversa isso acumulava conexões e timers.
 *
 * Agora (Fase 6C): UM canal `contact-presence:${orgId}` + UM timer de expiração
 * por organização, com um `Map<contact_id, presence>` lido pelos hooks. O canal
 * só é criado quando o primeiro assinante chega e fechado quando o último sai
 * (refcount), com um período de carência para sobreviver a trocas rápidas de
 * conversa sem recriar o websocket.
 */
class PresenceStore {
  private orgId: string;
  private presences = new Map<string, ContactPresence>();
  private listeners = new Map<string, Set<Listener>>();
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private expiryInterval: ReturnType<typeof setInterval> | null = null;
  private teardownTimer: ReturnType<typeof setTimeout> | null = null;
  private refCount = 0;

  constructor(orgId: string) {
    this.orgId = orgId;
  }

  private start() {
    // Snapshot inicial: todas as presenças vivas da org (substitui o fetch
    // por-contato que cada hook fazia). Tabela é pequena e purgada por cron.
    supabase
      .from('contact_presence')
      .select('*')
      .eq('organization_id', this.orgId)
      .gt('expires_at', new Date().toISOString())
      .then(({ data }) => {
        if (!data) return;
        for (const row of data as ContactPresence[]) {
          this.presences.set(row.contact_id, row);
          this.notify(row.contact_id);
        }
      });

    this.channel = supabase
      .channel(`contact-presence:${this.orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_presence',
          filter: `organization_id=eq.${this.orgId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            // DELETE só traz a PK (sem REPLICA IDENTITY FULL), então pode não
            // ter contact_id — nesse caso a expiração local cobre a limpeza.
            const old = payload.old as Partial<ContactPresence>;
            const cid = old?.contact_id;
            if (cid && this.presences.has(cid)) {
              this.presences.delete(cid);
              this.notify(cid);
            }
            return;
          }

          const next = payload.new as ContactPresence;
          if (new Date(next.expires_at) > new Date()) {
            this.presences.set(next.contact_id, next);
          } else {
            this.presences.delete(next.contact_id);
          }
          this.notify(next.contact_id);
        }
      )
      .subscribe();

    // Único timer de expiração para toda a org.
    this.expiryInterval = setInterval(() => {
      const now = new Date();
      for (const [cid, p] of this.presences) {
        if (new Date(p.expires_at) <= now) {
          this.presences.delete(cid);
          this.notify(cid);
        }
      }
    }, 5000);
  }

  private stop() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    if (this.expiryInterval) {
      clearInterval(this.expiryInterval);
      this.expiryInterval = null;
    }
    this.presences.clear();
  }

  private notify(contactId: string) {
    const set = this.listeners.get(contactId);
    if (set) set.forEach((l) => l());
  }

  get(contactId: string): ContactPresence | null {
    return this.presences.get(contactId) ?? null;
  }

  subscribe(contactId: string, listener: Listener): () => void {
    // Cancela um teardown pendente — reaproveita o canal já aberto.
    if (this.teardownTimer) {
      clearTimeout(this.teardownTimer);
      this.teardownTimer = null;
    }

    let set = this.listeners.get(contactId);
    if (!set) {
      set = new Set();
      this.listeners.set(contactId, set);
    }
    set.add(listener);
    this.refCount++;

    if (!this.channel) this.start();

    return () => {
      set!.delete(listener);
      if (set!.size === 0) this.listeners.delete(contactId);
      this.refCount--;

      if (this.refCount === 0 && !this.teardownTimer) {
        // Carência: evita recriar o websocket ao alternar conversas.
        this.teardownTimer = setTimeout(() => {
          this.teardownTimer = null;
          if (this.refCount === 0) {
            this.stop();
            stores.delete(this.orgId);
          }
        }, 10_000);
      }
    };
  }
}

const stores = new Map<string, PresenceStore>();

function getStore(orgId: string): PresenceStore {
  let store = stores.get(orgId);
  if (!store) {
    store = new PresenceStore(orgId);
    stores.set(orgId, store);
  }
  return store;
}

export function useContactPresence(contactId: string | null) {
  const { session, profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const [presence, setPresence] = useState<ContactPresence | null>(null);

  useEffect(() => {
    if (!session || !orgId || !contactId) {
      setPresence(null);
      return;
    }

    const store = getStore(orgId);
    setPresence(store.get(contactId));

    const unsubscribe = store.subscribe(contactId, () => {
      setPresence(store.get(contactId));
    });

    return unsubscribe;
  }, [session, orgId, contactId]);

  return {
    presence,
    isTyping: presence?.presence_type === 'typing',
    isRecording: presence?.presence_type === 'recording',
    isOnline: presence?.presence_type === 'online',
  };
}
