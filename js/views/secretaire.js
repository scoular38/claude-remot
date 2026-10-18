// Page Secrétaire : conversation + mails importants du jour, agenda de la semaine, rappels (Annuler),
// éditeur du brief du matin par jour de la semaine (actif, heure, contenu) + « Envoyer maintenant ».

import { h, icon, button, busy, chip, clear, emptyState, offlineState, toast, confirmDialog, field, toggle,
  fmtTime, fmtDay, fmtDateTime, fmtLocalIso, parisParts, pad2, toDate } from '../ui.js';
import { createChat } from '../chat.js';
import { workspace } from '../workspace.js';
import { state, on } from '../store.js';
import { searchMails, agenda, listReminders, cancelReminder, getBriefConfig, setBriefConfig, sendBriefNow } from '../google.js';
import { openQuickReminder } from '../reminder-dialog.js';

let chatRef = null;

/* ------------------------------------------------------------------ Mails */

const FILTRES = [
  { id: 'importants', label: 'Importants du jour', q: 'in:inbox newer_than:1d -category:promotions -category:social' },
  { id: 'nonlus', label: 'Non lus', q: 'is:unread in:inbox -category:promotions -category:social' },
  { id: 'attente', label: 'En attente de réponse', q: 'is:important in:inbox newer_than:7d -from:me' }
];

function createMailsTab() {
  let filtre = FILTRES[0];
  const sel = h('select', { 'aria-label': 'Filtre des mails' }, FILTRES.map((f) => h('option', { value: f.id, text: f.label })));
  const liste = h('ul', { class: 'mail-list' });
  const el = h('div', { class: 'tab-pane' },
    h('div', { class: 'pane-bar' }, sel, button('Rafraîchir', { icon: 'refresh', iconOnly: true, onClick: (e) => busy(e.currentTarget, charger) })), liste);
  sel.addEventListener('change', () => { filtre = FILTRES.find((f) => f.id === sel.value) || FILTRES[0]; charger(); });

  async function charger() {
    clear(liste);
    if (state.pc !== 'online') { liste.append(h('li', {}, offlineState('La lecture des mails'))); return; }
    liste.append(h('li', { class: 'muted', text: 'Chargement…' }));
    try {
      const mails = await searchMails(filtre.q);
      clear(liste);
      if (!mails.length) { liste.append(h('li', {}, emptyState('Aucun mail pour ce filtre.', { ic: 'mail' }))); return; }
      for (const m of mails) {
        const de = String(m.from || '').replace(/<[^>]*>/, '').replace(/"/g, '').trim() || m.from;
        liste.append(h('li', { class: ['mail', m.unread && 'mail-unread'] },
          h('div', { class: 'mail-head' }, m.unread ? h('span', { class: 'dot', 'aria-label': 'non lu' }) : null,
            h('strong', { class: 'mail-from', text: de }), h('span', { class: 'muted mail-date', text: fmtDateTime(m.date) })),
          h('div', { class: 'mail-subject', text: m.subject || '(sans objet)' }),
          m.snippet ? h('p', { class: 'mail-snippet', text: m.snippet }) : null,
          h('div', { class: 'mail-actions' },
            button('Résumer', { icon: 'sparkle', small: true, kind: 'ghost', onClick: () => demander(`Résume-moi le mail de ${de} intitulé « ${m.subject || 'sans objet'} » (id ${m.id}).`) }),
            button('Préparer une réponse', { icon: 'pencil', small: true, kind: 'ghost', onClick: () => demander(`Prépare une réponse au mail de ${de} intitulé « ${m.subject || 'sans objet'} » (fil ${m.threadId}). Montre-la-moi avant tout envoi.`) }))));
      }
    } catch (e) {
      clear(liste).append(h('li', {}, emptyState(`Mails indisponibles : ${e.message}`, { ic: 'alert' })));
    }
  }

  return { el, onShow: charger };
}

function demander(texte) {
  chatRef?.setText(texte);
  document.querySelector('#tab-secretaire-conversation')?.click();
}

/* ------------------------------------------------------------------ Agenda */

function createAgendaTab() {
  const liste = h('div', { class: 'agenda' });
  const el = h('div', { class: 'tab-pane' },
    h('div', { class: 'pane-bar' }, h('span', { class: 'section-label', text: '7 prochains jours' }),
      button('Rafraîchir', { icon: 'refresh', iconOnly: true, onClick: (e) => busy(e.currentTarget, charger) })), liste);

  async function charger() {
    clear(liste);
    if (state.pc !== 'online') { liste.append(offlineState('L’agenda')); return; }
    liste.append(h('p', { class: 'muted', text: 'Chargement…' }));
    try {
      const evs = (await agenda(7)).slice().sort((a, b) => String(a.start).localeCompare(String(b.start)));
      clear(liste);
      if (!evs.length) { liste.append(emptyState('Rien de prévu cette semaine.', { ic: 'calendar' })); return; }
      const jours = new Map();
      for (const e of evs) {
        const cle = e.allDay ? String(e.start).slice(0, 10) : (() => { const p = parisParts(toDate(e.start)); return `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`; })();
        if (!jours.has(cle)) jours.set(cle, []);
        jours.get(cle).push(e);
      }
      for (const [cle, liste2] of jours) {
        liste.append(h('section', { class: 'agenda-day' },
          h('h3', { class: 'agenda-date', text: fmtLocalIso(cle) }),
          h('ul', {}, liste2.map((e) => h('li', { class: 'agenda-event' },
            h('span', { class: 'agenda-time', text: e.allDay ? 'Journée' : `${fmtTime(e.start)}–${fmtTime(e.end)}` }),
            h('span', { class: 'agenda-title' }, h('strong', { text: e.title || '(sans titre)' }),
              e.location ? h('small', { class: 'muted', text: e.location }) : null))))));
      }
    } catch (e) {
      clear(liste).append(emptyState(`Agenda indisponible : ${e.message}`, { ic: 'alert' }));
    }
  }
  return { el, onShow: charger };
}

/* ------------------------------------------------------------------ Rappels */

const REP = { quotidienne: 'chaque jour', hebdomadaire: 'chaque semaine', mensuelle: 'chaque mois' };

function createRemindersTab() {
  const liste = h('ul', { class: 'reminder-list' });
  const note = h('p', { class: 'hint', hidden: true });
  const el = h('div', { class: 'tab-pane' },
    h('div', { class: 'pane-bar' },
      button('Nouveau rappel', { icon: 'plus', kind: 'primary', onClick: async () => { if (await openQuickReminder()) charger(); } }),
      button('Rafraîchir', { icon: 'refresh', iconOnly: true, onClick: (e) => busy(e.currentTarget, charger) })), note, liste);

  async function charger() {
    clear(liste);
    liste.append(h('li', { class: 'muted', text: 'Chargement…' }));
    try {
      const { items, via } = await listReminders();
      note.hidden = via !== 'pont';
      note.textContent = 'PC éteint : liste lue directement depuis le pont Google.';
      clear(liste);
      if (!items.length) { liste.append(h('li', {}, emptyState('Aucun rappel à venir.', { ic: 'bell' }))); return; }
      for (const r of items) {
        liste.append(h('li', { class: 'reminder' },
          h('span', { class: 'reminder-icon' }, icon('bell', 18)),
          h('div', { class: 'reminder-body' },
            h('strong', { class: 'reminder-msg', text: r.message }),
            h('small', { class: 'muted', text: fmtLocalIso(r.quand) }),
            h('div', { class: 'reminder-tags' }, r.repetition && r.repetition !== 'aucune' ? chip(REP[r.repetition] || r.repetition, 'info', 'refresh') : null,
              r.agent ? chip(r.agent, 'neutral') : null)),
          button('Annuler', { icon: 'x', small: true, kind: 'danger-ghost', onClick: (e) => busy(e.currentTarget, async () => {
            if (!(await confirmDialog({ title: 'Annuler ce rappel ?', message: `${r.message} — ${fmtLocalIso(r.quand)}`, confirmText: 'Annuler le rappel', cancelText: 'Garder', danger: true }))) return;
            try { await cancelReminder(r.id); toast('Rappel annulé.', 'success'); charger(); } catch (err) { toast(err.message, 'error'); }
          }) })));
      }
    } catch (e) {
      clear(liste).append(h('li', {}, emptyState(e.message, { ic: 'alert' })));
    }
  }
  on('reminders-changed', () => { if (el.isConnected) charger(); });
  return { el, onShow: charger };
}

/* ------------------------------------------------------------------ Brief du matin */

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const NOMS = { lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche' };
const DEFAUT = {
  jours: Object.fromEntries(JOURS.map((j) => [j, { actif: j !== 'dimanche', heure: j === 'samedi' ? '09:30' : j === 'dimanche' ? '10:00' : '07:30' }])),
  contenu: { agenda: true, joursAgenda: 1, mails: true, rappels: true },
  requeteMails: 'is:unread in:inbox -category:promotions -category:social newer_than:3d',
  maxMails: 10
};

function normaliser(c) {
  const o = JSON.parse(JSON.stringify(DEFAUT));
  if (c?.jours) for (const j of JOURS) if (c.jours[j]) o.jours[j] = { actif: c.jours[j].actif === true, heure: String(c.jours[j].heure || o.jours[j].heure) };
  if (c?.contenu) Object.assign(o.contenu, c.contenu);
  if (typeof c?.requeteMails === 'string') o.requeteMails = c.requeteMails;
  if (c?.maxMails !== undefined) o.maxMails = c.maxMails;
  return o;
}

/** Prochain envoi prévu (heure de Paris), calculé à partir de la config. */
function prochainEnvoi(cfg) {
  const p = parisParts();
  const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();   // 0 = dimanche
  const maintenant = p.h * 60 + p.mi;
  for (let i = 0; i < 8; i++) {
    const nomJour = JOURS[(dow + 6 + i) % 7];
    const j = cfg.jours[nomJour];
    if (!j?.actif) continue;
    const [hh, mm] = j.heure.split(':').map(Number);
    if (i === 0 && hh * 60 + mm <= maintenant) continue;
    return `${i === 0 ? "aujourd'hui" : i === 1 ? 'demain' : nomJour} à ${j.heure.replace(':', ' h ')}`;
  }
  return null;
}

function createBriefTab() {
  let cfg = null;
  let modifie = false;
  const corps = h('div', { class: 'brief' });
  const el = h('div', { class: 'tab-pane' }, corps);

  async function charger() {
    clear(corps);
    if (state.pc !== 'online') {
      corps.append(offlineState('L’éditeur du brief'),
        h('p', { class: 'hint', text: 'Le brief continue de partir aux heures réglées : il est envoyé par Google, même PC éteint.' }));
      return;
    }
    corps.append(h('p', { class: 'muted', text: 'Chargement de la configuration…' }));
    try {
      cfg = normaliser(await getBriefConfig());
      modifie = false;
      rendre();
    } catch (e) {
      clear(corps).append(emptyState(`Configuration du brief indisponible : ${e.message}`, { ic: 'alert' }));
    }
  }

  function rendre() {
    clear(corps);
    const etat = h('p', { class: 'brief-next', 'aria-live': 'polite' });
    const btnEnregistrer = button('Enregistrer', { icon: 'check', kind: 'primary' });
    const marquer = () => { modifie = true; majEtat(); };
    const majEtat = () => {
      const n = prochainEnvoi(cfg);
      clear(etat).append(icon('sun', 16), h('span', { text: n ? `Prochain brief : ${n}.` : 'Aucun jour actif : pas de brief.' }),
        modifie ? chip('Non enregistré', 'warning') : '');
      btnEnregistrer.disabled = !modifie;
    };

    // 7 jours × (actif, heure)
    const lignes = JOURS.map((j) => {
      const inHeure = h('input', { type: 'time', value: cfg.jours[j].heure, step: '300', disabled: !cfg.jours[j].actif,
        'aria-label': `Heure du brief le ${j}` });
      inHeure.addEventListener('input', () => { if (inHeure.value) { cfg.jours[j].heure = inHeure.value; marquer(); } });
      const t = toggle(NOMS[j], cfg.jours[j].actif, (v) => { cfg.jours[j].actif = v; inHeure.disabled = !v; marquer(); });
      return h('div', { class: ['brief-day', !cfg.jours[j].actif && 'off'] }, t, inHeure);
    });
    const grille = h('div', { class: 'brief-days', role: 'group', 'aria-label': 'Jours et heures du brief' }, lignes);

    const copierSemaine = () => {
      for (const j of ['mardi', 'mercredi', 'jeudi', 'vendredi']) cfg.jours[j] = { ...cfg.jours.lundi };
      modifie = true; rendre();
    };
    const raccourcis = h('div', { class: 'chips-row' },
      h('button', { type: 'button', class: 'chip-btn', on: { click: copierSemaine } }, 'Heure du lundi pour toute la semaine'),
      h('button', { type: 'button', class: 'chip-btn', on: { click: () => { JOURS.forEach((j) => { cfg.jours[j].actif = true; }); modifie = true; rendre(); } } }, 'Tous les jours'),
      h('button', { type: 'button', class: 'chip-btn', on: { click: () => { cfg.jours.samedi.actif = false; cfg.jours.dimanche.actif = false; modifie = true; rendre(); } } }, 'Sans le week-end'));

    // Contenu
    const c = cfg.contenu;
    const inJours = h('input', { type: 'number', min: '1', max: '14', value: String(c.joursAgenda), inputmode: 'numeric', disabled: !c.agenda });
    inJours.addEventListener('input', () => { const n = parseInt(inJours.value, 10); if (n >= 1 && n <= 14) { c.joursAgenda = n; marquer(); } });
    const inMax = h('input', { type: 'number', min: '1', max: '50', value: String(cfg.maxMails), inputmode: 'numeric', disabled: !c.mails });
    inMax.addEventListener('input', () => { const n = parseInt(inMax.value, 10); if (n >= 1 && n <= 50) { cfg.maxMails = n; marquer(); } });
    const inRequete = h('input', { type: 'text', value: cfg.requeteMails, spellcheck: 'false', disabled: !c.mails, maxlength: '500' });
    inRequete.addEventListener('input', () => { cfg.requeteMails = inRequete.value; marquer(); });

    const contenu = h('fieldset', { class: 'brief-content' }, h('legend', { text: 'Contenu du brief' }),
      h('div', { class: 'brief-opt' }, toggle('Agenda', c.agenda, (v) => { c.agenda = v; inJours.disabled = !v; marquer(); }),
        field('Nombre de jours d’agenda', inJours)),
      h('div', { class: 'brief-opt' }, toggle('Mails qui attendent', c.mails, (v) => { c.mails = v; inMax.disabled = !v; inRequete.disabled = !v; marquer(); }),
        field('Nombre maximum de mails', inMax),
        field('Recherche Gmail', inRequete, 'Même syntaxe que la recherche Gmail (ex. is:unread newer_than:3d).')),
      h('div', { class: 'brief-opt' }, toggle('Rappels des prochaines 24 h', c.rappels, (v) => { c.rappels = v; marquer(); })));

    btnEnregistrer.addEventListener('click', () => busy(btnEnregistrer, async () => {
      if (c.mails && !cfg.requeteMails.trim()) { toast('La recherche Gmail ne peut pas être vide.', 'error'); return; }
      try {
        const r = await setBriefConfig(cfg);
        if (r && r.jours) cfg = normaliser(r);
        modifie = false;
        toast('Brief enregistré.', 'success');
        rendre();
      } catch (e) { toast(e.message, 'error'); }
    }));
    const btnEnvoyer = button('Envoyer maintenant', { icon: 'send', onClick: (e) => busy(e.currentTarget, async () => {
      if (modifie && !(await confirmDialog({ title: 'Envoyer sans enregistrer ?', message: 'Le brief envoyé utilisera la dernière configuration enregistrée.', confirmText: 'Envoyer quand même' }))) return;
      try { await sendBriefNow(); toast('Brief envoyé sur ta boîte mail.', 'success'); } catch (err) { toast(err.message, 'error'); }
    }) });
    const btnAnnuler = button('Annuler les changements', { icon: 'x', kind: 'ghost', onClick: () => charger() });

    corps.append(
      h('h3', { class: 'card-title' }, icon('sun', 18), 'Brief du matin'),
      h('p', { class: 'hint', text: 'Envoyé par Google sur ta seule adresse, même PC éteint, au plus 5 minutes après l’heure choisie.' }),
      etat, grille, raccourcis, contenu,
      h('div', { class: 'form-actions' }, btnAnnuler, btnEnvoyer, btnEnregistrer));
    majEtat();
  }

  on('pc', () => { if (el.isConnected && !modifie) charger(); });
  return { el, onShow() { if (!cfg || !modifie) charger(); } };
}

/* ------------------------------------------------------------------ Page */

export function createSecretaire() {
  const chat = createChat('secretaire', {
    placeholder: 'Ex. : rappelle-moi d’appeler le garage jeudi à 9 h',
    emptyText: 'La Secrétaire lit tes mails et ton agenda, programme tes rappels, et te demande toujours avant d’écrire à quelqu’un.'
  });
  chatRef = chat;
  const ws = workspace({
    chat, store: 'secretaire', label: 'Outils de la Secrétaire',
    panels: [
      { id: 'mails', label: 'Mails', icon: 'mail', create: createMailsTab },
      { id: 'agenda', label: 'Agenda', icon: 'calendar', create: createAgendaTab },
      { id: 'rappels', label: 'Rappels', icon: 'bell', create: createRemindersTab },
      { id: 'brief', label: 'Brief', icon: 'sun', create: createBriefTab }
    ]
  });
  return { el: ws.el, onShow: () => ws.onShow() };
}
