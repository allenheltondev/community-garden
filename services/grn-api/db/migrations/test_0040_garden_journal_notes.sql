-- Contract probes for the private journal-note storage added by migration 0040.

do $$
declare
  test_user_id uuid := gen_random_uuid();
  test_note_id uuid := gen_random_uuid();
  test_reminder_id uuid := gen_random_uuid();
  test_completion_id uuid := gen_random_uuid();
begin
  insert into users (id, email, user_type)
  values (test_user_id, 'journal-migration-check@example.com', 'grower');

  insert into reminder_rules
    (id, user_id, title, reminder_type, cadence_days, start_date, timezone, next_run_at)
  values
    (test_reminder_id, test_user_id, 'Water herbs', 'watering', 2, date '2026-07-14', 'UTC', now());

  insert into reminder_completions (id, reminder_id, user_id)
  values (test_completion_id, test_reminder_id, test_user_id);

  if not exists (
    select 1 from reminder_completions
     where id = test_completion_id and reminder_id = test_reminder_id and user_id = test_user_id
  ) then
    raise exception 'immutable reminder completion should be persisted';
  end if;

  insert into garden_journal_notes (id, user_id, occurred_on, title, body)
  values (test_note_id, test_user_id, date '2026-07-14', 'First tomato', 'Private note');

  if not exists (
    select 1 from garden_journal_notes
     where id = test_note_id and user_id = test_user_id and deleted_at is null
  ) then
    raise exception 'owner-scoped journal note should be persisted';
  end if;

  begin
    update garden_journal_notes
       set photo_key = 'other-prefix/photo'
     where id = test_note_id;
    raise exception 'photo key check should reject an out-of-scope prefix';
  exception
    when check_violation then
      null; -- expected
  end;

  delete from users where id = test_user_id;
  if exists (select 1 from garden_journal_notes where id = test_note_id) then
    raise exception 'journal notes should cascade when the owner is removed';
  end if;
  if exists (select 1 from reminder_completions where id = test_completion_id) then
    raise exception 'reminder completions should cascade when the owner is removed';
  end if;
end $$;
