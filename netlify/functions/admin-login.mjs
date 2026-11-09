// POST /api/admin/login {password, key} — exchange the admin password for an 8-hour session token.
// `key` is the secret admin path (ADMIN_PATH): without it, nobody can even try passwords.
// After 5 failed attempts from one IP, logins from that IP are refused for 15 minutes.
import { json, error, readJson, issueToken, verifyPassword, secretEquals, adminConfigured, clientIp } from '../lib/http.mjs';
import { countFailedLogins, recordFailedLogin, clearFailedLogins } from '../lib/db.mjs';

const MAX_FAILURES = 5;

export default async (req, context) => {
  if (req.method !== 'POST') return error('Méthode non autorisée', 405);
  if (!adminConfigured()) return error('Admin non configuré sur le serveur', 503);

  let body;
  try { body = await readJson(req, 2000); } catch (e) { return error(e.message, e.status); }
  if (!secretEquals(body.key ?? '', process.env.ADMIN_PATH)) return error('Not found', 404);

  const ip = clientIp(req, context);
  try {
    if (await countFailedLogins(ip) >= MAX_FAILURES) {
      return error('Trop de tentatives. Réessayez dans 15 minutes.', 429);
    }
    if (!(await verifyPassword(body.password))) {
      await recordFailedLogin(ip);
      await new Promise((r) => setTimeout(r, 600));
      return error('Mot de passe incorrect', 401);
    }
    await clearFailedLogins(ip);
  } catch (e) {
    console.error('login failed', e);
    return error('Erreur serveur', 500);
  }
  return json({ token: issueToken() });
};

export const config = { path: '/api/admin/login' };
