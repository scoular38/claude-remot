// Rendu Markdown + KaTeX sûr : tout HTML issu d'un agent passe par DOMPurify (configuration renforcée).
// Les formules sont extraites avant marked (qui abîmerait « _ » et « \\ »), puis rendues par KaTeX
// (trust:false) dans des emplacements créés APRÈS la purification.

import { h } from './ui.js';
import { authBlobUrl } from './api.js';

const DEBUT = '';
const FIN = '';

const PURIFY = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'iframe', 'frame', 'object', 'embed',
    'svg', 'math', 'link', 'meta', 'base', 'audio', 'video', 'source', 'track', 'picture', 'dialog', 'template'],
  FORBID_ATTR: ['style', 'srcset', 'action', 'formaction', 'background', 'ping', 'id', 'name'],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  RETURN_DOM_FRAGMENT: true
};

let crochetsPoses = false;
function poserCrochets() {
  if (crochetsPoses || !window.DOMPurify) return;
  crochetsPoses = true;
  window.DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // Pas de classes arbitraires (fausses cartes/boutons) : seulement nos emplacements et la coloration du code.
    if (node.hasAttribute && node.hasAttribute('class')) {
      const ok = node.getAttribute('class').split(/\s+/).filter((c) => /^(mathph(-\d+)?|language-[\w-]+)$/.test(c));
      if (ok.length) node.setAttribute('class', ok.join(' ')); else node.removeAttribute('class');
    }
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      if (!/^(https?:|mailto:|#)/i.test(href)) node.removeAttribute('href');
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
      node.setAttribute('referrerpolicy', 'no-referrer');
    }
    if (node.tagName === 'IMG') {
      // Seules les images du PC (/api/media/…) sont chargées, avec le jeton en en-tête.
      const src = node.getAttribute('src') || '';
      node.removeAttribute('src');
      if (/^\/?api\/media\/[^?#]+$/i.test(src)) node.setAttribute('data-media', src.startsWith('/') ? src : `/${src}`);
      else node.setAttribute('data-blocked', '1');
      node.setAttribute('loading', 'lazy');
      node.setAttribute('referrerpolicy', 'no-referrer');
    }
  });
}

/** Sépare le texte en segments code / non-code pour ne pas toucher aux formules dans le code. */
function extraireMaths(src) {
  const maths = [];
  const morceaux = src.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]+`)/g);
  const out = morceaux.map((m, i) => {
    if (i % 2 === 1) return m;   // code
    return m.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$\w])\$(?![\s$])((?:\\\$|[^$\n])+?)(?<![\s\\])\$(?![\w$])/g,
      (tout, a, b, c, d) => {
        const display = a !== undefined || b !== undefined;
        const tex = a ?? b ?? c ?? d;
        maths.push({ tex, display });
        const jeton = `${DEBUT}${maths.length - 1}${FIN}`;
        return display ? `\n\n${jeton}\n\n` : jeton;
      });
  });
  return { texte: out.join(''), maths };
}

function texteBrut(texte) {
  return h('div', { class: 'md md-plain', text: texte });
}

/** Renvoie un élément <div class="md"> rendu et purifié. */
export function renderMarkdown(texte, { math = true } = {}) {
  const src = String(texte ?? '');
  if (!window.marked || !window.DOMPurify) return texteBrut(src);
  poserCrochets();
  const { texte: prepare, maths } = math ? extraireMaths(src) : { texte: src, maths: [] };
  let html;
  try {
    html = window.marked.parse(prepare, { gfm: true, breaks: true, async: false });
  } catch {
    return texteBrut(src);
  }
  // Emplacements des formules : simples <span class="mathph-N"> (ni style, ni data-*).
  html = html.replace(new RegExp(`${DEBUT}(\\d+)${FIN}`, 'g'), (t, i) => `<span class="mathph mathph-${i}"></span>`);
  const frag = window.DOMPurify.sanitize(html, PURIFY);
  const div = h('div', { class: 'md' });
  div.append(frag);

  for (const span of div.querySelectorAll('span.mathph')) {
    const m = /mathph-(\d+)/.exec(span.className);
    const f = m ? maths[+m[1]] : null;
    span.className = f?.display ? 'math math-display' : 'math';
    if (!f) continue;
    if (window.katex) {
      try {
        window.katex.render(f.tex, span, { displayMode: f.display, throwOnError: false, trust: false, strict: 'ignore', maxSize: 40, maxExpand: 500, output: 'htmlAndMathml' });
      } catch { span.textContent = f.tex; }
    } else {
      span.textContent = f.display ? `$$${f.tex}$$` : `$${f.tex}$`;
    }
  }
  // Une formule seule dans son paragraphe : centrée.
  for (const p of div.querySelectorAll('p')) {
    if (p.childNodes.length === 1 && p.firstChild.classList?.contains('math-display')) p.classList.add('math-block');
  }
  for (const img of div.querySelectorAll('img[data-blocked]')) {
    img.replaceWith(h('span', { class: 'img-blocked', text: `[image externe non chargée${img.alt ? ` : ${img.alt}` : ''}]` }));
  }
  for (const img of div.querySelectorAll('img[data-media]')) {
    const chemin = img.getAttribute('data-media');
    img.removeAttribute('data-media');
    img.classList.add('md-img');
    authBlobUrl(chemin).then((u) => { img.src = u; }).catch(() => img.replaceWith(h('span', { class: 'img-blocked', text: '[image indisponible]' })));
  }
  for (const table of div.querySelectorAll('table')) {
    const wrap = h('div', { class: 'table-wrap' });
    table.replaceWith(wrap);
    wrap.append(table);
  }
  return div;
}
