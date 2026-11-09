// GET /api/health — is the server configured and can it reach the database? Reveals no secrets.
import { pingDb, classifyDbError } from '../lib/db.mjs';
import { json, adminConfigured } from '../lib/http.mjs';

export default async () => {
  let db;
  try { db = await pingDb(); } catch (e) { console.error('health db', e); db = classifyDbError(e); }
  return json({
    db,
    settings: {
      MONGODB_URI: !!process.env.MONGODB_URI,
      MONGODB_DB: !!process.env.MONGODB_DB,
      admin: adminConfigured(),
    },
  }, db === 'ok' ? 200 : 503);
};

export const config = { path: '/api/health' };
