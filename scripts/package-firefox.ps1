$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$buildDirectory = Join-Path $projectRoot 'dist\firefox'
$releaseDirectory = Join-Path $projectRoot 'dist\releases'
$readmeSource = Join-Path $projectRoot 'docs\START_HERE_FIREFOX.txt'
$archivePath = Join-Path $releaseDirectory 'OtpPilot-Firefox.zip'
$amoArchivePath = Join-Path $releaseDirectory 'OtpPilot-AMO-upload.zip'
$sourceArchivePath = Join-Path $releaseDirectory 'OtpPilot-source-code.zip'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path -LiteralPath (Join-Path $buildDirectory 'manifest.json'))) {
  throw 'Firefox build is missing. Run npm run build:firefox first.'
}
if (-not (Test-Path -LiteralPath $readmeSource)) {
  throw 'The Firefox quick-start guide is missing.'
}

New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
Copy-Item -LiteralPath $readmeSource -Destination (Join-Path $buildDirectory 'START_HERE.txt') -Force

function New-ForwardSlashZip($sourceRoot, $destination, $includedPaths) {
  if (Test-Path -LiteralPath $destination) {
    Remove-Item -LiteralPath $destination -Force
  }
  $zip = [System.IO.Compression.ZipFile]::Open(
    $destination,
    [System.IO.Compression.ZipArchiveMode]::Create
  )
  try {
    foreach ($includedPath in $includedPaths) {
      $source = Join-Path $sourceRoot $includedPath
      $items = if ((Get-Item -LiteralPath $source).PSIsContainer) {
        Get-ChildItem -LiteralPath $source -File -Recurse
      } else {
        @(Get-Item -LiteralPath $source)
      }
      foreach ($item in $items) {
        $entryName = $item.FullName.Substring($sourceRoot.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
          $zip,
          $item.FullName,
          $entryName,
          [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
      }
    }
  } finally {
    $zip.Dispose()
  }
}

New-ForwardSlashZip $buildDirectory $archivePath @('manifest.json', 'src', 'icons', 'START_HERE.txt')
New-ForwardSlashZip $buildDirectory $amoArchivePath @('manifest.json', 'src', 'icons')
New-ForwardSlashZip $projectRoot $sourceArchivePath @(
  'README.md',
  '.gitignore',
  'package.json',
  'config.example.json',
  'manifest.json',
  'manifests',
  'src',
  'icons',
  'scripts',
  'tests',
  'docs',
  'demo',
  '.github'
)
Write-Output "Created Firefox coworker package: $archivePath"
Write-Output "Created Mozilla signing upload: $amoArchivePath"
Write-Output "Created Mozilla source-code package: $sourceArchivePath"
