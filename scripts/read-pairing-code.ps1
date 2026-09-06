# Reads the MBP1 pairing code out of Motrix's approval dialog via UI Automation.
# Chromium exposes its accessibility tree on demand: send WM_GETOBJECT
# (OBJID_CLIENT) to the window first, then walk the UIA tree.
param([string]$TargetTitle = 'Motrix')
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinMsg {
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
}
"@
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$WM_GETOBJECT = 0x003D
$OBJID_CLIENT = 0xFFFFFFFC

$root = [System.Windows.Automation.AutomationElement]::RootElement
$all = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
$target = $null
foreach ($w in $all) {
  if ($w.Current.Name -eq $TargetTitle -and $w.Current.ClassName -like 'Chrome_WidgetWin*') { $target = $w; break }
}
if (-not $target) { Write-Output 'MOTRIX_WINDOW_NOT_FOUND'; exit 1 }
$hwnd = [IntPtr]$target.Current.NativeWindowHandle

# 1. Activate Chromium accessibility.
[WinMsg]::SendMessage($hwnd, $WM_GETOBJECT, [IntPtr]0, [IntPtr]$OBJID_CLIENT) | Out-Null
Start-Sleep -Milliseconds 1500

# 2. Walk the tree; look for the XXXX-XXXX pairing-code shape.
$codeRe = '^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$'
$desc = $target.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$found = @()
foreach ($el in $desc) {
  $name = $el.Current.Name
  if (-not $name) { continue }
  if ($name -match $codeRe) { $found += $name }
}
if ($found.Count -gt 0) {
  Write-Output ("CODE=" + ($found | Select-Object -First 1))
} else {
  Write-Output "NO_CODE_FOUND elements=$($desc.Count)"
  # Debug: dump all text-bearing elements to stderr for inspection
  $n = 0
  foreach ($el in $desc) {
    $name = $el.Current.Name
    if ($name -and $name.Trim().Length -gt 0) {
      Write-Output ("  [" + $el.Current.ControlType.ProgrammaticName + "] " + $name)
      $n++
    }
    if ($n -ge 40) { break }
  }
}
