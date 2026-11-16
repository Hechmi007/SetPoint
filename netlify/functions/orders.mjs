// POST /api/orders — a customer places an order. Items, packs, promo code and prices are all recomputed server-side.
import crypto from 'node:crypto';
import { GOVERNORATES } from '../../public/js/products.js';
import { insertOrder, updateOrder, classifyDbError } from '../lib/db.mjs';
import { notifyNewOrder } from '../lib/notify.mjs';
import { priceCart, CartError } from '../lib/cart.mjs';
import { Invalid } from '../lib/coupons.mjs';
import { json, error, readJson, clientIp } from '../lib/http.mjs';

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function newRef() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
  return `SP-${ymd}-${rand}`;
}

export default async (req, context) => {
  if (req.method !== 'POST') return error('Méthode non autorisée', 405);

  let body;
  try { body = await readJson(req); } catch (e) { return error(e.message, e.status); }

  if (body.website) return json({ ok: true, ref: 'SP-000000-0000' }); // honeypot: silently drop bots

  const c = body.customer || {};
  const customer = {
    name: clean(c.name, 80),
    phone: clean(c.phone, 20).replace(/[^\d+ ]/g, ''),
    governorate: clean(c.governorate, 40),
    address: clean(c.address, 300),
    notes: clean(c.notes, 500),
  };

  if (customer.name.length < 2) return error('Nom manquant');
  if (customer.phone.replace(/\D/g, '').length < 8) return error('Numéro de téléphone invalide');
  if (!GOVERNORATES.includes(customer.governorate)) return error('Gouvernorat invalide');
  if (customer.address.length < 5) return error('Adresse manquante');

  let priced;
  try { priced = await priceCart(body.items, body.coupon, clientIp(req, context), { legacyKeychain: clean(body.keychainName, 20) }); }
  catch (e) {
    if (e instanceof CartError) return json({ error: e.message, ...e.extra }, e.status);
    if (e instanceof Invalid) return error(e.message, e.status);
    console.error('priceCart', e);
    return json({ error: `Impossible de vérifier la commande (code : ${classifyDbError(e)}).`, code: classifyDbError(e) }, 500);
  }
  const { items, pricing, coupon, couponResult } = priced;
  // A code the customer typed but that cannot be used: refuse, so nobody is surprised by the price afterwards.
  if (couponResult && !couponResult.ok) return json({ error: couponResult.error, coupon: couponResult }, 400);

  const keychainNames = items.flatMap((it) => it.keychains || []);   // one free keychain per counter, in cart order
  const now = new Date().toISOString();
  const order = {
    ref: newRef(),
    createdAt: now,
    status: 'new',
    customer,
    keychainNames,
    keychainName: keychainNames.join(', '),           // joined copy for older code paths
    items,
    subtotal: pricing.listSubtotal,                   // list prices, before packs and codes
    packs: pricing.packs,                             // [{ id, name, size, count, price, saving }]
    packDiscount: pricing.packDiscount,
    couponCode: coupon ? coupon.code : null,          // top-level so the admin can count uses per code
    coupon: coupon ? { code: coupon.code, label: coupon.label, type: coupon.type, value: coupon.value, discount: pricing.couponDiscount, commission: coupon.commission || 0 } : null,
    shipping: { label: pricing.shipping.label, price: pricing.shipping.price },
    total: pricing.total,
    history: [{ status: 'new', at: now }],
  };

  try {
    await insertOrder(order);
  } catch (e) {
    const code = classifyDbError(e);
    console.error('insertOrder failed', code, e);
    return json({ error: `Impossible d’enregistrer la commande (code : ${code}). Réessayez ou contactez-nous sur WhatsApp.`, code }, 500);
  }

  // The order is saved; now tell the owner (email / WhatsApp) and the customer (WhatsApp).
  // Capped at 8 s and never allowed to fail the order: the outcome is stored on it for the admin.
  try {
    const siteUrl = process.env.SITE_URL || process.env.URL || new URL(req.url).origin;
    const notifications = await Promise.race([
      notifyNewOrder(order, siteUrl),
      new Promise((resolve) => setTimeout(() => resolve({ email: 'failed: délai dépassé', telegram: 'failed: délai dépassé', ownerWhatsapp: 'failed: délai dépassé', clientWhatsapp: 'failed: délai dépassé', at: new Date().toISOString() }), 8000)),
    ]);
    await updateOrder(order.ref, { notifications });
  } catch (e) { console.error('notifications', e); }

  return json({ ok: true, ref: order.ref, total: order.total, shipping: order.shipping, packs: order.packs, keychains: keychainNames.length, coupon: order.coupon && { code: order.coupon.code, discount: order.coupon.discount } }, 201);
};

export const config = { path: '/api/orders' };
