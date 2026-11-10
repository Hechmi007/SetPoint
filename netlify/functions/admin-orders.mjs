// GET   /api/admin/orders?status=&q=   — list orders
// PATCH /api/admin/orders  {ref, status?, adminNote?}  — update an order
import { ORDER_STATUSES } from '../../public/js/products.js';
import { listOrders, updateOrder, getOrder } from '../lib/db.mjs';
import { json, error, readJson, isAuthorized } from '../lib/http.mjs';

export default async (req) => {
  if (!isAuthorized(req)) return error('Non autorisé', 401);

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const status = url.searchParams.get('status') || undefined;
      const q = (url.searchParams.get('q') || '').slice(0, 60) || undefined;
      return json({ orders: await listOrders({ status, q }) });
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req, 4000);
      if (typeof body.ref !== 'string') return error('Référence manquante');
      const patch = {};
      if (body.status !== undefined) {
        if (!ORDER_STATUSES.some((s) => s.id === body.status)) return error('Statut invalide');
        patch.status = body.status;
      }
      if (body.adminNote !== undefined) patch.adminNote = String(body.adminNote).slice(0, 1000);

      const current = await getOrder(body.ref);
      if (!current) return error('Commande introuvable', 404);

      // production checklist: { "<itemIndex>:<piece>": true|false, "gift": true|false }
      if (body.printed !== undefined) {
        if (typeof body.printed !== 'object' || body.printed === null) return error('Format invalide');
        const entries = Object.entries(body.printed).slice(0, 200);
        if (!entries.every(([k, v]) => /^(\d{1,2}:[\w-]{1,30}|gift)$/.test(k) && typeof v === 'boolean')) return error('Format invalide');
        patch.printed = { ...(current.printed || {}), ...Object.fromEntries(entries) };
      }
      if (!Object.keys(patch).length) return error('Rien à modifier');
      patch.updatedAt = new Date().toISOString();
      if (patch.status && patch.status !== current.status) {
        patch.history = [...(current.history || []), { status: patch.status, at: patch.updatedAt }];
      }
      return json({ order: await updateOrder(body.ref, patch) });
    }

    return error('Méthode non autorisée', 405);
  } catch (e) {
    console.error(e);
    return error(e.status ? e.message : 'Erreur serveur', e.status || 500);
  }
};

export const config = { path: '/api/admin/orders' };
