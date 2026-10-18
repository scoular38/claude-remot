// Onglet Terminal : PowerShell dans le projet choisi, via le WebSocket (term.open / term.input / term.close).

import { h, icon, button, chip, clear, stripAnsi, toast } from '../ui.js';
import { state, on, selectedProject } from '../store.js';
import { send } from '../ws.js';

export function createTerminalTab() {
  let termId = null;
  let ouvert = false;
  const historique = [];
  let curseur = -1;

  const etat = h('span', {});
  const sortie = h('pre', { class: 'terminal-out', role: 'log', 'aria-live': 'off', tabindex: '0', 'aria-label': 'Sortie du terminal' });
  const entree = h('input', { type: 'text', class: 'terminal-in mono', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    'aria-label': 'Commande PowerShell', placeholder: 'Tape une commande puis Entrée' });
  const btnOuvrir = button('Ouvrir un terminal', { icon: 'terminal', kind: 'primary', onClick: () => ouvrir() });
  const btnFermer = button('Fermer', { icon: 'x', small: true, onClick: () => fermer() });
  const form = h('form', { class: 'terminal-form', on: { submit: (e) => { e.preventDefault(); executer(); } } },
    h('span', { class: 'terminal-prompt mono', 'aria-hidden': 'true', text: 'PS>' }), entree,
    button('Exécuter', { icon: 'play', iconOnly: true, kind: 'primary', type: 'submit' }));
  const el = h('div', { class: 'tab-pane terminal' }, h('div', { class: 'terminal-bar' }, etat, btnOuvrir, btnFermer), sortie, form);

  const ecrire = (t) => {
    const bas = sortie.scrollHeight - sortie.scrollTop - sortie.clientHeight < 40;
    sortie.append(document.createTextNode(stripAnsi(t)));
    if (sortie.textContent.length > 250000) sortie.textContent = sortie.textContent.slice(-180000);
    if (bas) sortie.scrollTop = sortie.scrollHeight;
  };

  function majEtat() {
    const p = selectedProject();
    const dispo = state.pc === 'online' && state.wsConnected && !!p;
    clear(etat).append(ouvert ? chip(`Ouvert · ${p?.name || ''}`, 'success', 'terminal')
      : chip(!p ? 'Aucun projet choisi' : state.pc !== 'online' ? 'PC éteint' : !state.wsConnected ? 'Connexion temps réel…' : 'Fermé', 'neutral'));
    btnOuvrir.hidden = ouvert;
    btnOuvrir.disabled = !dispo;
    btnFermer.hidden = !ouvert;
    entree.disabled = !ouvert;
    form.querySelector('button').disabled = !ouvert;
  }

  function ouvrir() {
    const p = selectedProject();
    if (!p) { toast('Choisis d’abord un projet (onglet Projets).', 'error'); return; }
    termId = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    if (!send({ type: 'term.open', termId, projectId: p.id })) { toast('Connexion temps réel indisponible.', 'error'); return; }
    ouvert = true;
    clear(sortie);
    ecrire(`PowerShell — ${p.name}\n`);
    majEtat();
    entree.focus();
  }

  function fermer() {
    if (termId) send({ type: 'term.close', termId });
    ouvert = false;
    ecrire('\n[terminal fermé]\n');
    majEtat();
  }

  function executer() {
    if (!ouvert) return;
    const cmd = entree.value;
    if (cmd.trim()) { historique.push(cmd); if (historique.length > 100) historique.shift(); }
    curseur = -1;
    entree.value = '';
    if (!send({ type: 'term.input', termId, data: `${cmd}\r\n` })) { ecrire('[connexion perdue]\n'); ouvert = false; majEtat(); }
  }

  entree.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && historique.length) {
      e.preventDefault();
      curseur = curseur < 0 ? historique.length - 1 : Math.max(0, curseur - 1);
      entree.value = historique[curseur];
    } else if (e.key === 'ArrowDown' && curseur >= 0) {
      e.preventDefault();
      curseur = curseur + 1 >= historique.length ? -1 : curseur + 1;
      entree.value = curseur < 0 ? '' : historique[curseur];
    }
  });

  on('term', (msg) => {
    if (msg.termId !== termId) return;
    if (msg.type === 'term.output') ecrire(String(msg.data ?? ''));
    else if (msg.type === 'term.exit') { ecrire(`\n[processus terminé, code ${msg.code ?? '?'}]\n`); ouvert = false; majEtat(); }
  });
  on('ws-state', (c) => { if (!c && ouvert) { ecrire('\n[connexion temps réel perdue : terminal fermé]\n'); ouvert = false; } majEtat(); });
  on('projects', majEtat);
  on('pc', majEtat);
  majEtat();
  sortie.textContent = 'Le terminal s’ouvre dans le dossier du projet choisi (dans projets/ uniquement).\n';

  return { el, onShow() { majEtat(); if (ouvert) entree.focus(); } };
}
