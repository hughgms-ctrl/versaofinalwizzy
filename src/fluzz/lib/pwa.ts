import { registerSW } from 'virtual:pwa-register';

let updateServiceWorker: ((reloadPage?: boolean) => void) | null = null;

export function initPWA() {
  try {
    updateServiceWorker = registerSW({
      immediate: true,
      onRegistered(r) {
        // Best-effort: check for updates right after registering
        r?.update();
      },
      onRegisterError(error) {
        console.warn('[PWA] SW register error', error);
      },
    });
  } catch (error) {
    // In dev or in environments where SW is unavailable.
    console.warn('[PWA] init skipped', error);
  }
}

export async function refreshApp() {
  try {
    updateServiceWorker?.(true);
    return;
  } catch (error) {
    console.warn('[PWA] update failed, reloading', error);
  }

  window.location.reload();
}
