// Onglet Fichiers : explorateur (projets / agents) avec aperçu texte ou image.

import { h, icon, button, clear, emptyState, offlineState, fmtSize, fmtRelative, segmented } from '../ui.js';
import { state, on } from '../store.js';
import { api } from '../api.js';

const IMAGES_OK = /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/;

export function createFilesTab() {
  let racine = 'projets';
  let chemin = '';
  const fil = h('nav', { class: 'breadcrumb', 'aria-label': 'Chemin' });
  const liste = h('ul', { class: 'file-list', 'aria-label': 'Contenu du dossier' });
  const apercu = h('div', { class: 'file-preview', 'aria-live': 'polite' });
  const seg = segmented('racine', [{ value: 'projets', label: 'Projets' }, { value: 'agents', label: 'Agents' }], racine,
    (v) => { racine = v; chemin = ''; charger(); }, { label: 'Racine' });
  const el = h('div', { class: 'tab-pane files' }, h('div', { class: 'files-bar' }, seg, fil), h('div', { class: 'files-split' }, liste, apercu));
  let jeton = 0;

  function rendreFil() {
    clear(fil);
    const morceaux = chemin ? chemin.split('/') : [];
    fil.append(h('button', { type: 'button', class: 'crumb', on: { click: () => { chemin = ''; charger(); } } }, icon('folder', 14), racine));
    morceaux.forEach((m, i) => {
      fil.append(h('span', { class: 'crumb-sep', 'aria-hidden': 'true', text: '/' }));
      fil.append(h('button', { type: 'button', class: 'crumb', text: m, on: { click: () => { chemin = morceaux.slice(0, i + 1).join('/'); charger(); } } }));
    });
  }

  async function charger() {
    const moi = ++jeton;
    rendreFil();
    clear(liste);
    clear(apercu).append(emptyState('Choisis un fichier pour l’afficher.', { ic: 'file' }));
    if (state.pc !== 'online') { liste.append(h('li', {}, offlineState('L’explorateur de fichiers'))); return; }
    liste.append(h('li', { class: 'muted', text: 'Chargement…' }));
    let d;
    try { d = await api('/api/files', { query: { root: racine, path: chemin } }); } catch (e) {
      if (moi === jeton) clear(liste).append(h('li', { class: 'muted', text: `Impossible d’ouvrir ce dossier : ${e.message}` }));
      return;
    }
    if (moi !== jeton) return;
    clear(liste);
    if (d?.type === 'file') { afficherFichier(d); return; }
    if (chemin) {
      liste.append(h('li', {}, h('button', { type: 'button', class: 'file-entry', on: { click: () => { chemin = chemin.split('/').slice(0, -1).join('/'); charger(); } } },
        icon('back', 16), h('span', { text: 'Dossier parent' }))));
    }
    const entrees = [...(d?.entries || [])].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    if (!entrees.length) liste.append(h('li', { class: 'muted', text: 'Dossier vide.' }));
    for (const e of entrees) {
      const suite = chemin ? `${chemin}/${e.name}` : e.name;
      liste.append(h('li', {}, h('button', { type: 'button', class: 'file-entry', on: { click: () => (e.type === 'dir' ? (chemin = suite, charger()) : ouvrir(suite)) } },
        icon(e.type === 'dir' ? 'folder' : 'file', 16), h('span', { class: 'file-name', text: e.name }),
        h('span', { class: 'file-info muted', text: e.type === 'dir' ? '' : `${fmtSize(e.size)}${e.mtime ? ` · ${fmtRelative(e.mtime)}` : ''}` }))));
    }
  }

  async function ouvrir(p) {
    const moi = ++jeton;
    clear(apercu).append(h('p', { class: 'muted', text: 'Ouverture…' }));
    try {
      const d = await api('/api/files', { query: { root: racine, path: p } });
      if (moi === jeton) afficherFichier(d, p);
    } catch (e) {
      if (moi === jeton) clear(apercu).append(emptyState(`Impossible d’ouvrir ce fichier : ${e.message}`, { ic: 'alert' }));
    }
  }

  function afficherFichier(d, p) {
    clear(apercu);
    apercu.append(h('div', { class: 'file-preview-head' }, icon('file', 16), h('strong', { class: 'mono', text: d.name || p || '' }),
      h('span', { class: 'muted', text: `${fmtSize(d.size)}${d.mime ? ` · ${d.mime}` : ''}` }),
      button('Fermer', { icon: 'x', iconOnly: true, small: true, kind: 'ghost', onClick: () => clear(apercu).append(emptyState('Choisis un fichier pour l’afficher.', { ic: 'file' })) })));
    if (typeof d.text === 'string') {
      const lignes = d.text.split('\n');
      const pre = h('pre', { class: 'code-view', tabindex: '0' });
      const code = h('code', {});
      lignes.slice(0, 5000).forEach((l) => code.append(h('span', { class: 'code-line', text: l || ' ' })));
      pre.append(code);
      apercu.append(pre);
      if (lignes.length > 5000) apercu.append(h('p', { class: 'hint', text: `Aperçu limité aux 5000 premières lignes (${lignes.length} au total).` }));
    } else if (typeof d.base64 === 'string' && IMAGES_OK.test(d.mime || '')) {
      apercu.append(h('img', { class: 'file-img', alt: d.name || 'image', src: `data:${d.mime};base64,${d.base64}` }));
    } else {
      apercu.append(emptyState('Aperçu indisponible pour ce type de fichier (ou fichier de plus de 1 Mo).', { ic: 'file' }));
    }
    apercu.scrollIntoView?.({ block: 'nearest' });
  }

  on('pc', ({ etat }) => { if (etat === 'online' && el.isConnected) charger(); });

  return { el, onShow() { charger(); } };
}
