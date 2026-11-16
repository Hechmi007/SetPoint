// Packs and promo codes: ONE pricing function used by the browser (cart preview) and by the server
// (the real price, recomputed on every order). Change pack names/prices here, nowhere else.
//
// Packs are automatic: the counters in a cart are grouped into the cheapest combination of packs,
// so two counters (identical or not) cost the Duo price, four cost the Équipe price, and so on.
import { PRODUCTS, SHIPPING } from './products.js';

export const PACK_PRODUCT = 'compteur-score';   // the packs apply to the customizable counter
export const PACKS = [
  { id: 'duo',    name: 'Pack Duo',    size: 2, price: 45, tagline: 'Pour vous et votre partenaire' },
  { id: 'equipe', name: 'Pack Équipe', size: 4, price: 85, tagline: 'Une équipe, vos couleurs, 21,25 DT la pièce' },
];
export const getPack = (id) => PACKS.find((p) => p.id === id);

const r3 = (x) => Math.round(x * 1000) / 1000;
const r1 = (x) => Math.round(x * 10) / 10;       // discounts are rounded to 0.1 DT: easy to pay in cash
const unit = () => PRODUCTS.find((p) => p.id === PACK_PRODUCT).price;

/** Cheapest way to price `n` counters with the packs → { total, list, singles, packs:[{id,name,size,count,price,saving}] }. */
export function bundleCounters(n) {
  const u = unit(); n = Math.max(0, Math.trunc(Number(n) || 0));
  const cost = [0], pick = [null];
  for (let i = 1; i <= n; i++) {
    cost[i] = cost[i - 1] + u; pick[i] = null;
    for (const p of PACKS) if (p.size <= i && cost[i - p.size] + p.price < cost[i] - 1e-9) { cost[i] = cost[i - p.size] + p.price; pick[i] = p; }
  }
  const counts = {}; let i = n, singles = 0;
  while (i > 0) { const p = pick[i]; if (!p) { singles++; i--; } else { counts[p.id] = (counts[p.id] || 0) + 1; i -= p.size; } }
  const packs = PACKS.filter((p) => counts[p.id]).map((p) => ({ id: p.id, name: p.name, size: p.size, count: counts[p.id], price: p.price, saving: r3(p.size * u - p.price) }));
  return { total: r3(cost[n]), list: r3(n * u), singles, packs };
}

/** Cart or order items → { kind, productId, unitPrice, qty } (the browser cart has no prices stored for counters). */
function normalize(items) {
  return items.map((it) => {
    const known = PRODUCTS.find((p) => p.id === it.productId);
    return { kind: it.kind || (known ? 'custom' : 'catalog'), productId: it.productId,
      unitPrice: Number(it.unitPrice ?? it.price ?? known?.price ?? 0), qty: Math.trunc(Number(it.qty) || 0) };
  });
}

export const describeCoupon = (c) => (c.type === 'percent' ? `−${c.value} %` : `−${c.value} DT`);

/**
 * Full price of a cart.
 * `coupon` = a coupon that is already known to be usable (active, not expired, not used up: the server checks that);
 * the rules that depend on the cart (minimum order, "not with packs") are applied here.
 */
export function computePricing(items, coupon = null) {
  const its = normalize(items);
  const listSubtotal = r3(its.reduce((s, it) => s + it.unitPrice * it.qty, 0));
  const counters = its.filter((it) => it.kind === 'custom' && it.productId === PACK_PRODUCT).reduce((n, it) => n + it.qty, 0);
  const b = bundleCounters(counters);
  const packDiscount = r3(b.list - b.total);
  const afterPacks = r3(listSubtotal - packDiscount);

  let couponDiscount = 0, couponError = null;
  if (coupon) {
    if (coupon.excludePacks && b.packs.length) couponError = 'Ce code n’est pas cumulable avec les packs';
    else if (afterPacks < (coupon.minOrder || 0)) couponError = `Ce code est valable dès ${coupon.minOrder} DT d’achats`;
    else couponDiscount = r1(Math.min(coupon.type === 'percent' ? afterPacks * coupon.value / 100 : coupon.value, afterPacks));
  }
  const merchandise = r3(afterPacks - couponDiscount);
  const free = SHIPPING.freeFrom != null && merchandise >= SHIPPING.freeFrom;      // free delivery from 100 DT of goods
  const shipping = { label: free ? 'Livraison offerte' : SHIPPING.label, price: free ? 0 : SHIPPING.price, free };
  return {
    counters, listSubtotal, packs: b.packs, packDiscount, afterPacks,
    couponCode: coupon && !couponError ? coupon.code : null, couponDiscount, couponError,
    merchandise, shipping, freeShippingMissing: free ? 0 : r3(Math.max(0, (SHIPPING.freeFrom ?? 0) - merchandise)), total: r3(merchandise + shipping.price),
  };
}

/** "Add N counters for just X DT more" hint when a pack (or free delivery) is within reach; null when nothing is worth suggesting. */
export function packNudge(counters) {
  if (counters < 1) return null;
  const u = unit();
  const ship = (goods) => (SHIPPING.freeFrom != null && goods >= SHIPPING.freeFrom ? 0 : SHIPPING.price);
  const all = (n) => { const g = bundleCounters(n).total; return g + ship(g); };
  const base = all(counters);
  for (let k = 1; k <= 3; k++) {
    const extra = r3(all(counters + k) - base);
    if (extra < k * u) {
      const b = bundleCounters(counters + k);
      const target = [...PACKS].reverse().find((p) => (counters + k) % p.size === 0) || null;   // null: the extra counters do not complete a pack
      const summary = b.packs.length ? b.packs.map((p) => `${p.count > 1 ? p.count + ' × ' : ''}${p.name}`).join(' + ') + (b.singles ? ` + ${b.singles} compteur${b.singles > 1 ? 's' : ''}` : '') : `${counters + k} compteurs`;
      return { add: k, extra, perPiece: r3(extra / k), pack: target ? target.id : null, newTotal: b.total, freeShipping: ship(b.total) === 0, summary };
    }
  }
  return null;
}
