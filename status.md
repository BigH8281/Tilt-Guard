# Tilt-Guard Status

## Project

Tilt-Guard

Live implementation status tracker aligned to `docs/tilt_guard_build_route.md`.

## Current Phase

Phase 1 - Hosted Journal MVP

## Current Objective

- Take the existing local journal flow and make it available online in a browser.
- Preserve manual trade recording as the fallback input for now.
- Improve stability and deployment readiness without leaking into telemetry, enforcement, or AI analysis phases.

## Confirmed Constraints

- Browser-first is the controlling route.
- Core usage must not depend on Electron or any desktop wrapper.
- Current work should stay inside Phase 1 scope: auth, session flow, journal flow, screenshots, history, manual trade entry, stable persistence.
- Tradovate automation, rules enforcement, and intelligence features are out of scope for current implementation work.

## Existing Implementation

- `frontend/` contains a React + Vite single-page app with routes for auth, dashboard, and session journal.
- `app/` contains a FastAPI backend with routers for health, auth, and sessions.
- Persistence is now environment-driven via `DATABASE_URL`, with hosted Postgres support and SQLite fallback for local dev.
- Auth is implemented with email/password registration and login, using JWT bearer tokens.
- Session data model includes trading sessions, journal entries, trade events, screenshots, and users.
- Screenshot files are now stored via env-configured filesystem storage, with local `uploads/` as the fallback and a configurable mounted path for hosted deployments.
- Backend runtime now supports env-driven hosted startup via `run_api.py`, `PORT`/`APP_PORT`, and comma-separated CORS origin configuration.
- Frontend API targeting now supports either explicit `VITE_API_BASE_URL` or same-origin production hosting.
- Local startup is Windows/dev oriented via `start_all.ps1` and `start_all.bat`.
- README, `.env.example`, `docs/tilt_guard_phase1_deploy.md`, and `docs/tilt_guard_phase1_railway.md` now document the minimal env, assumptions, and verification steps for a first hosted deployment and Railway trial.

## What Is Working

- Backend imports successfully in this workspace.
- Frontend production build completes successfully with `npm.cmd run build`.
- User registration, login, and authenticated session lookup are implemented.
- Users can create one open session at a time, view the open session, and list historical sessions.
- Guided session setup is implemented for bias, HTF condition, expected open type, and confidence.
- Manual journal entry creation and session journal retrieval are implemented.
- Manual trade open/close entry and current position tracking are implemented.
- Screenshot upload is implemented for `pre`, `journal`, and `post` screenshots, with browser capture plus file-upload fallback in the UI.
- Session closeout is implemented with end-of-session questions, required reasons for failed self-checks, and a required post-session screenshot.
- Dashboard history and per-session review views are implemented in the frontend.

## Known Gaps

- Screenshot storage is still filesystem-based in Phase 1; object storage is not yet implemented.
- Config is not production-safe yet:
  hosted env vars still need to be set explicitly, especially `JWT_SECRET_KEY`, `CORS_ALLOWED_ORIGINS`, `DATABASE_URL`, and `FILE_STORAGE_ROOT`.
- There is no migration setup; schema changes are handled with `create_all()` plus a small SQLite-specific patch path.
- No app test suite or automated verification coverage is present in the repo outside manual sanity checks.
- The repo still does not contain full infrastructure provisioning or platform-managed deployment config beyond a minimal backend `Procfile`.

## Immediate Next Steps

- Add the smallest deployment-specific config needed for the chosen hosting platform, if required.

## Out of Scope Right Now

- Tradovate browser extension work or broker telemetry capture.
- Rules engine or breach detection.
- Soft or hard enforcement features.
- Language analysis, screenshot intelligence, or live video analysis.
- Electron or any desktop-first delivery path.

## Notes for Future Phases

- Current trade events are manual entries and should remain treated as fallback input, not long-term broker truth.
- Current closeout questions are self-reported journal truth, not rules truth.
- When telemetry arrives later, it should feed the backend as the authoritative source rather than replacing the Phase 1 journal flow.
