// Barnaby icon set: simple line drawings on a 64 x 64 grid, drawn in currentColor.
// Always shown next to a word (UX rule 4). Usage: el.innerHTML = icon('email') + '<span>Email</span>'.
(function () {
  const F = 'fill="currentColor" stroke="none"';
  const I = {
    email: '<rect x="7" y="14" width="50" height="36" rx="5"/><path d="M9 17l23 18 23-18"/>',
    photos: '<rect x="7" y="11" width="50" height="42" rx="5"/><path d="M10 50l15-17 10 11 7-7 12 13"/><circle cx="44" cy="23" r="5" ' + F + '/>',
    video: '<rect x="5" y="17" width="38" height="30" rx="6"/><path d="M43 28l15-9v26l-15-9z"/>',
    internet: '<circle cx="32" cy="32" r="25"/><ellipse cx="32" cy="32" rx="11" ry="25"/><path d="M7 32h50M11 19h42M11 45h42"/>',
    family: '<circle cx="23" cy="20" r="9"/><path d="M7 55v-3a16 16 0 0 1 32 0v3"/><circle cx="46" cy="24" r="7"/><path d="M42 38a13 13 0 0 1 16 12v5"/>',
    lessons: '<path d="M32 18c-7-6-17-7-25-5v38c8-2 18-1 25 5 7-6 17-7 25-5V13c-8-2-18-1-25 5z"/><path d="M32 18v38"/>',
    scam: '<path d="M32 6l22 8v17c0 14-10 23-22 27C20 54 10 45 10 31V14z"/><path d="M26 26a6 6 0 1 1 9 5c-2 1-3 3-3 5v1"/><circle cx="32" cy="44" r="3" ' + F + '/>',
    support: '<rect x="6" y="9" width="52" height="34" rx="4"/><path d="M24 55h16M32 43v12"/><path d="M13 27h9l4-8 6 16 4-8h15"/>',
    games: '<rect x="8" y="15" width="28" height="38" rx="4" transform="rotate(-12 22 34)"/><rect x="28" y="11" width="28" height="38" rx="4" style="fill:var(--surface,#fff)" transform="rotate(8 42 30)"/><path d="M42 38l-7-7a4.5 4.5 0 0 1 7-5.5 4.5 4.5 0 0 1 7 5.5z" ' + F + '/>',
    talk: '<rect x="23" y="7" width="18" height="30" rx="9"/><path d="M14 30a18 18 0 0 0 36 0M32 48v9M23 57h18"/>',
    settings: '<path d="M8 17h48M8 32h48M8 47h48"/><circle cx="22" cy="17" r="6" ' + F + '/><circle cx="42" cy="32" r="6" ' + F + '/><circle cx="28" cy="47" r="6" ' + F + '/>',
    desktop: '<rect x="10" y="7" width="44" height="30" rx="4"/><path d="M32 41v12M25 46l7 7 7-7M6 59h52"/>',
    home: '<path d="M8 31L32 10l24 21"/><path d="M15 26v29h34V26"/><path d="M27 55V41h10v14"/>',
    back: '<path d="M40 12L20 32l20 20"/>',
    print: '<path d="M18 24V8h28v16"/><rect x="8" y="24" width="48" height="22" rx="4"/><rect x="18" y="38" width="28" height="18" style="fill:var(--surface,#fff)"/>',
    trash: '<path d="M10 16h44M26 16V9h12v7M15 16l3 40h28l3-40"/><path d="M27 26v20M37 26v20"/>',
    play: '<circle cx="32" cy="32" r="25"/><path d="M27 21l16 11-16 11z" ' + F + '/>',
    shield: '<path d="M32 6l22 8v17c0 14-10 23-22 27C20 54 10 45 10 31V14z"/><path d="M22 32l7 7 13-14"/>',
    check: '<path d="M12 33l13 13 27-28"/>',
    plus: '<path d="M32 12v40M12 32h40"/>',
    more: '<path d="M32 10v42M16 38l16 16 16-16"/>',
    up: '<path d="M32 54V12M16 26l16-16 16 16"/>',
    speaker: '<path d="M8 24h10l14-12v40L18 40H8z"/><path d="M42 22a14 14 0 0 1 0 20M48 14a24 24 0 0 1 0 36"/>',
    key: '<circle cx="20" cy="32" r="11"/><path d="M31 32h26M49 32v9M57 32v7"/>',
    bell: '<path d="M16 44V29a16 16 0 0 1 32 0v15l5 6H11z"/><path d="M26 54a6 6 0 0 0 12 0"/>',
    person: '<circle cx="32" cy="21" r="11"/><path d="M11 57v-4a21 21 0 0 1 42 0v4"/>',
    text: '<path d="M8 52L22 14l14 38M13 40h18"/><path d="M40 52l8-22 8 22M43 44h10"/>',
    think: '<path d="M14 36a14 14 0 0 1 4-24 16 16 0 0 1 28 0 14 14 0 0 1 4 24z"/><circle cx="18" cy="48" r="4"/><circle cx="10" cy="57" r="2.5" ' + F + '/><circle cx="24" cy="24" r="2.5" ' + F + '/><circle cx="32" cy="24" r="2.5" ' + F + '/><circle cx="40" cy="24" r="2.5" ' + F + '/>',
    eye: '<path d="M4 32s10-18 28-18 28 18 28 18-10 18-28 18S4 32 4 32z"/><circle cx="32" cy="32" r="8"/>',
    pointer: '<path d="M16 8l32 26-14 2 8 16-7 3-8-16-11 9z"/>',
    sun: '<circle cx="32" cy="32" r="11"/><path d="M32 6v7M32 51v7M6 32h7M51 32h7M13.6 13.6l5 5M45.4 45.4l5 5M13.6 50.4l5-5M45.4 18.6l5-5"/>',
  };
  window.Icons = I;
  window.icon = function (name, cls) {
    return '<svg class="icon' + (cls ? ' ' + cls : '') + '" viewBox="0 0 64 64" aria-hidden="true" focusable="false" fill="none" ' +
      'stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">' + (I[name] || '') + '</svg>';
  };
})();
