// Données des conversations (une par agent) alimentées par l'historique et les événements WebSocket.

import { state, emit } from './store.js';
import { api } from './api.js';

let seq = 0;
const cle = () => `i${++seq}`;

export function chatOf(agentId) {
  if (!state.chats.has(agentId)) state.chats.set(agentId, { items: [], loaded: false, loading: null });
  return state.chats.get(agentId);
}

const notifier = (agentId, op, item) => emit(`chat:${agentId}`, { op, item });

function versItems(messages) {
  const items = [];
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m || typeof m !== 'object') continue;
    if (m.role === 'tool') items.push({ key: cle(), kind: 'tool', name: m.name || m.tool || 'outil', summary: m.text || m.summary || '', ts: m.ts, taskId: m.taskId });
    else if (m.role === 'system') items.push({ key: cle(), kind: 'system', text: m.text || '', ts: m.ts });
    else items.push({ key: cle(), kind: 'msg', role: m.role === 'user' ? 'user' : 'assistant', text: m.text || '', ts: m.ts, taskId: m.taskId, id: m.id });
    for (const url of Array.isArray(m.images) ? m.images : []) items.push({ key: cle(), kind: 'image', url, caption: '', taskId: m.taskId });
  }
  return items;
}

export async function loadHistory(agentId, { force = false } = {}) {
  const c = chatOf(agentId);
  if (c.loading) return c.loading;
  if (c.loaded && !force) return undefined;
  c.loading = (async () => {
    try {
      const d = await api(`/api/agents/${encodeURIComponent(agentId)}/history`, { query: { limit: 100 } });
      const enAttente = c.items.filter((i) => i.pending);
      c.items = versItems(d?.messages).concat(enAttente);
      c.loaded = true;
      c.error = null;
    } catch (e) {
      c.error = e.message;
      throw e;
    } finally {
      c.loading = null;
      notifier(agentId, 'reset');
    }
  })();
  return c.loading;
}

export function addPendingUser(agentId, text) {
  const item = { key: cle(), kind: 'msg', role: 'user', text, pending: true, ts: new Date().toISOString() };
  chatOf(agentId).items.push(item);
  notifier(agentId, 'add', item);
  return item;
}

export function updateItem(agentId, item) { notifier(agentId, 'update', item); }

export function removeItem(agentId, item) {
  const c = chatOf(agentId);
  c.items = c.items.filter((i) => i !== item);
  notifier(agentId, 'remove', item);
}

function pousser(agentId, item) {
  item.key = item.key || cle();
  chatOf(agentId).items.push(item);
  notifier(agentId, 'add', item);
  return item;
}

function fluxOuvert(c, taskId) {
  for (let i = c.items.length - 1; i >= 0; i--) {
    const it = c.items[i];
    if (it.kind === 'msg' && it.role === 'assistant' && it.streaming && it.taskId === taskId) return it;
  }
  return null;
}

function fermerFlux(agentId, taskId) {
  const c = chatOf(agentId);
  for (const it of c.items) {
    if (it.streaming && (taskId === undefined || it.taskId === taskId)) { it.streaming = false; notifier(agentId, 'update', it); }
  }
}

/** Traite un événement WebSocket « chat.* ». */
export function handleChatEvent(msg) {
  const agentId = msg.agentId;
  if (!agentId) return;
  const c = chatOf(agentId);
  switch (msg.type) {
    case 'chat.user': {
      const p = c.items.find((i) => i.pending && i.role === 'user' && (i.taskId === msg.taskId || i.text === msg.text));
      if (p) { p.pending = false; p.taskId = msg.taskId; p.ts = msg.ts || p.ts; notifier(agentId, 'update', p); }
      else pousser(agentId, { kind: 'msg', role: 'user', text: msg.text || '', ts: msg.ts, taskId: msg.taskId });
      emit('chat-user', msg);
      break;
    }
    case 'chat.delta': {
      const f = fluxOuvert(c, msg.taskId);
      if (f) { f.text += msg.text || ''; notifier(agentId, 'update', f); }
      else pousser(agentId, { kind: 'msg', role: 'assistant', text: msg.text || '', streaming: true, taskId: msg.taskId, ts: new Date().toISOString() });
      break;
    }
    case 'chat.message': {
      const m = msg.message || {};
      const f = fluxOuvert(c, msg.taskId);
      if (m.role === 'tool') { pousser(agentId, { kind: 'tool', name: m.name || 'outil', summary: m.text || '', taskId: msg.taskId }); break; }
      if (f) { f.text = m.text ?? f.text; f.streaming = false; f.id = m.id; f.ts = m.ts || f.ts; notifier(agentId, 'update', f); }
      else if (m.text) pousser(agentId, { kind: 'msg', role: m.role === 'user' ? 'user' : 'assistant', text: m.text, ts: m.ts, taskId: msg.taskId, id: m.id });
      for (const url of Array.isArray(m.images) ? m.images : []) pousser(agentId, { kind: 'image', url, caption: '', taskId: msg.taskId });
      break;
    }
    case 'chat.tool':
      fermerFlux(agentId, msg.taskId);
      pousser(agentId, { kind: 'tool', name: msg.name || 'outil', summary: msg.summary || '', taskId: msg.taskId, ts: new Date().toISOString() });
      break;
    case 'chat.image':
      pousser(agentId, { kind: 'image', url: msg.url, caption: msg.caption || '', taskId: msg.taskId });
      break;
    case 'chat.done':
      fermerFlux(agentId, msg.taskId);
      pousser(agentId, { kind: 'done', ok: msg.ok !== false, costUsd: msg.costUsd, durationMs: msg.durationMs, error: msg.error, taskId: msg.taskId });
      emit('chat-done', msg);
      break;
    default:
  }
}
