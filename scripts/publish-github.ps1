# Publish a squashed-history snapshot of Spotter to github.com/clenoble/spotter
# and cut a release with the built extension zips.
#
# The NAS stays canonical; GitHub is a mirror that deliberately starts at one
# commit (ruled 2026-08-10, same pattern as Sovereign). Run from the repo root,
# on a clean tree, AFTER validation:
#
#   powershell -File scripts/publish-github.ps1 -Version v0.1
#
# Requires: gh CLI authenticated as clenoble; npm run build already done.
# ASCII on purpose: Windows PowerShell 5.1 reads unmarked files as ANSI, and
# a UTF-8 em dash in a comment is enough to break parsing.

param(
  [Parameter(Mandatory = $true)][string]$Version
)

$ErrorActionPreference = 'Stop'
$remote = 'https://github.com/clenoble/spotter.git'

if (git status --porcelain) { throw 'working tree is not clean - commit first' }
if (-not (Test-Path dist-chrome) -or -not (Test-Path dist-firefox)) { throw 'run npm run build first' }

# Notes follow the version: v0.2 -> docs/release-notes-0.2.md. Hardcoding 0.1
# here was a guarantee declared on one side and absent on the other, one
# release away from shipping old notes under a new tag.
$notes = Join-Path (Get-Location) ("docs\release-notes-" + $Version.TrimStart('v') + ".md")
if (-not (Test-Path $notes)) { throw "no release notes at $notes - write them first" }

# 1. Zips from the built bundles (*.zip is gitignored; they ride the release).
$chromeZip = Join-Path $env:TEMP "spotter-$Version-chrome.zip"
$firefoxZip = Join-Path $env:TEMP "spotter-$Version-firefox.zip"
if (Test-Path $chromeZip) { Remove-Item $chromeZip }
if (Test-Path $firefoxZip) { Remove-Item $firefoxZip }
Compress-Archive -Path dist-chrome\* -DestinationPath $chromeZip
Compress-Archive -Path dist-firefox\* -DestinationPath $firefoxZip

# 2. Export the tracked tree (git archive: tracked files only, nothing local,
#    nothing ignored, nothing from history) into a fresh single-commit repo.
$stage = Join-Path $env:TEMP "spotter-publish-$Version"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory $stage | Out-Null
git archive HEAD -o "$stage\tree.tar"
tar -xf "$stage\tree.tar" -C $stage
Remove-Item "$stage\tree.tar"

Push-Location $stage
try {
  git init -b main | Out-Null
  git add -A
  git commit -m "Spotter $Version - retrieval and filter, to spot the good and the great" | Out-Null
  git remote add origin $remote
  # Force: the public mirror is exactly this snapshot, by design.
  git push --force origin main
  git tag $Version
  git push --force origin $Version
} finally {
  Pop-Location
}

# 3. Assets: zips, the companion exe when built, and SHA256SUMS over all of
#    them (Sovereign's pattern - an unsigned download needs a verifiable
#    fingerprint published beside it).
$assets = @($chromeZip, $firefoxZip)
$exe = Join-Path (Get-Location) 'dist-companion\spotter-companion.exe'
if (Test-Path $exe) { $assets += $exe }

$sums = Join-Path $env:TEMP 'SHA256SUMS'
$assets | ForEach-Object {
  "{0}  {1}" -f (Get-FileHash $_ -Algorithm SHA256).Hash.ToLower(), (Split-Path $_ -Leaf)
} | Out-File $sums -Encoding ascii
$assets += $sums

gh release create $Version @assets `
  --repo clenoble/spotter `
  --title "Spotter $Version" `
  --notes-file $notes

Write-Host "published $Version -> $remote"
