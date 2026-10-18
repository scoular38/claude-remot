// Dialogue « Rappel rapide » : parle directement au pont Google (marche PC éteint).
// Heure saisie = heure de Paris. Bouton désactivé pendant l'envoi, aucun nouvel essai automatique.

import { h, icon, button, openDialog, field, toast, parisParts, pad2, fmtLocalIso } from './ui.js';
import { addReminderQuick } from './google.js';
import { bridgeConfigured, pcOnline } from './api.js';
import { emit } from './store.js';

const REPETITIONS = [
  ['aucune', 'Une seule fois'], ['quotidienne', 'Chaque jour'], ['hebdomadaire', 'Chaque semaine'], ['mensuelle', 'Chaque mois']
];

/** Ajoute n jours à une date (composantes) en restant sur le calendrier. */
function plusJours({ y, mo, d }, n) {
  const x = new Date(Date.UTC(y, mo - 1, d + n));
  return { y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate() };
}

const dateStr = ({ y, mo, d }) => `${y}-${pad2(mo)}-${pad2(d)}`;

function suggestions() {
  const p = parisParts();
  const dansUneHeure = new Date(Date.now() + 3600000);
  const q = parisParts(dansUneHeure);
  const demain = plusJours(p, 1);
  const auj = { y: p.y, mo: p.mo, d: p.d };
  const lundi = plusJours(p, ((8 - (new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay() || 7)) % 7) || 7);
  const out = [{ label: 'Dans 1 h', date: dateStr(q), heure: `${pad2(q.h)}:${pad2(q.mi)}` }];
  if (p.h < 19 || (p.h === 19 && p.mi < 50)) out.push({ label: 'Ce soir 20 h', date: dateStr(auj), heure: '20:00' });
  out.push({ label: 'Demain 9 h', date: dateStr(demain), heure: '09:00' });
  out.push({ label: 'Lundi 9 h', date: dateStr(lundi), heure: '09:00' });
  return out;
}

export function openQuickReminder({ message = '' } = {}) {
  return openDialog((dlg, close) => {
    const p = parisParts(new Date(Date.now() + 3600000));
    const zoneTexte = h('textarea', { rows: '3', required: true, maxlength: '2000', placeholder: 'Ex. : appeler le garage', value: message });
    const inDate = h('input', { type: 'date', required: true, value: dateStr(p) });
    const inHeure = h('input', { type: 'time', required: true, value: `${pad2(p.h)}:${pad2(p.mi)}`, step: '300' });
    const selRep = h('select', {}, REPETITIONS.map(([v, l]) => h('option', { value: v, text: l })));
    const apercu = h('p', { class: 'reminder-preview', 'aria-live': 'polite' });
    const erreur = h('p', { class: 'notice notice-danger', role: 'alert', hidden: true });
    const btnOk = button('Programmer', { icon: 'bell', kind: 'primary', type: 'submit' });

    const majApercu = () => {
      const q = `${inDate.value}T${inHeure.value}`;
      const rep = REPETITIONS.find(([v]) => v === selRep.value)?.[1] || '';
      apercu.textContent = inDate.value && inHeure.value
        ? `Mail le ${fmtLocalIso(q)} (heure de Paris)${selRep.value !== 'aucune' ? `, ${rep.toLowerCase()}` : ''}.` : '';
    };
    [inDate, inHeure, selRep].forEach((x) => x.addEventListener('input', majApercu));
    majApercu();

    const puces = h('div', { class: 'chips-row', role: 'group', 'aria-label': 'Raccourcis' },
      suggestions().map((s) => h('button', { type: 'button', class: 'chip-btn', on: { click: () => { inDate.value = s.date; inHeure.value = s.heure; majApercu(); } } }, s.label)));

    const via = bridgeConfigured() ? 'Envoyé directement au pont Google : marche même PC éteint.'
      : pcOnline() ? 'Pont non configuré sur cet appareil : passage par le PC.' : 'Pont Google non configuré et PC éteint.';

    const form = h('form', { class: 'dialog-form', on: { submit: async (e) => {
      e.preventDefault();
      erreur.hidden = true;
      const texte = zoneTexte.value.trim();
      if (!texte) { zoneTexte.focus(); return; }
      if (btnOk.disabled) return;
      btnOk.disabled = true;
      btnOk.setAttribute('aria-busy', 'true');
      try {
        const r = await addReminderQuick({ quand: `${inDate.value}T${inHeure.value}`, message: texte, repetition: selRep.value });
        toast(`Rappel programmé : ${r?.texte || fmtLocalIso(r?.quand || `${inDate.value}T${inHeure.value}`)}.`, 'success', 6000);
        emit('reminders-changed', null);
        close(r || true);
      } catch (err) {
        erreur.textContent = err.message;
        erreur.hidden = false;
        btnOk.disabled = false;
        btnOk.removeAttribute('aria-busy');
      }
    } } },
    h('h2', { class: 'dialog-title' }, icon('bell', 20), 'Rappel rapide'),
    field('Message', zoneTexte),
    puces,
    h('div', { class: 'field-row' }, field('Date', inDate), field('Heure (Paris)', inHeure)),
    field('Répétition', selRep),
    apercu,
    h('p', { class: 'hint', text: via }),
    erreur,
    h('div', { class: 'dialog-actions' }, button('Annuler', { onClick: () => close(null) }), btnOk));
    dlg.append(form);
    setTimeout(() => zoneTexte.focus(), 30);
  }, { label: 'Rappel rapide' });
}
