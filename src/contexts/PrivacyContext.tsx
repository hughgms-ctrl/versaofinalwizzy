import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

interface PrivacyContextType {
  privacyMode: boolean;
  togglePrivacy: () => void;
}

const PrivacyContext = createContext<PrivacyContextType>({
  privacyMode: false,
  togglePrivacy: () => {},
});

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [privacyMode, setPrivacyMode] = useState(() => {
    return localStorage.getItem('privacy-mode') === 'true';
  });

  useEffect(() => {
    document.body.classList.toggle('privacy-mode', privacyMode);
    localStorage.setItem('privacy-mode', String(privacyMode));
  }, [privacyMode]);

  const togglePrivacy = useCallback(() => {
    setPrivacyMode(prev => !prev);
  }, []);

  return (
    <PrivacyContext.Provider value={{ privacyMode, togglePrivacy }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export const usePrivacy = () => useContext(PrivacyContext);
