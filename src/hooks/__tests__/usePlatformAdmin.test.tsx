import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-123' } }),
}));

// Mock supabase
const mockRpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

import { usePlatformAdmin } from '../usePlatformAdmin';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('usePlatformAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls server-side RPC to check admin status', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    const { result } = renderHook(() => usePlatformAdmin(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockRpc).toHaveBeenCalledWith('is_platform_admin', {
      _user_id: 'user-123',
    });
    expect(result.current.isPlatformAdmin).toBe(true);
  });

  it('returns false when RPC returns false', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    const { result } = renderHook(() => usePlatformAdmin(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isPlatformAdmin).toBe(false);
  });

  it('returns false on RPC error (fails closed)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('DB error') });

    const { result } = renderHook(() => usePlatformAdmin(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isPlatformAdmin).toBe(false);
  });

  it('never reads admin status from localStorage', () => {
    localStorage.setItem('isAdmin', 'true');
    localStorage.setItem('isPlatformAdmin', 'true');

    // The hook should NOT use these values
    mockRpc.mockResolvedValue({ data: false, error: null });

    const { result } = renderHook(() => usePlatformAdmin(), {
      wrapper: createWrapper(),
    });

    // Even though localStorage says admin, the hook should return false
    waitFor(() => {
      expect(result.current.isPlatformAdmin).toBe(false);
    });

    localStorage.removeItem('isAdmin');
    localStorage.removeItem('isPlatformAdmin');
  });
});
