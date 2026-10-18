// Service worker du Panel : met en cache l'ENVELOPPE statique uniquement.
// - /api/* et le pont Google : jamais interceptés ni mis en cache (données privées, jeton) → réseau direct.
// - Enveloppe (HTML, JS, CSS, icônes) : cache d'abord, version de cache à incrémenter à chaque livraison.
// - Bibliothèques CDN épinglées (jsDelivr) : cache d'abord (versions immuables).

const VERSION = 'panel-v3';
const CACHE_ENVELOPPE = `${VERSION}-enveloppe`;
const CACHE_CDN = `${VERSION}-cdn`;

const ENVELOPPE = [
  './', 'index.html', 'app.js', 'styles.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'js/ui.js', 'js/store.js', 'js/config.js', 'js/api.js', 'js/google.js', 'js/ws.js', 'js/markdown.js', 'js/chats.js',
  'js/chat.js', 'js/demo.js', 'js/workspace.js', 'js/router.js', 'js/reminder-dialog.js', 'js/diff.js', 'js/theme.js',
  'js/views/home.js', 'js/views/code.js', 'js/views/secretaire.js', 'js/views/prof.js', 'js/views/settings.js',
  'js/code/team.js', 'js/code/servers.js', 'js/code/changes.js', 'js/code/files.js', 'js/code/terminal.js', 'js/code/projects.js'
];

const CDN = [
  'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
  'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE_ENVELOPPE);
    await c.addAll(ENVELOPPE.map((u) => new Request(u, { cache: 'reload' })));
    const cdn = await caches.open(CACHE_CDN);
    await Promise.all(CDN.map((u) => cdn.add(new Request(u, { mode: 'cors', credentials: 'omit' })).catch(() => {})));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(`${VERSION}-`)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skipWaiting') self.skipWaiting();
});

const portee = new URL(self.registration.scope);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                                  // POST (pont, API) : réseau direct
  if (req.headers.has('Authorization')) return;                      // requêtes authentifiées : jamais touchées
  const url = new URL(req.url);

  if (url.origin === 'https://cdn.jsdelivr.net' && CDN.some((u) => req.url.startsWith(u.replace(/[^/]+$/, '')))) {
    event.respondWith(cacheDabord(req, CACHE_CDN));
    return;
  }
  if (url.origin !== portee.origin) return;                          // autres origines (PC distant, Google) : réseau
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws') return;   // API du PC : réseau, sans cache
  if (!url.pathname.startsWith(portee.pathname)) return;

  if (req.mode === 'navigate') {
    // Navigation : l'enveloppe en cache (index.html), ce qui permet l'ouverture PC éteint / hors ligne.
    event.respondWith((async () => {
      const c = await caches.open(CACHE_ENVELOPPE);
      return (await c.match('index.html')) || (await c.match('./')) || fetch(req);
    })());
    return;
  }
  event.respondWith(cacheDabord(req, CACHE_ENVELOPPE, true));
});

async function cacheDabord(req, nom, ignorerRecherche = false) {
  const c = await caches.open(nom);
  const trouve = await c.match(req, { ignoreSearch: ignorerRecherche });
  if (trouve) return trouve;
  const r = await fetch(req);
  // Ne garde que les réponses complètes de l'enveloppe ou du CDN (jamais d'API).
  if (r.ok && (r.type === 'basic' || r.type === 'cors')) c.put(req, r.clone()).catch(() => {});
  return r;
}
