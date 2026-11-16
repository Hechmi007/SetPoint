// Codes promo tab: create / edit / disable the codes you give to coaches and clubs, and see what each one brings.
// Stats are computed from the orders already loaded in the dashboard (order.couponCode / order.coupon).
import { toast } from '/js/common.js';
import { $, api, esc, money } from '/js/admin/core.js';

let coupons = [], loaded = false, ctx = null;
let editing = null; // { code: existing code or null, type }

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Tunis' });
const fmtDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const discountText = (c) => (c.type === 'percent' ? `−${c.value} %` : `−${money(c.value)}`);

function statsFor(code) {
  const mine = (ctx?.orders || []).filter((o) => o.couponCode === code && o.status !== 'cancelled');
  const delivered = mine.filter((o) => o.status === 'delivered');
  const sum = (rows, f) => Math.round(rows.reduce((s, o) => s + f(o), 0) * 100) / 100;
  return { orders: mine.length, delivered: delivered.length, sales: sum(mine, (o) => o.total), discount: sum(mine, (o) => o.coupon?.discount || 0), commission: sum(delivered, (o) => o.coupon?.commission || 0) };
}
function statusOf(c, orders) {
  if (!c.active) return ['Désactivé', 'st-cancelled'];
  if (c.expiresAt && today() > c.expiresAt) return ['Expiré', 'st-cancelled'];
  if (c.maxUses && orders >= c.maxUses) return ['Épuisé', 'st-shipped'];
  return ['Actif', 'st-delivered'];
}

export async function load() {
  try { coupons = (await api('/api/admin/coupons')).coupons; loaded = true; renderList(); }
  catch (ex) { toast(ex.message); }
}
export function render(c) { ctx = c; if (loaded) renderList(); }

function renderList() {
  const total = coupons.reduce((acc, c) => { const s = statsFor(c.code); acc.orders += s.orders; acc.sales += s.sales; acc.discount += s.discount; acc.owed += Math.max(0, s.commission - (c.commissionPaid || 0)); return acc; }, { orders: 0, sales: 0, discount: 0, owed: 0 });
  $('promoStats').innerHTML = coupons.length ? [['Codes actifs', coupons.filter((c) => statusOf(c, statsFor(c.code).orders)[0] === 'Actif').length], ['Commandes avec code', total.orders], ['Ventes via codes', money(Math.round(total.sales * 100) / 100)],
    ['Réductions offertes', money(Math.round(total.discount * 100) / 100)], ['Commissions à verser', money(Math.round(total.owed * 100) / 100)]]
    .map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('') : '';
  $('promoList').innerHTML = coupons.length ? coupons.map((c) => {
    const s = statsFor(c.code), [label, cls] = statusOf(c, s.orders), owed = Math.max(0, Math.round((s.commission - (c.commissionPaid || 0)) * 100) / 100);
    const rules = [c.minOrder ? `dès ${money(c.minOrder)}` : '', c.maxUses ? `${s.orders}/${c.maxUses} utilisations` : `${s.orders} utilisation${s.orders > 1 ? 's' : ''}`,
      c.expiresAt ? `jusqu’au ${fmtDay(c.expiresAt)}` : 'sans date limite', c.excludePacks ? 'hors packs' : 'cumulable avec les packs'].filter(Boolean).join(' · ');
    return `<article class="cp card ${c.active ? '' : 'off'}">
      <div class="cp-top"><span class="cp-code">${esc(c.code)}</span><span class="cp-val">${esc(discountText(c))}</span><span class="badge ${cls}">${label}</span></div>
      <div class="cp-who">${esc(c.label || 'Sans nom')}</div>
      <div class="note">${esc(rules)}</div>
      <div class="cp-nums"><div><b>${s.orders}</b><span>commande${s.orders > 1 ? 's' : ''}</span></div><div><b>${money(s.sales)}</b><span>ventes</span></div><div><b>${money(s.discount)}</b><span>réductions</span></div>
        ${c.commission ? `<div><b>${money(owed)}</b><span>à verser (${money(c.commission)}/livrée)</span></div>` : ''}</div>
      <div class="pactions"><button type="button" class="btn s sm" data-act="link" data-code="${esc(c.code)}">🔗 Copier le lien</button><button type="button" class="btn s sm" data-act="edit" data-code="${esc(c.code)}">Modifier</button>
        <button type="button" class="btn s sm" data-act="toggle" data-code="${esc(c.code)}">${c.active ? 'Désactiver' : 'Activer'}</button><button type="button" class="btn s sm danger" data-act="del" data-code="${esc(c.code)}">Supprimer</button></div>
    </article>`;
  }).join('') : '<div class="empty card">Aucun code pour l’instant. Créez-en un avec « + Nouveau code », puis donnez-le (ou son lien) à un coach ou un club.</div>';
}

export function init(c) {
  ctx = c;
  $('newPromo').onclick = () => openEditor(null);
  $('promoList').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const c = coupons.find((x) => x.code === b.dataset.code); if (!c) return;
    try {
      if (b.dataset.act === 'edit') openEditor(c);
      if (b.dataset.act === 'link') {
        const url = `${location.origin}/?code=${encodeURIComponent(c.code)}`;
        try { await navigator.clipboard.writeText(url); toast('Lien copié : le code s’applique tout seul à l’ouverture'); } catch { prompt('Copiez ce lien :', url); }
      }
      if (b.dataset.act === 'toggle') { await api('/api/admin/coupons', { method: 'PATCH', body: JSON.stringify({ code: c.code, coupon: { ...c, active: !c.active } }) }); toast(c.active ? 'Code désactivé' : 'Code activé'); load(); }
      if (b.dataset.act === 'del') {
        if (!confirm(`Supprimer le code ${c.code} ?\nLes commandes déjà passées avec ce code ne sont pas modifiées.\n\n(Pour l’arrêter sans le perdre, utilisez plutôt « Désactiver ».)`)) return;
        await api('/api/admin/coupons?code=' + encodeURIComponent(c.code), { method: 'DELETE' }); toast('Code supprimé'); load();
      }
    } catch (ex) { toast(ex.message); }
  });

  const form = $('cpForm');
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act],[data-type]'); if (!b) return;
    if (b.dataset.type) { editing.type = b.dataset.type; syncType(); return; }
    if (b.dataset.act === 'close') $('cpDrawer').close();
    if (b.dataset.act === 'gen') form.elements.code.value = suggest();
  });
  form.addEventListener('input', (e) => { if (e.target.name === 'code') e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form.elements, err = $('cpErr'); err.textContent = '';
    const body = { code: f.code.value, label: f.label.value, type: editing.type, value: f.value.value, minOrder: f.minOrder.value, maxUses: f.maxUses.value,
      expiresAt: f.expiresAt.value, excludePacks: f.excludePacks.checked, commission: f.commission.value, commissionPaid: f.commissionPaid.value, active: f.active.checked };
    const btn = form.querySelector('[type="submit"]'); btn.disabled = true;
    try {
      if (editing.code) await api('/api/admin/coupons', { method: 'PATCH', body: JSON.stringify({ code: editing.code, coupon: body }) });
      else await api('/api/admin/coupons', { method: 'POST', body: JSON.stringify({ coupon: body }) });
      $('cpDrawer').close(); toast('Code enregistré ✓'); load();
    } catch (ex) { err.textContent = ex.message; } finally { btn.disabled = false; }
  });
}

function suggest() {
  const f = $('cpForm').elements;
  const word = String(f.label.value).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/^(COACH|CLUB|PADEL|TENNIS)\s+/, '').match(/[A-Z]{3,}/)?.[0]?.slice(0, 8);
  const base = word || 'SP' + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const n = Math.round(Number(f.value.value) || 10);
  let code = base + n;
  while (coupons.some((c) => c.code === code && c.code !== editing?.code)) code = base + n + Math.floor(Math.random() * 90 + 10);
  return code;
}

function syncType() {
  const f = $('cpForm');
  f.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.type === editing.type));
  $('cpUnit').textContent = editing.type === 'percent' ? '%' : 'DT';
}

function openEditor(c) {
  editing = { code: c?.code || null, type: c?.type || 'percent' };
  const v = c || { code: '', label: '', value: 10, minOrder: '', maxUses: '', expiresAt: '', excludePacks: false, commission: '', commissionPaid: '', active: true };
  const val = (x) => esc(x ?? '');
  $('cpForm').innerHTML = `
    <div class="dw-head"><h2>${c ? esc(c.code) : 'Nouveau code promo'}</h2><button type="button" class="btn s sm" data-act="close">Fermer</button></div>
    <div class="card">
      <div class="field"><label for="cpCode">Code *</label>
        <div class="cp-codebox"><input id="cpCode" name="code" value="${val(v.code)}" maxlength="24" placeholder="COACH10" autocomplete="off" ${c ? 'readonly' : ''} style="text-transform:uppercase;font-family:ui-monospace,Consolas,monospace;font-weight:700">
        ${c ? '' : '<button type="button" class="btn s sm" data-act="gen">Générer</button>'}</div>
        <span class="note">Lettres, chiffres et tiret. ${c ? 'Le code ne peut plus être changé : les commandes y font référence.' : 'Les clients le tapent dans le panier (en majuscules ou non).'}</span></div>
      <div class="field" style="margin-top:12px"><label for="cpLabel">Pour qui ? <span class="note">(visible seulement par vous)</span></label><input id="cpLabel" name="label" value="${val(v.label)}" maxlength="80" placeholder="Coach Sami — Padel Club du Lac"></div>
      <div class="field" style="margin-top:12px"><label>Réduction *</label>
        <div class="cp-valrow"><div class="seg"><button type="button" data-type="percent">Pourcentage</button><button type="button" data-type="fixed">Montant</button></div>
        <div class="cp-val-in"><input name="value" value="${val(v.value)}" inputmode="decimal" aria-label="Valeur"><span id="cpUnit">%</span></div></div></div>
    </div>
    <div class="card"><h3 style="font-size:1rem">Conditions <span class="note">(toutes facultatives)</span></h3>
      <div class="form-grid">
        <div class="field"><label>Achat minimum (DT)</label><input name="minOrder" value="${val(v.minOrder || '')}" inputmode="decimal" placeholder="Aucun"></div>
        <div class="field"><label>Nombre d’utilisations max</label><input name="maxUses" value="${val(v.maxUses || '')}" inputmode="numeric" placeholder="Illimité"></div>
        <div class="field"><label>Valable jusqu’au</label><input name="expiresAt" type="date" value="${val(v.expiresAt || '')}"></div>
        <label class="chk-inline" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="excludePacks" ${v.excludePacks ? 'checked' : ''}> Pas cumulable avec les packs</label>
      </div></div>
    <div class="card"><h3 style="font-size:1rem">Commission <span class="note">(pour le coach ou le club, facultatif)</span></h3>
      <div class="form-grid">
        <div class="field"><label>Par commande livrée (DT)</label><input name="commission" value="${val(v.commission || '')}" inputmode="decimal" placeholder="0"></div>
        <div class="field"><label>Déjà versé (DT)</label><input name="commissionPaid" value="${val(v.commissionPaid || '')}" inputmode="decimal" placeholder="0"></div>
      </div><p class="note" style="margin:8px 0 0">Le tableau affiche « à verser » = commission × commandes livrées − déjà versé.</p></div>
    <div class="card"><label class="chk-inline"><input type="checkbox" name="active" ${v.active !== false ? 'checked' : ''}> Code actif</label></div>
    <p class="ed-err" id="cpErr" role="alert"></p>
    <button class="btn p" type="submit" style="width:100%">Enregistrer</button>`;
  syncType();
  if (!$('cpDrawer').open) $('cpDrawer').showModal();
  if (!c) $('cpForm').elements.label.focus();
}
