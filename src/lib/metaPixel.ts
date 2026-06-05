type MetaPixelEventParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    fbq?: {
      (command: 'init', pixelId: string): void;
      (command: 'track', eventName: string, params?: MetaPixelEventParams): void;
      (command: 'trackCustom', eventName: string, params?: MetaPixelEventParams): void;
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
      callMethod?: (...args: unknown[]) => void;
      push?: (...args: unknown[]) => void;
    };
    _fbq?: Window['fbq'];
  }
}

export type MetaPixelSettings = {
  enabled?: boolean;
  pixel_id?: string;
  advanced_matching_enabled?: boolean;
  test_event_code?: string;
};

const PIXEL_SCRIPT_ID = 'meta-pixel-script';
let initializedPixelId: string | null = null;
const pendingEvents: Array<{ custom: boolean; eventName: string; params?: MetaPixelEventParams }> = [];

export function normalizePixelId(pixelId?: string | null) {
  return String(pixelId || '').replace(/\D/g, '');
}

export function loadMetaPixel(settings?: MetaPixelSettings | null) {
  const pixelId = normalizePixelId(settings?.pixel_id);
  if (!settings?.enabled || !pixelId || typeof window === 'undefined') return false;

  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) {
        fbq.callMethod(...args);
      } else {
        fbq.queue?.push(args);
      }
    } as NonNullable<Window['fbq']>;

    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = '2.0';
    window.fbq = fbq;
    window._fbq = fbq;
  }

  if (!document.getElementById(PIXEL_SCRIPT_ID)) {
    const script = document.createElement('script');
    script.id = PIXEL_SCRIPT_ID;
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }

  if (initializedPixelId !== pixelId) {
    window.fbq('init', pixelId);
    initializedPixelId = pixelId;
  }

  while (pendingEvents.length > 0) {
    const event = pendingEvents.shift();
    if (!event) continue;
    if (event.custom) {
      window.fbq('trackCustom', event.eventName, cleanParams(event.params));
    } else {
      window.fbq('track', event.eventName, cleanParams(event.params));
    }
  }

  return true;
}

export function trackMetaEvent(eventName: string, params?: MetaPixelEventParams) {
  if (typeof window === 'undefined') return;
  if (!window.fbq || !initializedPixelId) {
    pendingEvents.push({ custom: false, eventName, params });
    return;
  }
  window.fbq('track', eventName, cleanParams(params));
}

export function trackMetaCustomEvent(eventName: string, params?: MetaPixelEventParams) {
  if (typeof window === 'undefined') return;
  if (!window.fbq || !initializedPixelId) {
    pendingEvents.push({ custom: true, eventName, params });
    return;
  }
  window.fbq('trackCustom', eventName, cleanParams(params));
}

function cleanParams(params?: MetaPixelEventParams) {
  if (!params) return undefined;
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null));
}
