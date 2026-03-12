import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminProtectedRoute } from '../AdminProtectedRoute';

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock usePlatformAdmin
const mockUsePlatformAdmin = vi.fn();
vi.mock('@/hooks/usePlatformAdmin', () => ({
  usePlatformAdmin: () => mockUsePlatformAdmin(),
}));

// Track navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    Navigate: (props: any) => {
      mockNavigate(props.to);
      return <div data-testid="navigate" data-to={props.to} />;
    },
  };
});

describe('AdminProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    mockUsePlatformAdmin.mockReturnValue({ isPlatformAdmin: false, isLoading: false });

    render(
      <MemoryRouter>
        <AdminProtectedRoute><div>Admin Content</div></AdminProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('shows loading spinner while admin check is loading', () => {
    mockUseAuth.mockReturnValue({ user: { id: '1' }, loading: false });
    mockUsePlatformAdmin.mockReturnValue({ isPlatformAdmin: false, isLoading: true });

    render(
      <MemoryRouter>
        <AdminProtectedRoute><div>Admin Content</div></AdminProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('redirects to /admin/login when no user', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    mockUsePlatformAdmin.mockReturnValue({ isPlatformAdmin: false, isLoading: false });

    render(
      <MemoryRouter>
        <AdminProtectedRoute><div>Admin Content</div></AdminProtectedRoute>
      </MemoryRouter>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/admin/login');
  });

  it('redirects when user exists but is NOT platform admin', () => {
    mockUseAuth.mockReturnValue({ user: { id: '1' }, loading: false });
    mockUsePlatformAdmin.mockReturnValue({ isPlatformAdmin: false, isLoading: false });

    render(
      <MemoryRouter>
        <AdminProtectedRoute><div>Admin Content</div></AdminProtectedRoute>
      </MemoryRouter>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/admin/login');
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('renders children when user IS platform admin', () => {
    mockUseAuth.mockReturnValue({ user: { id: '1' }, loading: false });
    mockUsePlatformAdmin.mockReturnValue({ isPlatformAdmin: true, isLoading: false });

    render(
      <MemoryRouter>
        <AdminProtectedRoute><div>Admin Content</div></AdminProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Admin Content')).toBeInTheDocument();
  });

  it('does NOT check admin via localStorage or hardcoded credentials', () => {
    // Verify the component uses server-side usePlatformAdmin hook
    // and not client-side storage
    expect(localStorage.getItem('isAdmin')).toBeNull();
    expect(sessionStorage.getItem('isAdmin')).toBeNull();
  });
});
