# 本机打包 APK：自动下载 Android SDK + Gradle，然后 assembleDebug
$ErrorActionPreference = 'Stop'
$Sdk = 'C:\Android\sdk'
$GradleHome = 'C:\Android\gradle'
$GradleVer = '8.7'
New-Item -ItemType Directory -Force -Path $Sdk, $GradleHome | Out-Null

function Dl($url, $out) {
  if (Test-Path $out) {
    $sz = (Get-Item $out).Length
    if ($sz -gt 20MB) { Write-Host "exists: $out ($sz bytes)"; return }
    Write-Host "stale/partial file, re-download: $out ($sz bytes)"
    Remove-Item $out -Force
  }
  Write-Host "download $url"
  & curl.exe -L --fail --retry 3 --retry-delay 2 --connect-timeout 20 --max-time 900 -o $out $url
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $out)) { throw "download failed: $url" }
}

$sdkmanager = Join-Path $Sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sdkmanager)) {
  $cmdZip = Join-Path $env:TEMP 'cmdline-tools.zip'
  Dl 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' $cmdZip
  $tmp = Join-Path $env:TEMP 'cmdline-unzip'
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive $cmdZip -DestinationPath $tmp -Force
  New-Item -ItemType Directory -Force -Path (Join-Path $Sdk 'cmdline-tools') | Out-Null
  Move-Item (Join-Path $tmp 'cmdline-tools') (Join-Path $Sdk 'cmdline-tools\latest') -Force
}

Write-Host 'accept licenses'
$yes = (('y' + [char]10) * 40)
$yes | & $sdkmanager --sdk_root=$Sdk --licenses 2>&1 | Select-Object -Last 5
& $sdkmanager --sdk_root=$Sdk 'platform-tools' 'platforms;android-34' 'build-tools;34.0.0' 2>&1 | Select-Object -Last 10

$gradleExe = Join-Path $GradleHome "gradle-$GradleVer\bin\gradle.bat"
if (-not (Test-Path $gradleExe)) {
  $gz = Join-Path $env:TEMP "gradle-$GradleVer-bin.zip"
  Dl "https://services.gradle.org/distributions/gradle-$GradleVer-bin.zip" $gz
  Expand-Archive $gz -DestinationPath $GradleHome -Force
}

$env:ANDROID_HOME = $Sdk
$env:ANDROID_SDK_ROOT = $Sdk
Write-Host 'assembleDebug start'
Push-Location $PSScriptRoot
try {
  & $gradleExe assembleDebug --no-daemon --console=plain 2>&1 | Select-Object -Last 60
} finally { Pop-Location }

$apk = Join-Path $PSScriptRoot 'app\build\outputs\apk\debug\app-debug.apk'
if (Test-Path $apk) { Write-Host "OK APK: $apk"; (Get-Item $apk).Length } else { Write-Host 'FAILED: no apk' }