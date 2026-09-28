// Native helper: screen, UI Automation, input, speech. JSON lines over stdin/stdout.
// Protocol: SPEC.md "Native helper protocol". C# 5 only (built by build.ps1 with the .NET Framework csc).
// Request {"id":1,"cmd":"...","args":{...}} -> {"id":1,"ok":true,"result":{...}} | {"id":1,"ok":false,"error":"msg"}
// All coordinates are physical pixels of the virtual screen (process is per-monitor DPI aware).
// Docking commands (not in the SPEC table yet):
//   appbar {action:"dock", hwnd, edge:"right", size} -> {rect:[x,y,w,h], bar, work}   (idempotent: dock again = re-place)
//   appbar {action:"undock", hwnd?} -> {removed}                                     (no hwnd = every dock)
//   window_set {hwnd, action:"maximize"|"restore"|"minimize"|"move", rect?} -> {ok, rect, maximized, minimized}
//   is_elevated -> {elevated, adminGroup, elevationType}    work_area {hwnd?} -> {rect, monitor}    idle -> {idleMs, locked}
// Extra modes: helper.exe --appbar-guard <pid> <barHwnd> (started by dock), helper.exe --test-window (appbar_selftest.js).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Speech.Recognition;
using System.Speech.Synthesis;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;
using Args = System.Collections.Generic.Dictionary<string, object>;
using WF = System.Windows.Forms;

static class N
{
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
    [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public POINT pt; }
    [StructLayout(LayoutKind.Sequential)] public struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData; public uint flags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] public struct KBDLLHOOKSTRUCT { public uint vkCode; public uint scanCode; public uint flags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION u; }

    public delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    public delegate bool MonitorEnumProc(IntPtr hMon, IntPtr hdc, IntPtr lprc, IntPtr data);

    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("shcore.dll")] public static extern int SetProcessDpiAwareness(int value);
    [DllImport("shcore.dll")] public static extern int GetDpiForMonitor(IntPtr hmon, int type, out uint dpiX, out uint dpiY);
    [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonitorEnumProc proc, IntPtr data);
    [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr hmon, ref MONITORINFO mi);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc proc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int index);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint type);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern short VkKeyScan(char c);
    [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr SetWindowsHookEx(int id, LowLevelMouseProc proc, IntPtr hMod, uint threadId);
    [DllImport("user32.dll")] public static extern bool UnhookWindowsHookEx(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr CallNextHookEx(IntPtr h, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetMessage(out MSG m, IntPtr h, uint min, uint max);
    [DllImport("user32.dll")] public static extern bool PeekMessage(out MSG m, IntPtr h, uint min, uint max, uint remove);
    [DllImport("user32.dll")] public static extern bool TranslateMessage(ref MSG m);
    [DllImport("user32.dll")] public static extern IntPtr DispatchMessage(ref MSG m);
    [DllImport("user32.dll")] public static extern bool PostThreadMessage(uint thread, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern UIntPtr SetTimer(IntPtr h, UIntPtr id, uint ms, IntPtr fn);
    [DllImport("user32.dll")] public static extern bool KillTimer(IntPtr h, UIntPtr id);
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromPoint(POINT p, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
    [DllImport("user32.dll")] public static extern uint GetDoubleClickTime();
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr GetModuleHandle(string name);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int v, int size);
    [StructLayout(LayoutKind.Sequential)] public struct PBI { public IntPtr ExitStatus, Peb, Affinity, BasePriority, Pid, ParentPid; }
    [DllImport("ntdll.dll")] public static extern int NtQueryInformationProcess(IntPtr h, int cls, ref PBI pbi, int size, out int ret);
    [DllImport("ole32.dll")] public static extern int PropVariantClear(ref PVar v);

    // Docking (AppBar), window placement, elevation, idle.
    [StructLayout(LayoutKind.Sequential)] public struct APPBARDATA { public int cbSize; public IntPtr hWnd; public uint uCallbackMessage; public uint uEdge; public RECT rc; public IntPtr lParam; }
    [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
    [DllImport("shell32.dll")] public static extern UIntPtr SHAppBarMessage(uint msg, ref APPBARDATA d);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern uint RegisterWindowMessage(string name);
    [DllImport("user32.dll")] public static extern bool ChangeWindowMessageFilterEx(IntPtr h, uint msg, uint action, IntPtr info);
    [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint action, uint param, ref RECT r, uint flags);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool repaint);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO i);
    [DllImport("advapi32.dll", SetLastError = true)] public static extern bool GetTokenInformation(IntPtr tok, int cls, out int info, int len, out int ret);

    // Core Audio (default playback device). Same interop as support.js, methods in vtable order.
    [StructLayout(LayoutKind.Sequential)] public struct PKey { public Guid f; public int p; }
    [StructLayout(LayoutKind.Explicit)] public struct PVar { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; [FieldOffset(16)] public IntPtr pad; }
    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IEnumDev { void EnumAudioEndpoints(int flow, int mask, out IntPtr col); void GetDefaultAudioEndpoint(int flow, int role, out IDev dev); }
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IDev
    {
        void Activate(ref Guid iid, int ctx, IntPtr prm, [MarshalAs(UnmanagedType.IUnknown)] out object o);
        void OpenPropertyStore(int access, out IProps props);
    }
    [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IProps { void GetCount(out int n); void GetAt(int i, out PKey k); void GetValue(ref PKey k, out PVar v); }
    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IVol
    {
        void RegisterControlChangeNotify(IntPtr n); void UnregisterControlChangeNotify(IntPtr n); void GetChannelCount(out int n);
        void SetMasterVolumeLevel(float db, ref Guid ctx); void SetMasterVolumeLevelScalar(float v, ref Guid ctx);
        void GetMasterVolumeLevel(out float db); void GetMasterVolumeLevelScalar(out float v);
        void SetChannelVolumeLevel(int ch, float db, ref Guid ctx); void SetChannelVolumeLevelScalar(int ch, float v, ref Guid ctx);
        void GetChannelVolumeLevel(int ch, out float db); void GetChannelVolumeLevelScalar(int ch, out float v);
        void SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid ctx); void GetMute([MarshalAs(UnmanagedType.Bool)] out bool m);
    }
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class MMEnum { }
}

class ElemInfo
{
    public AutomationElement El;
    public string Name, Role, Value;
    public int X, Y, W, H;
    public bool Enabled, Focused, Password, Secret, Interactive;
}

static class Helper
{
    const string Version = "1";
    static readonly object OutLock = new object();
    static StreamWriter Out;

    [MTAThread]
    static int Main(string[] argv)
    {
        InitDpi();
        if (argv.Length >= 3 && argv[0] == "--appbar-guard") return GuardMain(argv);
        if (argv.Length >= 1 && argv[0] == "--test-window") return TestWindowMain();
        AppDomain.CurrentDomain.UnhandledException += delegate { RemoveAllBars(); }; // a crash must not keep the screen shrunk
        Out = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
        Out.AutoFlush = true;
        Out.NewLine = "\n";
        StreamReader input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
        string line;
        while ((line = input.ReadLine()) != null)
        {
            if (line.Trim().Length == 0) continue;
            string captured = line;
            Thread t = new Thread(delegate() { Handle(captured); });
            t.IsBackground = true;
            t.Start();
        }
        // stdin closed = parent gone: give the docked space back, then exit even if listen / wait_click / UIA threads still run.
        RemoveAllBars();
        Thread killer = new Thread(delegate() { Thread.Sleep(1000); Process.GetCurrentProcess().Kill(); });
        killer.IsBackground = true;
        killer.Start();
        Environment.Exit(0);
        return 0;
    }

    static void InitDpi()
    {
        try { if (N.SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch (Exception) { }
        try { if (N.SetProcessDpiAwareness(2) == 0) return; } catch (Exception) { }
        try { N.SetProcessDPIAware(); } catch (Exception) { }
    }

    static JavaScriptSerializer NewSer()
    {
        JavaScriptSerializer s = new JavaScriptSerializer();
        s.MaxJsonLength = int.MaxValue;
        s.RecursionLimit = 64;
        return s;
    }

    static void Handle(string line)
    {
        object id = null;
        try
        {
            Args req = NewSer().DeserializeObject(line) as Args;
            if (req == null) throw new Exception("request must be a JSON object");
            req.TryGetValue("id", out id);
            string cmd = Str(req, "cmd", "");
            object a;
            req.TryGetValue("args", out a);
            Args args = a as Args;
            if (args == null) args = new Args();
            object result = Dispatch(cmd, args);
            Send(id, true, result ?? new Args(), null);
        }
        catch (Exception ex)
        {
            Exception e = ex;
            while (e is System.Reflection.TargetInvocationException && e.InnerException != null) e = e.InnerException;
            Send(id, false, null, e.Message);
        }
    }

    static void Send(object id, bool ok, object result, string error)
    {
        Args resp = new Args();
        resp["id"] = id;
        resp["ok"] = ok;
        if (ok) resp["result"] = result; else resp["error"] = error ?? "error";
        string json = NewSer().Serialize(resp);
        lock (OutLock)
        {
            try { Out.WriteLine(json); Out.Flush(); } catch (Exception) { }
        }
    }

    static object Dispatch(string cmd, Args a)
    {
        switch (cmd)
        {
            case "ping": { Args r = new Args(); r["pong"] = true; r["version"] = Version; return r; }
            case "screen_info": return ScreenInfo();
            case "screenshot": return Screenshot(a);
            case "elements": return Elements(a);
            case "click": return Click(a);
            case "click_element": return ClickElement(a);
            case "type": return TypeText(a);
            case "key": return Key(a);
            case "scroll": return Scroll(a);
            case "move": N.SetCursorPos(Int(a, "x", 0), Int(a, "y", 0)); return new Args();
            case "cursor": { N.POINT p; N.GetCursorPos(out p); Args r = new Args(); r["x"] = p.X; r["y"] = p.Y; return r; }
            case "open": return Open(a);
            case "windows": return Windows();
            case "foreground":
                {
                    Args r = WindowInfo(N.GetForegroundWindow(), null);
                    // Lock screen / secure desktop: never send input then.
                    r["locked"] = (long)r["hwnd"] == 0 || string.Equals((string)r["process"], "LockApp", StringComparison.OrdinalIgnoreCase);
                    return r;
                }
            case "focus": return Focus(a);
            case "window_text": return WindowText(a);
            case "window_at": return WindowAt(a);
            case "wait_click": return WaitClick(a);
            case "cancel_wait": return CancelWait();
            case "wait_typing": return WaitTyping(a);
            case "focus_value": return FocusValue();
            case "listen": return Listen(a);
            case "speak": return Speak(a);
            case "stop_speaking": return StopSpeaking();
            case "redact_map": return RedactMap(a);
            case "audio_status": return AudioStatus();
            case "audio_set": return AudioSet(a);
            case "window_monitor": return WindowMonitor(a);
            case "wake_wait": return WakeWait(a);
            case "wake_cancel": return WakeCancel();
            case "appbar": return AppBar(a);
            case "window_set": return WindowSet(a);
            case "is_elevated": return IsElevated();
            case "work_area": return WorkArea(a);
            case "idle": return Idle();
            case "taskbar": return Taskbar(a);
            default: throw new Exception("unknown cmd: " + cmd);
        }
    }

    // ---------- args ----------
    static bool Has(Args a, string k) { object v; return a != null && a.TryGetValue(k, out v) && v != null; }
    static double Num(Args a, string k, double def)
    {
        object v;
        if (a == null || !a.TryGetValue(k, out v) || v == null) return def;
        try { return Convert.ToDouble(v, CultureInfo.InvariantCulture); } catch (Exception) { return def; }
    }
    static int Int(Args a, string k, int def) { return (int)Math.Round(Num(a, k, def)); }
    static long Long(Args a, string k, long def) { return (long)Math.Round(Num(a, k, def)); }
    static bool Bool(Args a, string k, bool def) { object v; if (a == null || !a.TryGetValue(k, out v) || !(v is bool)) return def; return (bool)v; }
    static string Str(Args a, string k, string def) { object v; if (a == null || !a.TryGetValue(k, out v) || v == null) return def; return Convert.ToString(v, CultureInfo.InvariantCulture); }
    static object[] Arr(object v)
    {
        object[] arr = v as object[];
        if (arr == null) { System.Collections.ArrayList al = v as System.Collections.ArrayList; if (al != null) arr = al.ToArray(); }
        return arr;
    }
    static int[] ToRect(object v)
    {
        object[] arr = Arr(v);
        if (arr == null || arr.Length < 4) return null;
        int[] r = new int[4];
        for (int i = 0; i < 4; i++) r[i] = (int)Math.Round(Convert.ToDouble(arr[i], CultureInfo.InvariantCulture));
        return r;
    }
    static int[] RectArg(Args a, string k) { object v; return a != null && a.TryGetValue(k, out v) ? ToRect(v) : null; }

    // ---------- screen ----------
    static double MonitorScale(IntPtr hmon)
    {
        try { uint dx, dy; if (N.GetDpiForMonitor(hmon, 0, out dx, out dy) == 0 && dx > 0) return dx / 96.0; } catch (Exception) { }
        return 1.0;
    }

    static List<Args> Monitors()
    {
        List<Args> list = new List<Args>();
        N.MonitorEnumProc proc = delegate(IntPtr hMon, IntPtr hdc, IntPtr lprc, IntPtr data)
        {
            N.MONITORINFO mi = new N.MONITORINFO();
            mi.cbSize = Marshal.SizeOf(typeof(N.MONITORINFO));
            if (N.GetMonitorInfo(hMon, ref mi))
            {
                Args m = new Args();
                m["x"] = mi.rcMonitor.Left; m["y"] = mi.rcMonitor.Top;
                m["width"] = mi.rcMonitor.Right - mi.rcMonitor.Left; m["height"] = mi.rcMonitor.Bottom - mi.rcMonitor.Top;
                m["primary"] = (mi.dwFlags & 1) != 0;
                m["scale"] = MonitorScale(hMon);
                m["work"] = new int[] { mi.rcWork.Left, mi.rcWork.Top, mi.rcWork.Right - mi.rcWork.Left, mi.rcWork.Bottom - mi.rcWork.Top };
                list.Add(m);
            }
            return true;
        };
        N.EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, proc, IntPtr.Zero);
        GC.KeepAlive(proc);
        return list;
    }

    static Args PrimaryMonitor()
    {
        List<Args> ms = Monitors();
        foreach (Args m in ms) if ((bool)m["primary"]) return m;
        if (ms.Count > 0) return ms[0];
        throw new Exception("no monitor");
    }

    static Args MonitorOf(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero || !N.IsWindow(hwnd)) return PrimaryMonitor();
        IntPtr hm = N.MonitorFromWindow(hwnd, 2); // MONITOR_DEFAULTTONEAREST
        N.MONITORINFO mi = new N.MONITORINFO();
        mi.cbSize = Marshal.SizeOf(typeof(N.MONITORINFO));
        if (hm == IntPtr.Zero || !N.GetMonitorInfo(hm, ref mi)) return PrimaryMonitor();
        Args m = new Args();
        m["x"] = mi.rcMonitor.Left; m["y"] = mi.rcMonitor.Top;
        m["width"] = mi.rcMonitor.Right - mi.rcMonitor.Left; m["height"] = mi.rcMonitor.Bottom - mi.rcMonitor.Top;
        m["primary"] = (mi.dwFlags & 1) != 0;
        m["scale"] = MonitorScale(hm);
        m["work"] = new int[] { mi.rcWork.Left, mi.rcWork.Top, mi.rcWork.Right - mi.rcWork.Left, mi.rcWork.Bottom - mi.rcWork.Top };
        return m;
    }

    // {hwnd} -> the monitor that window is on, so the agent can say "that window is on your other screen".
    static object WindowMonitor(Args a)
    {
        IntPtr h = Has(a, "hwnd") ? new IntPtr(Convert.ToInt64(a["hwnd"])) : N.GetForegroundWindow();
        Args m = MonitorOf(h);
        m["count"] = Monitors().Count;
        return m;
    }

    static object ScreenInfo()
    {
        List<Args> ms = Monitors();
        Args p = null;
        foreach (Args m in ms) if ((bool)m["primary"]) p = m;
        if (p == null && ms.Count > 0) p = ms[0];
        if (p == null) throw new Exception("no monitor");
        int vl = int.MaxValue, vt = int.MaxValue, vr = int.MinValue, vb = int.MinValue;
        foreach (Args m in ms)
        {
            int x = (int)m["x"], y = (int)m["y"], w = (int)m["width"], h = (int)m["height"];
            vl = Math.Min(vl, x); vt = Math.Min(vt, y); vr = Math.Max(vr, x + w); vb = Math.Max(vb, y + h);
        }
        Args r = new Args();
        r["width"] = p["width"]; r["height"] = p["height"]; r["scale"] = p["scale"];
        r["monitors"] = ms;
        r["virtual"] = new int[] { vl, vt, vr - vl, vb - vt };
        return r;
    }

    static object Screenshot(Args a)
    {
        int x, y, w, h;
        if (Has(a, "width") && Has(a, "height"))
        {
            x = Int(a, "x", 0); y = Int(a, "y", 0); w = Int(a, "width", 0); h = Int(a, "height", 0);
        }
        else
        {
            // hwnd given: capture the monitor that holds that window (second screens), else the primary one.
            Args p = Has(a, "hwnd") ? MonitorOf(new IntPtr(Convert.ToInt64(a["hwnd"]))) : PrimaryMonitor();
            x = (int)p["x"]; y = (int)p["y"]; w = (int)p["width"]; h = (int)p["height"];
        }
        if (w <= 0 || h <= 0) throw new Exception("empty region");
        int tw, th;
        Fit(w, h, Int(a, "maxWidth", 1280), out tw, out th);
        bool jpeg = Str(a, "format", "png").ToLowerInvariant() == "jpeg" || Str(a, "format", "png").ToLowerInvariant() == "jpg";

        // Website promise: passwords and card numbers are blacked out before a picture leaves the computer.
        Stopwatch rsw = Stopwatch.StartNew();
        bool incomplete = false;
        List<int[]> src = new List<int[]>(), dst = new List<int[]>();
        if (Bool(a, "redact", true))
        {
            IntPtr rw = RedactWindow(a);
            List<int[]> secrets = SecretRects(rw, Math.Max(50, Int(a, "redactBudgetMs", 400)), out incomplete);
            MapRedactions(secrets, rw != IntPtr.Zero && N.IsWindow(rw) ? WinRect(rw) : null, x, y, w, h, tw, th, src, dst);
        }
        long redactMs = rsw.ElapsedMilliseconds;

        using (Bitmap full = new Bitmap(w, h, PixelFormat.Format24bppRgb))
        {
            using (Graphics g = Graphics.FromImage(full))
            {
                try { g.CopyFromScreen(x, y, 0, 0, new Size(w, h), CopyPixelOperation.SourceCopy); }
                catch (System.ComponentModel.Win32Exception) { throw new Exception("screen not available (locked, asleep, or a secure desktop is showing)"); }
                foreach (int[] s in src) g.FillRectangle(Brushes.Black, s[0], s[1], s[2], s[3]); // before scaling: no secret pixel reaches the resampler
            }
            Bitmap img = full;
            if (tw != w || th != h)
            {
                img = new Bitmap(tw, th, PixelFormat.Format24bppRgb);
                using (Graphics g = Graphics.FromImage(img))
                using (ImageAttributes ia = new ImageAttributes())
                {
                    g.CompositingMode = CompositingMode.SourceCopy;
                    g.CompositingQuality = CompositingQuality.HighQuality;
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    g.SmoothingMode = SmoothingMode.HighQuality;
                    ia.SetWrapMode(WrapMode.TileFlipXY);
                    g.DrawImage(full, new Rectangle(0, 0, tw, th), 0, 0, w, h, GraphicsUnit.Pixel, ia);
                    foreach (int[] d in dst) g.FillRectangle(Brushes.Black, d[0], d[1], d[2], d[3]); // solid edges after resampling
                }
            }
            try
            {
                string b64;
                using (MemoryStream ms = new MemoryStream())
                {
                    if (jpeg)
                    {
                        ImageCodecInfo codec = null;
                        foreach (ImageCodecInfo c in ImageCodecInfo.GetImageEncoders()) if (c.MimeType == "image/jpeg") codec = c;
                        EncoderParameters ep = new EncoderParameters(1);
                        ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)Math.Max(1, Math.Min(100, Int(a, "quality", 80))));
                        img.Save(ms, codec, ep);
                    }
                    else img.Save(ms, ImageFormat.Png);
                    b64 = Convert.ToBase64String(ms.ToArray());
                }
                Args r = new Args();
                r[jpeg ? "jpeg" : "png"] = b64;
                r["mime"] = jpeg ? "image/jpeg" : "image/png";
                r["width"] = tw; r["height"] = th;
                r["factor"] = (double)w / tw;
                r["originX"] = x; r["originY"] = y;
                r["redacted"] = dst.Count;
                r["redactedRects"] = dst; // image px, solid black
                r["redactMs"] = redactMs;
                if (incomplete) r["redactIncomplete"] = true; // scan timed out / failed: only the last `elements` list was used
                return r;
            }
            finally { if (!ReferenceEquals(img, full)) img.Dispose(); }
        }
    }

    static void Fit(int w, int h, int maxW, out int tw, out int th)
    {
        tw = w; th = h;
        if (maxW > 0 && w > maxW) { tw = maxW; th = Math.Max(1, (int)Math.Round(h * (double)maxW / w)); }
    }

    // ---------- screenshot redaction ----------
    static readonly int ParentPid = GetParentPid(); // the Electron main process owns all of our own windows

    static int GetParentPid()
    {
        try { N.PBI p = new N.PBI(); int n; if (N.NtQueryInformationProcess(new IntPtr(-1), 0, ref p, Marshal.SizeOf(p), out n) == 0) return p.ParentPid.ToInt32(); }
        catch (Exception) { }
        return -1;
    }

    static int PidOf(IntPtr h) { uint pid; N.GetWindowThreadProcessId(h, out pid); return (int)pid; }

    // Whose secrets to hide: hwnd arg, else the foreground window, else (our widget/launcher is in front, and
    // main.js keeps those out of captures) the topmost app window that is not ours.
    static IntPtr RedactWindow(Args a)
    {
        if (Has(a, "hwnd")) return new IntPtr(Long(a, "hwnd", 0));
        IntPtr fg = N.GetForegroundWindow();
        if (fg != IntPtr.Zero && PidOf(fg) != ParentPid) return fg;
        IntPtr pick = IntPtr.Zero;
        N.EnumWindowsProc proc = delegate(IntPtr h, IntPtr l)
        {
            if (!IsAppWindow(h) || N.IsIconic(h) || PidOf(h) == ParentPid) return true;
            pick = h;
            return false;
        };
        N.EnumWindows(proc, IntPtr.Zero);
        GC.KeepAlive(proc);
        return pick;
    }

    static bool SecretRole(ControlType ct) { return ct == ControlType.Edit || ct == ControlType.ComboBox || ct == ControlType.Spinner; }

    // Label / automation id / value says card number, CVV, SSN, PIN, bank number, one-time code or password.
    // Squashed tokens catch "cardNumber", "cc-num", "newpassword"; short ones need word edges ("Business name" is not "ssn").
    static readonly Regex SecretSquashed = new Regex("password|passcode|passphrase|creditcard|debitcard|cardnum|cardno|ccnum|securitycode|cardcode|cardverif|cvv|cvc|socialsecurity|socialinsurance|taxpayer|medicare|accountnum|accountno|acctnum|acctno|routingnum|routingno|onetimecode|onetimepass|onetimepin|verificationcode|authcode|authenticationcode|accesscode|pincode|pinnumber|securityanswer|secretanswer|maidenname|sortcode", RegexOptions.CultureInvariant);
    static readonly Regex SecretWord = new Regex(@"\b(ssn|sin|itin|pin|pwd|csc|otp|totp|mbi|aba|iban|routing|2fa|mfa)\b", RegexOptions.CultureInvariant);
    static readonly Regex Ssn = new Regex(@"^(?!000|666|9\d{2})\d{3}([- ]?)(?!00)\d{2}\1(?!0000)\d{4}$", RegexOptions.CultureInvariant);

    static bool IsSecretField(string name, string id, string value)
    {
        foreach (string s in new string[] { name, id })
        {
            if (string.IsNullOrEmpty(s)) continue;
            string words = Regex.Replace(Regex.Replace(s, "([a-z])([A-Z])", "$1 $2"), "[^A-Za-z0-9]+", " ").ToLowerInvariant();
            if (SecretWord.IsMatch(words) || SecretSquashed.IsMatch(words.Replace(" ", ""))) return true;
        }
        if (string.IsNullOrEmpty(value)) return false;
        string v = value.Trim();
        if (Ssn.IsMatch(v)) return true;
        string digits = Regex.Replace(v, "[ .-]", "");
        if (digits.Length < 13 || digits.Length > 19 || !Regex.IsMatch(digits, "^[0-9]+$")) return false;
        int sum = 0; // Luhn: a typed card number
        for (int i = 0; i < digits.Length; i++)
        {
            int d = digits[digits.Length - 1 - i] - '0';
            if (i % 2 == 1) { d *= 2; if (d > 9) d -= 9; }
            sum += d;
        }
        return sum % 10 == 0;
    }

    // Physical rects of password fields and secret-looking edit fields in the window. Small budget: on timeout or
    // error fall back to the last `elements` list of the same window (may be a little stale) and report incomplete.
    static List<int[]> SecretRects(IntPtr hwnd, int budgetMs, out bool incomplete)
    {
        List<int[]> rects = new List<int[]>();
        incomplete = false;
        if (hwnd == IntPtr.Zero || !N.IsWindow(hwnd)) return rects;
        Condition cond = new OrCondition(
            new PropertyCondition(AutomationElement.IsPasswordProperty, true),
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit),
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.ComboBox),
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Spinner));
        AutomationProperty[] props = {
            AutomationElement.NameProperty, AutomationElement.AutomationIdProperty, AutomationElement.ControlTypeProperty,
            AutomationElement.BoundingRectangleProperty, AutomationElement.IsPasswordProperty, ValuePattern.ValueProperty };
        AutomationElementCollection found = null;
        try { found = FindAll(hwnd, cond, props, budgetMs, out incomplete); }
        catch (Exception) { incomplete = true; }
        if (found != null)
        {
            foreach (AutomationElement e in found)
            {
                object pw = Cached(e, AutomationElement.IsPasswordProperty);
                if (!(pw is bool && (bool)pw) && !IsSecretField(Cached(e, AutomationElement.NameProperty) as string,
                        Cached(e, AutomationElement.AutomationIdProperty) as string, Cached(e, ValuePattern.ValueProperty) as string)) continue;
                object rv = Cached(e, AutomationElement.BoundingRectangleProperty);
                if (!(rv is System.Windows.Rect)) continue;
                System.Windows.Rect r = (System.Windows.Rect)rv;
                if (r.IsEmpty || double.IsInfinity(r.Width) || double.IsNaN(r.Width) || double.IsInfinity(r.Height) || double.IsNaN(r.Height)) continue;
                int l = (int)Math.Floor(r.Left), t = (int)Math.Floor(r.Top);
                rects.Add(new int[] { l, t, (int)Math.Ceiling(r.Right) - l, (int)Math.Ceiling(r.Bottom) - t });
            }
        }
        if (incomplete)
            lock (ElemLock)
                if (LastElementsWindow == hwnd)
                    foreach (ElemInfo it in LastElements) if (it.Password || it.Secret) rects.Add(new int[] { it.X, it.Y, it.W, it.H });
        return rects;
    }

    // Pure geometry. Secret rects (physical px) clipped to the captured region [x,y,w,h] and the window (clip, may be
    // null) -> src: bitmap px of the full capture; dst: px of the tw x th image, floor/ceil so every touched pixel is covered.
    static void MapRedactions(List<int[]> rects, int[] clip, int x, int y, int w, int h, int tw, int th, List<int[]> src, List<int[]> dst)
    {
        foreach (int[] r in rects)
        {
            if (r == null) continue;
            int l = Math.Max(r[0], x), t = Math.Max(r[1], y), rr = Math.Min(r[0] + r[2], x + w), b = Math.Min(r[1] + r[3], y + h);
            if (clip != null) { l = Math.Max(l, clip[0]); t = Math.Max(t, clip[1]); rr = Math.Min(rr, clip[0] + clip[2]); b = Math.Min(b, clip[1] + clip[3]); }
            if (rr <= l || b <= t) continue;
            src.Add(new int[] { l - x, t - y, rr - l, b - t });
            int il = (int)Math.Floor((double)(l - x) * tw / w), it = (int)Math.Floor((double)(t - y) * th / h);
            int ir = Math.Min(tw, (int)Math.Ceiling((double)(rr - x) * tw / w)), ib = Math.Min(th, (int)Math.Ceiling((double)(b - y) * th / h));
            dst.Add(new int[] { il, it, ir - il, ib - it });
        }
    }

    // No screen needed: the redaction geometry and field matcher, for selftest.
    static object RedactMap(Args a)
    {
        int x = Int(a, "x", 0), y = Int(a, "y", 0), w = Int(a, "width", 0), h = Int(a, "height", 0), tw, th;
        if (w <= 0 || h <= 0) throw new Exception("empty region");
        Fit(w, h, Int(a, "maxWidth", 1280), out tw, out th);
        List<int[]> rects = new List<int[]>();
        object v;
        if (a.TryGetValue("rects", out v) && Arr(v) != null) foreach (object o in Arr(v)) rects.Add(ToRect(o));
        List<int[]> src = new List<int[]>(), dst = new List<int[]>();
        MapRedactions(rects, RectArg(a, "window"), x, y, w, h, tw, th, src, dst);
        List<bool> secret = new List<bool>();
        if (a.TryGetValue("fields", out v) && Arr(v) != null)
            foreach (object o in Arr(v)) secret.Add(IsSecretField(Str(o as Args, "name", null), Str(o as Args, "id", null), Str(o as Args, "value", null)));
        Args r = new Args();
        r["width"] = tw; r["height"] = th; r["src"] = src; r["image"] = dst; r["secret"] = secret;
        return r;
    }

    // ---------- audio (default playback device) ----------
    static N.IDev DefaultAudio()
    {
        N.IDev d;
        try { ((N.IEnumDev)new N.MMEnum()).GetDefaultAudioEndpoint(0, 1, out d); }
        catch (COMException) { throw new Exception("no sound device found"); }
        return d;
    }

    static N.IVol AudioVol(N.IDev d) { Guid g = typeof(N.IVol).GUID; object o; d.Activate(ref g, 23, IntPtr.Zero, out o); return (N.IVol)o; }

    static string AudioName(N.IDev d)
    {
        N.IProps ps; d.OpenPropertyStore(0, out ps);
        N.PKey k = new N.PKey(); k.f = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"); k.p = 14; // PKEY_Device_FriendlyName
        N.PVar v; ps.GetValue(ref k, out v);
        string name = v.vt == 31 ? Marshal.PtrToStringUni(v.p) : "";
        N.PropVariantClear(ref v);
        return name;
    }

    static object AudioStatus()
    {
        N.IDev d = DefaultAudio();
        N.IVol v = AudioVol(d);
        float s; bool m;
        v.GetMasterVolumeLevelScalar(out s); v.GetMute(out m);
        Args r = new Args();
        r["device"] = AudioName(d); r["volume"] = (int)Math.Round(s * 100); r["muted"] = m;
        return r;
    }

    static object AudioSet(Args a)
    {
        object mv; a.TryGetValue("muted", out mv);
        if (mv != null && !(mv is bool)) throw new Exception("muted must be true or false");
        bool setVol = Has(a, "volume");
        double vol = Num(a, "volume", double.NaN);
        if (setVol && double.IsNaN(vol)) throw new Exception("volume must be a number 0-100");
        N.IVol v = AudioVol(DefaultAudio());
        Guid g = Guid.Empty;
        if (setVol) v.SetMasterVolumeLevelScalar((float)(Math.Max(0, Math.Min(100, vol)) / 100.0), ref g);
        if (mv != null) v.SetMute((bool)mv, ref g);
        return AudioStatus();
    }

    // ---------- windows ----------
    static string Title(IntPtr h)
    {
        int len = N.GetWindowTextLength(h);
        if (len <= 0) return "";
        StringBuilder sb = new StringBuilder(len + 1);
        N.GetWindowText(h, sb, sb.Capacity);
        return sb.ToString();
    }

    static int[] WinRect(IntPtr h)
    {
        N.RECT r;
        try { if (N.DwmGetWindowAttribute(h, 9, out r, Marshal.SizeOf(typeof(N.RECT))) == 0) return new int[] { r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top }; } catch (Exception) { }
        N.GetWindowRect(h, out r);
        return new int[] { r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top };
    }

    static string ProcName(IntPtr h, Dictionary<uint, string> cache)
    {
        uint pid;
        N.GetWindowThreadProcessId(h, out pid);
        string name;
        if (cache != null && cache.TryGetValue(pid, out name)) return name;
        try { using (Process p = Process.GetProcessById((int)pid)) name = p.ProcessName; } catch (Exception) { name = ""; }
        if (cache != null) cache[pid] = name;
        return name;
    }

    static Args WindowInfo(IntPtr h, Dictionary<uint, string> cache)
    {
        Args r = new Args();
        r["hwnd"] = h.ToInt64();
        if (h == IntPtr.Zero) { r["title"] = ""; r["process"] = ""; r["pid"] = 0; r["rect"] = new int[] { 0, 0, 0, 0 }; return r; }
        r["pid"] = PidOf(h);
        r["title"] = Title(h);
        r["process"] = ProcName(h, cache);
        r["rect"] = WinRect(h);
        return r;
    }

    // Visible, titled, not a tool window, not cloaked (other virtual desktop, suspended store app).
    static bool IsAppWindow(IntPtr h)
    {
        if (!N.IsWindowVisible(h) || N.GetWindowTextLength(h) <= 0) return false;
        int ex = N.GetWindowLong(h, -20);
        if ((ex & 0x80) != 0 && (ex & 0x40000) == 0) return false; // WS_EX_TOOLWINDOW without WS_EX_APPWINDOW
        int cloaked = 0;
        try { N.DwmGetWindowAttribute(h, 14, out cloaked, 4); } catch (Exception) { }
        return cloaked == 0;
    }

    static object Windows()
    {
        List<Args> list = new List<Args>();
        IntPtr fg = N.GetForegroundWindow();
        Dictionary<uint, string> cache = new Dictionary<uint, string>();
        N.EnumWindowsProc proc = delegate(IntPtr h, IntPtr l)
        {
            if (!IsAppWindow(h)) return true;
            Args w = WindowInfo(h, cache);
            w["minimized"] = N.IsIconic(h);
            w["maximized"] = N.IsZoomed(h);
            w["foreground"] = h == fg;
            list.Add(w);
            return true;
        };
        N.EnumWindows(proc, IntPtr.Zero);
        GC.KeepAlive(proc);
        Args r = new Args();
        r["windows"] = list;
        return r;
    }

    static object WindowAt(Args a)
    {
        N.POINT p; p.X = Int(a, "x", 0); p.Y = Int(a, "y", 0);
        IntPtr child = N.WindowFromPoint(p);
        IntPtr root = child == IntPtr.Zero ? IntPtr.Zero : N.GetAncestor(child, 2);
        Args r = WindowInfo(root, null);
        r["child"] = child.ToInt64();
        return r;
    }

    static object Focus(Args a)
    {
        IntPtr h = new IntPtr(Long(a, "hwnd", 0));
        if (!N.IsWindow(h)) throw new Exception("no such window");
        N.MSG m;
        N.PeekMessage(out m, IntPtr.Zero, 0, 0, 0); // give this thread a message queue so AttachThreadInput works
        if (N.IsIconic(h)) N.ShowWindow(h, 9); // SW_RESTORE
        if (N.GetForegroundWindow() != h)
        {
            uint dummy;
            uint me = N.GetCurrentThreadId();
            uint fgThread = N.GetWindowThreadProcessId(N.GetForegroundWindow(), out dummy);
            uint target = N.GetWindowThreadProcessId(h, out dummy);
            bool a1 = fgThread != 0 && fgThread != me && N.AttachThreadInput(me, fgThread, true);
            bool a2 = target != 0 && target != me && target != fgThread && N.AttachThreadInput(me, target, true);
            N.BringWindowToTop(h);
            N.SetForegroundWindow(h);
            if (a2) N.AttachThreadInput(me, target, false);
            if (a1) N.AttachThreadInput(me, fgThread, false);
            if (N.GetForegroundWindow() != h)
            {
                N.keybd_event(0x12, 0, 0, UIntPtr.Zero);     // ALT down
                N.keybd_event(0x12, 0, 2, UIntPtr.Zero);     // ALT up
                N.SetForegroundWindow(h);
            }
            for (int i = 0; i < 25 && N.GetForegroundWindow() != h; i++) Thread.Sleep(20);
        }
        Args r = new Args();
        r["ok"] = N.GetForegroundWindow() == h;
        return r;
    }

    static object Open(Args a)
    {
        string target = Str(a, "target", "");
        if (target.Length == 0) throw new Exception("target required");
        string argv = Str(a, "args", null);
        int pid = -1;
        Exception err = null;
        // ShellExecute may activate COM shell extensions that need an STA thread.
        Thread t = new Thread(delegate()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(target);
                psi.UseShellExecute = true;
                if (!string.IsNullOrEmpty(argv)) psi.Arguments = argv;
                using (Process p = Process.Start(psi)) { if (p != null) { try { pid = p.Id; } catch (Exception) { } } }
            }
            catch (Exception e) { err = e; }
        });
        t.SetApartmentState(ApartmentState.STA);
        t.IsBackground = true;
        t.Start();
        t.Join();
        if (err != null) throw err;
        Args r = new Args();
        if (pid > 0) r["pid"] = pid;
        return r;
    }

    // ---------- docking: the open panel owns the right edge (Windows AppBar) ----------
    // The shell shrinks the work area by the reserved width and re-fits every maximized window into what is left.
    // The AppBar is a hidden window of OUR process that only holds the space; Electron puts the real panel on top of
    // the granted rect. Own window, not the Electron one: the shell's callbacks (taskbar moved, explorer restarted)
    // reach code that answers them, and the space goes back when we exit, crash (UnhandledException) or are killed
    // (the --appbar-guard process). direct:true registers the given hwnd itself (diagnostic, appbar_selftest.js).
    const uint ABM_NEW = 0, ABM_REMOVE = 1, ABM_QUERYPOS = 2, ABM_SETPOS = 3, ABE_RIGHT = 2;
    static readonly uint BarMsg = N.RegisterWindowMessage("BarnabyDockSpace");
    static readonly uint TaskbarCreated = N.RegisterWindowMessage("TaskbarCreated");
    static readonly Dictionary<long, DockBar> Bars = new Dictionary<long, DockBar>(); // key: the panel (target) hwnd
    static readonly object BarLock = new object();
    static WF.Control BarHost; // lives on the dock thread; window work runs there through Invoke

    class DockBar : WF.NativeWindow
    {
        public IntPtr Target { get; private set; } // properties: NativeWindow is MarshalByRefObject (CS1690 on fields)
        public IntPtr Hwnd { get; private set; }
        public bool Direct;
        public int Size;
        public int[] Rect;
        public List<Push> Pushed { get; set; } // windows the shell pushed aside when we docked

        public DockBar(IntPtr target, bool direct)
        {
            Target = target; Direct = direct;
            if (direct) { Hwnd = target; return; }
            WF.CreateParams cp = new WF.CreateParams();
            cp.Caption = "Barnaby dock space";
            cp.Style = unchecked((int)0x80000000); // WS_POPUP, never shown
            cp.ExStyle = 0x80 | 0x08000000;         // WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE
            CreateHandle(cp);
            Hwnd = Handle;
            // We may run elevated: let the (non-elevated) shell's callbacks through UIPI.
            N.ChangeWindowMessageFilterEx(Hwnd, BarMsg, 1, IntPtr.Zero);
            N.ChangeWindowMessageFilterEx(Hwnd, TaskbarCreated, 1, IntPtr.Zero);
        }

        public N.APPBARDATA Data()
        {
            N.APPBARDATA d = new N.APPBARDATA();
            d.cbSize = Marshal.SizeOf(typeof(N.APPBARDATA));
            d.hWnd = Hwnd; d.uCallbackMessage = BarMsg; d.uEdge = ABE_RIGHT;
            return d;
        }

        public bool Register() { N.APPBARDATA d = Data(); return N.SHAppBarMessage(ABM_NEW, ref d) != UIntPtr.Zero; }
        public void Unregister() { N.APPBARDATA d = Data(); N.SHAppBarMessage(ABM_REMOVE, ref d); }

        // Ask for the right edge of the target's monitor; the shell trims it (taskbar, other bars); keep our width.
        public void Place()
        {
            Args m = MonitorOf(Target);
            int x = (int)m["x"], y = (int)m["y"], w = (int)m["width"], h = (int)m["height"];
            N.APPBARDATA d = Data();
            d.rc.Left = x + w - Size; d.rc.Top = y; d.rc.Right = x + w; d.rc.Bottom = y + h;
            N.SHAppBarMessage(ABM_QUERYPOS, ref d);
            d.rc.Left = d.rc.Right - Size;
            N.SHAppBarMessage(ABM_SETPOS, ref d);
            Rect = new int[] { d.rc.Left, d.rc.Top, d.rc.Right - d.rc.Left, d.rc.Bottom - d.rc.Top };
            if (!Direct) N.MoveWindow(Hwnd, Rect[0], Rect[1], Rect[2], Rect[3], false);
        }

        protected override void WndProc(ref WF.Message m)
        {
            // Taskbar moved or resized, another bar came or went, screen changed: take the edge again. Explorer
            // restarted: register again. Posted, so we never call the shell from inside its own notification.
            if ((m.Msg == (int)BarMsg && m.WParam.ToInt64() == 1) || m.Msg == 0x007E) // ABN_POSCHANGED, WM_DISPLAYCHANGE
                BarHost.BeginInvoke(new WF.MethodInvoker(delegate() { if (IsLive()) Place(); }));
            else if (m.Msg == (int)TaskbarCreated)
                BarHost.BeginInvoke(new WF.MethodInvoker(delegate() { if (IsLive() && Register()) Place(); }));
            base.WndProc(ref m);
        }

        bool IsLive() { lock (Bars) return Bars.ContainsValue(this); }
    }

    static List<DockBar> BarList() { lock (Bars) return new List<DockBar>(Bars.Values); }

    static object OnBarThread(Func<object> f)
    {
        lock (BarLock)
        {
            if (BarHost == null)
            {
                ManualResetEvent ready = new ManualResetEvent(false);
                Thread t = new Thread(delegate()
                {
                    WF.Control c = new WF.Control();
                    GC.KeepAlive(c.Handle);
                    // A dock whose panel window is gone (closed without undock) gives the space back.
                    WF.Timer tm = new WF.Timer();
                    tm.Interval = 2000;
                    tm.Tick += delegate { foreach (DockBar b in BarList()) if (!N.IsWindow(b.Target)) RemoveBar(b); };
                    tm.Start();
                    BarHost = c;
                    ready.Set();
                    WF.Application.Run();
                });
                t.SetApartmentState(ApartmentState.STA);
                t.IsBackground = true;
                t.Start();
                ready.WaitOne();
            }
        }
        return BarHost.Invoke(f);
    }

    static int RemoveBar(DockBar b) // dock thread only; returns how many pushed windows went back
    {
        lock (Bars) { DockBar cur; if (!Bars.TryGetValue(b.Target.ToInt64(), out cur) || cur != b) return 0; Bars.Remove(b.Target.ToInt64()); }
        b.Unregister();
        if (!b.Direct) b.DestroyHandle();
        return PutBack(b);
    }

    // Exit paths (stdin closed, crash): hand the space back right here, on whatever thread we are on.
    static void RemoveAllBars()
    {
        List<DockBar> all = BarList();
        lock (Bars) Bars.Clear();
        foreach (DockBar b in all) { b.Unregister(); PutBack(b); }
    }

    // When the work area shrinks, the shell pushes normal windows that overlap the strip into what is left (seen live:
    // Notepad clamped to the new width, another window slid left), and they do not come back when the strip is freed.
    // Dock notes every normal window; ~0.6 s later it notes which ones moved; undock moves back each one that is still
    // exactly where it was pushed (one the person moved since stays where they put it). Our own windows are main's.
    class Push { public IntPtr H; public int[] From, To; }
    static readonly int MyPid = Process.GetCurrentProcess().Id;

    static Dictionary<long, int[]> NormalWindows()
    {
        Dictionary<long, int[]> d = new Dictionary<long, int[]>();
        N.EnumWindowsProc proc = delegate(IntPtr h, IntPtr l)
        {
            if (!IsAppWindow(h) || N.IsIconic(h) || N.IsZoomed(h)) return true;
            int pid = PidOf(h);
            if (pid != ParentPid && pid != MyPid) d[h.ToInt64()] = WinRect(h);
            return true;
        };
        N.EnumWindows(proc, IntPtr.Zero);
        GC.KeepAlive(proc);
        return d;
    }

    static void NotePushed(DockBar bar, Dictionary<long, int[]> before)
    {
        Thread t = new Thread(delegate()
        {
            Thread.Sleep(600);
            List<Push> moved = new List<Push>();
            foreach (KeyValuePair<long, int[]> kv in NormalWindows())
            {
                int[] was;
                if (!before.TryGetValue(kv.Key, out was) || Near(was, kv.Value, 0)) continue;
                Push p = new Push(); p.H = new IntPtr(kv.Key); p.From = was; p.To = kv.Value;
                moved.Add(p);
            }
            lock (Bars) bar.Pushed = moved;
        });
        t.IsBackground = true;
        t.Start();
    }

    static int PutBack(DockBar b)
    {
        List<Push> list;
        lock (Bars) { list = b.Pushed; b.Pushed = null; }
        int n = 0;
        if (list == null) return 0;
        foreach (Push p in list)
        {
            if (!N.IsWindow(p.H) || N.IsZoomed(p.H) || N.IsIconic(p.H) || !Near(WinRect(p.H), p.To, 2)) continue;
            if (MoveVisible(p.H, p.From)) n++;
        }
        return n;
    }

    static bool Near(int[] a, int[] b, int tol)
    {
        for (int i = 0; i < 4; i++) if (Math.Abs(a[i] - b[i]) > tol) return false;
        return true;
    }

    // Put the VISIBLE frame at r: the window rect also holds invisible resize borders (~7 px). Async: a hung app
    // cannot stall us. SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS.
    static bool MoveVisible(IntPtr h, int[] r)
    {
        int[] vis = WinRect(h);
        N.RECT o;
        N.GetWindowRect(h, out o);
        int dl = vis[0] - o.Left, dt = vis[1] - o.Top, dr = o.Right - (vis[0] + vis[2]), db = o.Bottom - (vis[1] + vis[3]);
        return N.SetWindowPos(h, IntPtr.Zero, r[0] - dl, r[1] - dt, r[2] + dl + dr, r[3] + dt + db, 0x0004 | 0x0010 | 0x4000);
    }

    static object AppBar(Args a)
    {
        string action = Str(a, "action", "");
        if (action == "undock")
        {
            long only = Long(a, "hwnd", 0);
            object n = OnBarThread(delegate()
            {
                int[] c = new int[2]; // removed, windows put back
                foreach (DockBar b in BarList()) if (only == 0 || b.Target.ToInt64() == only) { c[1] += RemoveBar(b); c[0]++; }
                return c;
            });
            Args u = new Args();
            u["removed"] = ((int[])n)[0];
            u["restored"] = ((int[])n)[1];
            return u;
        }
        if (action != "dock") throw new Exception("action must be dock or undock");
        if (Str(a, "edge", "right") != "right") throw new Exception("only edge right is supported");
        IntPtr target = new IntPtr(Long(a, "hwnd", 0));
        if (target == IntPtr.Zero || !N.IsWindow(target)) throw new Exception("no such window");
        int size = Int(a, "size", 0);
        int max = (int)MonitorOf(target)["width"] * 2 / 3; // never let a bad call take the whole screen
        if (size < 50 || size > max) throw new Exception("size must be 50 to " + max + " px on this screen");
        bool direct = Bool(a, "direct", false);
        Dictionary<long, int[]> before = NormalWindows();
        bool fresh = false;
        DockBar bar = (DockBar)OnBarThread(delegate()
        {
            DockBar b;
            lock (Bars) Bars.TryGetValue(target.ToInt64(), out b);
            if (b == null)
            {
                b = new DockBar(target, direct);
                if (!b.Register()) { if (!direct) b.DestroyHandle(); throw new Exception("Windows would not reserve the space (ABM_NEW refused)"); }
                lock (Bars) Bars[target.ToInt64()] = b;
                StartGuard(b);
                fresh = true;
            }
            b.Size = size;
            b.Place();
            return b;
        });
        // The shell updates the work area right after SETPOS; wait for it here (never on the dock thread, which the
        // shell may be sending to), so a maximize right after this call already fits the smaller screen.
        int[] work = null;
        for (int i = 0; i < 50; i++)
        {
            work = (int[])MonitorOf(target)["work"];
            if (work[0] + work[2] <= bar.Rect[0]) break;
            Thread.Sleep(30);
        }
        if (fresh) NotePushed(bar, before);
        Args r = new Args();
        r["rect"] = bar.Rect;
        r["bar"] = bar.Hwnd.ToInt64();
        r["work"] = work;
        return r;
    }

    // A killed helper cannot undock. A tiny guard process waits for us to exit and then removes the bar; it quits on its
    // own when the bar is undocked normally (window destroyed, we live). ponytail: on Windows 11 26340 the shell freed a
    // killed helper's space by itself in ~130 ms (appbar_selftest.js step 8); the guard is kept for Windows 10, where
    // that is unverified. Delete it once step 8 shows the same there. A kill never puts pushed windows back.
    static void StartGuard(DockBar b)
    {
        if (Environment.GetEnvironmentVariable("HELPER_NO_BAR_GUARD") == "1") return; // tests: see what a kill leaves
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,
                "--appbar-guard " + Process.GetCurrentProcess().Id + " " + b.Hwnd.ToInt64());
            psi.UseShellExecute = true; // no inherited handles: our stdio pipes to Electron stay ours alone
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            Process p = Process.Start(psi);
            if (p != null) p.Dispose();
        }
        catch (Exception) { }
    }

    static int GuardMain(string[] argv)
    {
        int pid; long bar;
        if (!int.TryParse(argv[1], out pid) || !long.TryParse(argv[2], out bar)) return 2;
        IntPtr h = new IntPtr(bar);
        Process parent = null;
        try { parent = Process.GetProcessById(pid); } catch (Exception) { }
        while (parent != null && !parent.WaitForExit(500))
        {
            if (N.IsWindow(h)) continue;
            if (!parent.WaitForExit(2000)) return 0; // undocked normally: the helper already removed it
            break;                                 // killed: its windows went first
        }
        N.APPBARDATA d = new N.APPBARDATA();
        d.cbSize = Marshal.SizeOf(typeof(N.APPBARDATA));
        d.hWnd = h;
        N.SHAppBarMessage(ABM_REMOVE, ref d); // finds the record by handle value; a no-op if it is already gone
        return 0;
    }

    // helper.exe --test-window: a small throwaway window for the live docking test. Prints {"hwnd":N}, closes when
    // stdin closes, never takes the focus by itself.
    class TestForm : WF.Form
    {
        protected override bool ShowWithoutActivation { get { return true; } }
    }

    static int TestWindowMain()
    {
        Thread t = new Thread(delegate()
        {
            TestForm f = new TestForm();
            f.Text = "Barnaby test window (closes by itself)";
            f.ShowInTaskbar = false;
            f.StartPosition = WF.FormStartPosition.Manual;
            Args p = PrimaryMonitor();
            f.Bounds = new Rectangle((int)p["x"] + 120, (int)p["y"] + 120, 520, 360);
            f.Shown += delegate
            {
                StreamWriter o = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
                o.NewLine = "\n";
                o.WriteLine("{\"hwnd\":" + f.Handle.ToInt64() + "}");
                o.Flush();
                Thread r = new Thread(delegate()
                {
                    try { new StreamReader(Console.OpenStandardInput()).ReadToEnd(); } catch (Exception) { }
                    try { f.BeginInvoke(new WF.MethodInvoker(f.Close)); } catch (Exception) { }
                });
                r.IsBackground = true;
                r.Start();
            };
            WF.Application.Run(f);
        });
        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        t.Join();
        return 0;
    }

    // ---------- window placement ----------
    static bool WaitFor(Func<bool> f, int ms)
    {
        Stopwatch sw = Stopwatch.StartNew();
        while (!f()) { if (sw.ElapsedMilliseconds > ms) return false; Thread.Sleep(30); }
        return true;
    }

    // Async show/move: a hung app cannot stall us. ok = the window really reached the state (poll up to 1.5 s).
    static object WindowSet(Args a)
    {
        IntPtr h = new IntPtr(Long(a, "hwnd", 0));
        if (h == IntPtr.Zero || !N.IsWindow(h)) throw new Exception("no such window");
        string cls = ClassName(h);
        if (cls == "Shell_TrayWnd" || cls == "Shell_SecondaryTrayWnd" || cls == "Progman" || cls == "WorkerW")
            throw new Exception("that is part of Windows itself (taskbar or desktop): leaving it alone");
        string action = Str(a, "action", "");
        bool ok;
        switch (action)
        {
            case "maximize": N.ShowWindowAsync(h, 3); ok = WaitFor(delegate { return N.IsZoomed(h); }, 1500); break;
            case "minimize": N.ShowWindowAsync(h, 6); ok = WaitFor(delegate { return N.IsIconic(h); }, 1500); break;
            case "restore":
                N.ShowWindowAsync(h, 9);
                ok = WaitFor(delegate { return !N.IsZoomed(h) && !N.IsIconic(h); }, 1500);
                break;
            case "move":
                {
                    int[] r = RectArg(a, "rect");
                    if (r == null || r[2] < 50 || r[3] < 50) throw new Exception("rect [x,y,w,h] of at least 50x50 required");
                    if (N.IsZoomed(h) || N.IsIconic(h))
                    {
                        N.ShowWindowAsync(h, 9);
                        WaitFor(delegate { return !N.IsZoomed(h) && !N.IsIconic(h); }, 1500);
                    }
                    if (!MoveVisible(h, r))
                        throw new Exception("Windows would not move that window (error " + Marshal.GetLastWin32Error() + ")");
                    // position exact; size within a few px (terminals snap to whole characters)
                    ok = WaitFor(delegate
                    {
                        int[] n = WinRect(h);
                        return Math.Abs(n[0] - r[0]) <= 2 && Math.Abs(n[1] - r[1]) <= 2 && Math.Abs(n[2] - r[2]) <= 16 && Math.Abs(n[3] - r[3]) <= 16;
                    }, 1500);
                    break;
                }
            default: throw new Exception("action must be maximize, restore, minimize or move");
        }
        Args res = new Args();
        res["ok"] = ok;
        res["rect"] = WinRect(h);
        res["maximized"] = N.IsZoomed(h);
        res["minimized"] = N.IsIconic(h);
        return res;
    }

    static object WorkArea(Args a)
    {
        Args r = new Args();
        Args m;
        if (Has(a, "hwnd")) { m = MonitorOf(new IntPtr(Long(a, "hwnd", 0))); r["rect"] = m["work"]; }
        else
        {
            m = PrimaryMonitor();
            N.RECT rc = new N.RECT();
            if (!N.SystemParametersInfo(0x0030, 0, ref rc, 0)) throw new Exception("work area not available"); // SPI_GETWORKAREA
            r["rect"] = new int[] { rc.Left, rc.Top, rc.Right - rc.Left, rc.Bottom - rc.Top };
        }
        r["monitor"] = new int[] { (int)m["x"], (int)m["y"], (int)m["width"], (int)m["height"] };
        return r;
    }

    // ---------- process / session ----------
    static object IsElevated()
    {
        using (System.Security.Principal.WindowsIdentity id = System.Security.Principal.WindowsIdentity.GetCurrent())
        {
            int elevated, type, n;
            if (!N.GetTokenInformation(id.Token, 20, out elevated, 4, out n)) elevated = 0; // TokenElevation
            if (!N.GetTokenInformation(id.Token, 18, out type, 4, out n)) type = 1;         // TokenElevationType
            bool inRole = new System.Security.Principal.WindowsPrincipal(id).IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
            Args r = new Args();
            r["elevated"] = elevated != 0;
            // In the Administrators group: the role check (elevated / UAC off), or a split UAC token (full or limited).
            r["adminGroup"] = inRole || type == 2 || type == 3;
            r["elevationType"] = type == 2 ? "full" : type == 3 ? "limited" : "default";
            return r;
        }
    }

    static object Idle()
    {
        N.LASTINPUTINFO li = new N.LASTINPUTINFO();
        li.cbSize = (uint)Marshal.SizeOf(typeof(N.LASTINPUTINFO));
        N.GetLastInputInfo(ref li);
        IntPtr fg = N.GetForegroundWindow();
        Process[] lu = Process.GetProcessesByName("LogonUI");
        bool locked = lu.Length > 0 || fg == IntPtr.Zero || string.Equals(ProcName(fg, null), "LockApp", StringComparison.OrdinalIgnoreCase);
        foreach (Process p in lu) p.Dispose();
        Args r = new Args();
        r["idleMs"] = (long)unchecked((uint)Environment.TickCount - li.dwTime);
        r["locked"] = locked;
        return r;
    }

    // ---------- input ----------
    const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_EXTENDEDKEY = 1, KEYEVENTF_KEYUP = 2, KEYEVENTF_UNICODE = 4;

    static void SendInputs(List<N.INPUT> list)
    {
        if (list.Count == 0) return;
        // Never type or click into the lock screen (it would land in the password box).
        if (string.Equals(ProcName(N.GetForegroundWindow(), null), "LockApp", StringComparison.OrdinalIgnoreCase))
            throw new Exception("screen is locked");
        N.INPUT[] arr = list.ToArray();
        uint sent = N.SendInput((uint)arr.Length, arr, Marshal.SizeOf(typeof(N.INPUT)));
        if (sent != arr.Length) throw new Exception("SendInput blocked (error " + Marshal.GetLastWin32Error() + ")");
    }

    static N.INPUT Mouse(uint flags, uint data)
    {
        N.INPUT i = new N.INPUT();
        i.type = INPUT_MOUSE;
        i.u.mi.dwFlags = flags;
        i.u.mi.mouseData = data;
        return i;
    }

    static N.INPUT KeyInput(ushort vk, ushort scan, uint flags)
    {
        N.INPUT i = new N.INPUT();
        i.type = INPUT_KEYBOARD;
        i.u.ki.wVk = vk;
        i.u.ki.wScan = scan;
        i.u.ki.dwFlags = flags;
        return i;
    }

    static bool IsExtended(ushort vk)
    {
        switch (vk)
        {
            case 0x21: case 0x22: case 0x23: case 0x24: case 0x25: case 0x26: case 0x27: case 0x28:
            case 0x2C: case 0x2D: case 0x2E: case 0x5B: case 0x5C: case 0x5D: case 0x6F: case 0x90:
            case 0xA3: case 0xA5:
                return true;
        }
        return false;
    }

    static void AddVk(List<N.INPUT> list, ushort vk, bool up)
    {
        uint flags = (IsExtended(vk) ? KEYEVENTF_EXTENDEDKEY : 0) | (up ? KEYEVENTF_KEYUP : 0);
        list.Add(KeyInput(vk, (ushort)N.MapVirtualKey(vk, 0), flags));
    }

    static void DoClick(int x, int y, string button, bool dbl)
    {
        N.SetCursorPos(x, y);
        Thread.Sleep(15);
        uint down = 0x0002, up = 0x0004;                     // left
        if (button == "right") { down = 0x0008; up = 0x0010; }
        else if (button == "middle") { down = 0x0020; up = 0x0040; }
        List<N.INPUT> l = new List<N.INPUT>();
        l.Add(Mouse(down, 0)); l.Add(Mouse(up, 0));
        SendInputs(l);
        if (dbl) { Thread.Sleep(Math.Min(80, (int)N.GetDoubleClickTime() / 4)); SendInputs(l); }
    }

    static object Click(Args a)
    {
        DoClick(Int(a, "x", 0), Int(a, "y", 0), Str(a, "button", "left").ToLowerInvariant(), Bool(a, "double", false));
        return new Args();
    }

    static object TypeText(Args a)
    {
        string text = Str(a, "text", "");
        List<N.INPUT> batch = new List<N.INPUT>();
        foreach (char c in text)
        {
            if (c == '\r') continue;
            if (c == '\n') { AddVk(batch, 0x0D, false); AddVk(batch, 0x0D, true); }
            else if (c == '\t') { AddVk(batch, 0x09, false); AddVk(batch, 0x09, true); }
            else
            {
                batch.Add(KeyInput(0, c, KEYEVENTF_UNICODE));
                batch.Add(KeyInput(0, c, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
            }
            if (batch.Count >= 40) { SendInputs(batch); batch.Clear(); Thread.Sleep(8); }
        }
        SendInputs(batch);
        return new Args();
    }

    static readonly Dictionary<string, ushort> KeyNames = BuildKeyNames();
    static Dictionary<string, ushort> BuildKeyNames()
    {
        Dictionary<string, ushort> d = new Dictionary<string, ushort>();
        d["ctrl"] = 0x11; d["control"] = 0x11; d["alt"] = 0x12; d["shift"] = 0x10; d["win"] = 0x5B; d["windows"] = 0x5B; d["meta"] = 0x5B;
        d["enter"] = 0x0D; d["return"] = 0x0D; d["tab"] = 0x09; d["esc"] = 0x1B; d["escape"] = 0x1B;
        d["backspace"] = 0x08; d["delete"] = 0x2E; d["del"] = 0x2E; d["insert"] = 0x2D;
        d["up"] = 0x26; d["down"] = 0x28; d["left"] = 0x25; d["right"] = 0x27;
        d["home"] = 0x24; d["end"] = 0x23; d["pageup"] = 0x21; d["pagedown"] = 0x22; d["pgup"] = 0x21; d["pgdn"] = 0x22;
        d["space"] = 0x20; d["plus"] = 0xBB; d["minus"] = 0xBD; d["printscreen"] = 0x2C; d["capslock"] = 0x14; d["apps"] = 0x5D;
        for (int i = 1; i <= 12; i++) d["f" + i] = (ushort)(0x6F + i);
        return d;
    }

    static ushort KeyVk(string name)
    {
        string k = name.Trim().ToLowerInvariant();
        ushort vk;
        if (KeyNames.TryGetValue(k, out vk)) return vk;
        if (k.Length == 1)
        {
            char c = k[0];
            if (c >= 'a' && c <= 'z') return (ushort)(c - 'a' + 0x41);
            if (c >= '0' && c <= '9') return (ushort)c;
            short s = N.VkKeyScan(c);
            if (s != -1) return (ushort)(s & 0xFF);
        }
        throw new Exception("unknown key: " + name);
    }

    static object Key(Args a)
    {
        string combo = Str(a, "combo", Str(a, "keys", ""));
        if (combo.Trim().Length == 0) throw new Exception("combo required");
        List<ushort> vks = new List<ushort>();
        string rest = combo.Trim();
        if (rest.EndsWith("++")) { rest = rest.Substring(0, rest.Length - 2); vks.Add(0xBB); } // "ctrl++"
        List<ushort> parsed = new List<ushort>();
        if (rest.Length > 0) foreach (string part in rest.Split('+')) parsed.Add(KeyVk(part));
        parsed.AddRange(vks);
        List<N.INPUT> l = new List<N.INPUT>();
        for (int i = 0; i < parsed.Count; i++) AddVk(l, parsed[i], false);
        for (int i = parsed.Count - 1; i >= 0; i--) AddVk(l, parsed[i], true);
        SendInputs(l);
        return new Args();
    }

    static object Scroll(Args a)
    {
        int amount = Int(a, "amount", 0);
        if (Has(a, "x") && Has(a, "y")) { N.SetCursorPos(Int(a, "x", 0), Int(a, "y", 0)); Thread.Sleep(15); }
        int n = Math.Min(Math.Abs(amount), 50);
        for (int i = 0; i < n; i++)
        {
            List<N.INPUT> l = new List<N.INPUT>();
            l.Add(Mouse(0x0800, unchecked((uint)(amount > 0 ? 120 : -120))));
            SendInputs(l);
            Thread.Sleep(25);
        }
        return new Args();
    }

    // ---------- wait_click (low-level mouse hook) ----------
    static readonly bool AllowInjected = Environment.GetEnvironmentVariable("BARNABY_ALLOW_INJECTED") == "1";
    static readonly object WaitLock = new object();
    static readonly HashSet<uint> WaitThreads = new HashSet<uint>();

    class ClickState { public bool Clicked, Cancelled; public int X, Y; public string Button = ""; public string Error; }

    static object WaitClick(Args a)
    {
        int timeout = Math.Max(1, Int(a, "timeoutMs", 30000));
        int[] rect = RectArg(a, "rect");
        ClickState st = new ClickState();
        Thread t = new Thread(delegate() { HookLoop(st, timeout); });
        t.IsBackground = true;
        t.Start();
        t.Join();
        if (st.Error != null) throw new Exception(st.Error);
        Args r = new Args();
        r["clicked"] = st.Clicked;
        if (st.Clicked)
        {
            r["x"] = st.X; r["y"] = st.Y; r["button"] = st.Button;
            r["inRect"] = rect == null || (st.X >= rect[0] && st.Y >= rect[1] && st.X < rect[0] + rect[2] && st.Y < rect[1] + rect[3]);
        }
        else
        {
            r["x"] = null; r["y"] = null; r["button"] = null; r["inRect"] = false;
            if (st.Cancelled) r["cancelled"] = true;
        }
        return r;
    }

    static void HookLoop(ClickState st, int timeout)
    {
        uint me = N.GetCurrentThreadId();
        N.LowLevelMouseProc proc = delegate(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && !st.Clicked)
            {
                int msg = wParam.ToInt32();
                string btn = msg == 0x0202 ? "left" : msg == 0x0205 ? "right" : msg == 0x0208 ? "middle" : null;
                if (btn != null)
                {
                    N.MSLLHOOKSTRUCT h = (N.MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(N.MSLLHOOKSTRUCT));
                    // LLMHF_INJECTED: ignore SendInput clicks (ours or anyone's); the streamed browser demo injects every click.
                    if ((h.flags & 0x1) == 0 || AllowInjected)
                    {
                        st.Clicked = true; st.X = h.pt.X; st.Y = h.pt.Y; st.Button = btn;
                        N.PostThreadMessage(me, 0x0012, IntPtr.Zero, IntPtr.Zero); // WM_QUIT
                    }
                }
            }
            return N.CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
        };
        RunHook(14, proc, timeout, null, st);
    }

    // Runs a low-level hook (14 mouse, 13 keyboard) on this thread until the proc posts WM_QUIT, the timeout, cancel_wait,
    // or poll() says done (checked every 100 ms).
    static void RunHook(int id, N.LowLevelMouseProc proc, int timeout, Func<bool> poll, ClickState st)
    {
        uint me = N.GetCurrentThreadId();
        N.MSG m;
        N.PeekMessage(out m, IntPtr.Zero, 0, 0, 0); // create the message queue before anyone posts to it
        IntPtr hook = N.SetWindowsHookEx(id, proc, N.GetModuleHandle(null), 0);
        if (hook == IntPtr.Zero) { st.Error = (id == 14 ? "mouse" : "keyboard") + " hook failed (" + Marshal.GetLastWin32Error() + ")"; return; }
        lock (WaitLock) WaitThreads.Add(me);
        UIntPtr timer = N.SetTimer(IntPtr.Zero, UIntPtr.Zero, (uint)timeout, IntPtr.Zero);
        UIntPtr tick = poll == null ? UIntPtr.Zero : N.SetTimer(IntPtr.Zero, UIntPtr.Zero, 100, IntPtr.Zero);
        try
        {
            while (N.GetMessage(out m, IntPtr.Zero, 0, 0) > 0)
            {
                if (m.message == 0x0113 && m.hwnd == IntPtr.Zero)                  // our WM_TIMERs
                {
                    if (poll != null && (ulong)m.wParam.ToInt64() == tick.ToUInt64() && !poll()) continue;
                    break;
                }
                if (m.message == 0x8001) { st.Cancelled = true; break; }          // cancel_wait
                N.TranslateMessage(ref m);
                N.DispatchMessage(ref m);
            }
        }
        finally
        {
            lock (WaitLock) WaitThreads.Remove(me);
            N.KillTimer(IntPtr.Zero, timer);
            if (poll != null) N.KillTimer(IntPtr.Zero, tick);
            N.UnhookWindowsHookEx(hook);
            GC.KeepAlive(proc);
        }
    }

    // wait_typing: counts the person's key presses (never which keys) until they pressed Enter, or typed and then paused
    // idleMs. Injected keys (our own type/key commands) do not count, except in the demo (BARNABY_ALLOW_INJECTED).
    static object WaitTyping(Args a)
    {
        int timeout = Math.Max(1, Int(a, "timeoutMs", 180000)), idle = Math.Max(100, Int(a, "idleMs", 2500));
        ClickState st = new ClickState();
        int keys = 0, last = 0;
        bool enter = false;
        Thread t = new Thread(delegate()
        {
            uint me = N.GetCurrentThreadId();
            N.LowLevelMouseProc proc = delegate(int nCode, IntPtr wParam, IntPtr lParam)
            {
                int msg = wParam.ToInt32();
                if (nCode >= 0 && !enter && (msg == 0x0100 || msg == 0x0104)) // WM_KEYDOWN, WM_SYSKEYDOWN
                {
                    N.KBDLLHOOKSTRUCT k = (N.KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(N.KBDLLHOOKSTRUCT));
                    uint vk = k.vkCode;
                    bool modifier = (vk >= 0x10 && vk <= 0x12) || (vk >= 0xA0 && vk <= 0xA5) || vk == 0x5B || vk == 0x5C || vk == 0x14;
                    if (((k.flags & 0x10) == 0 || AllowInjected) && !modifier) // LLKHF_INJECTED
                    {
                        keys++; last = Environment.TickCount;
                        if (vk == 0x0D) { enter = true; N.PostThreadMessage(me, 0x0012, IntPtr.Zero, IntPtr.Zero); }
                    }
                }
                return N.CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
            };
            RunHook(13, proc, timeout, delegate { return keys > 0 && Environment.TickCount - last >= idle; }, st);
        });
        t.IsBackground = true;
        t.Start();
        t.Join();
        if (st.Error != null) throw new Exception(st.Error);
        Args r = new Args();
        r["typed"] = keys; r["enter"] = enter;
        if (st.Cancelled) r["cancelled"] = true;
        return r;
    }

    // The focused box: name and role, and its text only when it is not a password or secret-looking field.
    static object FocusValue()
    {
        Args res = null;
        Thread t = new Thread(delegate()
        {
            try
            {
                AutomationElement e = AutomationElement.FocusedElement;
                if (e == null) return;
                ControlType ct = e.Current.ControlType;
                string name = e.Current.Name, value = null;
                bool pw = e.Current.IsPassword;
                object vp;
                if (!pw && e.TryGetCurrentPattern(ValuePattern.Pattern, out vp)) value = ((ValuePattern)vp).Current.Value;
                Args r = new Args();
                r["name"] = Clip(name, 200) ?? "";
                r["role"] = ct.ProgrammaticName.StartsWith("ControlType.") ? ct.ProgrammaticName.Substring(12) : ct.ProgrammaticName;
                r["password"] = pw;
                r["secret"] = pw || (SecretRole(ct) && IsSecretField(name, e.Current.AutomationId, value));
                if (!(bool)r["secret"]) r["value"] = Clip(value, 300);
                res = r;
            }
            catch (Exception) { }
        });
        t.IsBackground = true;
        t.Start();
        t.Join(2000); // a hung app cannot stall us
        return res ?? new Args();
    }

    static object CancelWait()
    {
        int n = 0;
        lock (WaitLock) foreach (uint t in WaitThreads) if (N.PostThreadMessage(t, 0x8001, IntPtr.Zero, IntPtr.Zero)) n++;
        Args r = new Args();
        r["cancelled"] = n;
        return r;
    }

    // ---------- UI Automation ----------
    static readonly object ElemLock = new object();
    static List<ElemInfo> LastElements = new List<ElemInfo>();
    static IntPtr LastElementsWindow = IntPtr.Zero;

    static readonly ControlType[] Interactive = {
        ControlType.Button, ControlType.Hyperlink, ControlType.Edit, ControlType.ComboBox, ControlType.ListItem,
        ControlType.MenuItem, ControlType.TabItem, ControlType.CheckBox, ControlType.RadioButton, ControlType.TreeItem,
        ControlType.DataItem, ControlType.Document, ControlType.SplitButton, ControlType.Slider, ControlType.Spinner };
    // Containers are skipped even when named (they only add noise); everything else is kept when it has a name.
    static readonly ControlType[] Containers = {
        ControlType.Pane, ControlType.Window, ControlType.Group, ControlType.List, ControlType.Tree, ControlType.Table,
        ControlType.DataGrid, ControlType.ToolBar, ControlType.StatusBar, ControlType.TitleBar, ControlType.ScrollBar,
        ControlType.Thumb, ControlType.Separator, ControlType.MenuBar, ControlType.Menu, ControlType.Tab };

    static Condition AnyType(ControlType[] ts)
    {
        Condition[] cs = new Condition[ts.Length];
        for (int i = 0; i < ts.Length; i++) cs[i] = new PropertyCondition(AutomationElement.ControlTypeProperty, ts[i]);
        return new OrCondition(cs);
    }

    static bool IsIn(ControlType t, ControlType[] set) { foreach (ControlType c in set) if (c == t) return true; return false; }

    static IntPtr TargetWindow(Args a)
    {
        IntPtr h = Has(a, "hwnd") ? new IntPtr(Long(a, "hwnd", 0)) : N.GetForegroundWindow();
        if (h == IntPtr.Zero || !N.IsWindow(h)) throw new Exception("no such window");
        return h;
    }

    // FindAll on a worker thread so a hung app cannot stall us beyond the time budget.
    static AutomationElementCollection FindAll(IntPtr hwnd, Condition cond, AutomationProperty[] props, int budgetMs, out bool timedOut)
    {
        AutomationElementCollection result = null;
        Exception err = null;
        Thread t = new Thread(delegate()
        {
            try
            {
                AutomationElement root = AutomationElement.FromHandle(hwnd);
                CacheRequest cr = new CacheRequest();
                cr.AutomationElementMode = AutomationElementMode.Full;
                cr.TreeScope = TreeScope.Element;
                foreach (AutomationProperty p in props) cr.Add(p);
                using (cr.Activate()) result = root.FindAll(TreeScope.Descendants, cond);
            }
            catch (Exception e) { err = e; }
        });
        t.IsBackground = true;
        t.Start();
        timedOut = !t.Join(budgetMs);
        if (timedOut) return null; // ponytail: whole-tree call, no partial results; chunk by subtree if big pages time out
        if (err != null) throw err;
        return result;
    }

    static readonly HashSet<IntPtr> WebWoken = new HashSet<IntPtr>();

    // A Chromium web Document with nothing found inside it = web tree not built yet.
    // Web tree not built yet = a Chromium window where no web Document has anything found inside it.
    static bool WebContentMissing(IntPtr hwnd, AutomationElementCollection found)
    {
        bool sawDoc = false;
        foreach (AutomationElement d in found)
        {
            if ((Cached(d, AutomationElement.ControlTypeProperty) as ControlType) != ControlType.Document) continue;
            if ((Cached(d, AutomationElement.FrameworkIdProperty) as string) != "Chrome") continue;
            sawDoc = true;
            object rv = Cached(d, AutomationElement.BoundingRectangleProperty);
            if (!(rv is System.Windows.Rect) || ((System.Windows.Rect)rv).IsEmpty) continue;
            System.Windows.Rect dr = (System.Windows.Rect)rv;
            foreach (AutomationElement e in found)
            {
                if (ReferenceEquals(e, d)) continue;
                object ev = Cached(e, AutomationElement.BoundingRectangleProperty);
                if (ev is System.Windows.Rect && !((System.Windows.Rect)ev).IsEmpty && dr.Contains(((System.Windows.Rect)ev).TopLeft)) return false;
            }
        }
        return sawDoc || ClassName(hwnd).StartsWith("Chrome_WidgetWin", StringComparison.Ordinal);
    }

    static string ClassName(IntPtr h)
    {
        StringBuilder sb = new StringBuilder(256);
        N.GetClassName(h, sb, sb.Capacity);
        return sb.ToString();
    }

    static object Cached(AutomationElement e, AutomationProperty p)
    {
        try { object v = e.GetCachedPropertyValue(p, true); return v == AutomationElement.NotSupported ? null : v; } catch (Exception) { return null; }
    }

    // One line, no invisible format/private-use glyphs (icon fonts, LRM marks), capped.
    static string Clip(string s, int max)
    {
        if (s == null) return null;
        StringBuilder sb = new StringBuilder(Math.Min(s.Length, max) + 4);
        bool space = false;
        foreach (char c in s)
        {
            UnicodeCategory cat = char.GetUnicodeCategory(c);
            if (cat == UnicodeCategory.Format || cat == UnicodeCategory.PrivateUse) continue;
            if (char.IsWhiteSpace(c) || cat == UnicodeCategory.Control) { space = sb.Length > 0; continue; }
            if (space) { sb.Append(' '); space = false; }
            sb.Append(c);
            if (sb.Length >= max) { sb.Append("..."); break; }
        }
        return sb.ToString();
    }

    // The taskbar of the screen holding args.hwnd (the main screen without one): Shell_TrayWnd on the main screen,
    // Shell_SecondaryTrayWnd on the others.
    static IntPtr TaskbarOf(Args a)
    {
        IntPtr mon = Has(a, "hwnd") ? N.MonitorFromWindow(new IntPtr(Long(a, "hwnd", 0)), 2) : IntPtr.Zero;
        IntPtr bar = IntPtr.Zero;
        N.EnumWindowsProc proc = delegate(IntPtr h, IntPtr l)
        {
            string c = ClassName(h);
            bool hit = mon == IntPtr.Zero ? c == "Shell_TrayWnd"
                : (c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd") && N.MonitorFromWindow(h, 2) == mon;
            if (hit) bar = h;
            return !hit;
        };
        N.EnumWindows(proc, IntPtr.Zero);
        GC.KeepAlive(proc);
        if (bar == IntPtr.Zero) throw new Exception("no taskbar on that screen");
        return bar;
    }

    // taskbar:true lists the taskbar instead of a window. append:true numbers the items after the last list and keeps
    // that list, so click_element takes the window's ids and the taskbar's alike.
    static object Elements(Args a)
    {
        Stopwatch sw = Stopwatch.StartNew();
        IntPtr hwnd = Bool(a, "taskbar", false) ? TaskbarOf(a) : TargetWindow(a);
        int max = Math.Max(1, Int(a, "max", 250));
        int budget = Math.Max(300, Int(a, "budgetMs", 2500));
        int[] wr = WinRect(hwnd);

        Condition cond = new AndCondition(
            new PropertyCondition(AutomationElement.IsOffscreenProperty, false),
            new OrCondition(
                AnyType(Interactive),
                new AndCondition(
                    new NotCondition(new PropertyCondition(AutomationElement.NameProperty, "")),
                    new NotCondition(AnyType(Containers)))));
        AutomationProperty[] props = {
            AutomationElement.NameProperty, AutomationElement.ControlTypeProperty, AutomationElement.BoundingRectangleProperty,
            AutomationElement.IsEnabledProperty, AutomationElement.HasKeyboardFocusProperty, AutomationElement.IsPasswordProperty,
            AutomationElement.FrameworkIdProperty, AutomationElement.AutomationIdProperty, ValuePattern.ValueProperty };
        bool timedOut;
        AutomationElementCollection found = FindAll(hwnd, cond, props, budget, out timedOut);
        // Chromium builds a window's web tree only after the first UIA request (~1-3 s). On the first look at a
        // window whose web Document is still empty, keep asking until the time budget runs out.
        bool firstLook;
        lock (ElemLock) firstLook = WebWoken.Add(hwnd);
        while (firstLook && found != null && WebContentMissing(hwnd, found) && sw.ElapsedMilliseconds + 700 < budget)
        {
            Thread.Sleep(400);
            bool to;
            AutomationElementCollection again = FindAll(hwnd, cond, props, budget - (int)sw.ElapsedMilliseconds, out to);
            if (again == null) { timedOut = to; break; }
            found = again;
        }
        long findMs = sw.ElapsedMilliseconds;

        List<ElemInfo> list = new List<ElemInfo>();
        int total = 0;
        if (found != null)
        {
            total = found.Count;
            foreach (AutomationElement e in found)
            {
                ElemInfo it = new ElemInfo();
                it.El = e;
                ControlType ct = Cached(e, AutomationElement.ControlTypeProperty) as ControlType;
                if (ct == null) continue;
                object rv = Cached(e, AutomationElement.BoundingRectangleProperty);
                if (!(rv is System.Windows.Rect)) continue;
                System.Windows.Rect r = (System.Windows.Rect)rv;
                if (r.IsEmpty || double.IsInfinity(r.Width) || double.IsNaN(r.Width) || r.Width < 1 || r.Height < 1) continue;
                it.X = (int)Math.Round(r.X); it.Y = (int)Math.Round(r.Y); it.W = (int)Math.Round(r.Width); it.H = (int)Math.Round(r.Height);
                // must overlap the window (some apps report scrolled-away items as on-screen)
                if (it.X >= wr[0] + wr[2] || it.Y >= wr[1] + wr[3] || it.X + it.W <= wr[0] || it.Y + it.H <= wr[1]) continue;
                it.Role = ct.ProgrammaticName.StartsWith("ControlType.") ? ct.ProgrammaticName.Substring(12) : ct.ProgrammaticName;
                it.Name = Clip(Cached(e, AutomationElement.NameProperty) as string, 200) ?? "";
                it.Interactive = IsIn(ct, Interactive);
                if (it.Name.Length == 0 && !it.Interactive) continue; // icon glyph or invisible text
                object en = Cached(e, AutomationElement.IsEnabledProperty); it.Enabled = !(en is bool) || (bool)en;
                object fo = Cached(e, AutomationElement.HasKeyboardFocusProperty); it.Focused = fo is bool && (bool)fo;
                object pw = Cached(e, AutomationElement.IsPasswordProperty); it.Password = pw is bool && (bool)pw;
                if (!it.Password) it.Value = Clip(Cached(e, ValuePattern.ValueProperty) as string, 200);
                // Card / SSN / PIN / code fields: their contents never go to the brain (the person types them).
                it.Secret = !it.Password && SecretRole(ct) && IsSecretField(it.Name, Cached(e, AutomationElement.AutomationIdProperty) as string, it.Value);
                if (it.Secret) it.Value = null;
                // Drop a text label that just repeats its parent link/button (Chromium exposes both).
                if (!it.Interactive && list.Count > 0)
                {
                    bool dup = false;
                    for (int k = list.Count - 1; k >= Math.Max(0, list.Count - 3); k--)
                    {
                        ElemInfo p = list[k];
                        if (p.Name.Length > 0 && p.Name.Contains(it.Name) && it.X >= p.X && it.Y >= p.Y && it.X + it.W <= p.X + p.W + 1 && it.Y + it.H <= p.Y + p.H + 1) { dup = true; break; }
                    }
                    if (dup) continue;
                }
                list.Add(it);
            }
        }

        // Reading order: rows (top within a small tolerance), then left to right.
        list.Sort(delegate(ElemInfo p, ElemInfo q) { return p.Y != q.Y ? p.Y.CompareTo(q.Y) : p.X.CompareTo(q.X); });
        List<ElemInfo> ordered = new List<ElemInfo>(list.Count);
        int i0 = 0;
        while (i0 < list.Count)
        {
            int j = i0;
            while (j < list.Count && list[j].Y - list[i0].Y <= 10) j++;
            List<ElemInfo> row = list.GetRange(i0, j - i0);
            row.Sort(delegate(ElemInfo p, ElemInfo q) { return p.X != q.X ? p.X.CompareTo(q.X) : p.Y.CompareTo(q.Y); });
            ordered.AddRange(row);
            i0 = j;
        }
        bool capped = ordered.Count > max;
        if (capped) ordered = ordered.GetRange(0, max);

        List<Args> outList = new List<Args>();
        int textReads = 0;
        for (int i = 0; i < ordered.Count; i++)
        {
            ElemInfo it = ordered[i];
            // Editors without ValuePattern (e.g. Notepad's RichEdit): show the start of their text instead.
            if (it.Value == null && !it.Password && !it.Secret && (it.Role == "Document" || it.Role == "Edit") && textReads < 5)
            {
                textReads++;
                try
                {
                    object p;
                    if (it.El.TryGetCurrentPattern(TextPattern.Pattern, out p)) it.Value = Clip(((TextPattern)p).DocumentRange.GetText(201), 200);
                }
                catch (Exception) { }
            }
            Args o = new Args();
            o["id"] = i + 1;
            o["name"] = it.Name;
            o["role"] = it.Role;
            o["rect"] = new int[] { it.X, it.Y, it.W, it.H };
            bool editor = it.Role == "Edit" || it.Role == "Document" || it.Role == "ComboBox";
            if (it.Value != null && (it.Value.Length > 0 ? it.Value != it.Name : editor)) o["value"] = it.Value; // "" = empty box
            o["enabled"] = it.Enabled;
            if (it.Focused) o["focused"] = true;
            if (it.Password) o["password"] = true;
            if (it.Secret) o["private"] = true;
            outList.Add(o);
        }
        int baseId = 0;
        lock (ElemLock)
        {
            if (Bool(a, "append", false)) { baseId = LastElements.Count; LastElements.AddRange(ordered); }
            else { LastElements = ordered; LastElementsWindow = hwnd; }
        }
        if (baseId > 0) foreach (Args o in outList) o["id"] = (int)o["id"] + baseId;

        Args res = new Args();
        res["window"] = WindowInfo(hwnd, null);
        res["elements"] = outList;
        if (capped || timedOut) res["truncated"] = true;
        if (timedOut) res["timedOut"] = true;
        res["found"] = total;
        res["ms"] = sw.ElapsedMilliseconds;
        res["findMs"] = findMs;
        return res;
    }

    static object ClickElement(Args a)
    {
        int id = Int(a, "id", 0);
        bool dbl = Bool(a, "double", false);
        string force = Str(a, "method", "");
        ElemInfo it;
        IntPtr win;
        lock (ElemLock)
        {
            if (id < 1 || id > LastElements.Count) throw new Exception("unknown element id " + id + " (call elements again)");
            it = LastElements[id - 1];
            win = LastElementsWindow;
        }
        System.Windows.Rect r;
        try { r = it.El.Current.BoundingRectangle; }
        catch (ElementNotAvailableException) { throw new Exception("element " + id + " is gone (call elements again)"); }
        bool hasRect = !r.IsEmpty && !double.IsInfinity(r.Width) && r.Width >= 1 && r.Height >= 1;
        int cx = hasRect ? (int)Math.Round(r.X + r.Width / 2) : it.X + it.W / 2;
        int cy = hasRect ? (int)Math.Round(r.Y + r.Height / 2) : it.Y + it.H / 2;

        // Covered by another window (e.g. our floating widget)? Then prefer a pattern over a blind click.
        N.POINT pt; pt.X = cx; pt.Y = cy;
        IntPtr hit = N.WindowFromPoint(pt);
        bool covered = !hasRect || (hit != IntPtr.Zero && win != IntPtr.Zero && N.GetAncestor(hit, 2) != win);
        bool patternRole = it.Role == "Button" || it.Role == "Hyperlink" || it.Role == "MenuItem" || it.Role == "SplitButton"
            || it.Role == "CheckBox" || it.Role == "RadioButton" || it.Role == "TabItem";

        Args res = new Args();
        res["x"] = cx; res["y"] = cy;
        if (!dbl && force != "click" && (patternRole || covered || force == "invoke"))
        {
            string p = TryPattern(it.El);
            if (p != null) { res["method"] = "invoke"; res["pattern"] = p; return res; }
        }
        if (!hasRect) throw new Exception("element " + id + " has no clickable area");
        DoClick(cx, cy, "left", dbl);
        res["method"] = "click";
        if (covered) res["covered"] = true;
        return res;
    }

    static string TryPattern(AutomationElement el)
    {
        string method = null;
        Thread t = new Thread(delegate()
        {
            try
            {
                object p;
                if (el.TryGetCurrentPattern(InvokePattern.Pattern, out p)) { method = "invoke"; ((InvokePattern)p).Invoke(); }
                else if (el.TryGetCurrentPattern(TogglePattern.Pattern, out p)) { method = "toggle"; ((TogglePattern)p).Toggle(); }
                else if (el.TryGetCurrentPattern(SelectionItemPattern.Pattern, out p)) { method = "select"; ((SelectionItemPattern)p).Select(); }
            }
            catch (Exception) { method = null; }
        });
        t.IsBackground = true;
        t.Start();
        // A pattern call that opens a modal dialog blocks until it closes; the action already happened.
        if (!t.Join(1500)) return method ?? "invoke";
        return method;
    }

    // ---------- taskbar ----------
    // Our own button on the taskbar -> {found, rect, name}. Windows 11 tags it with the app id ("Appid: <aumid>"),
    // Windows 10 only with the window's name. pin:true pins it the way a person does, since Windows gives programs
    // no pin call: right-click the button, then "Pin to taskbar" in its jump list (Escape if that isn't there).
    // The item is found by its id (TaskbarPin, any language), else by its English name.
    static object Taskbar(Args a)
    {
        string aumid = Str(a, "aumid", ""), title = Str(a, "name", "");
        AutomationElement tray = AutomationElement.RootElement.FindFirst(TreeScope.Children,
            new PropertyCondition(AutomationElement.ClassNameProperty, "Shell_TrayWnd"));
        Args r = new Args();
        r["found"] = false;
        if (tray == null) return r;
        AutomationElement btn = null;
        foreach (AutomationElement b in tray.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button)))
        {
            string id = b.Current.AutomationId ?? "", nm = b.Current.Name ?? "";
            if ((aumid.Length > 0 && id == "Appid: " + aumid) || (title.Length > 0 && (nm == title || nm.StartsWith(title + " ")))) { btn = b; break; }
        }
        if (btn == null) return r;
        System.Windows.Rect rc = btn.Current.BoundingRectangle;
        int x = (int)Math.Round(rc.X), y = (int)Math.Round(rc.Y), w = (int)Math.Round(rc.Width), h = (int)Math.Round(rc.Height);
        r["found"] = true;
        r["rect"] = new int[] { x, y, w, h };
        r["name"] = btn.Current.Name;
        if (!Bool(a, "pin", false)) return r;

        N.POINT was; N.GetCursorPos(out was);
        DoClick(x + w / 2, y + h / 2, "right", false);
        AutomationElement item = null;
        Stopwatch sw = Stopwatch.StartNew();
        while (item == null && sw.ElapsedMilliseconds < 3000)
        {
            Thread.Sleep(200);
            item = FindPinItem(tray);
        }
        bool invoked = false, already = false;
        try { already = item != null && item.Current.AutomationId == "TaskbarUnpin"; } catch (Exception) { }
        if (already) item = null; // it offers "Unpin from taskbar": pinned already, never touch that
        if (item != null)
        {
            invoked = TryPattern(item) != null;
            if (!invoked)
            {
                System.Windows.Rect ir = item.Current.BoundingRectangle;
                if (!ir.IsEmpty) { DoClick((int)Math.Round(ir.X + ir.Width / 2), (int)Math.Round(ir.Y + ir.Height / 2), "left", false); invoked = true; }
            }
        }
        if (!invoked) { List<N.INPUT> esc = new List<N.INPUT>(); AddVk(esc, 0x1B, false); AddVk(esc, 0x1B, true); SendInputs(esc); }
        N.SetCursorPos(was.X, was.Y);
        r["invoked"] = invoked;
        if (already) r["pinned"] = true;
        return r;
    }

    // The jump list is the foreground window after the right-click (Windows 11: "Jump List for ..."); the taskbar
    // itself is searched too, in case a build hosts it there.
    static AutomationElement FindPinItem(AutomationElement tray)
    {
        Condition c = new OrCondition(new PropertyCondition(AutomationElement.AutomationIdProperty, "TaskbarPin"),
            new PropertyCondition(AutomationElement.AutomationIdProperty, "TaskbarUnpin"),
            new PropertyCondition(AutomationElement.NameProperty, "Pin to taskbar"));
        IntPtr fg = N.GetForegroundWindow();
        try { if (fg != IntPtr.Zero) { AutomationElement e = AutomationElement.FromHandle(fg).FindFirst(TreeScope.Descendants, c); if (e != null) return e; } }
        catch (Exception) { }
        try { return tray.FindFirst(TreeScope.Descendants, c); } catch (Exception) { return null; }
    }

    static object WindowText(Args a)
    {
        Stopwatch sw = Stopwatch.StartNew();
        IntPtr hwnd = TargetWindow(a);
        int max = Math.Max(1, Int(a, "max", 4000));
        AutomationProperty[] props = { AutomationElement.NameProperty, AutomationElement.ControlTypeProperty, AutomationElement.IsPasswordProperty, ValuePattern.ValueProperty };
        bool timedOut;
        AutomationElementCollection found = FindAll(hwnd, new PropertyCondition(AutomationElement.IsOffscreenProperty, false), props, Math.Max(300, Int(a, "budgetMs", 2000)), out timedOut);
        StringBuilder sb = new StringBuilder();
        HashSet<string> seen = new HashSet<string>();
        List<string> labels = new List<string>();
        if (found != null)
        {
            // Documents (web pages, editors) first: their full text via TextPattern is what a scam page says.
            foreach (AutomationElement e in found)
            {
                if (sb.Length >= max || sw.ElapsedMilliseconds > 2500) break;
                if ((Cached(e, AutomationElement.ControlTypeProperty) as ControlType) != ControlType.Document) continue;
                try
                {
                    object p;
                    if (e.TryGetCurrentPattern(TextPattern.Pattern, out p)) AppendText(sb, seen, ((TextPattern)p).DocumentRange.GetText(max));
                }
                catch (Exception) { }
            }
            // Then every visible name / value (native dialogs, fake "virus" popups), one short line each.
            foreach (AutomationElement e in found)
            {
                if (sb.Length >= max) break;
                object pw = Cached(e, AutomationElement.IsPasswordProperty);
                if (pw is bool && (bool)pw) continue;
                AppendText(sb, seen, Clip(Cached(e, AutomationElement.NameProperty) as string, 300));
                AppendText(sb, seen, Clip(Cached(e, ValuePattern.ValueProperty) as string, 300));
            }
        }
        string text = sb.ToString();
        if (text.Length > max) text = text.Substring(0, max);
        Args r = new Args();
        r["title"] = Title(hwnd);
        r["text"] = text;
        if (timedOut) r["truncated"] = true;
        r["ms"] = sw.ElapsedMilliseconds;
        return r;
    }

    static void AppendText(StringBuilder sb, HashSet<string> seen, string s)
    {
        if (s == null) return;
        // one clean line per text line: no blank runs, no object-replacement glyphs for embedded controls
        StringBuilder t = new StringBuilder(s.Length);
        foreach (string line in s.Replace('￼', ' ').Split('\n'))
        {
            string l = line.Trim();
            if (l.Length == 0) continue;
            if (t.Length > 0) t.Append('\n');
            t.Append(l);
        }
        s = t.ToString();
        if (s.Length == 0 || !seen.Add(s)) return;
        if (sb.Length > 0) sb.Append('\n');
        sb.Append(s);
    }

    // ---------- speech ----------
    static readonly object RecLock = new object();
    static SpeechRecognitionEngine Rec;
    static string RecCulture;

    static object Listen(Args a)
    {
        int timeout = Math.Max(500, Int(a, "timeoutMs", 15000));
        string culture = Str(a, "culture", "en-US");
        if (!Monitor.TryEnter(RecLock)) throw new Exception("already listening");
        try
        {
            Stopwatch sw = Stopwatch.StartNew();
            if (Rec == null || RecCulture != culture)
            {
                RecognizerInfo pick = null;
                foreach (RecognizerInfo ri in SpeechRecognitionEngine.InstalledRecognizers())
                {
                    if (pick == null) pick = ri;
                    if (string.Equals(ri.Culture.Name, culture, StringComparison.OrdinalIgnoreCase)) { pick = ri; break; }
                }
                if (pick == null) throw new Exception("no speech recognizer installed");
                if (Rec != null) { Rec.Dispose(); Rec = null; }
                SpeechRecognitionEngine eng = new SpeechRecognitionEngine(pick);
                eng.LoadGrammar(new DictationGrammar()); // slow (seconds) the first time; engine is kept afterwards
                Rec = eng;
                RecCulture = culture;
            }
            long loadMs = sw.ElapsedMilliseconds;
            try { Rec.SetInputToDefaultAudioDevice(); }
            catch (Exception e) { throw new Exception("no microphone: " + e.Message); }
            Rec.InitialSilenceTimeout = TimeSpan.FromMilliseconds(timeout);
            Rec.BabbleTimeout = TimeSpan.FromMilliseconds(timeout);
            Rec.EndSilenceTimeout = TimeSpan.FromMilliseconds(800);
            RecognitionResult res = null;
            using (ManualResetEvent done = new ManualResetEvent(false))
            {
                EventHandler<RecognizeCompletedEventArgs> h = delegate(object s, RecognizeCompletedEventArgs e) { res = e.Result; done.Set(); };
                Rec.RecognizeCompleted += h;
                try
                {
                    Rec.RecognizeAsync(RecognizeMode.Single);
                    // hard deadline: silence ends at timeout; allow a little extra for a sentence in progress
                    if (!done.WaitOne(timeout + 3000)) { Rec.RecognizeAsyncCancel(); done.WaitOne(2000); }
                }
                finally { Rec.RecognizeCompleted -= h; }
            }
            Args r = new Args();
            r["text"] = res == null ? "" : res.Text;
            r["confidence"] = res == null ? 0.0 : (double)res.Confidence;
            r["loadMs"] = loadMs;
            r["ms"] = sw.ElapsedMilliseconds;
            return r;
        }
        finally { Monitor.Exit(RecLock); }
    }

    // ---------- wake phrase ("Hello, Barnaby") ----------
    // Offline, small fixed grammar: nothing leaves the computer. One waiter at a time; wake_cancel ends it.
    static readonly object WakeLock = new object();
    static SpeechRecognitionEngine WakeRec;
    static string WakeKey;
    static ManualResetEvent WakeStop = new ManualResetEvent(false);

    static object WakeWait(Args a)
    {
        int timeout = Math.Max(1000, Int(a, "timeoutMs", 60000));
        double minConf = Convert.ToDouble(Has(a, "minConfidence") ? a["minConfidence"] : 0.75, CultureInfo.InvariantCulture);
        string culture = Str(a, "culture", "en-US");
        List<string> phrases = new List<string>();
        if (Has(a, "phrases") && a["phrases"] is System.Collections.IEnumerable && !(a["phrases"] is string))
            foreach (object o in (System.Collections.IEnumerable)a["phrases"]) { string t = Convert.ToString(o).Trim(); if (t.Length > 0) phrases.Add(t); }
        if (phrases.Count == 0) phrases.AddRange(new string[] { "hello barnaby", "hey barnaby", "hi barnaby", "okay barnaby", "barnaby help me" });
        if (!Monitor.TryEnter(WakeLock)) throw new Exception("already waiting for the wake phrase");
        try
        {
            string key = culture + "|" + string.Join("|", phrases.ToArray());
            if (WakeRec == null || WakeKey != key)
            {
                RecognizerInfo pick = null;
                foreach (RecognizerInfo ri in SpeechRecognitionEngine.InstalledRecognizers())
                {
                    if (pick == null) pick = ri;
                    if (string.Equals(ri.Culture.Name, culture, StringComparison.OrdinalIgnoreCase)) { pick = ri; break; }
                }
                if (pick == null) throw new Exception("no speech recognizer installed");
                if (WakeRec != null) { WakeRec.Dispose(); WakeRec = null; }
                SpeechRecognitionEngine eng = new SpeechRecognitionEngine(pick);
                GrammarBuilder gb = new GrammarBuilder(new Choices(phrases.ToArray()));
                gb.Culture = pick.Culture;
                eng.LoadGrammar(new Grammar(gb));
                WakeRec = eng;
                WakeKey = key;
            }
            string wav = Str(a, "wavFile", ""); // tests feed a recorded file instead of the microphone
            try { if (wav.Length > 0) WakeRec.SetInputToWaveFile(wav); else WakeRec.SetInputToDefaultAudioDevice(); }
            catch (Exception e) { throw new Exception((wav.Length > 0 ? "cannot read " + wav + ": " : "no microphone: ") + e.Message); }
            WakeStop.Reset();
            string heard = null; double conf = 0;
            using (ManualResetEvent hit = new ManualResetEvent(false))
            {
                EventHandler<SpeechRecognizedEventArgs> h = delegate(object s, SpeechRecognizedEventArgs e)
                {
                    if (e.Result != null && e.Result.Confidence >= minConf) { heard = e.Result.Text; conf = e.Result.Confidence; hit.Set(); }
                };
                WakeRec.SpeechRecognized += h;
                try
                {
                    using (ManualResetEvent ended = new ManualResetEvent(false))
                    {
                        EventHandler<RecognizeCompletedEventArgs> c = delegate(object s2, RecognizeCompletedEventArgs e2) { ended.Set(); };
                        WakeRec.RecognizeCompleted += c;
                        try
                        {
                            WakeRec.RecognizeAsync(RecognizeMode.Multiple);
                            WaitHandle.WaitAny(new WaitHandle[] { hit, WakeStop, ended }, timeout); // ended: a test file ran out
                        }
                        finally { WakeRec.RecognizeCompleted -= c; }
                    }
                }
                finally
                {
                    WakeRec.SpeechRecognized -= h;
                    try { WakeRec.RecognizeAsyncCancel(); } catch (Exception) { }
                }
            }
            Args r = new Args();
            r["heard"] = heard != null;
            r["phrase"] = heard ?? "";
            r["confidence"] = conf;
            r["cancelled"] = heard == null && WakeStop.WaitOne(0);
            return r;
        }
        finally { Monitor.Exit(WakeLock); }
    }

    static object WakeCancel()
    {
        WakeStop.Set();
        return new Args();
    }

    static readonly object SpeechLock = new object();
    static SpeechSynthesizer Synth;

    static object Speak(Args a)
    {
        Args r = new Args();
        if (Environment.GetEnvironmentVariable("HELPER_MUTE") == "1") { r["muted"] = true; return r; }
        lock (SpeechLock)
        {
            if (Synth == null) { Synth = new SpeechSynthesizer(); Synth.SetOutputToDefaultAudioDevice(); }
            Synth.Rate = Math.Max(-10, Math.Min(10, Int(a, "rate", -1)));
            Synth.SpeakAsync(Str(a, "text", ""));
        }
        return r;
    }

    static object StopSpeaking()
    {
        lock (SpeechLock) { if (Synth != null) Synth.SpeakAsyncCancelAll(); }
        return new Args();
    }
}
