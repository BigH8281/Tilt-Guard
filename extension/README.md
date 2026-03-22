# Tilt Guard Telemetry Extension

This is a plain MV3 extension scaffold for the first TradingView broker telemetry slice.

## Load locally

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer Mode.
3. Choose `Load unpacked`.
4. Select the [`extension`](/home/higgo/code/Tilt-Guard/extension) folder.
5. Open the extension popup and set:
   - `API Base URL`: `http://127.0.0.1:8000`
   - `Auth Token`: a fresh JWT from the currently running local backend
6. Reload the extension after selector changes, then refresh the live TradingView chart tab.

## Current scope

- Detect TradingView chart pages
- Detect mounted trading surface and trading panel root
- Detect FXCM-connected footer signature
- Queue append-only telemetry events locally
- Batch-send raw telemetry to the backend ingest endpoint

## Current limits

- No enforcement behavior
- No position/order/fill extraction
- No class-based selector dependence
- Built for TradingView-first, FXCM-aware observation

## Quick local verification

1. Start the backend locally:
   - `set -a && source .env && set +a && ./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
2. Mint a fresh JWT from that same backend:
   - `curl -sS -X POST http://127.0.0.1:8000/login -H 'Content-Type: application/json' -d '{"email":"andrew8281@me.com","password":"Command1@1"}'`
3. Reload the unpacked extension and refresh the FXCM-connected TradingView chart.
4. Read back recent telemetry:
   - `curl -sS "http://127.0.0.1:8000/broker-telemetry/events?limit=20" -H "Authorization: Bearer <fresh JWT>"`
5. In the newest snapshot, verify:
   - `broker_connected = true`
   - `broker_label = "FXCM Live"`
   - `fxcm_footer_cluster_visible = true`
   - `account_manager_control_visible = true`
   - `panel_open_control_visible = true`
   - `panel_maximize_control_visible = true`
   - `order_entry_control_visible = true`
