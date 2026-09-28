// Real-taskbar check of the setup pin (native 'taskbar'): a minimized window with Barnaby's app id is pinned through
// its jump list, the second call reports "pinned already", then it is unpinned again so the taskbar is left as it was.
// It right-clicks the taskbar, so run it only while the PC is idle. Usage: electron test/live_pin.js -> exit 0 = pass
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { execFileSync } = require('child_process');
const { Native } = require('../src/native');

const AUMID = 'com.hellobarnaby.app';
app.setAppUserModelId(AUMID);

// The test's own cleanup (the product never unpins): invoke "Unpin from taskbar" in the button's jump list.
const UNPIN = `Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type 'using System; using System.Runtime.InteropServices; public static class M { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint d, IntPtr e); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }'
$A = [System.Windows.Automation.AutomationElement]; $T = [System.Windows.Automation.TreeScope]
$tray = $A::RootElement.FindFirst($T::Children, (New-Object System.Windows.Automation.PropertyCondition($A::ClassNameProperty, 'Shell_TrayWnd')))
$b = $tray.FindFirst($T::Descendants, (New-Object System.Windows.Automation.PropertyCondition($A::AutomationIdProperty, 'Appid: ${AUMID}')))
$r = $b.Current.BoundingRectangle
[M]::SetCursorPos([int]($r.X + $r.Width/2), [int]($r.Y + $r.Height/2)) | Out-Null; Start-Sleep -m 30
[M]::mouse_event(8,0,0,0,[IntPtr]::Zero); [M]::mouse_event(16,0,0,0,[IntPtr]::Zero); Start-Sleep -m 1200
$u = $A::FromHandle([M]::GetForegroundWindow()).FindFirst($T::Descendants, (New-Object System.Windows.Automation.PropertyCondition($A::AutomationIdProperty, 'TaskbarUnpin')))
if ($u) { $u.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); 'unpinned' } else { 'no unpin item' }`;

app.whenReady().then(async () => {
  const out = { ok: false };
  const native = new Native(path.join(__dirname, '..', 'native', 'bin', 'helper.exe'));
  native.start();
  const w = new BrowserWindow({ width: 320, height: 200, title: 'Barnaby', show: false });
  await w.loadURL('data:text/html,<title>Barnaby</title>');
  w.minimize(); // a taskbar button, nothing on the screen
  await new Promise((r) => setTimeout(r, 1500));
  try {
    out.find = await native.call('taskbar', { aumid: AUMID, name: 'Barnaby' }, 8000);
    out.pin = await native.call('taskbar', { aumid: AUMID, name: 'Barnaby', pin: true }, 15000);
    await new Promise((r) => setTimeout(r, 1500));
    out.again = await native.call('taskbar', { aumid: AUMID, name: 'Barnaby', pin: true }, 15000);
    out.ok = !!(out.find.found && out.pin.invoked && out.again.pinned && !out.again.invoked);
  } catch (e) { out.error = e.message; }
  try {
    out.cleanup = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', UNPIN], { windowsHide: true, encoding: 'utf8' }).trim();
  } catch (e) { out.cleanup = 'failed: ' + e.message; }
  console.log(JSON.stringify(out));
  native.stop();
  app.exit(out.ok ? 0 : 1);
});
