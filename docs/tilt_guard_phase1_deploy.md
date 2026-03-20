# Tilt-Guard Phase 1 Deployment

This document covers the first hosted deployment of the current Phase 1 browser-first journal MVP.

Scope:
- current FastAPI backend
- current React/Vite frontend
- hosted Postgres
- persistent filesystem storage for screenshots

Out of scope:
- broker telemetry
- rules enforcement
- object storage
- platform-specific infrastructure design beyond the minimum needed to run this repo

## Current Deployment Shape

Deploy Tilt-Guard as two services:

1. Backend API
   - repo root
   - run with `python run_api.py`
   - serves API routes, auth, and screenshot files

2. Frontend static site
   - `frontend/`
   - build with `npm run build`
   - publish `frontend/dist`

Recommended first hosted pattern:
- frontend on its own public URL
- backend on its own public URL
- backend connected to hosted Postgres
- backend attached to a persistent filesystem volume for screenshots

Same-origin hosting can also work if a reverse proxy serves the frontend and API together.

## Phase 1 Production Assumptions

These assumptions matter for the first hosted deployment:

- Database: use Postgres in hosted environments via `DATABASE_URL`
- Screenshot storage: use a persistent mounted filesystem path via `FILE_STORAGE_ROOT`
- Auth: set a real `JWT_SECRET_KEY`
- Browser access: set `CORS_ALLOWED_ORIGINS` to the real frontend origin or origins
- Frontend API routing:
  - split-origin deploy: set `VITE_API_BASE_URL`
  - same-origin deploy: omit `VITE_API_BASE_URL`

Important current limitation:
- screenshot storage is still filesystem-based in Phase 1
- the mounted volume must survive container/app restarts

## Backend Environment Variables

### Mandatory For Hosted Deployment

- `JWT_SECRET_KEY`
  - required
  - must be a real secret
  - do not use the local dev generated value from `start_all.ps1`

- `DATABASE_URL`
  - required for hosted deployment
  - should point at hosted Postgres
  - example: `postgresql://USER:PASSWORD@HOST:5432/tilt_guard`

- `CORS_ALLOWED_ORIGINS`
  - required for hosted deployment
  - comma-separated list of allowed frontend origins
  - example: `https://app.example.com`

- `FILE_STORAGE_ROOT`
  - required for hosted deployment
  - must point at a persistent mounted volume path
  - example: `/data/uploads`

### Optional For Hosted Deployment

- `FILE_STORAGE_URL_PATH`
  - default: `/uploads`
  - only change if the backend should serve uploaded files from a different path

- `PORT`
  - used automatically by `run_api.py` when the host injects it

- `APP_PORT`
  - optional fallback if `PORT` is not set

- `APP_HOST`
  - optional override for the bind host
  - `run_api.py` otherwise uses `0.0.0.0` for hosted runs

- `UVICORN_RELOAD`
  - optional
  - leave unset in hosted deployment

- `FRONTEND_ORIGIN`
  - legacy single-origin fallback
  - do not prefer it for hosted deployment
  - use `CORS_ALLOWED_ORIGINS` instead

### Local-Dev Only Or Local-Dev Fallback

- unset `DATABASE_URL`
  - falls back to local SQLite

- omit `CORS_ALLOWED_ORIGINS`
  - falls back to local Vite dev origins

- omit `FILE_STORAGE_ROOT`
  - falls back to local `uploads/`

- use `python -m uvicorn app.main:app --reload`
  - local dev path

## Frontend Environment Variables

### Mandatory For Hosted Deployment

- none, if the frontend is served from the same origin as the API root

- `VITE_API_BASE_URL`
  - required for split-origin deployment
  - example: `https://api.example.com`
  - may also be a path such as `/api` if a proxy exposes the API there

### Optional For Hosted Deployment

- `VITE_API_BASE_URL`
  - optional for same-origin deployment
  - omit it if the frontend should call the current origin

### Local-Dev Only Or Local-Dev Fallback

- omit `VITE_API_BASE_URL`
  - frontend dev falls back to `http://127.0.0.1:8000`

## First Hosted Deployment Steps

### Backend

1. Provision Postgres.
2. Provision a persistent filesystem volume for screenshots.
3. Set backend env vars:
   - `JWT_SECRET_KEY`
   - `DATABASE_URL`
   - `CORS_ALLOWED_ORIGINS`
   - `FILE_STORAGE_ROOT`
4. Install backend dependencies:
   - `pip install -r requirements.txt`
5. Run the backend:
   - `python run_api.py`
6. Confirm `/health` returns `200` and `{"status":"ok"}`.

### Frontend

1. Decide whether deployment is split-origin or same-origin.
2. If split-origin, set `VITE_API_BASE_URL`.
3. Install frontend dependencies:
   - `npm ci`
4. Build the frontend:
   - `npm run build`
5. Publish `frontend/dist`.

## Pre-Deploy Checklist

- `JWT_SECRET_KEY` is set to a real secret.
- `DATABASE_URL` points to hosted Postgres, not SQLite.
- `FILE_STORAGE_ROOT` points to a persistent mounted volume.
- `CORS_ALLOWED_ORIGINS` matches the real frontend URL.
- Frontend `VITE_API_BASE_URL` matches the real backend URL for split-origin deployment.
- Backend health endpoint is configured as `/health`.
- Backend startup command is `python run_api.py`.
- Frontend publish directory is `frontend/dist`.
- You are not depending on `start_all.ps1` or other Windows-only dev startup paths.

## Post-Deploy Verification Checklist

- Open the frontend URL in a browser.
- Register a new user successfully.
- Log in successfully.
- Create a session successfully.
- Upload a pre-session screenshot successfully.
- Add a journal entry successfully.
- Add a manual trade open and trade close successfully.
- Upload a post-session screenshot successfully.
- End the session successfully.
- Reload the app and confirm the closed session still appears.
- Open the uploaded screenshots after a refresh and confirm they still load.
- Check backend `/health`.
- Check backend logs for CORS failures, startup errors, or database connection errors.

## Railway-Style Trial Notes

For a first Railway deployment trial, this repo is closest to:

- one backend service from repo root
- one frontend static site from `frontend/`
- one Postgres service
- one persistent volume mounted into the backend service

Use the exact Railway trial runbook in [docs/tilt_guard_phase1_railway.md](/C:/Users/higgo/Dev/Tilt-Guard/docs/tilt_guard_phase1_railway.md).

Set backend values like:

- `JWT_SECRET_KEY=<real secret>`
- `DATABASE_URL=<Railway Postgres URL>`
- `CORS_ALLOWED_ORIGINS=https://<frontend-domain>`
- `FILE_STORAGE_ROOT=/data/uploads` if you want to set it explicitly

Recommended Railway volume mount path:

- `/data/uploads`

Set frontend values like:

- `VITE_API_BASE_URL=https://<backend-domain>`

This is sufficient for an initial Phase 1 deployment trial.

## Known Remaining Risks

- There is still no migration system; schema changes rely on `create_all()`.
- Screenshot persistence depends on the mounted filesystem volume being configured correctly.
- There is no object storage fallback.
- There is no automated deployment verification or test suite.
