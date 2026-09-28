// Helper-widget window geometry (DIP), pure so it can be unit-tested without Electron.
// The launcher keeps --widget-reserve (ui/launcher.css) free in the bottom-right for the pill:
// PILL_W + MARGIN must stay inside it (test/main_logic.test.js checks this).
// collapsed "Help" pill (UX 11.2), incl. transparent margin for shadow; 212 wide so "Thinking…" fits under "Help"
const PILL_W = 248, PILL_H = 112;
const PANEL_W = 480, PANEL_H = 760, MARGIN = 16;
const DOCK_MIN = 440, DOCK_MAX = 760; // docked panel width (DIP)

// Window size. Expanded grows with the text size; an open confirm card may use up to 90% of the height.
function size(expanded, wa, { scale = 1, confirm = false } = {}) {
  if (!expanded) return { width: PILL_W, height: PILL_H };
  const s = Math.min(1.6, Math.max(1, +scale || 1));
  const maxH = wa.height - 2 * MARGIN;
  let height = Math.min(Math.round(PANEL_H * s), maxH);
  if (confirm) height = Math.max(height, Math.min(Math.round(wa.height * 0.9), maxH));
  return { width: Math.min(Math.round(PANEL_W * s), wa.width - 2 * MARGIN), height };
}

// The work-area corner the window is nearest to: 'br' | 'bl' | 'tr' | 'tl' (ties go to the bottom-right).
function nearestCorner(b, wa) {
  let best = 'br', bestD = Infinity;
  for (const c of ['br', 'bl', 'tr', 'tl']) {
    const top = c[0] === 't', left = c[1] === 'l';
    const dx = left ? b.x - wa.x : (wa.x + wa.width) - (b.x + b.width);
    const dy = top ? b.y - wa.y : (wa.y + wa.height) - (b.y + b.height);
    const d = Math.hypot(dx, dy);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

function clamp(x, y, sz, wa) {
  return {
    x: Math.round(Math.max(wa.x, Math.min(x, wa.x + wa.width - sz.width))),
    y: Math.round(Math.max(wa.y, Math.min(y, wa.y + wa.height - sz.height))),
    width: sz.width, height: sz.height,
  };
}

// Bounds of a window of size sz pinned to a work-area corner, MARGIN in from both edges.
function atCorner(sz, corner, wa) {
  const x = corner[1] === 'l' ? wa.x + MARGIN : wa.x + wa.width - MARGIN - sz.width;
  const y = corner[0] === 't' ? wa.y + MARGIN : wa.y + wa.height - MARGIN - sz.height;
  return clamp(x, y, sz, wa);
}

// Resize keeping the current window's nearest corner where it is ("Move me" to top-left -> grows down-right).
function resizeFrom(cur, sz, wa) {
  const c = nearestCorner(cur, wa);
  const x = c[1] === 'l' ? cur.x : cur.x + cur.width - sz.width;
  const y = c[0] === 't' ? cur.y : cur.y + cur.height - sz.height;
  return clamp(x, y, sz, wa);
}

// Expanded: grow/shrink from the nearest corner. Collapsed: snap the pill into the nearest screen corner.
function bounds(cur, expanded, wa, opts) {
  const sz = size(expanded, wa, opts);
  if (!cur) return atCorner(sz, 'br', wa);
  return expanded ? resizeFrom(cur, sz, wa) : atCorner(sz, nearestCorner(cur, wa), wa);
}

// Docked (settings.dockPanel): the panel is the right third of the display, full work-area height, and the program
// the person uses gets the rest. wa = the display's work area before docking; displayWidth = its full width.
// Bigger text (textScale) raises the minimum width, up to 45% of the screen, so a small laptop stays readable.
function dock(wa, displayWidth = wa.width, scale = 1) {
  const s = Math.min(1.6, Math.max(1, +scale || 1));
  const min = Math.max(DOCK_MIN, Math.min(Math.round(DOCK_MIN * s), Math.round(wa.width * 0.45)));
  const w = Math.min(wa.width, Math.round(DOCK_MAX * s), Math.max(min, Math.round(displayWidth / 3)));
  return {
    panel: { x: wa.x + wa.width - w, y: wa.y, width: w, height: wa.height },
    left: { x: wa.x, y: wa.y, width: wa.width - w, height: wa.height },
  };
}

// While docked, a window that comes to the front is fitted into the left area once when it reaches under the panel
// (a new browser window) and is not a small dialog or pop-up. Same units for both rects.
function needsFit(win, panel, minW = 400, minH = 300) {
  if (!win || win.width < minW || win.height < minH) return false;
  const overlap = Math.min(win.x + win.width, panel.x + panel.width) - Math.max(win.x, panel.x);
  const vert = Math.min(win.y + win.height, panel.y + panel.height) - Math.max(win.y, panel.y);
  return overlap > 8 && vert > 8;
}

// The ring's screen and where the ring sits in the overlay page there. The overlay covers one display and is laid out
// in that display's own DIP, so a physical rect converts with THAT display's scaleFactor, never another screen's (the
// owner's 100% screen above a 200% laptop: the label came back double size and the ring off target).
// displays: [{id, bounds (DIP), scaleFactor, phys: {x, y} (its top-left in physical px)}]; rect: physical [x, y, w, h].
// -> {display, rect: overlay-page [x, y, w, h]} for the display holding the rect's centre (else the nearest), or null.
function ringOnDisplay(displays, rect) {
  if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite)) return null;
  const [x, y, w, h] = rect, cx = x + w / 2, cy = y + h / 2;
  let d = null, best = Infinity;
  for (const e of displays || []) {
    const s = e.scaleFactor || 1, W = e.bounds.width * s, H = e.bounds.height * s;
    const dist = Math.hypot(Math.max(e.phys.x - cx, 0, cx - (e.phys.x + W)), Math.max(e.phys.y - cy, 0, cy - (e.phys.y + H)));
    if (dist < best) { d = e; best = dist; }
  }
  if (!d) return null;
  const s = d.scaleFactor || 1;
  return { display: d, rect: [Math.round((x - d.phys.x) / s), Math.round((y - d.phys.y) / s), Math.round(w / s), Math.round(h / s)] };
}

module.exports = { ringOnDisplay, PILL_W, PILL_H, PANEL_W, PANEL_H, MARGIN, DOCK_MIN, DOCK_MAX, size, nearestCorner, atCorner, resizeFrom, bounds, dock, needsFit };
