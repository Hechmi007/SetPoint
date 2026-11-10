// Admin product management (signed-in admin only)
// GET    /api/admin/products            — all catalog products + the built-in ones (read-only)
// POST   /api/admin/products  {product} — create
// PATCH  /api/admin/products  {id, product} — update (the URL id never changes once created)
// DELETE /api/admin/products?id=slug    — delete
import { PRODUCTS } from '../../public/js/products.js';
import { store } from '../lib/db.mjs';
import { cleanProduct, slugify } from '../lib/catalog.mjs';
import { json, error, readJson, isAuthorized } from '../lib/http.mjs';

async function refTaken(ref, exceptId) {
  if (PRODUCTS.some((p) => p.ref === ref)) return true;
  const other = await store.get('products', { ref });
  return !!other && other.id !== exceptId;
}

export default async (req) => {
  if (!isAuthorized(req)) return error('Non autorisé', 401);
  try {
    if (req.method === 'GET') {
      return json({
        products: await store.find('products', {}, { sortBy: 'createdAt', desc: true }),
        builtIn: PRODUCTS.map((p) => ({ id: p.id, ref: p.ref, name: p.name, price: p.price, image: p.image, kind: 'custom' })),
      });
    }

    if (req.method === 'POST') {
      const body = await readJson(req, 100_000);
      const product = cleanProduct(body.product);
      if (await store.get('products', { id: product.id })) return error(`Un produit utilise déjà l’adresse « ${product.id} »`, 409);
      if (await refTaken(product.ref)) return error(`La référence ${product.ref} est déjà utilisée`, 409);
      const now = new Date().toISOString();
      const doc = { ...product, createdAt: now, updatedAt: now };
      await store.insert('products', doc);
      return json({ product: doc }, 201);
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req, 100_000);
      const id = slugify(body.id);
      const current = id && await store.get('products', { id });
      if (!current) return error('Produit introuvable', 404);
      const product = cleanProduct(body.product, { existingId: id });
      if (await refTaken(product.ref, id)) return error(`La référence ${product.ref} est déjà utilisée`, 409);
      return json({ product: await store.update('products', { id }, { ...product, updatedAt: new Date().toISOString() }) });
    }

    if (req.method === 'DELETE') {
      const id = slugify(new URL(req.url).searchParams.get('id'));
      if (!(await store.remove('products', { id }))) return error('Produit introuvable', 404);
      return json({ ok: true });
    }

    return error('Méthode non autorisée', 405);
  } catch (e) {
    if (e.status) return error(e.message, e.status);
    console.error('admin-products', e);
    return error('Erreur serveur', 500);
  }
};

export const config = { path: '/api/admin/products' };
