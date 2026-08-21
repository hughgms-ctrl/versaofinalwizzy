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

const mockUseOrganizationPlan = vi.fn(() => ({
  canAccessModule: (_module: string): boolean => true,
  isLoading: false,
  checkFailed: false,
  checkError: null as string | null,
}));
vi.mock('@/hooks/useOrganizationPlan', () => ({
  useOrganizationPlan: () => mockUseOrganizationPlan(),
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
    mockUseOrganizationPlan.mockReturnValue({
      canAccessModule: () => true,
      isLoading: false,
      checkFailed: false,
      checkError: null,
    });
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

  it('manda para /plans quando o modulo nao esta no plano', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1' },
      profile: { organization_id: 'org-1' },
      loading: false,
    });
    mockUseOrganizationPlan.mockReturnValue({
      canAccessModule: () => false,
      isLoading: false,
      checkFailed: false,
      checkError: null,
    });

    render(<ProtectedRoute><div>Protected</div></ProtectedRoute>);

    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/plans');
  });

  // Uma falha em PERGUNTAR nao pode virar bloqueio. Quando a edge
  // `organization-usage` responde erro, allowedModules vem vazio e
  // canAccessModule() diz false para tudo -- sem este caso, a pessoa com plano
  // ativo fica presa num vaivem para /plans em toda rota.
  it('nao manda para /plans quando a CHECAGEM de modulo falhou', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockUseAuth.mockReturnValue({
      user: { id: '1' },
      profile: { organization_id: 'org-1' },
      loading: false,
    });
    mockUseOrganizationPlan.mockReturnValue({
      canAccessModule: () => false,
      isLoading: false,
      checkFailed: true,
      checkError: 'Edge Function returned a non-2xx status code',
    });

    render(<ProtectedRoute><div>Protected</div></ProtectedRoute>);

    expect(screen.getByText('Protected')).toBeInTheDocument();
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
    warn.mockRestore();
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
