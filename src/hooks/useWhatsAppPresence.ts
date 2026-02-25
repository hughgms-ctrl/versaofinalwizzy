import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

type PresenceType = 'typing' | 'recording';

export function useWhatsAppPresence() {
  const { session } = useAuth();

  const sendPresence = useCallback(async (
    phone: string,
    presence: PresenceType,
    duration: number = 3000
  ) => {
    if (!session?.access_token) {
      console.error('No session for presence');
      return false;
    }

    try {
      const { data, error } = await supabase.functions.invoke('zapi-send-presence', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { phone, presence, duration },
      });

      if (error) {
        console.error('Error sending presence:', error);
        return false;
      }

      return data?.success || false;
    } catch (error) {
      console.error('Error sending presence:', error);
      return false;
    }
  }, [session?.access_token]);

  const sendTyping = useCallback((phone: string, duration: number = 3000) => {
    return sendPresence(phone, 'typing', duration);
  }, [sendPresence]);

  const sendRecording = useCallback((phone: string, duration: number = 5000) => {
    return sendPresence(phone, 'recording', duration);
  }, [sendPresence]);

  return {
    sendPresence,
    sendTyping,
    sendRecording,
  };
}
