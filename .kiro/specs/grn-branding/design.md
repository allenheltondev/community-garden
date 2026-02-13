# Design Document: GRN Branding

## Overview

This design implements comprehensive Good Roots Network (GRN) branding throughout the community food coordination platform. The branding establishes a cohesive visual identity that reinforces the platform's mission of connecting local food growers with their communities through the tagline "Local food. Grown with care."

The implementation focuses on:
- Prominent logo and tagline display across all user touchpoints
- PWA manifest and meta tag updates for proper representation in app stores and social media
- A delightful plant lifecycle loading animation (seed → seedling → flower)
- Responsive branding that works seamlessly on mobile and desktop
- Integration with the existing theme system and component library

## Architecture

### Component Hierarchy

```
App
├── AuthLayout (unauthenticated)
│   ├── BrandHeader (new)
│   │   ├── Logo
│   │   └── Tagline
│   └── Auth Forms
└── AppShell (authenticated, new)
    ├── AppHeader (new)
    │   └── Logo
    └── Content Views
        └── ProfileView
```

### Asset Organization

```
frontend/
├── public/
│   ├── images/
│   │   ├── logo.svg              # Primary logo (SVG for scalability)
│   │   ├── logo-horizontal.svg   # Horizontal variant with text
│   │   ├── logo-icon.svg         # Icon-only variant for compact spaces
│   │   └── social-share.png      # 1200x630px for Open Graph
│   ├── icons/
│   │   ├── favicon.ico           # Multi-size ICO
│   │   ├── favicon-16x16.png
│   │   ├── favicon-32x32.png
│   │   ├── apple-touch-icon.png  # 180x180px
│   │   ├── icon-192x192.png      # PWA icon
│   │   └── icon-512x512.png      # PWA icon
│   ├── manifest.json             # Updated with GRN branding
│   └── robots.txt
├── index.html                     # Updated with meta tags
└── src/
    ├── components/
    │   ├── branding/
    │   │   ├── Logo.tsx           # Logo component with variants
    │   │   ├── BrandHeader.tsx    # Logo + tagline for auth pages
    │   │   ├── AppHeader.tsx      # Header for authenticated app
    │   │   └── PlantLoader.tsx    # Plant lifecycle loading animation
    │   ├── layout/
    │   │   └── AppShell.tsx       # Main app container
    │   └── Auth/
    │       └── AuthLayout.tsx     # Updated to use BrandHeader
    └── assets/
        └── animations/
            └── plant-lifecycle.svg # SVG animation assets
```

## Components and Interfaces

### 1. Logo Component

**Purpose**: Reusable logo component with multiple variants for different contexts.

**Interface**:
```typescript
export interface LogoProps {
  variant?: 'full' | 'horizontal' | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const Logo: React.FC<LogoProps>
```

**Behavior**:
- `variant='full'`: Stacked logo with icon and text (default)
- `variant='horizontal'`: Logo with text beside icon
- `variant='icon'`: Icon only for compact spaces
- Responsive sizing based on `size` prop
- Maintains aspect ratio across all variants
- Uses SVG for crisp rendering at all sizes

**Size Mappings**:
- `sm`: 32px height (mobile header, compact spaces)
- `md`: 48px height (auth pages mobile)
- `lg`: 64px height (auth pages desktop)
- `xl`: 96px height (splash screen)

### 2. BrandHeader Component

**Purpose**: Combined logo and tagline display for authentication pages.

**Interface**:
```typescript
export interface BrandHeaderProps {
  showTagline?: boolean;
  logoSize?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const BrandHeader: React.FC<BrandHeaderProps>
```

**Layout**:
```
┌─────────────────────┐
│                     │
│    [GRN Logo]       │
│                     │
│  Good Roots Network │
│                     │
│ Local food. Grown   │
│    with care        │
│                     │
└─────────────────────┘
```

**Styling**:
- Center-aligned
- Logo uses theme primary colors
- Tagline in neutral-600 with relaxed line height
- Responsive spacing using theme tokens

### 3. AppHeader Component

**Purpose**: Header bar for authenticated application views.

**Interface**:
```typescript
export interface AppHeaderProps {
  showMenu?: boolean;
  onMenuClick?: () => void;
  className?: string;
}

export const AppHeader: React.FC<AppHeaderProps>
```

**Layout** (Mobile):
```
┌─────────────────────────────┐
│ [☰]  [Logo]        [User]   │
└─────────────────────────────┘
```

**Layout** (Desktop):
```
┌──────────────────────────────────────┐
│ [Logo + GRN]              [User Menu]│
└──────────────────────────────────────┘
```

**Behavior**:
- Sticky positioning at top of viewport
- Uses `logo-icon` variant on mobile, `horizontal` on desktop
- Integrates with existing theme shadow tokens
- Smooth transitions on scroll

### 4. AppShell Component

**Purpose**: Main container for authenticated application views.

**Interface**:
```typescript
export interface AppShellProps {
  children: React.ReactNode;
  showHeader?: boolean;
}

export const AppShell: React.FC<AppShellProps>
```

**Structure**:
```typescript
<div className="min-h-screen flex flex-col">
  <AppHeader />
  <main className="flex-1">
    {children}
  </main>
</div>
```

**Behavior**:
- Provides consistent layout structure
- Manages header visibility
- Handles responsive padding and spacing
- Integrates with theme background color

### 5. PlantLoader Component

**Purpose**: Animated loading indicator showing plant lifecycle (seed → seedling → flower).

**Interface**:
```typescript
export interface PlantLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  speed?: 'slow' | 'normal' | 'fast';
  className?: string;
}

export const PlantLoader: React.FC<PlantLoaderProps>
```

**Animation Stages**:
1. **Seed** (0-33%): Small oval shape in soil
2. **Seedling** (33-66%): Sprout with two leaves emerging
3. **Flower** (66-100%): Full plant with blooming flower

**Implementation**:
- CSS keyframe animation for smooth transitions
- SVG-based for crisp rendering and small file size
- Uses theme primary colors (green) and accent colors (golden yellow for flower)
- Organic easing functions for natural growth feel
- Loops continuously while loading

**Animation Timing**:
- `slow`: 3s per cycle
- `normal`: 2s per cycle (default)
- `fast`: 1.5s per cycle

**CSS Animation**:
```css
@keyframes plant-lifecycle {
  0% {
    /* Seed state */
    transform: scale(0.3) translateY(10px);
    opacity: 0.8;
  }
  33% {
    /* Seedling emerges */
    transform: scale(0.6) translateY(0);
    opacity: 1;
  }
  66% {
    /* Growing */
    transform: scale(0.9) translateY(-5px);
  }
  100% {
    /* Full flower */
    transform: scale(1) translateY(-10px);
  }
}
```

## Data Models

### Brand Configuration

```typescript
export interface BrandConfig {
  name: {
    full: string;        // "Good Roots Network"
    short: string;       // "GRN"
  };
  tagline: string;       // "Local food. Grown with care"
  assets: {
    logo: {
      full: string;      // Path to full logo SVG
      horizontal: string; // Path to horizontal variant
      icon: string;      // Path to icon-only variant
    };
    favicon: {
      ico: string;       // Path to .ico file
      png16: string;     // 16x16 PNG
      png32: string;     // 32x32 PNG
      appleTouchIcon: string; // 180x180 PNG
    };
    social: {
      ogImage: string;   // 1200x630 PNG for Open Graph
      ogImageAlt: string; // Alt text for social image
    };
  };
  colors: {
    primary: string;     // From theme tokens
    background: string;  // From theme tokens
    themeColor: string;  // For meta tags
  };
  urls: {
    canonical: string;   // Platform canonical URL
    domain: string;      // Domain for structured data
  };
}

export const brandConfig: BrandConfig = {
  name: {
    full: "Good Roots Network",
    short: "GRN",
  },
  tagline: "Local food. Grown with care",
  assets: {
    logo: {
      full: "/images/logo.svg",
      horizontal: "/images/logo-horizontal.svg",
      icon: "/images/logo-icon.svg",
    },
    favicon: {
      ico: "/icons/favicon.ico",
      png16: "/icons/favicon-16x16.png",
      png32: "/icons/favicon-32x32.png",
      appleTouchIcon: "/icons/apple-touch-icon.png",
    },
    social: {
      ogImage: "/images/social-share.png",
      ogImageAlt: "Good Roots Network - Connecting local food growers with their communities",
    },
  },
  colors: {
    primary: "#3F7D3A",
    background: "#F7F5EF",
    themeColor: "#3F7D3A",
  },
  urls: {
    canonical: "https://goodroots.network", // Update with actual domain
    domain: "goodroots.network",
  },
};
```

### PWA Manifest Updates

```json
{
  "name": "Good Roots Network",
  "short_name": "GRN",
  "description": "Local food. Grown with care. Connect growers and searchers in your community.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F7F5EF",
  "theme_color": "#3F7D3A",
  "orientation": "portrait-primary",
  "categories": ["food", "lifestyle", "social"],
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

### HTML Meta Tags Structure

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap" rel="stylesheet" />

    <!-- Primary Meta Tags -->
    <title>Good Roots Network - Local food. Grown with care</title>
    <meta name="title" content="Good Roots Network - Local food. Grown with care" />
    <meta name="description" content="Connect with local food growers in your community. Good Roots Network makes it easy to find fresh, locally-grown food and support sustainable agriculture." />
    <meta name="keywords" content="Good Roots Network, GRN, local food, community food, growers, food coordination, sustainable agriculture, farm to table" />
    <link rel="canonical" href="https://goodroots.network" />

    <!-- Favicon -->
    <link rel="icon" type="image/x-icon" href="/icons/favicon.ico" />
    <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />

    <!-- PWA -->
    <link rel="manifest" href="/manifest.json" />
    <meta name="theme-color" content="#3F7D3A" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="GRN" />
    <meta name="application-name" content="Good Roots Network" />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://goodroots.network" />
    <meta property="og:title" content="Good Roots Network - Local food. Grown with care" />
    <meta property="og:description" content="Connect with local food growers in your community. Find fresh, locally-grown food and support sustainable agriculture." />
    <meta property="og:image" content="https://goodroots.network/images/social-share.png" />
    <meta property="og:image:alt" content="Good Roots Network - Connecting local food growers with their communities" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:site_name" content="Good Roots Network" />

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:url" content="https://goodroots.network" />
    <meta property="twitter:title" content="Good Roots Network - Local food. Grown with care" />
    <meta property="twitter:description" content="Connect with local food growers in your community. Find fresh, locally-grown food and support sustainable agriculture." />
    <meta property="twitter:image" content="https://goodroots.network/images/social-share.png" />

    <!-- Structured Data (JSON-LD) -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Good Roots Network",
      "alternateName": "GRN",
      "url": "https://goodroots.network",
      "logo": "https://goodroots.network/images/logo.svg",
      "description": "Local food. Grown with care. Connect growers and searchers in your community.",
      "sameAs": []
    }
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

## Correctness Properties


*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Logo Accessibility

*For any* logo image rendered in the application, the image SHALL have appropriate accessibility attributes (alt text describing "Good Roots Network logo" for meaningful logos, or aria-hidden
tem SHALL display the PlantLoader component with the plant lifecycle animation.

**Validates: Requirements 6.1, 6.6, 6.7**

### Property 4: Brand Color Contrast

*For any* brand color used for text or interactive elements, the color SHALL maintain a contrast ratio of at least 4.5:1 against its background for normal text, or 3:1 for large text, meeting WCAG AA standards.

**Validates: Requirements 7.4**

### Property 5: Auth Page Branding Consistency

*For any* authentication page (LoginPage, SignUpPage, ForgotPasswordPage, VerifyEmailForm), the page SHALL render branding through the AuthLayout component, ensuring consistent logo and tagline display.

**Validates: Requirements 10.1, 10.2, 10.3, 10.5**

## Error Handling

### Missing Brand Assets

**Scenario**: Logo or favicon files are missing or fail to load.

**Handling**:
- Logo component should render a fallback text "GRN" with appropriate styling
- Console warning logged for missing assets
- Application continues to function without visual branding
- Favicon falls back to browser default if not found

**Implementation**:
```typescript
export const Logo: React.FC<LogoProps> = ({ variant = 'full', size = 'md' }) => {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div className="logo-fallback" role="img" aria-label="Good Roots Network logo">
        <span className="text-primary-600 font-bold">GRN</span>
      </div>
    );
  }

  return (
    <img
      src={getLogoPath(variant)}
      alt="Good Roots Network logo"
      onError={() => {
        console.warn(`Failed to load logo variant: ${variant}`);
        setImageError(true);
      }}
    />
  );
};
```

### Invalid Brand Configuration

**Scenario**: Brand configuration contains invalid URLs or missing required fields.

**Handling**:
- Validate brand configuration at build time using TypeScript types
- Provide sensible defaults for optional fields
- Log warnings for missing optional configuration
- Fail build if required fields are missing

**Validation**:
```typescript
function validateBrandConfig(config: BrandConfig): void {
  if (!config.name.full || !config.name.short) {
    throw new Error('Brand name configuration is required');
  }

  if (!config.tagline) {
    console.warn('Brand tagline is missing');
  }

  // Validate URLs are well-formed
  try {
    new URL(config.urls.canonical);
  } catch {
    throw new Error('Invalid canonical URL in brand configuration');
  }
}
```

### Animation Performance Issues

**Scenario**: Plant lifecycle animation causes performance degradation on low-end devices.

**Handling**:
- Detect reduced motion preference using `prefers-reduced-motion` media query
- Provide static loading indicator for users who prefer reduced motion
- Use CSS `will-change` property to optimize animation performance
- Limit animation complexity for better performance

**Implementation**:
```typescript
export const PlantLoader: React.FC<PlantLoaderProps> = ({ size = 'md' }) => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    return <StaticPlantIcon size={size} />;
  }

  return <AnimatedPlantLifecycle size={size} />;
};
```

### Meta Tag Conflicts

**Scenario**: Multiple meta tags with the same property are defined.

**Handling**:
- Use React Helmet or similar library to manage meta tags declaratively
- Ensure only one instance of each meta tag property
- Later definitions override earlier ones
- Validate meta tags in development mode

### Responsive Breakpoint Edge Cases

**Scenario**: Logo sizing behaves unexpectedly at exact breakpoint boundaries.

**Handling**:
- Use consistent breakpoint definitions from theme system
- Test logo rendering at common viewport sizes (320px, 375px, 768px, 1024px, 1440px)
- Use `min-width` media queries for mobile-first approach
- Provide smooth transitions between sizes

## Testing Strategy

### Unit Tests

Unit tests will focus on specific examples, edge cases, and component behavior:

**Component Tests**:
- Logo component renders correct variant based on props
- Logo component handles missing images gracefully with fallback
- BrandHeader displays logo and tagline in correct layout
- AppHeader renders appropriate logo variant for mobile vs desktop
- PlantLoader respects `prefers-reduced-motion` setting
- PlantLoader renders correct animation stages

**Configuration Tests**:
- Brand configuration validation catches invalid data
- PWA manifest contains correct GRN branding fields
- HTML meta tags are present with correct content

**Accessibility Tests**:
- Logo images have appropriate alt text
- Tagline is semantic text, not embedded in images
- Color contrast ratios meet WCAG AA standards
- Keyboard navigation works for branded interactive elements

**Integration Tests**:
- AuthLayout integrates BrandHeader correctly
- AppShell integrates AppHeader correctly
- ProfileView displays branding in authenticated state
- Loading states display PlantLoader animation

### Property-Based Tests

Property-based tests will verify universal properties across all inputs. Each test should run a minimum of 100 iterations.

**Property Test 1: Logo Accessibility**
- **Feature**: grn-branding, Property 1: Logo Accessibility
- **Test**: Generate random logo instances with different variants and contexts
- **Verify**: Each logo has either meaningful alt text or aria-hidden attribute
- **Library**: React Testing Library with property-based test generator

**Property Test 2: Responsive Logo Sizing**
- **Feature**: grn-branding, Property 2: Responsive Logo Sizing
- **Test**: Generate random viewport widths and logo size props
- **Verify**: Logo renders at appropriate size for viewport, maintains aspect ratio
- **Library**: React Testing Library with viewport simulation

**Property Test 3: Loading Animation Consistency**
- **Feature**: grn-branding, Property 3: Loading Animation Consistency
- **Test**: Generate random loading states across different components
- **Verify**: All loading states render PlantLoader component
- **Library**: React Testing Library with component tree inspection

**Property Test 4: Brand Color Contrast**
- **Feature**: grn-branding, Property 4: Brand Color Contrast
- **Test**: Generate all combinations of brand colors and backgrounds
- **Verify**: Contrast ratios meet WCAG AA standards (4.5:1 for normal text, 3:1 for large text)
- **Library**: Color contrast calculation library (e.g., polished or color-contrast-checker)

**Property Test 5: Auth Page Branding Consistency**
- **Feature**: grn-branding, Property 5: Auth Page Branding Consistency
- **Test**: Render each auth page component
- **Verify**: Each page renders AuthLayout with BrandHeader, no duplicate branding logic
- **Library**: React Testing Library with component tree inspection

### Manual Testing Checklist

Some aspects require manual verification:

- [ ] Favicon appears correctly in browser tabs across Chrome, Firefox, Safari, Edge
- [ ] PWA installs correctly on iOS and Android with GRN branding
- [ ] Social sharing displays correct Open Graph image and metadata on Facebook, Twitter, LinkedIn
- [ ] Plant lifecycle animation feels smooth and organic on actual mobile devices
- [ ] Logo is crisp and clear at all sizes on retina displays
- [ ] Branding maintains visual consistency across all pages
- [ ] Loading animation transitions feel natural and not jarring

### Performance Testing

- Measure logo SVG file sizes (should be < 10KB each)
- Measure plant lifecycle animation frame rate (should maintain 60fps)
- Verify no layout shift when logo loads (use proper width/height attributes)
- Test PWA installation time with branded assets
- Verify social share image loads quickly (< 200KB)

### Accessibility Testing

- Test with screen readers (NVDA, JAWS, VoiceOver) to verify logo alt text
- Verify keyboard navigation works with branded interactive elements
- Test with high contrast mode enabled
- Verify plant lifecycle animation respects `prefers-reduced-motion`
- Test color contrast with automated tools (axe, Lighthouse)

## Implementation Notes

### Asset Creation Guidelines

**Logo Files**:
- Primary logo should be SVG for scalability
- Use semantic SVG structure with proper viewBox
- Optimize SVG files using SVGO
- Ensure logo works on both light and dark backgrounds
- Provide PNG fallbacks for older browsers if needed

**Favicon Files**:
- Create multi-size ICO file (16x16, 32x32, 48x48)
- Provide separate PNG files for better quality
- Apple touch icon should be 180x180px
- PWA icons should be 192x192px and 512x512px
- Use transparent backgrounds for icon files

**Social Share Image**:
- Dimensions: 1200x630px (Facebook/LinkedIn recommended)
- Format: PNG or JPG
- File size: < 200KB for fast loading
- Include logo, tagline, and visual representation of platform
- Test appearance in Facebook Sharing Debugger and Twitter Card Validator

### Theme Integration

The existing theme system already uses forest green (#3F7D3A) as the primary color, which aligns well with the "Good Roots" nature-focused branding. The warm earth tones (brown, golden yellow) complement the green and reinforce the agricultural theme.

**Color Mapping**:
- Primary green → GRN brand primary color
- Accent golden yellow → Flower color in plant lifecycle animation
- Secondary brown → Soil/earth tones in animation
- Neutral warm tones → Background for branding elements

**Typography**:
- Primary font family: Nunito (friendly, rounded sans-serif that complements the organic, community-focused brand)
- Fallback: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- Nunito should be loaded via Google Fonts or self-hosted for performance
- Use Nunito for all headings, body text, and UI elements
- The rounded letterforms of Nunito reinforce the warm, approachable feel of the GRN brand

### Animation Implementation Details

The plant lifecycle animation should be implemented as a pure CSS animation with SVG graphics for optimal performance:

```css
.plant-loader {
  width: var(--loader-size);
  height: var(--loader-size);
  position: relative;
}

.plant-loader__seed {
  animation: seed-stage 2s ease-in-out infinite;
}

.plant-loader__seedling {
  animation: seedling-stage 2s ease-in-out infinite;
  animation-delay: 0.66s;
}

.plant-loader__flower {
  animation: flower-stage 2s ease-in-out infinite;
  animation-delay: 1.33s;
}

@keyframes seed-stage {
  0%, 33% { opacity: 1; transform: scale(1); }
  34%, 100% { opacity: 0; transform: scale(0); }
}

@keyframes seedling-stage {
  0%, 33% { opacity: 0; transform: scale(0) translateY(20px); }
  34%, 66% { opacity: 1; transform: scale(1) translateY(0); }
  67%, 100% { opacity: 0; transform: scale(0); }
}

@keyframes flower-stage {
  0%, 66% { opacity: 0; transform: scale(0) translateY(20px); }
  67%, 100% { opacity: 1; transform: scale(1) translateY(-5px); }
}
```

### SEO Optimization

**Structured Data**:
- Implement Organization schema for better search engine understanding
- Include logo, name, description, and URL
- Consider adding LocalBusiness schema if applicable
- Validate structured data using Google's Rich Results Test

**Meta Tag Best Practices**:
- Keep meta description between 150-160 characters
- Use compelling language that includes the tagline
- Ensure Open Graph and Twitter Card tags are complete
- Test social sharing appearance before launch
- Update canonical URLs to match production domain

### Progressive Enhancement

The branding implementation should follow progressive enhancement principles:

1. **Core Experience**: Text-based branding (name and tagline) works without images
2. **Enhanced Experience**: Logo images load and display
3. **Optimal Experience**: Animated plant lifecycle loading indicator
4. **Accessibility**: Respects user preferences for reduced motion

This ensures the platform remains functional even if assets fail to load or on slow connections.
