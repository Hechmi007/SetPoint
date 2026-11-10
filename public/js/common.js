// Shared browser helpers: cart storage, header count, SVG previews, toasts.
import { getProduct, getColor, getFont } from './products.js';

export const WHATSAPP = '21650992700';

// ---------- cart (localStorage, per visitor) ----------
const KEY = 'setpoint-cart-v1';
export function getCart() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveCart(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* private mode */ }
  updateCartCount();
}
export function addToCart(item) {
  const cart = getCart();
  const same = cart.find((it) => it.productId === item.productId && (it.font || null) === (item.font || null)
    && JSON.stringify(it.colors || null) === JSON.stringify(item.colors || null)
    && (it.variantId || null) === (item.variantId || null) && (it.personalization || '') === (item.personalization || ''));
  if (same) same.qty = Math.min(20, same.qty + item.qty);
  else cart.push({ ...item, key: Math.random().toString(36).slice(2, 10) });
  saveCart(cart);
}
export function cartCount() { return getCart().reduce((n, it) => n + it.qty, 0); }
export function updateCartCount() {
  const n = cartCount();
  document.querySelectorAll('.cart-count').forEach((el) => { el.textContent = n; el.dataset.n = n; });
}

// ---------- SVG previews ----------
const svgCache = {};
export async function loadSvg(url) {
  svgCache[url] ||= fetch(url).then((r) => r.text());
  return svgCache[url];
}
/** Render a product preview into `el`, colored with {partId: colorId} and an optional font id. Returns the <svg>. */
export async function renderPreview(el, productId, colors, fontId) {
  const product = getProduct(productId);
  if (!product) return null;
  el.classList.add('preview');
  el.innerHTML = await loadSvg(product.svg);
  const svg = el.querySelector('svg');
  paint(svg, colors, fontId, product);
  return svg;
}
export function paint(svg, colors, fontId, product) {
  if (!svg) return;
  for (const [part, colorId] of Object.entries(colors || {})) {
    const hex = getColor(colorId)?.hex || colorId; // admin passes hex directly
    svg.querySelectorAll(`[data-part="${part}"]`).forEach((g) => g.setAttribute('fill', hex));
  }
  const font = getFont(fontId);
  const target = product?.fontPart && svg.querySelector(`[data-part="${product.fontPart}"]`);
  if (font && target) {
    target.setAttribute('font-family', `'${font.family}', system-ui, sans-serif`);
    target.setAttribute('font-weight', font.weight);
    const fit = () => fitText(target);
    fit();
    document.fonts?.load(`${font.weight} 24px '${font.family}'`).then(fit, () => {});
  }
}
// Shrink any line wider than the space between the slots (wide fonts like Orbitron).
const MAX_TEXT_WIDTH = 86;
function fitText(group) {
  group.querySelectorAll('text').forEach((t) => {
    t.dataset.size ||= t.getAttribute('font-size');
    t.setAttribute('font-size', t.dataset.size);
    let w = 0;
    try { w = t.getComputedTextLength(); } catch { return; }
    if (w > MAX_TEXT_WIDTH) t.setAttribute('font-size', (t.dataset.size * MAX_TEXT_WIDTH / w).toFixed(1));
  });
}

// ---------- misc ----------
export const money = (n) => `${n} DT`;
/** Plain text (as typed in the admin) → escaped paragraphs with line breaks. */
export const paragraphs = (s) => String(s ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
let toastTimer;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
}
export function revealOnScroll() {
  const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('on'); io.unobserve(x.target); } }), { threshold: 0.1 });
  document.querySelectorAll('.rv').forEach((x) => io.observe(x));
}

updateCartCount();
