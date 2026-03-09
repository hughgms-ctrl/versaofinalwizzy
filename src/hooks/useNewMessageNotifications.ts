import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

// Notification sound
const NOTIFICATION_SOUND_URL = '/sounds/new-message.mp3';

// Debounce window to prevent duplicate sounds (ms)
const SOUND_DEBOUNCE_MS = 2000;

export function useNewMessageNotifications() {
  const { session } = useAuth();
  const { settings } = useNotificationSettings();
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastNotifiedMessageId = useRef<string | null>(null);
  const lastSoundPlayedAt = useRef<number>(0);

  // Initialize audio element once
  useEffect(() => {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 1.0;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  const playNotificationSound = useCallback(() => {
    const now = Date.now();
    const timeSinceLastPlay = now - lastSoundPlayedAt.current;
    console.log('[NOTIFICATION] playNotificationSound called', { 
      soundEnabled: settings.soundEnabled, 
      hasAudio: !!audioRef.current,
      timeSinceLastPlay,
      debounceMs: SOUND_DEBOUNCE_MS 
    });
    if (
      settings.soundEnabled &&
      audioRef.current &&
      timeSinceLastPlay > SOUND_DEBOUNCE_MS
    ) {
      lastSoundPlayedAt.current = now;
      audioRef.current.currentTime = 0;
      audioRef.current.play()
        .then(() => console.log('[NOTIFICATION] Sound played successfully'))
        .catch((err) => console.error('[NOTIFICATION] Sound play failed:', err));
    }
  }, [settings.soundEnabled]);

  const showNotification = useCallback((contactName: string, messagePreview: string, messageId: string) => {
    // Avoid duplicate notifications
    if (lastNotifiedMessageId.current === messageId) return;
    lastNotifiedMessageId.current = messageId;

    toast({
      title: `📩 ${contactName}`,
      description: messagePreview.length > 50 ? messagePreview.slice(0, 50) + '...' : messagePreview,
      duration: 5000,
    });

    playNotificationSound();
    
    // Invalidate conversations to update unread count
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [playNotificationSound, queryClient]);

  useEffect(() => {
    if (!session?.user?.id || !settings.newMessageEnabled) return;

    console.log('Setting up real-time message notifications...');

    const channel = supabase
      .channel('new-messages-notification')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: 'direction=eq.inbound',
        },
        async (payload) => {
          console.log('New inbound message received:', payload);
          
          const message = payload.new as {
            id: string;
            content: string | null;
            type: string;
            conversation_id: string;
          };

          // Fetch contact info for the conversation
          const { data: conversation } = await supabase
            .from('conversations')
            .select('contact:contacts(name, phone)')
            .eq('id', message.conversation_id)
            .single();

          if (conversation?.contact) {
            const contact = conversation.contact as unknown as { name: string | null; phone: string };
            const contactName = contact.name || contact.phone || 'Contato';
            const messagePreview = message.content || (message.type !== 'text' ? `[${message.type}]` : 'Nova mensagem');
            
            showNotification(contactName, messagePreview, message.id);
          }
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up message notifications subscription...');
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, settings.newMessageEnabled, showNotification]);

  return { playNotificationSound };
}
