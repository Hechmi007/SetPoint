// POST /api/orders — a customer places an order. Prices are recomputed server-side.
import crypto from 'node:crypto';
import { getProduct, getColor, getFont, GOVERNORATES, SHIPPING } from '../../public/js/products.js';
import { insertOrder } from '../lib/db.mjs';
import { json, error, readJson } from '../lib/http.mjs';

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function newRef() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
  return `SP-${ymd}-${rand}`;
}

export default async (req) => {
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
  const keychainName = clean(body.keychainName, 20);

  if (customer.name.length < 2) return error('Nom manquant');
  if (customer.phone.replace(/\D/g, '').length < 8) return error('Numéro de téléphone invalide');
  if (!GOVERNORATES.includes(customer.governorate)) return error('Gouvernorat invalide');
  if (customer.address.length < 5) return error('Adresse manquante');

  if (!Array.isArray(body.items) || body.items.length === 0) return error('Panier vide');
  if (body.items.length > 20) return error('Trop d’articles dans une commande');

  const items = [];
  for (const raw of body.items) {
    const product = getProduct(raw?.productId);
    if (!product) return error('Produit inconnu');
    const qty = Math.trunc(Number(raw.qty));
    if (!(qty >= 1 && qty <= 20)) return error('Quantité invalide');
    const colors = {};
    for (const part of product.parts) {
      const color = getColor(raw.colors?.[part.id]);
      if (!color || !color.available) return error(`Couleur invalide pour « ${part.label} »`);
      colors[part.id] = { id: color.id, name: color.name, hex: color.hex, part: part.label };
    }
    let font = null;
    if (product.fontPart) {
      const f = getFont(raw.font ?? product.defaultFont);
      if (!f || !f.available) return error('Police invalide');
      font = { id: f.id, name: f.name, family: f.family };
    }
    items.push({ productId: product.id, name: product.name, unitPrice: product.price, qty, colors, font });
  }

  const subtotal = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
  const freeShipping = SHIPPING.freeGovernorates.includes(customer.governorate);

  const order = {
    ref: newRef(),
    createdAt: new Date().toISOString(),
    status: 'new',
    customer,
    keychainName,
    items,
    subtotal,
    shipping: freeShipping ? { label: 'Gratuite Grand Tunis', price: 0 } : { label: 'À confirmer', price: null },
    total: subtotal,
    history: [{ status: 'new', at: new Date().toISOString() }],
  };

  try {
    await insertOrder(order);
  } catch (e) {
    console.error('insertOrder failed', e);
    return error('Impossible d’enregistrer la commande. Réessayez ou contactez-nous sur WhatsApp.', 500);
  }

  return json({ ok: true, ref: order.ref, total: order.total, shipping: order.shipping }, 201);
};

export const config = { path: '/api/orders' };
