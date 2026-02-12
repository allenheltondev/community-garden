# Implementation Plan: Authentication Flows and UI Theme System

## Overview

This implementation plan breaks down the authentication flows and UI theme system into discrete coding tasks. The approach follows a bottom-up strategy: establish the theme foundation first, then build reusable UI components, implement authentication logic, and finally wire everything together with routing and protected views.

## Tasks

- [ ] 1. Set up theme system foundation
  - [x] 1.1 Create design token definitions
    - Create `frontend/src/theme/tokens.ts` with color, typography, spacing, shadow, border radius, animation, and gradient tokens
    - Export all token objects with TypeScript types
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 1.2 Create CSS custom properties
    - Create `frontend/src/theme/theme.css` with CSS custom properties for all design tokens
    - Ensure tokens are accessible globally via CSS variables
    - _Requirements: 5.2_

  - [x] 1.3 Integrate theme with Tailwind CSS
    - Update `frontend/tailwind.config.js` to extend with theme tokens
    - Configure colors, shadows, border radius, and animation tokens
    - Verify Tailwind v4 configuration approach matches repo structure
    - _Requirements: 5.2, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 1.4 Create theme index and exports
    - Create `frontend/src/theme/index.ts` to export all theme tokens and types
    - _Requirements: 5.1, 5.2_

- [ ] 2. Build reusable UI component library
  - [x] 2.1 Implement Button component
    - Create `frontend/src/components/ui/Button.tsx` with variants (primary, secondary, outline, ghost)
    - Support sizes (sm, md, lg), loading state, disabled state, and full width
    - Apply theme tokens for colors, shadows, border radius, and animations
    - Include hover, focus, and active states with accessibility support
    - _Requirements: 4.3, 6.1, 6.4, 6.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 2.2 Write unit tests for Button component
    - Test all variants and sizes render correctly
    - Test loading and disabled states
    - Test click handlers and accessibility attributes
    - _Requirements: 4.3, 7.2_

  - [x] 2.3 Implement Input component
    - Create `frontend/src/components/ui/Input.tsx` with support for text, email, and password types
    - Include label, placeholder, error state, and disabled state
    - Add password toggle button for password fields
    - Apply theme tokens for styling and transitions
    - _Requirements: 4.3, 4.4, 4.7, 6.1, 6.3, 7.1, 7.2, 10.1, 10.2, 10.3, 10.4, 10.5, 14.2_

  - [x] 2.4 Write unit tests for Input component
    - Test input types and states
    - Test error display and clearing
    - Test accessibility attributes (labels, ARIA)
    - _Requirements: 4.4, 4.7, 14.2_


  - [x] 2.5 Implement Card component
    - Create `frontend/src/components/ui/Card.tsx` with configurable elevation and padding
    - Apply subtle gradient backgrounds and rounded corners
    - Support hover transitions for interactive cards
    - _Requirements: 4.3, 6.1, 6.2, 6.3, 6.4, 10.1, 10.3, 10.4_

  - [x] 2.6 Implement FormField component
    - Create `frontend/src/components/ui/FormField.tsx` to wrap inputs with labels and error messages
    - Ensure consistent spacing and error display
    - Support required field indicators
    - _Requirements: 4.3, 4.4, 10.1, 10.2, 10.3_

- [ ] 3. Implement validation logic
  - [x] 3.1 Create email validation function
    - Create `frontend/src/utils/validation.ts` with email validation using pragmatic regex
    - Return boolean for valid/invalid
    - _Requirements: 1.6_

  - [x] 3.2 Write property test for email validation
    - **Property 1: Email validation rejects clearly invalid formats**
    - **Validates: Requirements 1.6**
    - Generate random invalid email formats and verify rejection
    - Use fast-check library with minimum 100 iterations

  - [x] 3.3 Create password validation function
    - Add password validation to `frontend/src/utils/validation.ts`
    - Check minimum 8 characters, uppercase, lowercase, and number requirements
    - Return validation result with specific error messages
    - _Requirements: 1.3, 1.7, 3.4_

  - [x] 3.4 Write property test for password validation
    - **Property 2: Password validation matches Cognito password policy configured for V1**
    - **Validates: Requirements 1.3, 1.7, 3.4**
    - Generate random passwords and verify validation matches policy
    - Use fast-check library with minimum 100 iterations

- [ ] 4. Configure Amplify Auth
  - [x] 4.1 Create Amplify configuration module
    - Create `frontend/src/config/amplify.ts` with `configureAmplify` function
    - Load configuration from environment variables (user pool ID, client ID, region)
    - Fail fast with descriptive error if required config is missing
    - Configure Cognito with email login, code verification, and password policy
    - _Requirements: 11.1, 11.2, 11.4_

  - [x] 4.2 Write unit tests for Amplify configuration
    - Test configuration loads from environment
    - Test fail-fast behavior for missing config
    - _Requirements: 11.1, 11.2_

  - [x] 4.3 Initialize Amplify in application entry point
    - Update `frontend/src/main.tsx` to call `configureAmplify` on startup
    - Load config from environment variables
    - _Requirements: 11.1_

- [x] 5. Checkpoint - Theme + UI foundation gate
  - Run unit tests for theme + UI components and ensure green
  - Verify Tailwind v4 configuration is correct in this repo (no broken builds, tokens resolve)
  - Verify auth pages can render with theme primitives (Card/Button/Input/FormField) without Amplify wired in
  - Exit criteria: theme tokens accessible, base UI components render with hover/focus/disabled states


- [ ] 6. Implement authentication components
  - [x] 6.1 Create AuthLayout component
    - Create `frontend/src/components/auth/AuthLayout.tsx` with centered card layout
    - Apply semi-flat styling with gradient background, shadow elevation, and rounded corners
    - Include title, subtitle, and children props
    - Make responsive for mobile devices
    - _Requirements: 4.1, 4.3, 6.1, 6.2, 6.3, 6.4, 10.1, 10.3, 10.4_

  - [x] 6.2 Implement SignUpForm component
    - Create `frontend/src/components/auth/SignUpForm.tsx` with email, password, and confirm password fields
    - Use React Hook Form for form state management
    - Implement client-side validation (email format, password requirements, password match)
    - Call Amplify Auth signUp on submit
    - Handle success (transition to verification) and errors (display inline)
    - Apply theme styling to all form elements
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7, 4.3, 4.4, 4.5, 9.1, 9.2, 9.4, 9.5, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 6.3 Write unit tests for SignUpForm
    - Test form validation (email, password, confirm password)
    - Test successful sign up flow
    - Test error handling (duplicate email, invalid password)
    - Test loading states
    - _Requirements: 1.1, 1.2, 1.3, 4.4, 4.5, 9.1, 9.2_

  - [x] 6.4 Implement LoginForm component
    - Create `frontend/src/components/auth/LoginForm.tsx` with email and password fields
    - Use React Hook Form for form state management
    - Call Amplify Auth signIn on submit
    - Handle success (redirect to main app), unverified account (show verification prompt), and errors
    - Apply theme styling
    - Do not claim 'secure token storage' in tests; instead assert persistence behavior matches the chosen persistence mode and that the app gates protected content until auth state is resolved
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.3, 4.4, 4.5, 9.1, 9.2, 9.4, 9.5, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 6.5 Write unit tests for LoginForm
    - Test successful login flow
    - Test error handling (invalid credentials, unverified account)
    - Test loading states
    - Test error message privacy (doesn't reveal account existence)
    - Do not claim 'secure token storage' in tests; instead assert persistence behavior matches the chosen persistence mode and that the app gates protected content until auth state is resolved
    - _Requirements: 2.1, 2.3, 2.4, 4.4, 4.5, 9.1, 9.2_

  - [x] 6.6 Implement ForgotPasswordForm component
    - Create `frontend/src/components/auth/ForgotPasswordForm.tsx` with two-step flow
    - Step 1: Email input to request code
    - Step 2: Code and new password inputs to reset
    - Call Amplify Auth password reset functions
    - Handle errors gracefully without revealing account existence
    - Apply theme styling
    - Do not hardcode verification code expiry duration; handle expired code based on Cognito error responses and provide resend path
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 4.3, 4.4, 4.5, 9.1, 9.2, 9.4, 9.5, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 6.7 Write unit tests for ForgotPasswordForm
    - Test two-step flow
    - Test error handling (invalid code, expired code)
    - Test error message privacy
    - _Requirements: 3.1, 3.2, 3.3, 3.7, 9.1, 9.2_

  - [x] 6.8 Implement VerifyEmailForm component
    - Create `frontend/src/components/auth/VerifyEmailForm.tsx` with code input
    - Call Amplify Auth confirmSignUp
    - Provide resend code button
    - Handle success (redirect to login) and errors (invalid/expired code)
    - Apply theme styling
    - _Requirements: 12.1, 12.2, 12.3, 4.3, 4.4, 4.5, 9.1, 9.2, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 6.9 Write unit tests for VerifyEmailForm
    - Test verification flow
    - Test resend functionality
    - Test error handling
    - _Requirements: 12.1, 12.2, 12.3, 9.1, 9.2_


- [ ] 7. Create authentication pages and implement routing
  - [x] 7.1 Add auth pages and routes
    - Create `frontend/src/pages/SignUpPage.tsx`, `LoginPage.tsx`, `ForgotPasswordPage.tsx`, and `VerifyEmailPage.tsx` (or confirm existing pages)
    - Wire routes for /signup, /login, /forgot-password, /verify-email
    - Ensure auth pages redirect away to the main app view when already authenticated (per design doc)
    - _Requirements: 4.1, 4.3, 12.1, 14.3_

  - [x] 7.2 Implement protected route wrapper
    - Create `frontend/src/components/auth/RequireAuth.tsx` (or similar)
    - On mount, gate rendering until auth state is resolved (loading state)
    - If unauthenticated, redirect to /login with a return-to parameter
    - If authenticated, render children
    - _Requirements: 8.2, 8.4, 9.5_

  - [x] 7.3 Add auth-state gating in navigation and app bootstrap
    - Ensure initial app render does not flash protected content before auth state resolves
    - On route transitions into protected routes, re-check session state (or rely on central auth store) before rendering
    - _Requirements: 8.2, 9.5_

  - [x] 7.4 Write routing/protection tests
    - Test redirect to /login when unauthenticated user hits a protected route
    - Test authenticated user is redirected away from /login to main app
    - Test return-to param restores intended navigation after login
    - _Requirements: 8.2, 9.5_

- [ ] 8. Implement auth session behavior and cross-tab semantics
  - [x] 8.1 Define and implement persistence mode explicitly
    - Choose persistence mode (session-only vs persistent) and document it in code/config
    - Implement configuration so behavior matches the chosen mode across refresh and restart
    - _Requirements: 8.2, 11.1_

  - [x] 8.2 Implement cross-tab logout propagation
    - On signOut, broadcast logout across tabs (e.g., storage event or BroadcastChannel)
    - On tab focus, re-check auth state if needed to reconcile
    - Ensure app-level cached user state is cleared consistently
    - _Requirements: 8.3, 8.6, 13.1_

  - [x] 8.3 Session invalidation handling
    - When Amplify reports expired/invalid session, redirect user to /login
    - Ensure protected routes are blocked until re-authentication completes
    - _Requirements: 8.5, 8.7_

  - [x] 8.4 Write session/cross-tab tests
    - Test logout clears state and redirects
    - Test auth restoration behavior matches persistence selection
    - Test cross-tab logout behavior (best-effort: unit test broadcast logic + integration test if feasible)
    - _Requirements: 8.2, 8.3, 8.7_

- [ ] 9. Harden error mapping and logging hygiene
  - [x] 9.1 Centralize error mapping
    - Create `frontend/src/utils/authErrors.ts` to map Amplify/Cognito errors to curated UI messages
    - Ensure non-enumeration rules are preserved (same message for user-not-found vs wrong password)
    - Ensure raw exception messages are never shown directly
    - _Requirements: 2.3, 3.7, 9.1, 9.4, 13.4_

  - [x] 9.2 Add logging redaction guardrails
    - Ensure no tokens/passwords ever hit console logs
    - If logging auth failures, hash or redact identifiers
    - _Requirements: 13.1, 13.2_

  - [x] 9.3 Add tests for error privacy + redaction
    - Test that error mapping never reveals account existence
    - Test that logging helpers reject/strip sensitive fields
    - _Requirements: 13.1, 13.4_


- [x] 10. Checkpoint - Verify authentication flows
  - Ensure all tests pass, ask the user if questions arise.


- [x] 11. Implement security and accessibility features
  - [x] 11.1 Add sensitive data logging protection
    - Create logging utility that filters sensitive data
    - Ensure no tokens, passwords, or secrets are logged to console
    - Update all auth components to use safe logging
    - _Requirements: 13.1_

  - [x] 11.2 Write property test for sensitive data logging
    - **Property 3: Sensitive data is never logged**
    - **Validates: Requirements 13.1**
    - Test that auth operations never log sensitive data
    - Use fast-check library with minimum 100 iterations

  - [x] 11.3 Implement error message privacy
    - Ensure all error messages follow privacy-friendly strategy
    - Map Cognito errors to messages that don't reveal account existence
    - _Requirements: 2.3, 3.7, 13.4_

  - [x] 11.4 Write property test for error message privacy
    - **Property 4: Error messages do not reveal account existence**
    - **Validates: Requirements 2.3, 3.7, 13.4**
    - Test that errors don't leak account information
    - Use fast-check library with minimum 100 iterations

  - [x] 11.5 Add keyboard navigation support
    - Ensure all auth forms support keyboard-only navigation
    - Test tab order and focus management
    - _Requirements: 14.1_

  - [x] 11.6 Implement focus management on transitions
    - Manage focus on route changes and form submission errors
    - Ensure focus moves to appropriate elements (error messages, success messages)
    - _Requirements: 14.3_

  - [x] 11.7 Write accessibility tests
    - Test keyboard navigation
    - Test ARIA labels and announcements
    - Test focus management
    - _Requirements: 14.1, 14.2, 14.3_

- [x] 12. Add error handling and user feedback
  - [x] 12.1 Implement error mapping utility
    - Create `frontend/src/utils/errorMapping.ts` to map Cognito errors to user-friendly messages
    - Cover all common error codes (UsernameExistsException, NotAuthorizedException, etc.)
    - Ensure network errors are handled gracefully
    - Note: This may overlap with task 9.1; consolidate if needed
    - _Requirements: 9.1, 9.3, 9.4_

  - [x] 12.2 Add loading state indicators
    - Ensure all async operations show loading indicators
    - Use Button loading state and form-level loading indicators
    - _Requirements: 4.5, 9.5_

  - [x] 12.3 Implement success feedback
    - Add success messages for completed operations
    - Use theme colors for success states
    - _Requirements: 9.6_

  - [x] 12.4 Write unit tests for error handling
    - Test error mapping for all error codes
    - Test loading state display
    - Test success feedback
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 13. Integration and polish
  - [x] 13.1 Update global styles
    - Update `frontend/src/index.css` to import theme CSS
    - Apply theme tokens to global styles
    - Ensure consistent styling across the app
    - _Requirements: 5.2, 10.6_

  - [x] 13.2 Add environment configuration
    - Create `.env.example` with required Cognito configuration variables
    - Document configuration requirements
    - _Requirements: 11.1_

  - [x] 13.3 Test complete authentication flows end-to-end
    - Manually test sign up → verify → login flow
    - Test password reset flow
    - Test logout and session management
    - Test on mobile viewport
    - _Requirements: 1.1, 1.4, 1.5, 2.1, 2.5, 3.1, 3.2, 8.4_

  - [x] 13.4 Verify theme consistency
    - Review all components for consistent theme application
    - Verify semi-flat design principles are applied
    - Check responsive behavior on mobile
    - _Requirements: 4.3, 4.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties with minimum 100 iterations
- Unit tests validate specific examples, edge cases, and integration points
- The implementation follows a bottom-up approach: theme → UI components → validation → auth logic → pages/routing → session/cross-tab → error/logging hardening
- Task 9.1 and 12.1 may overlap (error mapping); consolidate into a single utility if implementing both
- Do not assert tokens are stored in IndexedDB specifically; instead verify persistence behavior matches the chosen mode
- Do not promise 'invalidate all existing sessions' unless implementing and verifying a Cognito-side mechanism
