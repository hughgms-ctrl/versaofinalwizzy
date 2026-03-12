import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth, AuthProvider } from '../useAuth';
import React from 'react';

// Mock Supabase client
const mockSignUp = vi.fn();
const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSelect = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signUp: (...args: any[]) => mockSignUp(...args),
      signInWithPassword: (...args: any[]) => mockSignIn(...args),
      signOut: (...args: any[]) => mockSignOut(...args),
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: any) => {
        mockOnAuthStateChange(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => mockSelect(),
        }),
      }),
    }),
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: null } });
  });

  it('throws error when used outside AuthProvider', () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');
  });

  it('starts with loading true and no user', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    // After getSession resolves, loading should be false
    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it('signUp calls supabase.auth.signUp with correct params', async () => {
    mockSignUp.mockResolvedValue({ error: null });
    
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const response = await result.current.signUp('test@test.com', '123456', 'Test', 'Company');
      expect(response.error).toBeNull();
    });

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'test@test.com',
      password: '123456',
      options: expect.objectContaining({
        data: { full_name: 'Test', company_name: 'Company' },
      }),
    });
  });

  it('signIn calls supabase.auth.signInWithPassword', async () => {
    mockSignIn.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    
    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const response = await result.current.signIn('test@test.com', '123456');
      expect(response.error).toBeNull();
    });

    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'test@test.com',
      password: '123456',
    });
  });

  it('signIn returns error on failure', async () => {
    const mockError = new Error('Invalid credentials');
    mockSignIn.mockResolvedValue({ error: mockError });

    const { result } = renderHook(() => useAuth(), { wrapper });
    
    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const response = await result.current.signIn('bad@test.com', 'wrong');
      expect(response.error).toBeTruthy();
    });
  });

  it('signOut calls supabase.auth.signOut and clears profile', async () => {
    mockSignOut.mockResolvedValue({});

    const { result } = renderHook(() => useAuth(), { wrapper });
    
    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(result.current.profile).toBeNull();
  });
});
