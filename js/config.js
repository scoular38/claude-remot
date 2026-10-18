// Configuration de l'appareil : appairage (#pair=…), stockage local, adresse du PC.
// Le site ne stocke JAMAIS BRIDGE_SECRET : seulement le secret restreint aux rappels (rs).

const CLE = 'panel.config';

/** Mode démo : uniquement avec ?demo=1 explicite dans l'adresse. Jamais activé seul, jamais mémorisé. */
export const isDemo = new URLSearchParams(location.search).get('demo') === '1';

let memoire = null;   // configuration en mémoire (mode démo, ou stockage indisponible)

export function isLocalHost() {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && location.protocol === 'http:';
}

export function loadConfig() {
  if (isDemo) return { pc: location.origin, token: 'demo', bridge: 'demo', rs: 'demo' };
  if (memoire) return memoire;
  try {
    const v = JSON.parse(localStorage.getItem(CLE) || 'null');
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}

export function saveConfig(cfg) {
  if (isDemo) return;
  const propre = nettoyer(cfg);
  memoire = propre;
  try { localStorage.setItem(CLE, JSON.stringify(propre)); memoire = null; } catch { /* reste en mémoire */ }
}

export function clearConfig() {
  memoire = null;
  try { localStorage.removeItem(CLE); } catch { /* ignoré */ }
}

function nettoyer(cfg) {
  const out = {};
  if (typeof cfg.pc === 'string') out.pc = cfg.pc.replace(/\/+$/, '');
  if (typeof cfg.token === 'string') out.token = cfg.token;
  if (typeof cfg.bridge === 'string') out.bridge = cfg.bridge;
  if (typeof cfg.rs === 'string') out.rs = cfg.rs;
  out.pairedAt = cfg.pairedAt || new Date().toISOString();
  return out;
}

function urlPcValide(u) {
  if (!u) return true;   // vide accepté (Tailscale pas encore connecté)
  try {
    const x = new URL(u);
    if (x.protocol === 'https:') return true;
    return x.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(x.hostname);
  } catch { return false; }
}

function urlPontValide(u) {
  if (!u) return true;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && x.hostname === 'script.google.com' && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(x.pathname);
  } catch { return false; }
}

function base64urlDecode(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Décode et valide une charge d'appairage {pc, token, bridge, rs}. Lève une erreur en français. */
export function decodePairPayload(code) {
  let obj;
  try { obj = JSON.parse(base64urlDecode(code)); } catch { throw new Error("Lien d'appairage illisible."); }
  if (!obj || typeof obj !== 'object') throw new Error("Lien d'appairage illisible.");
  if (typeof obj.token !== 'string' || obj.token.length < 16 || obj.token.length > 512) throw new Error("Jeton absent du lien d'appairage.");
  if (!urlPcValide(obj.pc)) throw new Error("Adresse du PC invalide dans le lien d'appairage.");
  if (!urlPontValide(obj.bridge)) throw new Error("Adresse du pont Google invalide dans le lien d'appairage.");
  if (obj.rs !== undefined && (typeof obj.rs !== 'string' || obj.rs.length > 512)) throw new Error("Secret des rappels invalide.");
  return { pc: obj.pc || '', token: obj.token, bridge: obj.bridge || '', rs: obj.rs || '' };
}

/** Extrait le code d'un lien complet « …#pair=XXX » ou du code seul. */
export function extractPairCode(texte) {
  const s = String(texte || '').trim();
  const i = s.indexOf('#pair=');
  return i >= 0 ? s.slice(i + 6) : s;
}

/**
 * Lit le fragment #pair= au chargement, l'efface IMMÉDIATEMENT (history.replaceState), puis le valide.
 * Renvoie null (pas de fragment), {cfg} ou {error}.
 */
export function consumePairFragment() {
  if (!location.hash.startsWith('#pair=')) return null;
  const code = location.hash.slice(6);
  history.replaceState(null, '', location.pathname + location.search + '#accueil');
  if (isDemo) return { error: "Appairage ignoré en mode démo." };
  try {
    return { cfg: decodePairPayload(code) };
  } catch (e) {
    return { error: e.message };
  }
}

/** Le site est-il servi par le PC lui-même (même origine que l'API) ? */
export function servedFromPc(cfg = loadConfig()) {
  if (isDemo) return true;
  if (isLocalHost()) return true;
  if (cfg?.pc) {
    try { return new URL(cfg.pc).origin === location.origin; } catch { return false; }
  }
  return false;
}

/** Adresse de base de l'API du PC (sans « / » final), ou '' si inconnue. */
export function apiBase(cfg = loadConfig()) {
  if (servedFromPc(cfg)) return location.origin;
  return cfg?.pc ? cfg.pc.replace(/\/+$/, '') : '';
}

export function hasToken(cfg = loadConfig()) {
  return !!(cfg && cfg.token);
}

/** Sur le PC : récupère le jeton et l'appairage sans saisie. Renvoie la réponse ou null. */
export async function localBootstrap() {
  if (!isLocalHost() || isDemo) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(`${location.origin}/api/local-bootstrap`, { signal: ctrl.signal, cache: 'no-store', credentials: 'omit' });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || typeof data.token !== 'string') return null;
    let rs = '';
    let bridge = typeof data.bridgeUrl === 'string' ? data.bridgeUrl : '';
    if (typeof data.pairUrl === 'string' && data.pairUrl.includes('#pair=')) {
      try {
        const p = decodePairPayload(extractPairCode(data.pairUrl));
        rs = p.rs;
        bridge = bridge || p.bridge;
      } catch { /* QR invalide : on garde au moins le jeton */ }
    }
    if (!rs && typeof data.rs === 'string' && data.rs.length <= 512) rs = data.rs;
    if (!urlPontValide(bridge)) bridge = '';
    saveConfig({ pc: location.origin, token: data.token, bridge, rs });
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
