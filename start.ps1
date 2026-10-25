# Starts Avatar Cropper locally. Double-click start.cmd, or run:
#   .\start.ps1            install if needed, then start the dev server and open the browser
#   .\start.ps1 -Sync      also refresh the Discord catalog, fonts and synced users
#   .\start.ps1 -Clean     wipe Vite's cache and the old build first
#   .\start.ps1 -Port 4321 -NoBrowser

param(
    [switch]$Sync,
    [switch]$Clean,
    [switch]$NoBrowser,
    [int]$Port = 1234
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }

# node //
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Say "Node.js isn't installed. Get the LTS from https://nodejs.org, then run this again." Red
    exit 1
}
$version = [version]((node -v).TrimStart('v'))
if ($version -lt [version]'20.19.0' -or ($version.Major -eq 21) -or ($version.Major -eq 22 -and $version -lt [version]'22.12.0')) {
    Say "Node $(node -v) is too old, version 20.19 or 22.12+ is needed. Update from https://nodejs.org." Red
    exit 1
}

# packages, installed on first run or when package-lock.json changes //
$stamp = 'node_modules\.package-lock.json'
if (-not (Test-Path $stamp) -or (Get-Item 'package-lock.json').LastWriteTime -gt (Get-Item $stamp).LastWriteTime) {
    Say 'Installing packages...' Cyan
    npm install --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { Say 'npm install failed, see above.' Red; exit 1 }
}

if ($Clean) {
    Say 'Clearing Vite cache...' Cyan
    Remove-Item -Recurse -Force 'node_modules\.vite', 'dist' -ErrorAction SilentlyContinue
}

# Discord preview data. the sync runs in its own window so the site starts right away //
if (-not (Test-Path 'discord.config.json')) {
    Copy-Item 'discord.config.example.json' 'discord.config.json'
    Say 'Made discord.config.json, add your bot token and user ids there for Synced Users.' Yellow
}

$steps = @()
if ($Sync -or -not (Test-Path 'public\discord\catalog.json')) { $steps += 'catalog' }
if ($Sync -or -not (Test-Path 'public\discord\fonts\fonts.json')) { $steps += 'fonts' }
if ($Sync) {
    $config = Get-Content 'discord.config.json' -Raw | ConvertFrom-Json
    if ($config.botToken -and $config.userIds.Count -gt 0) { $steps += 'users' }
}
if ($steps.Count -gt 0) {
    $commands = ($steps | ForEach-Object { "node scripts/discord-sync.mjs $_" }) -join '; '
    Say "Syncing Discord data in a separate window ($($steps -join ', '))..." Cyan
    Start-Process powershell -ArgumentList '-NoProfile', '-Command', "`$Host.UI.RawUI.WindowTitle = 'Discord sync'; Set-Location '$PSScriptRoot'; $commands; Write-Host 'Done, reload the page. This window closes in 10 seconds.'; Start-Sleep 10"
}

# already running? just open it //
$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    Say "Something is already running on port $Port, opening it." Yellow
    if (-not $NoBrowser) { Start-Process "http://localhost:$Port" }
    exit 0
}

Say "Starting Avatar Cropper on http://localhost:$Port (Ctrl+C to stop)" Green
$viteArgs = @('vite', '--port', $Port, '--strictPort')
if (-not $NoBrowser) { $viteArgs += '--open' }
npx @viteArgs
