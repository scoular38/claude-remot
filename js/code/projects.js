// Onglet Projets : choix du projet, branche git, état des tests, création à partir d'un modèle.

import { h, icon, button, busy, chip, clear, emptyState, offlineState, toast, field, fmtRelative, openDialog } from '../ui.js';
import { state, on, setProjects } from '../store.js';
import { api } from '../api.js';

const MODELES = [['vide', 'Vide'], ['web', 'Site web (HTML/CSS/JS)'], ['python', 'Python'], ['c', 'C'], ['cpp', 'C++'], ['java', 'Java']];

export async function chargerProjets() {
  const l = await api('/api/projects');
  setProjects(l);
  return l;
}

export function createProjectsTab() {
  const liste = h('div', { class: 'project-list' });
  const inNom = h('input', { type: 'text', required: true, maxlength: '48', placeholder: 'mon-jeu', autocomplete: 'off', spellcheck: 'false' });
  const selModele = h('select', {}, MODELES.map(([v, l]) => h('option', { value: v, text: l })));
  const btnCreer = button('Créer le projet', { icon: 'plus', kind: 'primary', type: 'submit' });
  const form = h('form', { class: 'inline-form', on: { submit: (e) => { e.preventDefault(); busy(btnCreer, creer); } } },
    field('Nom', inNom, 'Lettres, chiffres et tirets.'), field('Modèle', selModele), btnCreer);
  const el = h('div', { class: 'tab-pane' }, liste, h('section', { class: 'card card-flat' }, h('h3', { class: 'section-label', text: 'Nouveau projet' }), form));

  async function creer() {
    const nom = inNom.value.trim();
    if (!nom) { inNom.focus(); return; }
    try {
      await api('/api/projects', { method: 'POST', body: { name: nom, template: selModele.value } });
      inNom.value = '';
      toast(`Projet « ${nom} » créé.`, 'success');
      await chargerProjets();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function choisir(p) {
    try {
      await api(`/api/projects/${encodeURIComponent(p.id)}/select`, { method: 'POST', body: {} });
      state.selectedProjectId = p.id;
      await chargerProjets().catch(() => setProjects(state.projects.map((x) => ({ ...x, selected: x.id === p.id }))));
      toast(`Projet actif : ${p.name}.`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  /** Confirmation forte : il faut retaper le nom du projet (suppression définitive du dossier). */
  function confirmerSuppression(p) {
    return openDialog((dlg, close) => {
      const saisie = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Nom du projet à supprimer' });
      const ok = button('Supprimer définitivement', { kind: 'danger', icon: 'trash', disabled: true, onClick: () => close(true) });
      saisie.addEventListener('input', () => { ok.disabled = saisie.value.trim() !== p.name; });
      saisie.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !ok.disabled) { e.preventDefault(); close(true); } });
      dlg.append(
        h('h2', { class: 'dialog-title', text: `Supprimer le projet « ${p.name} » ?` }),
        h('p', { class: 'dialog-text', text: 'Le dossier du projet, son historique git et ses fichiers seront effacés du PC. Cette action est irréversible.' }),
        field(`Pour confirmer, tape le nom du projet : ${p.name}`, saisie),
        h('div', { class: 'dialog-actions' }, button('Annuler', { onClick: () => close(false) }), ok));
      setTimeout(() => saisie.focus(), 30);
    }, { label: `Supprimer le projet ${p.name}` }).then(Boolean);
  }

  async function supprimer(p) {
    if (!(await confirmerSuppression(p))) return;
    try {
      await api(`/api/projects/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
      toast(`Projet « ${p.name} » supprimé.`, 'success');
      if (state.selectedProjectId === p.id) state.selectedProjectId = null;
      await chargerProjets().catch(() => setProjects(state.projects.filter((x) => x.id !== p.id)));
    } catch (e) { toast(e.message, 'error'); }
  }

  function rendre() {
    clear(liste);
    form.querySelectorAll('input,select,button').forEach((x) => { x.disabled = state.pc !== 'online'; });
    if (state.pc !== 'online') { liste.append(offlineState('La liste des projets')); return; }
    if (!state.projects.length) { liste.append(emptyState('Aucun projet pour l’instant. Crée-en un ci-dessous, ou demande à l’agent Code.', { ic: 'folder' })); return; }
    for (const p of state.projects) {
      const actif = p.id === state.selectedProjectId;
      const t = p.lastTests;
      liste.append(h('article', { class: ['project', actif && 'project-active'] },
        h('div', { class: 'project-head' },
          h('div', {}, h('strong', { text: p.name }), h('small', { class: 'muted mono', text: p.path || '' })),
          h('div', { class: 'project-buttons' },
            actif ? chip('Projet actif', 'info', 'check') : button('Choisir', { small: true, onClick: (e) => busy(e.currentTarget, () => choisir(p)) }),
            button(`Supprimer ${p.name}`, { icon: 'trash', iconOnly: true, small: true, kind: 'danger-ghost', title: 'Supprimer le projet',
              onClick: (e) => busy(e.currentTarget, () => supprimer(p)) }))),
        h('div', { class: 'project-meta' },
          chip(p.branch || '?', /^claude\//.test(p.branch || '') ? 'warning' : 'neutral', 'branch'),
          p.dirty ? chip('Modifications non commitées', 'warning') : null,
          t ? chip(`Tests ${t.ok ? 'réussis' : 'en échec'}${t.at ? ` · ${fmtRelative(t.at)}` : ''}`, t.ok ? 'success' : 'danger', t.ok ? 'check' : 'alert') : chip('Pas encore testé', 'neutral')),
        t?.summary ? h('p', { class: 'project-tests', text: t.summary }) : null));
    }
  }

  on('projects', rendre);
  on('pc', rendre);
  rendre();

  return {
    el,
    onShow() { rendre(); if (state.pc === 'online') chargerProjets().catch((e) => toast(e.message, 'error')); }
  };
}
