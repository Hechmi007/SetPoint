// Admin dashboard. Contains no secrets: every API call needs a token from /api/admin/login.
import { ORDER_STATUSES, PRODUCTS, getProduct } from '/js/products.js';
import { renderPreview, money, esc, toast } from '/js/common.js';

const $ = (id) => document.getElementById(id);
// The dashboard lives at /a/<ADMIN_PATH>; the same secret must accompany the login.
const adminKey = decodeURIComponent(location.pathname.split('/')[2] || '');
let token = sessionStorage.getItem('sp-admin') || '';
let orders = [];
let filter = 'todo';
let search = '';
const OPEN = ['new', 'confirmed', 'production'];
const statusLabel = (id) => ORDER_STATUSES.find((s) => s.id === id)?.label || id;
const fmtDate = (iso) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const pieces = (o) => o.items.reduce((n, it) => n + it.qty, 0);
const hexColors = (it) => Object.fromEntries(Object.entries(it.colors).map(([k, v]) => [k, v.hex]));

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...opts.headers } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); throw new Error('Session expirée'); }
  if (!res.ok) throw new Error(data.error || 'Erreur');
  return data;
}

function logout() { token = ''; sessionStorage.removeItem('sp-admin'); $('app').hidden = true; $('logout').hidden = true; $('login').hidden = false; }
$('logout').onclick = (e) => { e.preventDefault(); logout(); };

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('loginErr').textContent = '';
  try {
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: $('pw').value, key: adminKey }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erreur');
    token = data.token; sessionStorage.setItem('sp-admin', token); $('pw').value = '';
    start();
  } catch (ex) { $('loginErr').textContent = ex.message; }
});

async function load() {
  try {
    orders = (await api('/api/admin/orders')).orders;
    $('updated').textContent = 'Mis à jour à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    render();
  } catch (ex) { toast(ex.message); }
}
$('refresh').onclick = load;

function render() {
  const live = orders.filter((o) => o.status !== 'cancelled');
  const month = new Date().toISOString().slice(0, 7);
  const open = orders.filter((o) => OPEN.includes(o.status));
  $('stats').innerHTML = [
    ['Nouvelles', orders.filter((o) => o.status === 'new').length],
    ['À traiter', open.length],
    ['Pièces à imprimer', open.reduce((n, o) => n + pieces(o), 0)],
    ['CA ce mois', money(live.filter((o) => o.createdAt.startsWith(month)).reduce((s, o) => s + o.total, 0))],
    ['CA total', money(live.reduce((s, o) => s + o.total, 0))],
  ].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

  const tabs = [['todo', 'À traiter', open.length], ['all', 'Toutes', orders.length],
    ...ORDER_STATUSES.map((s) => [s.id, s.label, orders.filter((o) => o.status === s.id).length])];
  $('filters').innerHTML = tabs.map(([id, l, n]) => `<button class="chip" data-f="${id}" aria-pressed="${filter === id}">${l}<span>${n}</span></button>`).join('')
    + `<input id="q" type="search" placeholder="Réf, nom, téléphone…" value="${esc(search)}">`;
  $('q').oninput = (e) => { search = e.target.value; renderList(); };
  renderList();
  renderProduction(open);
}
$('filters').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; render(); } });

function renderList() {
  const s = search.trim().toLowerCase();
  const rows = orders.filter((o) => filter === 'all' || (filter === 'todo' ? OPEN.includes(o.status) : o.status === filter))
    .filter((o) => !s || [o.ref, o.customer.name, o.customer.phone].some((v) => v.toLowerCase().includes(s)));
  const statusSelect = (o) => `<select class="status st-${o.status}" data-ref="${esc(o.ref)}">${ORDER_STATUSES.map((st) => `<option value="${st.id}" ${st.id === o.status ? 'selected' : ''}>${st.label}</option>`).join('')}</select>`;
  $('list').innerHTML = `<div class="row head"><span>Commande</span><span>Client</span><span>Articles</span><span>Total</span><span>Pièces</span><span>Statut</span></div>`
    + (rows.length ? rows.map((o) => `<div class="row" data-ref="${esc(o.ref)}">
      <div><div class="ref">${esc(o.ref)}</div><div class="sub">${fmtDate(o.createdAt)}</div></div>
      <div><div><strong>${esc(o.customer.name)}</strong></div><div class="sub">${esc(o.customer.phone)} · ${esc(o.customer.governorate)}</div></div>
      <div class="thumbs c-items">${o.items.slice(0, 4).map(() => '<span class="thumb"></span>').join('')}${o.items.length > 4 ? `<span class="more">+${o.items.length - 4}</span>` : ''}</div>
      <div class="c-total"><strong>${money(o.total)}</strong>${o.shipping?.price === null ? '<div class="sub">+ livraison</div>' : ''}</div>
      <div class="c-total">${pieces(o)}</div>
      <div class="c-status">${statusSelect(o)}</div></div>`).join('')
      : '<div class="empty">Aucune commande ici pour le moment.</div>');
  $('list').querySelectorAll('.row[data-ref]').forEach((row) => {
    const o = orders.find((x) => x.ref === row.dataset.ref);
    row.querySelectorAll('.thumb').forEach((el, i) => renderPreview(el, o.items[i].productId, hexColors(o.items[i]), o.items[i].font?.id));
  });
}

$('list').addEventListener('change', (e) => { if (e.target.matches('select.status')) setStatus(e.target.dataset.ref, e.target.value); });
$('list').addEventListener('click', (e) => {
  if (e.target.closest('select')) return;
  const row = e.target.closest('.row[data-ref]'); if (row) openDrawer(row.dataset.ref);
});

async function setStatus(ref, status) {
  try {
    const { order } = await api('/api/admin/orders', { method: 'PATCH', body: JSON.stringify({ ref, status }) });
    orders[orders.findIndex((o) => o.ref === ref)] = order;
    toast(`${ref} → ${statusLabel(status)}`);
    render();
    if ($('drawer').open) openDrawer(ref);
  } catch (ex) { toast(ex.message); }
}

function renderProduction(open) {
  const html = PRODUCTS.map((p) => p.parts.map((part) => {
    const counts = {};
    open.forEach((o) => o.items.filter((it) => it.productId === p.id).forEach((it) => {
      const c = it.colors[part.id]; if (!c) return;
      counts[c.id] ||= { ...c, n: 0 }; counts[c.id].n += it.qty;
    }));
    const list = Object.values(counts).sort((a, b) => b.n - a.n);
    return `<div><h4>${esc(p.name)} · ${esc(part.label)}</h4>${list.length ? list.map((c) => `<div class="cnt"><i style="background:${c.hex}"></i>${esc(c.name)}<b>${c.n}</b></div>`).join('') : '<div class="note">—</div>'}</div>`;
  }).join('') + (p.fontPart ? (() => {
    const counts = {};
    open.forEach((o) => o.items.filter((it) => it.productId === p.id && it.font).forEach((it) => {
      counts[it.font.id] ||= { ...it.font, n: 0 }; counts[it.font.id].n += it.qty;
    }));
    const list = Object.values(counts).sort((a, b) => b.n - a.n);
    return `<div><h4>${esc(p.name)} · Polices</h4>${list.length ? list.map((f) => `<div class="cnt">${esc(f.name)} <span class="note">(${esc(f.family)})</span><b>${f.n}</b></div>`).join('') : '<div class="note">—</div>'}</div>`;
  })() : '')).join('');
  $('prod').innerHTML = html;
}

function openDrawer(ref) {
  const o = orders.find((x) => x.ref === ref); if (!o) return;
  const phone = o.customer.phone.replace(/\D/g, '');
  const intl = phone.length === 8 ? '216' + phone : phone;
  const wa = `https://wa.me/${intl}?text=${encodeURIComponent(`Bonjour ${o.customer.name}, ici SETPOINT 🎾 Nous confirmons votre commande ${o.ref} (${o.total} DT).`)}`;
  $('dw').innerHTML = `
    <div class="dw-head"><h2>${esc(o.ref)}</h2><span class="badge st-${o.status}">${statusLabel(o.status)}</span><button class="btn s sm" id="close">Fermer</button></div>
    <div class="card"><h3 style="font-size:1rem">Articles</h3>
      ${o.items.map((it, i) => `<div class="item"><div class="big" data-i="${i}"></div><div>
        <strong>${esc(it.name)} × ${it.qty}</strong> <span class="note">(${money(it.unitPrice)}/u)</span>
        ${Object.values(it.colors).map((c) => `<div class="cnt"><i style="background:${c.hex}"></i>${esc(c.part)} : <strong>&nbsp;${esc(c.name)}</strong></div>`).join('')}
        ${it.font ? `<div class="cnt">🔤 Police : <strong>&nbsp;${esc(it.font.name)}</strong>&nbsp;<span class="note">(${esc(it.font.family)})</span></div>` : ''}
      </div></div>`).join('')}
      <div class="cnt" style="margin-top:8px">🎁 Porte-clé : <strong>&nbsp;${esc(o.keychainName || '—')}</strong></div>
    </div>
    <div class="card"><h3 style="font-size:1rem">Client</h3><dl>
      <dt>Nom</dt><dd>${esc(o.customer.name)}</dd>
      <dt>Téléphone</dt><dd><a href="tel:${esc(o.customer.phone)}">${esc(o.customer.phone)}</a></dd>
      <dt>Gouvernorat</dt><dd>${esc(o.customer.governorate)}</dd>
      <dt>Adresse</dt><dd>${esc(o.customer.address)}</dd>
      <dt>Notes</dt><dd>${esc(o.customer.notes || '—')}</dd>
      <dt>Total</dt><dd><strong>${money(o.total)}</strong> · livraison ${esc(o.shipping?.label || '')}</dd>
      <dt>Passée le</dt><dd>${new Date(o.createdAt).toLocaleString('fr-FR')}</dd></dl>
      <div class="actions" style="margin-top:14px"><a class="btn p sm" href="${wa}" target="_blank" rel="noopener">WhatsApp</a><a class="btn s sm" href="tel:${esc(o.customer.phone)}">Appeler</a></div>
    </div>
    <div class="card"><h3 style="font-size:1rem">Suivi</h3>
      <div class="field"><label for="dStatus">Statut</label><select id="dStatus">${ORDER_STATUSES.map((st) => `<option value="${st.id}" ${st.id === o.status ? 'selected' : ''}>${st.label}</option>`).join('')}</select></div>
      <div class="field" style="margin-top:12px"><label for="dNote">Note interne</label><textarea id="dNote" rows="3" placeholder="Visible uniquement ici">${esc(o.adminNote || '')}</textarea></div>
      <button class="btn s sm" id="saveNote" style="margin-top:10px">Enregistrer la note</button>
      <ul class="hist" style="margin-top:14px">${(o.history || []).map((h) => `<li>${statusLabel(h.status)} — ${new Date(h.at).toLocaleString('fr-FR')}</li>`).join('')}</ul>
    </div>`;
  $('dw').querySelectorAll('.big').forEach((el) => { const it = o.items[el.dataset.i]; renderPreview(el, it.productId, hexColors(it), it.font?.id); });
  $('close').onclick = () => $('drawer').close();
  $('dStatus').onchange = (e) => setStatus(o.ref, e.target.value);
  $('saveNote').onclick = async () => {
    try {
      const { order } = await api('/api/admin/orders', { method: 'PATCH', body: JSON.stringify({ ref: o.ref, adminNote: $('dNote').value }) });
      orders[orders.findIndex((x) => x.ref === o.ref)] = order; toast('Note enregistrée');
    } catch (ex) { toast(ex.message); }
  };
  if (!$('drawer').open) $('drawer').showModal();
}
$('drawer').addEventListener('click', (e) => { if (e.target === $('drawer')) $('drawer').close(); });

let timer;
function start() {
  $('login').hidden = true; $('app').hidden = false; $('logout').hidden = false;
  load();
  clearInterval(timer); timer = setInterval(() => { if (!document.hidden && !$('drawer').open) load(); }, 60_000);
}
token ? start() : logout();
