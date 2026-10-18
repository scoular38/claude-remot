// État partagé de l'application et bus d'événements.

const ecouteurs = new Map();

export function on(type, fn) {
  if (!ecouteurs.has(type)) ecouteurs.set(type, new Set());
  ecouteurs.get(type).add(fn);
  return () => ecouteurs.get(type)?.delete(fn);
}

export function emit(type, detail) {
  for (const fn of [...(ecouteurs.get(type) || [])]) {
    try { fn(detail); } catch (e) { console.error(`Erreur dans un écouteur « ${type} » :`, e); }
  }
}

/** Agents par défaut (affichés tant que le PC n'a pas répondu). Couleurs de agents.json. */
export const AGENTS_DEFAUT = [
  { id: 'code', name: 'Code', color: '#4f7cff', icon: 'code', state: 'unknown' },
  { id: 'secretaire', name: 'Secrétaire', color: '#e0883a', icon: 'mail', state: 'unknown' },
  { id: 'prof', name: 'Prof de maths', color: '#3fb27f', icon: 'sigma', state: 'unknown' }
];

export const state = {
  pc: 'unknown',            // unknown | online | offline | unconfigured
  pcCheckedAt: null,
  wsConnected: false,
  agents: lireCacheAgents(),
  usage: null,
  settings: null,
  nextReminders: null,
  validations: [],          // en attente uniquement
  servers: new Map(),       // id → serveur
  serverLogs: new Map(),    // id → lignes
  team: new Map(),          // agentId → {taskId, members, updatedAt}
  chats: new Map(),         // agentId → {items, loaded}
  projects: [],
  selectedProjectId: null,
  bootstrap: null           // réponse de /api/local-bootstrap (sur le PC uniquement)
};

function lireCacheAgents() {
  try {
    const v = JSON.parse(localStorage.getItem('panel.cache.agents') || 'null');
    if (Array.isArray(v) && v.length) return v.map((a) => ({ ...a, state: 'unknown' }));
  } catch { /* stockage indisponible */ }
  return AGENTS_DEFAUT.map((a) => ({ ...a }));
}

export function agentById(id) {
  return state.agents.find((a) => a.id === id) || AGENTS_DEFAUT.find((a) => a.id === id) || { id, name: id, color: '#7a8396', icon: 'sparkle' };
}

export function setPc(etat) {
  state.pcCheckedAt = new Date();
  if (state.pc === etat) { emit('pc-check', etat); return; }
  const avant = state.pc;
  state.pc = etat;
  if (etat !== 'online') {
    state.agents = state.agents.map((a) => ({ ...a, state: 'unknown' }));
    emit('agents', state.agents);
  }
  emit('pc', { etat, avant });
}

export function setAgents(list) {
  if (!Array.isArray(list) || !list.length) return;
  state.agents = list.map((a) => ({ ...agentById(a.id), ...a }));
  try {
    localStorage.setItem('panel.cache.agents', JSON.stringify(state.agents.map(({ id, name, color, icon }) => ({ id, name, color, icon }))));
  } catch { /* ignoré */ }
  emit('agents', state.agents);
}

export function setAgentState(agentId, etat) {
  const a = state.agents.find((x) => x.id === agentId);
  if (!a) return;
  a.state = etat;
  emit('agents', state.agents);
}

export function applyStatus(status) {
  if (!status || typeof status !== 'object') return;
  if (Array.isArray(status.agents)) setAgents(status.agents);
  if ('usage' in status) { state.usage = status.usage; emit('usage', state.usage); }
  if ('nextReminders' in status) { state.nextReminders = status.nextReminders; emit('reminders', state.nextReminders); }
  if (status.settings) { state.settings = status.settings; emit('settings', state.settings); }
  emit('status', status);
}

export function setValidations(list) {
  state.validations = (Array.isArray(list) ? list : []).filter((v) => !v.status || v.status === 'pending');
  emit('validations', state.validations);
}

export function addValidation(v) {
  if (!v || !v.id) return;
  if (v.status && v.status !== 'pending') return;
  state.validations = state.validations.filter((x) => x.id !== v.id).concat([v]);
  emit('validations', state.validations);
}

export function removeValidation(id) {
  const avant = state.validations.length;
  state.validations = state.validations.filter((x) => x.id !== id);
  if (state.validations.length !== avant) emit('validations', state.validations);
}

export function setServers(list) {
  state.servers = new Map((Array.isArray(list) ? list : []).map((s) => [s.id, s]));
  emit('servers', state.servers);
}

export function upsertServer(s) {
  if (!s || !s.id) return;
  state.servers.set(s.id, { ...(state.servers.get(s.id) || {}), ...s });
  emit('servers', state.servers);
}

export function addServerLog(id, line) {
  const lignes = state.serverLogs.get(id) || [];
  lignes.push(String(line));
  if (lignes.length > 1000) lignes.splice(0, lignes.length - 1000);
  state.serverLogs.set(id, lignes);
  emit('server-log', { id, line });
}

export function setTeam(agentId, taskId, members) {
  state.team.set(agentId, { taskId, members: Array.isArray(members) ? members : [], updatedAt: Date.now() });
  emit('team', { agentId });
}

export function setSettings(s) {
  state.settings = s;
  emit('settings', s);
}

export function setProjects(list) {
  state.projects = Array.isArray(list) ? list : [];
  const sel = state.projects.find((p) => p.selected);
  if (sel) state.selectedProjectId = sel.id;
  else if (!state.projects.some((p) => p.id === state.selectedProjectId)) state.selectedProjectId = null;
  emit('projects', state.projects);
}

export function selectedProject() {
  return state.projects.find((p) => p.id === state.selectedProjectId) || null;
}
