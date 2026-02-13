# Implementation Plan: GRN Branding

## Overview

This implementation plan adds Good Roots Network (GRN) branding throughout the community food coordination platform. The work is organized into discrete tasks that build incrementally, starting with brand assets and configuration, then implementing core branding components, updating existing layouts, and finally adding the plant lifecycle loading animation.

## Tasks

- [x] 1. Set up brand assets and configuration
  - Create brand configuration file with GRN name, tagline, colors, and asset paths
  - Add placeholder comments for logo
3A)
    - Update background_color to match theme
    - Add categories: ["food", "lifestyle", "social"]
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.2 Update index.html with comprehensive meta tags
    - Update page title to "Good Roots Network - Local food. Grown with care"
    - Add meta description (150-160 chars) with GRN tagline and value proposition
    - Add meta keywords including "Good Roots Network", "GRN", "local food", etc.
    - Add canonical URL meta tag
    - Add Open Graph meta tags (og:title, og:description, og:type, og:url, og:image, og:image:alt, og:locale, og:site_name)
    - Add Twitter Card meta tags (twitter:card, twitter:title, twitter:description, twitter:image)
    - Add PWA meta tags (theme-color, apple-mobile-web-app-title, application-name)
    - Add favicon links (ICO, PNG 16x16, PNG 32x32, apple-touch-icon)
    - Add JSON-LD structured data for Organization schema
    - _Requirements: 3.1, 3.2, 3.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14, 5.15, 5.16, 5.17, 5.18, 5.19, 5.20_

- [ ] 3. Implement Logo component
  - [x] 3.1 Create Logo component with variant support
    - Implement Logo component in frontend/src/components/branding/Logo.tsx
    - Support variants: 'full', 'horizontal', 'icon'
    - Support sizes: 'sm' (32px), 'md' (48px), 'lg' (64px), 'xl' (96px)
    - Maintain aspect ratio across all sizes
    - Use SVG format for crisp rendering
    - Include proper alt text: "Good Roots Network logo"
    - Handle image loading errors with fallback to "GRN" text
    - _Requirements: 1.1, 1.5, 7.1, 9.1, 9.2, 9.3, 9.4_

  - [x] 3.2 Write property test for Logo accessibility
    - **Property 1: Logo Accessibility**
    - **Validates: Requirements 7.1, 7.3**
    - Test that all logo instances have appropriate accessibility attributes
    - Generate random logo variants and contexts
    - Verify each has either meaningful alt text or aria-hidden attribute

  - [x] 3.3 Write property test for responsive logo sizing
    - **Property 2: Responsive Logo Sizing**
    - **Validates: Requirements 1.5, 9.1, 9.2, 9.3, 9.4**
    - Test that logo renders appropriately for all viewport sizes
    - Generate random viewport widths and size props
    - Verify logo size is appropriate and aspect ratio is maintained

- [ ] 4. Implement BrandHeader component
  - [x] 4.1 Create BrandHeader component for auth pages
    - Implement BrandHeader in frontend/src/components/branding/BrandHeader.tsx
    - Display Logo component (centered)
    - Display "Good Roots Network" text below logo
    - Display tagline "Local food. Grown with care" below name
    - Use theme tokens for spacing and colors
    - Make tagline optional via showTagline prop
    - Support logoSize prop to control logo size
    - Ensure tagline is semantic text (not embedded in image)
    - _Requirements: 1.1, 1.2, 7.2_

  - [x] 4.2 Write unit tests for BrandHeader
    - Test BrandHeader renders logo and tagline
    - Test showTagline prop hides/shows tagline
    - Test logoSize prop is passed to Logo component
    - Test tagline is rendered as text element

- [ ] 5. Update AuthLayout to use BrandHeader
  - [x] 5.1 Integrate BrandHeader into AuthLayout
    - Update frontend/src/components/Auth/AuthLayout.tsx
    - Replace existing title/subtitle with BrandHeader component
    - Remove hardcoded title and subtitle props (breaking change)
    - Keep subtitle prop for additional context below branding
    - Ensure consistent spacing using theme tokens
    - _Requirements: 1.1, 1.2, 10.5_

  - [x] 5.2 Update auth pages to work with new AuthLayout
    - Update LoginPage to remove title/subtitle, add context via subtitle if needed
    - Update SignUpPage to remove title/subtitle
    - Update ForgotPasswordPage to remove title/subtitle
    - Ensure VerifyEmailForm context includes branding
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 5.3 Write property test for auth page branding consistency
    - **Property 5: Auth Page Branding Consistency**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.5**
    - Test that all auth pages render branding through AuthLayout
    - Render each auth page component
    - Verify each renders AuthLayout with BrandHeader
    - Verify no duplicate branding logic exists

- [ ] 6. Implement AppHeader and AppShell components
  - [x] 6.1 Create AppHeader component for authenticated views
    - Implement AppHeader in frontend/src/components/branding/AppHeader.tsx
    - Display Logo with 'icon' variant on mobile, 'horizontal' on desktop
    - Use sticky positioning at top of viewport
    - Include placeholder for user menu (right side)
    - Use theme shadow tokens for elevation
    - Support showMenu and onMenuClick props for future navigation
    - Responsive breakpoint at 768px (md)
    - _Requirements: 1.3_

  - [x] 6.2 Create AppShell component
    - Implement AppShell in frontend/src/components/layout/AppShell.tsx
    - Render AppHeader at top
    - Render children in main content area with flex-1
    - Use min-h-screen and flex flex-col layout
    - Support showHeader prop to conditionally show header
    - Use theme background color
    - _Requirements: 1.3_

  - [x] 6.3 Update ProfileView to use AppShell
    - Wrap ProfileView content with AppShell component
    - Remove duplicate header/branding from ProfileView
    - Ensure proper spacing and layout
    - _Requirements: 1.4_

  - [x] 6.4 Write unit tests for AppHeader and AppShell
    - Test AppHeader renders logo with correct variant for mobile/desktop
    - Test AppShell renders AppHeader and children
    - Test showHeader prop controls header visibility

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement PlantLoader animation component
  - [x] 8.1 Create PlantLoader component with CSS animations
    - Implement PlantLoader in frontend/src/components/branding/PlantLoader.tsx
    - Create SVG-based plant lifecycle animation (seed → seedling → flower)
    - Implement CSS keyframe animations for each stage
    - Seed stage (0-33%): small oval in soil, scale 0.3, translateY(10px)
    - Seedling stage (33-66%): sprout with leaves, scale 0.6-0.9, translateY(0 to -5px)
    - Flower stage (66-100%): full plant with flower, scale 1, translateY(-10px)
    - Use organic easing (ease-in-out) for natural growth feel
    - Support sizes: 'sm', 'md', 'lg'
    - Support speed: 'slow' (3s), 'normal' (2s), 'fast' (1.5s)
    - Use theme primary colors (green) and accent colors (golden yellow for flower)
    - Loop animation infinitely
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.9_

  - [x] 8.2 Add reduced motion support to PlantLoader
    - Detect prefers-reduced-motion media query
    - Render static plant icon when reduced motion is preferred
    - Create StaticPlantIcon component as fallback
    - _Requirements: 6.3, 6.8, 6.10_

  - [x] 8.3 Write unit tests for PlantLoader
    - Test PlantLoader renders animation with correct stages
    - Test animation uses infinite iteration
    - Test animation uses theme colors
    - Test prefers-reduced-motion shows static icon
    - Test size and speed props affect styling

- [ ] 9. Update loading states to use PlantLoader
  - [x] 9.1 Update App.tsx loading state
    - Replace spinner in App.tsx with PlantLoader component
    - Keep "Loading..." text below animation
    - Use 'md' size for initial app loading
    - _Requirements: 6.1_

  - [x] 9.2 Update ProfileView loading state
    - Replace spinner in ProfileView with PlantLoader component
    - Keep "Loading your profile..." text
    - Use 'md' size
    - _Requirements: 6.6_

  - [x] 9.3 Write property test for loading animation consistency
    - **Property 3: Loading Animation Consistency**
    - **Validates: Requirements 6.1, 6.6, 6.7**
    - Test that all loading states use PlantLoader
    - Generate random loading states across components
    - Verify each renders PlantLoader component

- [ ] 10. Add color contrast validation
  - [x] 10.1 Write property test for brand color contrast
    - **Property 4: Brand Color Contrast**
    - **Validates: Requirements 7.4**
    - Test that all brand colors meet WCAG AA contrast standards
    - Generate all combinations of brand colors and backgrounds
    - Verify contrast ratios: 4.5:1 for normal text, 3:1 for large text
    - Use color contrast calculation library

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based and unit tests
- User will provide actual logo and favicon assets - placeholders and file structure will be created
- The design uses the existing theme system's forest green (#3F7D3A) which aligns with GRN branding
- Nunito font will be loaded from Google Fonts for optimal performance
- Plant lifecycle animation uses CSS for performance and respects prefers-reduced-motion
- All branding components use theme tokens for consistency
- Breaking change: AuthLayout no longer accepts title/subtitle props, uses BrandHeader instead
