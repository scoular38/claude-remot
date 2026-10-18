// Réglages : intensité, fusion automatique, arrêt des serveurs, boucles max, modèles par rôle,
// horaires des tâches automatiques, QR d'appairage (sur le PC), adresses PC / pont, thème, journal.

import { h, icon, button, busy, clear, toast, confirmDialog, field, toggle, segmented, emptyState, offlineState, fmtDateTime, copyText, chip } from '../ui.js';
import { state, on, setSettings, emit } from '../store.js';
import { api } from '../api.js';
import { loadConfig, saveConfig, clearConfig, decodePairPayload, extractPairCode, isLocalHost, apiBase, isDemo, servedFromPc } from '../config.js';
import { applyTheme, currentTheme } from '../theme.js';

const MODELES = ['haiku', 'sonnet', 'opus'];
const ROLES_NOMS = {
  code: 'Agent Code', secretaire: 'Secrétaire', prof: 'Prof de maths', architecte: 'Architecte', explorateur: 'Explorateur',
  implementeur: 'Implémenteur', testeur: 'Testeur', debogueur: 'Débogueur', relecteur: 'Relecteur', optimiseur: 'Optimiseur'
};
const nomRole = (k) => ROLES_NOMS[k] || k.charAt(0).toUpperCase() + k.slice(1);

export function createSettings() {
  const sAgents = h('section', { class: 'card', 'aria-labelledby': 'r-agents' });
  const sAppairage = h('section', { class: 'card', 'aria-labelledby': 'r-appairage' });
  const sAdresses = h('section', { class: 'card', 'aria-labelledby': 'r-adresses' });
  const sApparence = h('section', { class: 'card', 'aria-labelledby': 'r-apparence' });
  const sJournal = h('section', { class: 'card', 'aria-labelledby': 'r-journal' });
  const el = h('div', { class: 'view-scroll settings' }, h('div', { class: 'settings-grid' }, sAgents, sAppairage, sAdresses, sApparence, sJournal));

  /* ---------------------------------------------------------------- réglages du serveur */

  let brouillon = null;
  let modifie = false;

  async function chargerReglages() {
    if (state.pc !== 'online') { rendreAgents(); return; }
    try { setSettings(await api('/api/settings')); } catch (e) { toast(e.message, 'error'); }
  }

  function rendreAgents() {
    clear(sAgents).append(h('h2', { id: 'r-agents', class: 'card-title' }, icon('sliders', 18), 'Agents et équipe'));
    if (state.pc !== 'online') { sAgents.append(offlineState('La modification des réglages')); return; }
    if (!state.settings) { sAgents.append(h('p', { class: 'muted', text: 'Chargement…' })); return; }
    if (!modifie) brouillon = JSON.parse(JSON.stringify(state.settings));
    const b = brouillon;
    const btnSave = button('Enregistrer', { icon: 'check', kind: 'primary', disabled: !modifie });
    const marquer = () => { modifie = true; btnSave.disabled = false; };

    const inServeurs = h('input', { type: 'number', min: '5', max: '1440', value: String(b.serverIdleMinutes ?? 120), inputmode: 'numeric' });
    inServeurs.addEventListener('input', () => { const n = parseInt(inServeurs.value, 10); if (n >= 5) { b.serverIdleMinutes = n; marquer(); } });
    const inBoucles = h('input', { type: 'number', min: '1', max: '10', value: String(b.maxFixLoops ?? 3), inputmode: 'numeric' });
    inBoucles.addEventListener('input', () => { const n = parseInt(inBoucles.value, 10); if (n >= 1 && n <= 10) { b.maxFixLoops = n; marquer(); } });

    sAgents.append(
      h('div', { class: 'field' }, h('span', { class: 'field-label', text: 'Intensité par défaut de l’équipe Code' }),
        segmented('defint', [{ value: 'econome', label: 'Économe' }, { value: 'normal', label: 'Normal' }, { value: 'maximum', label: 'Maximum' }],
          b.defaultIntensity || 'normal', (v) => { b.defaultIntensity = v; marquer(); }, { label: 'Intensité par défaut' }),
        h('small', { class: 'hint', text: 'Normal conseillé avec un abonnement Pro : toute la boucle sans l’optimiseur.' })),
      toggle('Fusion automatique', !!b.autoMerge, (v) => { b.autoMerge = v; marquer(); }, { hint: 'Si les tests et la relecture sont bons, l’agent fusionne seul dans main. Sinon il attend ton clic.' }),
      h('div', { class: 'field-row' },
        field('Arrêt des serveurs inactifs (minutes)', inServeurs),
        field('Boucles de correction au maximum', inBoucles)));

    // Modèles par rôle
    const modeles = b.models && typeof b.models === 'object' ? b.models : null;
    if (modeles) {
      const grille = h('div', { class: 'models-grid' });
      for (const [role, val] of Object.entries(modeles)) {
        if (typeof val !== 'string') continue;
        const options = MODELES.includes(val) ? MODELES : [...MODELES, val];
        const sel = h('select', {}, options.map((m) => h('option', { value: m, text: m.charAt(0).toUpperCase() + m.slice(1), selected: m === val })));
        sel.addEventListener('change', () => { modeles[role] = sel.value; marquer(); });
        grille.append(field(nomRole(role), sel));
      }
      sAgents.append(h('h3', { class: 'section-label', text: 'Modèles par rôle' }),
        h('p', { class: 'hint', text: 'Opus consomme beaucoup plus de quota : à réserver au plan et à la relecture si besoin.' }), grille);
    }

    // Tâches automatiques
    const sched = b.schedules;
    const entrees = Array.isArray(sched) ? sched.map((s, i) => [s.id || String(i), s]) : (sched && typeof sched === 'object' ? Object.entries(sched) : []);
    if (entrees.length) {
      const liste = h('div', { class: 'schedules' });
      for (const [id, s] of entrees) {
        if (!s || typeof s !== 'object') continue;
        const inCron = h('input', { type: 'text', value: s.cron || '', spellcheck: 'false', 'aria-label': `Horaire de ${id}`, placeholder: 'tous les jours 18:00' });
        inCron.addEventListener('input', () => { s.cron = inCron.value; marquer(); });
        liste.append(h('div', { class: 'schedule' },
          toggle(s.label || s.nom || id, s.enabled !== false, (v) => { s.enabled = v; marquer(); }, { hint: s.agent ? `Agent : ${s.agent}` : undefined }),
          inCron));
      }
      sAgents.append(h('h3', { class: 'section-label', text: 'Tâches automatiques' }),
        h('p', { class: 'hint', text: 'Format : « dimanche 20:00 », « tous les jours 18:00 ». Rattrapées au démarrage du PC si manquées.' }), liste);
    }

    btnSave.addEventListener('click', () => busy(btnSave, async () => {
      try {
        const r = await api('/api/settings', { method: 'PUT', body: brouillon });
        modifie = false;
        setSettings(r && typeof r === 'object' && !Array.isArray(r) ? r : brouillon);
        toast('Réglages enregistrés.', 'success');
      } catch (e) { toast(e.message, 'error'); }
    }));
    sAgents.append(h('div', { class: 'form-actions' },
      button('Annuler', { kind: 'ghost', onClick: () => { modifie = false; rendreAgents(); } }), btnSave));
  }

  /* ---------------------------------------------------------------- appairage */

  function rendreAppairage() {
    clear(sAppairage).append(h('h2', { id: 'r-appairage', class: 'card-title' }, icon('qr', 18), 'Appairer un téléphone'));
    const bs = state.bootstrap;
    if (isLocalHost() && bs?.pairQrSvg) {
      const img = h('img', { class: 'qr', alt: 'QR code d’appairage', src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(bs.pairQrSvg)}` });
      sAppairage.append(
        h('p', { text: 'Scanne ce QR code avec l’appareil photo du téléphone : le panel s’ouvre déjà configuré, sans rien taper.' }),
        h('div', { class: 'qr-wrap' }, img),
        h('p', { class: 'hint', text: 'Ce QR contient la clé d’accès au panel : ne le partage avec personne.' }),
        bs.pairUrl ? button('Copier le lien d’appairage', { icon: 'copy', onClick: async () => toast(await copyText(bs.pairUrl) ? 'Lien copié (ne le partage pas).' : 'Copie impossible.', 'info') }) : '');
      if (!bs.tsUrl) sAppairage.append(h('p', { class: 'notice notice-warning' }, icon('alert', 16), h('span', { text: 'Tailscale n’est pas connecté sur le PC : le téléphone ne pourra joindre le PC qu’une fois Tailscale actif (le Rappel rapide marche quand même).' })));
      return;
    }
    if (isLocalHost()) {
      sAppairage.append(h('p', { class: 'muted', text: 'QR indisponible : le serveur du panel ne répond pas sur ce PC.' }));
      return;
    }
    const cfg = loadConfig();
    sAppairage.append(h('p', { text: cfg?.token ? 'Cet appareil est appairé.' : 'Cet appareil n’est pas encore appairé. Sur le PC, ouvre http://localhost:7337 → Réglages et scanne le QR.' }));
    if (cfg?.pairedAt) sAppairage.append(h('p', { class: 'hint', text: `Appairé ${fmtDateTime(cfg.pairedAt)}.` }));

    const inLien = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://…#pair=…' });
    const form = h('form', { class: 'inline-form', on: { submit: async (e) => {
      e.preventDefault();
      try {
        const nouv = decodePairPayload(extractPairCode(inLien.value));
        if (cfg?.token && !(await confirmDialog({ title: 'Remplacer l’appairage ?', message: `Nouveau PC : ${nouv.pc || '(adresse inconnue)'}`, confirmText: 'Remplacer' }))) return;
        saveConfig(nouv);
        inLien.value = '';
        toast('Appareil appairé.', 'success');
        emit('config', null);
      } catch (err) { toast(err.message, 'error'); }
    } } }, field('Coller un lien d’appairage', inLien), button('Appairer', { icon: 'check', kind: 'primary', type: 'submit' }));
    sAppairage.append(form);
    if (cfg?.token && !isDemo) {
      sAppairage.append(button('Oublier cet appareil', { icon: 'trash', kind: 'danger-ghost', onClick: async () => {
        if (!(await confirmDialog({ title: 'Oublier cet appareil ?', danger: true, confirmText: 'Oublier',
          message: 'Le jeton et le secret des rappels sont effacés de ce navigateur. Il faudra rescanner le QR.' }))) return;
        clearConfig();
        location.reload();
      } }));
    }
  }

  /* ---------------------------------------------------------------- adresses */

  function rendreAdresses() {
    clear(sAdresses).append(h('h2', { id: 'r-adresses', class: 'card-title' }, icon('server', 18), 'Adresses'));
    const cfg = loadConfig();
    const bs = state.bootstrap;
    const court = (u) => { try { const x = new URL(u); return x.pathname.length > 24 ? `${x.host}${x.pathname.slice(0, 16)}…${x.pathname.slice(-6)}` : `${x.host}${x.pathname}`; } catch { return u; } };
    const lignes = [
      ['PC (API)', apiBase(cfg) || 'inconnue', state.pc === 'online' ? chip('en ligne', 'success') : chip(state.pc === 'offline' ? 'éteint' : 'inconnu', 'neutral')],
      ['Servi depuis', servedFromPc(cfg) ? 'le PC' : location.host, null],
      ['Pont Google (Rappel rapide)', cfg?.bridge ? court(cfg.bridge) : 'adresse inconnue',
        cfg?.bridge && cfg?.rs ? chip('Rappel rapide prêt', 'success')
          : cfg?.bridge ? chip('secret des rappels manquant : réappaire', 'warning')
            : chip('pont pas encore déployé ou appareil à réappairer', 'warning')]
    ];
    if (bs?.tsUrl) lignes.push(['Tailscale', bs.tsUrl, null]);
    if (bs?.siteUrl) lignes.push(['Site public', bs.siteUrl, null]);
    sAdresses.append(h('dl', { class: 'kv' }, lignes.map(([k, v, c]) => [h('dt', { text: k }), h('dd', {}, h('span', { class: 'mono', text: v }), c)])));
  }

  /* ---------------------------------------------------------------- apparence */

  function rendreApparence() {
    clear(sApparence).append(h('h2', { id: 'r-apparence', class: 'card-title' }, icon('sun', 18), 'Apparence et application'),
      h('div', { class: 'field' }, h('span', { class: 'field-label', text: 'Thème' }),
        segmented('theme', [{ value: 'auto', label: 'Automatique' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }],
          currentTheme(), (v) => applyTheme(v), { label: 'Thème' })),
      h('div', { class: 'form-actions' },
        button('Vérifier les mises à jour', { icon: 'refresh', onClick: async (e) => busy(e.currentTarget, async () => {
          const reg = await navigator.serviceWorker?.getRegistration?.();
          if (!reg) { toast('Application non installée (service worker absent).', 'info'); return; }
          await reg.update().catch(() => {});
          toast(reg.waiting ? 'Nouvelle version prête : recharge la page.' : 'Application à jour.', 'info');
        }) })));
  }

  /* ---------------------------------------------------------------- journal */

  async function rendreJournal() {
    clear(sJournal).append(h('h2', { id: 'r-journal', class: 'card-title' }, icon('list', 18), 'Journal des actions'));
    if (state.pc !== 'online') { sJournal.append(offlineState('Le journal')); return; }
    const liste = h('ol', { class: 'journal' });
    const btn = button('Charger les 200 dernières actions', { icon: 'refresh', onClick: (e) => busy(e.currentTarget, async () => {
      try {
        const d = await api('/api/journal', { query: { limit: 200 } });
        const lignes = Array.isArray(d) ? d : Array.isArray(d?.lines) ? d.lines : Array.isArray(d?.entries) ? d.entries : [];
        clear(liste);
        if (!lignes.length) { liste.append(h('li', {}, emptyState('Journal vide.', { ic: 'list' }))); return; }
        for (const l of lignes.slice().reverse()) {
          const o = typeof l === 'string' ? (() => { try { return JSON.parse(l); } catch { return { text: l }; } })() : l;
          const resume = o.summary || o.message || o.text || o.detail || JSON.stringify(o);
          liste.append(h('li', {}, h('span', { class: 'journal-time muted', text: fmtDateTime(o.ts || o.time || o.date) }),
            o.agentId || o.agent ? h('span', { class: 'chip chip-neutral', text: o.agentId || o.agent }) : null,
            o.type || o.kind ? h('strong', { text: o.type || o.kind }) : null,
            h('span', { class: 'journal-text', text: String(resume).slice(0, 400) })));
        }
      } catch (err) { toast(err.message, 'error'); }
    }) });
    sJournal.append(btn, liste);
  }

  on('settings', () => { if (!modifie) rendreAgents(); });
  on('pc', () => { rendreAgents(); rendreAdresses(); rendreJournal(); if (state.pc === 'online' && !state.settings) chargerReglages(); });
  on('config', () => { rendreAppairage(); rendreAdresses(); });
  on('bootstrap', () => { rendreAppairage(); rendreAdresses(); });

  rendreAgents(); rendreAppairage(); rendreAdresses(); rendreApparence(); rendreJournal();

  return {
    el,
    onShow() { if (!modifie) chargerReglages(); rendreAppairage(); rendreAdresses(); }
  };
}
