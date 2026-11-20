// GET /api/clubs — the Clubs page content (public).
import { getClubsPage } from '../lib/clubs.mjs';
import { json, error } from '../lib/http.mjs';

export default async (req) => {
  if (req.method !== 'GET') return error('Méthode non autorisée', 405);
  try {
    const page = await getClubsPage();
    return new Response(JSON.stringify({ page }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60' } });
  } catch (e) {
    console.error('clubs', e);
    return error('Erreur serveur', 500);
  }
};

export const config = { path: '/api/clubs' };
