const PUBLIC_APP_ORIGIN = 'https://wizzybr.com';

export function getPublicAppOrigin() {
  if (typeof window === 'undefined') {
    return PUBLIC_APP_ORIGIN;
  }

  const hostname = window.location.hostname;
  const isInternalHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('preview') ||
    hostname.includes('lovableproject.com') ||
    hostname.includes('lovable.app');

  return isInternalHost ? PUBLIC_APP_ORIGIN : window.location.origin;
}

