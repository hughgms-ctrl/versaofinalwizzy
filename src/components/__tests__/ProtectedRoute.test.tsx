import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { id: 'plan-1', status: 'paid', payment_status: 'paid', trial_ends_at: null },
    isLoading: false,
    error: null,
  }),
}));

const mockUseWorkspaceContext = vi.fn(() => ({
  selectedOrganization: null,
  selectedOrganizationId: null,
  availableWorkspaces: [],
  currentOrganizationRole: null,
  hasExternalOrganizationMembership: false,
  loading: false,
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspaceContext: () => mockUseWorkspaceContext(),
}));

vi.mock('@/hooks/useOrganizationPlan', () => ({
  useOrganizationPlan: () => ({
    canAccessModule: () => true,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useUserPermissions', () => ({
  useCurrentUserRole: () => ({ data: 'owner', isLoading: false }),
  useUserPermissions: () => ({ data: null, isLoading: false }),
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
  useLocation: () => ({ pathname: '/dashboard', search: '', hash: '', state: null, key: 'test' }),
}));

// Import after mocks
import { ProtectedRoute } from '../ProtectedRoute';

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockUseWorkspaceContext.mockReturnValue({
      selectedOrganization: null,
      selectedOrganizationId: null,
      availableWorkspaces: [],
      currentOrganizationRole: null,
      hasExternalOrganizationMembership: false,
      loading: false,
    });
  });

  it('shows loading when auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    render(<ProtectedRoute><div>Protected</div></ProtectedRoute>);
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('redirects to /auth when not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    render(<ProtectedRoute><div>Protected</div></ProtectedRoute>);
    const nav = screen.getByTestId('navigate');
    expect(nav).toHaveAttribute('data-to', '/auth');
  });

  it('renders children when authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1' },
      profile: { organization_id: null },
      loading: false,
    });
    render(<ProtectedRoute><div>Protected</div></ProtectedRoute>);
    expect(screen.getByText('Protected')).toBeInTheDocument();
  });

  it('shows admin contact message for external member without workspace', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1' },
      profile: { organization_id: 'own-org' },
      loading: false,
    });
    mockUseWorkspaceContext.mockReturnValue({
      selectedOrganization: { name: 'Cliente CIPA' },
      selectedOrganizationId: 'client-org',
      availableWorkspaces: [],
      currentOrganizationRole: 'agent',
      hasExternalOrganizationMembership: true,
      loading: false,
    });

    render(<ProtectedRoute><div>Protected</div></ProtectedRoute>);

    expect(screen.getByText('Nenhum workspace liberado')).toBeInTheDocument();
    expect(screen.getByText(/Faca contato com o administrador/)).toBeInTheDocument();
  });
});
