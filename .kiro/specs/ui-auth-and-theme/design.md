# Design Document: Authentication Flows and UI Theme System

## Overview

This design establishes custom authentication UI pages integrated with AWS Cognito via AWS Amplify Auth, and defines a global semi-flat/flat 2.0 design theme system for the community food coordination platform. The authentication system provides sign up, login, and password reset flows with custom branded UI pages. The theme system provides design tokens and styling primitives that balance the cleanliness of flat design with subtle depth cues for a modern, polished user experience.

### Decisions and Non-Goals

- Authentication is implemented with AWS Amplify Auth against Cognito User Pools
- Cognito Hosted UI is not used; all flows are rendered as custom React pages
- MFA is out of scope for V1
- No Backend-for-Frontend (BFF) is used; this is a pure SPA integration
- Supported auth method in V1: email + password only

## Architecture

### High-Level Component Structure

```
frontend/
├── src/
│   ├── theme/
│   │   ├── tokens.ts          # Design token definitions
│   │   ├── theme.css          # CSS custom properties
│   │   └── index.ts           # Theme exports
│   ├── components/
│   │   ├── auth/
│   │   │   ├── SignUpForm.tsx
│   │   │   ├── LoginForm.tsx
│   │   │   ├── ForgotPasswordForm.tsx
│   │   │   ├── VerifyEmailForm.tsx
│   │   │   └── AuthLayout.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Card.tsx
│   │       └── FormField.tsx
│   ├── pages/
│   │   ├── SignUpPage.tsx
│   │   ├── LoginPage.tsx
│   │   └── ForgotPasswordPage.tsx
│   ├── hooks/
│   │   └── useAuth.ts         # Already exists
│   └── config/
│       └── amplify.ts         # Amplify configuration
```

### Technology Stack

- React 19.2 with TypeScript
- AWS Amplify Auth 6.16 for Cognito integration
- AWS Cognito User Pool (backend identity store)
- Tailwind CSS 4.1 for styling
- Vite for build tooling
- React Hook Form for form management

### Routing and Protected Views

**Protected Route Strategy:**
- Add a protected route wrapper component (e.g., `<RequireAuth/>`) that blocks protected pages until auth state is resolved
- Redirect unauthenticated users to `/login` with a return-to parameter
- If a user is authenticated, redirect away from auth pages to the main app view
- On app startup and route changes into protected routes, check auth state before rendering

**Route Structure:**
```
/login          - Login page (public)
/signup         - Sign up page (public)
/forgot-password - Password reset page (public)
/verify-email   - Email verification page (public)
/               - Main app (protected)
/*              - Other app routes (protected)
```


## Components and Interfaces

### Theme System

#### Design Tokens

Design tokens are the atomic design decisions that define the visual language. They are implemented as TypeScript constants and CSS custom properties.

**Color Tokens:**
```typescript
export const colors = {
  // Primary palette - warm, inviting earth tones
  primary: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',  // Main brand color
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },
  // Neutral palette with subtle warmth
  neutral: {
    50: '#fafaf9',
    100: '#f5f5f4',
    200: '#e7e5e4',
    300: '#d6d3d1',
    400: '#a8a29e',
    500: '#78716c',
    600: '#57534e',
    700: '#44403c',
    800: '#292524',
    900: '#1c1917',
  },
  // Semantic colors
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
}
```

**Typography Tokens:**
```typescript
export const typography = {
  fontFamily: {
    sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem',// 30px
    '4xl': '2.25rem', // 36px
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
}
```


**Spacing Tokens:**
```typescript
export const spacing = {
  0: '0',
  1: '0.25rem',   // 4px
  2: '0.5rem',    // 8px
  3: '0.75rem',   // 12px
  4: '1rem',      // 16px
  5: '1.25rem',   // 20px
  6: '1.5rem',    // 24px
  8: '2rem',      // 32px
  10: '2.5rem',   // 40px
  12: '3rem',     // 48px
  16: '4rem',     // 64px
  20: '5rem',     // 80px
  24: '6rem',     // 96px
}
```

**Shadow Tokens (Semi-Flat Design):**
```typescript
export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
}
```

**Border Radius Tokens:**
```typescript
export const borderRadius = {
  none: '0',
  sm: '0.25rem',   // 4px
  base: '0.5rem',  // 8px
  md: '0.75rem',   // 12px
  lg: '1rem',      // 16px
  xl: '1.5rem',    // 24px
  full: '9999px',  // Fully rounded
}
```

**Animation Tokens:**
```typescript
export const animation = {
  duration: {
    fast: '150ms',
    base: '200ms',
    slow: '300ms',
  },
  easing: {
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
}
```

**Gradient Tokens (Semi-Flat Design):**
```typescript
export const gradients = {
  primary: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
  neutral: 'linear-gradient(135deg, #f5f5f4 0%, #e7e5e4 100%)',
  glass: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
}
```


#### Theme Integration with Tailwind CSS

The theme tokens are integrated into Tailwind CSS configuration to make them available throughout the application:

```typescript
// Tailwind configuration (ensure this matches Tailwind v4 configuration approach used in the repo)
export default {
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        neutral: colors.neutral,
        success: colors.success,
        warning: colors.warning,
        error: colors.error,
        info: colors.info,
      },
      boxShadow: shadows,
      borderRadius: borderRadius,
      transitionDuration: animation.duration,
      transitionTimingFunction: animation.easing,
    },
  },
}
```

### Authentication Components

#### Amplify Auth Configuration

```typescript
// config/amplify.ts
import { Amplify } from 'aws-amplify';

export interface AmplifyConfig {
  userPoolId: string;
  userPoolClientId: string;
  region: string;
}

export function configureAmplify(config: AmplifyConfig): void {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
        loginWith: {
          email: true,
        },
        signUpVerificationMethod: 'code', // email verification via code in V1
        userAttributes: {
          email: {
            required: true,
          },
        },
        passwordFormat: {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
          requireNumbers: true,
          requireSpecialCharacters: false,
        },
      },
    },
  });
}
```

Configuration is loaded from environment variables at application startup. The system fails fast with descriptive errors if required configuration is missing.


#### Sign Up Flow

**Component: SignUpForm**

```typescript
interface SignUpFormData {
  email: string;
  password: string;
  confirmPassword: string;
}

interface SignUpFormProps {
  onSuccess: () => void;
  onError: (error: Error) => void;
}
```

The sign up form collects email and password, validates input client-side, then calls Amplify Auth's `signUp` function. On success, it transitions to the email verification step.

**Validation Rules:**
- Email: Valid email format using a pragmatic validator suitable for UI
- Password: Minimum 8 characters, at least one uppercase, one lowercase, one number
- Confirm Password: Must match password field
- All fields required

**Flow:**
1. User enters email and password
2. Client-side validation runs on blur and submit
3. On submit, call `signUp` from Amplify Auth
4. Handle responses:
   - Success: Show verification prompt
   - Email exists: Show error "An account with this email already exists"
   - Invalid password: Show specific password requirements not met
   - Network error: Show "Unable to connect. Please check your connection."

#### Login Flow

**Component: LoginForm**

```typescript
interface LoginFormData {
  email: string;
  password: string;
}

interface LoginFormProps {
  onSuccess: () => void;
  onError: (error: Error) => void;
}
```

The login form authenticates users via Amplify Auth's `signIn` function. On success, it stores tokens and redirects to the main application.

**Flow:**
1. User enters email and password
2. On submit, call `signIn` from Amplify Auth
3. Handle responses:
   - Success: Redirect to main app
   - Unverified account: Show verification prompt with resend option
   - Invalid credentials: Show "Invalid email or password"
   - Network error: Show "Unable to connect. Please check your connection."

**Session Management:**
- Amplify Auth manages token persistence in browser storage according to the configured persistence mode
- Token refresh and session continuity are managed by Amplify Auth; when Amplify reports an invalid/expired session, the UI prompts for re-authentication
- Session restoration on page reload is automatic via Amplify Auth
- Cross-tab behavior: logging out in one tab should reflect in other tabs within a reasonable time (by listening to storage events or checking session state on focus)
- On app startup and on route change into protected routes, the app calls Amplify Auth session lookup and gates rendering until auth state is resolved


#### Password Reset Flow

**Component: ForgotPasswordForm**

```typescript
interface ForgotPasswordFormData {
  email: string;
}

interface ResetPasswordFormData {
  code: string;
  newPassword: string;
  confirmPassword: string;
}
```

The password reset flow is a two-step process: request code, then reset password.

**Flow:**
1. User enters email address
2. Call Amplify Auth password reset initiation
3. System sends verification code to email
4. User enters code and new password
5. Call Amplify Auth password reset confirmation
6. On success, redirect to login

**Security Considerations:**
- Do not reveal whether email exists in system
- Verification code expiration is controlled by Cognito configuration; the UI handles expired codes gracefully and provides a resend path
- After password reset, the user is required to re-authenticate
- Rate limiting is handled by Cognito

#### Email Verification

**Component: VerifyEmailForm**

```typescript
interface VerifyEmailFormData {
  code: string;
}

interface VerifyEmailFormProps {
  email: string;
  onSuccess: () => void;
  onResend: () => void;
}
```

**Flow:**
1. User receives verification code via email
2. User enters 6-digit code
3. Call `confirmSignUp` from Amplify Auth
4. Handle responses:
   - Success: Redirect to login
   - Invalid code: Show "Invalid verification code"
   - Expired code: Show "Code expired" with resend option
5. Provide "Resend code" button that calls `resendSignUpCode`

#### Auth Layout Component

**Component: AuthLayout**

Provides consistent layout for all authentication pages with theme styling.

```typescript
interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}
```

**Visual Design:**
- Centered card layout with semi-flat styling
- Subtle gradient background
- Card with shadow elevation (md)
- Rounded corners (lg)
- Responsive padding
- Logo/branding at top
- Form content in center
- Helper links at bottom


### UI Component Library

#### Button Component

**Component: Button**

```typescript
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'outline' | 'ghost';
  size: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}
```

**Styling:**
- Primary: Gradient background, white text, shadow on hover
- Secondary: Neutral background, dark text, subtle shadow
- Outline: Transparent background, border, no shadow
- Ghost: Transparent background, no border, hover background
- All variants have rounded corners (base) and smooth transitions
- Loading state shows spinner and disables interaction
- Focus state has visible outline for accessibility

#### Input Component

**Component: Input**

```typescript
interface InputProps {
  type: 'text' | 'email' | 'password';
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
}
```

**Styling:**
- Rounded corners (base)
- Subtle border with focus state
- Error state with red border and error message
- Label positioned above input
- Placeholder with reduced opacity
- Smooth transitions on state changes
- Password toggle button for password fields

#### Card Component

**Component: Card**

```typescript
interface CardProps {
  elevation?: 'sm' | 'base' | 'md' | 'lg';
  padding?: keyof typeof spacing;
  children: React.ReactNode;
  className?: string;
}
```

**Styling:**
- White/neutral background with subtle gradient
- Configurable shadow elevation
- Rounded corners (lg)
- Configurable padding
- Smooth hover transitions for interactive cards


#### FormField Component

**Component: FormField**

```typescript
interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  htmlFor?: string;
}
```

Wraps form inputs with consistent label, error message, and spacing.

## Data Models

### Authentication State

The authentication state is managed by the existing `useAuth` hook, which integrates with Amplify Auth:

```typescript
interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: Error | null;
}

interface AuthUser {
  userId: string;
  username: string;
  signInDetails?: {
    loginId?: string;
  };
}
```

### Form State

Forms use React Hook Form for state management:

```typescript
interface FormState<T> {
  values: T;
  errors: Record<keyof T, string | undefined>;
  touched: Record<keyof T, boolean>;
  isSubmitting: boolean;
  isValid: boolean;
}
```

### Theme Configuration

```typescript
interface ThemeConfig {
  colors: ColorTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  shadows: ShadowTokens;
  borderRadius: BorderRadiusTokens;
  animation: AnimationTokens;
  gradients: GradientTokens;
}
```

The theme configuration is exported as a single object and consumed by components via CSS custom properties and Tailwind classes.


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, several properties can be consolidated:
- Password validation (1.3, 1.7, 3.4) can be combined into a single comprehensive property
- Email validation (1.6) is a distinct property
- Error message privacy (2.3, 3.7, 13.4) can be combined into one property about non-enumeration
- Many UI and integration behaviors are better tested as specific examples rather than properties

### Universal Properties

**Property 1: Email validation rejects clearly invalid formats**

*For any* string that does not conform to a pragmatic email format, the email validation function should return false and prevent form submission.

**Validates: Requirements 1.6**

**Property 2: Password validation matches Cognito password policy configured for V1**

*For any* password string, the validation function should reject it if and only if it fails to meet at least one of these requirements: minimum 8 characters, at least one uppercase letter, at least one lowercase letter, at least one number.

**Validates: Requirements 1.3, 1.7, 3.4**

**Property 3: Sensitive data is never logged**

*For any* authentication operation (sign up, login, password reset), the system should never log tokens, passwords, or other sensitive credentials to the console or logging system.

**Validates: Requirements 13.1**

**Property 4: Error messages do not reveal account existence**

*For any* authentication error (invalid login, password reset for non-existent email), the error message should not reveal whether the email address exists in the system.

**Validates: Requirements 2.3, 3.7, 13.4**


### Example-Based Tests

The following behaviors are best validated through specific examples rather than universal properties:

**Sign Up Flow Examples:**
- Valid sign up creates account (1.1)
- Duplicate email returns specific error (1.2)
- Verification email is sent on successful sign up (1.4)

**Login Flow Examples:**
- Valid credentials authenticate successfully (2.1)
- Successful auth provides tokens (2.2)
- Unverified account prevents login (2.4)
- Successful auth redirects to main app (2.5)
- Expired tokens trigger re-authentication (2.7)

**Password Reset Examples:**
- Reset request sends verification code (3.1)
- Valid code and password updates password (3.2)
- Invalid/expired code returns error (3.3)

**UI and Theme Examples:**
- Auth forms apply theme styling (4.3)
- Validation errors display inline (4.4)
- Loading states show during async operations (4.5)
- Accessibility attributes are present (4.7)
- Theme tokens are defined and exported (5.1-5.7)
- Semi-flat styling is applied (6.1-6.7)
- Interactive states are defined (7.1-7.7)

**Session Management Examples:**
- Session restores on page reload (8.2)
- Expired session triggers re-auth (8.3)
- Logout clears state (8.4)

**Configuration Examples:**
- Amplify initializes with environment config (11.1)
- Missing config fails fast (11.2)
- Password policy matches validation (11.4)

**Verification Examples:**
- Unverified login shows verification prompt (12.1)
- Resend verification works (12.2)
- Invalid verification code shows error (12.3)

**Accessibility Examples:**
- Keyboard navigation works (14.1)
- Labels associate with inputs (14.2)
- Focus management on transitions (14.3)

## Error Handling

### Client-Side Validation Errors

All form inputs are validated client-side before submission:

**Email Validation:**
- Empty: "Email is required"
- Invalid format: "Please enter a valid email address"

**Password Validation:**
- Empty: "Password is required"
- Too short: "Password must be at least 8 characters"
- Missing uppercase: "Password must contain at least one uppercase letter"
- Missing lowercase: "Password must contain at least one lowercase letter"
- Missing number: "Password must contain at least one number"

**Confirm Password Validation:**
- Empty: "Please confirm your password"
- Mismatch: "Passwords do not match"

### Server-Side Error Handling

Errors from Amplify Auth/Cognito are mapped to user-friendly messages:

**Sign Up Errors:**
- `UsernameExistsException`: "An account with this email already exists"
- `InvalidPasswordException`: "Password does not meet requirements"
- `InvalidParameterException`: "Invalid input. Please check your information."
- Network errors: "Unable to connect. Please check your connection."

**Login Errors:**
- `NotAuthorizedException`: "Invalid email or password"
- `UserNotConfirmedException`: "Please verify your email address"
- `UserNotFoundException`: "Invalid email or password" (same as wrong password)
- Network errors: "Unable to connect. Please check your connection."

**Password Reset Errors:**
- `CodeMismatchException`: "Invalid verification code"
- `ExpiredCodeException`: "Verification code has expired"
- `LimitExceededException`: "Too many attempts. Please try again later."
- Network errors: "Unable to connect. Please check your connection."

### Error Display

- Errors are displayed inline below the relevant form field
- Error text uses error color from theme (red)
- Error icon accompanies error text
- Form field border changes to error color
- ARIA attributes announce errors to screen readers
- Errors clear when user modifies the field

### Security Baseline

- Auth error logging (if any) redacts or hashes email/login identifiers
- Do not include raw Cognito exception messages in UI; map to curated messages only
- The UI never prints Amplify/Cognito responses containing tokens
- No tokens or secrets are logged to console in any environment


## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests for comprehensive coverage:

**Unit Tests** validate specific examples, edge cases, and integration points:
- Specific authentication flows (sign up, login, password reset)
- Error handling for known error codes
- UI component rendering and state management
- Theme token definitions and exports
- Accessibility attributes
- Focus management
- Navigation behavior

**Property-Based Tests** validate universal properties across all inputs:
- Email validation rejects all invalid formats
- Password validation enforces all security requirements
- Sensitive data is never logged regardless of operation
- Error messages never reveal account existence

### Testing Configuration

**Property-Based Testing Library:** fast-check (JavaScript/TypeScript)

**Property Test Configuration:**
- Minimum 100 iterations per property test
- Each property test references its design document property
- Tag format: `Feature: ui-auth-and-theme, Property {number}: {property_text}`

**Unit Test Configuration:**
- React Testing Library for component tests
- Vitest as test runner
- Mock Amplify Auth functions for isolation
- Test user interactions and state changes

### Test Organization

```
frontend/src/
├── components/
│   ├── auth/
│   │   ├── SignUpForm.test.tsx
│   │   ├── LoginForm.test.tsx
│   │   ├── ForgotPasswordForm.test.tsx
│   │   └── VerifyEmailForm.test.tsx
│   └── ui/
│       ├── Button.test.tsx
│       ├── Input.test.tsx
│       └── Card.test.tsx
├── hooks/
│   └── useAuth.test.ts
├── theme/
│   ├── tokens.test.ts
│   └── validation.test.ts
└── __tests__/
    └── properties/
        ├── email-validation.property.test.ts
        ├── password-validation.property.test.ts
        ├── sensitive-data-logging.property.test.ts
        └── error-message-privacy.property.test.ts
```

### Key Test Scenarios

**Authentication Flow Tests:**
1. Complete sign up flow from form submission to verification
2. Login with valid credentials
3. Login with unverified account
4. Password reset complete flow
5. Session invalidation behavior: when Amplify reports expired/invalid session, user is redirected to login and protected routes are blocked
6. Logout and state clearing

**Validation Tests:**
7. Email format validation (property test)
8. Password requirements validation (property test)
9. Form field validation on blur and submit
10. Error message display and clearing

**UI Component Tests:**
11. Button variants and states render correctly
12. Input components show errors appropriately
13. Loading states display during async operations
14. Theme tokens are applied to components

**Accessibility Tests:**
15. Form labels associate with inputs
16. Error messages announced to screen readers
17. Keyboard navigation works for all interactive elements
18. Focus management on page transitions

**Security Tests:**
19. Sensitive data never logged (property test)
20. Error messages don't reveal account existence (property test)
21. Auth state persistence: verify that configured persistence mode behaves as expected across refresh and browser restart

### Mocking Strategy

**Mock Amplify Auth:**
- Mock Amplify Auth functions (signUp, signIn, signOut, password reset functions)
- Mock `getCurrentUser`, `fetchAuthSession`
- Simulate success and error responses
- Verify correct parameters passed to Amplify functions

**Mock Navigation:**
- Mock routing/navigation functions
- Verify redirects occur at correct times

**Mock Environment:**
- Mock environment variables for configuration
- Test configuration loading and validation
