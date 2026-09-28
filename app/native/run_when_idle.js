// Waits until the PC is unlocked and idle >= IDLE_S seconds, then runs the native input self-test once
// (it opens its own Notepad, types, cleans up, closes it). Result -> G:\seniorhelper\native_input_test.log.
// Never runs while the owner is using the computer. Gives up after MAX_H hours.
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const IDLE_S = Number(process.env.IDLE_S || 180);
const MAX_H = Number(process.env.MAX_H || 14);
const LOG = 'G:\\seniorhelper\\native_input_test.log';
const PS = `Add-Type @"
using System; using System.Runtime.InteropServices;
public static class Idle { [StructLayout(LayoutKind.Sequential)] public struct L { public uint cb; public uint t; }
[DllImport("user32.dll")] static extern bool GetLastInputInfo(ref L p);
public static uint Ms() { L l = new L(); l.cb = 8; GetLastInputInfo(ref l); return (uint)Environment.TickCount - l.t; } }
"@
[string]([math]::Round([Idle]::Ms()/1000)) + ' ' + [string][bool](Get-Process LogonUI -ErrorAction SilentlyContinue)`;

const log = (s) => fs.appendFileSync(LOG, new Date().toISOString() + ' ' + s + '\n');

function state() {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', PS], { windowsHide: true, encoding: 'utf8' });
  const [idle, locked] = String(r.stdout || '').trim().split(/\s+/);
  return { idle: Number(idle) || 0, locked: locked === 'True' };
}

const deadline = Date.now() + MAX_H * 3600 * 1000;
log('waiting for idle >= ' + IDLE_S + ' s and unlocked');
const timer = setInterval(() => {
  if (Date.now() > deadline) { log('gave up: never idle+unlocked'); clearInterval(timer); return; }
  const s = state();
  if (s.locked || s.idle < IDLE_S) return;
  clearInterval(timer);
  log('idle ' + s.idle + ' s, unlocked: running native/selftest.js');
  const p = spawn(process.execPath, [path.join(__dirname, 'selftest.js')], { windowsHide: true, cwd: path.join(__dirname, '..'), env: { ...process.env, HELPER_MUTE: '1' } });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('exit', (code) => { fs.appendFileSync(LOG, out + '\n'); log('selftest exit ' + code); });
}, 20000);
