// Settings: userData/settings.json merged over DEFAULTS. Env OPENROUTER_API_KEY overrides the key.
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { log } = require('./log');

const DEFAULTS = {
  userName: '',
  apiKey: '',
  brainModel: 'deepseek/deepseek-v4.1-flash',
  fallbackModel: '', // redundancy comes from the provider list below
  // Brain endpoints, in order: zero data retention only, Phala first (confidential-computing enclaves).
  // Never DeepSeek first-party or China-hosted endpoints (llm.js also drops those, whatever this list says).
  providers: ['phala', 'fireworks', 'together', 'baseten/fp8', 'deepinfra/fp8'],
  thinking: 'auto', // auto | always | never: how hard the brain thinks per step (agent.js effortFor)
  dockPanel: true, // the open panel docks as the right third of the screen
  allowCommands: true, // run_command (PowerShell, guarded by guardian.commandCheck)
  sttModel: 'google/gemini-3.1-flash-lite',
  jevModel: '~typesafe/jev-latest',
  voiceName: '',
  speechRate: 0.9,
  muted: false,
  autoListen: true, // the mic opens by itself after a choice/text question is said (never confirm, never muted)
  ttsStyle: 'happy', // Azure speaking style on Ethan/Harper; 'none' = plain
  textScale: 1.0,
  mode: 'do', // do (shown as "Auto", the default) | together | teach
  email: { provider: '', address: '' }, // gmail | outlook | aol | yahoo | outlook-app
  photos: { provider: '' }, // icloud | google | windows
  video: { provider: '' }, // zoom | whatsapp | facebook | teams
  contacts: [], // [{name, email, phone, relation}]
  // alertConsent: 'just_me' (nothing goes to anyone) | 'tell_family' (scam alerts to the ntfy topic).
  family: { name: '', phone: '', email: '', ntfyTopic: '', alertConsent: 'just_me', weeklyNote: false },
  tiles: ['email', 'photos', 'video', 'internet', 'family', 'lessons', 'scam', 'support', 'games'],
  city: '',
  startAtLogin: false,
  scamShield: true,
  wakeWord: false, // "Hello, Barnaby" hands-free start (offline listening; opt-in in setup)
  scamShieldOffAt: 0, // switched off in settings: keeps watching until this time (ms), then stops
  pendingFamily: [], // [{field, value, at}]: family contact/alert changes waiting their 24 h (04_safety 8.5)
  taskCostCapUsd: 0.25,
  maxSteps: 40,
  setupDone: false,
  settingsVersion: 2, // one-time moves below run only for files saved before this number
};

// Old default -> dropped on load, so the current default applies.
const RETIRED = { brainModel: 'google/gemini-3.8-flash', fallbackModel: 'qwen/qwen3.8-27b' };

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }

function merge(base, over) {
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
  }
  return out;
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// Emits 'saved' after every save (main tells the open windows; the agent's remember() saves here too).
class Config extends EventEmitter {
  constructor(dir) {
    super();
    this.file = path.join(dir, 'settings.json');
    this.backup = this.file + '.bak';
    fs.mkdirSync(dir, { recursive: true });
    let saved = {};
    this.fileOk = true; // settings.json on disk is a good copy (or absent): save() may back it up
    this.loadProblem = null; // 'backup' | 'defaults': settings.json was unreadable (main writes a diary line)
    if (fs.existsSync(this.file)) {
      try { saved = readJson(this.file); } catch (e) {
        // A power cut mid-save can leave it empty or full of NULs: never silently fall back to DEFAULTS
        // (key, family alerts, contacts). Keep the broken file for a person to look at.
        this.fileOk = false;
        log('settings.json unreadable', e.message);
        try { fs.copyFileSync(this.file, this.file + '.corrupt'); } catch (_) {}
        try { saved = readJson(this.backup); this.loadProblem = 'backup'; } catch (_) { saved = {}; this.loadProblem = 'defaults'; }
      }
    }
    // Values that were only ever our old defaults move to the new defaults (a saved file holds every key).
    for (const [k, was] of Object.entries(RETIRED)) if (saved[k] === was) delete saved[k];
    // v2: Auto is the default. Only once (a file without the number is older), so a family's later "together" stays.
    if (!saved.settingsVersion && saved.mode === 'together') delete saved.mode;
    this.data = merge(DEFAULTS, saved);
  }
  get() {
    const d = merge(this.data, {});
    if (process.env.OPENROUTER_API_KEY) d.apiKey = process.env.OPENROUTER_API_KEY;
    if (process.env.HELPER_MUTE === '1') d.muted = true;
    return d;
  }
  // Public view for renderers: never ship the key itself.
  publicView() {
    const d = this.get();
    d.hasApiKey = !!d.apiKey;
    d.apiKey = d.apiKey ? '********' : '';
    return d;
  }
  save(patch) {
    const p = { ...patch };
    if (p.apiKey === '********') delete p.apiKey; // untouched masked field
    this.data = merge(this.data, p);
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { flush: true }); // on disk before the rename
    if (this.fileOk) try { fs.copyFileSync(this.file, this.backup); } catch (_) { /* first save: nothing to back up */ }
    fs.renameSync(tmp, this.file);
    this.fileOk = true;
    this.emit('saved');
    return this.get();
  }
  // Back to DEFAULTS, keeping only the listed keys ("Delete everything" keeps the connection key).
  reset(keep = ['apiKey']) {
    const kept = {};
    for (const k of keep) if (this.data[k] !== undefined) kept[k] = this.data[k];
    this.data = JSON.parse(JSON.stringify(DEFAULTS));
    return this.save(kept);
  }
}

module.exports = { Config, DEFAULTS, merge, RETIRED };
