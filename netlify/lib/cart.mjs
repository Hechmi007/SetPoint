// Turns the items a visitor sends (product ids, colors, quantities...) into trusted order items, then prices them.
// Used by /api/orders (the real order) and /api/quote (the cart preview), so both always agree.
import { getProduct, getColor, getFont } from '../../public/js/products.js';
import { computePricing, describeCoupon } from '../../public/js/pricing.js';
import { getCatalogProduct, unitPrice, personalizationFee } from './catalog.mjs';
import { classifyDbError } from './db.mjs';
import { checkCoupon, normalizeCode } from './coupons.mjs';

export class CartError extends Error { constructor(m, status = 400, extra = {}) { super(m); this.status = status; this.extra = extra; } }
const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * `requireKeychains`: a real order needs one keychain name per counter; the price preview (/api/quote) does not.
 * `legacyKeychain`: a single name sent by an old cached page (applied to every counter).
 */
export async function buildItems(rawItems, { requireKeychains = true, legacyKeychain = '' } = {}) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw new CartError('Panier vide');
  if (rawItems.length > 20) throw new CartError('Trop d’articles dans une commande');
  const items = [];
  for (const raw of rawItems) {
    const qty = Math.trunc(Number(raw?.qty));
    if (!(qty >= 1 && qty <= 20)) throw new CartError('Quantité invalide');
    const product = getProduct(raw?.productId);

    if (!product) {
      // catalog product created in the admin (keychains, ...)
      let cat;
      try { cat = await getCatalogProduct(String(raw?.productId ?? '').slice(0, 60)); }
      catch (e) { console.error('catalog lookup', e); const code = classifyDbError(e); throw new CartError(`Impossible de vérifier le panier (code : ${code}).`, 500, { code }); }
      if (!cat) throw new CartError('Un produit de votre panier n’est plus disponible');
      if (cat.audience === 'clubs') throw new CartError(`« ${cat.name} » est réservé aux clubs : demandez-nous un devis`);
      let variant = null;
      if (cat.variants.length) {
        variant = cat.variants.find((v) => v.id === raw.variantId);
        if (!variant || !variant.available) throw new CartError(`Choisissez un(e) ${cat.variantLabel.toLowerCase()} disponible pour « ${cat.name} »`);
      }
      let personalization = '';
      if (cat.personalization?.enabled) {
        personalization = clean(raw.personalization, cat.personalization.maxLength);
        if (cat.personalization.required && !personalization) throw new CartError(`${cat.personalization.label} manquant pour « ${cat.name} »`);
      }
      const colors = {};
      for (const part of cat.colorParts || []) {
        const color = getColor(raw.colors?.[part.id]);
        if (!color || !color.available) throw new CartError(`Choisissez une couleur disponible pour « ${part.label} » (${cat.name})`);
        colors[part.id] = { id: color.id, name: color.name, hex: color.hex, part: part.label };
      }
      const fee = personalizationFee(cat, personalization);
      items.push({
        kind: 'catalog', productId: cat.id, productRef: cat.ref, name: cat.name,
        variantId: variant?.id ?? null, variantName: variant?.name ?? null, variantRef: variant?.ref ?? null,
        personalization, personalizationFee: fee, ...(Object.keys(colors).length ? { colors } : {}), image: variant?.image || cat.images[0] || '', unitPrice: Math.round((unitPrice(cat, variant) + fee) * 1000) / 1000, qty,
      });
      continue;
    }

    const colors = {};
    for (const part of product.parts) {
      const color = getColor(raw.colors?.[part.id]);
      if (!color || !color.available) throw new CartError(`Couleur invalide pour « ${part.label} »`);
      colors[part.id] = { id: color.id, name: color.name, hex: color.hex, part: part.label };
    }
    let font = null;
    if (product.fontPart) {
      const f = getFont(raw.font ?? product.defaultFont);
      if (!f || !f.available) throw new CartError('Police invalide');
      font = { id: f.id, name: f.name, family: f.family };
    }
    // every counter comes with a free personalized keychain: one name per counter
    let keychains = [];
    if (product.keychain) {
      const max = product.keychain.maxLength || 20;
      let names = Array.isArray(raw.keychains) ? raw.keychains.slice(0, 20).map((n) => clean(n, max)) : [];
      if (!names.length && legacyKeychain) names = Array(qty).fill(clean(legacyKeychain, max));
      if (requireKeychains) {
        if (names.length !== qty) throw new CartError(`Indiquez le prénom de chaque porte-clé offert (${qty} pour « ${product.name} »)`);
        const missing = names.findIndex((n) => !n);
        if (missing >= 0) throw new CartError(`Prénom manquant pour le porte-clé n°${missing + 1} de « ${product.name} »`);
      } else names = Array.from({ length: qty }, (_, i) => names[i] || '');
      keychains = names;
    }
    items.push({ kind: 'custom', productId: product.id, productRef: product.ref, name: product.name, unitPrice: product.price, qty, colors, font, keychains });
  }
  return items;
}

/**
 * Items + optional promo code → { items, pricing, coupon, couponResult }.
 * `couponResult` is what the customer may see: { code, ok:true, text } or { code, ok:false, error }.
 * An unusable code never blocks pricing: it is simply not applied (the order endpoint decides whether to refuse).
 */
export async function priceCart(rawItems, couponInput, ip, itemOptions) {
  const items = await buildItems(rawItems, itemOptions);
  const code = normalizeCode(couponInput);
  let coupon = null, couponResult = null;
  if (code) {
    const found = await checkCoupon(code, ip);
    if (found.error) couponResult = { code, ok: false, error: found.error };
    else coupon = found.coupon;
  }
  let pricing = computePricing(items, coupon);
  if (coupon && pricing.couponError) { couponResult = { code, ok: false, error: pricing.couponError }; coupon = null; pricing = computePricing(items, null); }
  else if (coupon) couponResult = { code, ok: true, text: describeCoupon(coupon) };
  return { items, pricing, coupon, couponResult };
}
