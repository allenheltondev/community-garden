# Database schema and migrations

## Source of truth
- `ddl.sql` contains the full schema definition for the Community Garden Postgres database.

## Migrations
- Migration scripts are stored in `backend/db/migrations`.
- `backend/db/migrate.sh` applies migrations in filename order and records applied versions in `schema_migrations`.

### Run locally
```bash
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/community_garden'
./backend/db/migrate.sh
```

### CI behavior
PR checks now start a Postgres service and run `./db/migrate.sh` from the `backend` directory before linting and tests.
