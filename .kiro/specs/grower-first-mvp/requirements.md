# Requirements Document: Grower-first MVP

## Introduction

Phase 1 enables growers to track what they're growing and declare surplus availability with minimal friction. Building on Phase 0's authentication and infrastructure foundations, this phase introduces a grower-centric domain model where users maintain a garden inventory of crops/plantings, and can easily mark items as having surplus available for the community.

The primary goal is to enable a grower to track their garden and mark surplus availability from their phone in under a minute.

## Glossary

- **Grower**: A user who grows food and may have surplus to share with the community
- **Planting**: A crop or plant that a grower is actively growing in their garden (e.g., "Tomatoes - Cherokee Purple", "Zucchini")
- **Surplus**: An indication that a planting has excess produce available for the community
- **System**: The Community Food Coordination Platform (API, database, and event bus)
- **Geohash**: A hierarchical spatial index used for geographic queries
- **Availability_Window**: The period during which surplus from a planting is available for pickup or delivery
- **Event_Envelope**: The standardized structure for domain events emitted to EventBridge
- **Core_Table**: The DynamoDB table storing transactional data
- **Derived_Table**: The DynamoDB table storing computed aggregates and AI outputs
- **Correlation_ID**: A unique identifier that traces a request across all system components
- **Garden_Inventory**: The collection of all plantings a grower is tracking

## Requirements

### Requirement 1: Grower Profile Management

**User Story:** As a grower, I want to create and update my profile with contact information and location, so that I can be identified in the system and contacted by community members.

#### Acceptance Criteria

1. WHEN a user first accesses the system after authentication, THE System SHALL create a grower profile with default values if one does not exist
2. WHEN a grower updates their profile, THE System SHALL persist the changes to the Core_Table immediately
3. THE System SHALL store grower profiles with the following attributes: userId, email, firstName, lastName, phoneNumber (optional), preferredContactMethod, and locationContext (geohash)
4. WHEN a grower profile is created or updated, THE System SHALL emit a domain event to the EventBridge bus
5. THE System SHALL validate that email addresses follow standard email format
6. THE System SHALL validate that phone numbers, when provided, contain only digits, spaces, hyphens, and parentheses

### Requirement 2: Add Planting to Garden Inventory

**User Story:** As a grower, I want to add crops to my garden inventory, so that I can track what I'm growing and later mark surplus availability.

#### Acceptance Criteria

1. WHEN a grower adds a new planting with valid data, THE System SHALL create the planting in the Core_Table with a unique planting ID
2. THE System SHALL require the following fields for planting creation: cropName and plantedDate
3. THE System SHALL accept optional fields: variety, notes, estimatedHarvestDate, and quantity
4. WHEN a planting is created, THE System SHALL default the surplus status to false
5. WHEN a planting is created, THE System SHALL use the grower's profile location as the planting location
6. WHEN a planting is created, THE System SHALL emit a planting.created event to the EventBridge bus with the Event_Envelope structure
7. THE System SHALL generate planting IDs using UUIDs to ensure uniqueness
8. WHEN a planting is created, THE System SHALL store the Correlation_ID from the request context
9. THE System SHALL validate that plantedDate is not in the future

### Requirement 3: Update Planting Information

**User Story:** As a grower, I want to update my planting information to reflect changes in my garden, so that my inventory stays accurate.

#### Acceptance Criteria

1. WHEN a grower updates their own planting with valid data, THE System SHALL persist the changes to the Core_Table
2. WHEN a grower attempts to update a planting they do not own, THE System SHALL reject the request with an authorization error
3. WHEN a planting is updated, THE System SHALL validate all field constraints as defined in Requirement 2
4. WHEN a planting is updated, THE System SHALL emit a planting.updated event to the EventBridge bus
5. WHEN a planting is updated, THE System SHALL preserve the original creation timestamp
6. THE System SHALL allow updates to cropName, variety, notes, plantedDate, estimatedHarvestDate, and quantity
7. THE System SHALL prevent updates to plantingId and userId

### Requirement 4: Mark Planting as Having Surplus

**User Story:** As a grower, I want to mark a planting as having surplus available, so that community members can see what I have to share.

#### Acceptance Criteria

1. WHEN a grower marks a planting as having surplus, THE System SHALL update the planting record with surplus status true
2. WHEN marking surplus, THE System SHALL require the following fields: availableQuantity, unit, availableFrom (timestamp), and availableUntil (timestamp)
3. WHEN marking surplus, THE System SHALL accept optional fields: pickupInstructions and imageUrl
4. WHEN marking surplus, THE System SHALL validate that availableUntil is after availableFrom
5. WHEN marking surplus, THE System SHALL validate that availableFrom is not in the past
6. WHEN marking surplus, THE System SHALL validate that availableQuantity is a positive number
7. WHEN a planting is marked as having surplus, THE System SHALL emit a surplus.available event to the EventBridge bus
8. WHEN a planting is marked as having surplus, THE System SHALL compute and store geohash values at multiple precision levels for geographic indexing

### Requirement 5: Update Surplus Availability

**User Story:** As a grower, I want to update surplus details to reflect changes in quantity or availability, so that the information remains accurate.

#### Acceptance Criteria

1. WHEN a grower updates surplus details for their own planting, THE System SHALL persist the changes to the Core_Table
2. WHEN a grower attempts to update surplus for a planting they do not own, THE System SHALL reject the request with an authorization error
3. THE System SHALL allow updates to availableQuantity, unit, availableFrom, availableUntil, pickupInstructions, and imageUrl
4. WHEN surplus details are updated, THE System SHALL validate all field constraints as defined in Requirement 4
5. WHEN surplus details are updated, THE System SHALL emit a surplus.updated event to the EventBridge bus

### Requirement 6: Remove Surplus Availability

**User Story:** As a grower, I want to mark surplus as no longer available when it's been claimed or consumed, so that community members don't see outdated availability.

#### Acceptance Criteria

1. WHEN a grower removes surplus availability from their planting, THE System SHALL update the planting record with surplus status false
2. WHEN surplus is removed, THE System SHALL clear the surplus-related fields: availableQuantity, unit, availableFrom, availableUntil, pickupInstructions, and imageUrl
3. WHEN surplus is removed, THE System SHALL preserve the planting record and its core information
4. WHEN surplus is removed, THE System SHALL emit a surplus.removed event to the EventBridge bus

### Requirement 7: View My Garden Inventory

**User Story:** As a grower, I want to view all my plantings in one place, so that I can see what I'm growing and manage my garden.

#### Acceptance Criteria

1. WHEN a grower requests their garden inventory, THE System SHALL return all plantings owned by that grower ordered by plantedDate descending
2. THE System SHALL include the following fields in the response: plantingId, cropName, variety, plantedDate, estimatedHarvestDate, quantity, notes, hasSurplus, and surplus details if available
3. WHEN a grower has no plantings, THE System SHALL return an empty list
4. THE System SHALL use the authenticated user's userId from the JWT context to determine ownership
5. THE System SHALL include both plantings with and without surplus in the inventory view

### Requirement 8: Discover Available Surplus in Community

**User Story:** As a grower, I want to see what surplus is available in my area, so that I can verify my surplus appears correctly and understand what others are sharing.

#### Acceptance Criteria

1. WHEN a user requests available surplus by location, THE System SHALL return only plantings with surplus status true within the specified geohash prefix
2. THE System SHALL accept a geohash precision parameter to control search radius
3. THE System SHALL return surplus items ordered by availableFrom timestamp ascending
4. THE System SHALL filter out surplus where availableUntil is in the past
5. THE System SHALL include the following fields in the response: plantingId, cropName, variety, availableQuantity, unit, availableFrom, availableUntil, pickupInstructions, imageUrl, and grower contact information
6. WHEN no surplus matches the search criteria, THE System SHALL return an empty list
7. THE System SHALL limit search results to a maximum of 100 items per request

### Requirement 9: Event Emission

**User Story:** As a system architect, I want all write operations to emit domain events, so that future async workers can process changes without coupling to the API.

#### Acceptance Criteria

1. WHEN a profile is created, THE System SHALL emit a user.profile.created event
2. WHEN a profile is updated, THE System SHALL emit a user.profile.updated event
3. WHEN a planting is created, THE System SHALL emit a planting.created event
4. WHEN a planting is updated, THE System SHALL emit a planting.updated event
5. WHEN surplus is marked available, THE System SHALL emit a surplus.available event
6. WHEN surplus details are updated, THE System SHALL emit a surplus.updated event
7. WHEN surplus is removed, THE System SHALL emit a surplus.removed event
8. THE System SHALL use the Event_Envelope structure for all events with fields: version, eventType, correlationId, timestamp, userId, source, and payload
9. THE System SHALL set the source field to "api" for all events emitted by the API
10. THE System SHALL include the full entity state in the event payload
11. WHEN event emission fails, THE System SHALL log the error but not fail the write operation
12. THE System SHALL emit events asynchronously after the database write succeeds

### Requirement 10: API Idempotency

**User Story:** As a mobile app developer, I want write operations to be idempotent, so that network retries don't create duplicate plantings or surplus records.

#### Acceptance Criteria

1. THE System SHALL accept an Idempotency-Key header for all write operations
2. WHEN a request with an Idempotency-Key is received, THE System SHALL check if a request with that key has been processed within the last 24 hours
3. WHEN a duplicate Idempotency-Key is detected, THE System SHALL return the cached response without re-executing the operation
4. WHEN an Idempotency-Key is not provided, THE System SHALL process the request normally without idempotency checks
5. THE System SHALL store idempotency records in the Core_Table with a 24-hour TTL
6. THE System SHALL include the original response status code and body in the cached response

### Requirement 11: Data Validation and Error Handling

**User Story:** As a grower, I want clear error messages when I submit invalid data, so that I can correct my input and successfully manage my garden inventory.

#### Acceptance Criteria

1. WHEN required fields are missing, THE System SHALL return a 400 error with a message listing the missing fields
2. WHEN field values violate constraints, THE System SHALL return a 400 error with a message describing the constraint violation
3. WHEN a user attempts to access a resource they don't own, THE System SHALL return a 403 error
4. WHEN a requested resource does not exist, THE System SHALL return a 404 error
5. WHEN an unexpected error occurs, THE System SHALL return a 500 error and log the full error context with Correlation_ID
6. THE System SHALL validate all input data before performing database operations
7. THE System SHALL return error responses in a consistent JSON format with fields: error, message, and correlationId

### Requirement 12: Geographic Indexing

**User Story:** As a system architect, I want surplus indexed by geohash at multiple precision levels, so that geographic queries are efficient and can support variable search radii.

#### Acceptance Criteria

1. WHEN a planting is marked as having surplus, THE System SHALL compute geohash values at precision levels 4, 5, and 6
2. THE System SHALL store geohash values in a format that enables efficient querying by prefix
3. WHEN surplus availability is removed, THE System SHALL remove the geohash index entries
4. THE System SHALL use geohash precision 6 (approximately 1.2km x 0.6km) as the default for local searches
5. THE System SHALL support expanding search radius by querying lower precision geohashes

### Requirement 13: Mobile-Optimized Response Times

**User Story:** As a grower using a mobile device, I want the app to respond quickly, so that I can manage my garden without frustration.

#### Acceptance Criteria

1. WHEN a planting is created, THE System SHALL respond within 1000ms under normal load
2. WHEN a grower requests their garden inventory, THE System SHALL respond within 500ms under normal load
3. WHEN a geographic search for surplus is performed, THE System SHALL respond within 800ms under normal load
4. THE System SHALL use DynamoDB query operations rather than scan operations for all data retrieval
5. THE System SHALL minimize the number of database round trips per API request

### Requirement 14: Correlation ID Propagation

**User Story:** As a system operator, I want all operations to include correlation IDs, so that I can trace requests across logs and debug issues.

#### Acceptance Criteria

1. WHEN a request includes an X-Correlation-Id header, THE System SHALL use that value for all logging and event emission
2. WHEN a request does not include an X-Correlation-Id header, THE System SHALL generate a new UUID
3. THE System SHALL include the Correlation_ID in all log entries for a request
4. THE System SHALL include the Correlation_ID in all emitted events
5. THE System SHALL return the Correlation_ID in the X-Correlation-Id response header
6. THE System SHALL include the Correlation_ID in all error responses

### Requirement 15: Automatic Surplus Expiration

**User Story:** As a grower, I want surplus to automatically become unavailable after the time window expires, so that I don't have to manually remove old surplus.

#### Acceptance Criteria

1. THE System SHALL filter out expired surplus from all query results
2. THE System SHALL consider surplus expired when the current time is after availableUntil
3. THE System SHALL retain expired surplus information in the planting record for historical analysis
4. WHEN surplus expires naturally, THE System SHALL emit a surplus.expired event
5. THE System SHALL check for newly expired surplus periodically and emit events for them

### Requirement 16: Remove Planting from Garden Inventory

**User Story:** As a grower, I want to remove plantings from my inventory when they're no longer relevant, so that my garden view stays current.

#### Acceptance Criteria

1. WHEN a grower removes a planting they own, THE System SHALL delete the planting record from the Core_Table
2. WHEN a grower attempts to remove a planting they do not own, THE System SHALL reject the request with an authorization error
3. WHEN a planting with active surplus is removed, THE System SHALL also remove the surplus availability
4. WHEN a planting is removed, THE System SHALL emit a planting.removed event to the EventBridge bus
5. THE System SHALL include the full planting state in the removal event for audit purposes
