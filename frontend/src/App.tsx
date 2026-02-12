import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { LoginPage } from './pages/LoginPage'
import { SignUpPage } from './pages/SignUpPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ProfileView } from './components/Profile/ProfileView'
import './App.css'

type AuthView = 'login' | 'signup' | 'forgot-password';

/**
 * Main App Component
 *
 * Handles authentication state and routing between auth pages and authenticated views.
 * For Phase 0, this provides a simple authentication gate with multiple auth flows.
 */
function App() {
  const { isAuthenticated, isLoading, refreshAuth } = useAuth()
  const [authView, setAuthView] = useState<AuthView>('login')

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Show auth pages if not authenticated
  if (!isAuthenticated) {
    if (authView === 'signup') {
      return (
        <SignUpPage
          onSuccess={() => setAuthView('login')}
          onNavigateToLogin={() => setAuthView('login')}
        />
      )
    }

    if (authView === 'forgot-password') {
      return (
        <ForgotPasswordPage
          onSuccess={() => setAuthView('login')}
          onNavigateToLogin={() => setAuthView('login')}
        />
      )
    }

    return (
      <LoginPage
        onSuccess={() => {
          // Refresh auth state after successful sign-in
          refreshAuth();
        }}
        onNavigateToSignUp={() => setAuthView('signup')}
        onNavigateToForgotPassword={() => setAuthView('forgot-password')}
      />
    )
  }

  // Show authenticated view with ProfileView component
  return <ProfileView />
}

export default App
