import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import * as useAuthModule from './hooks/useAuth';

vi.mock('./hooks/useAuth');
vi.mock('./shell/AuthenticatedRoot', () => ({
  AuthenticatedRoot: () => <div data-testid="authenticated-root">App content</div>,
}));

describe('App', () => {
  const mockUseAuth = vi.mocked(useAuthModule.useAuth);
  const assignSpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, assign: assignSpy, href: 'https://goodroots.network/' },
    });

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('shows loading state while checking authentication', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
      error: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
      clearError: vi.fn(),
      refreshAuth: vi.fn(),
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('redirects to foundation login when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      error: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
      clearError: vi.fn(),
      refreshAuth: vi.fn(),
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(assignSpy).toHaveBeenCalledTimes(1);
    const redirectUrl = assignSpy.mock.calls[0][0] as string;
    expect(redirectUrl).toContain('/login');
    expect(redirectUrl).toContain('redirect=');
    expect(redirectUrl).toContain(encodeURIComponent('https://goodroots.network/'));
  });

  it('renders the authenticated root when authenticated', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { userId: '123', username: 'test@example.com' },
      error: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
      clearError: vi.fn(),
      refreshAuth: vi.fn(),
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('authenticated-root')).toBeInTheDocument();
    expect(assignSpy).not.toHaveBeenCalled();
  });
});
