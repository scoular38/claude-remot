// Accueil : état du PC, quotas, prochains rappels, cartes des agents, Rappel rapide,
// validations en attente, arrêt d'urgence. Fonctionne PC éteint (Rappel rapide via le pont).

import { h, icon, button, busy, toast, confirmDialog, chip, fmtNumber, fmtRelative, fmtDateTime, fmtLocalIso, prettyJson, clear, emptyState } from '../ui.js';
import { state, on, agentById, removeValidation } from '../store.js';
import { api, pcOnline, bridgeConfigured } from '../api.js';
import { listReminders } from '../google.js';
import { openQuickReminder } from '../reminder-dialog.js';
import { ETATS } from '../chat.js';
import { loadConfig, isDemo } from '../config.js';
import { navigate } from '../router.js';

export function createHome() {
  const bandeau = h('section', { class: 'card status-card', 'aria-label': 'État' });
  const cartes = h('section', { class: 'agent-cards', 'aria-label': 'Agents' });
  const actions = h('section', { class: 'home-actions', 'aria-label': 'Actions rapides' });
  const validations = h('section', { class: 'card', 'aria-labelledby': 'h-validations' });
  const onboarding = h('section', { class: 'card onboarding', hidden: true });
  const el = h('div', { class: 'view-scroll home' },
    h('div', { class: 'home-grid' }, onboarding, bandeau, cartes, actions, validations));

  /* ---------------------------------------------------------------- bandeau d'état */

  let rappelsPont = null;   // rappels lus directement au pont quand le PC est éteint
  let rappelsErreur = null;
  let rappelsFrais = null;
  let rappelsFraisA = 0;

  function rendreBandeau() {
    clear(bandeau);
    const pc = state.pc;
    const etiquette = pc === 'online' ? 'PC en ligne' : pc === 'offline' ? 'PC éteint' : pc === 'unconfigured' ? 'PC non appairé' : 'Vérification…';
    const kind = pc === 'online' ? 'success' : pc === 'offline' ? 'danger' : 'neutral';
    const u = state.usage;
    const quota = (lbl, x) => h('div', { class: 'stat' },
      h('span', { class: 'stat-label', text: lbl }),
      h('span', { class: 'stat-value', text: x ? `${fmtNumber(x.messages ?? 0)} message${(x.messages ?? 0) > 1 ? 's' : ''}` : '–' }),
      h('span', { class: 'stat-sub', text: x ? `${fmtNumber((x.tokensIn || 0) + (x.tokensOut || 0))} jeton${(x.tokensIn || 0) + (x.tokensOut || 0) > 1 ? 's' : ''}` : (pc === 'online' ? 'aucune donnée' : 'PC éteint') }));

    // Liste relue après un ajout/une annulation (plus fraîche que le cache de /api/status), sinon celle du statut.
    if (rappelsFrais && Date.now() - rappelsFraisA > 5 * 60000) rappelsFrais = null;
    const rappels = rappelsFrais || (pc === 'online' && Array.isArray(state.nextReminders) ? state.nextReminders : rappelsPont);
    const listeRappels = h('ul', { class: 'mini-list' });
    if (Array.isArray(rappels) && rappels.length) {
      for (const r of rappels.slice(0, 3)) {
        listeRappels.append(h('li', {}, icon('bell', 14), h('span', { class: 'mini-when', text: fmtLocalIso(r.quand) }), h('span', { class: 'mini-text', text: r.message })));
      }
    } else {
      listeRappels.append(h('li', { class: 'muted', text: rappelsErreur || (Array.isArray(rappels) ? 'Aucun rappel à venir.' : (bridgeConfigured() ? 'Chargement…' : 'Pont Google non configuré.')) }));
    }

    const limite = u?.lastLimit;
    bandeau.append(
      h('div', { class: 'status-head' },
        h('div', { class: ['pc-state', `pc-${pc}`] }, h('span', { class: 'pc-dot', 'aria-hidden': 'true' }),
          h('div', {}, h('strong', { text: etiquette }),
            h('small', { class: 'muted', text: state.pcCheckedAt ? `vérifié ${fmtRelative(state.pcCheckedAt)}` : '' }))),
        chip(state.wsConnected ? 'Temps réel actif' : (pc === 'online' ? 'Connexion temps réel…' : 'Temps réel coupé'), state.wsConnected ? 'success' : 'neutral')),
      limite ? h('p', { class: 'notice notice-warning', role: 'status' }, icon('alert', 16),
        h('span', { text: `Limite Claude atteinte${limite.resetsAt ? ` — reprise ${fmtDateTime(limite.resetsAt)}` : ''}. ${limite.message || ''}` })) : '',
      h('div', { class: 'stats' }, quota('Sur 5 heures', u?.h5), quota('Sur 7 jours', u?.d7)),
      h('div', { class: 'status-reminders' }, h('h3', { class: 'section-label', text: 'Prochains rappels' }), listeRappels)
    );
  }

  async function chargerRappelsPont() {
    if (state.pc === 'online' && Array.isArray(state.nextReminders)) return;
    if (!bridgeConfigured()) { rappelsPont = null; rendreBandeau(); return; }
    try {
      const r = await listReminders();
      rappelsPont = r.items;
      rappelsErreur = null;
    } catch (e) {
      rappelsErreur = e.message;
    }
    rendreBandeau();
  }

  /* ---------------------------------------------------------------- cartes agents */

  function rendreCartes() {
    clear(cartes);
    for (const a of state.agents) {
      const etat = state.pc === 'online' ? (ETATS[a.state] ? a.state : 'idle') : 'unknown';
      const e = ETATS[etat];
      const route = a.id === 'code' ? 'code' : a.id === 'secretaire' ? 'secretaire' : a.id === 'prof' ? 'prof' : null;
      const carte = h('button', { type: 'button', class: ['agent-card', `state-${etat}`], vars: { '--agent': a.color },
        on: { click: () => route && navigate(route) }, 'aria-label': `${a.name} : ${e.label}. Ouvrir.` },
      h('span', { class: 'avatar' }, icon(a.icon === 'mail' ? 'mail' : a.icon === 'sigma' ? 'sigma' : 'code', 22)),
      h('span', { class: 'agent-card-body' }, h('span', { class: 'agent-name', text: a.name }), chip(e.label, e.kind)),
      icon('chevron', 18, { class: 'icon agent-chevron' }));
      cartes.append(carte);
    }
  }

  /* ---------------------------------------------------------------- actions */

  const btnRappel = button('Rappel rapide', { icon: 'bell', kind: 'primary', onClick: async () => {
    const r = await openQuickReminder();
    if (r) chargerRappelsPont();
  } });
  const btnUrgence = button("Arrêt d'urgence", { icon: 'stop', kind: 'danger', onClick: (e) => busy(e.currentTarget, arretUrgence) });
  actions.append(btnRappel, btnUrgence);

  async function arretUrgence() {
    const ok = await confirmDialog({
      title: "Arrêt d'urgence ?", danger: true, confirmText: 'Tout arrêter',
      message: 'Arrête immédiatement tous les agents, leurs sous-agents, les serveurs de test et les terminaux.'
    });
    if (!ok) return;
    try {
      const r = await api('/api/emergency-stop', { method: 'POST', body: {} });
      const pl = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
      toast(`Arrêt effectué : ${pl(r?.stoppedAgents ?? 0, 'agent')}, ${pl(r?.stoppedServers ?? 0, 'serveur')}, ${pl(r?.stoppedTerminals ?? 0, 'terminal')}.`.replace('terminals', 'terminaux'), 'success', 7000);
    } catch (e) { toast(e.message, 'error'); }
  }

  /* ---------------------------------------------------------------- validations */

  function lignesValidation(v) {
    const inp = v.input && typeof v.input === 'object' ? v.input : null;
    const champs = [];
    if (inp) {
      const a = inp.to ?? inp.a ?? inp.destinataire;
      const objet = inp.subject ?? inp.sujet;
      const corps = inp.body ?? inp.corps;
      const cmd = inp.command ?? inp.commande;
      const fichier = inp.file_path ?? inp.path ?? inp.chemin;
      const invites = inp.invites ?? inp.guests;
      if (a) champs.push(['À', Array.isArray(a) ? a.join(', ') : String(a)]);
      if (invites) champs.push(['Invités', Array.isArray(invites) ? invites.join(', ') : String(invites)]);
      if (objet) champs.push(['Objet', String(objet)]);
      if (cmd) champs.push(['Commande', String(cmd)]);
      if (fichier) champs.push(['Fichier', String(fichier)]);
      if (corps) champs.push(['Texte', String(corps)]);
    }
    return champs;
  }

  function carteValidation(v) {
    const agent = agentById(v.agentId);
    const champs = lignesValidation(v);
    const outil = v.kind || v.input?.tool_name || '';
    const btnOk = button('Approuver', { icon: 'check', kind: 'success' });
    const btnNon = button('Refuser', { icon: 'x', kind: 'secondary' });
    const decider = async (decision, bouton) => {
      btnOk.disabled = true; btnNon.disabled = true;
      bouton.setAttribute('aria-busy', 'true');
      try {
        await api(`/api/validations/${encodeURIComponent(v.id)}`, { method: 'POST', body: { decision } });
        removeValidation(v.id);
        toast(decision === 'approve' ? 'Approuvé.' : 'Refusé.', 'success');
      } catch (e) {
        toast(e.message, 'error');
        btnOk.disabled = false; btnNon.disabled = false;
      } finally { bouton.removeAttribute('aria-busy'); }
    };
    btnOk.addEventListener('click', () => decider('approve', btnOk));
    btnNon.addEventListener('click', () => decider('deny', btnNon));
    return h('article', { class: 'validation', vars: { '--agent': agent.color } },
      h('header', { class: 'validation-head' },
        h('span', { class: 'avatar avatar-sm' }, icon(agent.icon === 'mail' ? 'mail' : agent.icon === 'sigma' ? 'sigma' : 'code', 14)),
        h('div', {}, h('strong', { text: v.title || outil || 'Action à valider' }),
          h('small', { class: 'muted', text: `${agent.name}${outil ? ` · ${outil}` : ''} · ${fmtRelative(v.createdAt)}` }))),
      v.detail ? h('p', { class: 'validation-detail', text: String(v.detail) }) : null,
      champs.length ? h('dl', { class: 'validation-fields' }, champs.map(([k, val]) => [h('dt', { text: k }), h('dd', { text: val })])) : null,
      v.input !== undefined ? h('details', { class: 'validation-raw', open: !champs.length },
        h('summary', { text: 'Entrée complète de l’outil' }), h('pre', { text: prettyJson(v.input) })) : null,
      h('div', { class: 'validation-actions' }, btnNon, btnOk));
  }

  function rendreValidations() {
    clear(validations);
    const n = state.validations.length;
    validations.append(h('h2', { id: 'h-validations', class: 'card-title' }, icon('check', 18), `Validations en attente${n ? ` (${n})` : ''}`));
    if (state.pc !== 'online') { validations.append(emptyState('Visibles quand le PC est allumé.', { ic: 'wifiOff' })); return; }
    if (!n) { validations.append(emptyState('Rien à valider. Les agents te demanderont ici avant toute action sensible.', { ic: 'check' })); return; }
    for (const v of [...state.validations].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) validations.append(carteValidation(v));
  }

  /* ---------------------------------------------------------------- premier lancement */

  function rendreOnboarding() {
    const cfg = loadConfig();
    onboarding.hidden = !!cfg?.token || isDemo;
    if (onboarding.hidden) return;
    clear(onboarding).append(
      h('h2', { class: 'card-title' }, icon('qr', 18), 'Appaire cet appareil'),
      h('p', { text: 'Sur ton PC, ouvre le panel (http://localhost:7337), va dans Réglages et scanne le QR code avec ce téléphone. Aucun mot de passe à taper.' }),
      h('p', { class: 'muted', text: 'Tu peux aussi coller un lien d’appairage dans Réglages.' }),
      button('Ouvrir les réglages', { icon: 'sliders', onClick: () => navigate('reglages') }));
  }

  on('pc', () => { rendreBandeau(); rendreCartes(); rendreValidations(); btnUrgence.disabled = !pcOnline(); if (state.pc !== 'online') chargerRappelsPont(); });
  on('pc-check', rendreBandeau);
  on('ws-state', rendreBandeau);
  on('usage', rendreBandeau);
  on('agents', rendreCartes);
  on('validations', rendreValidations);
  on('config', rendreOnboarding);
  on('reminders-changed', async () => {
    rappelsPont = null;
    try { rappelsFrais = (await listReminders()).items; rappelsFraisA = Date.now(); rappelsErreur = null; } catch { rappelsFrais = null; chargerRappelsPont(); }
    rendreBandeau();
  });
  on('reminders', rendreBandeau);

  rendreBandeau(); rendreCartes(); rendreValidations(); rendreOnboarding();
  btnUrgence.disabled = !pcOnline();

  return {
    el,
    onShow() { rendreBandeau(); if (state.pc !== 'online') chargerRappelsPont(); }
  };
}
