-- Migration 0039: Drop the "gatherer" concept.
--
-- GRN is now individual-growing-first: everyone is a grower, and the
-- "find food nearby" feature is reframed as grower-to-grower (requests are
-- sourced from the requester's grower profile location). There are no
-- gatherer users, so we remove the gatherer profile table and restrict
-- users.user_type to 'grower'.

-- 1. Migrate any legacy gatherer rows to grower (no-op when none exist).
update users set user_type = 'grower' where user_type = 'gatherer';

-- 2. Drop the gatherer profile table (takes its index + constraints with it).
--    requests/claims key on users(id), not gatherer_profiles, so they are
--    unaffected.
drop table if exists gatherer_profiles cascade;

-- 3. Restrict the user_type check to grower only.
alter table users drop constraint if exists users_user_type_check;
alter table users add constraint users_user_type_check check (user_type in ('grower'));
