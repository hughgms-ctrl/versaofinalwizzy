import React, { useState, useEffect, createContext, useContext, ReactNode, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getPublicAppOrigin } from '@/lib/publicOrigin';
import { User, Session } from '@supabase/supabase-js';

interface Profile {
  id: string;
  user_id: string;
  organization_id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, companyName: string, timezone?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  verifyRecoveryToken: (tokenHash: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const trackFingerprint = useCallback(async () => {
    try {
      const browserData = {
        screen_resolution: `${window.screen.width}x${window.screen.height}`,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        platform: (navigator as any).platform,
        hardware_concurrency: navigator.hardwareConcurrency,
      };

      await supabase.functions.invoke('track-fingerprint', {
        body: { browser_data: browserData }
      });
    } catch (err) {
      console.error('Error tracking fingerprint:', err);
    }
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (!error && data && data.user_id === userId) {
      setProfile(data as Profile);
      // Track fingerprint after profile is loaded (so we have org context)
      trackFingerprint();
    }
  }, [trackFingerprint]);

  const isPendingApproval = (u: User | null) => {
    if (!u) return false;
    const appMeta = (u.app_metadata || {}) as Record<string, unknown>;
    const userMeta = (u.user_metadata || {}) as Record<string, unknown>;
    return appMeta.pending_approval === true || userMeta.pending_approval === true;
  };

  const clearWorkspaceSelection = useCallback(() => {
    localStorage.removeItem('selectedOrganizationId');
    localStorage.removeItem('selectedWorkspaceId');
  }, []);

  useEffect(() => {
    // Set up auth state listener BEFORE checking session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && isPendingApproval(session.user)) {
        // Block pending-approval users immediately
        supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        clearWorkspaceSelection();
        queryClient.clear();
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setProfile((current) => current?.user_id === session.user.id ? current : null);
        // Fetch profile after auth state change
        setTimeout(() => fetchProfile(session.user.id), 100);
      } else {
        setProfile(null);
        clearWorkspaceSelection();
        queryClient.clear();
      }
      setLoading(false);
    });

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && isPendingApproval(session.user)) {
        supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        clearWorkspaceSelection();
        queryClient.clear();
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setProfile((current) => current?.user_id === session.user.id ? current : null);
        fetchProfile(session.user.id);
      } else {
        clearWorkspaceSelection();
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [clearWorkspaceSelection, fetchProfile, queryClient]);

  const signUp = async (email: string, password: string, fullName: string, companyName: string, timezone?: string) => {
    try {
      const publicOrigin = getPublicAppOrigin();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${publicOrigin}/auth`,
          data: {
            full_name: fullName,
            company_name: companyName,
            timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
          },
        },
      });
      return { error: error as Error | null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error: error as Error };

      if (data?.user && isPendingApproval(data.user)) {
        await supabase.auth.signOut();
        return { error: new Error('Sua conta está em verificação. Aguarde alguns instantes e tente novamente em breve.') };
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signInWithGoogle = async () => {
    try {
      const publicOrigin = getPublicAppOrigin();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${publicOrigin}/auth`,
        },
      });

      return { error: error as Error | null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const publicOrigin = getPublicAppOrigin();
      const { error } = await supabase.functions.invoke('auth-password-recovery', {
        body: {
          email,
          redirectTo: `${publicOrigin}/auth?mode=reset`,
        },
      });

      return { error: error as Error | null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const verifyRecoveryToken = async (tokenHash: string) => {
    try {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      });

      return { error: error as Error | null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const updatePassword = async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      return { error: error as Error | null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    setProfile(null);
    setUser(null);
    setSession(null);
    clearWorkspaceSelection();
    queryClient.clear();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signUp, signIn, signInWithGoogle, resetPassword, verifyRecoveryToken, updatePassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
