export const STATUS_LABELS = { DRAFT: 'Brouillon', SHIPPED: 'Expédié', ARRIVED: 'Arrivé' };
export const ROLE_LABELS = { ADMIN: 'Administrateur', SUPPLIER: 'Fournisseur', OPERATOR: 'Opérateur usine' };
export const TX_STATE_LABELS = { PENDING: 'En attente', CONFIRMED: 'Confirmée', FAILED: 'Échouée' };
export const TX_TYPE_LABELS = { SHIPMENT: 'Expédition', ARRIVAL: 'Arrivée' };

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'medium' });

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

export function formatDuration(seconds) {
  if (seconds == null) return '—';
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} j ${h} h`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min`;
  return `${s} s`;
}

export function shortHash(h, size = 6) {
  if (!h) return '—';
  return h.length > size * 2 + 4 ? `${h.slice(0, size + 2)}…${h.slice(-size)}` : h;
}

export const sameAddress = (a, b) => Boolean(a && b) && a.toLowerCase() === b.toLowerCase();
