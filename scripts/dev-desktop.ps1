[CmdletBinding()]
param(
  [ValidateSet("start", "status", "stop", "restart")]
  [string]$Action = "start",
  [int]$Port = 5100,
  [int]$BackendPort = 5000
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptRoot "..")).Path
$metadataDir = Join-Path $repoRoot ".dev-desktop"
$metadataPath = Join-Path $metadataDir "session.json"
$stdoutPath = Join-Path $metadataDir "desktop.stdout.log"
$stderrPath = Join-Path $metadataDir "desktop.stderr.log"
$frontendStdoutPath = Join-Path $metadataDir "frontend.stdout.log"
$frontendStderrPath = Join-Path $metadataDir "frontend.stderr.log"
$backendStdoutPath = Join-Path $metadataDir "backend.stdout.log"
$backendStderrPath = Join-Path $metadataDir "backend.stderr.log"
$tauriStdoutPath = Join-Path $metadataDir "tauri.stdout.log"
$tauriStderrPath = Join-Path $metadataDir "tauri.stderr.log"
$tauriConfigPath = Join-Path $metadataDir "tauri.dev.conf.json"

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

function Get-RepoIdentity {
  $branch = (& git -C $repoRoot branch --show-current).Trim()
  $head = (& git -C $repoRoot rev-parse HEAD).Trim()
  if (-not $branch -or -not $head) { Fail "No se pudo resolver branch/HEAD en $repoRoot" }
  return @{ branch = $branch; head = $head }
}

function Get-ProcessInfo([int]$ProcessId) {
  try {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId"
    if ($null -eq $p) { return $null }
    return $p
  } catch { return $null }
}

function Get-DesktopAppProcess {
  $expected = (Join-Path $repoRoot "src-tauri\target\debug\app.exe").Replace('/', '\\')
  return @(Get-CimInstance Win32_Process -Filter "Name = 'app.exe'" -ErrorAction SilentlyContinue | Where-Object {
    ([string]$_.ExecutablePath).Equals($expected, [System.StringComparison]::OrdinalIgnoreCase)
  } | Select-Object -First 1)
}

function Test-OwnedProcess($Process, [string]$ExpectedRoot, [int]$ExpectedPort) {
  if ($null -eq $Process) { return $false }
  $cmd = [string]$Process.CommandLine
  $cwd = [string]$Process.ExecutablePath
  $looksRepo = $cmd.Contains($ExpectedRoot) -or $cwd.StartsWith($ExpectedRoot, [System.StringComparison]::OrdinalIgnoreCase)
  $looksPort = $cmd.Contains("$ExpectedPort")
  return $looksRepo -and ($looksPort -or $cmd.Contains("tauri") -or $cmd.Contains("server/index.ts"))
}

function Read-Session {
  if (-not (Test-Path $metadataPath)) { return $null }
  try { return Get-Content $metadataPath -Raw | ConvertFrom-Json } catch { return $null }
}

function Stop-Session {
  $session = Read-Session
  if ($null -eq $session) { Write-Output "No hay sesión repo-owned registrada."; return }
  $pids = @([int]$session.backendPid, [int]$session.frontendPid, [int]$session.tauriPid) + @(Get-PortOwner ([int]$session.backendPort)) + @(Get-PortOwner ([int]$session.frontendPort)) | Where-Object { $_ -gt 0 } | Select-Object -Unique
  foreach ($candidatePid in $pids) {
    $p = Get-ProcessInfo $candidatePid
    $ownedPort = if ($candidatePid -eq [int]$session.backendPid) { [int]$session.backendPort } else { [int]$session.frontendPort }
    if (Test-OwnedProcess $p $repoRoot $ownedPort) {
      & taskkill.exe /PID $candidatePid /T /F | Out-Null
      Write-Output "Stopped owned process tree PID $candidatePid"
    }
  }
  Remove-Item $metadataPath -Force -ErrorAction SilentlyContinue
}

function Get-PortOwner([int]$CheckPort) {
  $needle = ":$CheckPort"
  $owners = @()
  foreach ($line in (& netstat.exe -ano -p tcp 2>$null)) {
    if ($line -match "LISTENING" -and $line -match [regex]::Escape($needle)) {
      $parts = ($line -split '\s+') | Where-Object { $_ }
      if ($parts.Count -ge 5 -and $parts[4] -match '^\d+$') { $owners += [int]$parts[4] }
    }
  }
  return @($owners | Select-Object -Unique)
}

function Wait-Frontend([int]$CheckPort, [int]$TimeoutSeconds = 180) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $owners = Get-PortOwner $CheckPort
    if ($owners.Count -gt 0) {
      try {
        $root = Invoke-WebRequest -Uri "http://127.0.0.1:$CheckPort/" -UseBasicParsing -TimeoutSec 5
        $body = [string]$root.Content
        if ($body.Contains('id="root"') -and ($body.Contains("main.tsx") -or $body.Contains("main.jsx"))) {
          Write-Output "FRONTEND READY=YES PORT=$CheckPort LISTENER_PID=$($owners -join ',') HTTP_ROOT=$($root.StatusCode)"
          return $true
        }
      } catch { }
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Wait-Backend([int]$CheckPort, [int]$TimeoutSeconds = 600) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $owners = Get-PortOwner $CheckPort
    if ($owners.Count -gt 0) {
      try {
        $health = Invoke-WebRequest -Uri "http://127.0.0.1:$CheckPort/health" -UseBasicParsing -TimeoutSec 5
        if ($health.StatusCode -eq 200) {
          Write-Output "BACKEND READY=YES PORT=$CheckPort LISTENER_PID=$($owners -join ',') HTTP_HEALTH=$($health.StatusCode)"
          return $true
        }
      } catch { }
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  return $false
}

$identity = Get-RepoIdentity
if (-not (Test-Path (Join-Path $repoRoot "package.json")) -or -not (Test-Path (Join-Path $repoRoot "src-tauri\tauri.conf.json"))) {
  Fail "Faltan package.json o src-tauri/tauri.conf.json en $repoRoot"
}

if ($Action -eq "stop") { Stop-Session; exit 0 }
if ($Action -eq "status") {
  $session = Read-Session
  Write-Output "WORKTREE=$repoRoot"
  Write-Output "HEAD=$($identity.head)"
  Write-Output "BRANCH=$($identity.branch)"
  if ($null -eq $session) { Write-Output "DESKTOP_STARTED=NO"; exit 0 }
  $frontend = Get-ProcessInfo ([int]$session.frontendPid)
  $tauri = Get-ProcessInfo ([int]$session.tauriPid)
  $app = @(Get-DesktopAppProcess | Select-Object -First 1)
  $frontendOwner = @(Get-PortOwner ([int]$session.frontendPort) | Select-Object -First 1)
  $backendOwner = @(Get-PortOwner ([int]$session.backendPort) | Select-Object -First 1)
  if ($frontendOwner.Count -gt 0) { $frontend = Get-ProcessInfo ([int]$frontendOwner[0]) }
  if ($backendOwner.Count -gt 0) { $backend = Get-ProcessInfo ([int]$backendOwner[0]) }
  $frontendReady = ($frontendOwner.Count -gt 0) -and (Test-OwnedProcess $frontend $repoRoot ([int]$session.frontendPort))
  $tauriReady = ($app.Count -gt 0)
  Write-Output "FRONTEND_PORT=$($session.frontendPort)"
  Write-Output "BACKEND_PORT=$($session.backendPort)"
  $backendReady = ($backendOwner.Count -gt 0) -and (Test-OwnedProcess $backend $repoRoot ([int]$session.backendPort))
  Write-Output "BACKEND_PID=$($(if ($backendOwner.Count -gt 0) { $backendOwner[0] } else { $session.backendPid })) OWNED=$($backendReady)"
  Write-Output "FRONTEND_PID=$($(if ($frontendOwner.Count -gt 0) { $frontendOwner[0] } else { $session.frontendPid })) OWNED=$($frontendReady)"
  Write-Output "TAURI_PID=$($session.tauriPid) OWNED=$($tauriReady)"
  if ($app.Count -gt 0) { Write-Output "APP_PID=$($app[0].ProcessId) APP_PATH=$($app[0].ExecutablePath)" }
  Write-Output "FRONTEND_READY=$((Wait-Frontend ([int]$session.frontendPort) 2))"
  try { $health = Invoke-WebRequest -Uri "http://127.0.0.1:$($session.backendPort)/health" -UseBasicParsing -TimeoutSec 3; if ($health.StatusCode -eq 200) { Write-Output "BACKEND_READY=YES HTTP_HEALTH=$($health.StatusCode)" } else { Write-Output "BACKEND_READY=NO HTTP_HEALTH=$($health.StatusCode)" } } catch { Write-Output "BACKEND_READY=NO" }
  Write-Output "CURRENT_HEAD_VERIFIED=$([bool]($session.head -eq $identity.head))"
  exit 0
}

if ($Action -eq "restart") { Stop-Session }
if ((Get-PortOwner $Port).Count -gt 0) { Fail "El puerto $Port ya está ocupado; no se termina el proceso existente." }
if ((Get-PortOwner $BackendPort).Count -gt 0) { Fail "El puerto backend $BackendPort ya está ocupado; no se termina el proceso existente." }

New-Item -ItemType Directory -Force -Path $metadataDir | Out-Null
Remove-Item $stdoutPath, $stderrPath, $frontendStdoutPath, $frontendStderrPath, $backendStdoutPath, $backendStderrPath, $tauriStdoutPath, $tauriStderrPath, $tauriConfigPath -Force -ErrorAction SilentlyContinue
$backendCommand = "set NODE_ENV=development&&set PORT=$BackendPort&&set BINANCE_USE_VISION_API=true&&set GT_NAUTILUS_SERVER_PAPER_ENABLED=true&&set GT_NAUTILUS_SERVER_PAPER_ORDERS_ENABLED=true&&set GT_NAUTILUS_SERVER_PAPER_ALLOW_ORDER_AUTHORIZATION=true&&npm run dev"
$backend = Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/s", "/c", "`"$backendCommand`"") -WorkingDirectory $repoRoot -RedirectStandardOutput $backendStdoutPath -RedirectStandardError $backendStderrPath -PassThru -WindowStyle Hidden
$frontendArgs = "run dev:client -- --host 127.0.0.1 --port $Port"
$frontendCommand = "set NODE_ENV=development&&set VITE_PLATFORM=desktop&&set VITE_HEATMAP_ENABLED=true&&set VITE_API_BASE_URL=&&set VITE_API_PROXY_TARGET=http://127.0.0.1:$BackendPort&&npm run dev:client -- --host 127.0.0.1 --port $Port"
$frontend = Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/s", "/c", "`"$frontendCommand`"") -WorkingDirectory $repoRoot -RedirectStandardOutput $frontendStdoutPath -RedirectStandardError $frontendStderrPath -PassThru -WindowStyle Hidden
$session = [ordered]@{ worktree=$repoRoot; branch=$identity.branch; head=$identity.head; backendPort=$BackendPort; backendPid=$backend.Id; frontendPort=$Port; frontendPid=$frontend.Id; tauriPid=0; startedAt=(Get-Date).ToUniversalTime().ToString("o"); command="npm run tauri dev -- --config $tauriConfigPath" }
$session | ConvertTo-Json | Set-Content -Path $metadataPath -Encoding UTF8
if (-not (Wait-Backend $BackendPort 180)) { Stop-Session; Fail "BACKEND_READY=NO: no respondió el backend en http://127.0.0.1:$BackendPort/health dentro del límite." }
if (-not (Wait-Frontend $Port 60)) { Stop-Session; Fail "FRONTEND_READY=NO: no se sirvió la SPA en http://127.0.0.1:$Port/ dentro del límite." }
$session.backendPid = @(Get-PortOwner $BackendPort | Select-Object -First 1)[0]
$session.frontendPid = @(Get-PortOwner $Port | Select-Object -First 1)[0]
$session | ConvertTo-Json | Set-Content -Path $metadataPath -Encoding UTF8

$config = [ordered]@{ build = [ordered]@{ devUrl = "http://localhost:$Port"; beforeDevCommand = "" } }
$config | ConvertTo-Json -Depth 4 | Set-Content -Path $tauriConfigPath -Encoding UTF8
$tauri = Start-Process -FilePath "npm.cmd" -ArgumentList @("run","tauri","dev","--","--config",$tauriConfigPath) -WorkingDirectory $repoRoot -RedirectStandardOutput $tauriStdoutPath -RedirectStandardError $tauriStderrPath -PassThru
$session.tauriPid = $tauri.Id
$session | ConvertTo-Json | Set-Content -Path $metadataPath -Encoding UTF8
Write-Output "WORKTREE=$repoRoot"
Write-Output "HEAD=$($identity.head)"
Write-Output "BRANCH=$($identity.branch)"
Write-Output "ACTUAL FRONTEND DEV COMMAND=npm run dev:client -- --host 127.0.0.1 --port $Port"
Write-Output "ACTUAL TAURI DEV COMMAND=$($session.command)"
Write-Output "FRONTEND PID=$($frontend.Id)"
Write-Output "TAURI PID=$($tauri.Id)"
Write-Output "FRONTEND READY=YES PORT=$Port"
Write-Output "DESKTOP STARTED=YES; verify the Tauri window and run scripts/dev-desktop.ps1 status"
