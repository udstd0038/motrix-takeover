param([string]$TargetProcess = 'Motrix')
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class WinEnum {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  public static List<IntPtr> Find(uint procId) {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == procId) list.Add(h);
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
"@
$pids = (Get-Process $TargetProcess -ErrorAction SilentlyContinue).Id
$shown = 0
foreach ($p in $pids) {
  foreach ($h in [WinEnum]::Find($p)) {
    $sb = New-Object System.Text.StringBuilder 256
    [WinEnum]::GetWindowText($h, $sb, 256) | Out-Null
    $cb = New-Object System.Text.StringBuilder 256
    [WinEnum]::GetClassName($h, $cb, 256) | Out-Null
    $visible = [WinEnum]::IsWindowVisible($h)
    $title = $sb.ToString()
    Write-Output "hwnd=$h pid=$p visible=$visible class=$($cb.ToString()) title='$title'"
    if (-not $visible -and $title -ne '') {
      [WinEnum]::ShowWindow($h, 9) | Out-Null   # SW_RESTORE
      [WinEnum]::SetForegroundWindow($h) | Out-Null
      $shown++
    }
  }
}
Write-Output "shown=$shown"
