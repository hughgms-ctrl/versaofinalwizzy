import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/fluzz/integrations/supabase/client';
import { useAuth } from '@/fluzz/contexts/AuthContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const { user } = useAuth();

  const getStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;

  const getPlatform = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    const android = /android/.test(userAgent);
    return { ios, android };
  };

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    try {
      return getStandalone();
    } catch {
      return false;
    }
  });
  const initialPlatform = (() => {
    try {
      return getPlatform();
    } catch {
      return { ios: false, android: false };
    }
  })();
  const [isIOS, setIsIOS] = useState(initialPlatform.ios);
  const [isAndroid, setIsAndroid] = useState(initialPlatform.android);
  const [isInitialized, setIsInitialized] = useState(false);
  // Save installation to database
  const saveInstallation = useCallback(async () => {
    if (!user) return;

    try {
      const deviceInfo = `${navigator.userAgent.substring(0, 100)}`;
      
      // Check if record exists
      const { data: existing } = await supabase
        .from('pwa_installations')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        // Update existing record
        await supabase
          .from('pwa_installations')
          .update({
            installed_at: new Date().toISOString(),
            device_info: deviceInfo
          })
          .eq('user_id', user.id);
      } else {
        // Insert new record
        await supabase
          .from('pwa_installations')
          .insert({
            user_id: user.id,
            installed_at: new Date().toISOString(),
            device_info: deviceInfo
          });
      }

      console.log('[PWA] Installation saved to database');
    } catch (error) {
      console.error('[PWA] Error saving installation:', error);
    }
  }, [user]);

  useEffect(() => {
    setIsInitialized(false);

    // Check if already installed (standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    // If installed and user is logged in, save to database
    if (isStandalone && user) {
      saveInstallation();
    }

    // Detect platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    const isAndroidDevice = /android/.test(userAgent);

    setIsIOS(isIOSDevice);
    setIsAndroid(isAndroidDevice);

    // iOS doesn't support beforeinstallprompt, but can still be installed via Safari
    if (isIOSDevice && !isStandalone) {
      setIsInstallable(true);
    }

    // Listen for the beforeinstallprompt event (Android/Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);

      // Save to database when installed
      if (user) {
        saveInstallation();
      }
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    setIsInitialized(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [user, saveInstallation]);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setIsInstallable(false);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error installing PWA:', error);
      return false;
    }
  };

  return {
    isInstallable,
    isInstalled,
    isIOS,
    isAndroid,
    isInitialized,
    canShowPrompt: !!deferredPrompt,
    install
  };
}
