# Single-instance focus as a user sees it: minimise the running window, launch the exe again through Explorer
# (as a double-click does), then check the window is restored and in the foreground.
param([string]$AppDir, [string]$DataDir)
Add-Type -Name W -Namespace U -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int c);
[DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h);
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
'@
$exe = Join-Path $AppDir 'sensto-spike.exe'
$env:SENSTO_DATA_DIR = $DataDir
$first = Start-Process $exe -PassThru
Start-Sleep 4
$first.Refresh(); $h = $first.MainWindowHandle
[void][U.W]::ShowWindow($h, 6)   # SW_MINIMIZE
Start-Sleep 1
"minimised before: $([U.W]::IsIconic($h))"
Start-Process explorer.exe -ArgumentList "`"$exe`""
Start-Sleep 2
"minimised after: $([U.W]::IsIconic($h)); foreground is first window: $([U.W]::GetForegroundWindow() -eq $h)"
"shells: $((Get-Process sensto-spike -ErrorAction SilentlyContinue).Count); sidecars: $((Get-Process sensto-sidecar -ErrorAction SilentlyContinue).Count)"
Stop-Process -Id $first.Id   # hard stop is fine here; sidecar exits on stdin EOF
Start-Sleep 1
"sidecars after stop: $((Get-Process sensto-sidecar -ErrorAction SilentlyContinue).Count)"
