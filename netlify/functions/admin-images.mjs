// POST /api/admin/images {dataUrl} — upload a product photo (already resized in the browser).
// Photos are stored in the database (`images` collection) and served by /api/img/<id>.
import { store } from '../lib/db.mjs';
import { newImageId } from '../lib/catalog.mjs';
import { json, error, readJson, isAuthorized } from '../lib/http.mjs';

const MAX_BYTES = 2_500_000;

export default async (req) => {
  if (!isAuthorized(req)) return error('Non autorisé', 401);
  if (req.method !== 'POST') return error('Méthode non autorisée', 405);
  try {
    const { dataUrl } = await readJson(req, 3_600_000);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) return error('Format d’image non pris en charge (JPEG, PNG ou WebP)');
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > MAX_BYTES) return error('Image trop lourde (max 2,5 Mo)', 413);
    const id = newImageId();
    await store.insert('images', { id, type: m[1], data: m[2], size: bytes.length, createdAt: new Date().toISOString() });
    return json({ url: `/api/img/${id}` }, 201);
  } catch (e) {
    if (e.status) return error(e.message, e.status);
    console.error('admin-images', e);
    return error('Erreur serveur', 500);
  }
};

export const config = { path: '/api/admin/images' };
