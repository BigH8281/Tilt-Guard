# Tilt-Guard First Railway Deploy

This runbook is for the first real Railway deployment trial of the current Phase 1 journal MVP.

Use split-origin deployment for the first trial:
- one Railway backend service from repo root
- one Railway frontend static site from `frontend/`
- one Railway Postgres service
- one Railway volume attached to the backend service

## Backend Service Settings

- Source: this repository
- Root directory: `/`
- Install command:
  - `pip install -r requirements.txt`
- Start command:
  - `python run_api.py`
- Health check path:
  - `/health`

Recommended Railway volume setup:
- attach one volume to the backend service
- mount path:
  - `/data/uploads`

With that mount path:
- the backend can use Railway's `RAILWAY_VOLUME_MOUNT_PATH` automatically
- you may still set `FILE_STORAGE_ROOT=/data/uploads` explicitly if you prefer clarity

## Frontend Service Settings

- Source: this repository
- Root directory:
  - `frontend`
- Install command:
  - `npm ci`
- Build command:
  - `npm run build`
- Publish directory:
  - `dist`

## Required Railway Environment Variables

### Backend

- `JWT_SECRET_KEY`
  - required
  - set a real secret

- `DATABASE_URL`
  - required
  - use the Railway Postgres connection URL

- `CORS_ALLOWED_ORIGINS`
  - required
  - set to the Railway frontend public URL

### Backend Optional

- `FILE_STORAGE_ROOT`
  - optional if the backend volume is mounted at `/data/uploads` and Railway provides `RAILWAY_VOLUME_MOUNT_PATH`
  - recommended explicit value if you want to avoid ambiguity:
    - `/data/uploads`

- `FILE_STORAGE_URL_PATH`
  - optional
  - default:
    - `/uploads`

- `APP_HOST`
  - optional

- `APP_PORT`
  - optional

- `UVICORN_RELOAD`
  - local-dev only
  - leave unset on Railway

### Frontend

- `VITE_API_BASE_URL`
  - required for this first split-origin Railway trial
  - set to the Railway backend public URL

## Railway Trial Sequence

1. Create Railway Postgres.
2. Create the backend service from repo root.
3. Attach a Railway volume to the backend service at `/data/uploads`.
4. Handle the database migration state:
   - new empty Railway Postgres database:
     - run `python -m alembic upgrade head`
   - current already-live Railway database:
     - back up first
     - verify schema alignment
     - run `python -m alembic stamp 20260320_0001`
   - use the explicit live database runbook:
     - [docs/tilt_guard_phase1_live_db_baseline.md](/C:/Users/higgo/Dev/Tilt-Guard/docs/tilt_guard_phase1_live_db_baseline.md)
5. Set backend env vars:
   - `JWT_SECRET_KEY`
   - `DATABASE_URL`
   - `CORS_ALLOWED_ORIGINS`
   - optionally `FILE_STORAGE_ROOT=/data/uploads`
6. Deploy the backend.
7. Confirm backend `GET /health` succeeds.
8. Create the frontend static service from `frontend/`.
9. Set frontend env var:
   - `VITE_API_BASE_URL=https://<backend-domain>`
10. Deploy the frontend.
11. Confirm frontend registration, login, session creation, screenshot upload, and session closeout all work.

Optional API-level validation:

- run:
  - `python scripts/validate_phase1_hosted.py --base-url https://<backend-domain>`
- this validates the hosted-critical Phase 1 API paths directly without browser automation

Post-redeploy screenshot persistence smoke check:

1. Before the backend restart or redeploy, prepare the check:
   - `python scripts/validate_phase1_hosted.py persistence-prepare --base-url https://<backend-domain>`
2. Redeploy or restart the backend service.
3. After Railway reports the backend healthy again, verify persistence:
   - `python scripts/validate_phase1_hosted.py persistence-verify --base-url https://<backend-domain>`

This narrow smoke check proves that:
- the backend is reachable again after the rollout
- the same disposable user can still log in
- the previously uploaded screenshot still exists in session metadata
- the screenshot URL still serves the original file bytes after the restart or redeploy

By default, the verify step also closes the disposable session and removes the local state file.

For future Railway schema updates after the one-time baseline adoption:

- run:
  - `python -m alembic upgrade head`
- do this before or alongside the backend rollout for the new release

## Most Important Railway Checks

- The backend is listening successfully on the Railway-assigned `PORT`.
- The frontend URL is included in `CORS_ALLOWED_ORIGINS`.
- The backend volume is mounted at `/data/uploads`.
- Screenshots still load after a backend redeploy.

## Current Known Risk

The most likely first Railway failure is misconfigured screenshot persistence:
- no volume attached
- wrong mount path
- or `FILE_STORAGE_ROOT` pointing somewhere other than the mounted path
