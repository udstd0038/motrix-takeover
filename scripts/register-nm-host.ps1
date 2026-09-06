# Register the community-fork native-messaging host for Firefox (Windows).
# The manifest points at Motrix's shipped `motrix-native-host.exe`, so no
# separate host binary is needed. Uses a distinct host name so the official
# extension's own registration is left untouched.
#
# Usage:
#   .\scripts\register-nm-host.ps1              # register
#   .\scripts\register-nm-host.ps1 -Unregister  # remove

param(
    [switch]$Unregister,
    [string]$MotrixDir = 'D:\Program Files\Motrix'
)

$ErrorActionPreference = 'Stop'

$HostName       = 'app.motrix.bridge.takeover'
$ExtensionId    = 'motrix-takeover@local.dev'
$HostBinary     = Join-Path $MotrixDir 'resources\bin\motrix-native-host.exe'
$ManifestDir    = Join-Path $env:APPDATA 'Motrix\bridge\manifests'
$ManifestPath   = Join-Path $ManifestDir 'firefox-takeover.json'
$RegistryKey    = "HKCU:\SOFTWARE\Mozilla\NativeMessagingHosts\$HostName"

if ($Unregister) {
    foreach ($view in @('Registry32', 'Registry64')) {
        $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
            [Microsoft.Win32.RegistryHive]::CurrentUser,
            [Microsoft.Win32.RegistryView]::$view)
        try { $base.DeleteSubKeyTree("SOFTWARE\Mozilla\NativeMessagingHosts\$HostName", $false) } finally { $base.Dispose() }
    }
    Remove-Item $ManifestPath -Force -ErrorAction SilentlyContinue
    Write-Host "Unregistered $HostName"
    exit 0
}

if (-not (Test-Path $HostBinary)) {
    throw "Native host binary not found: $HostBinary (is Motrix installed at $MotrixDir?)"
}

$manifest = @{
    name                = $HostName
    description         = 'Motrix browser download bridge (community fork)'
    path                = $HostBinary
    type                = 'stdio'
    allowed_extensions  = @($ExtensionId)
} | ConvertTo-Json

New-Item -ItemType Directory -Force -Path $ManifestDir | Out-Null
Set-Content -Path $ManifestPath -Value $manifest -Encoding UTF8

foreach ($view in @('Registry32', 'Registry64')) {
    New-Item -Path $RegistryKey -Force | Out-Null
    $key = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
        [Microsoft.Win32.RegistryHive]::CurrentUser,
        [Microsoft.Win32.RegistryView]::$view).OpenSubKey(
            "SOFTWARE\Mozilla\NativeMessagingHosts\$HostName", $true)
    try { $key.SetValue('', $ManifestPath, [Microsoft.Win32.RegistryValueKind]::String) } finally { $key.Dispose() }
}

Write-Host "Registered $HostName -> $ManifestPath"
Write-Host "Manifest: $manifest"
