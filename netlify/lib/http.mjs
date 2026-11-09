import crypto from 'node:crypto';

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const error = (message, status = 400) => json({ error: message }, status);

export async function readJson(req, maxBytes = 20_000) {
  const text = await req.text();
  if (text.length > maxBytes) throw Object.assign(new Error('Requête trop volumineuse'), { status: 413 });
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('JSON invalide'), { status: 400 }); }
}

// ---------- admin sessions: stateless HMAC-signed tokens ----------
// AUTH_SECRET must be a long random string. Changing it logs out every admin session.
const secret = () => (process.env.AUTH_SECRET || '').length >= 32 ? process.env.AUTH_SECRET : '';
const sign = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

export function issueToken(hours = 8) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + hours * 3600_000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function isAuthorized(req) {
  if (!secret()) return false;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}

/** Constant-time string comparison (avoids leaking how many characters matched). */
export function secretEquals(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

// ---------- admin password: only a scrypt hash is stored (ADMIN_PASSWORD_HASH) ----------
// Format: scrypt$N$r$p$<salt base64url>$<hash base64url>. Generate with: npm run admin-setup
const scrypt = (pw, salt, N, r, p) => new Promise((ok, ko) =>
  crypto.scrypt(pw, salt, 64, { N, r, p, maxmem: 256 * N * r }, (e, k) => (e ? ko(e) : ok(k))));

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const [N, r, p] = [32768, 8, 1];
  const key = await scrypt(pw, salt, N, r, p);
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(input) {
  const stored = process.env.ADMIN_PASSWORD_HASH || '';
  const [algo, N, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !hash || typeof input !== 'string' || input.length > 200) return false;
  const key = await scrypt(input, Buffer.from(salt, 'base64url'), Number(N), Number(r), Number(p));
  const expected = Buffer.from(hash, 'base64url');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

export const adminConfigured = () =>
  (process.env.ADMIN_PASSWORD_HASH || '').startsWith('scrypt$') && !!secret() && (process.env.ADMIN_PATH || '').length >= 20;

export const clientIp = (req, context) =>
  context?.ip || req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
