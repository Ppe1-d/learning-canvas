# Uses paths relative to this script so a downloaded copy works on any PC.
$ErrorActionPreference = 'Stop'
$canvasRoot = $PSScriptRoot
$iconPath = Join-Path $canvasRoot 'assets\learning-canvas-desktop.ico'
$launcherPath = Join-Path $canvasRoot 'Open-Canvas.cmd'
if (!(Test-Path -LiteralPath $iconPath) -or !(Test-Path -LiteralPath $launcherPath)) {
    throw 'Keep this script in the extracted Learning Canvas folder.'
}
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath '学习画布.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
if ((Test-Path -LiteralPath $shortcutPath) -and $shortcut.TargetPath -ne $launcherPath -and $shortcut.Arguments -notlike '*Open-Canvas.cmd*') {
    throw 'A different shortcut already uses this name. Rename it before continuing.'
}
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\cmd.exe'
$shortcut.Arguments = '/d /c ""' + $launcherPath + '""' 
$shortcut.WorkingDirectory = $canvasRoot
# Explorer can fail to resolve custom shortcut icons from some Unicode paths.
# Keep the installed icon at a stable per-user location.
$installedIconDir = Join-Path $env:LOCALAPPDATA 'LearningCanvas'
New-Item -ItemType Directory -Path $installedIconDir -Force | Out-Null
$installedIcon = Join-Path $installedIconDir 'learning-canvas.ico'
Copy-Item -LiteralPath $iconPath -Destination $installedIcon -Force
$shortcut.IconLocation = $installedIcon + ',0' 
$shortcut.Description = 'Learning Canvas'
$shortcut.WindowStyle = 7
$shortcut.Save()
# Notify Explorer about this item without clearing all caches or restarting it.
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CanvasDesktopNotify {
    [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
    public static extern void SHChangeNotify(uint change, uint flags, string item1, IntPtr item2);
}
"@
[CanvasDesktopNotify]::SHChangeNotify(0x08000000,0,[string]$null,[IntPtr]::Zero)
[CanvasDesktopNotify]::SHChangeNotify(0x00002000,0x1005,$shortcutPath,[IntPtr]::Zero)
Write-Output ('Created: ' + $shortcutPath)

