// Thème clair / sombre : automatique (prefers-color-scheme) ou forcé par l'utilisateur.

const CLE = 'panel.theme';

export function currentTheme() {
  try { return localStorage.getItem(CLE) || 'auto'; } catch { return 'auto'; }
}

export function applyTheme(v = currentTheme()) {
  const racine = document.documentElement;
  if (v === 'light' || v === 'dark') racine.setAttribute('data-theme', v);
  else racine.removeAttribute('data-theme');
  try { if (v === 'auto') localStorage.removeItem(CLE); else localStorage.setItem(CLE, v); } catch { /* ignoré */ }
  const sombre = v === 'dark' || (v === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sombre ? '#12151c' : '#f5f6fa');
}
