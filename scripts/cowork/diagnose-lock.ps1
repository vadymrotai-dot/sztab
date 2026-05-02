# diagnose-lock.ps1
$ErrorActionPreference = "Continue"
$OutputEncoding = [System.Text.Encoding]::UTF8
$LogPath = "C:\Users\vadym\Projects\sztab\diagnose-lock.log"

function Log { param($msg) Add-Content -Path $LogPath -Value $msg -Encoding UTF8 }

# Очистити старий лог
"" | Set-Content -Path $LogPath -Encoding UTF8

Log "=== DIAGNOSE LOCK CONFLICT ==="
Log "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Log ""

Log "-- TEST 1: Baseline state --"
Log "Files matching *.lock in .git/:"
Get-ChildItem C:\Users\vadym\Projects\sztab\.git\ -Force -Filter "*.lock" -Recurse -ErrorAction SilentlyContinue |
    Select-Object FullName, Length, LastWriteTime | Format-List | Out-String | ForEach-Object { Log $_ }
Log ""
Log "index files in .git/:"
Get-ChildItem C:\Users\vadym\Projects\sztab\.git\index* -Force -ErrorAction SilentlyContinue |
    Select-Object Name, Length, LastWriteTime | Format-List | Out-String | ForEach-Object { Log $_ }
Log ""
Log "git --version:"
git --version 2>&1 | Out-String | ForEach-Object { Log $_ }
Log "PowerShell version: $($PSVersionTable.PSVersion)"
Log ""

Log "-- TEST 2: Antivirus / Controlled Folder Access --"
try {
    $mp = Get-MpComputerStatus -ErrorAction Stop
    Log "AntivirusEnabled: $($mp.AntivirusEnabled)"
    Log "RealTimeProtectionEnabled: $($mp.RealTimeProtectionEnabled)"
    Log "ControlledFolderAccessProtection: $($mp.ControlledFolderAccessProtection)"
} catch {
    Log "Get-MpComputerStatus failed: $($_.Exception.Message)"
}
try {
    $pref = Get-MpPreference -ErrorAction Stop
    Log "EnableControlledFolderAccess: $($pref.EnableControlledFolderAccess)"
    Log "ControlledFolderAccessProtectedFolders:"
    if ($pref.ControlledFolderAccessProtectedFolders) {
        $pref.ControlledFolderAccessProtectedFolders | ForEach-Object { Log "  - $_" }
    } else { Log "  (none)" }
    Log "ControlledFolderAccessAllowedApplications:"
    if ($pref.ControlledFolderAccessAllowedApplications) {
        $pref.ControlledFolderAccessAllowedApplications | ForEach-Object { Log "  - $_" }
    } else { Log "  (none)" }
    Log "ExclusionPath:"
    if ($pref.ExclusionPath) {
        $pref.ExclusionPath | ForEach-Object { Log "  - $_" }
    } else { Log "  (none)" }
} catch {
    Log "Get-MpPreference failed: $($_.Exception.Message)"
}
Log ""

Log "-- TEST 5: Windows view of index.lock --"
$lockPath = "C:\Users\vadym\Projects\sztab\.git\index.lock"
Log "Test-Path '$lockPath': $(Test-Path $lockPath)"
if (Test-Path $lockPath) {
    Get-Item $lockPath -Force |
        Select-Object FullName, Length, LastWriteTime, CreationTime, Mode, Attributes |
        Format-List | Out-String | ForEach-Object { Log $_ }
}
Log ""

Log "-- TEST 6: handle.exe availability --"
$handle = Get-Command handle.exe -ErrorAction SilentlyContinue
$handle64 = Get-Command handle64.exe -ErrorAction SilentlyContinue
if ($handle) { Log "handle.exe FOUND: $($handle.Source)" }
elseif ($handle64) { Log "handle64.exe FOUND: $($handle64.Source)" }
else {
    Log "handle.exe / handle64.exe NOT FOUND"
    Log "Install: download Sysinternals Handle from https://learn.microsoft.com/sysinternals/downloads/handle"
    Log "or: winget install --id Microsoft.Sysinternals.Handle -e"
}
Log ""

Log "-- TEST 7: git config relevant settings --"
Set-Location C:\Users\vadym\Projects\sztab
Log "core.fileMode: $(git config core.fileMode 2>$null)"
Log "core.autocrlf: $(git config core.autocrlf 2>$null)"
Log "core.filemode (alt): $(git config --get core.filemode 2>$null)"
Log "core.protectNTFS: $(git config core.protectNTFS 2>$null)"
Log "core.longpaths: $(git config core.longpaths 2>$null)"
Log ""

Log "-- TEST 8: Recent .git activity --"
Log "Last 10 modified files in .git/:"
Get-ChildItem C:\Users\vadym\Projects\sztab\.git\ -Force -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 10 |
    Select-Object FullName, LastWriteTime |
    Format-Table -AutoSize | Out-String | ForEach-Object { Log $_ }
Log ""

Log "-- TEST 9: Active processes touching sztab --"
$procs = Get-Process | Where-Object {
    $_.Path -like "*sztab*" -or $_.MainWindowTitle -like "*sztab*"
} 2>$null
if ($procs) {
    $procs | Select-Object Id, ProcessName, Path, MainWindowTitle |
        Format-Table -AutoSize | Out-String | ForEach-Object { Log $_ }
} else {
    Log "No processes with 'sztab' in path or title"
}
Log ""

Log "-- DONE --"
Log "Output: $LogPath"
Write-Host "Diagnose complete. Log saved to: $LogPath"
