import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
}));

// Import after mocks
import { ProtectedRoute } from '../ProtectedRoute';

describe('ProtectedRoute', () => {
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
    mockUseAuth.mockReturnValue({ user: { id: '1' }, loading: false });
    render(<ProtectedRoute><div>Protected</div></ProtectedRoute>);
    expect(screen.getByText('Protected')).toBeInTheDocument();
  });
});
