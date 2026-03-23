# Tilt Guard Telemetry Extension

The extension now supports explicit environment modes and a journal-driven auth handshake.

## Load targets

- Raw source local default: load [`extension/`](/home/higgo/code/Tilt-Guard/extension)
- Generated local build: load [`extension/dist/local/`](/home/higgo/code/Tilt-Guard/extension/dist/local)
- Generated hosted build: load [`extension/dist/hosted/`](/home/higgo/code/Tilt-Guard/extension/dist/hosted)

Chrome still loads the extension as an unpacked folder. There is no packed build step required.

## Build mode-specific unpacked folders

Local:

```bash
python scripts/build_extension.py --mode local
```

Hosted:

```bash
python scripts/build_extension.py \
  --mode hosted \
  --app-base-url https://<frontend-domain> \
  --api-base-url https://<backend-domain>
```

## Auth flow

1. Load the unpacked extension folder for the mode you want.
2. Open the popup.
3. Click `Connect Journal`.
4. Sign in through the journal UI if needed.
5. The `/extension/connect` page sends the current JWT to the extension through `chrome.runtime.sendMessage(...)`.
6. Return to the popup to confirm `Auth: Connected`.

No token copy/paste is required.

## Local verification

1. Start the local stack.
2. Load either [`extension/`](/home/higgo/code/Tilt-Guard/extension) or [`extension/dist/local/`](/home/higgo/code/Tilt-Guard/extension/dist/local).
3. Click `Connect Journal` and sign in locally.
4. Open a live TradingView chart.
5. Use `Flush Now` in the popup or wait for the background alarm.

## Hosted verification

1. Build the hosted unpacked folder with the real frontend/backend URLs.
2. Load [`extension/dist/hosted/`](/home/higgo/code/Tilt-Guard/extension/dist/hosted).
3. Click `Connect Journal` and sign in against the hosted journal.
4. Confirm the popup shows the hosted API/journal URLs and `Auth: Connected`.
