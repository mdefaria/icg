<#
.SYNOPSIS
  Build (and sign) the ICG Windows installer with Inno Setup.

.DESCRIPTION
  Compiles installers\windows\icg.iss. Signing is done by Inno's Sign Tool
  hook so Setup, the uninstaller and Setup's temporary self-copies are all
  signed. Three signing modes:
    TrustedSigning  Azure Trusted Signing / Artifact Signing via signtool's
                    /dlib (Microsoft.Trusted.Signing.Client NuGet package).
                    Credentials come from the environment (AZURE_TENANT_ID,
                    AZURE_CLIENT_ID, AZURE_CLIENT_SECRET) or an az login.
    Thumbprint      signtool /sha1 <thumbprint> against a certificate in the
                    user store (USB token or cloud-HSM CSP such as KeyLocker
                    or eSigner CKA).
    Pfx             signtool /f <pfx> /p <password> (test certificates only;
                    CA-issued OV/EV keys cannot be exported to a PFX since
                    June 2023).
    None            unsigned build for local testing.

.EXAMPLE
  .\build.ps1 -Version 1.2.3 -SignMode TrustedSigning
#>
[CmdletBinding()]
param(
  [string]$Version = "0.0.0-dev",
  [string]$PremiereDir = (Join-Path $PSScriptRoot "..\build\cep\com.icg.premiere"),
  [string]$ResolveDir = (Join-Path $PSScriptRoot "..\..\apps\resolve\dist"),
  [string]$OutputDir = (Join-Path $PSScriptRoot "..\build\windows"),
  [ValidateSet("None", "TrustedSigning", "Thumbprint", "Pfx")]
  [string]$SignMode = "None",
  [string]$CertThumbprint = $env:WINDOWS_CODESIGN_THUMBPRINT,
  [string]$PfxPath = $env:WINDOWS_CODESIGN_PFX,
  [string]$PfxPassword = $env:WINDOWS_CODESIGN_PFX_PASSWORD,
  [string]$TimestampUrl = "http://timestamp.digicert.com",
  [string]$TrustedSigningEndpoint = $env:AZURE_TRUSTED_SIGNING_ENDPOINT,
  [string]$TrustedSigningAccount = $env:AZURE_TRUSTED_SIGNING_ACCOUNT,
  [string]$TrustedSigningProfile = $env:AZURE_TRUSTED_SIGNING_PROFILE,
  [string]$TrustedSigningClientPackage = "Microsoft.Trusted.Signing.Client",
  [string]$TrustedSigningClientVersion = "",
  [string]$Iscc = $env:ISCC,
  [string]$SignToolExe = $env:SIGNTOOL
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string]$Message) { Write-Host "[build.ps1] $Message" }
function Fail([string]$Message) { throw "[build.ps1] $Message" }

function Find-Iscc {
  if ($Iscc -and (Test-Path $Iscc)) { return (Resolve-Path $Iscc).Path }
  $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
    (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe")
  )
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  Fail "ISCC.exe not found. Install Inno Setup 6.3+ or set -Iscc / `$env:ISCC."
}

function Find-SignTool {
  if ($SignToolExe -and (Test-Path $SignToolExe)) { return (Resolve-Path $SignToolExe).Path }
  $cmd = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $kits = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
  if (Test-Path $kits) {
    $found = Get-ChildItem -Path $kits -Directory |
      Where-Object { $_.Name -match '^10\.' } |
      Sort-Object { [version]$_.Name } -Descending |
      ForEach-Object { Join-Path $_.FullName "x64\signtool.exe" } |
      Where-Object { Test-Path $_ } |
      Select-Object -First 1
    if ($found) { return $found }
  }
  Fail "signtool.exe not found. Install the Windows 10/11 SDK or set -SignToolExe / `$env:SIGNTOOL."
}

function Get-TrustedSigningDlib {
  $toolsDir = Join-Path $PSScriptRoot "..\tools\trusted-signing"
  New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
  $existing = Get-ChildItem -Path $toolsDir -Recurse -Filter "Azure.CodeSigning.Dlib.dll" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\' } | Select-Object -First 1
  if (-not $existing) {
    $nuget = Get-Command nuget.exe -ErrorAction SilentlyContinue
    if (-not $nuget) { Fail "nuget.exe not found; needed to fetch $TrustedSigningClientPackage." }
    $nugetArgs = @("install", $TrustedSigningClientPackage, "-OutputDirectory", $toolsDir, "-NonInteractive")
    if ($TrustedSigningClientVersion) { $nugetArgs += @("-Version", $TrustedSigningClientVersion) }
    Write-Step "nuget $($nugetArgs -join ' ')"
    & $nuget.Source @nugetArgs | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "nuget install failed" }
    $existing = Get-ChildItem -Path $toolsDir -Recurse -Filter "Azure.CodeSigning.Dlib.dll" |
      Where-Object { $_.FullName -match '\\x64\\' } | Select-Object -First 1
  }
  if (-not $existing) { Fail "Azure.CodeSigning.Dlib.dll (x64) not found under $toolsDir" }
  return $existing.FullName
}

function ConvertTo-FileVersion([string]$Semver) {
  $core = ($Semver -replace '^v', '') -replace '[-+].*$', ''
  $parts = @($core.Split('.') | ForEach-Object { [int]$_ })
  while ($parts.Count -lt 4) { $parts += 0 }
  return ($parts[0..3] -join '.')
}

# --- inputs ---------------------------------------------------------------
if (-not (Test-Path $PremiereDir)) { Fail "Premiere folder not found at $PremiereDir; run installers/common/sign-cep.sh first." }
if (-not (Test-Path $ResolveDir)) { Fail "Resolve plugin folder not found at $ResolveDir; build apps/resolve first." }
$PremiereDir = (Resolve-Path $PremiereDir).Path
$ResolveDir = (Resolve-Path $ResolveDir).Path
if (-not (Test-Path (Join-Path $PremiereDir "META-INF\signatures.xml"))) {
  Fail "$PremiereDir has no META-INF\signatures.xml: not a signed CEP folder. Premiere would need PlayerDebugMode to load it."
}
if (-not (Test-Path (Join-Path $ResolveDir "manifest.xml"))) { Fail "$ResolveDir\manifest.xml missing." }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$OutputDir = (Resolve-Path $OutputDir).Path
$fileVersion = ConvertTo-FileVersion $Version

$isccPath = Find-Iscc
$isccArgs = @(
  "/DAppVersion=$Version",
  "/DFileVersion=$fileVersion",
  "/DPremiereDir=$PremiereDir",
  "/DResolveDir=$ResolveDir",
  "/DOutputDir=$OutputDir"
)

# --- signing --------------------------------------------------------------
# Inno substitutes $f with the quoted file to sign and $q with a quote.
# Single-quoted PowerShell strings keep those sequences literal.
if ($SignMode -ne "None") {
  $signtool = Find-SignTool
  $base = '$q' + $signtool + '$q sign /v /fd SHA256 /td SHA256'
  switch ($SignMode) {
    "TrustedSigning" {
      foreach ($p in @(@("Endpoint", $TrustedSigningEndpoint), @("Account", $TrustedSigningAccount), @("Profile", $TrustedSigningProfile))) {
        if (-not $p[1]) { Fail "TrustedSigning needs AZURE_TRUSTED_SIGNING_$($p[0].ToUpper()) (or the matching parameter)." }
      }
      $dlib = Get-TrustedSigningDlib
      $metadata = Join-Path $OutputDir "metadata.json"
      @{
        Endpoint = $TrustedSigningEndpoint
        CodeSigningAccountName = $TrustedSigningAccount
        CertificateProfileName = $TrustedSigningProfile
      } | ConvertTo-Json | Set-Content -Path $metadata -Encoding ascii
      $signCmd = $base + ' /tr http://timestamp.acs.microsoft.com /dlib $q' + $dlib + '$q /dmdf $q' + $metadata + '$q $f'
    }
    "Thumbprint" {
      if (-not $CertThumbprint) { Fail "Thumbprint mode needs -CertThumbprint or WINDOWS_CODESIGN_THUMBPRINT." }
      $signCmd = $base + " /tr $TimestampUrl /sha1 $CertThumbprint " + '$f'
    }
    "Pfx" {
      if (-not $PfxPath -or -not (Test-Path $PfxPath)) { Fail "Pfx mode needs -PfxPath or WINDOWS_CODESIGN_PFX." }
      $signCmd = $base + " /tr $TimestampUrl " + '/f $q' + (Resolve-Path $PfxPath).Path + '$q /p $q' + $PfxPassword + '$q $f'
    }
  }
  $isccArgs += @("/DSignToolName=icgsign", "/Sicgsign=$signCmd")
  Write-Step "signing mode: $SignMode"
} else {
  Write-Step "signing disabled (SmartScreen will warn; local testing only)"
}

# --- compile --------------------------------------------------------------
$iss = Join-Path $PSScriptRoot "icg.iss"
Write-Step "ISCC $iss"
& $isccPath @isccArgs $iss
if ($LASTEXITCODE -ne 0) { Fail "ISCC failed with exit code $LASTEXITCODE" }

$exe = Join-Path $OutputDir "ICG-$Version-win64.exe"
if (-not (Test-Path $exe)) { Fail "expected output missing: $exe" }
if ($SignMode -ne "None") {
  & $signtool verify /pa /v $exe
  if ($LASTEXITCODE -ne 0) { Fail "signtool verify failed on $exe" }
}
Remove-Item -Path (Join-Path $OutputDir "metadata.json") -ErrorAction SilentlyContinue
Write-Step "done: $exe"
