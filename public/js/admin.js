// Admin dashboard entry: login, tabs, orders view. Contains no secrets: every API call needs a
// token from /api/admin/login. Production and Produits tabs live in /js/admin/*.js.
import { ORDER_STATUSES } from '/js/products.js';
import { toast } from '/js/common.js';
import { $, api, session, esc, money, statusLabel, statusSelect, fmtDate, itemThumb, itemDetails, remainingPieces } from '/js/admin/core.js';
import * as production from '/js/admin/production.js';
import * as products from '/js/admin/products.js';

// The dashboard lives at /a/<ADMIN_PATH>; the same secret must accompany the login.
const adminKey = decodeURIComponent(location.pathname.split('/')[2] || '');
const OPEN = ['new', 'confirmed', 'production', 'ready'];
const state = { orders: [], filter: 'todo', search: '' };

// ---------- session ----------
function logout() {
  session.token = ''; try { sessionStorage.removeItem('sp-admin'); } catch {}
  $('app').hidden = true; $('logout').hidden = true; $('login').hidden = false;
}
session.onExpired = logout;
$('logout').onclick = (e) => { e.preventDefault(); logout(); };
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('loginErr').textContent = '';
  try {
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: $('pw').value, key: adminKey }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erreur');
    session.token = data.token; try { sessionStorage.setItem('sp-admin', data.token); } catch {}
    $('pw').value = ''; start();
  } catch (ex) { $('loginErr').textContent = ex.message; }
});

// ---------- shared order actions (used by every tab) ----------
const ctx = {
  get orders() { return state.orders; },
  async patchOrder(ref, patch, msg) {
    const { order } = await api('/api/admin/orders', { method: 'PATCH', body: JSON.stringify({ ref, ...patch }) });
    state.orders[state.orders.findIndex((o) => o.ref === ref)] = order;
    if (msg) toast(msg);
    renderAll();
    return order;
  },
  async setStatus(ref, status) {
    try { await ctx.patchOrder(ref, { status }, `${ref} → ${statusLabel(status)}`); if ($('drawer').open) openDrawer(ref); }
    catch (ex) { toast(ex.message); }
  },
  openDrawer: (ref) => openDrawer(ref),
};

async function load() {
  try {
    state.orders = (await api('/api/admin/orders')).orders;
    $('updated').textContent = 'Mis à jour à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    renderAll();
  } catch (ex) { toast(ex.message); }
}
$('refresh').onclick = () => { load(); if (currentTab() === 'produits') products.load(); };

function renderAll() {
  renderOrders();
  production.render(ctx);
  const open = state.orders.filter((o) => ['new', 'confirmed', 'production'].includes(o.status));
  $('tbOrders').textContent = state.orders.filter((o) => o.status === 'new').length || '';
  $('tbProd').textContent = open.reduce((n, o) => n + remainingPieces(o), 0) || '';
}

// ---------- tabs ----------
const currentTab = () => (location.hash.slice(1) || 'commandes');
function showTab() {
  const tab = ['commandes', 'production', 'produits'].includes(currentTab()) ? currentTab() : 'commandes';
  document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== `view-${tab}`; });
  document.querySelectorAll('#tabs [data-tab]').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));
  if (tab === 'produits') products.load();
}
addEventListener('hashchange', showTab);

// ---------- orders view ----------
function renderOrders() {
  const orders = state.orders;
  const live = orders.filter((o) => o.status !== 'cancelled');
  const month = new Date().toISOString().slice(0, 7);
  const open = orders.filter((o) => OPEN.includes(o.status));
  $('stats').innerHTML = [
    ['Nouvelles', orders.filter((o) => o.status === 'new').length],
    ['À traiter', open.length],
    ['Pièces à imprimer', orders.filter((o) => ['new', 'confirmed', 'production'].includes(o.status)).reduce((n, o) => n + remainingPieces(o), 0)],
    ['CA ce mois', money(live.filter((o) => o.createdAt.startsWith(month)).reduce((s, o) => s + o.total, 0))],
    ['CA total', money(live.reduce((s, o) => s + o.total, 0))],
  ].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

  const tabs = [['todo', 'À traiter', open.length], ['all', 'Toutes', orders.length],
    ...ORDER_STATUSES.map((s) => [s.id, s.label, orders.filter((o) => o.status === s.id).length])];
  $('filters').innerHTML = tabs.map(([id, l, n]) => `<button class="chip" data-f="${id}" aria-pressed="${state.filter === id}">${l}<span>${n}</span></button>`).join('')
    + `<input id="q" type="search" placeholder="Réf, nom, téléphone…" value="${esc(state.search)}">`;
  $('q').oninput = (e) => { state.search = e.target.value; renderList(); };
  renderList();
}
$('filters').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { state.filter = b.dataset.f; renderOrders(); } });

function renderList() {
  const s = state.search.trim().toLowerCase();
  const rows = state.orders.filter((o) => state.filter === 'all' || (state.filter === 'todo' ? OPEN.includes(o.status) : o.status === state.filter))
    .filter((o) => !s || [o.ref, o.customer.name, o.customer.phone].some((v) => v.toLowerCase().includes(s)));
  $('list').innerHTML = `<div class="row head"><span>Commande</span><span>Client</span><span>Articles</span><span>Total</span><span>Pièces</span><span>Statut</span></div>`
    + (rows.length ? rows.map((o) => `<div class="row" data-ref="${esc(o.ref)}">
      <div><div class="ref">${esc(o.ref)}</div><div class="sub">${fmtDate(o.createdAt)}</div></div>
      <div><div><strong>${esc(o.customer.name)}</strong></div><div class="sub">${esc(o.customer.phone)} · ${esc(o.customer.governorate)}</div></div>
      <div class="thumbs c-items">${o.items.slice(0, 4).map(() => '<span class="thumb"></span>').join('')}${o.items.length > 4 ? `<span class="more">+${o.items.length - 4}</span>` : ''}</div>
      <div class="c-total"><strong>${money(o.total)}</strong>${o.shipping?.price === null ? '<div class="sub">+ livraison</div>' : ''}</div>
      <div class="c-total">${o.items.reduce((n, it) => n + it.qty, 0)}</div>
      <div class="c-status">${statusSelect(o)}</div></div>`).join('')
      : '<div class="empty">Aucune commande ici pour le moment.</div>');
  $('list').querySelectorAll('.row[data-ref]').forEach((row) => {
    const o = state.orders.find((x) => x.ref === row.dataset.ref);
    row.querySelectorAll('.thumb').forEach((el, i) => itemThumb(el, o.items[i]));
  });
}
$('list').addEventListener('change', (e) => { if (e.target.matches('select.status')) ctx.setStatus(e.target.dataset.ref, e.target.value); });
$('list').addEventListener('click', (e) => {
  if (e.target.closest('select')) return;
  const row = e.target.closest('.row[data-ref]'); if (row) openDrawer(row.dataset.ref);
});

function openDrawer(ref) {
  const o = state.orders.find((x) => x.ref === ref); if (!o) return;
  const phone = o.customer.phone.replace(/\D/g, '');
  const intl = phone.length === 8 ? '216' + phone : phone;
  const wa = `https://wa.me/${intl}?text=${encodeURIComponent(`Bonjour ${o.customer.name}, ici SETPOINT 🎾 Nous confirmons votre commande ${o.ref} (${o.total} DT). Suivez-la sur ${location.origin}/suivi?ref=${o.ref}`)}`;
  $('dw').innerHTML = `
    <div class="dw-head"><h2>${esc(o.ref)}</h2><span class="badge st-${o.status}">${statusLabel(o.status)}</span><button class="btn s sm" id="close">Fermer</button></div>
    <div class="card"><h3 style="font-size:1rem">Articles</h3>
      ${o.items.map((it, i) => `<div class="item"><div class="big" data-i="${i}"></div><div>
        <strong>${esc(it.name)} × ${it.qty}</strong> <span class="note">(${money(it.unitPrice)}/u)</span>
        ${itemDetails(it)}
      </div></div>`).join('')}
      <div class="cnt" style="margin-top:8px">🎁 Porte-clé offert : <strong>&nbsp;${esc(o.keychainName || '—')}</strong></div>
      <p style="margin:10px 0 0"><a href="#production" class="note" id="toProd">→ Voir dans la production (${remainingPieces(o)} pièce(s) restante(s))</a></p>
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
    </div>
    <div class="card"><h3 style="font-size:1rem">Notifications envoyées</h3>
      ${o.notifications ? `<div class="nbs">${notifBadges(o.notifications)}</div>` : '<p class="note" style="margin:0">Commande passée avant l’activation des notifications.</p>'}
    </div>`;
  $('dw').querySelectorAll('.big').forEach((el) => itemThumb(el, o.items[el.dataset.i]));
  $('close').onclick = () => $('drawer').close();
  $('toProd').onclick = () => $('drawer').close();
  $('dStatus').onchange = (e) => ctx.setStatus(o.ref, e.target.value);
  $('saveNote').onclick = async () => {
    try { await ctx.patchOrder(o.ref, { adminNote: $('dNote').value }, 'Note enregistrée'); } catch (ex) { toast(ex.message); }
  };
  if (!$('drawer').open) $('drawer').showModal();
}
$('drawer').addEventListener('click', (e) => { if (e.target === $('drawer')) $('drawer').close(); });

// ---------- notifications ----------
const NOTIF = { email: '✉️ E-mail (vous)', telegram: '📨 Telegram (vous)', ownerWhatsapp: '💬 WhatsApp (vous)', clientWhatsapp: '💬 WhatsApp (client)' };
function notifBadges(n) {
  return Object.entries(NOTIF).map(([k, label]) => {
    const v = n?.[k] || 'off';
    const cls = v === 'sent' ? 'ok' : v === 'off' ? 'off' : 'ko';
    const txt = v === 'sent' ? 'envoyé' : v === 'off' ? 'non configuré' : 'échec';
    return `<div class="nb ${cls}" title="${esc(v)}"><span>${label}</span><b>${txt}</b>${cls === 'ko' ? `<small>${esc(v.replace(/^failed:\s*/, ''))}</small>` : ''}</div>`;
  }).join('');
}
$('notifyTest').onclick = async () => {
  const btn = $('notifyTest'); btn.disabled = true; btn.textContent = 'Envoi du test…';
  try {
    const { results } = await api('/api/admin/notify-test', { method: 'POST' });
    $('notifyResult').hidden = false;
    $('notifyResult').innerHTML = `<div class="card"><strong>Test des notifications</strong> <span class="note">(le message « client » est envoyé à votre propre numéro)</span>
      <div class="nbs">${notifBadges(results)}</div></div>`;
  } catch (ex) { toast(ex.message); }
  finally { btn.disabled = false; btn.textContent = '🔔 Tester les notifications'; }
};

// ---------- start ----------
production.init(ctx);
products.init();
let timer;
function start() {
  $('login').hidden = true; $('app').hidden = false; $('logout').hidden = false;
  showTab(); load();
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden && !$('drawer').open && !$('editor').open) load(); }, 60_000);
}
session.token ? start() : logout();
