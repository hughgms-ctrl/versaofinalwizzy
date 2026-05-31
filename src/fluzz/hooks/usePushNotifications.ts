import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/fluzz/integrations/supabase/client';
import { useAuth } from '@/fluzz/contexts/AuthContext';
import { toast } from 'sonner';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  try {
    // Ensure the string is properly padded
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray.buffer;
  } catch (error) {
    console.error('Error decoding base64 string:', error);
    throw new Error('Invalid VAPID key format');
  }
}

export function usePushNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [localEndpoint, setLocalEndpoint] = useState<string | null>(null);

  // Debounce ref to prevent duplicate calls
  const sendingRef = useRef(false);

  const fetchVapidKey = useCallback(async (): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('get-vapid-key');
      if (error) throw error;

      const key = (data?.publicKey as string | undefined) ?? null;
      if (key) setVapidKey(key);
      return key;
    } catch (error) {
      console.error('Error fetching VAPID key:', error);
      return null;
    }
  }, []);

  const checkSubscription = useCallback(async () => {
    if (!user) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        setLocalEndpoint(subscription.endpoint);

        // Check if subscription exists in database
        const { data, error } = await supabase
          .from('push_subscriptions')
          .select('id')
          .eq('user_id', user.id)
          .eq('endpoint', subscription.endpoint)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (error) throw error;
        setIsSubscribed((data?.length ?? 0) > 0);
      } else {
        setLocalEndpoint(null);
        setIsSubscribed(false);
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
      setLocalEndpoint(null);
      setIsSubscribed(false);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    setIsInitialized(false);

    const init = async () => {
      // Check if push notifications are supported
      const supported =
        'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      setIsSupported(supported);

      if (!supported) {
        if (!cancelled) {
          setIsInitialized(true);
          setLocalEndpoint(null);
          setIsSubscribed(false);
        }
        return;
      }

      setPermission(Notification.permission);

      // If there's no user, we still consider the hook initialized (nothing to check)
      if (!user) {
        if (!cancelled) {
          setIsInitialized(true);
          setLocalEndpoint(null);
          setIsSubscribed(false);
        }
        return;
      }

      try {
        // Best-effort (subscribe() will fetch again if needed)
        await fetchVapidKey();
        await checkSubscription();
      } finally {
        if (!cancelled) {
          setIsInitialized(true);
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [user, fetchVapidKey, checkSubscription]);

  const registerServiceWorker = async (): Promise<ServiceWorkerRegistration> => {
    // Use the main PWA service worker (which now includes push handlers)
    // Wait for the service worker to be ready
    const registration = await navigator.serviceWorker.ready;
    return registration;
  };

  const getSubscribeErrorMessage = (error: any) => {
    const name = error?.name as string | undefined;

    if (name === 'NotAllowedError') {
      return 'Permissão bloqueada para notificações. Verifique as permissões e tente novamente.';
    }

    if (name === 'NotSupportedError') {
      return 'Este dispositivo não suporta notificações push (no iPhone: instale o app na Tela de Início e use iOS 16.4+).';
    }

    if (name === 'AbortError') {
      return 'Não foi possível concluir a ativação. Tente novamente.';
    }

    return 'Não foi possível ativar as notificações. Tente novamente.';
  };

  const subscribe = async (): Promise<boolean> => {
    if (!user || !isSupported) {
      toast.error('Notificações push não são suportadas neste navegador');
      return false;
    }

    setIsLoading(true);

    try {
      const currentVapidKey = vapidKey ?? (await fetchVapidKey());

      if (!currentVapidKey) {
        console.error('VAPID key not available');
        toast.error('Configuração de notificações incompleta. Tente novamente.');
        return false;
      }

      // Request notification permission
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== 'granted') {
        if (permissionResult === 'denied') {
          toast.error('Permissão de notificações bloqueada. Libere nas configurações e tente novamente.');
        } else {
          toast.info('Permissão não concedida. Tente novamente.');
        }
        return false;
      }

      // Register service worker
      const registration = await registerServiceWorker();

      // Convert VAPID key and subscribe to push
      let applicationServerKey: ArrayBuffer;
      try {
        applicationServerKey = urlBase64ToUint8Array(currentVapidKey);
      } catch (error) {
        console.error('Error converting VAPID key:', error);
        toast.error('Configuração de notificações inválida. Contate o suporte.');
        return false;
      }

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey,
      });

      const subscriptionJson = subscription.toJSON();
      const endpoint = subscriptionJson.endpoint!;
      const p256dh = subscriptionJson.keys?.p256dh || '';
      const auth = subscriptionJson.keys?.auth || '';

      setLocalEndpoint(endpoint);

      // Save subscription to database (one per user+device)
      const { data: existingRows, error: existingError } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('endpoint', endpoint)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (existingError) throw existingError;

      const existingId = (existingRows?.[0]?.id as string | undefined) ?? undefined;

      if (existingId) {
        const { error } = await supabase
          .from('push_subscriptions')
          .update({ p256dh, auth })
          .eq('id', existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('push_subscriptions')
          .insert({ user_id: user.id, endpoint, p256dh, auth });
        if (error) throw error;
      }

      setIsSubscribed(true);
      toast.success('Notificações push ativadas!');
      return true;
    } catch (error: any) {
      console.error('Error subscribing to push:', error);
      toast.error(getSubscribeErrorMessage(error));
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async (): Promise<boolean> => {
    if (!user) return false;

    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe from push
        await subscription.unsubscribe();

        // Remove from database
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('endpoint', subscription.endpoint);
      }

      setLocalEndpoint(null);
      setIsSubscribed(false);
      toast.success('Notificações push desativadas');
      return true;
    } catch (error: any) {
      console.error('Error unsubscribing from push:', error);
      toast.error('Erro ao desativar notificações');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestNotification = async () => {
    if (!user) return;

    // Prevent duplicate calls (React StrictMode / double-renders)
    if (sendingRef.current) {
      console.log('[Push] Ignoring duplicate sendTestNotification call');
      return;
    }
    sendingRef.current = true;

    try {
      const { error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          userId: user.id,
          title: '🔔 Notificação de teste',
          body: 'Se você recebeu isso, as notificações estão funcionando neste dispositivo.',
          url: '/my-tasks',
          requireInteraction: true,
          // Cria notificação no sininho (o push é disparado automaticamente pelo backend ao inserir)
          createInApp: true,
          inAppType: 'test',
          inAppLink: '/my-tasks',
          inAppData: { url: '/my-tasks', source: 'test' },
        },
      });

      if (error) throw error;

      // Atualiza o sino imediatamente (sem depender de realtime)
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });

      toast.success('Notificação de teste enviada! Verifique o push e o sininho.');
    } catch (error: any) {
      console.error('Error sending test notification:', error);
      toast.error('Erro ao enviar notificação de teste');
    } finally {
      setTimeout(() => {
        sendingRef.current = false;
      }, 2000);
    }
  };

  const sendLocalTestNotification = async () => {
    if (!isSupported) {
      toast.error('Notificações push não são suportadas neste navegador');
      return;
    }

    if (Notification.permission !== 'granted') {
      toast.error('Permita notificações primeiro e tente novamente.');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;

      const options: NotificationOptions = {
        body: 'Se isso apareceu, o desktop consegue exibir notificações (o problema é a entrega do push).',
        icon: '/icon-192.png',
        badge: '/favicon.png',
        tag: `local-test-${Date.now()}`,
        data: { url: '/my-tasks' },
      };

      // Prefer: showNotification directly (lets us catch errors immediately)
      if (typeof registration.showNotification === 'function') {
        await registration.showNotification('✅ Teste local', options);
      } else {
        new Notification('✅ Teste local', options);
      }

      toast.success('Teste local disparado. Veja se apareceu uma notificação do sistema.');
    } catch (error: any) {
      console.error('Error sending local test notification:', error);
      toast.error(`Não foi possível disparar o teste local${error?.message ? `: ${error.message}` : ''}`);
    }
  };

  return {
    permission,
    isInitialized,
    isSubscribed,
    isLoading,
    isSupported,
    localEndpoint,
    subscribe,
    unsubscribe,
    sendTestNotification,
    sendLocalTestNotification,
    // kept for compatibility (some parts of the app may rely on this)
    queryClient,
  };
}
