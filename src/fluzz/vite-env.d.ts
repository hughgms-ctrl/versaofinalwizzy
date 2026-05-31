/// <reference types="vite/client" />

interface ServiceWorkerRegistration {
  readonly pushManager: PushManager;
}

interface PushManager {
  getSubscription(): Promise<PushSubscription | null>;
  subscribe(options?: PushSubscriptionOptionsInit): Promise<PushSubscription>;
  permissionState(options?: PushSubscriptionOptionsInit): Promise<PushPermissionState>;
}

type PushPermissionState = 'denied' | 'granted' | 'prompt';

interface PushSubscriptionOptionsInit {
  applicationServerKey?: BufferSource | string | null;
  userVisibleOnly?: boolean;
}

interface PushSubscription {
  readonly endpoint: string;
  readonly options: PushSubscriptionOptionsInit;
  getKey(name: PushEncryptionKeyName): ArrayBuffer | null;
  toJSON(): PushSubscriptionJSON;
  unsubscribe(): Promise<boolean>;
}

type PushEncryptionKeyName = 'auth' | 'p256dh';

interface PushSubscriptionJSON {
  endpoint?: string;
  keys?: Record<string, string>;
}
/// <reference types="vite-plugin-pwa/client" />

declare module 'virtual:pwa-register' {
  export type RegisterSWOptions = {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration?: ServiceWorkerRegistration) => void;
    onRegisterError?: (error: unknown) => void;
  };

  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => void;
}

