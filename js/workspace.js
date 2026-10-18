// Mise en page « conversation + onglets » : côte à côte sur grand écran,
// onglets au-dessus de la conversation sur téléphone (la conversation devient un onglet).

import { h, tabs } from './ui.js';

const LARGE = window.matchMedia('(min-width: 1000px)');

export function workspace({ chat, panels, label, cls, store }) {
  const instances = new Map();
  const conteneurs = new Map();
  const cleStockage = store ? `panel.tab.${store}` : null;
  let courant = null;

  const items = [{ id: `${store}-conversation`, label: 'Conversation', icon: 'send', conv: true },
    ...panels.map((p) => ({ ...p, id: `${store}-${p.id}`, base: p.id }))];
  const liste = tabs(items, { label, onChange: (id) => afficher(id), cls: 'ws-tabs' });
  liste.querySelector(`#tab-${store}-conversation`)?.classList.add('tab-conv');

  const zone = h('div', { class: 'ws-panels' });
  for (const it of items.slice(1)) {
    const c = h('div', { class: 'ws-panel', role: 'tabpanel', id: `panel-${it.id}`, 'aria-labelledby': `tab-${it.id}`, hidden: true, tabindex: '-1' });
    conteneurs.set(it.id, c);
    zone.append(c);
  }
  const chatWrap = h('div', { class: 'ws-chat', role: 'tabpanel', id: `panel-${store}-conversation`, 'aria-labelledby': `tab-${store}-conversation` }, chat.el);
  const cote = h('div', { class: 'ws-side' }, liste, zone);
  const el = h('div', { class: ['workspace', cls] }, chatWrap, cote);

  function afficher(id) {
    if (LARGE.matches && id === `${store}-conversation`) { liste.select(premierPanneau()); return; }
    courant = id;
    if (cleStockage) { try { sessionStorage.setItem(cleStockage, id); } catch { /* ignoré */ } }
    const conv = id === `${store}-conversation`;
    el.classList.toggle('ws-show-chat', conv);
    for (const [pid, c] of conteneurs) {
      const visible = pid === id;
      if (visible && !instances.has(pid)) {
        const def = items.find((x) => x.id === pid);
        const inst = def.create();
        instances.set(pid, inst);
        c.append(inst.el);
      }
      if (c.hidden === visible) {
        c.hidden = !visible;
        const inst = instances.get(pid);
        if (visible) inst?.onShow?.(); else inst?.onHide?.();
      }
    }
    if (conv) chat.onShow?.();
  }

  const premierPanneau = () => items[1].id;

  LARGE.addEventListener('change', () => {
    if (LARGE.matches && courant === `${store}-conversation`) liste.select(premierPanneau());
  });

  let initial = null;
  if (cleStockage) { try { initial = sessionStorage.getItem(cleStockage); } catch { /* ignoré */ } }
  if (!items.some((x) => x.id === initial)) initial = LARGE.matches ? premierPanneau() : `${store}-conversation`;

  return {
    el,
    tabs: liste,
    onShow() {
      if (!courant) liste.select(initial);
      else instances.get(courant)?.onShow?.();
      liste.reveal();
      chat.onShow?.();
    },
    select(baseId) { liste.select(`${store}-${baseId}`); },
    instance(baseId) { return instances.get(`${store}-${baseId}`); }
  };
}
