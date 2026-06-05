import { useAuth as useWizzyAuth } from '@/hooks/useAuth';

export const AuthProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export const useAuth = () => {
  const auth = useWizzyAuth();

  return {
    user: auth.user,
    session: auth.session,
    loading: auth.loading,
    signUp: async (..._args: any[]) => undefined,
    signIn: async (..._args: any[]) => undefined,
    signOut: auth.signOut,
    resetPassword: async (..._args: any[]) => undefined,
    updatePassword: async (..._args: any[]) => undefined,
  };
};
