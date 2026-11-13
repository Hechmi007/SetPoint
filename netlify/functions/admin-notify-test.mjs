// POST /api/admin/notify-test — signed-in admin sends a sample order through every configured channel.
// The "customer" WhatsApp goes to the owner's own number (OWNER_WHATSAPP), so no real client is messaged.
import { json, error, isAuthorized } from '../lib/http.mjs';
import { notifyNewOrder, channels } from '../lib/notify.mjs';

export default async (req) => {
  if (!isAuthorized(req)) return error('Non autorisé', 401);
  if (req.method !== 'POST') return error('Méthode non autorisée', 405);
  const on = channels();
  const sample = {
    ref: 'SP-TEST-0000', total: 33, shipping: { label: 'Livraison', price: 8 }, keychainName: 'Test',
    customer: { name: 'Client Test', phone: process.env.OWNER_WHATSAPP || '', governorate: 'Tunis', address: 'Adresse de test', notes: 'Ceci est un test.' },
    items: [{ name: 'Compteur de score', qty: 1, unitPrice: 25, productRef: 'SP-CS-001', font: { name: 'Sport' },
      colors: { body: { part: 'Corps', name: 'Noir' }, writing: { part: 'Écriture', name: 'Gris' } } }],
  };
  const siteUrl = process.env.SITE_URL || process.env.URL || new URL(req.url).origin;
  return json({ configured: on, results: await notifyNewOrder(sample, siteUrl) });
};

export const config = { path: '/api/admin/notify-test' };
