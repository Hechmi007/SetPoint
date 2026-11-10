// Shared admin helpers: API calls with the session token, order item helpers, production pieces.
import { ORDER_STATUSES } from '/js/products.js';
import { renderPreview, money, esc } from '/js/common.js';

export const $ = (id) => document.getElementById(id);
export { money, esc };

export const session = { token: (() => { try { return sessionStorage.getItem('sp-admin') || ''; } catch { return ''; } })(), onExpired: () => {} };

export async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}`, ...opts.headers } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { session.onExpired(); throw new Error('Session expirée, reconnectez-vous'); }
  if (!res.ok) throw new Error(data.error || 'Erreur');
  return data;
}

export const statusLabel = (id) => ORDER_STATUSES.find((s) => s.id === id)?.label || id;
export const fmtDate = (iso) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const statusSelect = (o, cls = 'status') => `<select class="${cls} st-${o.status}" data-ref="${esc(o.ref)}">${ORDER_STATUSES.map((st) => `<option value="${st.id}" ${st.id === o.status ? 'selected' : ''}>${st.label}</option>`).join('')}</select>`;

// ---------- order items (customizable counters vs catalog products) ----------
export const isCustom = (it) => it.kind === 'custom' || (!it.kind && !!it.colors);
const hexColors = (it) => Object.fromEntries(Object.entries(it.colors || {}).map(([k, v]) => [k, v.hex]));

/** Draws an item's picture into `el` (SVG preview for counters, photo for catalog products). */
export function itemThumb(el, it) {
  if (isCustom(it)) return renderPreview(el, it.productId, hexColors(it), it.font?.id);
  el.innerHTML = it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy">` : '<span class="noimg">🏷️</span>';
}

export function itemDetails(it) {
  const refs = `<span class="mono">${esc(it.variantRef || it.productRef || '')}</span>`;
  if (isCustom(it)) {
    return `${refs}${Object.values(it.colors).map((c) => `<div class="cnt"><i style="background:${c.hex}"></i>${esc(c.part)} : <strong>&nbsp;${esc(c.name)}</strong></div>`).join('')}
      ${it.font ? `<div class="cnt">🔤 Police : <strong>&nbsp;${esc(it.font.name)}</strong>&nbsp;<span class="note">(${esc(it.font.family)})</span></div>` : ''}`;
  }
  return `${refs}${it.variantName ? `<div class="cnt">Variante : <strong>&nbsp;${esc(it.variantName)}</strong></div>` : ''}
    ${it.personalization ? `<div class="cnt">✏️ Personnalisation : <strong>&nbsp;« ${esc(it.personalization)} »</strong></div>` : ''}`;
}

/**
 * Every physical piece to print for an order. Keys match order.printed:
 *   "<itemIndex>:<partId>" for each colored part of a counter, "<itemIndex>:item" for a catalog product,
 *   "gift" for the free name keychain.
 */
export function orderPieces(o) {
  const out = [];
  o.items.forEach((it, i) => {
    if (isCustom(it)) {
      // the parts saved on the order itself (older orders may use older part names)
      for (const pid of Object.keys(it.colors)) {
        const c = it.colors[pid]; if (!c) continue;
        out.push({ key: `${i}:${pid}`, group: `color:${c.id}`, color: c, label: `${c.part} · ${it.name}`, qty: it.qty,
          extra: pid === 'writing' && it.font ? `Police ${it.font.name}` : '' });
      }
    } else {
      out.push({ key: `${i}:item`, group: `product:${it.productId}:${it.variantId || ''}`, image: it.image,
        label: it.name + (it.variantName ? ` — ${it.variantName}` : ''), qty: it.qty,
        extra: it.personalization ? `« ${it.personalization} »` : '' });
    }
  });
  out.push({ key: 'gift', group: 'gift', label: 'Porte-clé prénom offert', qty: 1,
    extra: o.keychainName ? `« ${o.keychainName} »` : 'prénom non précisé' });
  return out.map((p) => ({ ...p, done: !!o.printed?.[p.key] }));
}
export const remainingPieces = (o) => orderPieces(o).filter((p) => !p.done).reduce((n, p) => n + p.qty, 0);
