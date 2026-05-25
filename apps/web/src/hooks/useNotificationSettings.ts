import { useState, useEffect, useCallback } from 'react';

const NOTIFICATION_SETTINGS_KEY = 'wizzy_notification_settings';

export interface NotificationSettings {
  soundEnabled: boolean;
  newMessageEnabled: boolean;
}

const defaultSettings: NotificationSettings = {
  soundEnabled: true,
  newMessageEnabled: true,
};

export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);

  useEffect(() => {
    const stored = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (stored) {
      try {
        setSettings(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse notification settings:', e);
      }
    }
  }, []);

  const updateSettings = useCallback((newSettings: Partial<NotificationSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return { settings, updateSettings };
}
