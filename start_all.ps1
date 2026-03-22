# Starts the backend and frontend dev servers in separate PowerShell windows.
# Run this script from the project root or via the optional start_all.bat wrapper.

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendRoot = Join-Path $projectRoot "frontend"
$frontendUrl = "http://localhost:5173"
$frontendNodeModules = Join-Path $frontendRoot "node_modules"
$envFile = Join-Path $projectRoot ".env"

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

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) {
            return
        }

        $separatorIndex = $line.IndexOf("=")
        if ($separatorIndex -lt 1) {
            return
        }

        $name = $line.Substring(0, $separatorIndex).Trim()
        $value = $line.Substring($separatorIndex + 1).Trim()
        if ($name) {
            [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

$pythonCommand = if (Get-Command py.exe -ErrorAction SilentlyContinue) {
    "py -3"
} elseif (Get-Command python.exe -ErrorAction SilentlyContinue) {
    "python"
} else {
    throw "Python was not found. Install Python or activate a project virtual environment first."
}

# Use an existing dev secret when already set, otherwise generate a per-run dev secret.
$jwtSecret = if ($env:JWT_SECRET_KEY) {
    $env:JWT_SECRET_KEY
} else {
    "tilt-guard-local-dev-secret"
}

$backendCommands = @(
    "Set-Location '$projectRoot'"
)

if ($activateScript) {
    $backendCommands += "& '$activateScript'"
}

$backendCommands += @(
    "`$env:JWT_SECRET_KEY = '$jwtSecret'",
    "$pythonCommand -m alembic upgrade head",
    "$pythonCommand -m uvicorn app.main:app --reload"
)

$frontendCommands = @(
    "Set-Location '$frontendRoot'"
)

if (-not (Test-Path $frontendNodeModules)) {
    $frontendCommands += "npm.cmd install"
}

$frontendCommands += @(
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
