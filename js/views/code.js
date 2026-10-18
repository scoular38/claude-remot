// Page Code : conversation (avec intensité) + onglets Équipe, Aperçu, Serveurs, Modifications, Fichiers, Terminal, Projets.

import { createChat } from '../chat.js';
import { workspace } from '../workspace.js';
import { state, on } from '../store.js';
import { createTeamTab } from '../code/team.js';
import { createServersTab, createPreviewTab, chargerServeurs } from '../code/servers.js';
import { createChangesTab } from '../code/changes.js';
import { createFilesTab } from '../code/files.js';
import { createTerminalTab } from '../code/terminal.js';
import { createProjectsTab, chargerProjets } from '../code/projects.js';

export function createCode() {
  const chat = createChat('code', {
    intensity: true, project: true,
    placeholder: 'Demande à l’agent Code (ex. : ajoute un écran des meilleurs scores)…',
    emptyText: 'Décris ce que tu veux : l’agent Code planifie, écrit, teste, fait relire, puis te montre le résultat.'
  });

  let ws;
  ws = workspace({
    chat, store: 'code', label: 'Outils de l’agent Code',
    panels: [
      { id: 'equipe', label: 'Équipe', icon: 'users', create: () => createTeamTab('code') },
      { id: 'apercu', label: 'Aperçu', icon: 'eye', create: () => createPreviewTab() },
      { id: 'serveurs', label: 'Serveurs', icon: 'server', create: () => createServersTab({ ouvrirApercu: (id) => { ws.select('apercu'); ws.instance('apercu')?.afficher(id); } }) },
      { id: 'modifications', label: 'Modifications', icon: 'diff', create: () => createChangesTab() },
      { id: 'fichiers', label: 'Fichiers', icon: 'folder', create: () => createFilesTab() },
      { id: 'terminal', label: 'Terminal', icon: 'terminal', create: () => createTerminalTab() },
      { id: 'projets', label: 'Projets', icon: 'branch', create: () => createProjectsTab() }
    ]
  });

  // Pastilles : sous-agents actifs, serveurs en marche.
  const majBadges = () => {
    const actifs = (state.team.get('code')?.members || []).filter((m) => m.state === 'running').length;
    ws.tabs.setBadge('code-equipe', actifs);
    ws.tabs.setBadge('code-serveurs', [...state.servers.values()].filter((s) => s.state === 'running' || s.state === 'starting').length);
  };
  on('team', majBadges);
  on('servers', majBadges);

  const chargerContexte = () => {
    if (state.pc !== 'online') return;
    chargerProjets().catch(() => {});
    chargerServeurs().catch(() => {});
  };
  on('pc', ({ etat }) => { if (etat === 'online') chargerContexte(); });
  // Branche à jour après chaque tâche (branche claude/* créée, fusion, annulation).
  const rafraichirProjets = () => { if (state.pc === 'online') chargerProjets().catch(() => {}); };
  on('chat-done', (m) => { if (m?.agentId === 'code') rafraichirProjets(); });
  on('chat-user', (m) => { if (m?.agentId === 'code') setTimeout(rafraichirProjets, 1500); });
  on('changes', rafraichirProjets);

  return {
    el: ws.el,
    onShow() { ws.onShow(); chargerContexte(); }
  };
}
