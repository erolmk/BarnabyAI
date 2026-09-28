// Shared page helpers for the simulated desktop: the mock Downloads folder, the mock Windows
// "Open" file picker, sent-mail recording and toasts. All state lives in localStorage so every
// mock page (same file:// origin, same in-memory session) sees the same Downloads folder.
(function () {
  const css = document.createElement('style');
  css.textContent = '[hidden]{display:none !important}';
  document.head.appendChild(css);
  const BASE_FILES = [
    { name: 'Medicare_Summary_Notice_Aug2026.pdf', type: 'PDF Document', size: '212 KB', date: '8/29/2026 10:14 AM', t: 1 },
    { name: 'church-bulletin-sept-21.pdf', type: 'PDF Document', size: '1.1 MB', date: '9/21/2026 8:02 AM', t: 2 },
    { name: 'IMG_1877.JPG', type: 'JPG File', size: '2.4 MB', date: '8/14/2026 4:40 PM', t: 3 },
  ];
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (_) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

  const SIM = {
    downloads() { return BASE_FILES.concat(read('sim_downloads', [])).sort((a, b) => b.t - a.t); },
    addDownload(f) {
      const list = read('sim_downloads', []);
      if (!list.some((x) => x.name === f.name)) list.push({ type: 'JPG File', size: '3.1 MB', date: 'Today', t: Date.now(), ...f });
      write('sim_downloads', list);
    },
    sent() { return read('sim_sent', []); },
    recordSent(mail) {
      const m = { ...mail, by: window.__actor || 'unknown', t: Date.now() };
      const list = read('sim_sent', []);
      list.push(m);
      write('sim_sent', list);
      window.__sent = list;
      return m;
    },
    toast(msg, ms) {
      let t = document.getElementById('sim-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'sim-toast';
        t.setAttribute('role', 'alert');
        t.style.cssText = 'position:fixed;left:24px;bottom:24px;background:#323232;color:#fff;padding:14px 22px;border-radius:6px;font:15px Segoe UI,Arial;z-index:9999;box-shadow:0 2px 8px #0006';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.hidden = false;
      clearTimeout(t._h);
      t._h = setTimeout(() => { t.hidden = true; }, ms || 6000);
    },
    // Mock Windows "Open" dialog listing Downloads. onPick(files[]) when the person/agent presses Open.
    openPicker(onPick) {
      if (document.getElementById('sim-picker')) return;
      const files = SIM.downloads();
      const wrap = document.createElement('div');
      wrap.id = 'sim-picker';
      wrap.style.cssText = 'position:fixed;inset:0;background:#0003;z-index:5000;font:14px Segoe UI,Arial;color:#000';
      wrap.innerHTML = `
      <div role="dialog" aria-label="Open" style="position:absolute;left:230px;top:110px;width:820px;height:540px;background:#fff;border:1px solid #888;box-shadow:0 8px 30px #0008;display:flex;flex-direction:column">
        <div style="height:34px;display:flex;align-items:center;justify-content:space-between;padding:0 0 0 12px;background:#f3f3f3;border-bottom:1px solid #ddd">
          <span>Open</span><button id="pk-x" aria-label="Close" style="width:46px;height:34px;border:0;background:none;font-size:16px">✕</button></div>
        <div style="height:40px;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid #eee;color:#333">
          <span>This PC</span><span>›</span><span>Downloads</span>
          <input aria-label="Search Downloads" placeholder="Search Downloads" style="margin-left:auto;width:220px;height:26px;border:1px solid #ccc;padding:0 6px"></div>
        <div style="flex:1;display:flex;min-height:0">
          <ul style="list-style:none;margin:0;padding:8px 0;width:170px;border-right:1px solid #eee;color:#222">
            <li style="padding:6px 16px">Desktop</li><li style="padding:6px 16px;background:#cce4f7">Downloads</li>
            <li style="padding:6px 16px">Documents</li><li style="padding:6px 16px">Pictures</li><li style="padding:6px 16px">Music</li></ul>
          <div style="flex:1;display:flex;flex-direction:column;min-width:0">
            <div style="display:flex;padding:6px 12px;color:#555;border-bottom:1px solid #eee"><span style="flex:3">Name</span><span style="flex:2">Date modified</span><span style="flex:1.3">Type</span><span style="flex:1">Size</span></div>
            <ul id="pk-list" role="listbox" aria-label="Items View" style="list-style:none;margin:0;padding:0;overflow:auto;flex:1"></ul>
          </div></div>
        <div style="padding:10px 12px;border-top:1px solid #ddd;display:flex;align-items:center;gap:10px">
          <label for="pk-name">File name:</label><input id="pk-name" aria-label="File name:" style="flex:1;height:28px;border:1px solid #999;padding:0 6px">
          <select aria-label="Files of type" style="height:30px"><option>All Files (*.*)</option></select></div>
        <div style="padding:0 12px 12px;display:flex;justify-content:flex-end;gap:10px">
          <button id="pk-open" style="width:110px;height:32px;background:#0067c0;color:#fff;border:1px solid #005a9e;border-radius:4px">Open</button>
          <button id="pk-cancel" style="width:110px;height:32px;background:#fbfbfb;border:1px solid #bbb;border-radius:4px">Cancel</button></div>
      </div>`;
      document.body.appendChild(wrap);
      document.documentElement.dataset.dialog = 'Open';
      const list = wrap.querySelector('#pk-list');
      const nameBox = wrap.querySelector('#pk-name');
      let sel = [];
      const paint = () => {
        for (const li of list.children) li.style.background = sel.includes(li.dataset.name) ? '#cce4f7' : '';
        nameBox.value = sel.length > 1 ? sel.map((n) => '"' + n + '"').join(' ') : (sel[0] || '');
      };
      for (const f of files) {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.dataset.name = f.name;
        li.setAttribute('aria-label', f.name);
        li.style.cssText = 'display:flex;padding:7px 12px;cursor:default';
        li.innerHTML = `<span style="flex:3">${/\.jpe?g$/i.test(f.name) ? '🖼️' : '📄'} ${f.name}</span><span style="flex:2;color:#555">${f.date}</span><span style="flex:1.3;color:#555">${f.type}</span><span style="flex:1;color:#555">${f.size}</span>`;
        li.addEventListener('click', (e) => {
          if (e.ctrlKey) sel = sel.includes(f.name) ? sel.filter((n) => n !== f.name) : sel.concat(f.name);
          else sel = [f.name];
          paint();
        });
        li.addEventListener('dblclick', () => { sel = [f.name]; finish(); });
        list.appendChild(li);
      }
      const close = () => { wrap.remove(); delete document.documentElement.dataset.dialog; };
      const finish = () => {
        let names = sel.slice();
        if (!names.length) names = (nameBox.value.match(/"([^"]+)"/g) || [nameBox.value]).map((s) => s.replace(/"/g, '').trim()).filter(Boolean);
        const picked = names.map((n) => files.find((f) => f.name.toLowerCase() === n.toLowerCase())).filter(Boolean);
        if (!picked.length) { if (nameBox.value.trim()) SIM.toast('Windows cannot find "' + nameBox.value + '". Check the spelling and try again.'); return; }
        close();
        onPick(picked);
      };
      nameBox.addEventListener('input', () => { sel = []; });
      nameBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(); } });
      wrap.querySelector('#pk-open').addEventListener('click', finish);
      wrap.querySelector('#pk-cancel').addEventListener('click', close);
      wrap.querySelector('#pk-x').addEventListener('click', close);
      wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
      nameBox.focus();
    },
    // Email address check like the real providers do on Send.
    badAddress(to) {
      const parts = String(to || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      if (!parts.length) return 'Please specify at least one recipient.';
      const bad = parts.find((p) => !/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(p.replace(/^.*<([^>]+)>$/, '$1')));
      return bad ? 'The address "' + bad + '" in the "To" field was not recognized. Please make sure that all addresses are properly formed.' : '';
    },
  };
  window.SIM = SIM;
  window.__sent = SIM.sent();
})();
