// Onglet Équipe : sous-agents en direct (rôle, tâche, état, temps passé qui défile, dernière action).

import { h, icon, chip, clear, emptyState, fmtDuration, toDate } from '../ui.js';
import { state, on } from '../store.js';

const ROLES = {
  architecte: { label: 'Architecte', ic: 'pencil' },
  explorateur: { label: 'Explorateur', ic: 'eye' },
  implementeur: { label: 'Implémenteur', ic: 'code' },
  testeur: { label: 'Testeur', ic: 'check' },
  debogueur: { label: 'Débogueur', ic: 'alert' },
  relecteur: { label: 'Relecteur', ic: 'book' },
  optimiseur: { label: 'Optimiseur', ic: 'sparkle' }
};

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function role(r) {
  const k = sansAccents(r).replace(/[^a-z]/g, '');
  const trouve = Object.keys(ROLES).find((x) => k.startsWith(x) || k.includes(x));
  return trouve ? { cle: trouve, ...ROLES[trouve] } : { cle: 'autre', label: r || 'Sous-agent', ic: 'users' };
}

const ETATS = { running: ['En cours', 'info'], done: ['Terminé', 'success'], error: ['Erreur', 'danger'] };

export function createTeamTab(agentId = 'code') {
  const resume = h('div', { class: 'team-summary' });
  const liste = h('ol', { class: 'team-list', 'aria-label': 'Sous-agents' });
  const el = h('div', { class: 'tab-pane' }, resume, liste);
  const chronos = [];
  let tic = null;

  function rendre() {
    clear(liste); clear(resume); chronos.length = 0;
    const t = state.team.get(agentId);
    const membres = t?.members || [];
    if (!membres.length) {
      liste.append(emptyState(state.pc === 'online'
        ? 'Aucune équipe au travail. Envoie une demande à l’agent Code : architecte, explorateurs, implémenteurs, testeur et relecteur apparaîtront ici.'
        : 'PC éteint : l’équipe apparaîtra ici quand l’agent Code travaillera.', { ic: 'users' }));
      arreterTic();
      return;
    }
    const actifs = membres.filter((m) => m.state === 'running').length;
    resume.append(
      h('strong', { text: `${membres.length} sous-agent${membres.length > 1 ? 's' : ''}` }),
      chip(actifs ? `${actifs} actif${actifs > 1 ? 's' : ''}` : 'Tous terminés', actifs ? 'info' : 'success'));
    for (const m of membres) {
      const r = role(m.role);
      const [lbl, kind] = ETATS[m.state] || ['Inconnu', 'neutral'];
      const temps = h('span', { class: 'team-time', 'aria-label': 'temps passé' });
      chronos.push({ el: temps, m });
      liste.append(h('li', { class: ['team-member', `team-${m.state}`, `role-${r.cle}`] },
        h('span', { class: 'team-icon' }, icon(r.ic, 18)),
        h('div', { class: 'team-main' },
          h('div', { class: 'team-line' }, h('strong', { text: r.label }), chip(lbl, kind), temps),
          m.description ? h('p', { class: 'team-desc', text: m.description }) : null,
          m.lastAction ? h('p', { class: 'team-action' }, icon('chevron', 12), h('span', { text: m.lastAction })) : null)));
    }
    majChronos();
    if (actifs) demarrerTic(); else arreterTic();
  }

  function majChronos() {
    const now = Date.now();
    for (const { el: e, m } of chronos) {
      const debut = toDate(m.startedAt);
      const fin = m.state === 'running' ? now : (toDate(m.endedAt)?.getTime() ?? now);
      e.textContent = debut ? fmtDuration(Math.max(0, fin - debut.getTime())) : '';
    }
  }

  function demarrerTic() { if (!tic && el.isConnected && !el.closest('[hidden]')) tic = setInterval(majChronos, 1000); }
  function arreterTic() { clearInterval(tic); tic = null; }

  on('team', (d) => { if (d.agentId === agentId) rendre(); });
  on('pc', rendre);
  rendre();

  return {
    el,
    onShow() { rendre(); },
    onHide() { arreterTic(); },
    count() { return (state.team.get(agentId)?.members || []).filter((m) => m.state === 'running').length; }
  };
}
