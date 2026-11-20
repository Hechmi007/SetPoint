// Admin editing of the Clubs page (signed-in admin only)
// GET /api/admin/clubs          — current content (no cache)
// PUT /api/admin/clubs {page}   — replace it
import { cleanClubsPage, getClubsPage, saveClubsPage } from '../lib/clubs.mjs';
import { json, error, readJson, isAuthorized } from '../lib/http.mjs';

export default async (req) => {
  if (!isAuthorized(req)) return error('Non autorisé', 401);
  try {
    if (req.method === 'GET') return json({ page: await getClubsPage() });
    if (req.method === 'PUT') {
      const body = await readJson(req, 300_000);
      return json({ page: await saveClubsPage(cleanClubsPage(body.page)) });
    }
    return error('Méthode non autorisée', 405);
  } catch (e) {
    if (e.status) return error(e.message, e.status);
    console.error('admin-clubs', e);
    return error('Erreur serveur', 500);
  }
};

export const config = { path: '/api/admin/clubs' };
