// GET /api/products          — published catalog products (cards for the shop grid)
// GET /api/products?id=slug  — one product with all its details (drafts only for a signed-in admin: preview)
import { store } from '../lib/db.mjs';
import { getCatalogProduct, summary } from '../lib/catalog.mjs';
import { json, error, isAuthorized } from '../lib/http.mjs';

export default async (req) => {
  if (req.method !== 'GET') return error('Méthode non autorisée', 405);
  const id = new URL(req.url).searchParams.get('id');
  try {
    if (id) {
      const admin = isAuthorized(req);
      const product = await getCatalogProduct(id, { includeDrafts: admin });
      if (!product) return error('Produit introuvable', 404);
      return new Response(JSON.stringify({ product }), { headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': admin || product.status !== 'published' ? 'no-store' : 'public, max-age=60' } });
    }
    const rows = await store.find('products', { status: 'published' }, { sortBy: 'createdAt', desc: false });
    return new Response(JSON.stringify({ products: rows.map(summary) }), { headers: {
      'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60' } });
  } catch (e) {
    console.error('products', e);
    return error('Catalogue indisponible', 500);
  }
};

export const config = { path: '/api/products' };
