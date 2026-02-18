Absolutely 👍 — here is the **full, clean, aligned Requirements Document** with:

* **Grower / Gatherer terminology**
* **Single `PUT /me` endpoint decision**
* **Dropped over-engineering items**
* **Resume onboarding**
* **Server-side geohash improvement added**
* Consistent wording with your design doc

---

# Requirements Document: User Onboarding Flow

## Introduction

This feature introduces a first-time user onboarding flow for the Community Food Coordination Platform. The platform serves two distinct user types: **Growers** (people who grow food and share surplus) and **Gatherers** (individuals and organizations who look for and collect available food). Currently, only growers are supported in the database schema. This feature will add support for **Gatherers** and create a guided onboarding experience that collects the minimum required information to provide value to each user type.

The onboarding flow will detect first-time users after authentication, present a participation mode selection, and guide them through a wizard that collects role-specific information. The system will enforce feature access control based on user type, ensuring Gatherers cannot access gardening management features while Growers have full access to all platform capabilities.

The onboarding experience is designed to be low-friction, mobile-first, and resumable if interrupted.

---

## Glossary

* **System**: The Community Food Coordination Platform backend and frontend
* **Grower**: A user who grows food and wants to share surplus with the community
* **Gatherer**: A user (individual, non-profit, social worker, or community organization) who looks for and collects available food
* **Onboarding_Flow**: The guided wizard experience for first-time users
* **User_Profile**: The core user record in the database
* **Grower_Profile**: Extended profile information specific to growers
* **Gatherer_Profile**: Extended profile information specific to gatherers
* **Listing**: A declaration of available surplus food (grower-only feature)
* **Request**: A declaration of food need (available to both user types)
* **Claim**: An action to fulfill a listing or request (available to both user types)
* **Onboarding_Status**: A flag indicating whether a user has completed onboarding
* **Geo Key / Geohash**: A derived geographic index calculated from latitude and longitude for proximity queries

---

## Requirements

### Requirement 1: First-Time User Detection

**User Story:**
As a first-time user, I want the system to detect that I haven't completed onboarding, so that I am guided through the setup process.

#### Acceptance Criteria

1. WHEN a user signs in for the first time, THE System SHALL detect that the user has not completed onboarding
2. WHEN a user has completed onboarding, THE System SHALL allow direct access to the main application
3. THE System SHALL store an onboarding completion flag in the User_Profile
4. THE System SHALL allow partial onboarding state to be resumed if interrupted

---

### Requirement 2: Participation Mode Selection

**User Story:**
As a new user, I want to select how I participate on the platform, so that I receive relevant features and guidance.

#### Acceptance Criteria

1. THE System SHALL display a participation selection screen after authentication if onboarding is incomplete
2. THE System SHALL provide clear, human-readable descriptions for Grower and Gatherer participation modes
3. WHEN a user selects a participation mode, THE System SHALL store the selection in the User_Profile
4. THE System SHALL prevent users from proceeding without selecting a participation mode
5. WHEN a user selects Grower, THE System SHALL proceed to the grower-specific onboarding wizard
6. WHEN a user selects Gatherer, THE System SHALL proceed to the gatherer-specific onboarding wizard

---

### Requirement 3: Grower Onboarding Wizard

**User Story:**
As a new Grower, I want to provide my growing zone, location, and preferences, so that the system can help me share surplus effectively.

#### Acceptance Criteria

1. WHEN a user selects Grower, THE System SHALL display a wizard collecting grower-specific information
2. THE System SHALL collect the user's home growing zone
3. THE System SHALL collect the user's geographic location (latitude and longitude)
4. THE System SHALL collect the user's share radius
5. THE System SHALL collect the user's units preference
6. THE System SHALL collect the user's locale preference
7. WHEN all required grower information is provided, THE System SHALL persist Grower_Profile data associated with the user
8. WHEN the Grower_Profile data is successfully persisted, THE System SHALL mark onboarding as complete
9. THE System SHALL validate that share radius is a positive number
10. THE System SHALL validate that latitude and longitude values are within valid geographic ranges

---

### Requirement 4: Gatherer Onboarding Wizard

**User Story:**
As a new Gatherer, I want to provide my location and search preferences, so that the system can help me find available food nearby.

#### Acceptance Criteria

1. WHEN a user selects Gatherer, THE System SHALL display a wizard collecting gatherer-specific information
2. THE System SHALL collect the user's geographic location (latitude and longitude)
3. THE System SHALL collect the user's search radius
4. THE System SHALL collect an optional organization affiliation
5. THE System SHALL collect the user's units preference
6. THE System SHALL collect the user's locale preference
7. WHEN all required gatherer information is provided, THE System SHALL persist Gatherer_Profile data associated with the user
8. WHEN the Gatherer_Profile data is successfully persisted, THE System SHALL mark onboarding as complete
9. THE System SHALL validate that search radius is a positive number
10. THE System SHALL validate that latitude and longitude values are within valid geographic ranges

---

### Requirement 5: Database Schema Updates

**User Story:**
As a system architect, I want the database to support both Growers and Gatherers, so that the platform can serve both user types effectively.

#### Acceptance Criteria

1. THE System SHALL add a `user_type` field to the User_Profile (values: `"grower"` or `"gatherer"`)
2. THE System SHALL add an `onboarding_completed` field to the User_Profile
3. THE System SHALL create a `Gatherer_Profile` table or equivalent storage structure with fields:
   `user_id, geo_key, lat, lng, search_radius_km, organization_affiliation, units, locale`
4. THE System SHALL enforce that `user_type` is set before onboarding is marked complete
5. WHEN a user is a Grower and onboarding_completed is true, THE System SHALL require a Grower_Profile record
6. WHEN a user is a Gatherer and onboarding_completed is true, THE System SHALL require a Gatherer_Profile record
7. THE System SHALL enforce referential integrity between User_Profile and profile tables or items
8. THE System SHALL support both PostgreSQL and DynamoDB storage patterns

---

### Requirement 6: Feature Access Control

**User Story:**
As a system administrator, I want to enforce feature access based on participation mode, so that Gatherers cannot access grower-specific management features.

#### Acceptance Criteria

1. WHEN a Gatherer attempts to create a Listing, THE System SHALL return a 403 Forbidden error
2. WHEN a Gatherer attempts to access grower management endpoints, THE System SHALL return a 403 Forbidden error
3. WHEN a Grower accesses any feature, THE System SHALL allow the action
4. WHEN a Gatherer creates a Request, THE System SHALL allow the action
5. WHEN a Gatherer creates a Claim, THE System SHALL allow the action
6. THE System SHALL check `user_type` before processing protected endpoints
7. THE System SHALL include `user_type` in the JWT context for fast authorization checks

---

### Requirement 7: Progressive Disclosure and Blocking

#### Acceptance Criteria

1. WHEN a user has not completed onboarding, THE System SHALL display the Onboarding_Flow
2. WHEN a user attempts to access the main application without completing onboarding, THE System SHALL redirect to the Onboarding_Flow
3. WHEN a user completes onboarding, THE System SHALL redirect to the main application
4. THE System SHALL allow users to update their profile information after onboarding
5. THE System SHALL not allow users to skip required onboarding steps

---

### Requirement 8: API Endpoints for Onboarding

#### Acceptance Criteria

1. GET `/me` SHALL return the user profile including `user_type` and `onboarding_completed`
2. PUT `/me` SHALL accept participation mode selection and persist it to the User_Profile
3. PUT `/me` SHALL accept Grower profile data when `user_type` is `"grower"` and persist it to Grower_Profile storage
4. PUT `/me` SHALL accept Gatherer profile data when `user_type` is `"gatherer"` and persist it to Gatherer_Profile storage
5. WHEN required role-specific profile data is successfully persisted, THE System SHALL set `onboarding_completed = true`
6. THE System SHALL validate all profile data before persisting
7. THE System SHALL return appropriate validation error messages
8. Operations SHALL be idempotent where appropriate
9. THE System SHALL compute and persist a geographic key (`geo_key` / geohash) from latitude and longitude on the server side

---

### Requirement 9: User Experience and Mobile-First Design

**User Story:**
As a mobile user, I want a fast, low-friction onboarding experience, so that I can start using the platform quickly.

#### Acceptance Criteria

1. THE System SHALL display the onboarding wizard in a mobile-friendly format
2. THE System SHALL use clear, human language in all onboarding prompts
3. THE System SHALL minimize the number of required fields to reduce friction
4. THE System SHALL provide helpful descriptions for each field
5. THE System SHALL show progress indicators during multi-step wizards
6. THE System SHALL validate input in real-time and show clear error messages
7. THE System SHALL support one-handed mobile interaction patterns

---

### Requirement 10: Data Migration and Backward Compatibility

**User Story:**
As a system administrator, I want existing grower users to continue working without disruption, so that the platform remains stable during rollout.

#### Acceptance Criteria

1. WHEN an existing user without `user_type` is detected, THE System SHALL default their `user_type` to `"grower"`
2. WHEN an existing user without `onboarding_completed` is detected, THE System SHALL default it to `true` if they have an existing Grower_Profile
3. THE System SHALL support gradual migration of existing users to the new schema
4. THE System SHALL not break existing API contracts during migration
5. WHEN a user has a Grower_Profile but no `user_type`, THE System SHALL infer `user_type` as `"grower"`
