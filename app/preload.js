// Sandboxed preload: the only bridge between UI pages and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const product = ipcRenderer.sendSync('get-product');
const CHANNELS = new Set(['say', 'status', 'ask', 'ask-cancel', 'overlay', 'lesson-saved',
  'settings-changed', 'task-done', 'talk-toggle', 'talk-hold', 'widget-state', 'hush', 'tts']);

contextBridge.exposeInMainWorld('helper', {
  product,
  isDemo: false,
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (patch) => ipcRenderer.invoke('save-settings', patch),
  ask: (text, opts) => ipcRenderer.invoke('ask', String(text || ''), opts || {}),
  answer: (requestId, value) => ipcRenderer.send('answer', requestId, value),
  stop: () => ipcRenderer.send('stop'),
  goHome: () => ipcRenderer.send('go-home'),
  openTile: (id, arg) => ipcRenderer.invoke('open-tile', id, arg || null),
  talkHold: (down) => ipcRenderer.send('talk-hold', !!down), // the home screen's Talk button held down / let go
  transcribe: (wavBase64) => ipcRenderer.invoke('transcribe', wavBase64),
  listenOffline: () => ipcRenderer.invoke('listen-offline'),
  listLessons: () => ipcRenderer.invoke('list-lessons'),
  getLesson: (id) => ipcRenderer.invoke('get-lesson', id),
  replayLesson: (id) => ipcRenderer.invoke('replay-lesson', id),
  deleteLesson: (id) => ipcRenderer.invoke('delete-lesson', id),
  runCheck: (name) => ipcRenderer.invoke('run-check', name),
  spoken: (id) => ipcRenderer.send('spoken', id),
  sayLine: (text, o) => ipcRenderer.send('say-line', String(text || '').slice(0, 1000), o || {}), // the widget's own spoken lines and Say it again, in the natural voice
  testVoice: (o) => ipcRenderer.invoke('tts-test', o || {}), // -> {chunks} | {error: 'muted'|'local'|kind}; plays only on the Settings click
  overlayDismiss: (action) => ipcRenderer.send('overlay-dismiss', action || null), // null | 'close_page' | 'call_family'
  getWeather: () => ipcRenderer.invoke('get-weather'),
  openSettings: () => ipcRenderer.send('open-settings'),
  minimizeLauncher: () => ipcRenderer.send('launcher-minimize'),
  listening: (on) => ipcRenderer.send('listening', !!on), // widget mic opened/closed -> status 'listening'/back
  safetyDiary: () => ipcRenderer.invoke('get-diary'), // -> [{when, kind, what}] newest first
  testAlert: () => ipcRenderer.invoke('test-alert'), // -> {ok, why:''|'no_code'|'not_sent', time}
  deleteEverything: () => ipcRenderer.invoke('delete-everything'), // -> public settings after the reset
  isElevated: () => ipcRenderer.invoke('is-elevated'), // -> {elevated, adminGroup} (native is_elevated) or {elevated: null}
  widget: {
    expand: (b) => ipcRenderer.send('widget-expand', !!b),
    dragBy: (dx, dy) => ipcRenderer.send('widget-drag', Math.round(dx), Math.round(dy)),
  },
  on: (channel, cb) => {
    if (!CHANNELS.has(channel)) throw new Error('unknown channel ' + channel);
    const f = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, f);
    return () => ipcRenderer.removeListener(channel, f);
  },
});
