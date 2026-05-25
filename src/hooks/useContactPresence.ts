import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface ContactPresence {
  contact_id: string;
  presence_type: 'typing' | 'recording' | 'online' | 'offline';
  started_at: string;
  expires_at: string;
}

export function useContactPresence(contactId: string | null) {
  const { session } = useAuth();
  const [presence, setPresence] = useState<ContactPresence | null>(null);

  useEffect(() => {
    if (!session || !contactId) {
      setPresence(null);
      return;
    }

    // Fetch initial presence
    const fetchPresence = async () => {
      const { data } = await supabase
        .from('contact_presence')
        .select('*')
        .eq('contact_id', contactId)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      
      if (data) {
        setPresence(data as ContactPresence);
      } else {
        setPresence(null);
      }
    };

    fetchPresence();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`presence:${contactId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_presence',
          filter: `contact_id=eq.${contactId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setPresence(null);
          } else {
            const newPresence = payload.new as ContactPresence;
            // Check if not expired
            if (new Date(newPresence.expires_at) > new Date()) {
              setPresence(newPresence);
            } else {
              setPresence(null);
            }
          }
        }
      )
      .subscribe();

    // Check expiry periodically
    const expiryInterval = setInterval(() => {
      setPresence(prev => {
        if (prev && new Date(prev.expires_at) <= new Date()) {
          return null;
        }
        return prev;
      });
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(expiryInterval);
    };
  }, [session, contactId]);

  return {
    presence,
    isTyping: presence?.presence_type === 'typing',
    isRecording: presence?.presence_type === 'recording',
    isOnline: presence?.presence_type === 'online',
  };
}
