# Implementation Tasks: User Onboarding Flow

## 1. Database Schema Updates

### 1.1 Update PostgreSQL users table schema

* [x] Add `user_type` column with CHECK constraint for `'grower'` and `'gatherer'`
* [x] Add `onboarding_completed` boolean column with default `false`
* [x] Create index on `user_type`
* [x] Write migration for existing users (set `user_type='grower'` and `onboarding_completed=true` when a grower_profile exists)
  **Validates**: Requirements 5.1, 5.2, 5.4, 10.1, 10.2

### 1.2 Create PostgreSQL gatherer_profiles table

* [x] Create `gatherer_profiles` table (user_id PK/FK, geo_key, lat, lng, search_radius_km, organization_affiliation, units, locale, created_at, updated_at)
* [x] Add constraints for radius > 0 and lat/lng ranges
* [x] Add index on `geo_key`
  **Validates**: Requirements 5.3, 5.7

### 1.3 DynamoDB schema updates (if DynamoDB mode is enabled)

* [ ] Update USER#<id> / PROFILE item to include `userType` and `onboardingCompleted`
* [ ] Define GATHERER_PROFILE item structure wit
 response supports "resume onboarding": return `userType` even when `onboardingCompleted=false`
* [ ] Handle both PostgreSQL and DynamoDB data sources
  **Validates**: Requirements 8.1, 1.4

### 2.2 Implement PUT /me endpoint (single endpoint)

* [x] Accept `userType`, `growerProfile`, `gathererProfile`, and optional `displayName`
* [x] Validate that only one profile type is provided per request
* [x] Validate profile data matches `userType` (reject growerProfile for gatherer, and vice versa)
* [x] Implement server-side geohash calculation from lat/lng and persist `geo_key`
* [x] Persist `userType` to user record
* [x] Upsert grower_profile or gatherer_profile based on `userType`
* [x] Set `onboarding_completed=true` once required role-specific profile fields are present and persisted
* [x] Return updated user profile including the relevant profile object
* [ ] Support both PostgreSQL and DynamoDB storage
* [x] Define idempotency behavior: repeated PUT /me with same payload MUST be safe (upsert semantics)
  **Validates**: Requirements 8.2, 8.3, 8.4, 8.5, 8.6, 8.8, 8.9

### 2.3 Add validation logic for PUT /me

* [x] Validate shareRadiusKm > 0 for growers
* [x] Validate searchRadiusKm > 0 for gatherers
* [x] Validate lat in range [-90, 90]
* [x] Validate lng in range [-180, 180]
* [x] Validate homeZone format for growers
* [x] Validate units in {'metric', 'imperial'}
* [x] Return 400 Bad Request with clear error messages for validation failures
  **Validates**: Requirements 3.9, 3.10, 4.9, 4.10, 8.6, 8.7

### 2.4 Implement authorization module updates

* [x] Define UserType enum (Grower, Gatherer)
* [x] Add user_type to AuthContext struct
* [x] Update extract_auth_context to parse user_type from JWT
* [x] Implement require_grower() function
* [x] Implement require_user_type() function
  **Validates**: Requirements 6.6, 6.7

### 2.5 Add feature access control to protected endpoints

* [x] Add authorization check to listing creation endpoint (403 for gatherers)
* [x] Add authorization check to grower management endpoints (403 for gatherers)
* [x] Ensure growers have full access to all features
* [x] Ensure gatherers can create requests
* [x] Ensure gatherers can create claims
  **Validates**: Requirements 6.1, 6.2, 6.3, 6.4, 6.5

---

## 3. Backend Type Definitions

### 3.1 Define Rust types for onboarding

* [x] Create UserType enum with Grower and Gatherer variants
* [x] Update User struct to include user_type and onboarding_completed
* [x] Create GrowerProfileInput struct
* [x] Create GathererProfileInput struct
* [x] Create PutMeRequest struct with optional fields
* [x] Add serde annotations for camelCase serialization
  **Validates**: Requirements 5.1, 5.2

---

## 4. Frontend Components

### 4.1 Create OnboardingGuard component

* [x] Implement component that wraps main app
* [x] Check user.onboardingCompleted status
* [x] Show loading screen while fetching user data
* [x] Redirect to OnboardingFlow if onboarding incomplete
* [x] Render children if onboarding complete
  **Validates**: Requirements 1.1, 1.2, 7.1, 7.2

### 4.2 Create OnboardingFlow orchestrator component

* [x] Implement state management for onboarding steps
* [x] Track current step: 'user-type', 'grower-wizard', or 'gatherer-wizard'
* [x] Track selected userType
* [x] Resume correct step if userType already set but onboarding incomplete
* [x] Render appropriate step component based on state
* [x] Handle navigation between steps
  **Validates**: Requirements 2.1, 1.4, 7.3

### 4.3 Create UserTypeSelection component

* [x] Display two cards for Grower and Gatherer options
* [x] Provide clear, human-readable descriptions for each type
* [x] Handle selection and call onSelect callback
* [x] Prevent proceeding without selection
* [x] Optionally persist userType via PUT /me immediately
  **Validates**: Requirements 2.2, 2.3, 2.4, 2.5, 2.6

### 4.4 Create GrowerWizard component

* [x] Implement multi-step form for grower data collection
* [x] Collect homeZone
* [x] Collect location (lat, lng) with geolocation support
* [x] Collect shareRadiusKm
* [x] Collect units preference
* [x] Collect locale preference
* [x] Show progress indicators
* [x] Validate inputs in real-time
* [x] Call PUT /me with userType: 'grower' and growerProfile on completion
  **Validates**: Requirements 3.1–3.10, 9.5, 9.6

### 4.5 Create GathererWizard component

* [x] Implement multi-step form for gatherer data collection
* [x] Collect location (lat, lng) with geolocation support
* [x] Collect searchRadiusKm
* [x] Collect optional organizationAffiliation
* [x] Collect units preference
* [x] Collect locale preference
* [x] Show progress indicators
* [x] Validate inputs in real-time
* [x] Call PUT /me with userType: 'gatherer' and gathererProfile on completion
  **Validates**: Requirements 4.1–4.10, 9.5, 9.6

### 4.6 Implement mobile-first styling for onboarding components

* [x] Apply mobile-friendly layouts to all onboarding components
* [x] Ensure one-handed interaction patterns
* [x] Use clear, human language in prompts
* [x] Minimize required fields
* [x] Add helpful field descriptions
* [x] Test on mobile devices
  **Validates**: Requirements 9.1–9.7

---

## 5. Frontend Type Definitions

### 5.1 Define TypeScript types for onboarding

* [x] Create UserType type ('grower' | 'gatherer')
* [x] Update User interface to include userType and onboardingCompleted
* [x] Create GrowerProfile interface
* [x] Create GathererProfile interface
* [x] Update User interface to include optional growerProfile and gathererProfile
  **Validates**: Requirements 5.1, 5.2

---

## 6. API Integration

### 6.1 Update useUser hook

* [x] Fetch user data including onboardingCompleted and userType
* [x] Include growerProfile and gathererProfile in response
* [x] Handle loading and error states
  **Validates**: Requirements 1.1, 1.2, 8.1

### 6.2 Create useOnboarding hook (client helpers; all call PUT /me)

* [x] Implement submitUserType (PUT /me)
* [x] Implement submitGrowerProfile (PUT /me)
* [x] Implement submitGathererProfile (PUT /me)
* [x] Handle API errors and validation messages
* [x] Update local user state on success
  **Validates**: Requirements 2.3, 3.7, 3.8, 4.7, 4.8

---

## 7. Progressive Disclosure and Routing

### 7.1 Update app routing logic

* [x] Wrap main app routes with OnboardingGuard
* [x] Redirect incomplete onboarding users to OnboardingFlow
* [x] Allow completed users to access main app
* [x] Support resumable onboarding if interrupted
  **Validates**: Requirements 1.4, 7.1–7.5

---

## 8. Testing

### 8.1 Unit tests for backend validation

* [x] Radius validation (must be > 0)
* [x] lat/lng range validation
* [x] homeZone format validation
* [x] units validation
* [x] userType validation
* [x] profile/userType mismatch validation (reject wrong profile for selected type)
  **Validates**: Requirements 3.9, 3.10, 4.9, 4.10, 8.6, 8.7

### 8.2 Unit tests for authorization module

* [x] require_grower() with grower user
* [x] require_grower() with gatherer user (should fail)
* [x] require_user_type() with matching type
* [x] require_user_type() with non-matching type
  **Validates**: Requirements 6.1, 6.2, 6.3

### 8.3 Integration tests for GET /me

* [x] Response includes userType and onboardingCompleted
* [x] Response includes growerProfile for growers
* [x] Response includes gathererProfile for gatherers
* [x] Response supports resume onboarding (userType set, onboardingCompleted=false)
  **Validates**: Requirements 8.1, 1.4

### 8.4 Integration tests for PUT /me

* [x] userType selection persistence
* [x] grower profile upsert
* [x] gatherer profile upsert
* [x] onboarding_completed set after required profile data persisted
* [x] validation error responses
* [x] idempotency via upsert (repeat same request is safe)
  **Validates**: Requirements 8.2–8.9

### 8.5 Integration tests for feature access control

* [x] gatherer blocked from creating listing (403)
* [x] gatherer blocked from grower endpoints (403)
* [x] grower allowed to create listing
* [x] gatherer allowed to create request
* [x] gatherer allowed to create claim
  **Validates**: Requirements 6.1–6.5

### 8.6 Frontend component tests

* [ ] OnboardingGuard redirects incomplete users
* [ ] OnboardingGuard allows complete users
* [ ] UserTypeSelection prevents proceeding without selection
* [ ] GrowerWizard validates required fields
* [ ] GathererWizard validates required fields
* [ ] OnboardingFlow resumes correctly if interrupted
  **Validates**: Requirements 2.4, 7.1–7.5, 1.4

---

## 9. Data Migration

### 9.1 Migration script for existing users

* [ ] Set user_type = 'grower' for users with existing grower_profiles
* [ ] Set onboarding_completed = true for users with existing grower_profiles
* [ ] Test migration on staging
* [ ] Document rollback procedure
  **Validates**: Requirements 10.1, 10.2, 10.3, 10.5

---

## 10. Documentation and Deployment

### 10.1 Update API documentation

* [x] Document GET /me response schema
* [x] Document PUT /me request/response schemas (grower vs gatherer payloads)
* [x] Document validation rules
* [x] Document authorization requirements
  **Validates**: Requirements 8.1–8.7

### 10.2 Update OpenAPI specification

* [x] Add userType and onboardingCompleted to user schema
* [x] Add growerProfile and gathererProfile schemas
* [x] Add PUT /me endpoint definition (single endpoint)
* [x] Add error response schemas
  **Validates**: Requirements 8.1–8.7

### 10.3 Deploy database migrations

* [ ] Run PostgreSQL migrations in staging
* [ ] Verify DynamoDB item updates (if enabled)
* [ ] Run data migration script
* [ ] Verify no data loss
  **Validates**: Requirements 5.1–5.3, 10.3, 10.4

### 10.4 Deploy backend changes

* [ ] Deploy updated backend
* [ ] Verify GET /me returns new fields and supports resume
* [ ] Verify PUT /me accepts new payloads and upserts profiles
* [ ] Verify authorization checks work correctly
  **Validates**: Requirements 6.1–6.7, 8.1–8.9

### 10.5 Deploy frontend changes

* [ ] Deploy updated PWA
* [ ] Verify onboarding flow appears for new users
* [ ] Verify existing users bypass onboarding
* [ ] Test on mobile devices
  **Validates**: Requirements 1.1, 1.2, 7.1, 7.2, 9.1
