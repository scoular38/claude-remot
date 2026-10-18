// Accès Google : via les proxies /api/google/* du PC (qui détient le secret complet),
// ou directement au pont avec le secret « rappels » quand le PC est éteint (rappels uniquement).

import { api, unwrap, bridgeCall, bridgeConfigured, pcOnline, ApiError } from './api.js';

const exigerPc = (quoi) => {
  if (!pcOnline()) throw new ApiError(`${quoi} a besoin du PC (allumé et joignable).`, { offline: true });
};

/** Liste des rappels en attente. Renvoie {items, via:'pc'|'pont'}. */
export async function listReminders() {
  if (pcOnline()) {
    try { return { items: normaliserListe(unwrap(await api('/api/google/reminders'))), via: 'pc' }; } catch (e) {
      if (!bridgeConfigured()) throw e;
    }
  }
  if (bridgeConfigured()) return { items: normaliserListe(await bridgeCall('reminders.list', {})), via: 'pont' };
  throw new ApiError('PC éteint et pont Google non configuré sur cet appareil.', { offline: true });
}

function normaliserListe(d) {
  const l = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : Array.isArray(d?.rappels) ? d.rappels : [];
  return l.filter((r) => !r.statut || r.statut === 'en_attente').sort((a, b) => String(a.quand).localeCompare(String(b.quand)));
}

/**
 * Rappel rapide : parle DIRECTEMENT au pont (marche PC éteint).
 * Repli par le PC seulement si le pont n'est pas configuré sur cet appareil. Jamais de nouvel essai automatique.
 */
export async function addReminderQuick({ quand, message, repetition }) {
  if (bridgeConfigured()) return bridgeCall('reminders.add', { quand, message, repetition, agent: 'panel' });
  if (pcOnline()) return unwrap(await api('/api/google/reminders', { method: 'POST', body: { quand, message, repetition } }));
  throw new ApiError('Pont Google non configuré et PC éteint : impossible de programmer le rappel.', { offline: true });
}

export async function cancelReminder(id) {
  if (pcOnline()) return unwrap(await api(`/api/google/reminders/${encodeURIComponent(id)}`, { method: 'DELETE' }));
  if (bridgeConfigured()) return bridgeCall('reminders.cancel', { id });
  throw new ApiError('PC éteint et pont non configuré.', { offline: true });
}

export async function searchMails(q) {
  exigerPc('La lecture des mails');
  const d = unwrap(await api('/api/google/mails', { query: { q } }));
  return Array.isArray(d) ? d : [];
}

export async function agenda(days = 7) {
  exigerPc("L'agenda");
  const d = unwrap(await api('/api/google/agenda', { query: { days } }));
  return Array.isArray(d) ? d : [];
}

export async function getBriefConfig() {
  exigerPc("L'éditeur du brief");
  const d = unwrap(await api('/api/google/brief-config'));
  return d && d.config && !d.jours ? d.config : d;
}

/** Corps envoyé : la configuration elle-même (forme du §8). */
export async function setBriefConfig(config) {
  exigerPc("L'enregistrement du brief");
  const d = unwrap(await api('/api/google/brief-config', { method: 'PUT', body: config }));
  return d && d.config && !d.jours ? d.config : d;
}

export async function sendBriefNow() {
  exigerPc("L'envoi du brief");
  return unwrap(await api('/api/google/brief-send-now', { method: 'POST', body: {} }));
}
