// Durable facts about the person ("Uses Gmail", "Anne Marie: annemarie@example.com").
// File: JSON array of strings. Atomic write (temp file + rename).
const fs = require('fs');
const path = require('path');

const MAX_FACTS = 100;
const MAX_LEN = 300;

// "Email provider: Gmail" and "email provider: Outlook" share the key "email provider".
const keyOf = (f) => { const m = /^([^:]{2,40}):/.exec(f); return m ? m[1].trim().toLowerCase() : null; };

class Memory {
  constructor(file) {
    this.file = file;
    try {
      const d = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.facts = Array.isArray(d) ? d.filter((x) => typeof x === 'string') : [];
    } catch (_) { this.facts = []; }
  }

  all() { return this.facts.slice(); }

  add(fact) {
    const f = String(fact || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
    if (!f) return false;
    const lower = f.toLowerCase();
    if (this.facts.some((x) => x.toLowerCase() === lower)) return false;
    const k = keyOf(f);
    if (k) this.facts = this.facts.filter((x) => keyOf(x) !== k); // newer value wins
    this.facts.push(f);
    if (this.facts.length > MAX_FACTS) this.facts = this.facts.slice(-MAX_FACTS);
    this._save();
    return true;
  }

  remove(index) {
    if (!(index >= 0 && index < this.facts.length)) return false;
    this.facts.splice(index, 1);
    this._save();
    return true;
  }

  text() { return this.facts.map((f) => '- ' + f).join('\n'); }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.facts, null, 2), { flush: true }); // on disk before the rename
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Memory };
