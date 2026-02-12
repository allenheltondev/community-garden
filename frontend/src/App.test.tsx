import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import * as useAuthModule from './hooks/useAuth';

vi.mock('./hooks/useAuth');
vi.mock('./components/Profile/ProfileView', () => ({
  ProfileView: () => <div>Profile View</div>,
}));

describe('App', () => {
  const mockUseAuth = vi.mocked(useAuthModule.useAuth);

  beforeEach(() => {
    vi.clearAllMocks();
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

    render(<App />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows login page when not authenticated', () => {
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

    render(<App />);

    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('shows profile view when authenticated', () => {
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

    render(<App />);

    expect(screen.getByText(/profile view/i)).toBeInTheDocument();
  });

  it('navigates to signup page', async () => {
    const user = userEvent.setup();
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

    render(<App />);

    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(screen.getByText(/create account/i)).toBeInTheDocument();
  });

  it('navigates to forgot password page', async () => {
    const user = userEvent.setup();
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

    render(<App />);

    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /forgot your password/i }));

    expect(screen.getByText(/reset password/i)).toBeInTheDocument();
  });

  it('navigates back to login from signup', async () => {
    const user = userEvent.setup();
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

    render(<App />);

    // Navigate to signup
    await user.click(screen.getByRole('button', { name: /sign up/i }));
    expect(screen.getByText(/create account/i)).toBeInTheDocument();

    // Navigate back to login
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
  });

  it('navigates back to login from forgot password', async () => {
    const user = userEvent.setup();
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

    render(<App />);

    // Navigate to forgot password
    await user.click(screen.getByRole('button', { name: /forgot your password/i }));
    expect(screen.getByText(/reset password/i)).toBeInTheDocument();

    // Navigate back to login
    await user.click(screen.getByRole('button', { name: /back to login/i }));
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
  });

  it('prevents access to protected content when not authenticated', () => {
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

    render(<App />);

    // Should show login page, not profile
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    expect(screen.queryByText(/profile view/i)).not.toBeInTheDocument();
  });

  it('transitions from unauthenticated to authenticated', () => {
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

    const { rerender } = render(<App />);

    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();

    // Simulate successful authentication
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

    rerender(<App />);

    expect(screen.queryByText(/welcome back/i)).not.toBeInTheDocument();
    expect(screen.getByText(/profile view/i)).toBeInTheDocument();
  });
});
