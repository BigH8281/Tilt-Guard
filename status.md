# Tilt-Guard Status

## Project

Tilt-Guard

Live implementation status tracker aligned to `docs/tilt_guard_build_route.md`.

Companion knowledge reference:
- `docs/tilt_guard_product_learning_log.md`
  - preserves the Drop-Trades / TradeGuard review lessons
  - records the architecture patterns we intentionally copied
  - records the implementation/debugging lessons from the current TradingView-first extension work

## Current Phase

Practical-use rollout preparation for late Phase 2

Meaning:
- the hosted journal MVP is implemented
- the TradingView-first extension telemetry and journal integration slice is implemented
- chart-first confirmation is now the intended and working primary confirmation path
- rules, enforcement, and intelligence work are still not active build phases

## Current Objective

- Prepare the current hosted journal plus extension stack for real practical-use testing.
- Keep the hosted journal reliable and usable from anywhere.
- Treat confirmed observed trade facts as authoritative where the browser surface genuinely supports them.
- Keep manual trade entry as fallback where confirmation remains incomplete or ambiguous.
- Avoid leaking into rules engine, enforcement, or AI interpretation before telemetry reliability is proven.
- Preserve the external-product and live-debugging lessons so future work does not repeat already-solved architecture mistakes.

## Confirmed Constraints

- Browser-first is still the controlling route.
- Core usage must not depend on Electron or any desktop wrapper.
- Current extension implementation is TradingView-first.
- The product must remain hosted-accessible for remote and non-technical users.
- Rules truth, enforcement, and AI interpretation remain later-phase work.
- Product/technical lessons from the Drop-Trades / TradeGuard review should continue informing future extension and session work.

## Existing Implementation

- `frontend/` contains a React + Vite single-page app with routes for auth, dashboard, and session journal.
- `app/` contains a FastAPI backend with routers for health, auth, sessions, extension connect, extension sessions, and broker telemetry.
- Persistence is env-driven via `DATABASE_URL`, with hosted Postgres support and SQLite fallback for local dev.
- Auth is implemented with email/password registration and login using JWT bearer tokens.
- Session data includes users, trading sessions, journal entries, trade events, screenshots, broker telemetry events, and extension sessions.
- Screenshot files are stored via env-configured filesystem storage, with local `uploads/` fallback and hosted mounted-volume support.
- Alembic is the schema migration path for backend persistence.
- The browser extension is now a single unpacked build with a persisted `Hosted` / `Local` toggle.
- The extension defaults to `HOSTED` on fresh install and can switch modes without rebuilding.
- The hosted backend now serves `/extension/connect` directly for extension sign-in and auth sync.
- The extension persists mode, auth state, extension session state, and telemetry state in browser storage.
- Backend APIs now support extension connect/heartbeat/disconnect plus telemetry ingest, latest telemetry, event history, and system feed reads.
- Railway is now serving both `/health` and `/extension/connect` on `https://web-production-91bf.up.railway.app`.
- The only supported extension distribution artifact is `extension/dist/unpacked/`.
- Confirmed observed trades now persist as real `trade_events` instead of remaining frontend-only derived lines.
- Observed/manual reconciliation is now observed-first for factual trade fields, with provenance kept off the main journal.
- The journal now supports session-wide confirmed observed trade attachment even when the trader changes symbol mid-session.
- `System Status` is now the home for low-level evidence, activity, mismatch context, and reconciliation audit detail.
- A dedicated project-memory document now exists for retained product and technical lessons:
  - `docs/tilt_guard_product_learning_log.md`

## What Is Working

- Hosted backend health is live on Railway.
- Hosted `/extension/connect` is live on Railway.
- User registration, login, and authenticated session lookup are implemented.
- Users can create one open session at a time, view the open session, and list historical sessions.
- Guided session setup is implemented for bias, HTF condition, expected open type, and confidence.
- Manual journal entry creation and session journal retrieval are implemented.
- Manual trade open/close entry and current position tracking are implemented.
- Screenshot upload is implemented for `pre`, `journal`, and `post` screenshots, with browser capture plus file-upload fallback in the UI.
- Session closeout is implemented with end-of-session questions, required reasons for failed self-checks, and a required post-session screenshot.
- Dashboard history and per-session review views are implemented in the frontend.
- Extension popup can show hosted/local mode, auth state, monitoring state, broker/profile state, and telemetry freshness.
- Extension `Connect App` now opens the hosted Railway connect page in hosted mode and localhost in local mode.
- Extension mode switching clears auth/session state so local and hosted environments do not mix.
- Extension session lifecycle is implemented through backend connect, heartbeat, status, and disconnect APIs.
- Broker telemetry ingest and backend system-feed/event/latest reads are implemented.
- Chart-first confirmation is live-proven from TradingView’s visible chart toast/overlay surface into backend evidence.
- `Positions` is now support/fallback evidence rather than the primary confirmation surface.
- Confirmed observed trades can flow into the journal and trigger the same reflection prompt path as manual trade entries.
- Session-wide confirmed observed trade attachment is working across symbol changes, with actual traded symbol preserved in the journal.
- Node-based extension tests are passing.
- Backend tests for extension session lifecycle and hosted connect page are passing.

## Verified Release Checks

- `node --test extension/tests/*.test.js`
- `./.venv/bin/pytest -q tests/test_extension_connect_page.py tests/test_extension_session_lifecycle.py`
- `python3 scripts/build_extension.py --output-dir extension/dist/unpacked`
- Live hosted checks:
  - `https://web-production-91bf.up.railway.app/health`
  - `https://web-production-91bf.up.railway.app/extension/connect?extensionId=trial&mode=HOSTED`

## Known Gaps

- Screenshot storage is still filesystem-based in Phase 1; object storage is not implemented.
- The extension telemetry slice is TradingView-first and is not yet the final broker-truth layer for all target workflows.
- Fast same-symbol delta/re-entry interpretation is still more fragile than clean single open/close flows.
- Broker-specific truth is still strongest on TradingView-visible surfaces, not full broker APIs.
- There is still no rules engine, breach detection, cooldown logic, or lockout behavior.
- There is still no browser-level automated regression coverage for the full hosted extension flow.
- Distribution is still unpacked-folder based; there is no Chrome Web Store packaging or signed release flow.
- Operational observability and backup/recovery posture remain lightweight.

## Immediate Next Steps

- Run practical-use hosted smoke tests on clean remote-user setups using the current unpacked extension.
- Validate chart-first confirmation, reflection flow, and journal behavior under real-use trading patterns.
- Improve release discipline around one-folder extension distribution and clean replacement instructions.
- Tighten the remaining ambiguous rapid delta/re-entry cases without broadening into rules or enforcement.
- Only start rules-engine design once telemetry reliability and broker truth confidence are materially better.
- Revisit the learning log before any future broker-adapter, telemetry, or enforcement design changes.

## Out of Scope Right Now

- Rules engine or breach detection.
- Soft or hard enforcement features.
- Language analysis, screenshot intelligence, or live video analysis.
- Electron or any desktop-first delivery path.
- Treating current telemetry as fully authoritative broker truth without more validation.

## Notes For Future Phases

- Confirmed observed trade facts are now authoritative where the visible browser surface genuinely supports them.
- Manual input remains authoritative for narrative, rationale, psychology, and any trade facts that remain unconfirmed or ambiguous.
- Current extension telemetry is still a reliability-hardening phase, not finished enforcement infrastructure.
- Extension session state and broker telemetry should become backend truth inputs before any rules layer is allowed to judge compliance.
- Any future broker/platform expansion should preserve the browser-first, hosted-first product direction.
- Keep system activity separate from the journal and keep current symbol/session metadata as shared live-state UI, not journal noise.
- Remember the TradingView observer-starvation lesson: active pages can mutate constantly, so heartbeat-driven refresh remains part of the monitoring model.
