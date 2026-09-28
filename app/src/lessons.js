// Lesson store: one JSON file per lesson in dir. Lesson = {id, title, created, utterance, mode,
// steps:[{text}], rawSteps:[{text, action, target}]}. Saving a title that already exists replaces it.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ID = /^[a-z0-9-]{1,80}$/;

class Lessons {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  _file(id) {
    if (!ID.test(String(id || ''))) return null; // ids come from the renderer: no path tricks
    return path.join(this.dir, id + '.json');
  }

  list() {
    let names = [];
    try { names = fs.readdirSync(this.dir).filter((n) => n.endsWith('.json')); } catch (_) {}
    const out = [];
    for (const n of names) {
      const l = this.get(n.slice(0, -5));
      if (l) out.push(l);
    }
    return out.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  }

  get(id) {
    const f = this._file(id);
    if (!f) return null;
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; }
  }

  save(lesson) {
    const title = String((lesson && lesson.title) || 'My lesson').trim().slice(0, 120);
    const same = this.list().find((l) => String(l.title).toLowerCase() === title.toLowerCase());
    const id = (lesson && this._file(lesson.id) && lesson.id) || (same && same.id) ||
      (title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'lesson') +
        '-' + crypto.randomBytes(3).toString('hex');
    const data = { ...lesson, id, title, created: (lesson && lesson.created) || new Date().toISOString() };
    const f = this._file(id);
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { flush: true }); // on disk before the rename
    fs.renameSync(tmp, f);
    return id;
  }

  remove(id) {
    const f = this._file(id);
    if (!f) return false;
    try { fs.unlinkSync(f); return true; } catch (_) { return false; }
  }
}

module.exports = { Lessons };
