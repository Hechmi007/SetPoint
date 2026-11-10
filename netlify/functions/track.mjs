// POST /api/track {ref, phone} — a customer checks their order status.
// Both the order reference AND the phone number used for the order are required, and only
// non-sensitive details are returned (no address). 10 wrong tries from one IP → blocked 15 minutes.
import { ORDER_STATUSES } from '../../public/js/products.js';
import { getOrder, countFailedLogins, recordFailedLogin } from '../lib/db.mjs';
import { json, error, readJson, clientIp } from '../lib/http.mjs';

const digits = (s) => String(s ?? '').replace(/\D/g, '').slice(-8);

export default async (req, context) => {
  if (req.method !== 'POST') return error('Méthode non autorisée', 405);
  let body;
  try { body = await readJson(req, 2000); } catch (e) { return error(e.message, e.status); }
  const ref = String(body.ref ?? '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 30);
  const phone = digits(body.phone);
  if (!/^SP-\d{6}-[A-F0-9]{4}$/.test(ref)) return error('Référence invalide (format SP-AAMMJJ-XXXX)');
  if (phone.length < 8) return error('Numéro de téléphone invalide');

  const key = 'track:' + clientIp(req, context);
  try {
    if (await countFailedLogins(key) >= 10) return error('Trop de tentatives. Réessayez dans 15 minutes.', 429);
    const o = await getOrder(ref);
    if (!o || digits(o.customer?.phone) !== phone) {
      await recordFailedLogin(key);
      return error('Commande introuvable. Vérifiez la référence et le numéro utilisé pour la commande.', 404);
    }
    return json({ order: {
      ref: o.ref,
      createdAt: o.createdAt,
      status: o.status,
      statusLabel: ORDER_STATUSES.find((s) => s.id === o.status)?.label || o.status,
      history: (o.history || []).map((h) => ({ status: h.status, at: h.at })),
      firstName: String(o.customer?.name || '').split(' ')[0],
      items: o.items.map((it) => ({ name: it.name, qty: it.qty, variant: it.variantName || null, personalization: it.personalization || null })),
      total: o.total,
      shipping: o.shipping,
    } });
  } catch (e) {
    console.error('track', e);
    return error('Service momentanément indisponible', 500);
  }
};

export const config = { path: '/api/track' };
