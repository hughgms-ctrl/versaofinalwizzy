import { useState, useEffect, useCallback } from 'react';

const SIGNATURE_KEY = 'chat_signature_enabled';
const SIGNATURE_DEFAULT_KEY = 'chat_signature_default';

export function useSignatureSettings() {
  // Get the global default from localStorage
  const [signatureDefault, setSignatureDefault] = useState(() => {
    const stored = localStorage.getItem(SIGNATURE_DEFAULT_KEY);
    return stored !== null ? stored === 'true' : true; // Default is enabled
  });

  // Get the current session value (can be toggled per-session)
  const [signatureEnabled, setSignatureEnabled] = useState(() => {
    const sessionStored = sessionStorage.getItem(SIGNATURE_KEY);
    if (sessionStored !== null) {
      return sessionStored === 'true';
    }
    // Fall back to the global default
    const stored = localStorage.getItem(SIGNATURE_DEFAULT_KEY);
    return stored !== null ? stored === 'true' : true;
  });

  // Update the global default (saved in localStorage)
  const updateDefaultSignature = useCallback((enabled: boolean) => {
    localStorage.setItem(SIGNATURE_DEFAULT_KEY, String(enabled));
    setSignatureDefault(enabled);
  }, []);

  // Toggle signature for the current session
  const toggleSignature = useCallback((enabled: boolean) => {
    sessionStorage.setItem(SIGNATURE_KEY, String(enabled));
    setSignatureEnabled(enabled);
  }, []);

  // Reset session to default
  const resetToDefault = useCallback(() => {
    sessionStorage.removeItem(SIGNATURE_KEY);
    setSignatureEnabled(signatureDefault);
  }, [signatureDefault]);

  return {
    signatureEnabled,
    signatureDefault,
    toggleSignature,
    updateDefaultSignature,
    resetToDefault,
  };
}
