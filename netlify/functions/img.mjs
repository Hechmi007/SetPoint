// GET /api/img/<id> — serves an uploaded product photo. Ids are random and photos never change,
// so browsers and Netlify's CDN may cache them for a year (the database is only hit once).
import { store } from '../lib/db.mjs';

export default async (req, context) => {
  const id = String(context?.params?.id ?? new URL(req.url).pathname.split('/').pop());
  if (!/^[a-f0-9]{32}$/.test(id)) return new Response('Not found', { status: 404 });
  try {
    const img = await store.get('images', { id });
    if (!img) return new Response('Not found', { status: 404 });
    return new Response(Buffer.from(img.data, 'base64'), { headers: {
      'content-type': img.type,
      'cache-control': 'public, max-age=31536000, immutable',
      'netlify-cdn-cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    } });
  } catch (e) {
    console.error('img', e);
    return new Response('Error', { status: 500 });
  }
};

export const config = { path: '/api/img/:id' };
