# Tilt Guard Extension

This extension now ships as a single unpacked build.

## Mode behavior

- First install defaults to `HOSTED`
- The popup includes a `Hosted` / `Local` toggle
- Switching mode does not require a rebuild
- The active mode controls:
  - the `/extension/connect` URL opened by the popup
  - the backend API base URL used by the service worker
  - the app origin trusted for auth sync

## Load targets

- Raw source: load [`extension/`](/home/higgo/code/Tilt-Guard/extension)
- Built unpacked folder: load [`extension/dist/unpacked/`](/home/higgo/code/Tilt-Guard/extension/dist/unpacked)

## Build the single unpacked folder

If you want the built folder to contain the real Railway defaults, run:

```bash
python3 scripts/build_extension.py \
  --hosted-app-base-url https://<frontend-domain> \
  --hosted-api-base-url https://<backend-domain>
```

This writes the unpacked extension to `extension/dist/unpacked/`.

If you skip the hosted URL arguments, the built folder keeps the placeholder values from
[`extension/src/shared/extension-config.js`](/home/higgo/code/Tilt-Guard/extension/src/shared/extension-config.js).

## Auth flow

1. Load the unpacked extension folder in `chrome://extensions`.
2. Open the popup.
3. Confirm the mode is `Hosted` for normal remote use.
4. Click `Connect App`.
5. Sign in through the web app if needed.
6. The `/extension/connect` page syncs the current JWT into extension storage.
7. Return to the popup to confirm the connection and monitoring state.

## Switching modes

- `Hosted` uses the hosted frontend/backend pair.
- `Local` uses `http://127.0.0.1:5173` and `http://127.0.0.1:8000`.
- Changing mode clears auth/session state and queued telemetry so environments do not mix.
