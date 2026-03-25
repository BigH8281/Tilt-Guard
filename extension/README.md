# Tilt Guard Extension

This build is the TradingView-first Tilt-Guard extension slice.

It supports:

- secure app-to-extension auth sync through `/extension/connect`
- TradingView chart detection
- broker adapter matching for `tradingview_base`, `tradingview_fxcm`, and `tradingview_tradovate`
- backend-owned extension session status and heartbeat
- telemetry ingest for dashboard and journal system feeds

## Load targets

- Raw source local default: load [`extension/`](/home/higgo/code/Tilt-Guard/extension)
- Generated local build: load [`extension/dist/local/`](/home/higgo/code/Tilt-Guard/extension/dist/local)
- Generated hosted build: load [`extension/dist/hosted/`](/home/higgo/code/Tilt-Guard/extension/dist/hosted)

Chrome still loads the extension as an unpacked folder. There is no packed build step required.

## Build mode-specific unpacked folders

Local build:

```bash
python scripts/build_extension.py --mode local
```

Hosted build:

```bash
python scripts/build_extension.py \
  --mode hosted \
  --app-base-url https://<frontend-domain> \
  --api-base-url https://<backend-domain>
```

## Auth flow

1. Load the unpacked extension folder for the mode you want in `chrome://extensions`.
2. Open the popup.
3. Click `Connect App`.
4. Sign in through the journal UI if needed.
5. The `/extension/connect` page sends the current JWT to the extension through `chrome.runtime.sendMessage(...)`.
6. Return to the popup to confirm:
   - app auth is connected
   - TradingView detection state
   - broker adapter/profile state
   - monitoring state

No token copy/paste is required.

## Local verification

1. Start the local stack.
2. Load either [`extension/`](/home/higgo/code/Tilt-Guard/extension) or [`extension/dist/local/`](/home/higgo/code/Tilt-Guard/extension/dist/local).
3. Click `Connect Journal` and sign in locally.
4. Open a live TradingView chart.
5. Confirm the popup shows TradingView detection.
6. Use `Flush Telemetry` in the popup or wait for the background alarm.

## Hosted verification

1. Build the hosted unpacked folder with the real frontend/backend URLs.
2. Load [`extension/dist/hosted/`](/home/higgo/code/Tilt-Guard/extension/dist/hosted).
3. Click `Connect App` and sign in against the hosted journal.
4. Confirm the popup shows the hosted API/journal URLs and `Auth: Connected`.

## Move to another PC

1. Build the correct unpacked folder locally:

```bash
python scripts/build_extension.py --mode hosted --app-base-url https://<frontend-domain> --api-base-url https://<backend-domain>
```

2. Copy the entire output folder, usually `extension/dist/hosted/`, to the other PC.
3. On the other PC, open `chrome://extensions`.
4. Enable `Developer mode`.
5. Click `Load unpacked`.
6. Select the copied output folder.
7. Open the popup and click `Connect App`.
8. Sign in to Tilt-Guard and open a TradingView chart to verify monitoring.
