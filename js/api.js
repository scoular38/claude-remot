// Appels HTTP : API du PC (jeton en en-tête Authorization, jamais dans l'URL),
// détection PC en ligne / éteint, appels directs au pont Google (secret rappels uniquement).

import { apiBase, loadConfig, isDemo, hasToken } from './config.js';
import { state, setPc, emit } from './store.js';

let demo = null;
export function useDemo(mod) { demo = mod; }

export class ApiError extends Error {
  constructor(message, { status = 0, offline = false, data = null } = {}) {
    super(message);
    this.status = status;
    this.offline = offline;
    this.data = data;
  }
}

/** Appel JSON à l'API du PC. path commence par « /api/ ». */
export async function api(path, { method = 'GET', body, timeout = 20000, query } = {}) {
  if (isDemo && demo) return demo.demoApi(path, { method, body, query });
  const cfg = loadConfig();
  const base = apiBase(cfg);
  if (!base) throw new ApiError("Adresse du PC inconnue : appaire cet appareil depuis le PC (Réglages → QR).", { offline: true });
  if (!hasToken(cfg)) throw new ApiError("Appareil non appairé : scanne le QR affiché sur le PC.", { status: 401 });
  let url = base + path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    if ([...qs].length) url += `?${qs}`;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  let r;
  try {
    r = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${cfg.token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    });
  } catch (e) {
    checkHealthSoon();
    throw new ApiError(e.name === 'AbortError' ? 'Le PC met trop de temps à répondre.' : 'PC injoignable.', { offline: true });
  } finally {
    clearTimeout(t);
  }
  let data = null;
  const texte = await r.text();
  if (texte) { try { data = JSON.parse(texte); } catch { data = null; } }
  if (!r.ok) {
    if (r.status === 401) emit('auth-error', null);
    const msg = (data && typeof data.error === 'string' && data.error)
      || (r.status === 401 ? 'Jeton refusé : réappaire cet appareil.'
        : r.status === 429 ? 'Trop de tentatives, réessaie dans une minute.'
          : r.status === 409 ? "L'agent est déjà occupé." : `Erreur du PC (${r.status}).`);
    throw new ApiError(msg, { status: r.status, data });
  }
  return data;
}

/** Les proxies Google du serveur peuvent renvoyer {ok,data} ou directement data : on accepte les deux. */
export function unwrap(d) {
  if (d && typeof d === 'object' && !Array.isArray(d) && 'ok' in d && ('data' in d || 'error' in d)) {
    if (d.ok === false) throw new ApiError(d.error || 'Erreur du pont Google.');
    return d.data;
  }
  return d;
}

/* ------------------------------------------------------------------ État du PC */

let minuterie = null;
let enCours = null;
const PERIODE = 15000;
const DELAI = 4000;

export async function checkHealth() {
  if (enCours) return enCours;
  enCours = (async () => {
    if (isDemo) { setPc('online'); return true; }
    const cfg = loadConfig();
    const base = apiBase(cfg);
    if (!base) { setPc('unconfigured'); return false; }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), DELAI);
    try {
      const r = await fetch(`${base}/api/health`, { signal: ctrl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      const d = r.ok ? await r.json().catch(() => null) : null;
      const ok = !!(d && d.ok);
      setPc(ok ? 'online' : 'offline');
      return ok;
    } catch {
      setPc('offline');
      return false;
    } finally {
      clearTimeout(t);
    }
  })();
  try { return await enCours; } finally { enCours = null; }
}

let bientot = null;
export function checkHealthSoon() {
  if (bientot) return;
  bientot = setTimeout(() => { bientot = null; checkHealth(); }, 1200);
}

export function startHealthLoop() {
  if (minuterie) return;
  const boucle = async () => {
    if (document.visibilityState !== 'hidden') await checkHealth();
    minuterie = setTimeout(boucle, PERIODE);
  };
  boucle();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkHealth(); });
  window.addEventListener('online', () => checkHealth());
  window.addEventListener('offline', () => setPc('offline'));
}

export const pcOnline = () => state.pc === 'online';

/* ------------------------------------------------------------------ Pont Google direct */

export function bridgeConfigured() {
  if (isDemo) return true;
  const cfg = loadConfig();
  return !!(cfg && cfg.bridge && cfg.rs);
}

/**
 * Appel direct au pont avec le secret RESTREINT aux rappels (rs).
 * Content-Type text/plain (pas de pré-vol CORS), secret dans le corps, jamais dans l'URL.
 * Aucun nouvel essai automatique (évite les doublons de rappels).
 */
export async function bridgeCall(action, params = {}) {
  if (isDemo && demo) return demo.demoBridge(action, params);
  const cfg = loadConfig();
  if (!cfg?.bridge || !cfg?.rs) throw new ApiError("Pont Google non configuré sur cet appareil : réappaire-le depuis le PC.");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  let r;
  try {
    r = await fetch(cfg.bridge, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: cfg.rs, action, params }),
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: ctrl.signal
    });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'Le pont Google ne répond pas (délai dépassé). Vérifie la liste avant de réessayer.' : 'Pont Google injoignable (pas de réseau ?).', { offline: true });
  } finally {
    clearTimeout(t);
  }
  let d = null;
  try { d = await r.json(); } catch { d = null; }
  if (!d || typeof d !== 'object') throw new ApiError(`Réponse inattendue du pont Google (${r.status}). As-tu exécuté installer() ?`);
  if (!d.ok) throw new ApiError(d.error || 'Le pont Google a refusé la demande.');
  return d.data;
}

/* ------------------------------------------------------------------ Images protégées par jeton */

const cacheImages = new Map();   // url → objectURL
const MAX_IMAGES = 80;

/** Résout une URL relative au PC (ex. « /api/media/x.png »). */
export function pcUrl(u) {
  const base = apiBase();
  try { return new URL(u, base ? `${base}/` : location.href).href; } catch { return null; }
}

/** Les médias du PC exigent le jeton : fetch avec en-tête puis URL blob (révoquée à l'éviction). */
export async function authBlobUrl(u) {
  if (isDemo && demo) return demo.demoImage(u);
  const url = pcUrl(u);
  if (!url) throw new ApiError('Adresse d\'image invalide.');
  const base = apiBase();
  if (!base || new URL(url).origin !== new URL(base).origin) throw new ApiError('Image hors du PC refusée.');
  if (cacheImages.has(url)) return cacheImages.get(url);
  const cfg = loadConfig();
  const r = await fetch(url, { headers: { Authorization: `Bearer ${cfg?.token || ''}` }, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
  if (!r.ok) throw new ApiError(`Image indisponible (${r.status}).`);
  const blob = await r.blob();
  if (!/^image\//.test(blob.type)) throw new ApiError('Le fichier reçu n\'est pas une image.');
  const obj = URL.createObjectURL(blob);
  cacheImages.set(url, obj);
  if (cacheImages.size > MAX_IMAGES) {
    const [ancienne, objAncien] = cacheImages.entries().next().value;
    cacheImages.delete(ancienne);
    URL.revokeObjectURL(objAncien);
  }
  return obj;
}
