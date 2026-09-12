# Builds the Black Book release zips (win/linux/mac) + checksums.sha256 and
# prints the GitHub release command. Run from the project root:
#   npm run release -- -Version 0.8.3
param(
  [Parameter(Mandatory = $true)][string]$Version
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path '.').Path
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  throw "Version must be like 0.8.3 (got '$Version')."
}

# --- Single source of truth: package.json (and the matching lockfile entries) ---
$PkgPath = Join-Path $Root 'package.json'
if (-not (Test-Path $PkgPath)) { throw "Missing package.json" }
$PkgText = [System.IO.File]::ReadAllText($PkgPath)
if ($PkgText -notmatch '"version"\s*:\s*"(\d+\.\d+\.\d+)"') { throw 'Could not find the version in package.json' }
$OldVersion = $Matches[1]
$PkgText = $PkgText -replace '"version"\s*:\s*"\d+\.\d+\.\d+"', "`"version`": `"$Version`""
[System.IO.File]::WriteAllText($PkgPath, $PkgText, $Utf8NoBom)

$LockPath = Join-Path $Root 'package-lock.json'
if (Test-Path $LockPath) {
  $LockText = [System.IO.File]::ReadAllText($LockPath)
  $LockText = $LockText.Replace("`"version`": `"$OldVersion`"", "`"version`": `"$Version`"")
  [System.IO.File]::WriteAllText($LockPath, $LockText, $Utf8NoBom)
}
Write-Host "Bumped $OldVersion -> $Version in package.json + package-lock.json"

# --- Assemble the payload (everything in the repo except user data / junk) ---
$Exclude = @(
  'profiles', 'import', 'node_modules', 'updates', '.git', '.superpowers',
  'data.json', 'data.json.bak', 'Black Book.xlsx', 'Black Book.pid',
  'Thumbs.db', '.DS_Store', 'dist'
)
$ExcludeParts = $Exclude | ForEach-Object { [regex]::Escape($_) }
$ExcludeRegex = '^(.*[\\/])?(' + ($ExcludeParts -join '|') + ')([\\/]|$)'

$Items = @()
foreach ($entry in Get-ChildItem -LiteralPath $Root -Force) {
  if ($entry.Name -match '\.(log|bak)$') { continue }
  if ($entry.Name -match $ExcludeRegex) { continue }
  $Items += $entry.FullName
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$Dist = Join-Path $Root 'dist'
if (Test-Path $Dist) { Remove-Item -LiteralPath $Dist -Recurse -Force }
New-Item -ItemType Directory -Path $Dist | Out-Null

$ZipBase = "black-book-v$Version"
$Checksums = @()
$PlatZips = @()

foreach ($plat in @('win', 'linux', 'mac')) {
  $ZipName = "$ZipBase-$plat.zip"
  $ZipPath = Join-Path $Dist $ZipName
  $platItems = $Items
  if ($plat -ne 'win') {
    $platItems = $Items | Where-Object {
      $name = Split-Path $_ -Leaf
      $name -notin @('Black Book.exe', 'Stop Black Book.bat', 'bb.ico') -and $name -ne 'launcher.cs'
    }
  }
  $Staging = Join-Path $Dist ("stage-$plat")
  if (Test-Path $Staging) { Remove-Item -LiteralPath $Staging -Recurse -Force }
  New-Item -ItemType Directory -Path $Staging | Out-Null
  foreach ($item in $platItems) {
    Copy-Item -LiteralPath $item -Destination (Join-Path $Staging (Split-Path $item -Leaf)) -Recurse -Force
  }
  [System.IO.Compression.ZipFile]::CreateFromDirectory($Staging, $ZipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)
  Remove-Item -LiteralPath $Staging -Recurse -Force
  $hash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLower()
  $Checksums += "$hash  $ZipName"
  $PlatZips += $ZipName
  Write-Host "Built $ZipName" -ForegroundColor Green
}

Set-Content -LiteralPath (Join-Path $Dist 'checksums.sha256') -Value $Checksums -Encoding ascii
Write-Host "Wrote dist\checksums.sha256" -ForegroundColor Green

Write-Host ""
Write-Host "Create the GitHub release (public repo) with:" -ForegroundColor Cyan
Write-Host "  gh release create v$Version --title \"v$Version\" --notes \"<changelog>\" $(( $PlatZips | ForEach-Object { "dist\$_" } ) -join ' ') dist\checksums.sha256" -ForegroundColor Gray
Write-Host ""
Write-Host "Updater expects one asset per platform (black-book-v$Version-{win,linux,mac}.zip) plus checksums.sha256." -ForegroundColor Yellow