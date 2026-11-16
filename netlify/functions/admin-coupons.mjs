// Admin promo-code management (signed-in admin only)
// GET    /api/admin/coupons              — all codes
// POST   /api/admin/coupons  {coupon}    — create
// PATCH  /api/admin/coupons  {code, coupon} — update (the code itself never changes: orders refer to it)
// DELETE /api/admin/coupons?code=CODE    — delete
import { store } from '../lib/db.mjs';
import { cleanCoupon, normalizeCode, Invalid } from '../lib/coupons.mjs';
import { json, error, readJson, isAuthorized } from '../lib/http.mjs';

export default async (req) => {
  if (!isAuthorized(req)) return error('Non autorisé', 401);
  try {
    if (req.method === 'GET') return json({ coupons: await store.find('coupons', {}, { sortBy: 'createdAt', desc: true }) });

    if (req.method === 'POST') {
      const coupon = cleanCoupon((await readJson(req, 4000)).coupon);
      if (await store.get('coupons', { code: coupon.code })) return error(`Le code ${coupon.code} existe déjà`, 409);
      const now = new Date().toISOString();
      return json({ coupon: await store.insert('coupons', { ...coupon, createdAt: now, updatedAt: now }) }, 201);
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req, 4000);
      const code = normalizeCode(body.code);
      const current = code && await store.get('coupons', { code });
      if (!current) return error('Code introuvable', 404);
      const coupon = cleanCoupon({ ...body.coupon, code });
      return json({ coupon: await store.update('coupons', { code }, { ...coupon, updatedAt: new Date().toISOString() }) });
    }

    if (req.method === 'DELETE') {
      const code = normalizeCode(new URL(req.url).searchParams.get('code'));
      if (!(await store.remove('coupons', { code }))) return error('Code introuvable', 404);
      return json({ ok: true });
    }

    return error('Méthode non autorisée', 405);
  } catch (e) {
    if (e instanceof Invalid) return error(e.message, e.status);
    if (e.status) return error(e.message, e.status);
    console.error('admin-coupons', e);
    return error('Erreur serveur', 500);
  }
};

export const config = { path: '/api/admin/coupons' };
