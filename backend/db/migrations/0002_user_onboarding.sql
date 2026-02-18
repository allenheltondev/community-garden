-- Migration: Add user_type and onboarding_completed to users table
-- Supports user onboarding flow feature (grower/gatherer distinction)

-- Add user_type column with CHECK constraint
ALTER TABLE users
  ADD COLUMN user_type text CHECK (user_type IN ('grower', 'gatherer'));

-- Add onboarding_completed column with default false
ALTER TABLE users
  ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;

-- Create index on user_type for efficient filtering
CREATE INDEX idx_users_user_type ON users(user_type) WHERE user_type IS NOT NULL;

-- Migrate existing users: set user_type='grower' and onboarding_completed=true
-- for users who already have a grower_profile
UPDATE users u
SET
  user_type = 'grower',
  onboarding_completed = true
WHERE EXISTS (
  SELECT 1 FROM grower_profiles gp WHERE gp.user_id = u.id
);
