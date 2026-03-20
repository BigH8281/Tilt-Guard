# Trading Journal

## Launch The App On Windows

From the project root:

```powershell
.\start_all.ps1
```

If you prefer a shortcut-friendly wrapper:

```bat
start_all.bat
```

What it does:
- opens one PowerShell window for the backend
- activates `.venv` or `venv` if present
- sets a per-run local `JWT_SECRET_KEY` when needed
- starts the backend with `python -m uvicorn app.main:app --reload`
- opens a second PowerShell window for the frontend
- starts the frontend with `npm.cmd run dev`
- waits briefly, then opens the app automatically in your default browser
- opens `http://localhost:5173`

Manual start remains available:

```powershell
python -m uvicorn app.main:app --reload
```

```powershell
cd frontend
npm.cmd run dev
```

## Backend Environment

The backend now reads `DATABASE_URL` from the environment.

- If `DATABASE_URL` is set, the API connects to that database. Hosted Postgres URLs are supported and normalised onto SQLAlchemy's `postgresql+psycopg` driver.
- If `DATABASE_URL` is not set, the backend falls back to the local SQLite file at `trading_journal.db`.
- `JWT_SECRET_KEY` is required by the backend. `.\start_all.ps1` generates a local dev value automatically, but hosted/manual runs should set it explicitly.
- `CORS_ALLOWED_ORIGINS` accepts a comma-separated list of frontend origins allowed to call the API. If it is not set, the backend falls back to local dev origins. `FRONTEND_ORIGIN` still works as a single-origin legacy alias.
- Screenshot/file storage is Phase 1 filesystem storage only. Set `FILE_STORAGE_ROOT` to choose where uploaded files are written. If it is not set, uploads stay under the local `uploads/` folder.
- `FILE_STORAGE_URL_PATH` controls the app path used to serve stored files and defaults to `/uploads`.

Example hosted backend env:

```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST:5432/tilt_guard"
$env:JWT_SECRET_KEY = "replace-with-a-real-secret"
$env:CORS_ALLOWED_ORIGINS = "https://app.example.com"
$env:FILE_STORAGE_ROOT = "C:\railway-data\uploads"
python run_api.py
```

Example local SQLite fallback:

```powershell
$env:JWT_SECRET_KEY = "local-dev-secret"
python -m uvicorn app.main:app --reload
```

For a Railway-style deploy, point `FILE_STORAGE_ROOT` at a mounted persistent volume path so screenshots are not tied to the app container filesystem. This step does not implement object storage; it keeps Phase 1 on env-configured filesystem storage and makes that limitation explicit.

## Hosted Deployment

Deploy the backend and frontend as separate services.

For the first hosted Phase 1 deployment, use the repo-grounded runbook in [docs/tilt_guard_phase1_deploy.md](/C:/Users/higgo/Dev/Tilt-Guard/docs/tilt_guard_phase1_deploy.md).
For the first actual Railway trial, use [docs/tilt_guard_phase1_railway.md](/C:/Users/higgo/Dev/Tilt-Guard/docs/tilt_guard_phase1_railway.md).

Backend service:
- Root directory: repo root
- Install: `pip install -r requirements.txt`
- Run: `python run_api.py`
- Required env: `JWT_SECRET_KEY`
- Hosted Phase 1 env: `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, `FILE_STORAGE_ROOT`
- Optional env: `FILE_STORAGE_URL_PATH`, `APP_HOST`, `APP_PORT`, `PORT`, `UVICORN_RELOAD`
- Health check: `/health`
- A minimal [Procfile](/C:/Users/higgo/Dev/Tilt-Guard/Procfile) is included for platforms that use it.

Frontend service:
- Root directory: `frontend/`
- Install: `npm ci`
- Build: `npm run build`
- Publish/output directory: `dist`
- Set `VITE_API_BASE_URL` when the frontend talks to the API on a different origin or path.
- If the frontend is served behind the same origin as the API, `VITE_API_BASE_URL` can be omitted and the production build will use the current origin automatically.

Example split-origin setup:
- Frontend URL: `https://app.example.com`
- Backend URL: `https://api.example.com`
- Backend `CORS_ALLOWED_ORIGINS=https://app.example.com`
- Frontend `VITE_API_BASE_URL=https://api.example.com`

Example same-origin setup behind a reverse proxy:
- Frontend URL: `https://app.example.com`
- Backend API served from the same origin
- Backend `CORS_ALLOWED_ORIGINS=https://app.example.com`
- Frontend `VITE_API_BASE_URL` omitted

Environment templates are included at [.env.example](/C:/Users/higgo/Dev/Tilt-Guard/.env.example) and [frontend/.env.example](/C:/Users/higgo/Dev/Tilt-Guard/frontend/.env.example).

## Hosted API Validation

Run the minimal Phase 1 API validation script against either a local backend or a hosted deployment:

```powershell
python scripts/validate_phase1_hosted.py --base-url http://127.0.0.1:8000
```

Against Railway or another hosted API:

```powershell
python scripts/validate_phase1_hosted.py --base-url https://your-backend-domain
```

What it validates:
- `/health`
- register, login, and `/me`
- session creation, setup update, and session read-back
- journal entry creation and journal read-back
- screenshot upload plus file serving
- session closeout and closed-session history

Notes:
- the script creates a disposable user and a disposable session on each run
- no seeded data is required
- the target backend must already be running and reachable
- use `VALIDATION_BASE_URL` or `--base-url` to target a hosted deployment
