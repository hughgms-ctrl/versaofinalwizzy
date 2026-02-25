import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

// Notification sound (simple base64 encoded beep)
const NOTIFICATION_SOUND_URL = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleicONYC/zbp6MBovb7/IqXAsGB42bqOxmmo8Hx1FcJ+qgV5AMCM5UpGheGFJPjQrSoGTbFhOQzw0P293Y09FR0A1P2VqW0lGSj84P2NnW0dHSz85P2VpXUhHTD45P2VpXUhHTD45P2ZpXkhHTT46QGZqXklITT45P2dpXkhITT46P2dpXklITD05P2ZpXkhHTD05P2ZoXUhHTD45P2VnXEdGSz44PmRmWkZFSj44PmNlWUVEST03PWJkWERESDw3PGFjV0NDRzs2O2BiVkJCRjo1OV9gVEFBRDkzN11eUj9APzgyNlxdUT4+PTcxNFpbTzw8PDYwMlhZTTs6OjQvMFZXSzk5ODMtLlRVSTc3NjIrLFFTRzU1NDApKU9RRTMzMi8oKE1PRDExMC4nJ0tNQi8vLy0mJklLQC0tLSwlJUdJPisrKyokJEVHPCkpKSkjI0NFOycnJygiIkFDOSUlJSYhIUA/OCMjIyUgH0A/OCEhISQfHj49NR8fHyIeHTs7NB0dHSEdHDo5Mx0dHSAdHDg3MhsbGx8cGzY1MBoaGh4bGjQzLxkZGR0aGTIxLhgYGBwZGDAvLRcXFxsYFy4tLBYWFhoXFi0sKxUVFRkWFS0rKxQUFBgVFC0rKhMTExcUEywqKRMTExYTEisqKBISEhYTESopJxEREhURECgpJhAQEBQQDycnJQ8PEBMQDiYmJA4ODxIPDSUlIw4ODhEODCQkIg0NDRAPCyMjIQwMDBAPCyIiIAwMDBAPCiIhHwsLCw8OCiEhHwsLCw8OCiAhHwoKCg8NCR8gHgoKCg4NCR8fHQkJCQ4MCB4eHQkJCQ4MCB4eHAgICA0LBxwdHAgICA0LBxsdGwgICA0LBhsdGwcHBw0LBhocGwcHBw0LBhobGgcHBwwKBRkbGgYGBgwKBRkbGgYGBgwKBRkbGgYGBgwKBRkaGQYGBgwKBRkaGQUFBQwKBRkaGQUFBQwJBBkZGAUFBQsJBBgZGAUFBQsJBBgZFwUFBQsJBBgYFwQEBAsJBBgYFwQEBAoIAwgYFwQEBAoIAwcXFgQEBAoIAwcXFgQEBAoIAwcXFgMDAwoHAwcWFQMDAwoHAwcWFQMDAwoHAwYWFQMDAwoHAwYWFQMDAwoHAgYVFQMDAwkGAgYVFQICAgoGAgYVFQICAgoGAgUUFAICAgoGAgUUFAICAgoGAgUUFAICAgkFAQUTEwICAgkFAQUTEwICAgkFAQQTEwICAgkFAQQTEwICAgkFAQQTEwEBAQkEAQQSEgEBAQkEAQQSEgEBAQkEAAQSEgEBAQkEAAQSEgEBAQkEAAMREQEBAQkEAAMREQEBAQkEAAMREQEBAQkEAAMREQEBAQgDAAMQEAEBAQgDAAMQEAEBAQgDAAMQEAEBAQgDAAIQEAAAAAYCAAIQDwAAAAgCAAEPDwAAAAgCAAEPDwAAAAgBAAAPDgAAAAcBAAAPDgAAAAcBAAAADg4AAAAHAAAAAg4NAAAABgAAAAINDQAAAAYAAAACDQ0AAAAGAAAAAgwMAAAABgAAAAEMCwAAAAYAAAABCwsAAAAFAAAAAQsLAAAABQAAAAEKCgAAAAUAAAAACgoAAAAFAAAAAAkJAAAABQAAAAAJCQAAAAUAAAAACQkAAAAFAAAAAAgIAAAABAAAAAAICAAAAAQAAAAACAgAAAAEAAAAAQcHAAAABAAAAAAHBwAAAAQAAAAABwYAAAAEAAAAAAYGAAAABAAAAAAGBgAAAAQAAAAABgYAAAADAAAAAAUFAAAAAwAAAAAFBQAAAAMAAAAABQUAAAADAAAAAAUFAAAAAwAAAAAEBAAAAAMAAAAABAQAAAADAAAAAAQEAAAAAwAAAAADAwAAAAMAAAAAAwMAAAADAAAAAAMDAAAAAwAAAAADAwAAAAIAAAAAAgIAAAACAAAAAAICAAAAAgAAAAACAgAAAAIAAAAAAQEAAAACAAAAAAEBAAAAAQAAAAABAQAAAAEAAAAAAQEAAAABAAAAAAEBAAAAAgAAAAABAQAAAAEAAAAAAQEAAAABAAAAAAEBAAAAAQAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAA';

export function useNewMessageNotifications() {
  const { session } = useAuth();
  const { settings } = useNotificationSettings();
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastNotifiedMessageId = useRef<string | null>(null);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    audioRef.current.volume = 0.5;
  }, []);

  const playNotificationSound = useCallback(() => {
    if (settings.soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(console.error);
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
