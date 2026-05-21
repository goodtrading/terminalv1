# GoodTrading — local dev on Windows (run from project root, ideally C:\Dev\Terminal-Goodtrading-stable)
$ErrorActionPreference = "Stop"
$port = 5000

if ($PWD.Path -match "OneDrive") {
  Write-Warning "Project is under OneDrive. Prefer: C:\Dev\Terminal-Goodtrading-stable"
}

Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

npm run dev:clean
npm run dev
