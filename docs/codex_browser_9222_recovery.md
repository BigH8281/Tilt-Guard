# Codex Browser 9222 Recovery

## Purpose

This file records the working recovery process for restoring Codex browser access when the DevTools/browser bridge drops and reports errors such as:

- `Transport closed`
- browser page listing fails even though Chrome is installed

This is specifically for the setup used in this project:

- repo opened from WSL/Linux
- Chrome running on Windows host
- Codex browser tooling expected to attach to Chrome DevTools on port `9222`

## Important Rule

If Chrome is already running normally, do not just launch another Chrome command with `--remote-debugging-port=9222`.

Hard-close Chrome first.

If you skip the hard close, Chrome may reopen or reuse the existing session without actually binding the `9222` DevTools port.

## Recovery Steps

### 1. Force-close Chrome and Edge from the terminal

Run from the project terminal:

```bash
powershell.exe -NoProfile -Command "Get-Process chrome,msedge -ErrorAction SilentlyContinue | Stop-Process -Force"
```

If needed, confirm there are no remaining browser processes:

```bash
powershell.exe -NoProfile -Command "Get-Process chrome,msedge -ErrorAction SilentlyContinue | Select-Object ProcessName,Id,MainWindowTitle | Format-Table -AutoSize"
```

The ideal result is no remaining `chrome` or `msedge` processes.

### 2. Relaunch Chrome with DevTools on port 9222

Use a dedicated profile for the Codex-controlled browser instance:

```bash
powershell.exe -NoProfile -Command "New-Item -ItemType Directory -Force -Path 'C:\temp\codex-chrome-9222' | Out-Null; Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList '--remote-debugging-port=9222','--remote-allow-origins=*','--user-data-dir=C:\temp\codex-chrome-9222','--no-first-run','--no-default-browser-check','about:blank'"
```

Why this matters:

- `--remote-debugging-port=9222` exposes the DevTools endpoint
- `--user-data-dir=...` avoids profile/session reuse problems
- `about:blank` gives Chrome a simple initial page

### 3. Verify that port 9222 is actually listening

Check from the terminal:

```bash
powershell.exe -NoProfile -Command "netstat -ano | Select-String ':9222'"
```

Expected result:

- a `LISTENING` entry on `127.0.0.1:9222`

If `9222` is not listening, Chrome did not start in the correct debug mode and should be hard-closed and relaunched again.

### 4. Reload VS Studio so Codex reattaches

Even after Chrome is listening on `9222`, Codex browser access may still fail until the VS Studio window is reloaded.

In VS Studio / VS Code:

1. Press `Ctrl+Shift+P`
2. Run `Developer: Reload Window`
3. Wait for the Codex chat/tools to reconnect

If that does not fix it:

1. Keep Chrome open
2. Fully close VS Studio
3. Reopen the project
4. Return to the Codex chat

## Verification

After the VS Studio reload, ask Codex to check browser access again.

The expected successful state is that Codex can list browser pages, for example:

- `about:blank [selected]`

## Known Working Sequence

This exact sequence worked for this repo/session:

1. Browser tool was failing with `Transport closed`
2. Chrome was hard-closed from terminal
3. Chrome was reopened with `--remote-debugging-port=9222`
4. A dedicated Chrome profile under `C:\temp\codex-chrome-9222` was used
5. `netstat` confirmed `127.0.0.1:9222` was listening
6. VS Studio window was reloaded with `Developer: Reload Window`
7. Codex browser access started working again

## Fast Recovery Copy/Paste

Use these two terminal commands first:

```bash
powershell.exe -NoProfile -Command "Get-Process chrome,msedge -ErrorAction SilentlyContinue | Stop-Process -Force"
```

```bash
powershell.exe -NoProfile -Command "New-Item -ItemType Directory -Force -Path 'C:\temp\codex-chrome-9222' | Out-Null; Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList '--remote-debugging-port=9222','--remote-allow-origins=*','--user-data-dir=C:\temp\codex-chrome-9222','--no-first-run','--no-default-browser-check','about:blank'"
```

Then in VS Studio:

1. `Ctrl+Shift+P`
2. `Developer: Reload Window`
3. Ask Codex: `check browser now`

## Notes

- This recovery flow is operational documentation, not product behavior.
- It is meant to restore Codex browser control only.
- If Chrome is installed in a different Windows path, update the Chrome executable path in the launch command.
