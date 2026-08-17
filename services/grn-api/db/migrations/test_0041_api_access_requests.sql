-- Contract probes for the approval-gated API access added by migration 0041.

do $$
declare
  test_user_id uuid := gen_random_uuid();
  other_user_id uuid := gen_random_uuid();
  admin_user_id uuid := gen_random_uuid();
  first_request_id uuid;
  second_request_id uuid;
  test_key_id uuid;
begin
  insert into users (id, email, user_type)
  values
    (test_user_id, 'api-access-migration-check@example.com', 'grower'),
    (other_user_id, 'api-access-migration-other@example.com', 'grower'),
    (admin_user_id, 'api-access-migration-admin@example.com', 'grower');

  -- A request starts pending with no decision recorded.
  insert into api_access_requests (user_id, integration_name, intended_use)
  values (test_user_id, 'Harvest Sync', 'Mirror my harvest log into a spreadsheet')
  returning id into first_request_id;

  if (select status from api_access_requests where id = first_request_id) <> 'pending' then
    raise exception 'New API access requests must start pending';
  end if;

  -- One open request per grower.
  begin
    insert into api_access_requests (user_id, integration_name, intended_use)
    values (test_user_id, 'Second Attempt', 'Another integration');
    raise exception 'A second pending request must be rejected';
  exception
    when unique_violation then null;
  end;

  -- A different grower is unaffected by that constraint.
  insert into api_access_requests (user_id, integration_name, intended_use)
  values (other_user_id, 'Neighbor Bot', 'Watch nearby listings')
  returning id into second_request_id;

  -- Deciding a request requires a timestamp.
  begin
    update api_access_requests set status = 'approved' where id = first_request_id;
    raise exception 'Approving without decided_at must be rejected';
  exception
    when check_violation then null;
  end;

  update api_access_requests
     set status = 'approved',
         decided_at = now(),
         decided_by = admin_user_id
   where id = first_request_id;

  -- Once decided, the grower can ask again.
  insert into api_access_requests (user_id, integration_name, intended_use)
  values (test_user_id, 'Harvest Sync v2', 'Same integration, new key');

  -- An issued key records its request and the API Gateway identifiers.
  insert into api_keys (user_id, name, key_prefix, key_hash, access_request_id, aws_api_key_id, usage_plan_id)
  values (
    test_user_id,
    'Harvest Sync',
    'grnk_migration',
    'migration-check-hash',
    first_request_id,
    'agw-key-migration-check',
    'usage-plan-migration-check'
  )
  returning id into test_key_id;

  -- An API Gateway key may back only one GRN key.
  begin
    insert into api_keys (user_id, name, key_prefix, key_hash, aws_api_key_id)
    values (other_user_id, 'Duplicate', 'grnk_dupe', 'migration-check-hash-2', 'agw-key-migration-check');
    raise exception 'Reusing an API Gateway key id must be rejected';
  exception
    when unique_violation then null;
  end;

  -- One approval mints one key. This is what makes the create path's
  -- `on conflict do nothing` a real claim rather than a hopeful check.
  begin
    insert into api_keys (user_id, name, key_prefix, key_hash, access_request_id)
    values (test_user_id, 'Second key', 'grnk_second', 'migration-check-hash-4', first_request_id);
    raise exception 'A second key against one approval must be rejected';
  exception
    when unique_violation then null;
  end;

  -- Revoking the key does not hand the approval back: the row still occupies
  -- the unique index, so the approval stays spent.
  update api_keys set revoked_at = now() where id = test_key_id;

  begin
    insert into api_keys (user_id, name, key_prefix, key_hash, access_request_id)
    values (test_user_id, 'After revoke', 'grnk_revoked', 'migration-check-hash-5', first_request_id);
    raise exception 'Revoking a key must not free its approval';
  exception
    when unique_violation then null;
  end;

  -- Self-serve keys carry no API Gateway identifiers and stay allowed. Several
  -- may coexist: the unique index above is partial on access_request_id.
  insert into api_keys (user_id, name, key_prefix, key_hash)
  values (other_user_id, 'Self serve', 'grnk_selfserve', 'migration-check-hash-3');

  insert into api_keys (user_id, name, key_prefix, key_hash)
  values (other_user_id, 'Self serve 2', 'grnk_selfserve2', 'migration-check-hash-6');

  delete from users where id in (test_user_id, other_user_id, admin_user_id);

  raise notice 'Migration 0041 contract probes passed';
end $$;
