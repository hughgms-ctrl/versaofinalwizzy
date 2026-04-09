export function getPublicAppOrigin() {
  if (typeof window === 'undefined') {
    return 'https://wizzyai.lovable.app';
  }

  const hostname = window.location.hostname;
  const isPreviewHost =
    hostname.includes('preview') ||
    hostname.includes('lovableproject.com') ||
    hostname.includes('lovable.app');

  return isPreviewHost ? 'https://wizzyai.lovable.app' : window.location.origin;
}
