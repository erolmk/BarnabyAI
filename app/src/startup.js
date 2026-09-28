// "Start with Windows" for an app that runs as administrator. Windows skips Run-key entries that need elevation
// and the Startup folder would ask UAC at every sign-in, so it is a logon task with the highest privileges
// (schtasks, no window). ExecutionTimeLimit PT0S: the default 72-hour limit would stop Barnaby after three days.
// ponytail: the task belongs to the account that elevated; a standard user elevated with someone else's password
// gets the other account's task (write <UserId> from the signed-in session if that ever matters).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const x = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function taskXml({ exe, args = '--hidden', user, name = 'Barnaby' }) {
  const who = user ? '<UserId>' + x(user) + '</UserId>' : '';
  return '<?xml version="1.0" encoding="UTF-16"?>\n' +
    '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">\n' +
    '  <RegistrationInfo><Description>Starts ' + x(name) + ' when you sign in.</Description></RegistrationInfo>\n' +
    '  <Triggers><LogonTrigger><Enabled>true</Enabled>' + who + '</LogonTrigger></Triggers>\n' +
    '  <Principals><Principal id="Author">' + who + '<LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal></Principals>\n' +
    '  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>' +
    '<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><Priority>4</Priority>' +
    '<IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings></Settings>\n' +
    '  <Actions Context="Author"><Exec><Command>' + x(exe) + '</Command><Arguments>' + x(args) + '</Arguments></Exec></Actions>\n' +
    '</Task>\n';
}

// schtasks.exe without a console window -> exit code (-1 if it could not start).
function schtasks(args) {
  return new Promise((resolve) => {
    let p;
    try { p = spawn('schtasks.exe', args, { windowsHide: true, stdio: 'ignore' }); } catch (_) { return resolve(-1); }
    p.on('error', () => resolve(-1));
    p.on('exit', (code) => resolve(code));
  });
}

// on: create or replace the task; off: delete it (a missing task is fine). -> Promise<boolean>
async function setLogonTask(on, { name, exe, user, tmpDir, run = schtasks }) {
  if (!on) { await run(['/Delete', '/TN', name, '/F']); return true; }
  const file = path.join(tmpDir, name.replace(/\W/g, '') + '-logon-task.xml');
  fs.writeFileSync(file, '﻿' + taskXml({ exe, user, name }), 'utf16le'); // schtasks wants UTF-16 with a BOM
  try { return (await run(['/Create', '/TN', name, '/XML', file, '/F'])) === 0; } finally { try { fs.unlinkSync(file); } catch (_) {} }
}

module.exports = { taskXml, setLogonTask, schtasks };
