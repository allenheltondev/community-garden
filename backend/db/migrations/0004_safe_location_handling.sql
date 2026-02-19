-- Safe location handling for profiles and listings.
-- Addresses are now first-class inputs; coordinates remain derived data.

alter table grower_profiles
  add column if not exists address text;

alter table gatherer_profiles
  add column if not exists address text;

alter table surplus_listings
  add column if not exists effective_pickup_address text;

update surplus_listings sl
set effective_pickup_address = coalesce(nullif(btrim(sl.pickup_address), ''), gp.address)
from grower_profiles gp
where sl.user_id = gp.user_id
  and sl.effective_pickup_address is null;
