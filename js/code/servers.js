// Onglets Serveurs (liste, journaux en direct, Ouvrir/Redémarrer/Arrêter) et Aperçu (iframe + plein écran).

import { h, icon, button, busy, chip, clear, emptyState, offlineState, toast, fmtRelative, stripAnsi, safeHttpUrl, field, confirmDialog } from '../ui.js';
import { state, on, setServers, upsertServer, selectedProject } from '../store.js';
import { api } from '../api.js';
import { isLocalHost } from '../config.js';

const ETATS = { starting: ['Démarrage', 'warning'], running: ['En marche', 'success'], stopped: ['Arrêté', 'neutral'], error: ['Erreur', 'danger'] };

/** Adresse à ouvrir : aperçu Tailscale, ou adresse locale si le panel est ouvert sur le PC. */
export function urlServeur(s) {
  const pref = isLocalHost() ? (s.localUrl || s.previewUrl) : (s.previewUrl || null);
  return pref ? safeHttpUrl(pref) : null;
}

export async function chargerServeurs() {
  const l = await api('/api/servers');
  setServers(l);
  return l;
}

export function createServersTab({ ouvrirApercu }) {
  const liste = h('div', { class: 'server-list' });
  const journal = h('pre', { class: 'logs', role: 'log', 'aria-live': 'off', tabindex: '0', 'aria-label': 'Journal du serveur' });
  const titreJournal = h('h3', { class: 'section-label', text: 'Journal' });
  const zoneJournal = h('section', { class: 'logs-wrap', hidden: true }, h('div', { class: 'logs-head' }, titreJournal,
    button('Effacer l’affichage', { icon: 'x', kind: 'ghost', small: true, onClick: () => { journal.textContent = ''; } })), journal);
  const inCommande = h('input', { type: 'text', placeholder: 'npm run dev', autocomplete: 'off', spellcheck: 'false' });
  const inPort = h('input', { type: 'number', min: '1024', max: '65535', placeholder: '5173', inputmode: 'numeric' });
  const formNouveau = h('form', { class: 'inline-form', on: { submit: (e) => { e.preventDefault(); busy(e.submitter || formNouveau.querySelector('button'), lancer); } } },
    field('Commande', inCommande), field('Port', inPort), button('Lancer', { icon: 'play', kind: 'primary', type: 'submit' }));
  const details = h('details', { class: 'new-server' }, h('summary', { text: 'Lancer un serveur moi-même' }), formNouveau);
  const el = h('div', { class: 'tab-pane' }, liste, zoneJournal, details);
  let suivi = null;

  async function lancer() {
    const p = selectedProject();
    if (!p) { toast('Choisis d’abord un projet (onglet Projets).', 'error'); return; }
    const port = parseInt(inPort.value, 10);
    if (!inCommande.value.trim() || !(port >= 1024 && port <= 65535)) { toast('Commande et port (1024–65535) requis.', 'error'); return; }
    try {
      const s = await api('/api/servers', { method: 'POST', body: { projectId: p.id, command: inCommande.value.trim(), port } });
      if (s?.id) upsertServer(s);
      toast('Serveur lancé.', 'success');
      details.open = false;
    } catch (e) { toast(e.message, 'error'); }
  }

  async function action(s, verbe) {
    if (verbe === 'stop' && !(await confirmDialog({ title: 'Arrêter ce serveur ?', message: `${s.command} (port ${s.port})`, confirmText: 'Arrêter' }))) return;
    try {
      await api(`/api/servers/${encodeURIComponent(s.id)}/${verbe}`, { method: 'POST', body: {} });
      toast(verbe === 'stop' ? 'Serveur arrêté.' : 'Redémarrage demandé.', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function suivre(s) {
    suivi = s.id;
    zoneJournal.hidden = false;
    titreJournal.textContent = `Journal — ${s.command} (port ${s.port})`;
    journal.textContent = 'Chargement…';
    try {
      const r = await api(`/api/servers/${encodeURIComponent(s.id)}/logs`, { query: { lines: 200 } });
      if (suivi !== s.id) return;
      journal.textContent = (r?.lines || []).map(stripAnsi).join('\n');
      if (journal.textContent) journal.textContent += '\n';
    } catch (e) {
      journal.textContent = `Journal indisponible : ${e.message}\n`;
    }
    journal.scrollTop = journal.scrollHeight;
    rendre();
  }

  on('server-log', ({ id, line }) => {
    if (id !== suivi) return;
    const bas = journal.scrollHeight - journal.scrollTop - journal.clientHeight < 40;
    journal.append(document.createTextNode(`${stripAnsi(line)}\n`));
    if (journal.textContent.length > 300000) journal.textContent = journal.textContent.slice(-200000);
    if (bas) journal.scrollTop = journal.scrollHeight;
  });

  function rendre() {
    clear(liste);
    if (state.pc !== 'online') { liste.append(offlineState('La liste des serveurs')); return; }
    const serveurs = [...state.servers.values()].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    if (!serveurs.length) { liste.append(emptyState('Aucun serveur lancé. L’agent Code en démarre un quand il veut te montrer son travail.', { ic: 'server' })); return; }
    for (const s of serveurs) {
      const [lbl, kind] = ETATS[s.state] || [s.state || 'Inconnu', 'neutral'];
      const projet = state.projects.find((p) => p.id === s.projectId);
      const url = urlServeur(s);
      const actif = s.state === 'running' || s.state === 'starting';
      liste.append(h('article', { class: ['server', suivi === s.id && 'server-selected'] },
        h('div', { class: 'server-head' },
          h('div', {}, h('strong', { class: 'mono', text: s.command || 'serveur' }),
            h('small', { class: 'muted', text: `${projet ? projet.name : s.projectId || ''} · port ${s.port}${s.lastActivity ? ` · activité ${fmtRelative(s.lastActivity)}` : ''}` })),
          chip(lbl, kind)),
        h('div', { class: 'server-actions' },
          button('Ouvrir', { icon: 'external', small: true, disabled: !url || !actif, onClick: () => window.open(url, '_blank', 'noopener,noreferrer') }),
          button('Aperçu', { icon: 'eye', small: true, disabled: !url || !actif, onClick: () => ouvrirApercu(s.id) }),
          button('Journal', { icon: 'terminal', small: true, kind: suivi === s.id ? 'primary' : 'secondary', onClick: () => suivre(s) }),
          button('Redémarrer', { icon: 'refresh', small: true, onClick: (e) => busy(e.currentTarget, () => action(s, 'restart')) }),
          button('Arrêter', { icon: 'square', small: true, kind: 'danger-ghost', disabled: !actif, onClick: (e) => busy(e.currentTarget, () => action(s, 'stop')) }))));
    }
  }

  on('servers', rendre);
  on('pc', rendre);
  on('projects', rendre);

  return {
    el,
    onShow() { rendre(); if (state.pc === 'online') chargerServeurs().catch((e) => toast(e.message, 'error')); }
  };
}

export function createPreviewTab() {
  const select = h('select', { 'aria-label': 'Serveur à afficher' });
  const cadre = h('iframe', {
    class: 'preview-frame', title: 'Aperçu du site lancé',
    sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads',
    referrerpolicy: 'no-referrer', allow: 'fullscreen; clipboard-write'
  });
  const vide = h('div', { class: 'preview-empty' });
  const btnFermer = button('Quitter le plein écran', { icon: 'x', kind: 'primary', cls: 'preview-close', onClick: () => quitterPleinEcran() });
  const boite = h('div', { class: 'preview-box' }, cadre, vide, btnFermer);
  const barre = h('div', { class: 'preview-bar' }, select,
    button('Recharger', { icon: 'refresh', iconOnly: true, onClick: () => { const u = cadre.getAttribute('src'); if (u) { cadre.src = 'about:blank'; setTimeout(() => { cadre.src = u; }, 50); } } }),
    button('Ouvrir dans un onglet', { icon: 'external', iconOnly: true, onClick: () => { const u = cadre.getAttribute('src'); if (u) window.open(u, '_blank', 'noopener,noreferrer'); } }),
    button('Plein écran', { icon: 'expand', kind: 'primary', onClick: () => pleinEcran() }));
  const el = h('div', { class: 'tab-pane preview' }, barre, boite);
  let choisi = null;

  function pleinEcran() {
    if (!cadre.getAttribute('src')) return;
    if (boite.requestFullscreen && !/iPhone|iPad/.test(navigator.userAgent)) {
      boite.requestFullscreen().catch(() => boite.classList.add('pseudo-fullscreen'));
    } else {
      boite.classList.add('pseudo-fullscreen');
      btnFermer.focus();
    }
  }
  function quitterPleinEcran() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    boite.classList.remove('pseudo-fullscreen');
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && boite.classList.contains('pseudo-fullscreen')) quitterPleinEcran(); });

  function rendre() {
    const dispo = [...state.servers.values()].filter((s) => (s.state === 'running' || s.state === 'starting') && urlServeur(s));
    clear(select);
    if (!dispo.length) {
      select.append(h('option', { value: '', text: 'Aucun serveur en marche' }));
      select.disabled = true;
      cadre.removeAttribute('src');
      cadre.hidden = true;
      vide.hidden = false;
      clear(vide).append(state.pc === 'online'
        ? emptyState('Aucun site à afficher. Demande à l’agent Code de lancer ton projet, ou lance-le depuis l’onglet Serveurs.', { ic: 'eye' })
        : offlineState('L’aperçu'));
      return;
    }
    select.disabled = false;
    for (const s of dispo) select.append(h('option', { value: s.id, text: `${s.command} — port ${s.port}` }));
    if (!dispo.some((s) => s.id === choisi)) choisi = dispo[0].id;
    select.value = choisi;
    const url = urlServeur(state.servers.get(choisi));
    cadre.hidden = false;
    vide.hidden = true;
    if (url && cadre.getAttribute('src') !== url) cadre.src = url;
  }

  select.addEventListener('change', () => { choisi = select.value; rendre(); });
  on('servers', rendre);
  on('pc', rendre);

  return {
    el,
    onShow() { rendre(); },
    afficher(id) { choisi = id; rendre(); }
  };
}
