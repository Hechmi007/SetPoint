// POST /api/quote {items, coupon} — the cart asks "what will this cost, and is my promo code good?".
// Same code path as /api/orders, so the price shown is the price charged. Nothing is saved.
import { priceCart, CartError } from '../lib/cart.mjs';
import { Invalid } from '../lib/coupons.mjs';
import { json, error, readJson, clientIp } from '../lib/http.mjs';

export default async (req, context) => {
  if (req.method !== 'POST') return error('Méthode non autorisée', 405);
  let body;
  try { body = await readJson(req); } catch (e) { return error(e.message, e.status); }
  try {
    const { pricing, couponResult } = await priceCart(body.items, body.coupon, clientIp(req, context), { requireKeychains: false });
    return json({ pricing, coupon: couponResult });
  } catch (e) {
    if (e instanceof CartError) return json({ error: e.message, ...e.extra }, e.status);
    if (e instanceof Invalid) return error(e.message, e.status);
    console.error('quote', e);
    return error('Prix momentanément indisponible', 500);
  }
};

export const config = { path: '/api/quote' };
