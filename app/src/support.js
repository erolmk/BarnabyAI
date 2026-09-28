// Tech support: read-only diagnostics + whitelisted fixes. Everything runs through a windowless
// PowerShell (script fed on stdin) or a windowless child process. Check text = short fact lines the
// brain explains; fix text = what was done, in plain words the person can hear.
const { spawn } = require('child_process');
const path = require('path');
const product = require('./product');

const MAX_OUT = 3500;
const SYSROOT = process.env.SystemRoot || 'C:\\Windows';
const POWERSHELL = path.join(SYSROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

// Run a PowerShell script windowless. The script travels base64-encoded on stdin as ONE line, so
// multi-line if/else, try/catch and quotes all behave exactly as in a .ps1 file.
function ps(script, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const b64 = Buffer.from(String(script), 'utf8').toString('base64');
    const boot = "$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.Encoding]::UTF8;" +
      "& ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + b64 + "'))))\n";
    let child;
    try {
      child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) { return reject(e); }
    let out = '', err = '', timedOut = false, settled = false;
    const finish = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        spawn('taskkill.exe', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true, stdio: 'ignore' })
          .on('error', () => child.kill());
      } catch (_) { child.kill(); }
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { if (out.length < 200000) out += d; });
    child.stderr.on('data', (d) => { if (err.length < 20000) err += d; });
    child.on('error', (e) => finish(reject, e));
    child.on('close', (code) => {
      if (timedOut) return finish(reject, new Error('timed out after ' + Math.round(timeoutMs / 1000) + ' s'));
      if (code !== 0) return finish(reject, new Error(err.trim() || 'PowerShell exited with code ' + code));
      let text = out.replace(/\r\n/g, '\n').trim();
      if (text.length > MAX_OUT) text = text.slice(0, MAX_OUT) + '\n(...more lines cut)';
      finish(resolve, text);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(boot);
  });
}

// PowerShell single-quoted literal. PowerShell also treats the curly single quotes as quotes.
const q = (s) => "'" + String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').replace(/['\u2018\u2019\u201a\u201b]/g, '$&$&') + "'";

// ---------- shared PowerShell pieces ----------

// Core Audio (IAudioEndpointVolume) for the default playback device. C# 5 for the built-in compiler.
const AUDIO = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
namespace SH {
  [StructLayout(LayoutKind.Sequential)] public struct PKey { public Guid f; public int p; }
  [StructLayout(LayoutKind.Explicit)] public struct PVar { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; [FieldOffset(16)] public IntPtr pad; }
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IEnumDev { void EnumAudioEndpoints(int flow, int mask, out IDevCol col); void GetDefaultAudioEndpoint(int flow, int role, out IDev dev); }
  [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IDevCol { void GetCount(out int n); void Item(int i, out IDev dev); }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IDev {
    void Activate(ref Guid iid, int ctx, IntPtr prm, [MarshalAs(UnmanagedType.IUnknown)] out object o);
    void OpenPropertyStore(int access, out IProps props);
    void GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  }
  [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IProps { void GetCount(out int n); void GetAt(int i, out PKey k); void GetValue(ref PKey k, out PVar v); }
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IVol {
    void RegisterControlChangeNotify(IntPtr n); void UnregisterControlChangeNotify(IntPtr n); void GetChannelCount(out int n);
    void SetMasterVolumeLevel(float db, ref Guid ctx); void SetMasterVolumeLevelScalar(float v, ref Guid ctx);
    void GetMasterVolumeLevel(out float db); void GetMasterVolumeLevelScalar(out float v);
    void SetChannelVolumeLevel(int ch, float db, ref Guid ctx); void SetChannelVolumeLevelScalar(int ch, float v, ref Guid ctx);
    void GetChannelVolumeLevel(int ch, out float db); void GetChannelVolumeLevelScalar(int ch, out float v);
    void SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid ctx); void GetMute([MarshalAs(UnmanagedType.Bool)] out bool m);
  }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMEnum {}
  public static class Audio {
    static IEnumDev En() { return (IEnumDev)new MMEnum(); }
    static IDev Def() { IDev d; En().GetDefaultAudioEndpoint(0, 1, out d); return d; }
    static IVol Vol(IDev d) { Guid g = typeof(IVol).GUID; object o; d.Activate(ref g, 23, IntPtr.Zero, out o); return (IVol)o; }
    static string Name(IDev d) {
      IProps ps; d.OpenPropertyStore(0, out ps);
      PKey k = new PKey(); k.f = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"); k.p = 14;
      PVar v; ps.GetValue(ref k, out v);
      return v.vt == 31 ? Marshal.PtrToStringUni(v.p) : "(no name)";
    }
    public static string[] State() {
      IDev d = Def(); IVol v = Vol(d); float s; bool m;
      v.GetMasterVolumeLevelScalar(out s); v.GetMute(out m);
      return new string[] { Name(d), ((int)Math.Round(s * 100)).ToString(), m ? "yes" : "no" };
    }
    public static string[] All() {
      IDevCol c; En().EnumAudioEndpoints(0, 1, out c); int n; c.GetCount(out n);
      List<string> r = new List<string>();
      for (int i = 0; i < n; i++) { IDev d; c.Item(i, out d); r.Add(Name(d)); }
      return r.ToArray();
    }
    public static void Unmute(float min) {
      IVol v = Vol(Def()); Guid g = Guid.Empty; float s;
      v.SetMute(false, ref g); v.GetMasterVolumeLevelScalar(out s);
      if (s < min) v.SetMasterVolumeLevelScalar(min, ref g);
    }
  }
}
'@
`;

// Everything that starts with the computer -> $items. Disabled state lives in StartupApproved:
// first byte odd = off. Store apps keep theirs in a State value (2/4 on, 1 off by the person).
const STARTUP_LIST = String.raw`
$ap = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved'
$items = New-Object System.Collections.ArrayList
$wsh = New-Object -ComObject WScript.Shell
function Add-Entry($name, $value, $scope, $kind, $hive, $sub, $cmd) {
  $on = $true
  try { $v = (Get-Item -LiteralPath ($hive + ':\' + $ap + '\' + $sub) -ErrorAction Stop).GetValue($value); if ($v -is [byte[]] -and $v.Length) { $on = -not ($v[0] -band 1) } } catch {}
  $what = ''
  if ($cmd -match '(?i)^\s*"?([^"]*?\.(exe|lnk|cmd|bat|vbs))') {
    $f = [Environment]::ExpandEnvironmentVariables($Matches[1])
    if ($f -like '*.lnk') { try { $t = $wsh.CreateShortcut($f).TargetPath; if ($t) { $f = $t } } catch {} }
    try { $what = [Diagnostics.FileVersionInfo]::GetVersionInfo($f).FileDescription } catch {}
    if (-not $what) { $what = Split-Path $f -Leaf }
  }
  [void]$items.Add([pscustomobject]@{ Name = $name; Value = $value; On = $on; Scope = $scope; Kind = $kind; Sub = $sub; Key = $null; What = ([string]$what).Trim() })
}
foreach ($s in @(@('HKCU', 'Software\Microsoft\Windows\CurrentVersion\Run', 'Run', 'user'),
                 @('HKLM', 'Software\Microsoft\Windows\CurrentVersion\Run', 'Run', 'machine'),
                 @('HKLM', 'Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run', 'Run32', 'machine'))) {
  try { $k = Get-Item -LiteralPath ($s[0] + ':\' + $s[1]) -ErrorAction Stop } catch { continue }
  foreach ($n in $k.GetValueNames()) { if ($n) { Add-Entry $n $n $s[3] 'run' $s[0] $s[2] ([string]$k.GetValue($n)) } }
}
foreach ($s in @(@('Startup', 'HKCU', 'user'), @('CommonStartup', 'HKLM', 'machine'))) {
  $dir = [Environment]::GetFolderPath($s[0])
  if (-not $dir) { continue }
  foreach ($f in @(Get-ChildItem -LiteralPath $dir -File -Force -ErrorAction SilentlyContinue)) {
    if ($f.Name -ieq 'desktop.ini') { continue }
    Add-Entry $f.BaseName $f.Name $s[2] 'folder' $s[1] 'StartupFolder' ('"' + $f.FullName + '"')
  }
}
$sa = 'HKCU:\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData'
foreach ($pkg in @(Get-ChildItem -LiteralPath $sa -ErrorAction SilentlyContinue)) {
  foreach ($t in @(Get-ChildItem -LiteralPath $pkg.PSPath -ErrorAction SilentlyContinue)) {
    $st = $t.GetValue('State')
    if ($st -ne 1 -and $st -ne 2 -and $st -ne 4) { continue }
    $nm = ($pkg.PSChildName -replace '_[^_]*$', '') -replace '^[^.]*\.', ''
    [void]$items.Add([pscustomobject]@{ Name = $nm; Value = $null; On = ($st -ne 1); Scope = 'user'; Kind = 'store'; Sub = $null; Key = $t.PSPath; What = 'app from the Microsoft Store' })
  }
}
`;

// Walk the user's TEMP folder for files older than a day. Never follows junctions/symlinked folders,
// refuses anything that does not look like a real temp folder (a bad TEMP setting must not cost files).
const TEMP_WALK = String.raw`
$root = [IO.Path]::GetTempPath()
$leaf = Split-Path $root.TrimEnd('\') -Leaf
if (($leaf -ne 'Temp' -and $leaf -ne 'Tmp') -or $root.TrimEnd('\').Length -le 3) { @{ status = 'badroot'; root = $root } | ConvertTo-Json -Compress; exit }
$cut = (Get-Date).AddDays(-1)
$stack = New-Object System.Collections.Stack
$stack.Push((New-Object IO.DirectoryInfo $root))
$bytes = [long]0; $files = 0; $skipped = 0
while ($stack.Count) {
  $d = $stack.Pop()
  try { $entries = $d.GetFileSystemInfos() } catch { continue }
  foreach ($e in $entries) {
    if ($e -is [IO.DirectoryInfo]) { if (-not ($e.Attributes -band [IO.FileAttributes]::ReparsePoint)) { $stack.Push($e) } }
    elseif ($e.LastWriteTime -lt $cut) {
      if ($dry) { $bytes += $e.Length; $files++ }
      else { try { $len = $e.Length; $e.Delete(); $bytes += $len; $files++ } catch { $skipped++ } }
    }
  }
}
`;

// ---------- checks (read-only) ----------
const CHECKS = {
  overview: {
    title: 'Computer overview',
    description: 'Processor and how busy it is, memory in use, time since the last restart, free space on the main drive, Windows version, battery.',
    script: String.raw`
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$cpu = @(Get-CimInstance Win32_Processor)
$load = ($cpu | Measure-Object LoadPercentage -Average).Average
if ($load -eq $null) { $load = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -ErrorAction SilentlyContinue).PercentProcessorTime }
'Computer: ' + $cs.Manufacturer + ' ' + $cs.Model
'Processor: ' + $cpu[0].Name.Trim() + ' (' + $cs.NumberOfLogicalProcessors + ' threads), busy right now: ' + [math]::Round([double]$load) + '%'
$tot = $os.TotalVisibleMemorySize * 1KB; $used = $tot - $os.FreePhysicalMemory * 1KB
$ram = (Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue | Measure-Object Capacity -Sum).Sum
if (-not $ram) { $ram = $tot }
'Memory in use: {0:N1} GB of {1:N0} GB ({2}%)' -f ($used / 1GB), ($ram / 1GB), [math]::Round(100 * $used / $tot)
$up = (Get-Date) - $os.LastBootUpTime
$fast = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' -ErrorAction SilentlyContinue).HiberbootEnabled
'Time since the last restart: ' + $up.Days + ' days ' + $up.Hours + ' hours' + $(if ($fast -eq 1) { ' (Fast Startup is on, so only Restart resets this - Shut down does not)' })
$d = Get-CimInstance Win32_LogicalDisk -Filter ("DeviceID='" + $env:SystemDrive + "'")
if ($d.Size) { 'Main drive ({0}): {1:N1} GB free of {2:N0} GB ({3}% free)' -f $env:SystemDrive, ($d.FreeSpace / 1GB), ($d.Size / 1GB), [math]::Round(100 * $d.FreeSpace / $d.Size) }
$cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction SilentlyContinue
'Windows: ' + $os.Caption + ' ' + $cv.DisplayVersion + ' (build ' + $os.BuildNumber + ')'
$b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
if ($b) { 'Power: ' + $(if ($b.BatteryStatus -eq 1) { 'running on battery' } else { 'plugged in' }) + ', battery ' + $b.EstimatedChargeRemaining + '%' }
`,
  },

  top_processes: {
    title: 'Programs using the most memory',
    description: 'The 8 programs using the most memory right now (all their parts added together) with how busy they keep the processor, plus the busiest ones.',
    script: String.raw`
$cores = [Environment]::ProcessorCount
$t0 = @{}
foreach ($p in Get-Process) { $c = $p.TotalProcessorTime; if ($c) { $t0[$p.Id] = $c.TotalMilliseconds } }
$sw = [Diagnostics.Stopwatch]::StartNew()
Start-Sleep -Milliseconds 1000
$procs = @(Get-Process | Where-Object { $_.Id -ne 0 })
$el = $sw.ElapsedMilliseconds * $cores
$rows = foreach ($g in ($procs | Group-Object ProcessName)) {
  $cpu = 0.0
  foreach ($p in $g.Group) { $c = $p.TotalProcessorTime; if ($c -and $t0.ContainsKey($p.Id)) { $cpu += $c.TotalMilliseconds - $t0[$p.Id] } }
  [pscustomobject]@{ Name = $g.Name; Count = $g.Count; MB = ($g.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB; Cpu = 100 * $cpu / $el; Group = $g.Group }
}
$os = Get-CimInstance Win32_OperatingSystem
'Whole computer: processor {0}% busy, {1} programs and background parts running, memory {2:N1} GB in use of {3:N1} GB' -f [math]::Round(($rows | Measure-Object Cpu -Sum).Sum), $procs.Count, (($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1MB), ($os.TotalVisibleMemorySize / 1MB)
function Label($r) {
  $desc = ''
  foreach ($p in $r.Group) { try { if ($p.Description) { $desc = $p.Description; break } } catch {} }
  $r.Name + $(if ($desc -and $desc -ne $r.Name) { ' (' + $desc.Trim() + ')' }) + $(if ($r.Count -gt 1) { ', ' + $r.Count + ' parts' })
}
'Using the most memory:'
foreach ($r in ($rows | Sort-Object MB -Descending | Select-Object -First 8)) { '- {0}: {1:N0} MB, processor {2}%' -f (Label $r), $r.MB, [math]::Round($r.Cpu) }
$busy = @($rows | Where-Object { $_.Cpu -ge 5 } | Sort-Object Cpu -Descending | Select-Object -First 3)
if ($busy.Count) { 'Busiest right now: ' + (($busy | ForEach-Object { (Label $_) + ': ' + [math]::Round($_.Cpu) + '%' }) -join '; ') } else { 'No program is keeping the processor busy right now.' }
`,
  },

  startup_apps: {
    title: 'Programs that start with the computer',
    description: 'Every program set to start when the computer turns on, whether it is on or off, and whether it can be turned off here (for this user) or needs an administrator (for everyone).',
    script: STARTUP_LIST + String.raw`
$on = @($items | Where-Object On).Count
'{0} programs are set to start with the computer: {1} on, {2} off.' -f $items.Count, $on, ($items.Count - $on)
foreach ($i in ($items | Sort-Object @{ Expression = 'On'; Descending = $true }, Name)) {
  '- ' + $i.Name + ': ' + $(if ($i.On) { 'on' } else { 'off' }) + ' - ' + $(if ($i.Scope -eq 'user') { 'this user, can be turned off here' } else { 'everyone, needs an administrator' }) + $(if ($i.What -and $i.What -ne $i.Name) { ' - ' + $i.What })
}
`,
  },

  disk_space: {
    title: 'Storage space',
    description: 'Free space on every drive (LOW when under 10%), the size of the Recycle Bin, and how much old temporary files take (what clear_temp would free).',
    script: String.raw`
foreach ($d in Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3') {
  if (-not $d.Size) { continue }
  $pct = [math]::Round(100 * $d.FreeSpace / $d.Size)
  '{0}{1}: {2:N1} GB free of {3:N0} GB ({4}% free){5}' -f $d.DeviceID, $(if ($d.VolumeName) { ' (' + $d.VolumeName + ')' }), ($d.FreeSpace / 1GB), ($d.Size / 1GB), $pct, $(if ($pct -lt 10) { ' - LOW' })
}
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$rb = (Get-ChildItem -LiteralPath ($env:SystemDrive + '\$Recycle.Bin\' + $sid) -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
'Recycle Bin: {0:N0} MB' -f ($rb / 1MB)
$dry = $true
` + TEMP_WALK + String.raw`
'Old temporary files (older than a day): {0:N0} MB in {1} files' -f ($bytes / 1MB), $files
`,
  },

  network: {
    title: 'Internet connection',
    description: 'Network connections that are on, whether Windows sees the internet, Wi-Fi name and signal strength, whether the home router and the internet answer, and whether website names can be looked up.',
    script: String.raw`
$virt = 'virtual|hyper-v|vpn|tap-|tailscale|wireguard|wintun|bluetooth|miniport|pseudo|vmware|virtualbox|teredo|isatap|kernel debug'
$gw = $null; $gwAny = $null
foreach ($n in [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
  $t = [string]$n.NetworkInterfaceType
  if ($t -eq 'Loopback' -or $t -eq 'Tunnel') { continue }
  $isVirt = ($n.Description + ' ' + $n.Name) -match $virt
  if ([string]$n.OperationalStatus -eq 'Up') {
    $g = @($n.GetIPProperties().GatewayAddresses | ForEach-Object { $_.Address } | Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.ToString() -ne '0.0.0.0' })
    if ($g.Count) { if (-not $isVirt -and -not $gw) { $gw = $g[0].ToString() }; if (-not $gwAny) { $gwAny = $g[0].ToString() } }
    'Connected: ' + $n.Name + ' (' + $n.Description + ')' + $(if ($n.Speed -gt 0) { ', ' + [math]::Round($n.Speed / 1e6) + ' Mbps' }) + $(if ($isVirt) { ' - virtual or VPN connection' })
  } elseif (-not $isVirt -and ($t -eq 'Ethernet' -or $t -eq 'Wireless80211')) {
    'Not connected: ' + $n.Name + ' (' + $n.Description + ')'
  }
}
if (-not $gw) { $gw = $gwAny }
try {
  foreach ($c in @(Get-NetConnectionProfile -ErrorAction Stop)) {
    $s = [string]$c.IPv4Connectivity
    'Windows says network "' + $c.Name + '" (' + $c.InterfaceAlias + ') has: ' + $(switch ($s) { 'Internet' { 'internet' } 'LocalNetwork' { 'local network only, no internet' } 'NoTraffic' { 'no traffic' } default { $s } })
  }
} catch {}
$w = @(netsh.exe wlan show interfaces 2>$null)
$ssid = $null; $sig = $null; $st = $null
foreach ($l in $w) {
  if ($l -match '^\s*SSID\s*:\s*(.*\S)') { $ssid = $Matches[1] }
  elseif ($l -match '^\s*Signal\s*:\s*(\d+)\s*%') { $sig = [int]$Matches[1] }
  elseif ($l -match '^\s*State\s*:\s*(.*\S)') { $st = $Matches[1] }
}
if ($st) { 'Wi-Fi: ' + $st + $(if ($ssid) { ', network "' + $ssid + '"' }) + $(if ($sig -ne $null) { ', signal ' + $sig + '%' + $(if ($sig -lt 40) { ' (weak)' }) }) }
elseif (($w -join ' ') -match 'location') { 'Wi-Fi name and signal: hidden by the Windows location privacy setting' }
function Ping-Host($h) {
  try { $r = (New-Object Net.NetworkInformation.Ping).Send($h, 1500); if ([string]$r.Status -eq 'Success') { 'answered in ' + $r.RoundtripTime + ' ms' } else { 'no answer (' + $r.Status + ')' } } catch { 'no answer' }
}
if ($gw) { 'Home router (' + $gw + '): ' + (Ping-Host $gw) } else { 'Home router: none found - not connected to any network' }
'Internet test (1.1.1.1): ' + (Ping-Host '1.1.1.1')
$sw = [Diagnostics.Stopwatch]::StartNew()
try {
  $task = [Net.Dns]::GetHostAddressesAsync('www.google.com')
  if ($task.Wait(4000)) { 'Looking up www.google.com: works (' + $sw.ElapsedMilliseconds + ' ms)' } else { 'Looking up www.google.com: no reply after 4 seconds' }
} catch { 'Looking up www.google.com: failed - website names cannot be found' }
`,
  },

  sound: {
    title: 'Sound',
    description: 'Which speakers or headphones the sound goes to, the volume, whether it is muted, other connected playback devices, and whether the Windows sound service runs.',
    script: AUDIO + String.raw`
$svc = (Get-Service Audiosrv -ErrorAction SilentlyContinue).Status
if ([string]$svc -ne 'Running') { 'Windows sound service: ' + $svc + ' - no sound can play until it runs' }
try {
  $s = [SH.Audio]::State()
  'Sound goes to: ' + $s[0]
  'Volume: ' + $s[1] + '%' + $(if ([int]$s[1] -lt 15) { ' (very low)' })
  'Muted: ' + $s[2]
  $all = @([SH.Audio]::All() | Where-Object { $_ -ne $s[0] })
  if ($all.Count) { 'Other speakers or headphones connected: ' + ($all -join '; ') } else { 'Other speakers or headphones connected: none' }
} catch { 'No speakers or headphones were found (or Windows cannot reach them).' }
`,
  },

  updates: {
    title: 'Windows updates',
    description: 'When the last Windows update was installed and whether a restart is waiting to finish updates.',
    script: String.raw`
$h = Get-HotFix -ErrorAction SilentlyContinue | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1
if ($h) { 'Last Windows update installed: ' + $h.InstalledOn.ToString('d MMMM yyyy') + ' (' + [math]::Floor(((Get-Date) - $h.InstalledOn).TotalDays) + ' days ago, ' + $h.HotFixID + ')' } else { 'Last Windows update installed: unknown' }
$why = @()
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') { $why += 'Windows Update' }
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') { $why += 'system components' }
if ($why.Count) { 'Restart waiting to finish updates: yes (' + ($why -join ', ') + ')' } else { 'Restart waiting to finish updates: no' }
if ((Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -ErrorAction SilentlyContinue).PendingFileRenameOperations) { 'Some files will be replaced at the next restart (common and minor).' }
$os = Get-CimInstance Win32_OperatingSystem
'Last restart: ' + [math]::Floor(((Get-Date) - $os.LastBootUpTime).TotalDays) + ' days ago'
`,
  },

  defender: {
    title: 'Virus protection',
    description: 'Whether Windows Security virus protection and real-time protection are on, how fresh the virus definitions are, the last quick scan, threats found in the last 30 days, and any other virus program installed.',
    script: String.raw`
try {
  $m = Get-MpComputerStatus -ErrorAction Stop
  'Windows Security virus protection: ' + $(if ($m.AntivirusEnabled) { 'on' } else { 'off' }) + $(if ($m.AMRunningMode -and $m.AMRunningMode -ne 'Normal') { ' (mode: ' + $m.AMRunningMode + ')' })
  'Real-time protection: ' + $(if ($m.RealTimeProtectionEnabled) { 'on' } else { 'off' })
  if ($m.AntivirusSignatureLastUpdated) { 'Virus definitions updated: ' + $m.AntivirusSignatureLastUpdated.ToString('d MMMM yyyy') + ' (' + $m.AntivirusSignatureAge + ' days ago)' }
  if ($m.QuickScanEndTime -and $m.QuickScanAge -lt 100000) { 'Last quick scan: ' + $m.QuickScanEndTime.ToString('d MMMM yyyy HH:mm') + ' (' + $m.QuickScanAge + ' days ago)' } else { 'Last quick scan: never' }
  try {
    $since = (Get-Date).AddDays(-30)
    $t = @(Get-MpThreatDetection -ErrorAction Stop | Where-Object { $_.InitialDetectionTime -gt $since })
    $open = @($t | Where-Object { -not $_.ActionSuccess }).Count
    'Threats found in the last 30 days: ' + $t.Count + $(if ($t.Count -and $open) { ' (' + $open + ' not fully dealt with)' } elseif ($t.Count) { ' (all were blocked or removed)' })
  } catch {}
} catch { 'Windows Security status could not be read (another virus program may be in charge).' }
foreach ($p in @(Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction SilentlyContinue)) {
  $s = [int]$p.productState
  'Virus program installed: ' + $p.displayName + ' - ' + $(if ((($s -shr 12) -band 0xF) -eq 1) { 'active' } else { 'not active' }) + $(if ((($s -shr 4) -band 0xF) -ne 0) { ', out of date' })
}
`,
  },

  printers: {
    title: 'Printers',
    description: 'Printers set up on this computer, which one is the default, their status (offline, error, paused), documents waiting in the queue, and whether the print service runs.',
    script: String.raw`
$sp = (Get-Service Spooler -ErrorAction SilentlyContinue).Status
'Print service: ' + $(if ([string]$sp -eq 'Running') { 'running' } else { [string]$sp + ' - printing cannot work until it runs' })
$w = @{}
foreach ($x in @(Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue)) { $w[$x.Name] = $x }
$list = @(Get-Printer -ErrorAction SilentlyContinue)
if (-not $list.Count) { 'No printers are set up on this computer.' }
foreach ($p in $list) {
  $x = $w[$p.Name]
  '- ' + $p.Name + $(if ($x -and $x.Default) { ' (default)' }) + ': ' + $p.PrinterStatus + $(if ($x -and $x.WorkOffline) { ', set to "Use printer offline"' }) + ', ' + $p.JobCount + ' document(s) waiting' + $(if ($p.Name -match 'PDF|XPS|OneNote|Fax') { ' - saves a file, not a real printer' })
  if ($p.JobCount) { foreach ($j in @(Get-PrintJob -PrinterName $p.Name -ErrorAction SilentlyContinue | Select-Object -First 3)) { '    waiting: "' + $j.DocumentName + '" - ' + $j.JobStatus } }
}
`,
  },
};

// ---------- fixes ----------
const CRITICAL = ['explorer', 'winlogon', 'csrss', 'svchost', 'lsass', 'system', 'dwm', 'smss', 'services', 'wininit',
  'idle', 'registry', 'memory compression', 'secure system', 'lsaiso', 'fontdrvhost', 'sihost', 'ctfmon', 'msmpeng',
  'securityhealthservice', 'audiodg', 'conhost', 'taskhostw'];
const OWN = ['electron', 'helper', path.basename(process.execPath, '.exe').toLowerCase(), String(product.name).toLowerCase()];

const argOf = (arg, key) => (arg && typeof arg === 'object' ? arg[key] || arg.name || arg.value : arg);
const dryOf = (arg) => !!(arg && typeof arg === 'object' && arg.dryRun);
const mb = (bytes) => { const m = bytes / 1048576; return m >= 1024 ? (m / 1024).toFixed(1) + ' GB' : Math.round(m) + ' MB'; };
const json = (s) => JSON.parse(s.split('\n').filter((l) => l.trim().startsWith('{')).pop());

function startDetached(file, args) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(file, args, { windowsHide: true, detached: true, stdio: 'ignore' }); } catch (e) { return resolve({ started: false }); }
    const t = setTimeout(() => { child.unref(); resolve({ started: true }); }, 3000);
    child.on('error', () => { clearTimeout(t); resolve({ started: false }); });
    child.on('exit', (code) => { clearTimeout(t); resolve({ started: code === 0 }); });
  });
}

const FIXES = {
  clear_temp: {
    title: 'Clear old temporary files',
    needsArg: false,
    description: 'Deletes leftover temporary files older than a day from this user\'s temp folder (files in use are skipped). Safe; frees space. Pass {dryRun:true} to only measure.',
    async run(arg) {
      const dry = dryOf(arg);
      const r = json(await ps('$dry = ' + (dry ? '$true' : '$false') + '\n' + TEMP_WALK +
        "@{ status = 'ok'; bytes = $bytes; files = $files; skipped = $skipped } | ConvertTo-Json -Compress", 180000));
      if (r.status === 'badroot') return { ok: false, text: 'The temporary files folder is set up in an unusual place, so I left it alone to be safe.' };
      if (dry) return { ok: true, text: r.files ? `About ${mb(r.bytes)} of old temporary files (${r.files} files) could be cleared.` : 'There are no old temporary files to clear.', bytes: r.bytes, files: r.files };
      if (!r.files) return { ok: true, text: 'There were no old temporary files to clear. That part is already tidy.' };
      return { ok: true, text: `I cleared ${mb(r.bytes)} of old temporary files.` + (r.skipped ? ` ${r.skipped} files were still in use, so I left those alone.` : '') };
    },
  },

  disable_startup_app: {
    title: 'Stop a program from starting with the computer',
    needsArg: true,
    description: 'arg = the program name exactly as listed by the startup_apps check. Turns it off at startup for this user (the program stays installed and can still be opened by hand). Entries for everyone need an administrator and are refused.',
    async run(arg) {
      const want = String(argOf(arg, 'name') || '').trim();
      if (!want) return { ok: false, text: 'Which program should I stop from starting? Please tell me its name.' };
      const r = json(await ps('$want = ' + q(want) + '\n$dry = ' + (dryOf(arg) ? '$true' : '$false') + '\n' + STARTUP_LIST + String.raw`
$hits = @($items | Where-Object { $_.Name -eq $want })
if (-not $hits.Count) { $hits = @($items | Where-Object { $_.Name.IndexOf($want, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or ($_.What -and $_.What.IndexOf($want, [StringComparison]::OrdinalIgnoreCase) -ge 0) }) }
$names = @($hits | ForEach-Object { $_.Name } | Sort-Object -Unique)
if (-not $names.Count) { '{"status":"notfound"}'; exit }
if ($names.Count -gt 1) { @{ status = 'ambiguous'; names = $names } | ConvertTo-Json -Compress; exit }
$mine = @($hits | Where-Object { $_.Scope -eq 'user' -and $_.On })
$admin = @($hits | Where-Object { $_.Scope -eq 'machine' -and $_.On }).Count
if (-not $mine.Count) { @{ status = $(if ($admin) { 'admin' } else { 'already' }); name = $names[0] } | ConvertTo-Json -Compress; exit }
if (-not $dry) {
  foreach ($h in $mine) {
    if ($h.Kind -eq 'store') { Set-ItemProperty -LiteralPath $h.Key -Name State -Value 1 -ErrorAction Stop; continue }
    $k = 'HKCU:\' + $ap + '\' + $h.Sub
    if (-not (Test-Path -LiteralPath $k)) { New-Item -Path $k -Force | Out-Null }
    $b = [byte[]](@(3, 0, 0, 0) + [BitConverter]::GetBytes([DateTime]::Now.ToFileTime()))
    New-ItemProperty -LiteralPath $k -Name $h.Value -PropertyType Binary -Value $b -Force -ErrorAction Stop | Out-Null
  }
}
@{ status = $(if ($dry) { 'would' } else { 'done' }); name = $names[0]; adminLeft = $admin } | ConvertTo-Json -Compress
`, 30000));
      const n = r.name;
      switch (r.status) {
        case 'notfound': return { ok: false, text: `I could not find a program called "${want}" among the ones that start with the computer.` };
        case 'ambiguous': return { ok: false, text: `More than one program matches "${want}": ${r.names.join(', ')}. Which one did you mean?`, names: r.names };
        case 'admin': return { ok: false, text: `${n} is set up for everyone who uses this computer, so turning it off needs an administrator. A family member with the administrator password can do it in Settings, under Apps, then Startup.` };
        case 'already': return { ok: true, text: `${n} is already turned off at startup.` };
        case 'would': return { ok: true, text: `I would turn off ${n} at startup.`, name: n };
        case 'done': return { ok: true, text: `Done. ${n} will no longer start by itself when the computer turns on. It is still installed, and you can open it whenever you like.` +
          (r.adminLeft ? ' One more part of it is set up for everyone, and only an administrator can turn that part off.' : '') };
        default: throw new Error('unexpected result ' + r.status);
      }
    },
  },

  close_app: {
    title: 'Close a program',
    needsArg: true,
    description: 'arg = process name as shown by top_processes (e.g. "chrome"). Closes every window and part of that program right away; anything unsaved in it is lost, so confirm first. Windows system parts and this helper are refused.',
    async run(arg) {
      const name = String(argOf(arg, 'process') || '').trim().replace(/^.*[\\/]/, '').replace(/\.exe$/i, '');
      const key = name.toLowerCase();
      if (!name) return { ok: false, text: 'Which program should I close? Please tell me its name.' };
      if (OWN.includes(key)) return { ok: false, text: `I can't close myself that way. If you'd like me to stop, just say stop.` };
      if (CRITICAL.includes(key)) return { ok: false, text: `${name} is part of Windows itself, and closing it could make the computer stop working properly, so I will leave it alone.` };
      const r = json(await ps('$n = ' + q(name) + '\n$own = ' + process.pid + '\n' + String.raw`
$p = @(Get-Process | Where-Object { $_.ProcessName -eq $n -and $_.Id -ne $PID -and $_.Id -ne $own })
if (-not $p.Count) { '{"status":"notfound"}'; exit }
$what = ''
foreach ($x in $p) { try { if ($x.Description) { $what = $x.Description; break } } catch {} }
$p | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800
$left = @(Get-Process | Where-Object { $_.ProcessName -eq $n }).Count
@{ status = $(if ($left) { 'partial' } else { 'done' }); what = $what } | ConvertTo-Json -Compress
`, 30000));
      const label = (r.what || name).trim();
      if (r.status === 'notfound') return { ok: false, text: `${label} is not open right now, so there was nothing to close.` };
      if (r.status === 'partial') return { ok: false, text: `I closed most of ${label}, but a part of it is still running. Restarting the computer would finish the job.` };
      return { ok: true, text: `I closed ${label}. You can open it again any time.` };
    },
  },

  restart_explorer: {
    title: 'Restart the taskbar and desktop',
    needsArg: false,
    description: 'Restarts Windows Explorer (taskbar, Start button, desktop, folder windows) when they are frozen. Open folder windows close; programs stay open.',
    async run() {
      const out = await ps(String.raw`
Get-Process explorer -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe; Start-Sleep -Seconds 2 }
if (Get-Process explorer -ErrorAction SilentlyContinue) { 'ok' } else { 'fail' }
`, 30000);
      return /ok$/.test(out)
        ? { ok: true, text: 'I restarted the taskbar and desktop. The screen may have blinked for a moment. That is normal.' }
        : { ok: false, text: 'The taskbar did not come back by itself. Restarting the computer will bring it back.' };
    },
  },

  flush_dns: {
    title: 'Refresh internet addresses',
    needsArg: false,
    description: 'Clears the computer\'s remembered list of website addresses (ipconfig /flushdns). Helps when the internet is connected but websites will not open.',
    async run() {
      await ps('ipconfig.exe /flushdns | Out-Null\nexit $LASTEXITCODE', 30000);
      return { ok: true, text: 'I refreshed the computer\'s list of website addresses. Let\'s try the website again.' };
    },
  },

  defender_quick_scan: {
    title: 'Quick virus scan',
    needsArg: false,
    description: 'Starts a Windows Security quick scan in the background (about 5 to 15 minutes). The person can keep using the computer.',
    async run() {
      const exe = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Windows Defender', 'MpCmdRun.exe');
      const r = await startDetached(exe, ['-Scan', '-ScanType', '1']);
      return r.started
        ? { ok: true, text: 'I started a quick virus check. It runs quietly in the background and takes about 5 to 15 minutes. You can keep using the computer while it works.' }
        : { ok: false, text: 'I could not start the virus check just now. Your computer may be using a different virus protection program.' };
    },
  },

  unmute_audio: {
    title: 'Turn the sound back on',
    needsArg: false,
    description: 'Unmutes the default speakers or headphones and raises the volume to at least 50%.',
    async run() {
      if (native) {
        try {
          const b = await native.call('audio_status', {}, 5000);
          const a = await native.call('audio_set', { muted: false, volume: Math.max(50, b.volume) }, 5000);
          if (!b.muted && b.volume >= 50) return { ok: true, text: `The sound was already on, at ${b.volume}%, playing through ${a.device}. If you still hear nothing, check that the speakers are switched on, or that the video itself is not muted.` };
          return { ok: true, text: `I turned the sound on and set the volume to ${a.volume}%. It plays through ${a.device}.` };
        } catch (_) { /* fall back to the PowerShell path */ }
      }
      const r = json(await ps(AUDIO + String.raw`
try { $b = [SH.Audio]::State(); [SH.Audio]::Unmute(0.5); $a = [SH.Audio]::State() } catch { '{"status":"nodevice"}'; exit }
@{ status = 'ok'; name = $a[0]; before = [int]$b[1]; wasMuted = ($b[2] -eq 'yes'); after = [int]$a[1] } | ConvertTo-Json -Compress
`, 30000));
      if (r.status !== 'ok') return { ok: false, text: 'I could not find any speakers or headphones. Please check that they are plugged in and switched on.' };
      if (!r.wasMuted && r.before >= 50) return { ok: true, text: `The sound was already on, at ${r.before}%, playing through ${r.name}. If you still hear nothing, check that the speakers are switched on, or that the video itself is not muted.` };
      return { ok: true, text: `I turned the sound on and set the volume to ${r.after}%. It plays through ${r.name}.` };
    },
  },

  restart_computer: {
    title: 'Restart the computer',
    needsArg: true,
    description: 'Restarts Windows in 2 minutes so the person can save their work. Only runs when arg is exactly "confirmed" (after the person said yes).',
    async run(arg) {
      if (arg !== 'confirmed') return { ok: false, text: 'I will only restart the computer after you say yes.' };
      try {
        await ps('shutdown.exe /r /t 120 /c ' + q('Your computer will restart in 2 minutes. Please save anything you are working on.') + '\nexit $LASTEXITCODE', 30000);
      } catch (e) {
        if (/1190|already/i.test(e.message)) return { ok: true, text: 'A restart is already on its way.' };
        throw e;
      }
      return { ok: true, text: 'Your computer will restart in 2 minutes. Please save anything you are working on. When it comes back on, I will be right here if you need me.' };
    },
  },
};

// ---------- public API ----------
function catalog() {
  return [
    ...Object.entries(CHECKS).map(([name, c]) => ({ name, title: c.title, kind: 'check', needsArg: false, description: c.description })),
    ...Object.entries(FIXES).map(([name, f]) => ({ name, title: f.title, kind: 'fix', needsArg: f.needsArg, description: f.description })),
  ];
}

// Optional native helper (main.js calls setNative): Core Audio in-process instead of compiling C# in PowerShell (~2 s).
let native = null;
function setNative(n) { native = n || null; }

async function nativeSound() {
  const [a, svc] = await Promise.all([
    native.call('audio_status', {}, 5000),
    ps("[string](Get-Service Audiosrv -ErrorAction SilentlyContinue).Status", 10000).catch(() => ''),
  ]);
  const lines = [];
  if (svc && svc.trim() !== 'Running') lines.push('Windows sound service: ' + svc.trim() + ' - no sound can play until it runs');
  lines.push('Sound goes to: ' + a.device);
  lines.push('Volume: ' + a.volume + '%' + (a.volume < 15 ? ' (very low)' : ''));
  lines.push('Muted: ' + (a.muted ? 'yes' : 'no'));
  return lines.join('\n');
}

async function runCheck(name) {
  const c = CHECKS[name];
  const t0 = Date.now();
  let ok = false, text;
  if (!c) text = `There is no check called "${name}".`;
  else {
    try {
      if (name === 'sound' && native) {
        try { text = await nativeSound(); } catch (_) { text = null; } // fall back to the PowerShell path
      }
      if (!text) text = (await ps(c.script, 15000)) || 'Nothing to report.';
      ok = true;
    } catch (e) { text = 'This check could not finish: ' + String(e.message).split('\n')[0]; }
  }
  // summary/details: shape the preload's helper.runCheck() promises to the UI.
  return { name, title: c ? c.title : String(name), ok, text, ms: Date.now() - t0, summary: text.split('\n')[0], details: text };
}

async function applyFix(name, arg) {
  const f = FIXES[name];
  if (!f) return { ok: false, text: `There is no fix called "${name}".` };
  try { return await f.run(arg); } catch (e) {
    return { ok: false, text: 'That did not work this time. Nothing was harmed. (' + String(e.message).split('\n')[0] + ')' };
  }
}

module.exports = { catalog, runCheck, applyFix, ps, setNative, CRITICAL, OWN };
