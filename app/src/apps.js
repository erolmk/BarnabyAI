// Friendly target names -> something the native helper can open (ShellExecute).
// resolve(target, settings) -> {kind:"url"|"uri"|"app", value, label, args?, fallback?} | null
// Unknown names return null on purpose: we never ShellExecute an arbitrary program name
// (cmd/powershell would flash a console; remote-access tools are scams). The agent then
// uses a web address or the Start menu instead.

const U = (value, label) => ({ kind: 'url', value, label });
const URI = (value, label, fallback) => ({ kind: 'uri', value, label, ...(fallback ? { fallback } : {}) });
const APP = (value, label, extra) => ({ kind: 'app', value, label, ...(extra || {}) });

const TABLE = {
  gmail: U('https://mail.google.com', 'Gmail'),
  outlook: U('https://outlook.live.com/mail/0/', 'Outlook'),
  // 'outlookmail:' is unreliable; the desktop app is only used when the family chose it.
  // olk.exe (new Outlook) fails cleanly if missing, so try it before the classic protocol.
  'outlook-app': APP('olk.exe', 'Outlook', { fallback: 'ms-outlook:' }),
  aol: U('https://mail.aol.com', 'AOL Mail'),
  yahoo: U('https://mail.yahoo.com', 'Yahoo Mail'),
  'icloud photos': U('https://www.icloud.com/photos/', 'iCloud Photos'),
  'google photos': U('https://photos.google.com', 'Google Photos'),
  'windows photos': URI('ms-photos:', 'Photos'),
  zoom: U('https://zoom.us/join', 'Zoom'),
  whatsapp: URI('whatsapp:', 'WhatsApp', 'https://web.whatsapp.com'),
  teams: U('https://teams.live.com', 'Microsoft Teams'),
  facebook: U('https://www.facebook.com', 'Facebook'),
  messenger: U('https://www.messenger.com', 'Messenger'),
  youtube: U('https://www.youtube.com', 'YouTube'),
  news: U('https://news.google.com', 'the news'),
  weather: U('https://weather.com', 'the weather'),
  solitaire: URI('xboxliveapp-1297287741:', 'Solitaire', 'https://www.google.com/search?q=solitaire'),
  settings: URI('ms-settings:', 'Settings'),
  display: URI('ms-settings:display', 'display settings'),
  sound: URI('ms-settings:sound', 'sound settings'),
  wifi: URI('ms-settings:network-wifi', 'Wi-Fi settings'),
  files: APP('explorer.exe', 'File Explorer'),
  downloads: APP('explorer.exe', 'Downloads folder', { args: 'shell:Downloads' }),
  pictures: APP('explorer.exe', 'Pictures folder', { args: 'shell:My Pictures' }),
  documents: APP('explorer.exe', 'Documents folder', { args: 'shell:Personal' }),
  browser: U('https://www.google.com', 'the internet'),
  notepad: APP('notepad.exe', 'Notepad'),
  calculator: APP('calc.exe', 'Calculator'),
  camera: URI('microsoft.windows.camera:', 'Camera'),
};

// Other ways people say the same thing -> TABLE key (or a settings-driven placeholder).
const ALIASES = {
  'google mail': 'gmail', hotmail: 'outlook', 'outlook.com': 'outlook', 'aol mail': 'aol',
  'yahoo mail': 'yahoo', 'new outlook': 'outlook-app', 'outlook app': 'outlook-app',
  icloud: 'icloud photos', 'iphone photos': 'icloud photos', 'iphone pictures': 'icloud photos',
  'apple photos': 'icloud photos', 'google pictures': 'google photos',
  'photos app': 'windows photos', 'microsoft photos': 'windows photos',
  'zoom meeting': 'zoom', 'microsoft teams': 'teams', 'facebook messenger': 'messenger',
  'you tube': 'youtube', headlines: 'news', 'the news': 'news', forecast: 'weather',
  cards: 'solitaire', 'card game': 'solitaire', games: 'solitaire', game: 'solitaire',
  'windows settings': 'settings', 'control panel': 'settings',
  'display settings': 'display', 'text size': 'display', 'screen settings': 'display',
  'sound settings': 'sound', volume: 'sound', speakers: 'sound',
  'wi-fi': 'wifi', 'wifi settings': 'wifi', 'wi-fi settings': 'wifi', 'network settings': 'wifi',
  'file explorer': 'files', explorer: 'files', 'my files': 'files', folders: 'files',
  'download folder': 'downloads', 'downloads folder': 'downloads',
  'pictures folder': 'pictures', 'documents folder': 'documents',
  internet: 'browser', web: 'browser', google: 'browser', edge: 'browser', chrome: 'browser',
  'web browser': 'browser', calc: 'calculator',
  // settings-driven
  email: '@email', mail: '@email', 'e-mail': '@email', inbox: '@email',
  photos: '@photos', pictures: '@photos', 'my pictures': '@photos',
  'video call': '@video', 'video chat': '@video',
};

const EMAIL = { gmail: 'gmail', outlook: 'outlook', 'outlook-app': 'outlook-app', aol: 'aol', yahoo: 'yahoo' };
const PHOTOS = { icloud: 'icloud photos', google: 'google photos', windows: 'windows photos' };
const VIDEO = { zoom: 'zoom', whatsapp: 'whatsapp', facebook: 'messenger', teams: 'teams' };

const BAD_EXT = /\.(exe|bat|cmd|msi|ps1|vbs|js|scr|lnk|reg|hta|jar)$/i;

function norm(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[“”"'!?,]/g, '')
    .replace(/^(please\s+)?(open|go to|start|launch|show me|show)\s+/, '')
    .replace(/^(up\s+)?(my|the)\s+/, '')
    .replace(/\s+(app|application|website|web site|site|page|program)$/, '')
    .replace(/\s+/g, ' ').trim();
}

function fromSettings(slot, settings) {
  const s = settings || {};
  if (slot === '@email') return EMAIL[s.email && s.email.provider] || null;
  if (slot === '@photos') return PHOTOS[s.photos && s.photos.provider] || null;
  if (slot === '@video') return VIDEO[s.video && s.video.provider] || null;
  return slot;
}

function lookup(key, settings) {
  if (TABLE[key]) return TABLE[key];
  if (ALIASES[key]) {
    const k = fromSettings(ALIASES[key], settings);
    return k ? TABLE[k] : null;
  }
  return null;
}

function resolve(target, settings) {
  const raw = String(target || '').trim();
  if (!raw) return null;
  if (/^https?:\/\/[^\s]+$/i.test(raw)) return U(raw, raw);
  if (/^ms-settings:[a-z0-9-]*$/i.test(raw)) return URI(raw.toLowerCase(), 'Settings');
  const k = norm(raw);
  const hit = lookup(k, settings);
  if (hit) return hit;
  // Bare domain like "amazon.com" or "www.aarp.org/path" -> https URL (never a program).
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(raw) && !BAD_EXT.test(raw.split('/')[0])) {
    return U('https://' + raw, raw);
  }
  // Longest known phrase inside the words ("my gmail inbox", "the icloud photos page").
  const keys = Object.keys(TABLE).concat(Object.keys(ALIASES)).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (new RegExp('(^|\\s)' + key.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '(\\s|$)').test(k)) {
      const r = lookup(key, settings);
      if (r) return r;
    }
  }
  return null;
}

function emailUrl(settings) {
  const k = fromSettings('@email', settings);
  return k ? TABLE[k].value : null;
}

function photosUrl(settings) {
  const k = fromSettings('@photos', settings);
  return k ? TABLE[k].value : null;
}

module.exports = { resolve, emailUrl, photosUrl, TABLE };
