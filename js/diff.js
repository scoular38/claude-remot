// Analyse et rendu d'un diff unifié, ligne à ligne, coloré (textContent uniquement).

import { h, icon } from './ui.js';

export function parseDiff(texte) {
  const fichiers = [];
  let f = null;
  let anc = 0, nouv = 0;
  const nouveau = (chemin) => { f = { path: chemin, lines: [], add: 0, del: 0, meta: [] }; fichiers.push(f); };
  for (const ligne of String(texte || '').split('\n')) {
    if (ligne.startsWith('diff --git ')) {
      const m = / b\/(.+)$/.exec(ligne);
      nouveau(m ? m[1] : ligne.slice(11));
      continue;
    }
    if (!f) { if (ligne.startsWith('--- ') || ligne.startsWith('@@')) nouveau('(fichier)'); else continue; }
    if (ligne.startsWith('+++ ')) { const p = ligne.slice(4).replace(/^b\//, ''); if (p !== '/dev/null' && f.path === '(fichier)') f.path = p; continue; }
    if (ligne.startsWith('--- ')) continue;
    if (ligne.startsWith('@@')) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/.exec(ligne);
      anc = m ? +m[1] : 0; nouv = m ? +m[2] : 0;
      f.lines.push({ t: 'hunk', text: ligne });
      continue;
    }
    if (!f.lines.length && !ligne.startsWith('+') && !ligne.startsWith('-') && !ligne.startsWith(' ')) { if (ligne) f.meta.push(ligne); continue; }
    if (ligne.startsWith('+')) { f.lines.push({ t: 'add', o: '', n: nouv++, text: ligne.slice(1) }); f.add++; }
    else if (ligne.startsWith('-')) { f.lines.push({ t: 'del', o: anc++, n: '', text: ligne.slice(1) }); f.del++; }
    else if (ligne.startsWith('\\')) f.lines.push({ t: 'note', text: ligne });
    else if (ligne.startsWith(' ')) { f.lines.push({ t: 'ctx', o: anc++, n: nouv++, text: ligne.slice(1) }); }
  }
  return fichiers;
}

const MAX_LIGNES = 3000;

/** Rend la liste des fichiers d'un diff. limite : nombre de lignes rendues avant « Afficher la suite ». */
export function renderDiff(texte, { limite = MAX_LIGNES } = {}) {
  const fichiers = parseDiff(texte);
  const racine = h('div', { class: 'diff' });
  if (!fichiers.length) return racine;
  let restantes = limite;
  let tronque = false;
  for (const f of fichiers) {
    const corps = h('div', { class: 'diff-body', role: 'table', 'aria-label': `Différences de ${f.path}` });
    for (const m of f.meta) corps.append(h('div', { class: 'diff-meta', text: m }));
    for (const l of f.lines) {
      if (restantes-- <= 0) { tronque = true; break; }
      if (l.t === 'hunk' || l.t === 'note') { corps.append(h('div', { class: `diff-${l.t}`, role: 'row', text: l.text })); continue; }
      corps.append(h('div', { class: ['diff-line', `diff-${l.t}`], role: 'row' },
        h('span', { class: 'ln', role: 'cell', 'aria-label': 'ancienne ligne', text: String(l.o) }),
        h('span', { class: 'ln', role: 'cell', 'aria-label': 'nouvelle ligne', text: String(l.n) }),
        h('span', { class: 'sign', role: 'cell', 'aria-hidden': 'true', text: l.t === 'add' ? '+' : l.t === 'del' ? '−' : ' ' }),
        h('span', { class: 'code', role: 'cell', text: l.text || ' ' }),
        l.t !== 'ctx' ? h('span', { class: 'sr-only', text: l.t === 'add' ? ' (ajoutée)' : ' (supprimée)' }) : null));
    }
    racine.append(h('details', { class: 'diff-file', open: true, id: `diff-${encodeURIComponent(f.path)}` },
      h('summary', {}, icon('file', 16), h('span', { class: 'diff-path', text: f.path }),
        h('span', { class: 'diff-stat' }, h('span', { class: 'add', text: `+${f.add}` }), h('span', { class: 'del', text: `−${f.del}` }))),
      corps));
    if (tronque) break;
  }
  if (tronque) racine.tronque = true;
  return racine;
}
