// Client WebSocket : authentification par le premier message (jamais de jeton dans l'URL),
// ping toutes les 25 s, reconnexion avec back-off 1 s → 30 s, suspendue tant que le PC est éteint.

import { apiBase, loadConfig, isDemo } from './config.js';
import { state, emit, on } from './store.js';

let demo = null;
export function useDemoSocket(mod) { demo = mod; }

let ws = null;
let delai = 1000;
let reconnexion = null;
let ping = null;
let arrete = false;
let pongVu = false;
let dernierMessage = 0;

function setConnecte(v) {
  if (state.wsConnected === v) return;
  state.wsConnected = v;
  emit('ws-state', v);
}

export function connect() {
  arrete = false;
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  clearTimeout(reconnexion);
  const cfg = loadConfig();
  if (!cfg?.token) return;
  if (!isDemo && state.pc !== 'online') return;   // on attend que /api/health réponde
  let socket;
  try {
    if (isDemo && demo) socket = new demo.DemoSocket();
    else {
      const base = apiBase(cfg);
      if (!base) return;
      socket = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`);
    }
  } catch {
    planifier();
    return;
  }
  ws = socket;
  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'auth', token: cfg.token }));
  };
  socket.onmessage = (ev) => {
    dernierMessage = Date.now();
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'pong') { pongVu = true; return; }
    if (msg.type === 'hello') {
      delai = 1000;
      setConnecte(true);
      demarrerPing(socket);
    }
    emit('ws', msg);
  };
  socket.onclose = () => {
    if (ws === socket) ws = null;
    clearInterval(ping);
    setConnecte(false);
    if (!arrete) planifier();
  };
  socket.onerror = () => { /* onclose suit */ };
}

function demarrerPing(socket) {
  clearInterval(ping);
  pongVu = false;
  ping = setInterval(() => {
    if (socket.readyState !== 1) return;
    // Si le serveur répond aux pings JSON et reste muet 70 s, la connexion est considérée morte.
    if (pongVu && Date.now() - dernierMessage > 70000) { socket.close(); return; }
    try { socket.send(JSON.stringify({ type: 'ping' })); } catch { /* ignoré */ }
  }, 25000);
}

function planifier() {
  clearTimeout(reconnexion);
  if (!isDemo && state.pc !== 'online') return;     // reprise sur l'événement « pc » en ligne
  reconnexion = setTimeout(connect, delai);
  delai = Math.min(delai * 2, 30000);
}

export function disconnect() {
  arrete = true;
  clearTimeout(reconnexion);
  clearInterval(ping);
  if (ws) { try { ws.close(); } catch { /* ignoré */ } ws = null; }
  setConnecte(false);
}

export function send(obj) {
  if (!ws || ws.readyState !== 1 || !state.wsConnected) return false;
  ws.send(JSON.stringify(obj));
  return true;
}

// Retour du PC : reconnexion immédiate. PC éteint : on ferme proprement.
on('pc', ({ etat }) => {
  if (etat === 'online') { delai = 1000; connect(); }
  else if (ws) { try { ws.close(); } catch { /* ignoré */ } }
});
