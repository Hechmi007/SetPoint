// Production tab: every piece to print for open orders, as a checklist.
// "Par filament" groups pieces by filament color so you load one spool and print everything in it;
// "Par commande" shows each order's pieces, oldest first. Ticks are saved on the order (order.printed).
import { toast } from '/js/common.js';
import { $, esc, statusLabel, fmtDate, orderPieces } from '/js/admin/core.js';

const ui = { mode: 'filament', hideDone: true, includeNew: true };
let ctx;

const openOrders = () => ctx.orders
  .filter((o) => ['confirmed', 'production'].includes(o.status) || (ui.includeNew && o.status === 'new'))
  .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export function init(c) {
  ctx = c;
  $('prodMode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    ui.mode = b.dataset.mode;
    $('prodMode').querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    render(ctx);
  });
  $('prodHideDone').onchange = (e) => { ui.hideDone = e.target.checked; render(ctx); };
  $('prodNew').onchange = (e) => { ui.includeNew = e.target.checked; render(ctx); };
  $('prodPrint').onclick = () => window.print();

  $('prodBoard').addEventListener('change', async (e) => {
    const cb = e.target.closest('input[data-key]'); if (!cb) return;
    cb.disabled = true;
    try {
      const o = await ctx.patchOrder(cb.dataset.ref, { printed: { [cb.dataset.key]: cb.checked } });
      if (orderPieces(o).every((p) => p.done) && o.status !== 'ready') toast(`${o.ref} : tout est imprimé ✓ — vous pouvez la marquer « Prête »`);
    } catch (ex) { toast(ex.message); cb.checked = !cb.checked; cb.disabled = false; }
  });
  $('prodBoard').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    if (b.dataset.act === 'open') ctx.openDrawer(b.dataset.ref);
    if (b.dataset.act === 'ready') ctx.setStatus(b.dataset.ref, 'ready');
    if (b.dataset.act === 'start') ctx.setStatus(b.dataset.ref, 'production');
  });
}

const firstName = (o) => String(o.customer?.name || '').split(' ')[0];
const pieceRow = (o, p, { showOrder }) => `
  <div class="prow ${p.done ? 'done' : ''}">
    <label><input type="checkbox" data-ref="${esc(o.ref)}" data-key="${esc(p.key)}" ${p.done ? 'checked' : ''}>
      ${p.color && !showOrder ? '' : p.color ? `<i class="sw" style="background:${p.color.hex}" title="${esc(p.color.name)}"></i>` : ''}
      <span class="pq">×${p.qty}</span>
      <span class="pl">${esc(showOrder && p.color ? `${p.label} — ${p.color.name}` : p.label)}</span>
      ${p.extra ? `<span class="px">${esc(p.extra)}</span>` : ''}</label>
    ${showOrder ? '' : `<button type="button" class="pref" data-act="open" data-ref="${esc(o.ref)}">${esc(o.ref)} · ${esc(firstName(o))}</button>`}
  </div>`;

export function render(c) {
  ctx = c;
  const orders = openOrders();
  const all = orders.flatMap((o) => orderPieces(o).map((p) => ({ o, p })));
  const left = all.filter((x) => !x.p.done);
  const totalQty = all.reduce((n, x) => n + x.p.qty, 0);
  const leftQty = left.reduce((n, x) => n + x.p.qty, 0);

  // filament needs: remaining parts per color
  const spools = {};
  left.filter((x) => x.p.color).forEach(({ p }) => { (spools[p.color.id] ||= { ...p.color, n: 0 }).n += p.qty; });
  $('prodSummary').innerHTML = `<div class="psum card">
    <div><div class="k">Pièces restantes</div><div class="v">${leftQty}<small> / ${totalQty}</small></div>
      <div class="bar"><span style="width:${totalQty ? Math.round((1 - leftQty / totalQty) * 100) : 0}%"></span></div></div>
    <div><div class="k">Commandes en cours</div><div class="v">${orders.length}</div></div>
    <div class="spools"><div class="k">Filaments à charger</div>${Object.values(spools).sort((a, b) => b.n - a.n)
      .map((s) => `<span class="spool"><i style="background:${s.hex}"></i>${esc(s.name)} <b>${s.n}</b></span>`).join('') || '<span class="note">Rien à imprimer 🎉</span>'}</div>
  </div>`;

  if (!orders.length) { $('prodBoard').innerHTML = '<div class="empty card">Aucune commande à produire pour le moment.</div>'; return; }

  if (ui.mode === 'filament') {
    const groups = new Map();
    for (const x of all) {
      if (ui.hideDone && x.p.done) continue;
      const g = groups.get(x.p.group) || { key: x.p.group, rows: [], color: x.p.color, image: x.p.image,
        title: x.p.color ? `Filament ${x.p.color.name}` : x.p.group === 'gift' ? 'Porte-clés prénom offerts' : x.p.label };
      g.rows.push(x); groups.set(x.p.group, g);
    }
    const rank = (g) => (g.color ? 0 : g.key === 'gift' ? 2 : 1);
    const list = [...groups.values()].sort((a, b) => rank(a) - rank(b) || b.rows.length - a.rows.length);
    $('prodBoard').innerHTML = list.length ? `<div class="pboard">${list.map((g) => {
      const n = g.rows.filter((x) => !x.p.done).reduce((s, x) => s + x.p.qty, 0);
      return `<section class="pgroup card">
        <h3>${g.color ? `<i class="sw lg" style="background:${g.color.hex}"></i>` : g.image ? `<img src="${esc(g.image)}" alt="">` : '<span class="gift-ic">🎁</span>'}
          <span>${esc(g.title)}</span><span class="cnt-badge">${n} à imprimer</span></h3>
        ${g.rows.sort((a, b) => a.p.done - b.p.done).map(({ o, p }) => pieceRow(o, p, { showOrder: false })).join('')}
      </section>`;
    }).join('')}</div>` : '<div class="empty card">Tout est imprimé 🎉 Décochez « Masquer les pièces imprimées » pour revoir la liste.</div>';
    return;
  }

  $('prodBoard').innerHTML = `<div class="pboard">${orders.map((o) => {
    const pcs = orderPieces(o);
    const done = pcs.filter((p) => p.done).length;
    const shown = ui.hideDone ? pcs.filter((p) => !p.done) : pcs;
    return `<section class="pgroup card ${done === pcs.length ? 'complete' : ''}">
      <h3><button type="button" class="pref big" data-act="open" data-ref="${esc(o.ref)}">${esc(o.ref)}</button>
        <span>${esc(o.customer.name)}</span><span class="badge st-${o.status}">${statusLabel(o.status)}</span></h3>
      <div class="sub">${fmtDate(o.createdAt)} · ${done}/${pcs.length} pièces prêtes</div>
      <div class="bar"><span style="width:${Math.round(done / pcs.length * 100)}%"></span></div>
      ${shown.map((p) => pieceRow(o, p, { showOrder: true })).join('') || '<p class="note">Toutes les pièces sont imprimées.</p>'}
      <div class="pactions">
        ${['new', 'confirmed'].includes(o.status) ? `<button type="button" class="btn s sm" data-act="start" data-ref="${esc(o.ref)}">▶ Lancer la production</button>` : ''}
        ${done === pcs.length ? `<button type="button" class="btn p sm" data-act="ready" data-ref="${esc(o.ref)}">✓ Marquer prête</button>` : ''}
      </div>
    </section>`;
  }).join('')}</div>`;
}
