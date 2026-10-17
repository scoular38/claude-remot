# Claude Remote

Pilote **Claude Code installé sur ton ordinateur** depuis n'importe où (téléphone, autre PC…), via un site hébergé gratuitement sur GitHub Pages.

- **Chat** avec Claude Code, dans le dossier de projet de ton choix, avec historique des conversations.
- **Validation à distance** : quand Claude veut lancer une commande, modifier un fichier ou envoyer un e-mail, une carte s'affiche sur ton téléphone avec *Autoriser / Refuser*.
- **Terminal** : lance des commandes (PowerShell, cmd ou bash) sur ton PC.
- **Fichiers** : parcours tes dossiers, prévisualise un fichier, change de projet en un clic, favoris.
- **Suivi** : pourcentage utilisé de tes limites (5 h et 7 jours), contexte de la conversation, coût estimé, processeur et mémoire du PC.
- **Assistant personnel** : un dossier dédié où Claude écrit et envoie tes e-mails (chaque envoi est confirmé sur ton téléphone), fait des recherches, prend des notes.

```
 Téléphone / navigateur                   Ton ordinateur
┌────────────────────┐  HTTPS  ┌────────┐   ┌───────────┐   ┌─────────────┐
│ Site GitHub Pages  │ ──────▶ │ Tunnel │ ─▶│ server.js │ ─▶│ Claude Code │
│ (dossier docs/)    │ ◀────── │gratuit │ ◀─│ 127.0.0.1 │ ◀─│  terminal…  │
└────────────────────┘         └────────┘   └─────┬─────┘   └──────┬──────┘
          ▲  « Autoriser ? »                       │  mcp-remote.js │
          └────────────────────────────────────────┴───────────────┘
```

---

## 1. Prérequis (sur ton ordinateur)

1. **Node.js 18 ou plus** → https://nodejs.org (vérifie avec `node -v`).
2. **Claude Code installé et connecté avec ton compte Claude** : la commande `claude` doit marcher dans un terminal.
   Teste : `echo "dis bonjour" | claude -p` → Claude doit répondre.

## 2. Mettre le site sur GitHub Pages

1. Crée un dépôt sur GitHub (ex. `claude-remote`) et envoie-y ces fichiers :
   ```bash
   git init
   git add .
   git commit -m "Claude Remote"
   git branch -M main
   git remote add origin https://github.com/TON-PSEUDO/claude-remote.git
   git push -u origin main
   ```
2. Sur GitHub : **Settings → Pages** → Source : *Deploy from a branch*, Branch : `main`, dossier `/docs` → **Save**.
3. Une minute plus tard, le site est en ligne : `https://TON-PSEUDO.github.io/claude-remote/`

> `server/config.json` (qui contient ton jeton) est exclu par `.gitignore`. Ne le publie jamais.

## 3. Lancer le serveur

```bash
cd server
npm start
```

Au premier lancement, il crée `server/config.json` et affiche ton **jeton d'accès**. Ouvre ce fichier et ajuste :

| Clé | Rôle |
|---|---|
| `allowedOrigins` | **Obligatoire** : `["https://TON-PSEUDO.github.io"]` (sans `/claude-remote` à la fin) |
| `allowedRoots` | Dossiers que le site peut parcourir et utiliser comme projets. Par défaut : ton dossier personnel. Ajoute d'autres disques si besoin, ex. `"D:\\"` |
| `workspaceRoot` | Dossier de projets par défaut (créé si absent) |
| `assistantDir` | Dossier de ton assistant personnel (créé avec ses consignes `CLAUDE.md`) |
| `enableTerminal` | `true` / `false` : active l'onglet Terminal |
| `smtp` | Envoi d'e-mails (voir section 6) |
| `port` | 8787 par défaut |
| `claudeCommand` | `claude`, ou le chemin complet si la commande n'est pas trouvée |

Sous Windows, les chemins s'écrivent avec des doubles barres : `"C:\\Users\\toi\\Projets"`.

Relance `npm start` après chaque modification.

## 4. Ouvrir le tunnel

### Option A — Cloudflare Tunnel (rapide, sans compte)
1. Installe `cloudflared` : https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
   (Windows : `winget install --id Cloudflare.cloudflared`)
2. Dans un **second** terminal :
   ```bash
   cloudflared tunnel --url http://localhost:8787
   ```
3. Copie l'adresse `https://quelque-chose.trycloudflare.com` : c'est l'**adresse du serveur** à coller dans le site.

⚠ Cette adresse change à chaque redémarrage du tunnel. Pour une adresse fixe : option B, ou un tunnel Cloudflare nommé avec ton propre domaine.

### Option B — Tailscale Funnel (adresse fixe, compte gratuit)
1. Installe Tailscale : https://tailscale.com/download et connecte-toi.
2. `tailscale funnel 8787`
3. L'adresse est du type `https://ton-pc.ton-reseau.ts.net` et ne change plus.

## 5. Utiliser le site

1. Ouvre ton site (sur téléphone : menu du navigateur → « Ajouter à l'écran d'accueil », il s'ouvrira comme une appli).
2. **Réglages** : colle l'adresse du tunnel et le jeton → **Tester** → **Enregistrer**. Coche « Me notifier » pour être prévenu quand Claude a besoin de toi.
3. Clique sur le nom du projet en haut (ou va dans **Fichiers**) pour choisir le dossier où Claude travaille.

### Niveaux d'autorisation

| Mode | Ce qui se passe |
|---|---|
| **Demander à chaque action** | Claude lit librement ; pour toute commande, modification ou outil externe, une carte *Autoriser / Refuser* s'affiche. Recommandé. |
| **Fichiers auto, demander le reste** | Les modifications de fichiers passent sans demander ; les commandes demandent toujours. |
| **Plan** | Claude explore et te propose un plan ; tu le valides pour qu'il passe à l'action. |
| **Tout autoriser ⚠** | Plus aucune question (sauf les e-mails, toujours confirmés). |

Sur une carte, **Toujours (cette conversation)** évite de redemander pour ce type d'action jusqu'à la prochaine conversation. Le champ texte permet de refuser en expliquant à Claude quoi faire à la place.

Si personne ne répond, la demande est refusée au bout de 15 minutes (`permissionTimeoutSec`).

## 6. Ton assistant personnel (e-mails et autres)

Clique sur **✉ Mon assistant** : Claude travaille alors dans `assistantDir`, avec des consignes d'assistant (fichier `CLAUDE.md`, que tu peux personnaliser : prénom, signature, contacts…).

### Envoyer des e-mails (avec Gmail)
1. Ton compte Google doit avoir la **validation en deux étapes** activée.
2. Crée un **mot de passe d'application** : https://myaccount.google.com/apppasswords (nom : « Claude Remote »). Google affiche 16 lettres.
3. Dans `server/config.json` :
   ```json
   "smtp": {
     "host": "smtp.gmail.com",
     "port": 465,
     "secure": true,
     "user": "ton.adresse@gmail.com",
     "pass": "les16lettresdumotdepasse",
     "from": "ton.adresse@gmail.com",
     "fromName": "Ton Prénom"
   }
   ```
4. Relance le serveur. Le tableau **Suivi** doit afficher « Envoi d'e-mails : configuré ✓ ».

Ensuite, demande simplement : *« Écris à marie@exemple.fr pour décaler notre rendez-vous à jeudi »*. Le message complet s'affiche sur ton téléphone ; il ne part que si tu appuies sur **Envoyer l'e-mail**.

Autres fournisseurs : récupère leurs réglages SMTP. Port 465 → `"secure": true` ; port 587 → `"secure": false` (le chiffrement STARTTLS reste obligatoire, le serveur refuse toute connexion non chiffrée).

### Lire tes e-mails, ton agenda…
Claude Code peut utiliser les **connecteurs** que tu as ajoutés sur claude.ai (Gmail, Google Agenda, Drive…) quand tu es connecté avec ton compte Claude : ajoute-les sur https://claude.ai/customize/connectors, puis lance une fois `claude` sur ton PC et tape `/mcp` pour vérifier qu'ils apparaissent. L'assistant pourra alors chercher et résumer tes e-mails.

## 7. Pourcentages d'utilisation

- **5 h / 7 j** : la part utilisée de tes limites d'abonnement (Pro ou Max). Ils s'affichent après le premier message envoyé depuis le site.
- **Ctx** : le remplissage de la mémoire de la conversation en cours. Au-delà de 75 %, démarre une nouvelle conversation.
- **Coût estimé** : équivalent au tarif de l'API. Avec un abonnement, il n'est pas facturé.

**Bonus** — pour que les pourcentages restent à jour même quand tu utilises Claude Code directement sur ton PC, ajoute dans `~/.claude/settings.json` (Windows : `C:\Users\toi\.claude\settings.json`) :
```json
{
  "statusLine": { "type": "command", "command": "node \"C:/chemin/vers/claude-remote/server/statusline.js\"" }
}
```
Tu auras aussi une barre d'état « contexte · 5h · 7j » dans ton terminal. (Si tu as déjà une `statusLine`, garde la tienne ou fusionne.)

---

## Sécurité — à lire

Ce projet donne accès à ton ordinateur depuis Internet. **Avec le jeton, on peut tout faire sur ton PC** (le terminal est un vrai terminal). Protections en place :

- Le serveur n'écoute **qu'en local** (`127.0.0.1`) ; seul le tunnel l'expose.
- Chaque requête doit porter le **jeton secret** (256 bits, comparé en temps constant). Les échecs sont ralentis et affichés dans le terminal du serveur.
- Seules les **origines listées** (ton site) sont acceptées par les navigateurs.
- Le chat et l'explorateur sont limités aux dossiers de `allowedRoots`.
- Les e-mails sont **toujours** confirmés sur ton téléphone, quel que soit le mode.
- Les validations passent par un canal interne protégé par un second jeton, recréé à chaque démarrage.

Bonnes pratiques :
- **Ne partage jamais ton jeton.** S'il fuite : supprime la ligne `token` de `config.json` et relance le serveur.
- Toutes les pages `TON-PSEUDO.github.io` partagent le même stockage navigateur : n'y héberge pas de code que tu ne maîtrises pas. Sur un appareil qui n'est pas le tien : **Réglages → Oublier cet appareil**.
- Coupe le tunnel (Ctrl+C) quand tu ne t'en sers pas.
- Mets `"enableTerminal": false` si tu n'en as pas besoin.

## Limites

- L'ordinateur doit rester **allumé, sans veille**, avec le serveur et le tunnel lancés.
- Le terminal n'est pas interactif : les programmes qui attendent une saisie (éditeurs, `ssh`, mots de passe) ne fonctionnent pas. Les commandes s'arrêtent après 15 minutes (`terminalTimeoutSec`).
- L'historique des conversations est stocké dans le navigateur de chaque appareil ; la mémoire de Claude, elle, est sur ton PC.

## Dépannage

| Problème | Solution |
|---|---|
| « injoignable » au test | Le serveur et le tunnel tournent-ils ? L'adresse du site est-elle dans `allowedOrigins` (sans `/` final) ? |
| « Jeton invalide » | Recopie le jeton affiché au démarrage du serveur |
| « Claude Code : introuvable » dans Suivi | Mets le chemin complet dans `claudeCommand` (`where claude` sous Windows, `which claude` ailleurs) |
| « Le port 8787 est déjà utilisé » | Le serveur tourne déjà dans une autre fenêtre : ferme-la |
| Les cartes d'autorisation n'apparaissent pas | Mets à jour Claude Code (`claude update`) |
| E-mail : « Authentification refusée » | Utilise un mot de passe d'application, pas ton mot de passe Google |
| Accents illisibles dans le terminal Windows | Choisis PowerShell plutôt que cmd |

## Fichiers du projet

```
docs/                 le site (GitHub Pages)
  index.html, app.css, app.js, manifest.webmanifest, icon.svg
server/
  server.js           serveur local (chat, terminal, fichiers, suivi)
  mcp-remote.js       validations à distance + outil d'envoi d'e-mail
  smtp.js             envoi d'e-mails chiffré, sans dépendance
  statusline.js       barre d'état optionnelle (pourcentages)
  assistant-CLAUDE.md consignes de départ de l'assistant
  config.json         ta configuration (créé au 1er lancement, jamais publié)
```
