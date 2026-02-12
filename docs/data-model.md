erDiagram
  USERS ||--|| GROWER_PROFILES : has
  USERS ||--o{ GROWER_CROP_LIBRARY : maintains
  USERS ||--o{ SURPLUS_LISTINGS : creates
  USERS ||--o{ REQUESTS : creates
  USERS ||--o{ CLAIMS : makes
  USERS ||--o{ RATINGS : gives
  USERS ||--o{ REPORTS : files
  USERS ||--|| USER_RATING_SUMMARY : has

  CROPS ||--o{ CROP_VARIETIES : has
  CROPS ||--|| CROP_PROFILES : has_default_profile
  CROP_VARIETIES ||--o| CROP_PROFILES : may_override_profile

  CROPS ||--o{ CROP_ZONE_SUITABILITY : suited_for
  CROP_VARIETIES ||--o| CROP_ZONE_SUITABILITY : may_override_suitability

  CROPS ||--o{ GROWER_CROP_LIBRARY : referenced_by
  CROP_VARIETIES ||--o| GROWER_CROP_LIBRARY : referenced_by

  GROWER_CROP_LIBRARY ||--o{ SURPLUS_LISTINGS : may_generate
  CROPS ||--o{ SURPLUS_LISTINGS : listed_as
  CROP_VARIETIES ||--o| SURPLUS_LISTINGS : listed_as

  CROPS ||--o{ REQUESTS : requested_as
  CROP_VARIETIES ||--o| REQUESTS : requested_as

  SURPLUS_LISTINGS ||--o{ CLAIMS : receives
  REQUESTS ||--o{ CLAIMS : fulfilled_by

  CLAIMS ||--o{ RATINGS : rated_in
  SURPLUS_LISTINGS ||--o{ LISTING_IMAGES : has

  REPORTS }o--|| SURPLUS_LISTINGS : may_reference
  REPORTS }o--|| USERS : may_reference
  REPORTS }o--|| CLAIMS : may_reference

  USERS {
    uuid id PK
    text email
    text display_name
    boolean is_verified
    timestamptz created_at
    timestamptz deleted_at "soft delete"
  }

  USER_RATING_SUMMARY {
    uuid user_id PK, FK "references USERS"
    numeric avg_score
    int rating_count
    timestamptz updated_at
  }

  GROWER_PROFILES {
    uuid user_id PK, FK
    text home_zone
    text geo_key "geohash for location"
    float lat "optional for distance"
    float lng "optional for distance"
    numeric share_radius_km "willing to share within radius"
    text units "metric/imperial"
    text locale
  }

  CROPS {
    uuid id PK
    text slug
    text common_name
    text scientific_name
    text category
    text description
  }

  CROP_VARIETIES {
    uuid id PK
    uuid crop_id FK
    text slug
    text name
    text description
  }

  CROP_PROFILES {
    uuid id PK
    uuid crop_id FK
    uuid variety_id FK "nullable"
    int seed_depth_mm
    int spacing_in_row_mm
    int row_spacing_mm
    int days_to_germination_min
    int days_to_germination_max
    int days_to_maturity_min
    int days_to_maturity_max
    text sun_requirement
    text water_requirement
    text sow_method
    jsonb attributes
  }

  CROP_ZONE_SUITABILITY {
    uuid id PK
    uuid crop_id FK
    uuid variety_id FK "nullable"
    text system
    int min_zone
    char min_subzone
    int max_zone
    char max_subzone
    text notes
  }

  GROWER_CROP_LIBRARY {
    uuid id PK
    uuid user_id FK
    uuid crop_id FK
    uuid variety_id FK "nullable"
    text status

    text visibility_scope "private|local|public"
    boolean surplus_enabled "fast-path to create listings"

    text nickname
    text default_unit "default unit for quick listings"
    text notes
  }

  SURPLUS_LISTINGS {
    uuid id PK
    uuid user_id FK
    uuid grower_crop_id FK "nullable link to library"
    uuid crop_id FK
    uuid variety_id FK "nullable"

    text title

    text unit "bunch|lb|bag|each|unspecified"
    numeric quantity_total "nullable for unspecified"
    numeric quantity_remaining "inventory model; decremented transactionally"

    timestamptz available_start
    timestamptz available_end

    text status "active|pending|claimed|expired|completed"

    text pickup_location_text "approx location, safe to show earlier"
    text pickup_address "sensitive; disclose based on policy"
    text pickup_disclosure_policy "immediate|after_confirmed|after_accepted"
    text pickup_notes
    text contact_preference "app_message|phone|knock"

    text geo_key "geohash or area key"
    float lat "optional for distance"
    float lng "optional for distance"

    timestamptz created_at
    timestamptz deleted_at "soft delete"
  }

  LISTING_IMAGES {
    uuid id PK
    uuid listing_id FK
    text url
    int sort_order
    timestamptz created_at
  }

  REQUESTS {
    uuid id PK
    uuid user_id FK
    uuid crop_id FK
    uuid variety_id FK "nullable"

    text unit
    numeric quantity
    timestamptz needed_by
    text notes

    text geo_key
    float lat "optional for distance"
    float lng "optional for distance"

    text status "open|matched|closed"
    timestamptz created_at
    timestamptz deleted_at "soft delete"
  }

  CLAIMS {
    uuid id PK

    uuid listing_id FK "required"
    uuid request_id FK "nullable, allows request fulfillment"
    uuid claimer_id FK "references USERS"

    numeric quantity_claimed "must be > 0"
    text status "pending|confirmed|completed|cancelled|no_show"
    text notes "coordination notes"

    timestamptz claimed_at
    timestamptz confirmed_at
    timestamptz completed_at
    timestamptz cancelled_at

    text constraint_notes "DB constraints enforce listing_id not null; status logic in app"
  }

  RATINGS {
    uuid id PK
    uuid claim_id FK "required transaction anchor"
    uuid rater_id FK "user giving rating"
    uuid rated_id FK "user receiving rating"

    int score "1-5"
    text comment
    text context "as_giver|as_receiver"

    timestamptz created_at

    text uniqueness_notes "unique(claim_id, rater_id, context)"
  }

  REPORTS {
    uuid id PK
    uuid reporter_id FK
    uuid reported_user_id FK "nullable"
    uuid listing_id FK "nullable"
    uuid claim_id FK "nullable"

    text reason "spam|inappropriate|safety_concern|other"
    text description
    text status "pending|reviewed|resolved"

    timestamptz created_at
    timestamptz resolved_at
  }
