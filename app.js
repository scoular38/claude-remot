/* Claude Remote — application du site (aucune dépendance) */
(() => {
  'use strict';

  // ================================================================
  // Outils de base
  // ================================================================
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('cr.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('cr.' + k, JSON.stringify(v)); } catch { /* stockage plein ou bloqué */ } },
    del(k) { try { localStorage.removeItem('cr.' + k); } catch {} },
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
  const fmtNum = (n) => (n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.', ',') + ' k' : String(Math.round(n)));
  const fmtUsd = (n) => (typeof n === 'number' ? (n < 0.01 && n > 0 ? '< 0,01 $' : n.toFixed(2).replace('.', ',') + ' $') : '—');
  const fmtPct = (n) => (typeof n === 'number' ? Math.round(n) + ' %' : '—');
  const fmtSize = (b) => (b == null ? '' : b < 1024 ? b + ' o' : b < 1048576 ? (b / 1024).toFixed(1).replace('.', ',') + ' Ko' : (b / 1048576).toFixed(1).replace('.', ',') + ' Mo');
  const fmtDate = (ms) => {
    if (!ms) return '';
    const d = new Date(ms), now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  };
  const fmtDur = (sec) => {
    sec = Math.max(0, Math.round(sec));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    if (d) return `${d} j ${h} h`;
    if (h) return `${h} h ${String(m).padStart(2, '0')}`;
    return `${m} min`;
  };
  const level = (pct) => (pct >= 80 ? 'lvl-bad' : pct >= 50 ? 'lvl-warn' : '');
  let sep = '/';
  const baseName = (p) => { if (!p) return ''; const parts = p.split(/[\\/]/).filter(Boolean); return parts[parts.length - 1] || p; };

  function toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
  }

  // Mini-Markdown sûr : tout est échappé avant mise en forme.
  function md(text) {
    const parts = String(text ?? '').split(/```/);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        const body = part.replace(/^[\w+#.-]*\n/, '').replace(/\n$/, '');
        return '<pre><code>' + esc(body) + '</code></pre>';
      }
      return mdText(part);
    }).join('');
  }
  const inline = (s) => esc(s)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  function mdText(text) {
    let html = '', para = [], list = null, table = [];
    const flushPara = () => { if (para.length) { html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; } };
    const flushList = () => {
      if (list) { html += `<${list.type}>` + list.items.map((i) => '<li>' + inline(i) + '</li>').join('') + `</${list.type}>`; list = null; }
    };
    const flushTable = () => {
      if (!table.length) return;
      const cells = (l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      if (table.length >= 2 && /^\s*\|?\s*:?-{2,}/.test(table[1])) {
        const head = cells(table[0]);
        html += '<div class="tbl"><table><thead><tr>' + head.map((c) => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>'
          + table.slice(2).map((r) => '<tr>' + cells(r).map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
      } else {
        para.push(...table); flushPara();
      }
      table = [];
    };
    for (const l of text.split('\n')) {
      let m;
      if (/^\s*\|.*\|\s*$/.test(l)) { flushPara(); flushList(); table.push(l); continue; }
      flushTable();
      if (!l.trim()) { flushPara(); flushList(); continue; }
      if ((m = l.match(/^\s*[-*•]\s+(.*)$/)) || (m = l.match(/^\s*\d+[.)]\s+(.*)$/))) {
        const type = /^\s*\d/.test(l) ? 'ol' : 'ul';
        flushPara();
        if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
        list.items.push(m[1]);
        continue;
      }
      if ((m = l.match(/^#{1,6}\s+(.*)$/))) { flushPara(); flushList(); html += '<h4>' + inline(m[1]) + '</h4>'; continue; }
      if (/^\s*(---|\*\*\*)\s*$/.test(l)) { flushPara(); flushList(); html += '<hr>'; continue; }
      flushList(); para.push(l);
    }
    flushTable(); flushPara(); flushList();
    return html;
  }

  // ================================================================
  // État
  // ================================================================
  let cfg = store.get('cfg', { url: '', token: '' });
  const prefs = Object.assign({ mode: 'default', model: '', shell: null, showHidden: false, notify: false }, store.get('prefs', {}));
  const savePrefs = () => store.set('prefs', prefs);
  let status = null;
  let usage = null;
  let liveLimits = {};          // limites reçues pendant une conversation
  let project = store.get('project', null);
  let convIndex = store.get('convs', []);
  let conv = null;              // { meta, items }
  let busy = false;
  let controller = null;
  let online = false;
  const elOf = new WeakMap();   // item -> élément DOM

  // ================================================================
  // Réseau
  // ================================================================
  const apiUrl = (p) => cfg.url.replace(/\/+$/, '') + p;
  async function api(p, opts = {}) {
    const res = await fetch(apiUrl(p), {
      ...opts,
      headers: { 'Authorization': 'Bearer ' + cfg.token, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    return res;
  }
  async function apiJson(p, opts) {
    const r = await api(p, opts);
    let data = null;
    try { data = await r.json(); } catch {}
    if (!r.ok) throw new Error((data && data.error) || ('Erreur ' + r.status));
    return data;
  }
  // Lecture d'un flux SSE envoyé en réponse à un POST.
  async function readSse(res, onEvent) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        let type = 'message'; const data = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) type = line.slice(7);
          else if (line.startsWith('data: ')) data.push(line.slice(6));
        }
        if (data.length) onEvent(type, data.join('\n'));
      }
    }
  }
  const netMsg = (e) => (e && e.message === 'Failed to fetch' || e instanceof TypeError
    ? "Impossible de joindre ton ordinateur. Le serveur et le tunnel tournent-ils ? L'ordinateur est-il en veille ?"
    : (e && e.message) || String(e));

  function setConn(state, text) {
    const c = $('conn');
    c.querySelector('.dot').className = 'dot ' + (state || '');
    c.querySelector('.conn-txt').textContent = text;
    c.title = text;
  }

  async function connect() {
    if (!cfg.url || !cfg.token) { online = false; setConn('', 'Non configuré'); renderAll(); return; }
    setConn('busy', 'Connexion…');
    try {
      status = await apiJson('/api/status');
      online = true;
      sep = status.sep || '/';
      setConn('ok', status.host + ' · en ligne');
      if (!project) setProject(status.workspaceRoot, false);
      fillShells();
      refreshUsage();
    } catch (e) {
      online = false;
      setConn('bad', 'Hors ligne');
      if (/Jeton/.test(e.message)) toast('Jeton refusé : vérifie les réglages.');
    }
    renderAll();
  }

  async function refreshUsage() {
    if (!online) return;
    try { usage = await apiJson('/api/usage'); renderPills(); if (currentView === 'dashboard') renderDashboard(); } catch {}
  }
  async function refreshStatus() {
    if (!cfg.url || !cfg.token) return;
    try {
      status = await apiJson('/api/status');
      if (!online) { online = true; renderAll(); }
      setConn('ok', status.host + ' · en ligne');
    } catch { online = false; setConn('bad', 'Hors ligne'); }
  }
  setInterval(() => { refreshStatus(); refreshUsage(); }, 30000);

  // ================================================================
  // Navigation entre les vues
  // ================================================================
  let currentView = 'chat';
  function showView(v) {
    currentView = v;
    document.querySelectorAll('.nav-btn[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    document.querySelectorAll('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + v));
    if (v === 'files') loadDir(filesDir || project);
    if (v === 'dashboard') { renderDashboard(); refreshStatus().then(renderDashboard); refreshUsage(); }
    if (v === 'terminal') { renderTermHead(); setTimeout(() => $('termInput').focus(), 50); }
    if (v === 'chat') setTimeout(() => $('scroller').scrollTop = $('scroller').scrollHeight, 30);
  }
  document.querySelectorAll('.nav-btn[data-view]').forEach((b) => { b.onclick = () => showView(b.dataset.view); });
  setInterval(() => { if (currentView === 'dashboard' && !document.hidden) { refreshStatus().then(renderDashboard); } }, 10000);

  // ================================================================
  // Projet courant
  // ================================================================
  function setProject(p, openConvFlag = true) {
    if (!p) return;
    project = p;
    store.set('project', p);
    const rec = store.get('recents', []).filter((x) => x !== p);
    rec.unshift(p);
    store.set('recents', rec.slice(0, 8));
    renderProjectChip();
    if (openConvFlag) {
      const last = convIndex.filter((c) => c.cwd === p).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (last) openConv(last.id); else newConv();
    }
  }
  function renderProjectChip() {
    const isAssistant = status && project === status.assistantDir;
    $('projectName').textContent = project ? (isAssistant ? '✉ Assistant' : baseName(project)) : 'Aucun projet';
    $('projectPath').textContent = project ? '‎' + project + '‎' : '';
    $('projectChip').title = project ? project + ' — cliquer pour changer' : 'Choisir un dossier';
  }
  $('projectChip').onclick = () => { filesDir = project; showView('files'); };

  // ================================================================
  // Pastilles d'utilisation (en haut)
  // ================================================================
  function mergedLimits() {
    const l = Object.assign({}, usage && usage.limits);
    for (const [k, v] of Object.entries(liveLimits)) {
      if (!l[k] || (l[k].updatedAt || 0) < v.updatedAt) l[k] = v;
    }
    return l;
  }
  function setPill(id, pct, title) {
    const p = $(id);
    p.classList.remove('lvl-warn', 'lvl-bad');
    if (typeof pct === 'number') {
      const lv = level(pct); if (lv) p.classList.add(lv);
      p.querySelector('i').style.width = Math.min(100, pct) + '%';
      p.querySelector('.pill-val').textContent = Math.round(pct) + '%';
    } else {
      p.querySelector('i').style.width = '0';
      p.querySelector('.pill-val').textContent = '—';
    }
    if (title) p.title = title;
  }
  function resetText(epochSec) {
    if (!epochSec) return '';
    const s = epochSec - Date.now() / 1000;
    const at = new Date(epochSec * 1000);
    const when = at.toLocaleString('fr-FR', s > 86400 ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
    return s > 0 ? `réinitialisation dans ${fmtDur(s)} (${when})` : 'réinitialisée';
  }
  function renderPills() {
    const l = mergedLimits();
    const f = l.five_hour, w = l.seven_day;
    setPill('pill5h', f && f.pct, 'Limite sur 5 heures' + (f ? ' — ' + resetText(f.resetsAt) : ' — pas encore de donnée'));
    setPill('pill7d', w && w.pct, 'Limite hebdomadaire' + (w ? ' — ' + resetText(w.resetsAt) : ' — pas encore de donnée'));
    const st = conv && conv.meta.stats;
    const ctx = st && st.ctxTokens ? (st.ctxTokens / (st.ctxWindow || 200000)) * 100 : null;
    setPill('pillCtx', ctx, ctx == null ? 'Contexte de la conversation' : `Contexte : ${fmtNum(st.ctxTokens)} / ${fmtNum(st.ctxWindow || 200000)} jetons`);
    const line = $('ctxLine');
    if (ctx == null) { line.hidden = true; } else {
      line.hidden = false;
      const bar = line.querySelector('.ctx-bar');
      bar.className = 'ctx-bar ' + level(ctx);
      bar.querySelector('i').style.width = Math.min(100, ctx) + '%';
      line.querySelector('.ctx-txt').textContent = `Contexte ${Math.round(ctx)} % (${fmtNum(st.ctxTokens)} jetons)` + (ctx > 75 ? ' — pense à démarrer une nouvelle conversation' : '');
    }
  }
  $('pills').onclick = () => showView('dashboard');

  // ================================================================
  // Conversations
  // ================================================================
  function saveIndex() { store.set('convs', convIndex); }
  function saveConv() {
    if (!conv || !conv.items.length) return;
    conv.meta.updatedAt = Date.now();
    if (!convIndex.find((c) => c.id === conv.meta.id)) convIndex.unshift(conv.meta);
    saveIndex();
    store.set('conv:' + conv.meta.id, conv.items.slice(-400));
  }
  function newConv() {
    conv = {
      meta: { id: uid(), title: 'Nouvelle conversation', cwd: project, sessionId: null, createdAt: Date.now(), updatedAt: Date.now(), autoAllow: [], stats: {} },
      items: [],
    };
    store.set('activeConv', null);
    mountLog(); renderConvList(); renderChatHead(); renderPills();
    $('input').focus();
  }
  function openConv(id) {
    const meta = convIndex.find((c) => c.id === id);
    if (!meta) return newConv();
    const items = store.get('conv:' + id, []);
    // Les demandes d'autorisation restées en attente ne sont plus valables.
    items.forEach((it) => { if (it.kind === 'perm' && it.status === 'pending') it.status = 'expired'; });
    conv = { meta, items };
    if (!meta.autoAllow) meta.autoAllow = [];
    if (!meta.stats) meta.stats = {};
    store.set('activeConv', id);
    if (meta.cwd && meta.cwd !== project) { project = meta.cwd; store.set('project', project); renderProjectChip(); }
    mountLog(); renderConvList(); renderChatHead(); renderPills();
  }
  function deleteConv(id) {
    if (!confirm('Supprimer cette conversation de cet appareil ?')) return;
    convIndex = convIndex.filter((c) => c.id !== id);
    saveIndex(); store.del('conv:' + id);
    if (conv && conv.meta.id === id) newConv(); else renderConvList();
  }
  function renderConvList() {
    const list = $('convList');
    list.innerHTML = '';
    const sorted = [...convIndex].sort((a, b) => b.updatedAt - a.updatedAt);
    const here = sorted.filter((c) => c.cwd === project);
    const other = sorted.filter((c) => c.cwd !== project);
    const group = (label, arr) => {
      if (!arr.length) return;
      list.appendChild(el(`<div class="conv-group">${esc(label)}</div>`));
      for (const c of arr.slice(0, 60)) {
        const b = el(`<button class="conv-item${conv && conv.meta.id === c.id ? ' active' : ''}">
          <span class="t">${esc(c.title)}</span>
          <span class="s">${esc(baseName(c.cwd))} · ${esc(fmtDate(c.updatedAt))}${c.stats && c.stats.cost ? ' · ' + esc(fmtUsd(c.stats.cost)) : ''}</span>
          <span class="del" title="Supprimer" role="button">✕</span></button>`);
        b.onclick = (e) => {
          if (e.target.classList.contains('del')) { e.stopPropagation(); return deleteConv(c.id); }
          if (busy) return toast('Attends la fin de la réponse en cours.');
          openConv(c.id); $('convs').classList.remove('open');
        };
        list.appendChild(b);
      }
    };
    group('Ce projet', here);
    group('Autres projets', other);
    if (!sorted.length) list.appendChild(el('<p class="muted small" style="padding:8px 10px">Tes conversations apparaîtront ici.</p>'));
  }
  function renderChatHead() {
    $('chatTitle').textContent = conv ? conv.meta.title : '';
    const st = conv && conv.meta.stats || {};
    const bits = [];
    if (st.model) bits.push(st.model);
    if (st.turns) bits.push(st.turns + ' étapes');
    if (st.cost) bits.push(fmtUsd(st.cost));
    $('chatMeta').textContent = bits.join(' · ');
    const aa = conv && conv.meta.autoAllow.length ? 'Toujours autorisé : ' + conv.meta.autoAllow.map(toolLabel).join(', ') : '';
    $('autoAllowInfo').textContent = aa;
    renderQuick();
  }
  $('newChat').onclick = () => { if (busy) return toast('Attends la fin de la réponse en cours.'); newConv(); $('convs').classList.remove('open'); };
  $('toggleConvs').onclick = () => $('convs').classList.toggle('open');
  $('assistantBtn').onclick = () => {
    if (!status) return toast("Connecte-toi d'abord à ton ordinateur.");
    if (busy) return toast('Attends la fin de la réponse en cours.');
    setProject(status.assistantDir);
    $('convs').classList.remove('open');
    showView('chat');
  };

  // Suggestions affichées quand la conversation est vide
  function renderQuick() {
    const q = $('quick');
    q.innerHTML = '';
    if (!conv || conv.items.length) return;
    const isAssistant = status && project === status.assistantDir;
    const chips = isAssistant
      ? ['Écris un e-mail à … pour lui dire …', 'Résume mes e-mails non lus', 'Cherche sur le web : …', 'Ajoute une note : …', 'Qu\'est-ce que tu sais faire pour moi ?']
      : ['Explique-moi ce projet', 'Qu\'est-ce qui a changé ? (git)', 'Lance les tests et corrige les erreurs', 'Propose 3 améliorations', 'Crée un README'];
    for (const c of chips) {
      const b = el(`<button class="chip">${esc(c)}</button>`);
      b.onclick = () => { const inp = $('input'); inp.value = c.replace(/…/g, ''); inp.focus(); autosize(); };
      q.appendChild(b);
    }
  }

  // ================================================================
  // Affichage des messages
  // ================================================================
  const TOOL_INFO = {
    Bash: ['$', 'Commande'], Read: ['◱', 'Lecture'], Write: ['✎', 'Écriture'], Edit: ['✎', 'Modification'],
    MultiEdit: ['✎', 'Modifications'], NotebookEdit: ['✎', 'Notebook'], Grep: ['⌕', 'Recherche'], Glob: ['⌕', 'Fichiers'],
    LS: ['▤', 'Liste'], WebSearch: ['◎', 'Recherche web'], WebFetch: ['◎', 'Page web'], TodoWrite: ['☑', 'Tâches'],
    Task: ['◇', 'Sous-agent'], Agent: ['◇', 'Sous-agent'], ExitPlanMode: ['▶', 'Plan'], AskUserQuestion: ['?', 'Question'],
  };
  function toolLabel(name) {
    if (name === 'mcp__claude_remote__send_email') return 'E-mail';
    if (TOOL_INFO[name]) return TOOL_INFO[name][1];
    const m = String(name).match(/^mcp__(.+?)__(.+)$/);
    return m ? `${m[1].replace(/^claude_ai_/, '')} · ${m[2]}` : name;
  }
  function toolIcon(name) {
    if (name === 'mcp__claude_remote__send_email') return '✉';
    if (TOOL_INFO[name]) return TOOL_INFO[name][0];
    return /^mcp__/.test(name) ? '⚡' : '•';
  }
  function toolArg(name, inp) {
    inp = inp || {};
    if (name === 'mcp__claude_remote__send_email') return (inp.to || []).join(', ') + ' — ' + (inp.subject || '');
    const v = inp.command || inp.file_path || inp.notebook_path || inp.path || inp.pattern || inp.url || inp.query || inp.description || inp.prompt || '';
    return String(v).split('\n')[0].slice(0, 200);
  }
  const resultText = (c) => (typeof c === 'string' ? c
    : Array.isArray(c) ? c.map((x) => (x.type === 'text' ? x.text : `[${x.type}]`)).join('\n') : JSON.stringify(c, null, 2));

  function buildTool(it) {
    const st = it.result === undefined ? '<span class="st run">en cours…</span>' : it.isError ? '<span class="st err">✗ erreur</span>' : '<span class="st ok">✓</span>';
    let inputHtml;
    if (it.name === 'TodoWrite' && Array.isArray(it.input && it.input.todos)) {
      inputHtml = '<pre>' + it.input.todos.map((t) => (t.status === 'completed' ? '☑ ' : t.status === 'in_progress' ? '◐ ' : '☐ ') + esc(t.content || t.activeForm || '')).join('\n') + '</pre>';
    } else {
      inputHtml = '<pre>' + esc(JSON.stringify(it.input, null, 2)) + '</pre>';
    }
    return el(`<details class="tool"><summary><span>${esc(toolIcon(it.name))}</span><span class="tname">${esc(toolLabel(it.name))}</span>
      <span class="targ">${esc(toolArg(it.name, it.input))}</span>${st}</summary>
      ${inputHtml}${it.result !== undefined ? '<pre>' + esc(it.result) + '</pre>' : ''}</details>`);
  }

  function diffHtml(oldS, newS) {
    const o = String(oldS || '').split('\n').map((l) => '<span class="del">- ' + esc(l) + '</span>');
    const n = String(newS || '').split('\n').map((l) => '<span class="add">+ ' + esc(l) + '</span>');
    return '<pre class="diff">' + o.concat(n).join('\n') + '</pre>';
  }

  function permBody(it) {
    const inp = it.input || {};
    if (it.pkind === 'email') {
      return `<div class="mail"><div class="mail-h">
        <span>De</span><span>${esc(inp.from)}</span>
        <span>À</span><span>${esc((inp.to || []).join(', '))}</span>
        ${inp.cc && inp.cc.length ? `<span>Cc</span><span>${esc(inp.cc.join(', '))}</span>` : ''}
        <span>Objet</span><span><b>${esc(inp.subject)}</b></span></div>
        <div class="mail-b">${esc(inp.body)}</div></div>`;
    }
    if (it.pkind === 'question') {
      return (inp.questions || []).map((q, qi) => `<div class="q" data-q="${qi}"><b>${esc(q.question)}</b><div class="q-opts">
        ${(q.options || []).map((o) => `<label class="q-opt"><input type="${q.multiSelect ? 'checkbox' : 'radio'}" name="q${esc(it.id)}_${qi}" value="${esc(o.label)}">
        <span>${esc(o.label)}${o.description ? `<small>${esc(o.description)}</small>` : ''}</span></label>`).join('')}
        <label class="q-opt"><input type="${q.multiSelect ? 'checkbox' : 'radio'}" name="q${esc(it.id)}_${qi}" value="__other"><span>Autre : <input type="text" class="q-other" placeholder="ta réponse"></span></label>
        </div></div>`).join('');
    }
    switch (it.tool) {
      case 'Bash': return `<pre>${esc(inp.command)}</pre>${inp.description ? `<div class="small muted">${esc(inp.description)}</div>` : ''}`;
      case 'Write': return `<div class="small"><code>${esc(inp.file_path)}</code></div><pre>${esc(String(inp.content || '').slice(0, 6000))}</pre>`;
      case 'Edit': return `<div class="small"><code>${esc(inp.file_path)}</code></div>${diffHtml(inp.old_string, inp.new_string)}`;
      case 'MultiEdit': return `<div class="small"><code>${esc(inp.file_path)}</code></div>${(inp.edits || []).map((e) => diffHtml(e.old_string, e.new_string)).join('')}`;
      case 'ExitPlanMode': return `<div class="msg assistant">${md(inp.plan || '')}</div>`;
      case 'WebFetch': return `<div><code>${esc(inp.url)}</code></div>${inp.prompt ? `<div class="small muted">${esc(inp.prompt)}</div>` : ''}`;
      default: return `<pre>${esc(JSON.stringify(inp, null, 2))}</pre>`;
    }
  }
  function permTitle(it) {
    if (it.pkind === 'email') return '✉ Envoyer cet e-mail ?';
    if (it.pkind === 'question') return '? Claude te pose une question';
    const t = {
      Bash: 'Exécuter cette commande ?', Write: 'Créer / remplacer ce fichier ?', Edit: 'Modifier ce fichier ?',
      MultiEdit: 'Modifier ce fichier ?', WebFetch: 'Ouvrir cette page web ?', WebSearch: 'Faire cette recherche web ?',
      ExitPlanMode: 'Valider ce plan et passer à l\'action ?',
    }[it.tool];
    return t || `Utiliser l'outil « ${toolLabel(it.tool)} » ?`;
  }

  function buildPerm(it) {
    if (it.status !== 'pending') {
      const map = { allow: ['allow', it.pkind === 'email' ? '✓ E-mail validé' : '✓ Autorisé' + (it.always ? ' (toujours pour cette conversation)' : '')],
        deny: ['deny', '✗ Refusé'], timeout: ['deny', '⏱ Sans réponse — refusé'], expired: ['deny', 'Demande expirée'], cancelled: ['deny', 'Annulée'] };
      const [cls, txt] = map[it.status] || ['deny', it.status];
      return el(`<div class="perm done"><div class="perm-title">${esc(permTitle(it))} <span class="tag">${esc(toolLabel(it.tool))}</span></div>
        <details><summary class="small muted">Détails</summary>${permBody(it)}</details>
        <div class="perm-result ${cls}">${esc(txt)}</div></div>`);
    }
    const isQ = it.pkind === 'question';
    const node = el(`<div class="perm"><div class="perm-title">${esc(permTitle(it))} <span class="tag">${esc(toolLabel(it.tool))}</span></div>
      ${permBody(it)}
      <div class="perm-actions">
        ${isQ ? '<button class="btn ok" data-a="answer">Répondre</button>'
          : `<button class="btn ok" data-a="allow">${it.pkind === 'email' ? 'Envoyer l\'e-mail' : it.tool === 'ExitPlanMode' ? 'Valider le plan' : 'Autoriser'}</button>`}
        ${!isQ && it.pkind !== 'email' && it.tool !== 'ExitPlanMode' ? '<button class="btn" data-a="always">Toujours (cette conversation)</button>' : ''}
        <button class="btn danger" data-a="deny">${it.pkind === 'email' ? 'Ne pas envoyer' : isQ ? 'Ignorer' : 'Refuser'}</button>
        <input type="text" class="perm-msg" placeholder="${isQ ? 'Ou réponds librement…' : 'Instruction pour Claude (facultatif)'}">
      </div></div>`);
    node.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = () => answerPerm(it, b.dataset.a, node);
    });
    return node;
  }

  async function answerPerm(it, action, node) {
    const msg = node.querySelector('.perm-msg').value.trim();
    const body = { id: it.id };
    if (action === 'answer') {
      const answers = {};
      (it.input.questions || []).forEach((q, qi) => {
        const box = node.querySelector(`[data-q="${qi}"]`);
        const vals = [...box.querySelectorAll('input:checked')].map((i) => (i.value === '__other' ? box.querySelector('.q-other').value.trim() : i.value)).filter(Boolean);
        if (vals.length) answers[q.question] = q.multiSelect ? vals : vals[0];
      });
      if (!Object.keys(answers).length && !msg) return toast('Choisis une réponse ou écris-en une.');
      Object.assign(body, { decision: 'allow', answers });
      if (msg) body.response = msg;
    } else if (action === 'deny') {
      Object.assign(body, { decision: 'deny', message: msg });
    } else {
      Object.assign(body, { decision: 'allow', always: action === 'always' });
      if (msg) toast('Le message n\'est envoyé qu\'avec un refus.');
    }
    node.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      await apiJson('/api/permission', { method: 'POST', body: JSON.stringify(body) });
      it.status = body.decision; it.always = !!body.always;
      if (body.always && !conv.meta.autoAllow.includes(it.tool)) { conv.meta.autoAllow.push(it.tool); renderChatHead(); }
      updateItem(it); saveConv(); updatePermBadge();
    } catch (e) {
      toast(netMsg(e));
      node.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    }
  }

  function buildItem(it) {
    switch (it.kind) {
      case 'user': return el(`<div class="msg user">${esc(it.text)}</div>`);
      case 'assistant': return el(`<div class="msg assistant">${md(it.text)}</div>`);
      case 'meta': return el(`<div class="msg meta">${esc(it.text)}</div>`);
      case 'error': return el(`<div class="msg error">${esc(it.text)}</div>`);
      case 'tool': return buildTool(it);
      case 'perm': return buildPerm(it);
      default: return el('<div></div>');
    }
  }
  const thinkingEl = el('<div class="thinking"><i></i><i></i><i></i><span>Claude travaille…</span></div>');

  function emptyState() {
    if (!cfg.url) {
      return el(`<div class="empty"><div class="logo"></div><h2>Bienvenue</h2>
        <p>Pour commencer, ouvre <b>Réglages</b> et colle l'adresse de ton tunnel et ton jeton d'accès.</p></div>`);
    }
    const isAssistant = status && project === status.assistantDir;
    return el(`<div class="empty"><div class="logo"></div>
      <h2>${isAssistant ? 'Ton assistant personnel' : esc(baseName(project) || 'Nouveau projet')}</h2>
      <p>${isAssistant
        ? 'Demande-lui d\'écrire et d\'envoyer des e-mails, de chercher sur le web, de prendre des notes… Chaque e-mail te sera montré avant l\'envoi.'
        : 'Claude travaille directement dans ce dossier, sur ton ordinateur. Change de dossier avec le bouton en haut à gauche.'}</p>
      ${online ? '' : '<p class="small">⚠ Ton ordinateur ne répond pas pour l\'instant.</p>'}</div>`);
  }

  function mountLog() {
    const log = $('log');
    log.innerHTML = '';
    if (!conv || !conv.items.length) { log.appendChild(emptyState()); return; }
    for (const it of conv.items) { const n = buildItem(it); elOf.set(it, n); log.appendChild(n); }
    if (busy) log.appendChild(thinkingEl);
    scrollDown(true);
  }
  function addItem(it) {
    const log = $('log');
    const s = $('scroller');
    const wasNear = s.scrollHeight - s.scrollTop - s.clientHeight < 260;
    if (!conv.items.length) log.innerHTML = '';
    conv.items.push(it);
    const n = buildItem(it); elOf.set(it, n);
    log.appendChild(n);
    if (busy) log.appendChild(thinkingEl);
    // Une demande d'autorisation doit toujours être visible.
    if (it.kind === 'perm') requestAnimationFrame(() => n.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    else if (it.kind === 'user') scrollDown(true);
    else if (wasNear) scrollDown(true);
  }
  function updateItem(it) {
    const old = elOf.get(it);
    const n = buildItem(it);
    if (old && old.isConnected) old.replaceWith(n);
    elOf.set(it, n);
  }
  function scrollDown(force) {
    const s = $('scroller');
    const near = s.scrollHeight - s.scrollTop - s.clientHeight < 260;
    if (force || near) requestAnimationFrame(() => { s.scrollTop = s.scrollHeight; });
  }

  // ================================================================
  // Envoi d'un message et traitement du flux
  // ================================================================
  function setBusy(b) {
    busy = b;
    const s = $('send');
    s.classList.toggle('stop', b); s.classList.toggle('primary', !b);
    s.innerHTML = b ? '■' : '➤';
    s.setAttribute('aria-label', b ? 'Arrêter' : 'Envoyer');
    if (b) $('log').appendChild(thinkingEl); else thinkingEl.remove();
  }

  let toolIdx = {};
  function handleStream(type, raw) {
    let data;
    try { data = JSON.parse(raw); } catch { data = raw; }

    if (type === 'job') return;
    if (type === 'error') { addItem({ kind: 'error', text: data.message || String(data) }); return; }
    if (type === 'done') return;
    if (type === 'permission') {
      const it = { kind: 'perm', id: data.id, pkind: data.kind, tool: data.tool, input: data.input, status: 'pending' };
      addItem(it); saveConv(); updatePermBadge();
      notify(it.pkind === 'email' ? 'E-mail à valider' : 'Claude a besoin de ton accord', permTitle(it));
      return;
    }
    if (type === 'permission_done') {
      const it = conv.items.find((x) => x.kind === 'perm' && x.id === data.id);
      if (it && it.status === 'pending') { it.status = data.decision; it.always = data.always; updateItem(it); saveConv(); updatePermBadge(); }
      return;
    }
    if (type === 'permission_auto') return;
    if (type !== 'message' || typeof data !== 'object' || !data) return;

    const m = data, st = conv.meta.stats;
    if (m.session_id) conv.meta.sessionId = m.session_id;
    if (m.type === 'system' && m.subtype === 'init') {
      if (m.model) st.model = m.model;
    } else if (m.type === 'rate_limit_event' && m.rate_limit_info) {
      const i = m.rate_limit_info;
      if (i.rateLimitType) {
        const prev = liveLimits[i.rateLimitType] || {};
        const pct = typeof i.utilization === 'number' ? (i.utilization <= 1 ? i.utilization * 100 : i.utilization) : prev.pct;
        const r = typeof i.resetsAt === 'number' ? (i.resetsAt > 1e12 ? i.resetsAt / 1000 : i.resetsAt) : prev.resetsAt;
        liveLimits[i.rateLimitType] = { pct, resetsAt: r, status: i.status, updatedAt: Date.now() };
        renderPills();
        if (i.status === 'rejected') addItem({ kind: 'error', text: 'Limite d\'utilisation atteinte. ' + (r ? resetText(r) : '') });
      }
    } else if (m.type === 'assistant' && m.message) {
      const u = m.message.usage;
      if (u && !m.parent_tool_use_id) {
        st.ctxTokens = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
        renderPills();
      }
      for (const c of m.message.content || []) {
        if (c.type === 'text' && c.text.trim()) addItem({ kind: 'assistant', text: c.text });
        if (c.type === 'tool_use') {
          const it = { kind: 'tool', id: c.id, name: c.name, input: c.input };
          toolIdx[c.id] = it; addItem(it);
        }
      }
    } else if (m.type === 'user' && m.message && Array.isArray(m.message.content)) {
      for (const c of m.message.content) {
        if (c.type !== 'tool_result') continue;
        const it = toolIdx[c.tool_use_id] || conv.items.find((x) => x.kind === 'tool' && x.id === c.tool_use_id);
        if (!it) continue;
        const t = resultText(c.content);
        it.result = t.length > 12000 ? t.slice(0, 12000) + '\n… (tronqué)' : t;
        it.isError = !!c.is_error;
        updateItem(it);
      }
    } else if (m.type === 'result') {
      st.cost = (st.cost || 0) + (typeof m.total_cost_usd === 'number' ? m.total_cost_usd : 0);
      st.turns = (st.turns || 0) + (m.num_turns || 0);
      const u = m.usage || {};
      st.input = (st.input || 0) + (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      st.output = (st.output || 0) + (u.output_tokens || 0);
      if (m.modelUsage) {
        const wins = Object.values(m.modelUsage).map((x) => x && x.contextWindow).filter(Boolean);
        if (wins.length) st.ctxWindow = Math.max(...wins);
      }
      const bits = [];
      if (m.is_error || (m.subtype && m.subtype !== 'success')) bits.push('⚠ ' + ({ error_max_turns: 'nombre d\'étapes maximum atteint', error_during_execution: 'erreur pendant l\'exécution' }[m.subtype] || m.subtype || 'erreur'));
      if (m.num_turns) bits.push(m.num_turns + ' étape' + (m.num_turns > 1 ? 's' : ''));
      if (m.duration_ms) bits.push(fmtDur(m.duration_ms / 1000).replace('0 min', Math.round(m.duration_ms / 1000) + ' s'));
      if (typeof m.total_cost_usd === 'number') bits.push('≈ ' + fmtUsd(m.total_cost_usd));
      if (bits.length) addItem({ kind: 'meta', text: bits.join(' · ') });
      renderPills(); renderChatHead();
    }
  }

  async function send() {
    if (busy) { if (controller) controller.abort(); return; }
    const inp = $('input');
    const prompt = inp.value.trim();
    if (!prompt) return;
    if (!cfg.url || !cfg.token) { openSettings(); return; }
    if (!project) { toast('Choisis d\'abord un dossier de projet.'); return; }

    inp.value = ''; autosize();
    if (!conv.items.length) {
      conv.meta.title = prompt.replace(/\s+/g, ' ').slice(0, 60);
      conv.meta.cwd = project;
    }
    addItem({ kind: 'user', text: prompt });
    saveConv(); renderConvList(); renderChatHead();
    setBusy(true);
    controller = new AbortController();
    toolIdx = {};

    try {
      const res = await api('/api/chat', {
        method: 'POST', signal: controller.signal,
        body: JSON.stringify({
          prompt, cwd: conv.meta.cwd, sessionId: conv.meta.sessionId,
          permissionMode: prefs.mode, model: prefs.model || undefined, autoAllow: conv.meta.autoAllow,
        }),
      });
      if (!res.ok || !res.body) {
        let msg = 'Erreur ' + res.status;
        try { msg = (await res.json()).error || msg; } catch {}
        throw new Error(msg);
      }
      online = true; setConn('ok', (status ? status.host : 'Ordinateur') + ' · en ligne');
      await readSse(res, (t, d) => handleStream(t, d));
      notify('Claude a terminé', conv.meta.title);
    } catch (e) {
      if (e.name === 'AbortError') addItem({ kind: 'meta', text: '⏹ Arrêté' });
      else { addItem({ kind: 'error', text: netMsg(e) }); if (e instanceof TypeError) { online = false; setConn('bad', 'Hors ligne'); } }
    } finally {
      conv.items.forEach((it) => { if (it.kind === 'perm' && it.status === 'pending') { it.status = 'cancelled'; updateItem(it); } });
      setBusy(false); controller = null;
      saveConv(); renderConvList(); renderChatHead(); updatePermBadge();
      refreshUsage();
    }
  }

  $('send').onclick = send;
  const isTouch = () => matchMedia('(pointer: coarse)').matches;
  $('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isTouch()) { e.preventDefault(); send(); }
  });
  function autosize() { const i = $('input'); i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, innerHeight * 0.4) + 'px'; }
  $('input').addEventListener('input', autosize);

  $('mode').value = prefs.mode;
  $('mode').onchange = () => {
    prefs.mode = $('mode').value; savePrefs();
    if (prefs.mode === 'bypassPermissions') toast('⚠ Claude pourra tout faire sans te demander (les e-mails restent confirmés).', 4500);
  };
  $('model').value = prefs.model;
  $('model').onchange = () => { prefs.model = $('model').value; savePrefs(); };

  // ================================================================
  // Notifications
  // ================================================================
  function updatePermBadge() {
    const n = conv ? conv.items.filter((i) => i.kind === 'perm' && i.status === 'pending').length : 0;
    $('permBadge').hidden = n === 0;
    document.title = n ? `(${n}) Accord demandé — Claude Remote` : 'Claude Remote';
  }
  function notify(title, body) {
    if (!document.hidden) return;
    try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch {}
    if (prefs.notify && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body, icon: 'icon.svg', tag: 'claude-remote' }); } catch {}
    }
  }

  // ================================================================
  // Terminal
  // ================================================================
  const term = Object.assign({ cwd: null, prevCwd: null, history: [] }, store.get('term', {}));
  let termBusy = false, termCtl = null, hIdx = -1;
  const saveTerm = () => store.set('term', { cwd: term.cwd, prevCwd: term.prevCwd, history: term.history.slice(-100) });

  function fillShells() {
    const sel = $('shell');
    const shells = (status && status.shells) || ['bash'];
    const names = { powershell: 'PowerShell', cmd: 'Invite de commandes (cmd)', bash: 'bash', sh: 'sh' };
    sel.innerHTML = shells.map((s) => `<option value="${esc(s)}">${esc(names[s] || s)}</option>`).join('');
    if (!prefs.shell || !shells.includes(prefs.shell)) prefs.shell = shells[0];
    sel.value = prefs.shell;
    if (!term.cwd) term.cwd = project || (status && status.home);
    renderTermHead();
  }
  $('shell').onchange = () => { prefs.shell = $('shell').value; savePrefs(); };

  function renderTermHead() {
    $('termCwd').textContent = '‎' + (term.cwd || '~') + '‎';
    const isWin = prefs.shell === 'powershell' || prefs.shell === 'cmd';
    $('termPrompt').textContent = (baseName(term.cwd) || '~') + (isWin ? ' >' : ' $');
    if (status && !status.terminal) {
      $('termOut').innerHTML = '<div class="e">Le terminal est désactivé (enableTerminal dans config.json).</div>';
    }
  }
  function termWrite(text, cls) {
    const out = $('termOut');
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = stripAnsi(text);
    out.appendChild(span);
    // On limite la taille de l'affichage.
    while (out.childNodes.length > 4000) out.removeChild(out.firstChild);
    out.scrollTop = out.scrollHeight;
  }
  function termSetBusy(b) {
    termBusy = b;
    $('termStop').disabled = !b;
    $('termRun').disabled = b;
  }

  async function runCommand(command) {
    if (termBusy) return;
    if (!online) return toast('Ordinateur hors ligne.');
    command = command.trim();
    if (!command) return;
    term.history = term.history.filter((h) => h !== command); term.history.push(command); hIdx = -1; saveTerm();
    if (/^(clear|cls)$/i.test(command)) { $('termOut').innerHTML = ''; return; }
    const head = document.createElement('div');
    head.className = 'cmd';
    head.innerHTML = `<span>${esc(baseName(term.cwd))}</span> ${esc(command)}`;
    $('termOut').appendChild(head);
    termSetBusy(true);
    termCtl = new AbortController();
    try {
      const res = await api('/api/exec', {
        method: 'POST', signal: termCtl.signal,
        body: JSON.stringify({ command, cwd: term.cwd, shell: prefs.shell, prevCwd: term.prevCwd }),
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) { let m = 'Erreur ' + res.status; try { m = (await res.json()).error || m; } catch {} throw new Error(m); }
      if (ct.includes('application/json')) {
        const d = await res.json();
        if (d.cwd && d.cwd !== term.cwd) { term.prevCwd = d.prevCwd || term.cwd; term.cwd = d.cwd; saveTerm(); renderTermHead(); }
        if (d.output) termWrite(d.output, d.error ? 'e' : '');
      } else {
        await readSse(res, (t, raw) => {
          let d; try { d = JSON.parse(raw); } catch { return; }
          if (t === 'out') termWrite(d.t, d.s === 'e' ? 'e' : '');
          if (t === 'exit') {
            const out = $('termOut');
            if (out.lastChild && out.lastChild.textContent && !out.lastChild.textContent.endsWith('\n')) termWrite('\n');
            termWrite(`[code ${d.code === null ? 'interrompu' : d.code} · ${(d.ms / 1000).toFixed(1).replace('.', ',')} s]\n`, 'x' + (d.code ? ' bad' : ''));
          }
        });
      }
    } catch (e) {
      if (e.name === 'AbortError') termWrite('^C\n', 'x bad');
      else termWrite(netMsg(e) + '\n', 'e');
    } finally {
      termSetBusy(false); termCtl = null;
      $('termInput').focus();
    }
  }
  $('termForm').onsubmit = (e) => { e.preventDefault(); const i = $('termInput'); const c = i.value; i.value = ''; runCommand(c); };
  $('termInput').addEventListener('keydown', (e) => {
    const h = term.history;
    if (e.key === 'ArrowUp' && h.length) {
      e.preventDefault(); hIdx = hIdx < 0 ? h.length - 1 : Math.max(0, hIdx - 1); e.target.value = h[hIdx];
    } else if (e.key === 'ArrowDown' && hIdx >= 0) {
      e.preventDefault(); hIdx++; if (hIdx >= h.length) { hIdx = -1; e.target.value = ''; } else e.target.value = h[hIdx];
    } else if (e.key === 'c' && e.ctrlKey && termBusy) { e.preventDefault(); termCtl && termCtl.abort(); }
  });
  $('termStop').onclick = () => termCtl && termCtl.abort();
  $('termClear').onclick = () => { $('termOut').innerHTML = ''; };
  $('termToProject').onclick = () => { if (project) { term.prevCwd = term.cwd; term.cwd = project; saveTerm(); renderTermHead(); toast('Terminal : ' + baseName(project)); } };
  document.querySelectorAll('.term-keys [data-k]').forEach((b) => {
    b.onclick = () => { const k = b.dataset.k; if (k.endsWith(' run') || k === 'npm run') { $('termInput').value = k + ' '; $('termInput').focus(); } else runCommand(k); };
  });

  // ================================================================
  // Fichiers
  // ================================================================
  let filesDir = null, filesData = null;

  function isUnderRoots(p) {
    if (!status) return false;
    const n = (s) => (sep === '\\' ? s.toLowerCase() : s);
    return status.roots.some((r) => { const nr = n(r), np = n(p); return np === nr || np.startsWith(nr.endsWith(sep) ? nr : nr + sep); });
  }

  async function loadDir(p) {
    if (!online) { $('entries').innerHTML = '<p class="muted" style="padding:10px">Ordinateur hors ligne.</p>'; renderPlaces(); return; }
    p = p || (status && status.workspaceRoot);
    try {
      filesData = await apiJson('/api/fs/list?path=' + encodeURIComponent(p));
      filesDir = filesData.path;
    } catch (e) {
      toast(e.message);
      if (p !== status.workspaceRoot) return loadDir(status.workspaceRoot);
      return;
    }
    renderFiles();
  }

  function renderCrumbs(p) {
    const box = $('crumbs');
    box.innerHTML = '';
    let parts, acc;
    if (sep === '\\') { parts = p.split('\\').filter(Boolean); acc = ''; }
    else { parts = p.split('/').filter(Boolean); acc = ''; }
    const paths = parts.map((part, i) => {
      if (sep === '\\') acc = i === 0 ? part + '\\' : (acc.endsWith('\\') ? acc : acc + '\\') + part;
      else acc = acc + '/' + part;
      return [part, acc];
    });
    if (sep !== '\\') paths.unshift(['/', '/']);
    paths.forEach(([label, full], i) => {
      if (i > 0 && !(sep !== '\\' && i === 1)) box.appendChild(el(`<span class="sep">${esc(sep)}</span>`));
      if (isUnderRoots(full)) {
        const b = el(`<button>${esc(label)}</button>`);
        b.onclick = () => loadDir(full);
        box.appendChild(b);
      } else {
        box.appendChild(el(`<span class="muted" style="padding:2px 5px">${esc(label)}</span>`));
      }
    });
  }

  function renderFiles() {
    const d = filesData;
    if (!d) return;
    renderCrumbs(d.path);
    const tags = [];
    if (d.path === project) tags.push('<span class="tagc on">● Projet actuel</span>');
    if (status && d.path === status.assistantDir) tags.push('<span class="tagc on">✉ Dossier assistant</span>');
    if (d.isGit) tags.push('<span class="tagc">git</span>');
    if (d.hasClaudeMd) tags.push('<span class="tagc">CLAUDE.md</span>');
    $('dirTags').innerHTML = tags.join('');
    const favs = store.get('favs', []);
    $('favToggle').textContent = favs.includes(d.path) ? '★ Favori' : '☆ Favori';
    $('useAsProject').disabled = d.path === project;
    $('useAsProject').textContent = d.path === project ? '✓ Projet actuel' : '✓ Utiliser ce dossier comme projet';

    const box = $('entries');
    box.innerHTML = '';
    if (d.parent) {
      const up = el('<div class="entry dir"><span class="ei">↑</span><span class="en">..</span><span class="es"></span><span class="ed"></span></div>');
      up.onclick = () => loadDir(d.parent);
      box.appendChild(up);
    }
    const list = d.entries.filter((e) => prefs.showHidden || !e.name.startsWith('.'));
    for (const e of list) {
      const row = el(`<div class="entry${e.dir ? ' dir' : ''}"><span class="ei">${e.dir ? '▸' : '·'}</span>
        <span class="en">${esc(e.name)}</span><span class="es">${e.dir ? '' : esc(fmtSize(e.size))}</span><span class="ed">${esc(fmtDate(e.mtime))}</span></div>`);
      const full = d.path.endsWith(sep) ? d.path + e.name : d.path + sep + e.name;
      row.onclick = () => (e.dir ? loadDir(full) : previewFile(full));
      box.appendChild(row);
    }
    if (!list.length) box.appendChild(el('<p class="muted small" style="padding:10px">Dossier vide.</p>'));
    if (d.truncated) box.appendChild(el('<p class="muted small" style="padding:10px">Liste tronquée (2000 éléments maximum).</p>'));
    renderPlaces();
  }

  function placeBtn(label, p) {
    const b = el(`<button class="place" title="${esc(p)}"><b>${esc(label)}</b><span>&lrm;${esc(p)}&lrm;</span></button>`);
    b.onclick = () => loadDir(p);
    return b;
  }
  function renderPlaces() {
    const roots = $('placeRoots'); roots.innerHTML = '';
    if (status) {
      roots.appendChild(placeBtn('Projets', status.workspaceRoot));
      roots.appendChild(placeBtn('✉ Assistant', status.assistantDir));
      for (const r of status.roots) if (r !== status.workspaceRoot && r !== status.assistantDir) roots.appendChild(placeBtn(r === status.home ? 'Dossier personnel' : baseName(r), r));
    }
    const favs = store.get('favs', []);
    const fbox = $('placeFavs'); fbox.innerHTML = '';
    favs.forEach((f) => fbox.appendChild(placeBtn(baseName(f), f)));
    if (!favs.length) fbox.innerHTML = '<p class="muted small" style="margin:0 8px">Aucun favori</p>';
    const rec = store.get('recents', []);
    const rbox = $('placeRecents'); rbox.innerHTML = '';
    rec.forEach((f) => rbox.appendChild(placeBtn(baseName(f), f)));
    if (!rec.length) rbox.innerHTML = '<p class="muted small" style="margin:0 8px">Rien pour l\'instant</p>';
  }

  $('useAsProject').onclick = () => {
    if (!filesDir) return;
    if (busy) return toast('Attends la fin de la réponse en cours.');
    setProject(filesDir);
    toast('Projet : ' + baseName(filesDir));
    showView('chat');
  };
  $('openTermHere').onclick = () => { if (!filesDir) return; term.prevCwd = term.cwd; term.cwd = filesDir; saveTerm(); showView('terminal'); };
  $('favToggle').onclick = () => {
    if (!filesDir) return;
    let favs = store.get('favs', []);
    favs = favs.includes(filesDir) ? favs.filter((f) => f !== filesDir) : [filesDir, ...favs].slice(0, 20);
    store.set('favs', favs); renderFiles();
  };
  $('mkdirBtn').onclick = async () => {
    if (!filesDir) return;
    const name = prompt('Nom du nouveau dossier :');
    if (!name) return;
    try { const r = await apiJson('/api/fs/mkdir', { method: 'POST', body: JSON.stringify({ path: filesDir, name }) }); loadDir(r.path); }
    catch (e) { toast(e.message); }
  };
  $('showHidden').checked = prefs.showHidden;
  $('showHidden').onchange = () => { prefs.showHidden = $('showHidden').checked; savePrefs(); renderFiles(); };

  let previewPath = null;
  async function previewFile(p) {
    previewPath = p;
    $('previewName').textContent = baseName(p);
    $('previewInfo').textContent = '';
    $('previewBody').textContent = 'Chargement…';
    $('preview').showModal();
    try {
      const d = await apiJson('/api/fs/read?path=' + encodeURIComponent(p));
      $('previewInfo').textContent = fmtSize(d.size) + (d.truncated ? ' · aperçu tronqué' : '');
      $('previewBody').textContent = d.binary ? 'Fichier binaire : aperçu impossible.' : d.content;
    } catch (e) { $('previewBody').textContent = e.message; }
  }
  $('previewClose').onclick = () => $('preview').close();
  $('previewAsk').onclick = () => {
    $('preview').close();
    showView('chat');
    const rel = project && previewPath.startsWith(project) ? previewPath.slice(project.length).replace(/^[\\/]/, '') : previewPath;
    $('input').value = `Regarde le fichier ${rel} et `;
    $('input').focus(); autosize();
  };

  // ================================================================
  // Tableau de bord
  // ================================================================
  const LIMIT_NAMES = {
    five_hour: 'Session (5 h)', seven_day: 'Semaine (7 j)', seven_day_opus: 'Semaine · Opus',
    seven_day_sonnet: 'Semaine · Sonnet', overage: 'Dépassement', spend_limit: 'Plafond de dépense',
  };
  function meter(pct) {
    return `<div class="meter ${level(pct || 0)}"><i style="width:${Math.min(100, pct || 0)}%"></i></div>`;
  }
  function renderDashboard() {
    // Limites
    const l = mergedLimits();
    const order = ['five_hour', 'seven_day', ...Object.keys(l).filter((k) => k !== 'five_hour' && k !== 'seven_day')];
    const rows = order.filter((k) => l[k]).map((k) => {
      const v = l[k];
      return `<div class="limit"><span class="ln">${esc(LIMIT_NAMES[k] || k)}</span>${meter(v.pct)}<span class="lv">${esc(fmtPct(v.pct))}</span>
        <span class="lr">${esc(resetText(v.resetsAt))}${v.status === 'rejected' ? ' · <b>limite atteinte</b>' : v.status === 'allowed_warning' ? ' · proche de la limite' : ''}</span></div>`;
    });
    const latest = Math.max(0, ...Object.values(l).map((v) => v.updatedAt || 0));
    $('limitsSrc').textContent = latest ? 'mis à jour ' + fmtDate(latest) : '';
    $('limits').innerHTML = rows.length ? rows.join('') : `<div class="note">
      Pas encore de donnée. Les pourcentages apparaissent après ton premier message (abonnement Claude Pro ou Max uniquement),
      ou dès que tu utilises Claude Code sur ton PC si tu as activé la barre d'état (voir README).</div>`;

    // Conversation
    const st = conv && conv.meta.stats || {};
    const ctx = st.ctxTokens ? (st.ctxTokens / (st.ctxWindow || 200000)) * 100 : null;
    $('convStats').innerHTML = `
      <div class="sys-meter"><span>Contexte</span>${meter(ctx)}<span>${esc(fmtPct(ctx))}</span></div>
      <dl class="kv">
        <dt>Titre</dt><dd>${esc(conv ? conv.meta.title : '—')}</dd>
        <dt>Projet</dt><dd>${esc(baseName(conv && conv.meta.cwd))}</dd>
        <dt>Modèle</dt><dd>${esc(st.model || '—')}</dd>
        <dt>Jetons en contexte</dt><dd>${esc(fmtNum(st.ctxTokens))} / ${esc(fmtNum(st.ctxWindow || 200000))}</dd>
        <dt>Jetons lus / écrits</dt><dd>${esc(fmtNum(st.input))} / ${esc(fmtNum(st.output))}</dd>
        <dt>Étapes</dt><dd>${esc(st.turns || 0)}</dd>
        <dt>Coût estimé*</dt><dd>${esc(fmtUsd(st.cost || 0))}</dd>
        <dt>Session</dt><dd class="mono">${esc(conv && conv.meta.sessionId ? conv.meta.sessionId.slice(0, 8) : '—')}</dd>
      </dl><p class="muted small">* Équivalent tarif API. Avec un abonnement, ce n'est pas facturé : ce sont les limites ci-dessus qui comptent.</p>`;

    // 7 jours
    const days = (usage && usage.days) || [];
    const max = Math.max(1, ...days.map((d) => d.runs));
    const todayStr = new Date().toLocaleDateString('sv-SE');
    $('days').innerHTML = days.length ? `<div class="bars">${days.map((d) => `<div class="b${d.date === todayStr ? ' today' : ''}" title="${esc(d.runs)} message(s) · ${esc(fmtUsd(d.cost))} · ${esc(fmtNum(d.input))} jetons lus">
        <span>${d.runs || ''}</span><i style="height:${(d.runs / max) * 100}%"></i><span>${esc(new Date(d.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short' }))}</span></div>`).join('')}</div>
        <p class="muted small">Messages envoyés à Claude depuis le site. Coût estimé sur 7 jours : ${esc(fmtUsd(days.reduce((a, d) => a + d.cost, 0)))}</p>`
      : '<p class="muted small">Aucune donnée.</p>';

    // Système
    if (status) {
      const memPct = status.mem ? (1 - status.mem.free / status.mem.total) * 100 : null;
      $('hostName').textContent = status.host;
      $('system').innerHTML = `
        <div class="sys-meter"><span>Processeur</span>${meter(status.cpu)}<span>${esc(fmtPct(status.cpu))}</span></div>
        <div class="sys-meter"><span>Mémoire</span>${meter(memPct)}<span>${esc(fmtPct(memPct))}</span></div>
        <dl class="kv">
          <dt>Système</dt><dd>${esc(status.os)} (${esc(status.arch)})</dd>
          <dt>Allumé depuis</dt><dd>${esc(fmtDur(status.uptime))}</dd>
          <dt>Mémoire</dt><dd>${esc(fmtSize(status.mem.total - status.mem.free))} / ${esc(fmtSize(status.mem.total))}</dd>
          <dt>Claude Code</dt><dd>${esc(status.claude || 'introuvable ⚠')}</dd>
          <dt>Node.js</dt><dd>${esc(status.node)}</dd>
          <dt>Tâches en cours</dt><dd>${esc(status.jobs)}</dd>
          <dt>Serveur</dt><dd>v${esc(status.version)} · ${esc(fmtDur(status.serverUptime))}</dd>
        </dl>`;
      $('configInfo').innerHTML = `<dl class="kv">
          <dt>Terminal</dt><dd>${status.terminal ? 'activé' : 'désactivé'}</dd>
          <dt>Envoi d'e-mails</dt><dd>${status.email ? 'configuré ✓' : 'non configuré'}</dd>
          <dt>Dossier projets</dt><dd class="mono" title="${esc(status.workspaceRoot)}">${esc(status.workspaceRoot)}</dd>
          <dt>Dossier assistant</dt><dd class="mono" title="${esc(status.assistantDir)}">${esc(status.assistantDir)}</dd>
          <dt>Dossiers permis</dt><dd class="mono">${status.roots.map(esc).join('<br>')}</dd>
        </dl>${status.email ? '' : '<div class="note">Pour que ton assistant envoie des e-mails, remplis la section « smtp » de config.json (voir README).</div>'}`;
    } else {
      $('system').innerHTML = '<p class="muted small">Ordinateur hors ligne.</p>';
      $('configInfo').innerHTML = '';
    }
  }

  // ================================================================
  // Réglages
  // ================================================================
  function openSettings() {
    $('serverUrl').value = cfg.url; $('token').value = cfg.token;
    $('testResult').textContent = ''; $('testResult').className = 'small';
    $('notifToggle').checked = prefs.notify;
    $('settings').showModal();
  }
  $('openSettings').onclick = openSettings;
  $('testBtn').onclick = async () => {
    const out = $('testResult');
    out.className = 'small'; out.textContent = 'Test en cours…';
    try {
      const r = await fetch($('serverUrl').value.trim().replace(/\/+$/, '') + '/api/health', { headers: { 'Authorization': 'Bearer ' + $('token').value.trim() } });
      if (r.status === 401) throw new Error('jeton refusé');
      if (!r.ok) throw new Error('erreur ' + r.status);
      const h = await r.json();
      out.className = 'small good'; out.textContent = `✓ Connecté à « ${h.host} » (serveur v${h.version || '?'})`;
    } catch (e) {
      out.className = 'small bad';
      out.textContent = '✗ ' + (e instanceof TypeError
        ? "injoignable : serveur ou tunnel éteint, adresse incorrecte, ou adresse de ce site absente d'allowedOrigins"
        : e.message);
    }
  };
  $('forget').onclick = () => {
    if (!confirm('Effacer l\'adresse, le jeton et l\'historique de cet appareil ?')) return;
    try { Object.keys(localStorage).filter((k) => k.startsWith('cr.')).forEach((k) => localStorage.removeItem(k)); } catch {}
    location.reload();
  };
  $('notifToggle').onchange = async () => {
    const on = $('notifToggle').checked;
    if (on && 'Notification' in window && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { $('notifToggle').checked = false; toast('Notifications refusées par le navigateur.'); return; }
    }
    prefs.notify = $('notifToggle').checked; savePrefs();
  };
  $('settingsForm').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'save') {
      cfg = { url: $('serverUrl').value.trim(), token: $('token').value.trim() };
      store.set('cfg', cfg);
      connect();
    }
  });

  // ================================================================
  // Démarrage
  // ================================================================
  function renderAll() {
    renderProjectChip();
    if (!conv) {
      const active = store.get('activeConv', null);
      if (active && convIndex.find((c) => c.id === active)) openConv(active); else newConv();
    } else { mountLog(); renderConvList(); renderChatHead(); }
    renderPills();
    if (currentView === 'files') loadDir(filesDir || project);
    if (currentView === 'dashboard') renderDashboard();
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshStatus(); refreshUsage(); } });
  window.addEventListener('beforeunload', (e) => { if (busy) { e.preventDefault(); e.returnValue = ''; } });

  renderAll();
  if (!cfg.url) openSettings(); else connect();
})();
