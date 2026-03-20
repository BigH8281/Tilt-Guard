# Starts the backend and frontend dev servers in separate PowerShell windows.
# Run this script from the project root or via the optional start_all.bat wrapper.

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendRoot = Join-Path $projectRoot "frontend"
$frontendUrl = "http://localhost:5173"

# Prefer a local virtual environment when one exists.
$activateScript = $null
$activateCandidates = @(
    (Join-Path $projectRoot ".venv\Scripts\Activate.ps1"),
    (Join-Path $projectRoot "venv\Scripts\Activate.ps1")
)

foreach ($candidate in $activateCandidates) {
    if (Test-Path $candidate) {
        $activateScript = $candidate
        break
    }
}

# Use an existing dev secret when already set, otherwise generate a per-run dev secret.
$jwtSecret = if ($env:JWT_SECRET_KEY) {
    $env:JWT_SECRET_KEY
} else {
    [guid]::NewGuid().ToString("N")
}

$backendCommands = @(
    "Set-Location '$projectRoot'"
)

if ($activateScript) {
    $backendCommands += "& '$activateScript'"
}

$backendCommands += @(
    "`$env:JWT_SECRET_KEY = '$jwtSecret'",
    "python -m alembic upgrade head",
    "python -m uvicorn app.main:app --reload"
)

$frontendCommands = @(
    "Set-Location '$frontendRoot'",
    "npm.cmd run dev"
)

Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", ($backendCommands -join "; ")
)

Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", ($frontendCommands -join "; ")
)

# Give the dev servers a moment to start before opening the app.
Start-Sleep -Seconds 4

# Open the frontend in the default browser.
Start-Process $frontendUrl
