// Onglet Modifications : fichiers changés + diff coloré ligne à ligne, Garder (fusionner) ou Annuler.

import { h, icon, button, busy, chip, clear, emptyState, offlineState, toast, confirmDialog, debounce } from '../ui.js';
import { state, on, selectedProject } from '../store.js';
import { api } from '../api.js';
import { renderDiff } from '../diff.js';
import { chargerProjets } from './projects.js';

export function createChangesTab() {
  const entete = h('div', { class: 'changes-head' });
  const fichiers = h('ul', { class: 'changes-files' });
  const zoneDiff = h('div', { class: 'changes-diff' });
  const el = h('div', { class: 'tab-pane' }, entete, fichiers, zoneDiff);
  let visible = false;
  let perime = true;
  let limite = 3000;

  async function charger() {
    perime = false;
    clear(entete); clear(fichiers); clear(zoneDiff);
    if (state.pc !== 'online') { zoneDiff.append(offlineState('L’onglet Modifications')); return; }
    const p = selectedProject();
    if (!p) { zoneDiff.append(emptyState('Aucun projet choisi. Va dans l’onglet Projets.', { ic: 'folder' })); return; }
    zoneDiff.append(h('p', { class: 'muted', text: 'Chargement des modifications…' }));
    let d;
    try {
      d = await api(`/api/projects/${encodeURIComponent(p.id)}/changes`);
    } catch (e) {
      clear(zoneDiff).append(emptyState(`Modifications indisponibles : ${e.message}`, { ic: 'alert' }));
      return;
    }
    clear(zoneDiff);
    const liste = Array.isArray(d?.files) ? d.files : [];
    const surBrancheClaude = /^claude\//.test(d?.branch || '');
    const btnGarder = button('Garder', { icon: 'check', kind: 'success', disabled: !surBrancheClaude, onClick: (e) => busy(e.currentTarget, () => garder(p, d)) });
    const btnAnnuler = button('Annuler tout', { icon: 'x', kind: 'danger', disabled: !surBrancheClaude, onClick: (e) => busy(e.currentTarget, () => annuler(p, d)) });
    entete.append(
      h('div', { class: 'changes-branch' }, icon('branch', 16), h('span', { class: 'mono', text: d?.branch || '?' }), icon('chevron', 14),
        h('span', { class: 'mono muted', text: d?.base || 'main' }), chip(`${liste.length} fichier${liste.length > 1 ? 's' : ''}`, 'neutral')),
      h('div', { class: 'changes-actions' },
        button('Rafraîchir', { icon: 'refresh', iconOnly: true, onClick: (e) => busy(e.currentTarget, charger) }), btnAnnuler, btnGarder));
    if (!surBrancheClaude) entete.append(h('p', { class: 'hint', text: 'Le projet est sur sa branche principale : rien à garder ni à annuler.' }));

    for (const f of liste) {
      const statut = { A: 'ajouté', M: 'modifié', D: 'supprimé', R: 'renommé', '??': 'nouveau' }[f.status] || f.status || '';
      fichiers.append(h('li', {}, h('a', { href: `#diff-${encodeURIComponent(f.path)}`, class: 'mono', text: f.path,
        on: { click: (e) => { e.preventDefault(); el.querySelector(`[id="diff-${CSS.escape(encodeURIComponent(f.path))}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } }),
      h('span', { class: 'muted', text: statut }),
      h('span', { class: 'diff-stat' }, h('span', { class: 'add', text: `+${f.additions ?? 0}` }), h('span', { class: 'del', text: `−${f.deletions ?? 0}` }))));
    }
    if (!d?.diff) { zoneDiff.append(emptyState('Aucune différence avec la branche principale.', { ic: 'check' })); return; }
    const rendu = renderDiff(d.diff, { limite });
    zoneDiff.append(rendu);
    if (rendu.tronque) zoneDiff.append(button('Afficher la suite du diff', { icon: 'plus', onClick: () => { limite += 5000; charger(); } }));
  }

  async function garder(p, d) {
    const ok = await confirmDialog({ title: 'Garder les modifications ?', confirmText: 'Fusionner dans main',
      message: `La branche ${d.branch} sera fusionnée dans ${d.base || 'main'} (fusion locale, rien n’est envoyé sur Internet).` });
    if (!ok) return;
    try {
      await api(`/api/projects/${encodeURIComponent(p.id)}/keep`, { method: 'POST', body: {} });
      toast('Modifications gardées.', 'success');
      await chargerProjets().catch(() => {});
      charger();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function annuler(p, d) {
    const ok = await confirmDialog({ title: 'Tout annuler ?', danger: true, confirmText: 'Tout effacer',
      message: `Le projet revient sur ${d.base || 'main'} et la branche ${d.branch} est supprimée avec ses fichiers. Irréversible.` });
    if (!ok) return;
    try {
      await api(`/api/projects/${encodeURIComponent(p.id)}/discard`, { method: 'POST', body: {} });
      toast('Modifications annulées.', 'success');
      await chargerProjets().catch(() => {});
      charger();
    } catch (e) { toast(e.message, 'error'); }
  }

  const rechargerPlusTard = debounce(() => { if (visible) charger(); else perime = true; }, 800);
  on('changes', ({ projectId }) => { if (!projectId || projectId === state.selectedProjectId) rechargerPlusTard(); });
  on('projects', () => { perime = true; if (visible) rechargerPlusTard(); });
  on('pc', () => { perime = true; if (visible) charger(); });

  return {
    el,
    onShow() { visible = true; if (perime) charger(); },
    onHide() { visible = false; }
  };
}
