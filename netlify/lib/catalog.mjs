// Catalog products created from the admin (keychains, etc.), stored in the `products` collection.
// The customizable score counter stays built in (public/js/products.js) because it has its own SVG.
// Everything an admin sends is cleaned here: text is length-limited and stored as plain text
// (pages always escape it), image URLs are restricted, prices are numbers.
import crypto from 'node:crypto';
import { store } from './db.mjs';
import { PRODUCTS } from '../../public/js/products.js';

export const LAYOUTS = ['classic', 'gallery', 'story'];
export const SECTION_TYPES = ['text', 'features', 'image', 'specs'];

const text = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const line = (v, max) => text(v, max).replace(/\s+/g, ' ');
const bool = (v) => v === true || v === 'true' || v === 'on';
const money = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n >= 0 && n <= 10000 ? Math.round(n * 1000) / 1000 : null; };
export const slugify = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const refify = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 30);

/** Only our own uploads, files from /img, or https links. */
export function imageUrl(u) {
  const s = line(u, 400);
  if (/^\/api\/img\/[a-f0-9]{32}$/.test(s)) return s;
  if (/^\/img\/[\w.\-]+$/.test(s)) return s;
  if (/^https:\/\/[^\s"'<>()]+$/.test(s)) return s;
  return '';
}

class Invalid extends Error { constructor(m) { super(m); this.status = 400; } }

function cleanSection(raw) {
  const type = SECTION_TYPES.includes(raw?.type) ? raw.type : null;
  if (!type) return null;
  if (type === 'text') return { type, title: line(raw.title, 100), body: text(raw.body, 4000) };
  if (type === 'features') {
    return { type, title: line(raw.title, 100),
      items: (Array.isArray(raw.items) ? raw.items : []).slice(0, 12)
        .map((it) => ({ icon: line(it?.icon, 8), title: line(it?.title, 80), text: text(it?.text, 400) }))
        .filter((it) => it.title || it.text) };
  }
  if (type === 'image') return { type, url: imageUrl(raw.url), caption: line(raw.caption, 200), wide: bool(raw.wide) };
  return { type, title: line(raw.title, 100),
    rows: (Array.isArray(raw.rows) ? raw.rows : []).slice(0, 30)
      .map((r) => ({ label: line(r?.label, 60), value: line(r?.value, 200) })).filter((r) => r.label || r.value) };
}

/** Validates and normalizes a product sent by the admin. Throws Invalid with a French message. */
export function cleanProduct(raw, { existingId } = {}) {
  const name = line(raw?.name, 80);
  if (name.length < 2) throw new Invalid('Nom du produit manquant');
  const id = existingId || slugify(raw.id || name);
  if (!id) throw new Invalid('Identifiant invalide');
  if (PRODUCTS.some((p) => p.id === id)) throw new Invalid('Cet identifiant est réservé');
  const ref = refify(raw.ref);
  if (ref.length < 2) throw new Invalid('Référence manquante (ex. SP-PC-001)');
  const price = money(raw.price);
  if (price === null) throw new Invalid('Prix invalide');

  const variants = [];
  for (const [i, v] of (Array.isArray(raw.variants) ? raw.variants : []).slice(0, 50).entries()) {
    const vname = line(v?.name, 60);
    if (!vname) continue;
    const vid = slugify(v.id) || slugify(vname) || `v${i + 1}`;
    const vref = refify(v.ref) || `${ref}-${String(i + 1).padStart(2, '0')}`;
    if (variants.some((x) => x.id === vid)) throw new Invalid(`Deux variantes portent le même nom : « ${vname} »`);
    if (variants.some((x) => x.ref === vref)) throw new Invalid(`Référence de variante en double : ${vref}`);
    const vprice = v?.price === '' || v?.price === null || v?.price === undefined ? null : money(v.price);
    if (vprice === null && !(v?.price === '' || v?.price === null || v?.price === undefined)) throw new Invalid(`Prix invalide pour « ${vname} »`);
    variants.push({ id: vid, name: vname, ref: vref, price: vprice, image: imageUrl(v?.image), available: v?.available !== false });
  }

  const p = raw.personalization || {};
  const maxLength = Math.min(40, Math.max(1, Math.trunc(Number(p.maxLength)) || 15));

  return {
    id, ref, name, price,
    status: raw.status === 'published' ? 'published' : 'draft',
    category: line(raw.category, 40),
    tagline: line(raw.tagline, 160),
    description: text(raw.description, 3000),
    layout: LAYOUTS.includes(raw.layout) ? raw.layout : 'classic',
    images: (Array.isArray(raw.images) ? raw.images : []).map(imageUrl).filter(Boolean).slice(0, 12),
    sections: (Array.isArray(raw.sections) ? raw.sections : []).slice(0, 20).map(cleanSection).filter(Boolean),
    variantLabel: line(raw.variantLabel, 40) || 'Modèle',
    variants,
    personalization: { enabled: bool(p.enabled), label: line(p.label, 80) || 'Prénom à graver', maxLength, required: bool(p.required) },
  };
}

export const unitPrice = (product, variant) => variant?.price ?? product.price;

export async function getCatalogProduct(id, { includeDrafts = false } = {}) {
  if (typeof id !== 'string' || !id) return null;
  const p = await store.get('products', { id: slugify(id) });
  if (!p || (!includeDrafts && p.status !== 'published')) return null;
  return p;
}

/** Card data for the shop grid. */
export function summary(p) {
  const prices = [p.price, ...p.variants.filter((v) => v.available && v.price !== null).map((v) => v.price)];
  return { id: p.id, ref: p.ref, name: p.name, tagline: p.tagline, category: p.category, image: p.images[0] || '',
    price: p.price, minPrice: Math.min(...prices), status: p.status, kind: 'catalog' };
}

export const newImageId = () => crypto.randomBytes(16).toString('hex');
