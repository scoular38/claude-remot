// Composant conversation réutilisé par les trois agents.

import { h, icon, button, busy, toast, confirmDialog, segmented, chip, fmtTime, fmtDuration, fmtMoney, clear, emptyState } from './ui.js';
import { renderMarkdown } from './markdown.js';
import { api, authBlobUrl } from './api.js';
import { state, on, agentById, selectedProject, setProjects } from './store.js';
import { chatOf, loadHistory, addPendingUser, updateItem, removeItem } from './chats.js';

export const ETATS = {
  idle: { label: 'Disponible', kind: 'success' },
  working: { label: 'Au travail', kind: 'info' },
  waiting: { label: 'Attend ta validation', kind: 'warning' },
  error: { label: 'Erreur', kind: 'danger' },
  unknown: { label: 'Hors ligne', kind: 'neutral' }
};

const INTENSITES = [
  { value: 'econome', label: 'Économe', title: 'Architecte, un implémenteur, testeur : petites corrections' },
  { value: 'normal', label: 'Normal', title: 'Toute la boucle, sans l’optimiseur' },
  { value: 'maximum', label: 'Maximum', title: 'Toute l’équipe, implémenteurs en parallèle, optimiseur' }
];

const tactile = () => window.matchMedia('(pointer: coarse)').matches;

/**
 * opts : intensity (bool), placeholder, emptyText, transform(item, bubbleEl), headerExtra (Node), project (bool)
 */
export function createChat(agentId, opts = {}) {
  const agent = () => agentById(agentId);
  const elements = new Map();
  let intensite = state.settings?.defaultIntensity || 'normal';
  let intensiteTouchee = false;

  const etatChip = h('span', { class: 'chat-state' });
  const projetChip = opts.project ? h('span', { class: 'chat-project' }) : null;
  const btnStop = button("Arrêter l'agent", { icon: 'square', kind: 'ghost', small: true, onClick: (e) => busy(e.currentTarget, arreter) });
  const btnNouvelle = button('Nouvelle conversation', { icon: 'plus', kind: 'ghost', small: true, iconOnly: true, onClick: (e) => busy(e.currentTarget, nouvelle) });
  const avatar = h('span', { class: 'avatar avatar-sm', vars: { '--agent': agent().color } }, icon(agent().icon === 'mail' ? 'mail' : agent().icon === 'sigma' ? 'sigma' : 'code', 16));
  const titre = h('h2', { class: 'chat-title', text: opts.title || agent().name });
  const head = h('header', { class: 'chat-head' },
    h('div', { class: 'chat-id' }, avatar, h('div', {}, titre, h('div', { class: 'chat-sub' }, etatChip, projetChip))),
    h('div', { class: 'chat-actions' }, opts.headerExtra || null, btnStop, btnNouvelle));

  const log = h('div', { class: 'chat-log', role: 'log', 'aria-label': `Conversation avec ${agent().name}`, 'aria-live': 'off', tabindex: '0' });
  const annonce = h('div', { class: 'sr-only', 'aria-live': 'polite' });

  const textarea = h('textarea', {
    class: 'chat-textarea', rows: '1', placeholder: opts.placeholder || `Écris à ${agent().name}…`,
    'aria-label': `Message pour ${agent().name}`, maxlength: '20000'
  });
  const btnEnvoyer = button('Envoyer', { icon: 'send', kind: 'primary', iconOnly: true, type: 'submit' });
  const segInt = opts.intensity ? segmented('intensite', INTENSITES, intensite, (v) => { intensite = v; intensiteTouchee = true; }, { label: 'Intensité de l’équipe' }) : null;
  const noteHorsLigne = h('p', { class: 'chat-offline', hidden: true }, icon('wifiOff', 16), h('span', { text: 'PC éteint : cet agent est indisponible pour l’instant.' }));
  const erreurEnvoi = h('p', { class: 'notice notice-danger composer-error', role: 'alert', hidden: true });
  const form = h('form', { class: 'chat-composer', on: { submit: (e) => { e.preventDefault(); envoyer(); } } },
    segInt ? h('div', { class: 'composer-row' }, h('span', { class: 'composer-label', text: 'Intensité' }), segInt) : null,
    noteHorsLigne,
    erreurEnvoi, h('div', { class: 'composer-input' }, textarea, btnEnvoyer));

  const el = h('section', { class: 'chat', 'aria-label': `Conversation ${agent().name}`, vars: { '--agent': agent().color } }, head, log, annonce, form);

  textarea.addEventListener('input', autoTaille);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !tactile()) { e.preventDefault(); envoyer(); }
  });

  function autoTaille() {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }

  /* ---------------------------------------------------------------- rendu */

  const presDuBas = () => log.scrollHeight - log.scrollTop - log.clientHeight < 120;
  const versLeBas = () => { log.scrollTop = log.scrollHeight; };

  function rendreItem(item) {
    let node;
    if (item.kind === 'msg') {
      const bulle = h('div', { class: 'bubble' });
      node = h('article', { class: ['msg', `msg-${item.role}`, item.pending && 'msg-pending', item.streaming && 'msg-streaming'] },
        bulle, h('div', { class: 'msg-meta' }, item.pending ? 'envoi…' : fmtTime(item.ts)));
      remplirBulle(item, bulle);
    } else if (item.kind === 'tool') {
      node = h('div', { class: 'msg-tool' }, icon('sparkle', 14), h('span', { class: 'tool-name', text: item.name }),
        item.summary ? h('span', { class: 'tool-summary', text: item.summary }) : null);
    } else if (item.kind === 'image') {
      const img = h('img', { alt: item.caption || 'Image envoyée par l’agent', class: 'msg-img', loading: 'lazy' });
      const fig = h('figure', { class: 'msg-figure' }, img, item.caption ? h('figcaption', { text: item.caption }) : null);
      authBlobUrl(item.url).then((u) => {
        img.src = u;
        // Jamais ouverte comme document (un SVG blob: aurait l'origine du panel) : simple agrandissement sur place.
        img.addEventListener('click', () => img.classList.toggle('msg-img-zoom'));
      }).catch(() => fig.replaceWith(h('div', { class: 'msg-tool', text: '[image indisponible]' })));
      node = fig;
    } else if (item.kind === 'done') {
      const morceaux = [];
      if (item.durationMs) morceaux.push(`en ${fmtDuration(item.durationMs)}`);
      if (typeof item.costUsd === 'number' && item.costUsd > 0) morceaux.push(`≈ ${fmtMoney(item.costUsd)}`);
      node = h('div', { class: ['msg-done', item.ok ? 'ok' : 'ko'], role: item.ok ? null : 'alert' },
        icon(item.ok ? 'check' : 'alert', 14),
        h('span', { text: item.ok ? `Terminé ${morceaux.join(' · ')}`.trim() : `Échec : ${item.error || 'erreur inconnue'}` }));
    } else {
      node = h('div', { class: 'msg-system', text: item.text || '' });
    }
    return node;
  }

  const enAttenteRendu = new Map();
  function remplirBulle(item, bulle) {
    if (item.role === 'user') {
      // Prof : les formules de l'utilisateur sont aussi rendues (même chaîne purifiée que les réponses).
      if (opts.userMarkdown) clear(bulle).append(renderMarkdown(item.text)); else bulle.textContent = item.text;
      return;
    }
    // Pendant le flux : rendu limité à ~8 par seconde.
    if (item.streaming) {
      if (enAttenteRendu.has(item.key)) return;
      enAttenteRendu.set(item.key, setTimeout(() => {
        enAttenteRendu.delete(item.key);
        const bas = presDuBas();
        clear(bulle).append(item.text.length > 30000 ? h('div', { class: 'md md-plain', text: item.text }) : renderMarkdown(item.text));
        opts.transform?.(item, bulle);
        if (bas) versLeBas();
      }, 120));
      return;
    }
    clearTimeout(enAttenteRendu.get(item.key));
    enAttenteRendu.delete(item.key);
    clear(bulle).append(renderMarkdown(item.text));
    opts.transform?.(item, bulle);
  }

  function toutRendre() {
    clear(log);
    elements.clear();
    const c = chatOf(agentId);
    if (c.error && !c.items.length) log.append(emptyState(`Historique indisponible : ${c.error}`, { ic: 'alert' }));
    else if (!c.items.length) log.append(emptyState(opts.emptyText || `Aucun message. Écris à ${agent().name} pour commencer.`, { ic: agent().icon === 'sigma' ? 'sigma' : 'sparkle' }));
    for (const it of c.items) {
      const n = rendreItem(it);
      elements.set(it.key, n);
      log.append(n);
    }
    versLeBas();
  }

  on(`chat:${agentId}`, ({ op, item }) => {
    const bas = presDuBas();
    if (op === 'reset') { toutRendre(); return; }
    if (op === 'add') {
      log.querySelector(':scope > .empty')?.remove();
      const n = rendreItem(item);
      elements.set(item.key, n);
      log.append(n);
      if (item.kind === 'done') annonce.textContent = item.ok ? `${agent().name} a terminé.` : `${agent().name} : échec.`;
    } else if (op === 'update') {
      const ancien = elements.get(item.key);
      if (!ancien) return;
      if (item.kind === 'msg' && item.role === 'assistant') {
        ancien.classList.toggle('msg-streaming', !!item.streaming);
        remplirBulle(item, ancien.querySelector('.bubble'));
        ancien.querySelector('.msg-meta').textContent = fmtTime(item.ts);
      } else {
        const n = rendreItem(item);
        ancien.replaceWith(n);
        elements.set(item.key, n);
      }
    } else if (op === 'remove') {
      elements.get(item.key)?.remove();
      elements.delete(item.key);
    }
    if (bas || (op === 'add' && item.role === 'user')) versLeBas();
  });

  /* ---------------------------------------------------------------- état */

  function majEtat() {
    const a = agent();
    const etat = state.pc === 'online' ? (a.state && ETATS[a.state] ? a.state : 'idle') : 'unknown';
    const e = ETATS[etat];
    etatChip.replaceChildren(chip(e.label, e.kind));
    btnStop.hidden = etat !== 'working' && etat !== 'waiting';
    const horsLigne = state.pc !== 'online';
    noteHorsLigne.hidden = !horsLigne;
    textarea.disabled = horsLigne;
    btnEnvoyer.disabled = horsLigne;
    btnNouvelle.disabled = horsLigne;
    if (projetChip) {
      const p = selectedProject();
      projetChip.replaceChildren(p ? chip(`${p.name}${p.branch ? ` · ${p.branch}` : ''}`, 'neutral', 'branch') : chip('Aucun projet choisi', 'warning', 'folder'));
    }
  }
  on('agents', majEtat);
  on('pc', majEtat);
  on('projects', majEtat);
  on('settings', (s) => {
    if (segInt && !intensiteTouchee && s?.defaultIntensity) { intensite = s.defaultIntensity; segInt.setValue(intensite); }
  });
  majEtat();

  /* ---------------------------------------------------------------- actions */

  async function envoyer(texteForce, { silencieux = false } = {}) {
    const texte = (texteForce ?? textarea.value).trim();
    if (!texte) return false;
    if (state.pc !== 'online') { toast('PC éteint : message non envoyé.', 'error'); return false; }
    const item = addPendingUser(agentId, texte);
    if (texteForce === undefined) { textarea.value = ''; autoTaille(); }
    const corps = { text: texte };
    if (opts.intensity) corps.intensity = intensite;
    if (opts.project && state.selectedProjectId) corps.projectId = state.selectedProjectId;
    btnEnvoyer.disabled = true;
    erreurEnvoi.hidden = true;
    try {
      const r = await api(`/api/agents/${encodeURIComponent(agentId)}/messages`, { method: 'POST', body: corps });
      if (item.pending && r?.taskId) { item.taskId = r.taskId; updateItem(agentId, item); }
      opts.onSent?.(texte);
      return true;
    } catch (e) {
      removeItem(agentId, item);
      if (texteForce === undefined && !textarea.value) { textarea.value = texte; autoTaille(); }
      let msg = e.status === 409 ? `${agent().name} travaille déjà : attends la fin ou arrête-le.` : e.message;
      if (e.status === 404 && corps.projectId) {
        // Projet supprimé entre-temps : on oublie la sélection et on recharge la liste.
        msg = 'Le projet sélectionné n’existe plus : choisis-en un autre dans l’onglet Projets, puis renvoie le message.';
        state.selectedProjectId = null;
        api('/api/projects').then((l) => setProjects(l)).catch(() => {});
      }
      erreurEnvoi.textContent = `Message non envoyé : ${msg}`;
      erreurEnvoi.hidden = false;
      if (!silencieux) toast(msg, 'error');
      return false;
    } finally {
      btnEnvoyer.disabled = state.pc !== 'online';
    }
  }

  async function arreter() {
    try {
      await api(`/api/agents/${encodeURIComponent(agentId)}/stop`, { method: 'POST', body: {} });
      toast(`${agent().name} arrêté.`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function nouvelle() {
    const ok = await confirmDialog({ title: 'Nouvelle conversation ?', message: `${agent().name} oubliera le fil actuel (l’historique reste dans le journal).`, confirmText: 'Recommencer' });
    if (!ok) return;
    try {
      await api(`/api/agents/${encodeURIComponent(agentId)}/new-session`, { method: 'POST', body: {} });
      await loadHistory(agentId, { force: true }).catch(() => {});
      toast('Nouvelle conversation.', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  function charger() {
    if (state.pc !== 'online') { if (!chatOf(agentId).items.length) toutRendre(); return; }
    loadHistory(agentId).catch(() => {});
  }
  on('pc', ({ etat }) => { if (etat === 'online' && el.isConnected && !chatOf(agentId).loaded) charger(); });

  toutRendre();

  return {
    el,
    onShow() { charger(); setTimeout(versLeBas, 0); },
    focus() { textarea.focus(); },
    setText(t) { textarea.value = t; autoTaille(); textarea.focus(); },
    send: (t, o) => envoyer(t, o)
  };
}
