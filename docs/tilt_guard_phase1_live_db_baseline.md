# Tilt-Guard Live DB Alembic Baseline Adoption

This runbook is for the existing live Railway Postgres database that already contains the current Phase 1 schema and data.

Goal:
- adopt Alembic safely without changing the live schema
- mark the live database as being at the baseline revision
- enable normal future migration upgrades

This is different from a fresh empty database.

## Two Different Workflows

### Fresh Empty Database

Use this when the database has no application tables yet.

Command:

```powershell
python -m alembic upgrade head
```

Effect:
- creates the current Phase 1 schema
- records revision `20260320_0001`

### Existing Live Database

Use this when the database already has the current Phase 1 tables and production data.

Command:

```powershell
python -m alembic stamp 20260320_0001
```

Effect:
- does not create or alter tables
- only records Alembic revision `20260320_0001` in `alembic_version`

## Live DB Baseline Adoption Steps

Recommended exact order:

1. Take a database backup.
2. Verify schema alignment.
3. Stamp the baseline revision.
4. Validate app behaviour.

## Step 1: Take A Backup

Do this before any Alembic baseline adoption action.

Minimum rule:
- do not continue unless you have a current Railway Postgres backup or dump you can restore

## Step 2: Verify Schema Alignment

Only stamp the live database if it already matches the current Phase 1 schema expected by the repo.

At minimum, verify:
- the live app is currently working
- the live database already contains these tables:
  - `users`
  - `trading_sessions`
  - `journal_entries`
  - `trade_events`
  - `screenshots`
- `trading_sessions` already includes:
  - `session_name`
  - `symbol`

If the live schema has drifted from the repo:
- stop
- do not stamp yet
- inspect the differences first

## Step 3: Stamp The Baseline Revision

Point `DATABASE_URL` at the live Railway Postgres database, then run:

```powershell
python -m alembic stamp 20260320_0001
```

This is the one-time baseline adoption command for the existing live DB.

Expected result:
- Alembic records `20260320_0001`
- no application tables are created, dropped, or altered

## Step 4: Validate App Behaviour

After stamping:

1. Confirm the backend still starts normally.
2. Confirm the frontend still works normally.
3. Run the hosted API validation script against the live backend:

```powershell
python scripts/validate_phase1_hosted.py --base-url https://<backend-domain>
```

4. Manually confirm existing data is still visible in the live app.

## What To Avoid

Do not do these on the existing live Railway database:

- do not run this first:

```powershell
python -m alembic upgrade head
```

- do not stamp without first taking a backup
- do not stamp if you have not verified schema alignment
- do not treat the live DB like a fresh empty DB

## After The One-Time Baseline Adoption

Once the live database has been safely stamped:

- future schema changes should use normal Alembic migrations
- future deploy/update workflow should use:

```powershell
python -m alembic upgrade head
```

That is the normal path after baseline adoption is complete.
