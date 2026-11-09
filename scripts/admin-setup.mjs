// Generates (or rotates) the admin secrets and writes them to .env:
//   ADMIN_PATH           secret URL segment → dashboard at /a/<ADMIN_PATH>
//   ADMIN_PASSWORD_HASH  scrypt hash of the admin password (the password itself is never stored)
//   AUTH_SECRET          signs admin sessions (rotating it logs everyone out)
// The plain password + URL are written once to admin-credentials.local.txt (git-ignored):
// copy them into a password manager, then delete that file.
//
// Usage:  npm run admin-setup                     → new random password, URL and secret
//         npm run admin-setup -- "my own password" → use your password (min 14 chars)
//         add --keep-url to keep the current admin URL
import fs from 'node:fs';
import crypto from 'node:crypto';
import { hashPassword } from '../netlify/lib/http.mjs';

const args = process.argv.slice(2);
const keepUrl = args.includes('--keep-url');
const custom = args.find((a) => !a.startsWith('--'));
if (custom && custom.length < 14) { console.error('Password too short: use at least 14 characters.'); process.exit(1); }

const env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const current = Object.fromEntries(env.split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

const password = custom || crypto.randomBytes(18).toString('base64url'); // 24 chars
const values = {
  ADMIN_PATH: keepUrl && current.ADMIN_PATH ? current.ADMIN_PATH : crypto.randomBytes(24).toString('hex'), // 48 chars
  ADMIN_PASSWORD_HASH: await hashPassword(password),
  AUTH_SECRET: crypto.randomBytes(32).toString('hex'),
};

let lines = env.split(/\r?\n/).filter((l) => !/^ADMIN_PASSWORD=/.test(l)); // drop any old plain-text password
for (const [k, v] of Object.entries(values)) {
  const i = lines.findIndex((l) => l.startsWith(k + '='));
  if (i >= 0) lines[i] = `${k}=${v}`; else lines.splice(lines.length && lines.at(-1) === '' ? lines.length - 1 : lines.length, 0, `${k}=${v}`);
}
fs.writeFileSync('.env', lines.join('\n').replace(/\n*$/, '\n'));

fs.writeFileSync('admin-credentials.local.txt', [
  'SETPOINT admin access — save this in a password manager, then DELETE this file.',
  '',
  `Admin URL (live):  https://<your-netlify-site>/a/${values.ADMIN_PATH}`,
  `Admin URL (local): http://localhost:8888/a/${values.ADMIN_PATH}`,
  `Password:          ${password}`,
  '',
  'Netlify → Site configuration → Environment variables must contain the same',
  'ADMIN_PATH, ADMIN_PASSWORD_HASH and AUTH_SECRET as your .env file.',
  '',
].join('\n'));

console.log('✓ .env updated: ADMIN_PATH, ADMIN_PASSWORD_HASH, AUTH_SECRET');
console.log('✓ Password and admin URL written to admin-credentials.local.txt (git-ignored).');
console.log('  Save them in a password manager, delete that file, and copy the 3 values into Netlify.');
