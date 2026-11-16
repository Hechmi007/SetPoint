// Promo codes created in the admin (coaches, clubs...), stored in the `coupons` collection.
import { store, countFailedLogins, recordFailedLogin } from './db.mjs';

export class Invalid extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

export const normalizeCode = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
const line = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const r3 = (x) => Math.round(x * 1000) / 1000;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Tunis' }); // YYYY-MM-DD in Tunisia

/** Validates and normalizes a coupon sent by the admin. Throws Invalid with a French message. */
export function cleanCoupon(raw) {
  const code = normalizeCode(raw?.code);
  if (code.length < 3) throw new Invalid('Code : 3 à 24 caractères (lettres, chiffres, tiret)');
  const type = raw?.type === 'fixed' ? 'fixed' : raw?.type === 'percent' ? 'percent' : null;
  if (!type) throw new Invalid('Choisissez un type de réduction (pourcentage ou montant)');
  const value = num(raw.value);
  if (!(value > 0) || (type === 'percent' && value > 100) || (type === 'fixed' && value > 1000)) throw new Invalid(type === 'percent' ? 'Pourcentage : entre 1 et 100' : 'Montant : entre 0,5 et 1000 DT');
  const minOrder = raw.minOrder === '' || raw.minOrder == null ? 0 : num(raw.minOrder);
  if (!(minOrder >= 0 && minOrder <= 10000)) throw new Invalid('Commande minimale invalide');
  const maxUses = raw.maxUses === '' || raw.maxUses == null ? null : Math.trunc(num(raw.maxUses));
  if (maxUses !== null && !(maxUses >= 1 && maxUses <= 100000)) throw new Invalid('Limite d’utilisations invalide');
  const expiresAt = raw.expiresAt ? String(raw.expiresAt).slice(0, 10) : null;
  if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) throw new Invalid('Date d’expiration invalide');
  const commission = raw.commission === '' || raw.commission == null ? 0 : num(raw.commission);
  const commissionPaid = raw.commissionPaid === '' || raw.commissionPaid == null ? 0 : num(raw.commissionPaid);
  if (!(commission >= 0 && commission <= 1000) || !(commissionPaid >= 0 && commissionPaid <= 1000000)) throw new Invalid('Commission invalide');
  return {
    code, label: line(raw.label, 80), type, value: r3(value), minOrder: r3(minOrder), maxUses, expiresAt,
    excludePacks: raw.excludePacks === true || raw.excludePacks === 'true', commission: r3(commission), commissionPaid: r3(commissionPaid),
    active: raw.active !== false && raw.active !== 'false',
  };
}

export const getCoupon = (code) => store.get('coupons', { code });

/** Orders that used a code and were not cancelled. */
export async function couponUses(code) {
  return (await store.find('orders', { couponCode: code })).filter((o) => o.status !== 'cancelled').length;
}

const MAX_BAD_TRIES = 12; // wrong codes per IP per 15 minutes (stops code guessing)

/** Looks a code up and checks it is usable now. → { coupon } or { error } (the code is never revealed beyond that). */
export async function checkCoupon(codeInput, ip) {
  const code = normalizeCode(codeInput);
  const key = 'coupon:' + ip;
  if (await countFailedLogins(key) >= MAX_BAD_TRIES) throw new Invalid('Trop d’essais. Réessayez dans 15 minutes.', 429);
  const bad = async (error) => { await recordFailedLogin(key); return { error }; };
  if (code.length < 3) return bad('Code promo invalide');
  const coupon = await getCoupon(code);
  if (!coupon) return bad('Code promo inconnu');
  if (!coupon.active) return bad('Ce code n’est plus actif');
  if (coupon.expiresAt && today() > coupon.expiresAt) return bad('Ce code a expiré');
  if (coupon.maxUses && await couponUses(code) >= coupon.maxUses) return bad('Ce code a atteint sa limite d’utilisation');
  return { coupon };
}
