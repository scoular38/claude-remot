// Point d'entrée du Panel (PWA statique, modules ES natifs, aucune étape de build).

import { isDemo, consumePairFragment, loadConfig, saveConfig, localBootstrap, isLocalHost } from './js/config.js';
import { applyTheme } from './js/theme.js';
import { h, icon, button, toast, confirmDialog, clear } from './js/ui.js';
import { state, on, emit, applyStatus, setAgentState, setTeam, addValidation, removeValidation, setValidations,
  upsertServer, addServerLog, setSettings } from './js/store.js';
import { api, useDemo, startHealthLoop, checkHealth } from './js/api.js';
import { useDemoSocket, connect } from './js/ws.js';
import { handleChatEvent, loadHistory } from './js/chats.js';
import { currentRoute, navigate } from './js/router.js';
import { createHome } from './js/views/home.js';
import { createCode } from './js/views/code.js';
import { createSecretaire } from './js/views/secretaire.js';
import { createProf } from './js/views/prof.js';
import { createSettings } from './js/views/settings.js';

const VUES = {
  accueil: { titre: 'Accueil', creer: createHome },
  code: { titre: 'Code', creer: createCode },
  secretaire: { titre: 'Secrétaire', creer: createSecretaire },
  prof: { titre: 'Prof de maths', creer: createProf },
  reglages: { titre: 'Réglages', creer: createSettings }
};
const instances = new Map();
const banners = () => document.getElementById('banners');

/* ------------------------------------------------------------------ Appairage */

async function appairage() {
  const r = consumePairFragment();   // efface le fragment avant toute autre action
  if (!r) return;
  if (r.error) { toast(r.error, 'error', 7000); return; }
  const ancien = loadConfig();
  if (ancien?.token && (ancien.token !== r.cfg.token || (ancien.pc || '') !== (r.cfg.pc || ''))) {
    const ok = await confirmDialog({ title: 'Remplacer l’appairage ?', confirmText: 'Remplacer',
      message: `Cet appareil est déjà appairé. Le remplacer par le PC ${r.cfg.pc || '(adresse inconnue)'} ?` });
    if (!ok) return;
  }
  saveConfig(r.cfg);
  toast('Appareil appairé : bienvenue !', 'success');
  emit('config', null);
}

/* ------------------------------------------------------------------ Vues et navigation */

function afficher(route) {
  const main = document.getElementById('main');
  if (!instances.has(route)) {
    const inst = VUES[route].creer();
    const conteneur = h('section', { class: ['view', `view-${route}`], 'aria-label': VUES[route].titre, hidden: true }, inst.el);
    instances.set(route, { inst, conteneur });
    main.append(conteneur);
  }
  for (const [r, { conteneur }] of instances) conteneur.hidden = r !== route;
  document.getElementById('view-title').textContent = VUES[route].titre;
  document.title = route === 'accueil' ? 'Panel' : `${VUES[route].titre} — Panel`;
  for (const a of document.querySelectorAll('.nav-link')) {
    if (a.dataset.route === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  document.body.dataset.route = route;
  instances.get(route).inst.onShow?.();
}

/* ------------------------------------------------------------------ État du PC (pastille) */

function majPastille() {
  const p = document.getElementById('pc-pill');
  const textes = { online: 'PC en ligne', offline: 'PC éteint', unconfigured: 'Non appairé', unknown: 'Vérification…' };
  p.className = `pc-pill pc-${state.pc}`;
  p.querySelector('.pc-pill-text').textContent = textes[state.pc] || state.pc;
  p.title = state.pc === 'online' ? (state.wsConnected ? 'PC en ligne, temps réel actif' : 'PC en ligne, connexion temps réel en cours') : 'Cliquer pour vérifier maintenant';
}

/* ------------------------------------------------------------------ Bandeaux */

function bandeau(id, contenu, kind = 'info') {
  let b = document.getElementById(id);
  if (!contenu) { b?.remove(); return; }
  if (!b) { b = h('div', { id, class: ['banner', `banner-${kind}`], role: kind === 'danger' ? 'alert' : 'status' }); banners().append(b); }
  clear(b).append(...contenu);
}

function majBandeauValidations() {
  const n = state.validations.length;
  const badge = document.querySelector('.nav-link[data-route="accueil"] .nav-badge');
  badge.hidden = !n;
  badge.textContent = n ? String(n) : '';
  badge.setAttribute('aria-label', `${n} validation${n > 1 ? 's' : ''} en attente`);
  bandeau('b-validations', n && currentRoute() !== 'accueil'
    ? [icon('alert', 16), h('span', { text: `${n} action${n > 1 ? 's' : ''} attend${n > 1 ? 'ent' : ''} ta validation.` }),
      button('Voir', { small: true, kind: 'primary', onClick: () => navigate('accueil') })] : null, 'warning');
}

function bandeauAppairagePc() {
  let ferme = false;
  try { ferme = localStorage.getItem('panel.pairBannerDismissed') === '1'; } catch { /* ignoré */ }
  if (ferme || !state.bootstrap?.pairQrSvg) return;
  bandeau('b-pair', [icon('qr', 16), h('span', { text: 'Appaire ton téléphone : scanne le QR code dans Réglages (aucune saisie).' }),
    button('Afficher le QR', { small: true, kind: 'primary', onClick: () => navigate('reglages') }),
    button('Masquer', { small: true, kind: 'ghost', iconOnly: true, icon: 'x', onClick: () => {
      try { localStorage.setItem('panel.pairBannerDismissed', '1'); } catch { /* ignoré */ }
      bandeau('b-pair', null);
    } })]);
}

/* ------------------------------------------------------------------ Événements temps réel */

let dejaConnecte = false;

on('ws', (msg) => {
  switch (msg.type) {
    case 'hello':
      applyStatus(msg.status);
      rafraichirDonnees();
      if (dejaConnecte) for (const [id, c] of state.chats) if (c.loaded) loadHistory(id, { force: true }).catch(() => {});
      dejaConnecte = true;
      break;
    case 'agent.state': setAgentState(msg.agentId, msg.state); break;
    case 'chat.user': case 'chat.delta': case 'chat.message': case 'chat.tool': case 'chat.image': case 'chat.done':
      handleChatEvent(msg); break;
    case 'team.update': setTeam(msg.agentId, msg.taskId, msg.members); break;
    case 'validation.new': addValidation(msg.validation); break;
    case 'validation.resolved': removeValidation(msg.id); break;
    case 'server.update': upsertServer(msg.server); break;
    case 'server.log': addServerLog(msg.id, msg.line); break;
    case 'changes.updated': emit('changes', { projectId: msg.projectId }); break;
    case 'term.output': case 'term.exit': emit('term', msg); break;
    case 'usage.update': state.usage = msg.usage; emit('usage', msg.usage); break;
    case 'settings.update': if (msg.settings && typeof msg.settings === 'object') setSettings(msg.settings); break;   // hors contrat, émis par le serveur
    default:
  }
});

async function rafraichirDonnees() {
  if (state.pc !== 'online') return;
  try { applyStatus(await api('/api/status')); } catch { /* le bandeau reflète l'état du PC */ }
  try { setValidations(await api('/api/validations')); } catch { /* idem */ }
}

/* ------------------------------------------------------------------ Service worker */

function enregistrerSw() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const proposer = () => {
      if (!reg.waiting || !navigator.serviceWorker.controller) return;
      bandeau('b-update', [icon('refresh', 16), h('span', { text: 'Une nouvelle version du panel est prête.' }),
        button('Recharger', { small: true, kind: 'primary', onClick: () => reg.waiting?.postMessage({ type: 'skipWaiting' }) })]);
    };
    proposer();
    reg.addEventListener('updatefound', () => {
      reg.installing?.addEventListener('statechange', proposer);
    });
  }).catch(() => { /* PWA non installable ici (ex. http hors localhost) */ });
  let recharge = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!recharge) { recharge = true; location.reload(); } });
}

/* ------------------------------------------------------------------ Démarrage */

async function demarrer() {
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
  for (const s of document.querySelectorAll('.nav-icon[data-icon]')) s.append(icon(s.dataset.icon, 22));

  if (isDemo) {
    const demo = await import('./js/demo.js');
    useDemo(demo);
    useDemoSocket(demo);
    const b = document.getElementById('demo-badge');
    b.hidden = false;
    bandeau('b-demo', [icon('sparkle', 16), h('span', { text: 'Mode démo : données fictives, rien n’est envoyé ni enregistré.' })], 'warning');
  }

  await appairage();

  if (isLocalHost() && !isDemo) {
    state.bootstrap = await localBootstrap();
    emit('bootstrap', state.bootstrap);
    emit('config', null);
    bandeauAppairagePc();
  }

  on('pc', ({ etat }) => {
    majPastille();
    if (etat === 'online') rafraichirDonnees();
    bandeau('b-offline', etat === 'offline'
      ? [icon('wifiOff', 16), h('span', { text: 'PC éteint ou injoignable. Le Rappel rapide et le brief du matin fonctionnent quand même.' })]
      : etat === 'unconfigured' && !isLocalHost()
        ? [icon('qr', 16), h('span', { text: 'Appareil non appairé : scanne le QR affiché dans les Réglages du panel sur ton PC.' })] : null,
    etat === 'offline' ? 'danger' : 'info');
  });
  on('ws-state', majPastille);
  on('validations', majBandeauValidations);
  on('auth-error', () => bandeau('b-auth', [icon('alert', 16), h('span', { text: 'Jeton refusé par le PC : réappaire cet appareil (Réglages).' }),
    button('Réglages', { small: true, kind: 'primary', onClick: () => navigate('reglages') })], 'danger'));
  on('config', () => { bandeau('b-auth', null); checkHealth(); });
  document.getElementById('pc-pill').addEventListener('click', () => checkHealth());

  window.addEventListener('hashchange', () => { afficher(currentRoute()); majBandeauValidations(); });
  afficher(currentRoute());
  majPastille();
  startHealthLoop();
  if (isDemo) connect();
  enregistrerSw();
}

demarrer().catch((e) => {
  console.error(e);
  toast(`Erreur au démarrage : ${e.message}`, 'error', 10000);
});
