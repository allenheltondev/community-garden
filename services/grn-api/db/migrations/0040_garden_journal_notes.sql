-- Immutable, idempotent facts for each recurring-reminder completion. A
-- reminder's last_run_at remains the fast current-state field, while this
-- history preserves every season entry.
create table if not exists reminder_completions (
  id uuid primary key,
  reminder_id uuid not null references reminder_rules(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_reminder_completions_user_season
  on reminder_completions(user_id, completed_at desc, id desc);

-- Private gardener-authored notes that complement the deterministic journal
-- projection assembled from crops, harvests, reminders, beds, and completed
-- sharing activity. Source activity remains in its owning transactional table.

create table if not exists garden_journal_notes (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  occurred_on date not null,
  title text not null,
  body text,
  photo_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint garden_journal_notes_title_not_empty check (length(trim(title)) > 0),
  constraint garden_journal_notes_title_length check (length(title) <= 120),
  constraint garden_journal_notes_body_length check (body is null or length(body) <= 2000),
  constraint garden_journal_notes_photo_key_scope check (
    photo_key is null or photo_key like 'journal-photos/%'
  )
);

create index if not exists idx_garden_journal_notes_user_season
  on garden_journal_notes(user_id, occurred_on desc, id desc)
  where deleted_at is null;
