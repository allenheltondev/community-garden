---
inclusion: fileMatch
fileMatchPattern: "{apps/web/**,frontend/**,**/*.{ts,tsx,jsx,vue,svelte}}"
---

# Frontend Implementation Standards

## Language and Delivery

* **Language**: TypeScript
* **Target**: Responsive web app that behaves well on phones and can be installed as a PWA
* **Hosting**: S3 + CloudFront hosting static web app and PWA assets

## Mobile-First UX Requirements

* The initial product experience must be fast to learn, low friction, and usable one-handed in real-world conditions
* Fast paths to "post availability" and "see what's near me"
* Avoid heavy onboarding - collect only the minimum to provide value
* Keep language human and non-transactional

## Testing Requirements

* Lightweight component tests
* A small number of end-to-end flows for critical user journeys
* Focus on grower and searcher core workflows

## Authentication

* Integrate with Cognito user pool
* Handle JWT tokens for API authorization
* Implement token refresh logic
* Handle auth errors gracefully

## API Integration

* Call REST endpoints via HTTP API Gateway
* Handle loading states and errors appropriately
* Implement retry logic for transient failures
* Use correlation IDs for request tracking

## Observability

* Log errors and important user actions
* Include correlation IDs in API requests
* Track key user flows and conversion funnels

## Accessibility

* Ensure generated code follows accessibility best practices
* Use semantic HTML
* Provide appropriate ARIA labels
* Support keyboard navigation
* Test with screen readers when possible

## Performance

* Optimize for mobile networks
* Lazy load non-critical resources
* Minimize bundle size
* Cache static assets appropriately
* Use service workers for PWA offline support

## UX Patterns

* Show loading states during async operations
* Provide clear error messages
* Confirm destructive actions
* Use optimistic updates where appropriate
* Handle offline scenarios gracefully
