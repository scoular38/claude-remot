// Page Prof de maths : conversation Markdown + KaTeX, chapitres et progression, mode exercice
// (la correction reste masquée tant que la réponse n'a pas été envoyée).

import { h, icon, button, busy, chip, clear, emptyState, offlineState, toast, field, segmented } from '../ui.js';
import { createChat } from '../chat.js';
import { workspace } from '../workspace.js';
import { renderMarkdown } from '../markdown.js';
import { state, on } from '../store.js';
import { api } from '../api.js';

const STATUTS = {
  acquis: ['Acquis', 'success', 1], maitrise: ['Maîtrisé', 'success', 1], termine: ['Terminé', 'success', 1], fait: ['Fait', 'success', 1],
  en_cours: ['En cours', 'info', 0.5], a_revoir: ['À revoir', 'warning', 0.25], a_voir: ['À voir', 'neutral', 0], a_faire: ['À faire', 'neutral', 0],
  commence: ['Commencé', 'info', 0.5], non_commence: ['Pas commencé', 'neutral', 0]
};
/** Statut inconnu → libellé lisible (« en_attente » → « En attente »). */
const libelleStatut = (s) => { const t = String(s || '').replace(/_/g, ' ').trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'À faire'; };
const cleStatut = (s) => String(s || 'a_faire').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s-]+/g, '_');

/** Accepte plusieurs formes de progression.json : tableau, {chapitres:[…]} ou {chapitres:{id:{…}}}. */
export function normaliserProgression(p) {
  let brut = [];
  if (Array.isArray(p)) brut = p;
  else if (Array.isArray(p?.chapitres)) brut = p.chapitres;
  else if (p?.chapitres && typeof p.chapitres === 'object') brut = Object.entries(p.chapitres).map(([id, v]) => ({ id, ...(typeof v === 'object' ? v : { statut: v }) }));
  else if (p && typeof p === 'object') brut = Object.entries(p).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v)).map(([id, v]) => ({ id, ...v }));
  return brut.map((c, i) => ({
    id: String(c.id ?? c.chapitre ?? i),
    titre: String(c.titre ?? c.title ?? c.nom ?? c.chapitre ?? c.id ?? `Chapitre ${i + 1}`),
    statut: cleStatut(c.statut ?? c.status),
    note: c.note ?? c.notes ?? '',
    maj: c.maj ?? c.updatedAt ?? c.date ?? null
  }));
}

// Mode exercice : messages dont la correction reste masquée jusqu'à l'envoi d'une réponse.
const exercice = { actif: false, avant: new Set(), verrouilles: new Set(), revelees: new Set() };
const RE_CORRECTION = /^\s*(correction|corrigé|corrige|solution|réponse attendue|reponse attendue)\b/i;

/** Masque, dans une réponse du prof, tout ce qui suit un titre « Correction / Solution ». */
function masquerCorrection(item, bulle) {
  if (item.role !== 'assistant') return;
  if (exercice.actif && !exercice.avant.has(item.key)) exercice.verrouilles.add(item.key);
  if (!exercice.verrouilles.has(item.key) || exercice.revelees.has(item.key)) return;
  const md = bulle.querySelector('.md');
  if (!md) return;
  const enfants = [...md.children];
  const i = enfants.findIndex((n) => (/^H[1-6]$/.test(n.tagName) || n.tagName === 'P' || n.tagName === 'DETAILS' || n.tagName === 'STRONG')
    && RE_CORRECTION.test(n.tagName === 'DETAILS' ? (n.querySelector('summary')?.textContent || '') : n.textContent));
  if (i < 0) return;
  const cache = h('div', { class: 'locked-correction', hidden: true });
  enfants.slice(i).forEach((n) => cache.append(n));
  const voir = button('Voir la correction quand même', { icon: 'eye', small: true, kind: 'ghost', onClick: () => { exercice.revelees.add(item.key); cache.hidden = false; verrou.remove(); } });
  const verrou = h('div', { class: 'lock-note' }, icon('pencil', 16), h('span', { text: 'Correction masquée : envoie d’abord ta réponse.' }), voir);
  md.append(verrou, cache);
}

function createChaptersTab(ctx) {
  const resume = h('div', { class: 'progress-summary' });
  const liste = h('ul', { class: 'chapters' });
  const el = h('div', { class: 'tab-pane' }, h('div', { class: 'pane-bar' }, h('span', { class: 'section-label', text: 'Ta progression' }),
    button('Rafraîchir', { icon: 'refresh', iconOnly: true, onClick: (e) => busy(e.currentTarget, charger) })), resume, liste);

  async function charger() {
    clear(liste); clear(resume);
    if (state.pc !== 'online') { liste.append(h('li', {}, offlineState('La progression'))); return; }
    try {
      const chapitres = normaliserProgression(await api('/api/prof/progress'));
      ctx.chapitres = chapitres;
      ctx.onChapitres?.();
      if (!chapitres.length) { liste.append(h('li', {}, emptyState('Aucun chapitre suivi pour l’instant. Demande au prof de commencer un chapitre.', { ic: 'book' }))); return; }
      const score = chapitres.reduce((s, c) => s + (STATUTS[c.statut]?.[2] ?? 0), 0) / chapitres.length;
      const pct = Math.round(score * 100);
      resume.append(h('div', { class: 'progress-line' }, h('strong', { text: `${pct} %` }), h('span', { class: 'muted', text: `sur ${chapitres.length} chapitre${chapitres.length > 1 ? 's' : ''}` })),
        h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Progression globale' },
          h('span', { class: 'progress-bar', vars: { '--pct': `${pct}%` } })));
      for (const c of chapitres) {
        const [lbl, kind] = STATUTS[c.statut] || [libelleStatut(c.statut), 'neutral'];
        liste.append(h('li', { class: 'chapter' },
          h('div', { class: 'chapter-head' }, h('strong', { text: c.titre }), chip(lbl, kind)),
          c.note ? h('p', { class: 'muted chapter-note', text: String(c.note) }) : null,
          h('div', { class: 'chapter-actions' },
            button('Expliquer', { icon: 'book', small: true, kind: 'ghost', onClick: () => ctx.demander(`Explique-moi le chapitre « ${c.titre} » pas à pas.`) }),
            button('S’entraîner', { icon: 'pencil', small: true, kind: 'ghost', onClick: () => ctx.exercer(c.titre) }))));
      }
    } catch (e) {
      liste.append(h('li', {}, emptyState(`Progression indisponible : ${e.message}`, { ic: 'alert' })));
    }
  }
  on('chat-done', (m) => { if (m.agentId === 'prof' && el.isConnected && !el.closest('[hidden]')) charger(); });
  return { el, onShow: charger };
}

function createExerciseTab(ctx) {
  const selChap = h('select', {});
  const selNiv = segmented('niveau', [{ value: 'facile', label: 'Facile' }, { value: 'moyen', label: 'Moyen' }, { value: 'difficile', label: 'Difficile' }], 'moyen', (v) => { niveau = v; }, { label: 'Difficulté' });
  let niveau = 'moyen';
  const inLibre = h('input', { type: 'text', placeholder: 'ou un sujet libre : intégrales par parties…', maxlength: '200' });
  const reponse = h('textarea', { rows: '6', placeholder: 'Écris ta réponse ici. Les formules entre $…$ s’affichent en direct.', 'aria-label': 'Ta réponse' });
  const apercu = h('div', { class: 'answer-preview', 'aria-live': 'off' });
  const etat = h('p', { class: 'hint' });
  const btnNouvel = button('Nouvel exercice', { icon: 'sparkle', kind: 'primary' });
  const btnRepondre = button('Envoyer ma réponse', { icon: 'send', kind: 'primary', disabled: true });

  const el = h('div', { class: 'tab-pane exercise' },
    h('p', { class: 'hint', text: 'Le prof donne l’énoncé sans la correction. Tu réponds ici, puis il corrige pas à pas.' }),
    field('Chapitre', selChap), inLibre,
    h('div', { class: 'composer-row' }, h('span', { class: 'composer-label', text: 'Difficulté' }), selNiv),
    btnNouvel, h('hr'),
    field('Ma réponse', reponse), h('div', { class: 'answer-preview-wrap' }, h('span', { class: 'section-label', text: 'Aperçu' }), apercu),
    etat, btnRepondre);

  let enCours = false;
  let tAp = null;
  reponse.addEventListener('input', () => {
    btnRepondre.disabled = !enCours || !reponse.value.trim();
    clearTimeout(tAp);
    tAp = setTimeout(() => { clear(apercu).append(renderMarkdown(reponse.value)); }, 250);
  });

  function remplirChapitres() {
    const val = selChap.value;
    clear(selChap).append(h('option', { value: '', text: '— Choisir un chapitre —' }),
      (ctx.chapitres || []).map((c) => h('option', { value: c.titre, text: c.titre })));
    selChap.value = val;
  }
  ctx.onChapitres = remplirChapitres;

  btnNouvel.addEventListener('click', () => busy(btnNouvel, async () => {
    const sujet = inLibre.value.trim() || selChap.value;
    if (!sujet) { toast('Choisis un chapitre ou écris un sujet.', 'error'); return; }
    exercice.avant = new Set((state.chats.get('prof')?.items || []).map((i) => i.key));
    exercice.actif = true;
    const ok = await ctx.envoyer(`Mode exercice : donne-moi UN exercice de niveau ${niveau} sur « ${sujet} ». Donne seulement l’énoncé, sans indice ni correction : j’enverrai ma réponse ensuite. Si tu dois préparer la correction, place-la sous un titre « Correction ».`);
    if (!ok) exercice.actif = false;
    if (ok) {
      enCours = true;
      etat.textContent = 'Énoncé demandé. Lis-le dans la conversation, puis réponds ici.';
      btnRepondre.disabled = !reponse.value.trim();
    }
  }));

  btnRepondre.addEventListener('click', () => busy(btnRepondre, async () => {
    const texte = reponse.value.trim();
    if (!texte) return;
    // Déverrouille les corrections des messages précédents.
    exercice.verrouilles.forEach((k) => exercice.revelees.add(k));
    exercice.actif = false;
    const ok = await ctx.envoyer(`Voici ma réponse à l’exercice. Corrige-la pas à pas, signale chaque erreur et vérifie les calculs :\n\n${texte}`);
    if (!ok) exercice.actif = true;
    if (ok) {
      reponse.value = '';
      clear(apercu);
      enCours = false;
      btnRepondre.disabled = true;
      etat.textContent = 'Réponse envoyée : la correction arrive dans la conversation.';
      document.querySelectorAll('.locked-correction').forEach((c) => { c.hidden = false; });
      document.querySelectorAll('.lock-note').forEach((n) => n.remove());
    }
  }));

  return { el, onShow() { remplirChapitres(); } };
}

export function createProf() {
  const ctx = { chapitres: [] };
  const chat = createChat('prof', {
    placeholder: 'Ex. : explique-moi les dérivées comme si je débutais',
    emptyText: 'Le prof explique pas à pas, vérifie chaque calcul en Python et trace les courbes. Les formules $…$ s’affichent proprement.',
    transform: masquerCorrection,
    userMarkdown: true
  });
  ctx.demander = (t) => { chat.setText(t); document.querySelector('#tab-prof-conversation')?.click(); };
  ctx.envoyer = async (t) => {
    const ok = await chat.send(t);
    if (ok) document.querySelector('#tab-prof-conversation')?.click();
    return ok;
  };
  ctx.exercer = (titre) => { ws.select('exercice'); setTimeout(() => { const s = ws.instance('exercice')?.el.querySelector('select'); if (s) { s.value = titre; } }, 0); };

  const ws = workspace({
    chat, store: 'prof', label: 'Outils du prof',
    panels: [
      { id: 'chapitres', label: 'Chapitres', icon: 'book', create: () => createChaptersTab(ctx) },
      { id: 'exercice', label: 'Exercice', icon: 'pencil', create: () => createExerciseTab(ctx) }
    ]
  });
  return { el: ws.el, onShow: () => ws.onShow() };
}
