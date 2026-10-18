// Navigation par fragment (#accueil, #code, …). Le fragment #pair= est traité avant le routeur.

export const ROUTES = ['accueil', 'code', 'secretaire', 'prof', 'reglages'];

export function currentRoute() {
  const r = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return ROUTES.includes(r) ? r : 'accueil';
}

export function navigate(route) {
  if (!ROUTES.includes(route)) route = 'accueil';
  if (currentRoute() === route && location.hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  location.hash = route;
}
