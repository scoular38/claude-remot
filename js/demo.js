// Mode démo (activé UNIQUEMENT par ?demo=1) : simule l'API du PC, le WebSocket et le pont Google.
// Aucune requête réseau, rien n'est enregistré. Sert à essayer et vérifier l'interface sans serveur.

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const maintenant = () => new Date().toISOString();
const ilYa = (min) => new Date(Date.now() - min * 60000).toISOString();
let compteur = 100;
const id = (p) => `${p}${++compteur}`;

const sockets = new Set();
function diffuser(msg) { for (const s of sockets) s._recevoir(msg); }

const agents = [
  { id: 'code', name: 'Code', color: '#4f7cff', icon: 'code', state: 'idle' },
  { id: 'secretaire', name: 'Secrétaire', color: '#e0883a', icon: 'mail', state: 'idle' },
  { id: 'prof', name: 'Prof de maths', color: '#3fb27f', icon: 'sigma', state: 'idle' }
];

let settings = {
  defaultIntensity: 'normal', autoMerge: false, serverIdleMinutes: 120, maxFixLoops: 3,
  models: { code: 'sonnet', secretaire: 'sonnet', prof: 'sonnet', architecte: 'sonnet', explorateur: 'haiku', implementeur: 'sonnet', testeur: 'sonnet', debogueur: 'sonnet', relecteur: 'sonnet', optimiseur: 'sonnet' },
  schedules: {
    'bilan-code': { agent: 'code', cron: 'dimanche 20:00', enabled: true, label: 'Bilan hebdomadaire des projets' },
    'exercice-prof': { agent: 'prof', cron: 'tous les jours 18:00', enabled: false, label: 'Exercice du jour' }
  }
};

const usage = { h5: { costUsd: 0.84, tokensIn: 182000, tokensOut: 41000, messages: 14 }, d7: { costUsd: 9.3, tokensIn: 2100000, tokensOut: 460000, messages: 131 }, lastLimit: null };

let validations = [
  { id: 'v1', agentId: 'secretaire', taskId: 't0', kind: 'envoyer_mail', title: 'Envoyer un mail à Marie', detail: 'La Secrétaire veut répondre à Marie pour décaler le rendez-vous.',
    input: { a: 'marie@example.org', sujet: 'Rendez-vous', corps: 'Bonjour Marie,\n\nJe dois décaler notre rendez-vous à vendredi 10 h. Est-ce que ça te va ?\n\nÀ bientôt' }, createdAt: ilYa(6), status: 'pending' },
  { id: 'v2', agentId: 'code', taskId: 't1', kind: 'Bash', title: 'Supprimer un fichier', detail: 'Suppression de old.txt dans le projet démo.',
    input: { command: 'Remove-Item old.txt' }, createdAt: ilYa(2), status: 'pending' }
];

let projets = [
  { id: 'demo-web', name: 'demo-web', path: 'projets/demo-web', branch: 'claude/ecran-scores', baseBranch: 'main', dirty: true, lastTests: { ok: true, at: ilYa(12), summary: '12 tests réussis (vitest)' }, selected: true },
  { id: 'jeu-snake', name: 'jeu-snake', path: 'projets/jeu-snake', branch: 'main', baseBranch: 'main', dirty: false, lastTests: { ok: false, at: ilYa(60 * 26), summary: '1 test en échec : collision avec le mur' }, selected: false }
];

const urlApercu = () => new URL('dev/apercu-demo.html', location.href).href;
let serveurs = [
  { id: 's1', projectId: 'demo-web', command: 'npm run dev', port: 5173, state: 'running', localUrl: urlApercu(), previewUrl: urlApercu(), startedAt: ilYa(25), lastActivity: ilYa(1) }
];
const journaux = { s1: ['> demo-web@1.0.0 dev', '> vite', '', '  VITE v5.4.0  ready in 312 ms', '  ➜  Local:   http://localhost:5173/'] };

let rappels = [
  { id: 'r1', quand: plusJours(1, '09:00'), message: 'Appeler le garage', agent: 'secretaire', repetition: 'aucune', statut: 'en_attente' },
  { id: 'r2', quand: plusJours(3, '08:00'), message: 'Réviser les suites (chapitre 4)', agent: 'prof', repetition: 'hebdomadaire', statut: 'en_attente' }
];

function plusJours(n, heure) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + n));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${heure}`;
}

let brief = {
  jours: { lundi: { actif: true, heure: '07:30' }, mardi: { actif: true, heure: '07:30' }, mercredi: { actif: true, heure: '07:30' }, jeudi: { actif: true, heure: '07:30' },
    vendredi: { actif: true, heure: '07:30' }, samedi: { actif: true, heure: '09:30' }, dimanche: { actif: false, heure: '10:00' } },
  contenu: { agenda: true, joursAgenda: 1, mails: true, rappels: true },
  requeteMails: 'is:unread in:inbox -category:promotions -category:social newer_than:3d', maxMails: 10
};

const historiques = {
  code: [
    { id: 'm1', role: 'user', text: 'Ajoute un écran des meilleurs scores à mon projet.', ts: ilYa(40), taskId: 't1' },
    { id: 'm2', role: 'tool', text: 'Plan : 3 étapes, critères de réussite définis', name: 'Agent · architecte', ts: ilYa(39), taskId: 't1' },
    { id: 'm3', role: 'assistant', text: "C'est fait. Voici le résumé :\n\n- **Nouvel écran** `scores.html` avec les 10 meilleurs scores ;\n- sauvegarde dans `localStorage` ;\n- 4 nouveaux tests, **tous réussis** ;\n- relecture : aucun problème bloquant.\n\n```js\nexport function ajouterScore(nom, points) {\n  const scores = lireScores();\n  scores.push({ nom, points });\n  scores.sort((a, b) => b.points - a.points);\n  return scores.slice(0, 10);\n}\n```\n\nLe serveur tourne : ouvre l'onglet **Aperçu** pour essayer.", ts: ilYa(30), taskId: 't1' }
  ],
  secretaire: [
    { id: 'm4', role: 'user', text: "Rappelle-moi d'appeler le garage demain à 9 h.", ts: ilYa(90) },
    { id: 'm5', role: 'assistant', text: 'Rappel programmé **demain à 9 h 00** : « Appeler le garage ». Tu recevras un mail, même si ton PC est éteint.', ts: ilYa(89) }
  ],
  prof: [
    { id: 'm6', role: 'user', text: 'Calcule $\\int_0^1 x^2\\,dx$ et explique.', ts: ilYa(120) },
    { id: 'm7', role: 'assistant', text: "Une primitive de $x^2$ est $\\dfrac{x^3}{3}$. Donc\n\n$$\\int_0^1 x^2\\,dx = \\left[\\frac{x^3}{3}\\right]_0^1 = \\frac{1}{3}.$$\n\nVérifié en Python : `sympy.integrate(x**2, (x, 0, 1))` donne bien `1/3`.\n\nPiège XSS (doit rester inerte) : <img src=x onerror=alert(1)> [lien](javascript:alert(1)) $\\href{javascript:alert(1)}{x}$", ts: ilYa(118) }
  ]
};

const progression = { chapitres: [
  { id: 'limites', titre: 'Limites et continuité', statut: 'acquis' },
  { id: 'derivees', titre: 'Dérivées', statut: 'acquis' },
  { id: 'integrales', titre: 'Intégrales', statut: 'en_cours', note: 'Intégration par parties à revoir' },
  { id: 'suites', titre: 'Suites numériques', statut: 'a_revoir' },
  { id: 'algebre', titre: 'Algèbre linéaire', statut: 'a_faire' }
] };

const DIFF = `diff --git a/src/scores.js b/src/scores.js
new file mode 100644
--- /dev/null
+++ b/src/scores.js
@@ -0,0 +1,14 @@
+const CLE = 'scores';
+
+export function lireScores() {
+  try { return JSON.parse(localStorage.getItem(CLE)) || []; } catch { return []; }
+}
+
+export function ajouterScore(nom, points) {
+  const scores = lireScores();
+  scores.push({ nom, points });
+  scores.sort((a, b) => b.points - a.points);
+  const top = scores.slice(0, 10);
+  localStorage.setItem(CLE, JSON.stringify(top));
+  return top;
+}
diff --git a/index.html b/index.html
--- a/index.html
+++ b/index.html
@@ -8,7 +8,8 @@
   <body>
     <h1>Mon jeu</h1>
-    <button id="jouer">Jouer</button>
+    <button id="jouer">Jouer</button>
+    <a href="scores.html">Meilleurs scores</a>
     <canvas id="jeu" width="480" height="320"></canvas>
     <script type="module" src="src/main.js"></script>
   </body>`;

const FICHIERS = {
  'projets:': { type: 'dir', entries: [{ name: 'demo-web', type: 'dir' }, { name: 'jeu-snake', type: 'dir' }] },
  'projets:demo-web': { type: 'dir', entries: [{ name: 'src', type: 'dir' }, { name: 'index.html', type: 'file', size: 412, mtime: ilYa(30) }, { name: 'package.json', type: 'file', size: 230, mtime: ilYa(300) }, { name: '<img src=x onerror=alert(1)>.txt', type: 'file', size: 12, mtime: ilYa(3) }] },
  'projets:demo-web/src': { type: 'dir', entries: [{ name: 'main.js', type: 'file', size: 980, mtime: ilYa(30) }, { name: 'scores.js', type: 'file', size: 380, mtime: ilYa(30) }] },
  'agents:': { type: 'dir', entries: [{ name: 'prof', type: 'dir' }, { name: 'secretaire', type: 'dir' }] }
};

function lireFichier(root, path) {
  const cle = `${root}:${path}`;
  if (FICHIERS[cle]) return FICHIERS[cle];
  const nom = path.split('/').pop();
  if (nom.endsWith('.json')) return { type: 'file', name: nom, size: 230, mime: 'application/json', text: '{\n  "name": "demo-web",\n  "scripts": { "dev": "vite", "test": "vitest run" }\n}\n' };
  return { type: 'file', name: nom, size: 380, mime: 'text/plain', text: `// ${nom}\n// Contenu de démonstration.\nexport const bonjour = () => 'Bonjour';\n` };
}

const mails = [
  { id: 'g1', threadId: 'f1', from: 'Marie Dupont <marie@example.org>', subject: 'Rendez-vous de jeudi', snippet: 'Salut ! Est-ce que jeudi 14 h te va toujours ? Sinon on peut décaler…', date: ilYa(50), unread: true },
  { id: 'g2', threadId: 'f2', from: 'Université <scolarite@example.edu>', subject: 'Inscription aux examens <b>L2</b>', snippet: 'Les inscriptions aux examens du semestre sont ouvertes jusqu’au 30 octobre.', date: ilYa(200), unread: true },
  { id: 'g3', threadId: 'f3', from: 'Garage Martin <contact@garage.example>', subject: 'Devis révision', snippet: 'Bonjour, veuillez trouver ci-joint le devis pour la révision des 60 000 km.', date: ilYa(600), unread: false }
];

function agendaDemo() {
  const base = new Date();
  const a = (j, h, m, dur, titre, lieu) => { const d = new Date(base); d.setDate(d.getDate() + j); d.setHours(h, m, 0, 0); return { id: id('e'), title: titre, start: d.toISOString(), end: new Date(d.getTime() + dur * 60000).toISOString(), location: lieu, allDay: false }; };
  return [a(0, 14, 0, 90, 'TD d’algèbre linéaire', 'Salle B204'), a(1, 9, 0, 30, 'Appeler le garage', ''), a(2, 18, 30, 60, 'Sport', 'Gymnase'), a(4, 10, 0, 120, 'Partiel blanc d’analyse', 'Amphi A')];
}

function status() {
  return { pc: 'online', agents, usage, pendingValidations: validations.length, nextReminders: rappels.filter((r) => r.statut === 'en_attente').slice(0, 3), settings };
}

const erreur = (status, error) => { const e = new Error(error); e.status = status; throw e; };

/* ------------------------------------------------------------------ API */

export async function demoApi(path, { method = 'GET', body, query } = {}) {
  await attendre(120 + Math.random() * 150);
  const m = (re) => re.exec(path);
  let x;
  if (path === '/api/health') return { ok: true, name: 'panel', version: 'démo', time: maintenant() };
  if (path === '/api/status') return status();
  if (path === '/api/agents') return { agents };
  if (path === '/api/settings') { if (method === 'PUT') settings = { ...settings, ...body }; return settings; }
  if ((x = m(/^\/api\/agents\/([^/]+)\/history$/))) return { sessionId: 'demo', messages: historiques[x[1]] || [] };
  if ((x = m(/^\/api\/agents\/([^/]+)\/messages$/))) return lancerTache(x[1], body?.text || '', body);
  if ((x = m(/^\/api\/agents\/([^/]+)\/stop$/))) { majAgent(x[1], 'idle'); return { ok: true }; }
  if ((x = m(/^\/api\/agents\/([^/]+)\/new-session$/))) { historiques[x[1]] = []; return { ok: true }; }
  if (path === '/api/emergency-stop') { agents.forEach((a) => majAgent(a.id, 'idle')); serveurs.forEach((s) => { s.state = 'stopped'; diffuser({ type: 'server.update', server: s }); }); return { stoppedAgents: 1, stoppedServers: 1 }; }
  if (path === '/api/validations') return validations;
  if ((x = m(/^\/api\/validations\/([^/]+)$/))) {
    const v = validations.find((y) => y.id === x[1]);
    if (!v) erreur(409, 'Validation déjà traitée.');
    validations = validations.filter((y) => y.id !== x[1]);
    setTimeout(() => diffuser({ type: 'validation.resolved', id: x[1], decision: body?.decision }), 50);
    return { ok: true };
  }
  if (path === '/api/projects') {
    if (method === 'POST') { const p = { id: body.name, name: body.name, path: `projets/${body.name}`, branch: 'main', baseBranch: 'main', dirty: false, lastTests: null, selected: false }; projets.push(p); return p; }
    return projets;
  }
  if ((x = m(/^\/api\/projects\/([^/]+)$/)) && method === 'DELETE') {
    if (serveurs.some((y) => y.projectId === x[1] && y.state === 'running')) erreur(409, 'Un serveur de test de ce projet tourne : arrête-le d’abord.');
    projets = projets.filter((p) => p.id !== x[1]);
    return { ok: true };
  }
  if ((x = m(/^\/api\/projects\/([^/]+)\/select$/))) { projets = projets.map((p) => ({ ...p, selected: p.id === x[1] })); return { ok: true }; }
  if ((x = m(/^\/api\/projects\/([^/]+)\/changes$/))) {
    const p = projets.find((y) => y.id === x[1]);
    if (!p || !p.branch.startsWith('claude/')) return { branch: p?.branch || 'main', base: 'main', files: [], diff: '' };
    return { branch: p.branch, base: 'main', files: [{ path: 'src/scores.js', status: 'A', additions: 14, deletions: 0 }, { path: 'index.html', status: 'M', additions: 2, deletions: 1 }], diff: DIFF };
  }
  if ((x = m(/^\/api\/projects\/([^/]+)\/(keep|discard)$/))) { projets = projets.map((p) => (p.id === x[1] ? { ...p, branch: 'main', dirty: false } : p)); return { ok: true }; }
  if (path === '/api/files') return lireFichier(query?.root || 'projets', query?.path || '');
  if (path === '/api/servers') {
    if (method === 'POST') { const s = { id: id('s'), projectId: body.projectId, command: body.command, port: body.port, state: 'starting', localUrl: urlApercu(), previewUrl: urlApercu(), startedAt: maintenant(), lastActivity: maintenant() }; serveurs.push(s); setTimeout(() => { s.state = 'running'; diffuser({ type: 'server.update', server: s }); }, 1500); return s; }
    return serveurs;
  }
  if ((x = m(/^\/api\/servers\/([^/]+)\/logs$/))) return { lines: journaux[x[1]] || [] };
  if ((x = m(/^\/api\/servers\/([^/]+)\/(restart|stop)$/))) {
    const s = serveurs.find((y) => y.id === x[1]);
    if (s) { s.state = x[2] === 'stop' ? 'stopped' : 'running'; setTimeout(() => diffuser({ type: 'server.update', server: s }), 200); }
    return { ok: true };
  }
  if (path === '/api/google/reminders') {
    if (method === 'POST') return demoBridge('reminders.add', body);
    return rappels.filter((r) => r.statut === 'en_attente');
  }
  if ((x = m(/^\/api\/google\/reminders\/([^/]+)$/))) return demoBridge('reminders.cancel', { id: decodeURIComponent(x[1]) });
  if (path === '/api/google/mails') return { ok: true, data: mails };
  if (path === '/api/google/agenda') return agendaDemo();
  if (path === '/api/google/brief-config') { if (method === 'PUT') brief = JSON.parse(JSON.stringify(body)); return brief; }
  if (path === '/api/google/brief-send-now') return { envoye: true };
  if (path === '/api/prof/progress') return progression;
  if (path === '/api/journal') return [
    { ts: ilYa(40), agentId: 'code', type: 'message', summary: 'Demande reçue : écran des meilleurs scores' },
    { ts: ilYa(39), agentId: 'code', type: 'branche', summary: 'Branche claude/ecran-scores créée' },
    { ts: ilYa(25), agentId: 'code', type: 'serveur', summary: 'npm run dev lancé sur le port 5173' },
    { ts: ilYa(6), agentId: 'secretaire', type: 'validation', summary: 'Mail à marie@example.org en attente de validation' }
  ];
  erreur(404, `Route inconnue en démo : ${path}`);
  return null;
}

/* ------------------------------------------------------------------ Pont Google simulé */

export async function demoBridge(action, params = {}) {
  await attendre(400);
  if (action === 'reminders.add') {
    if (!String(params.message || '').trim()) throw new Error('Le message du rappel est vide.');
    const r = { id: id('r'), quand: String(params.quand).slice(0, 16), message: params.message, agent: params.agent || 'panel', repetition: params.repetition || 'aucune', statut: 'en_attente' };
    rappels.push(r);
    rappels.sort((a, b) => a.quand.localeCompare(b.quand));
    return { id: r.id, quand: r.quand };
  }
  if (action === 'reminders.list') return rappels.filter((r) => r.statut === 'en_attente');
  if (action === 'reminders.cancel') { const r = rappels.find((y) => y.id === params.id); if (!r) throw new Error('Rappel introuvable.'); r.statut = 'annule'; return { id: r.id, statut: 'annule' }; }
  if (action === 'ping') return { pong: true };
  throw new Error('Ce secret n’autorise que les rappels.');
}

/* ------------------------------------------------------------------ Images */

export async function demoImage() {
  const pts = [];
  for (let i = 0; i <= 120; i++) { const x = -10 + (20 * i) / 120; const y = x === 0 ? 1 : Math.sin(x) / x; pts.push(`${(i / 120) * 380 + 10},${150 - y * 110}`); }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><rect width="400" height="200" fill="#fff"/><line x1="10" y1="150" x2="390" y2="150" stroke="#999"/><line x1="200" y1="10" x2="200" y2="190" stroke="#999"/><polyline fill="none" stroke="#3fb27f" stroke-width="2.5" points="${pts.join(' ')}"/><text x="14" y="24" font-family="sans-serif" font-size="14" fill="#333">sin(x)/x sur [-10, 10]</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ------------------------------------------------------------------ Tâches simulées */

function majAgent(agentId, state) {
  const a = agents.find((y) => y.id === agentId);
  if (a) a.state = state;
  diffuser({ type: 'agent.state', agentId, state });
}

function lancerTache(agentId, texte, body) {
  const a = agents.find((y) => y.id === agentId);
  if (a?.state === 'working') erreur(409, 'L’agent travaille déjà.');
  const taskId = id('t');
  majAgent(agentId, 'working');
  setTimeout(() => diffuser({ type: 'chat.user', agentId, taskId, text: texte, ts: maintenant() }), 80);
  if (agentId === 'code') scenarioCode(taskId, body?.intensity || 'normal');
  else if (agentId === 'prof') scenarioTexte('prof', taskId, /exercice/i.test(texte)
    ? "**Exercice.** Soit $(u_n)$ définie par $u_0 = 1$ et $u_{n+1} = \\dfrac{u_n}{2} + 1$.\n\n1. Calcule $u_1$, $u_2$.\n2. Montre que $v_n = u_n - 2$ est géométrique.\n\nÀ toi de jouer !\n\n## Correction\n\n$u_1 = \\frac{3}{2}$, $u_2 = \\frac{7}{4}$, et $v_{n+1} = \\frac{1}{2} v_n$."
    : "Bonne question. La dérivée de $f(x) = x\\ln x$ est\n\n$$f'(x) = \\ln x + 1.$$\n\nJ'ai vérifié avec Python (`sympy.diff`). Voici la courbe :", true);
  else scenarioTexte('secretaire', taskId, 'Bien noté. J’ai regardé ton agenda : **jeudi 9 h** est libre. Je programme le rappel ?');
  return { taskId };
}

async function scenarioTexte(agentId, taskId, texte, image = false) {
  await attendre(600);
  diffuser({ type: 'chat.tool', agentId, taskId, name: agentId === 'prof' ? 'Bash · python' : 'mcp__perso__agenda_lister', summary: agentId === 'prof' ? 'Vérification du calcul' : '7 prochains jours' });
  const morceaux = texte.match(/.{1,18}/gs) || [];
  for (const m of morceaux) { await attendre(45); diffuser({ type: 'chat.delta', agentId, taskId, text: m }); }
  diffuser({ type: 'chat.message', agentId, taskId, message: { id: id('m'), role: 'assistant', text: texte, ts: maintenant(), taskId } });
  if (image) diffuser({ type: 'chat.image', agentId, taskId, url: '/api/media/demo-courbe.png', caption: 'Courbe tracée en Python' });
  await attendre(200);
  diffuser({ type: 'chat.done', agentId, taskId, ok: true, costUsd: 0.02, durationMs: 4200 });
  majAgent(agentId, 'idle');
}

async function scenarioCode(taskId, intensite) {
  const debut = Date.now();
  const roles = intensite === 'econome' ? ['architecte', 'implementeur', 'testeur']
    : intensite === 'maximum' ? ['architecte', 'explorateur', 'explorateur', 'implementeur', 'implementeur', 'testeur', 'relecteur', 'optimiseur']
      : ['architecte', 'explorateur', 'explorateur', 'implementeur', 'testeur', 'relecteur'];
  const desc = { architecte: 'Découpe la demande et fixe les critères de réussite', explorateur: 'Repère les fichiers concernés', implementeur: 'Écrit le code dans sa copie isolée', testeur: 'Écrit et lance les tests', relecteur: 'Cherche les bugs cachés et les failles', optimiseur: 'Mesure la vitesse et la taille' };
  const membres = [];
  const envoyer = () => diffuser({ type: 'team.update', agentId: 'code', taskId, members: membres.map((m) => ({ ...m })) });
  for (let i = 0; i < roles.length; i++) {
    const m = { id: `sa${i}`, role: roles[i], description: desc[roles[i]], state: 'running', startedAt: new Date().toISOString(), endedAt: null, lastAction: 'Démarrage…' };
    membres.push(m);
    envoyer();
    diffuser({ type: 'chat.tool', agentId: 'code', taskId, name: `Agent · ${roles[i]}`, summary: desc[roles[i]] });
    await attendre(900);
    m.lastAction = roles[i] === 'testeur' ? 'npm test → 16 réussis' : roles[i] === 'implementeur' ? 'Edit src/scores.js' : 'Read index.html';
    envoyer();
    await attendre(900);
    m.state = 'done'; m.endedAt = new Date().toISOString();
    envoyer();
  }
  const texte = "Terminé. L'équipe a ajouté l'écran, les tests passent et la relecture n'a rien trouvé de bloquant.\n\nRegarde l'onglet **Modifications** pour le détail, puis **Garder** ou **Annuler**.";
  for (const m of texte.match(/.{1,20}/gs)) { await attendre(40); diffuser({ type: 'chat.delta', agentId: 'code', taskId, text: m }); }
  diffuser({ type: 'chat.message', agentId: 'code', taskId, message: { id: id('m'), role: 'assistant', text: texte, ts: maintenant(), taskId } });
  diffuser({ type: 'changes.updated', projectId: 'demo-web' });
  diffuser({ type: 'chat.done', agentId: 'code', taskId, ok: true, costUsd: 0.31, durationMs: Date.now() - debut });
  majAgent('code', 'idle');
}

setInterval(() => {
  const s = serveurs.find((y) => y.state === 'running');
  if (!s) return;
  const ligne = `${new Date().toLocaleTimeString('fr-FR')} [vite] page reload src/main.js`;
  (journaux[s.id] ||= []).push(ligne);
  diffuser({ type: 'server.log', id: s.id, line: ligne });
}, 5000);

/* ------------------------------------------------------------------ WebSocket simulé */

export class DemoSocket {
  constructor() {
    this.readyState = 0;
    setTimeout(() => { this.readyState = 1; sockets.add(this); this.onopen?.(); }, 150);
  }

  _recevoir(msg) { if (this.readyState === 1) setTimeout(() => this.onmessage?.({ data: JSON.stringify(msg) }), 0); }

  send(texte) {
    let m; try { m = JSON.parse(texte); } catch { return; }
    if (m.type === 'auth') this._recevoir({ type: 'hello', status: status() });
    else if (m.type === 'ping') this._recevoir({ type: 'pong' });
    else if (m.type === 'term.open') this._recevoir({ type: 'term.output', termId: m.termId, data: 'Windows PowerShell\r\nPS C:\\…\\projets\\demo-web> ' });
    else if (m.type === 'term.input') {
      const cmd = String(m.data).trim();
      const sortie = /^(ls|dir|Get-ChildItem)/i.test(cmd) ? '\r\n    Répertoire : projets\\demo-web\r\n\r\nMode    Name\r\n----    ----\r\nd----   src\r\n-a---   index.html\r\n-a---   package.json\r\n\r\n'
        : /^git status/i.test(cmd) ? 'Sur la branche claude/ecran-scores\r\nModifications non indexées : index.html\r\n'
          : `\u001b[32m(démo)\u001b[0m commande simulée : ${cmd}\r\n`;
      this._recevoir({ type: 'term.output', termId: m.termId, data: `${sortie}PS C:\\…\\projets\\demo-web> ` });
    } else if (m.type === 'term.close') this._recevoir({ type: 'term.exit', termId: m.termId, code: 0 });
  }

  close() {
    this.readyState = 3;
    sockets.delete(this);
    setTimeout(() => this.onclose?.({}), 0);
  }
}
