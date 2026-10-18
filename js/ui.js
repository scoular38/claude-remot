// Aides DOM : création d'éléments sans innerHTML, icônes, dialogues, notifications, formats.

/**
 * Crée un élément. attrs : class, text, on:{evt:fn}, dataset:{}, vars:{--x:val}, et attributs simples.
 * Les enfants texte deviennent des nœuds texte (jamais interprétés comme HTML).
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [evt, fn] of Object.entries(v)) el.addEventListener(evt, fn);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'vars') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected' || k === 'open') el[k] = !!v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function replaceChildren(el, ...children) { clear(el); return append(el, children); }

/* ------------------------------------------------------------------ Icônes (tracés statiques) */

const ICONES = {
  home: ['M3 11 12 3.5 21 11', 'M5.5 9.5V20h13V9.5', 'M10 20v-5.5h4V20'],
  code: ['M8.5 7 3.5 12l5 5', 'M15.5 7l5 5-5 5', 'M13.5 4.5l-3 15'],
  mail: ['M3.5 6h17v12h-17z', 'M3.5 7l8.5 6.5L20.5 7'],
  sigma: ['M18 5.5H6.5l6 6.5-6 6.5H18'],
  sliders: ['M4 6h9', 'M17 6h3', 'M4 12h3', 'M11 12h9', 'M4 18h11', 'M19 18h1', { c: [15, 6, 2] }, { c: [9, 12, 2] }, { c: [17, 18, 2] }],
  bell: ['M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z', 'M10 20.5a2 2 0 0 0 4 0'],
  stop: ['M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z', 'M9 9h6v6H9z'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4.5V11h-6.5'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'],
  expand: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  send: ['M4 12 20 4l-5 16-3.5-6.5z', 'M11.5 13.5 20 4'],
  plus: ['M12 5v14', 'M5 12h14'],
  upload: ['M12 15V4', 'M7.5 8.5 12 4l4.5 4.5', 'M4 15v5h16v-5'],
  users: [{ c: [9, 8, 3.2] }, 'M3 19.5c.8-3.3 3.2-5 6-5s5.2 1.7 6 5', { c: [17, 9, 2.4] }, 'M16.5 14.2c2.3.2 3.9 1.6 4.5 4.3'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', { c: [12, 12, 3] }],
  server: ['M4 4.5h16v6H4z', 'M4 13.5h16v6H4z', 'M7.5 7.5h.01', 'M7.5 16.5h.01'],
  diff: ['M6 3.5v11', 'M2.5 9h7', 'M14.5 6h7', 'M18 14v6.5', 'M14.5 17.5h7'],
  folder: ['M3 6.5h6.5l2 2H21v10.5H3z'],
  file: ['M6 3h8l4.5 4.5V21H6z', 'M13.5 3v5h5'],
  terminal: ['M3.5 5h17v14h-17z', 'M7 10l3 2.5L7 15', 'M12.5 15H17'],
  branch: [{ c: [6.5, 5.5, 2] }, { c: [6.5, 18.5, 2] }, { c: [17.5, 7.5, 2] }, 'M6.5 7.5v9', 'M17.5 9.5c0 4-5 4-10 7.5'],
  clock: [{ c: [12, 12, 8.5] }, 'M12 7.5V12l3 2'],
  power: ['M12 3.5v8', 'M7 6.3a7.5 7.5 0 1 0 10 0'],
  alert: ['M12 3.5 21.5 20h-19z', 'M12 10v4.5', 'M12 17.2h.01'],
  copy: ['M8.5 8.5h11v11h-11z', 'M15.5 8.5V4.5h-11v11h4'],
  qr: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h2.5v2.5H14z', 'M18 18h2v2h-2z', 'M14 19.5h1.5', 'M19.5 14v1.5'],
  play: ['M7 4.5v15l12-7.5z'],
  square: ['M6 6h12v12H6z'],
  chevron: ['M9 5.5 15.5 12 9 18.5'],
  back: ['M15 5.5 8.5 12l6.5 6.5'],
  sparkle: ['M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z', 'M18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z'],
  book: ['M4 5.5c3-1 5.5-1 8 .8 2.5-1.8 5-1.8 8-.8V19c-3-1-5.5-1-8 .8-2.5-1.8-5-1.8-8-.8z', 'M12 6.3v13.5'],
  pencil: ['M15.5 4.5l4 4L9 19H5v-4z', 'M13 7l4 4'],
  calendar: ['M4 6h16v14H4z', 'M4 10.5h16', 'M8.5 3.5v4', 'M15.5 3.5v4'],
  sun: [{ c: [12, 12, 4] }, 'M12 2.5v2', 'M12 19.5v2', 'M2.5 12h2', 'M19.5 12h2', 'M5.3 5.3l1.4 1.4', 'M17.3 17.3l1.4 1.4', 'M5.3 18.7l1.4-1.4', 'M17.3 6.7l1.4-1.4'],
  moon: ['M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z'],
  wifiOff: ['M3 3l18 18', 'M8.5 16a5 5 0 0 1 7 0', 'M5 12.5a10 10 0 0 1 5-2.6', 'M19 12.5a10 10 0 0 0-3-2', 'M12 19.5h.01'],
  list: ['M8.5 6.5h12', 'M8.5 12h12', 'M8.5 17.5h12', 'M4 6.5h.01', 'M4 12h.01', 'M4 17.5h.01'],
  trash: ['M4.5 7h15', 'M9.5 7V4.5h5V7', 'M6.5 7l1 13h9l1-13']
};

const SVG = 'http://www.w3.org/2000/svg';

export function icon(nom, taille = 20, attrs = {}) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', taille);
  svg.setAttribute('height', taille);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('icon');
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const part of ICONES[nom] || ICONES.sparkle) {
    if (typeof part === 'string') {
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', part);
      svg.append(p);
    } else if (part.c) {
      const c = document.createElementNS(SVG, 'circle');
      c.setAttribute('cx', part.c[0]); c.setAttribute('cy', part.c[1]); c.setAttribute('r', part.c[2]);
      svg.append(c);
    }
  }
  return svg;
}

/** Bouton avec icône et libellé (libellé masqué visuellement si iconOnly, gardé pour l'accessibilité). */
export function button(label, { icon: ic, kind = 'secondary', iconOnly = false, onClick, type = 'button', title, disabled, small, cls } = {}) {
  const b = h('button', {
    type, class: ['btn', `btn-${kind}`, iconOnly && 'btn-icon', small && 'btn-sm', cls],
    title: title || (iconOnly ? label : undefined), 'aria-label': iconOnly ? label : undefined,
    disabled, on: onClick ? { click: onClick } : undefined
  });
  if (ic) b.append(icon(ic, small ? 16 : 18));
  if (!iconOnly) b.append(h('span', { text: label }));
  return b;
}

/** Exécute une action asynchrone en désactivant le bouton (anti double clic). */
export async function busy(btn, fn) {
  if (btn.disabled) return undefined;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
}

/* ------------------------------------------------------------------ Notifications */

let zoneToasts = null;
export function toast(message, kind = 'info', duree = 4500) {
  if (!zoneToasts) zoneToasts = document.getElementById('toasts');
  if (!zoneToasts) return;
  const t = h('div', { class: ['toast', `toast-${kind}`], role: kind === 'error' ? 'alert' : 'status' },
    icon(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'bell', 18), h('span', { text: message }));
  zoneToasts.append(t);
  setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 300); }, duree);
}

/* ------------------------------------------------------------------ Dialogues */

/** Ouvre un <dialog> modal construit par build(dialog, close). Renvoie une promesse résolue à la fermeture. */
export function openDialog(build, { label, cls } = {}) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: ['dialog', cls], 'aria-label': label });
    let resultat;
    let fini = false;
    // Résolution directe (sans attendre l'événement « close », parfois différé quand la page n'est pas peinte).
    const terminer = () => { if (fini) return; fini = true; dlg.remove(); resolve(resultat); };
    const close = (val) => { resultat = val; if (dlg.open) dlg.close(); terminer(); };
    dlg.addEventListener('close', terminer);   // Échap
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(undefined); });
    build(dlg, close);
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function confirmDialog({ title, message, confirmText = 'Confirmer', cancelText = 'Annuler', danger = false, details }) {
  return openDialog((dlg, close) => {
    const ok = button(confirmText, { kind: danger ? 'danger' : 'primary', icon: danger ? 'alert' : 'check', onClick: () => close(true) });
    append(dlg, [
      h('h2', { class: 'dialog-title', text: title }),
      message ? h('p', { class: 'dialog-text', text: message }) : null,
      details || null,
      h('div', { class: 'dialog-actions' }, button(cancelText, { onClick: () => close(false) }), ok)
    ]);
    // Focus sur « Annuler » pour les actions dangereuses.
    setTimeout(() => (danger ? dlg.querySelector('.btn-secondary') : ok)?.focus(), 30);
  }, { label: title }).then(Boolean);
}

/* ------------------------------------------------------------------ Formats (français) */

const TZ = 'Europe/Paris';

export function parisParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'long', hourCycle: 'h23'
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, weekday: p.weekday };
}

export const pad2 = (n) => String(n).padStart(2, '0');

/** « AAAA-MM-JJTHH:MM » (heure de Paris) → texte lisible, sans conversion de fuseau. */
export function fmtLocalIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(s || ''));
  if (!m) return String(s || '');
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  const jour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
  return m[4] ? `${jour} à ${m[4]} h ${m[5]}` : jour;
}

export function fmtTime(v) {
  const d = toDate(v); if (!d) return '';
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(d);
}

export function fmtDateTime(v) {
  const d = toDate(v); if (!d) return '';
  const auj = parisParts(new Date()), j = parisParts(d);
  const memeJour = auj.y === j.y && auj.mo === j.mo && auj.d === j.d;
  if (memeJour) return `aujourd'hui ${fmtTime(d)}`;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(d);
}

export function fmtDay(v) {
  const d = toDate(v); if (!d) return '';
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(d);
}

export function fmtDuration(ms) {
  if (!(ms >= 0)) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${pad2(s % 60)} s`;
  return `${Math.floor(m / 60)} h ${pad2(m % 60)}`;
}

export function fmtRelative(v) {
  const d = toDate(v); if (!d) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 45000) return "à l'instant";
  if (diff < 3600000) return `il y a ${Math.round(diff / 60000)} min`;
  if (diff < 86400000) return `il y a ${Math.round(diff / 3600000)} h`;
  return fmtDateTime(d);
}

export function fmtNumber(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '–';
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  if (n >= 1e4) return `${Math.round(n / 1e3).toLocaleString('fr-FR')} k`;
  return n.toLocaleString('fr-FR');
}

export function fmtMoney(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '';
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

export function fmtSize(n) {
  if (typeof n !== 'number') return '';
  if (n < 1024) return `${n} o`;
  if (n < 1048576) return `${(n / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`;
  return `${(n / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

export function toDate(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : v);
  return isNaN(d.getTime()) ? null : d;
}

/** Retire les séquences ANSI (couleurs de terminal). */
export function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b\][^\u0007]*(\u0007|\u001b\\)|\u001b[()][0-9A-Za-z]|\r(?!\n)/g, '');
}

/** Bloc « état vide » ou « indisponible ». */
export function emptyState(texte, { ic = 'sparkle', action } = {}) {
  return h('div', { class: 'empty' }, icon(ic, 28), h('p', { text: texte }), action || null);
}

export function offlineState(quoi = 'Cette page') {
  return h('div', { class: 'empty empty-offline' }, icon('wifiOff', 28),
    h('p', { class: 'empty-title', text: 'PC éteint ou injoignable' }),
    h('p', { text: `${quoi} a besoin du PC. Les rappels et le brief du matin continuent de partir depuis Google.` }));
}

/** Petit badge d'état. */
export function chip(texte, kind = 'neutral', ic) {
  return h('span', { class: ['chip', `chip-${kind}`] }, ic ? icon(ic, 14) : null, h('span', { text: texte }));
}

/** Interrupteur accessible (case à cocher stylée). */
export function toggle(label, checked, onChange, { id, hint } = {}) {
  const inputId = id || `t-${Math.random().toString(36).slice(2, 9)}`;
  const input = h('input', { type: 'checkbox', role: 'switch', id: inputId, checked, class: 'switch-input',
    on: { change: (e) => onChange?.(e.target.checked) } });
  return h('label', { class: 'switch', for: inputId }, input, h('span', { class: 'switch-track', 'aria-hidden': 'true' }),
    h('span', { class: 'switch-label' }, label, hint ? h('small', { class: 'hint', text: hint }) : null));
}

/** Contrôle segmenté (radios). */
export function segmented(name, options, value, onChange, { label } = {}) {
  const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label || name });
  for (const opt of options) {
    const id = `${name}-${opt.value}-${Math.random().toString(36).slice(2, 6)}`;
    const input = h('input', { type: 'radio', name: `${name}-${group.dataset.uid || ''}`, id, value: opt.value, checked: opt.value === value,
      on: { change: () => onChange?.(opt.value) } });
    group.append(input, h('label', { for: id, title: opt.title }, opt.label));
  }
  // Nom de groupe unique pour éviter les conflits entre plusieurs instances.
  const uid = Math.random().toString(36).slice(2, 8);
  group.querySelectorAll('input').forEach((i) => { i.name = `${name}-${uid}`; });
  group.setValue = (v) => group.querySelectorAll('input').forEach((i) => { i.checked = i.value === v; });
  return group;
}

/** Champ de formulaire avec étiquette. */
export function field(label, control, hint) {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id, text: label }), control, hint ? h('small', { class: 'hint', text: hint }) : null);
}

/** Onglets accessibles (role=tablist), navigation clavier par flèches. */
export function tabs(items, { onChange, label, cls } = {}) {
  const list = h('div', { class: ['tabs', cls], role: 'tablist', 'aria-label': label });
  const buttons = new Map();
  // Ramène l'onglet dans la partie visible de la barre (sans faire défiler la page).
  const reveler = (b) => requestAnimationFrame(() => {
    if (!list.clientWidth) return;
    const g = b.offsetLeft - list.offsetLeft, d = g + b.offsetWidth;
    if (g < list.scrollLeft) list.scrollLeft = g - 8;
    else if (d > list.scrollLeft + list.clientWidth) list.scrollLeft = d - list.clientWidth + 8;
  });
  const select = (id, focus) => {
    for (const [bid, b] of buttons) {
      const on = bid === id;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
      if (on) reveler(b);
    }
    onChange?.(id);
  };
  for (const it of items) {
    const b = h('button', { type: 'button', role: 'tab', id: `tab-${it.id}`, 'aria-controls': `panel-${it.id}`, class: 'tab', 'aria-label': it.label,
      'aria-selected': 'false', tabindex: '-1', on: { click: () => select(it.id) } },
    it.icon ? icon(it.icon, 16) : null, h('span', { text: it.label }), h('span', { class: 'tab-badge', hidden: true }));
    buttons.set(it.id, b);
    list.append(b);
  }
  list.addEventListener('keydown', (e) => {
    const ids = [...buttons.keys()];
    const cur = ids.findIndex((id) => buttons.get(id) === document.activeElement);
    if (cur < 0) return;
    let next = null;
    if (e.key === 'ArrowRight') next = ids[(cur + 1) % ids.length];
    else if (e.key === 'ArrowLeft') next = ids[(cur - 1 + ids.length) % ids.length];
    else if (e.key === 'Home') next = ids[0];
    else if (e.key === 'End') next = ids[ids.length - 1];
    if (next) { e.preventDefault(); select(next, true); }
  });
  list.select = select;
  list.reveal = () => { const b = [...buttons.values()].find((x) => x.getAttribute('aria-selected') === 'true'); if (b) reveler(b); };
  list.setBadge = (id, n) => {
    const badge = buttons.get(id)?.querySelector('.tab-badge');
    if (!badge) return;
    badge.hidden = !n;
    badge.textContent = n ? String(n) : '';
  };
  list.setVisible = (id, visible) => { const b = buttons.get(id); if (b) b.hidden = !visible; };
  return list;
}

/** Échappe une valeur pour l'afficher en JSON lisible. */
export function prettyJson(v) {
  try { return typeof v === 'string' ? v : JSON.stringify(v, null, 2); } catch { return String(v); }
}

/** Copie dans le presse-papiers. */
export async function copyText(texte) {
  try { await navigator.clipboard.writeText(texte); return true; } catch { return false; }
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Valide une adresse http(s) avant de l'utiliser comme src/href. */
export function safeHttpUrl(u) {
  try {
    const url = new URL(u, location.href);
    return (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : null;
  } catch { return null; }
}
