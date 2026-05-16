<#
  gamja-docs - restart ALL services (Docker stack + backend + frontend).

  Run from a normal PowerShell window:
    .\restart-all.ps1            # backend WITH --reload (dev mode)
    .\restart-all.ps1 -NoReload  # backend WITHOUT --reload (saves ~RAM, no auto-restart on edits)
    .\restart-all.ps1 -StopOnly  # just stop everything, don't start

  Backend and frontend each open in their own PowerShell window so you can see their logs.
  Closing one of those windows stops that service.

  Order:  stop everything  ->  docker compose up (qdrant + paddleocr-vl)  ->  wait  ->  backend  ->  frontend
  Note: Ollama is expected to already be running (Windows app / 'ollama serve'); the script only warns if not.
#>
param(
  [switch]$NoReload,
  [switch]$StopOnly
)

$ErrorActionPreference = 'Continue'
$root        = $PSScriptRoot
$backendDir  = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$dockerDir   = Join-Path $root 'docker'
$venvPy      = Join-Path $backendDir '.venv\Scripts\python.exe'
$vllmImage   = 'ccr-2vdh3abv-pub.cnc.bj.baidubce.com/paddlepaddle/paddleocr-genai-vllm-server:latest-nvidia-gpu'

function Kill-ByCmdline([string]$procName, [string]$pattern, [string]$label) {
  Get-CimInstance Win32_Process -Filter "Name='$procName'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and ($_.CommandLine -like $pattern) } |
    ForEach-Object {
      Write-Host ("  stop {0}  (pid {1})" -f $label, $_.ProcessId)
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Wait-Url([string]$url, [string]$label, [int]$timeoutSec = 120) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $timeoutSec) {
    try {
      Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop | Out-Null
      Write-Host ("  OK   {0}  ({1}s)" -f $label, [int]$sw.Elapsed.TotalSeconds) -ForegroundColor Green
      return $true
    } catch { }
    Start-Sleep -Seconds 3
  }
  Write-Host ("  WARN {0} not ready after {1}s (continuing anyway)" -f $label, $timeoutSec) -ForegroundColor Yellow
  return $false
}

# ---- sanity ----
if (-not (Test-Path $venvPy))   { Write-Host "ERROR: backend venv not found: $venvPy" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $dockerDir)) { Write-Host "ERROR: docker dir not found: $dockerDir" -ForegroundColor Red; exit 1 }

# ---- 1) stop ----
Write-Host "`n[1/5] Stopping services ..." -ForegroundColor Cyan
Kill-ByCmdline 'node.exe'   '*gamja-docs*frontend*' 'frontend (next dev)'
Kill-ByCmdline 'python.exe' '*uvicorn*app.main*'    'backend (uvicorn)'
# ad-hoc 'docker run' vLLM container (not compose-managed) that may be holding port 8118
$adhoc = & docker ps -q --filter "ancestor=$vllmImage" 2>$null
foreach ($c in $adhoc) { Write-Host "  stop vLLM container $c"; & docker stop $c 2>$null | Out-Null }
# compose stack down
Push-Location $dockerDir; & docker compose down 2>$null | Out-Null; Pop-Location

if ($StopOnly) { Write-Host "`nAll stopped." -ForegroundColor Green; exit 0 }

# ---- 2) docker stack ----
Write-Host "`n[2/5] Starting Docker stack (qdrant + paddleocr-vl) ..." -ForegroundColor Cyan
Push-Location $dockerDir; & docker compose up -d; Pop-Location
if (-not (Get-Process ollama -ErrorAction SilentlyContinue)) {
  Write-Host "  WARN: Ollama process not found. Start the Ollama app or run 'ollama serve'." -ForegroundColor Yellow
} else {
  Write-Host "  OK   Ollama is running"
}

# ---- 3) wait for infra ----
Write-Host "`n[3/5] Waiting for infra to come up ..." -ForegroundColor Cyan
Wait-Url 'http://localhost:6333'             'Qdrant'              30  | Out-Null
Wait-Url 'http://localhost:8118/v1/models'   'PaddleOCR-VL (vLLM)' 300 | Out-Null

# ---- 4) backend ----
Write-Host "`n[4/5] Starting backend (uvicorn :8000) ..." -ForegroundColor Cyan
$reloadFlag = if ($NoReload) { '' } else { '--reload' }
$beCmd = "Set-Location '$backendDir'; Write-Host 'gamja-docs BACKEND  ->  http://localhost:8000' -ForegroundColor Cyan; & '$venvPy' -m uvicorn app.main:app --port 8000 $reloadFlag"
Start-Process powershell -ArgumentList '-NoExit','-Command',$beCmd
Wait-Url 'http://localhost:8000/health' 'backend' 120 | Out-Null

# ---- 5) frontend ----
Write-Host "`n[5/5] Starting frontend (next dev :3000) ..." -ForegroundColor Cyan
$feCmd = "Set-Location '$frontendDir'; Write-Host 'gamja-docs FRONTEND  ->  http://localhost:3000' -ForegroundColor Green; npm run dev"
Start-Process powershell -ArgumentList '-NoExit','-Command',$feCmd
Wait-Url 'http://localhost:3000' 'frontend' 120 | Out-Null

Write-Host "`nDone." -ForegroundColor Green
Write-Host "  Frontend : http://localhost:3000"
Write-Host "  Backend  : http://localhost:8000/docs"
Write-Host "  Qdrant   : http://localhost:6333/dashboard"
Write-Host "  vLLM OCR : http://localhost:8118/v1/models"
Write-Host "`nBackend & frontend run in their own windows -- closing a window stops that service."
