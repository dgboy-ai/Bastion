# Bastion Shield — EC2 Deployment Script (Windows PowerShell)
# Run on Windows Server 2022 EC2 instance
# Requires: Node.js 20, Python 3.11 pre-installed

param(
    [switch]$BuildOnly
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/dgboy-ai/Bastion.git"
$Branch = "main"
$BastionDir = "$env:USERPROFILE\bastion"
$DashboardDir = "$BastionDir\dashboard"
$PythonSrc = "$BastionDir"

Write-Host "=== Bastion Shield EC2 Deployment ===" -ForegroundColor Cyan

# Ensure Node.js
$nodeVer = node --version 2>$null
if (-not $nodeVer) {
    Write-Host "ERROR: Node.js is required. Install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}
Write-Host "Node: $nodeVer"

# Ensure Python
$pyVer = python --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Python 3.11+ is required." -ForegroundColor Red
    exit 1
}
Write-Host "Python: $pyVer"

# Clone or pull repo
if (-not (Test-Path $BastionDir)) {
    Write-Host ">>> Cloning Bastion..."
    git clone --branch $Branch $RepoUrl $BastionDir
} else {
    Write-Host ">>> Repo exists, pulling latest..."
    Push-Location $BastionDir
    git pull origin $Branch
    Pop-Location
}

# Build dashboard
Write-Host ">>> Building dashboard..."
Push-Location $DashboardDir
npm ci
npm run build
Pop-Location
Write-Host "Dashboard build: OK" -ForegroundColor Green

# Install Python package
Write-Host ">>> Installing Python package..."
Push-Location $BastionDir
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[mcp,a2a,groq]"
Pop-Location
Write-Host "Python install: OK" -ForegroundColor Green

if ($BuildOnly) {
    Write-Host "=== Build complete. Skipping service setup (--BuildOnly) ===" -ForegroundColor Yellow
    exit 0
}

# Create .env.production from template (no secrets — user must fill in)
$envFile = "$DashboardDir\.env.production"
if (-not (Test-Path $envFile)) {
    Write-Host ">>> .env.production not found. Creating from .env.example..."
    Copy-Item "$DashboardDir\.env.example" $envFile
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Red
    Write-Host "  IMPORTANT: Edit $envFile with your real credentials!" -ForegroundColor Yellow
    Write-Host "  Required: BASTION_CONN, BASTION_API_KEY, GROQ_API_KEY" -ForegroundColor Yellow
    Write-Host "================================================================" -ForegroundColor Red
    Write-Host ""
} else {
    Write-Host ">>> .env.production found, using existing config" -ForegroundColor Green
}

# Start services with PM2 (requires npm install -g pm2)
Write-Host ">>> Installing PM2..."
npm install -g pm2

Write-Host ">>> Starting services..."

# Dashboard on :3000
pm2 delete bastion-dashboard 2>$null
pm2 start npm --name "bastion-dashboard" --cwd "$DashboardDir" -- start -- --port 3000

# MCP Server on :9997
pm2 delete bastion-mcp 2>$null
pm2 start "$BastionDir\.venv\Scripts\python.exe" --name "bastion-mcp" -- -m bastion.mcp_server --transport http --host 0.0.0.0 --port 9997

# A2A Server on :9998
pm2 delete bastion-a2a 2>$null
pm2 start "$BastionDir\.venv\Scripts\python.exe" --name "bastion-a2a" -- -m bastion.a2a_server

pm2 save

Write-Host ""
Write-Host "=== Deployment Complete ===" -ForegroundColor Green
Write-Host "Dashboard:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "MCP Server: http://localhost:9997" -ForegroundColor Cyan
Write-Host "A2A Server: http://localhost:9998" -ForegroundColor Cyan
Write-Host ""
Write-Host "PM2 status: pm2 status" -ForegroundColor Gray
Write-Host "View logs:  pm2 logs" -ForegroundColor Gray
