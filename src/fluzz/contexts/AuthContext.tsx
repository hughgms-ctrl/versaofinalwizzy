import { useAuth as useWizzyAuth } from '@/hooks/useAuth';

export const AuthProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export const useAuth = () => {
  const auth = useWizzyAuth();

  return {
    user: auth.user,
    session: auth.session,
    loading: auth.loading,
    signUp: async () => undefined,
    signIn: async () => undefined,
    signOut: auth.signOut,
    resetPassword: async () => undefined,
    updatePassword: async () => undefined,
  };
};
