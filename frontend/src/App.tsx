import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { LoginPage } from './pages/LoginPage'
import { SignUpPage } from './pages/SignUpPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ProfileView } from './components/Profile/ProfileView'
import { PlantLoader } from './components/branding/PlantLoader'
import { OnboardingGuard } from './components/Onboarding/OnboardingGuard'
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
          <PlantLoader size="md" />
          <p className="text-gray-600 mt-4">Loading...</p>
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

  // Show authenticated view with ProfileView component wrapped in OnboardingGuard
  return (
    <OnboardingGuard>
      <ProfileView />
    </OnboardingGuard>
  )
}export default App
