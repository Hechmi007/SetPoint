// POST /api/orders — a customer places an order. Prices are recomputed server-side.
import crypto from 'node:crypto';
import { getProduct, getColor, getFont, GOVERNORATES, SHIPPING } from '../../public/js/products.js';
import { insertOrder, classifyDbError } from '../lib/db.mjs';
import { getCatalogProduct, unitPrice } from '../lib/catalog.mjs';
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
    const qty = Math.trunc(Number(raw?.qty));
    if (!(qty >= 1 && qty <= 20)) return error('Quantité invalide');
    const product = getProduct(raw?.productId);

    if (!product) {
      // catalog product created in the admin (keychains, ...)
      let cat;
      try { cat = await getCatalogProduct(String(raw?.productId ?? '').slice(0, 60)); }
      catch (e) { console.error('catalog lookup', e); return json({ error: `Impossible de vérifier le panier (code : ${classifyDbError(e)}).`, code: classifyDbError(e) }, 500); }
      if (!cat) return error('Un produit de votre panier n’est plus disponible');
      let variant = null;
      if (cat.variants.length) {
        variant = cat.variants.find((v) => v.id === raw.variantId);
        if (!variant || !variant.available) return error(`Choisissez un(e) ${cat.variantLabel.toLowerCase()} disponible pour « ${cat.name} »`);
      }
      let personalization = '';
      if (cat.personalization?.enabled) {
        personalization = clean(raw.personalization, cat.personalization.maxLength);
        if (cat.personalization.required && !personalization) return error(`${cat.personalization.label} manquant pour « ${cat.name} »`);
      }
      items.push({
        kind: 'catalog', productId: cat.id, productRef: cat.ref, name: cat.name,
        variantId: variant?.id ?? null, variantName: variant?.name ?? null, variantRef: variant?.ref ?? null,
        personalization, image: variant?.image || cat.images[0] || '', unitPrice: unitPrice(cat, variant), qty,
      });
      continue;
    }

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
    items.push({ kind: 'custom', productId: product.id, productRef: product.ref, name: product.name, unitPrice: product.price, qty, colors, font });
  }

  const subtotal = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);

  const order = {
    ref: newRef(),
    createdAt: new Date().toISOString(),
    status: 'new',
    customer,
    keychainName,
    items,
    subtotal,
    shipping: { label: SHIPPING.label, price: SHIPPING.price },
    total: subtotal + SHIPPING.price,
    history: [{ status: 'new', at: new Date().toISOString() }],
  };

  try {
    await insertOrder(order);
  } catch (e) {
    const code = classifyDbError(e);
    console.error('insertOrder failed', code, e);
    return json({ error: `Impossible d’enregistrer la commande (code : ${code}). Réessayez ou contactez-nous sur WhatsApp.`, code }, 500);
  }

  return json({ ok: true, ref: order.ref, total: order.total, shipping: order.shipping }, 201);
};

export const config = { path: '/api/orders' };
