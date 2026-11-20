// Clubs tab: edits the /clubs page (title, intro text and a list of simple product cards:
// title, description, photos, optional price). Saved as one document with "Enregistrer".
import { toast } from '/js/common.js';
import { $, api, esc } from '/js/admin/core.js';
import { resize } from '/js/admin/products.js';

let page = null, savedJson = '', uploadFor = -1;
const v = (x) => esc(x ?? '');
const dirty = () => !!page && JSON.stringify(page) !== savedJson;
const blankItem = () => ({ title: '', description: '', images: [], price: '', priceNote: '' });
const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
const forEditing = (p) => { const { updatedAt, ...rest } = p; return { ...rest, items: rest.items.map((it) => ({ ...it, price: it.price ?? '' })) }; };

export async function load() {
  if (dirty()) return;                         // keep unsaved edits when switching tabs
  try {
    page = forEditing((await api('/api/admin/clubs')).page);
    savedJson = JSON.stringify(page);
    draw();
  } catch (ex) { toast(ex.message); }
}

function setPath(obj, path, value) {
  const keys = path.split('.'); let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)] = value;
}

function draw() {
  const root = $('clubsEd');
  if (!page) { root.innerHTML = '<p class="note">Chargement…</p>'; return; }
  root.innerHTML = `
    <section class="ed-card">
      <h3>En-tête de la page</h3>
      <div class="field"><label>Titre</label><input data-k="title" value="${v(page.title)}" maxlength="120"></div>
      <div class="field"><label>Texte d’introduction</label><textarea data-k="intro" rows="3" maxlength="1000">${v(page.intro)}</textarea></div>
      <label class="ck"><input type="checkbox" data-k="showShop" ${page.showShop ? 'checked' : ''}> Afficher aussi les produits de la boutique en bas de la page</label>
    </section>
    <div class="top" style="margin:10px 0 0"><h2 style="margin:0;margin-right:auto;font-size:1.25rem">Produits de la page (${page.items.length})</h2>
      <button class="btn p sm" data-act="add" type="button">+ Ajouter un produit</button></div>
    ${page.items.length ? '' : '<p class="note">Aucun produit pour l’instant. Ajoutez-en un : un titre et des photos suffisent, le prix est facultatif.</p>'}
    <div class="cl-items">${page.items.map((it, i) => `
      <section class="ed-card cl-item">
        <div class="cl-head"><strong>#${i + 1}</strong>
          <button class="x" data-act="up" data-i="${i}" title="Monter" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="x" data-act="down" data-i="${i}" title="Descendre" ${i === page.items.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn s sm" data-act="del" data-i="${i}" type="button" style="margin-left:auto">Supprimer</button></div>
        <div class="field"><label>Titre</label><input data-k="items.${i}.title" value="${v(it.title)}" maxlength="100" placeholder="Ex. Compteurs aux couleurs du club"></div>
        <div class="ed-row2">
          <div class="field"><label>Prix (facultatif, en DT)</label><input data-k="items.${i}.price" value="${v(it.price)}" inputmode="decimal" placeholder="Vide = sur devis"></div>
          <div class="field"><label>Précision du prix (facultatif)</label><input data-k="items.${i}.priceNote" value="${v(it.priceNote)}" maxlength="40" placeholder="Ex. la pièce, dès 20 pièces"></div>
        </div>
        <div class="field"><label>Description (facultatif)</label><textarea data-k="items.${i}.description" rows="4" maxlength="3000" placeholder="Une ligne vide = nouveau paragraphe">${v(it.description)}</textarea></div>
        <label style="font-weight:700;font-size:.85rem">Photos <span class="note">(la première est la principale)</span></label>
        <div class="ed-imgs" style="margin-top:6px">${it.images.map((u, n) => `<figure><img src="${v(u)}" alt=""><figcaption>
          <button data-act="img-left" data-i="${i}" data-n="${n}" title="Avancer" ${n === 0 ? 'disabled' : ''}>←</button><span>${n + 1}</span>
          <button data-act="img-right" data-i="${i}" data-n="${n}" title="Reculer" ${n === it.images.length - 1 ? 'disabled' : ''}>→</button>
          <button data-act="img-del" data-i="${i}" data-n="${n}" title="Retirer" class="x">✕</button></figcaption></figure>`).join('')}
          ${it.images.length < 10 ? `<button class="ed-add-img" data-act="upload" data-i="${i}" type="button">＋<br>Ajouter des photos</button>` : ''}</div>
        <p class="note" data-status="${i}"></p>
      </section>`).join('')}</div>
    ${page.items.length ? '<div><button class="btn s sm" data-act="add" type="button">+ Ajouter un produit</button></div>' : ''}`;
  status();
}

function status() {
  $('clubsSave').disabled = !dirty();
  $('clubsState').textContent = dirty() ? 'Modifications non enregistrées.' : '';
}

async function uploadFiles(i, files) {
  const it = page.items[i]; const el = document.querySelector(`[data-status="${i}"]`);
  for (const [n, f] of [...files].entries()) {
    if (it.images.length >= 10) { toast('10 photos maximum par produit'); break; }
    if (el) el.textContent = `Envoi de la photo ${n + 1}/${files.length}…`;
    try {
      const { url } = await api('/api/admin/images', { method: 'POST', body: JSON.stringify({ dataUrl: await resize(f) }) });
      it.images.push(url);
    } catch (ex) { toast(`${f.name} : ${ex.message}`); }
  }
  draw();
}

async function save() {
  $('clubsSave').disabled = true;
  try {
    page = forEditing((await api('/api/admin/clubs', { method: 'PUT', body: JSON.stringify({ page }) })).page);
    savedJson = JSON.stringify(page);
    draw(); toast('Page Clubs enregistrée ✓ (en ligne d’ici une minute)');
  } catch (ex) { toast(ex.message); status(); }
}

export function init() {
  const root = $('clubsEd');
  root.addEventListener('input', (e) => {
    const el = e.target.closest('[data-k]'); if (!el) return;
    setPath(page, el.dataset.k, el.type === 'checkbox' ? el.checked : el.value);
    status();
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    e.preventDefault();
    const i = Number(b.dataset.i), n = Number(b.dataset.n);
    switch (b.dataset.act) {
      case 'add':
        page.items.push(blankItem()); draw();
        [...document.querySelectorAll('.cl-item')].at(-1)?.querySelector('input')?.focus();
        return;
      case 'del': if (!confirm(`Retirer « ${page.items[i].title || 'ce produit'} » de la page Clubs ?`)) return; page.items.splice(i, 1); break;
      case 'up': move(page.items, i, -1); break;
      case 'down': move(page.items, i, 1); break;
      case 'img-left': move(page.items[i].images, n, -1); break;
      case 'img-right': move(page.items[i].images, n, 1); break;
      case 'img-del': page.items[i].images.splice(n, 1); break;
      case 'upload': uploadFor = i; $('clubsFiles').click(); return;
    }
    draw();
  });
  $('clubsFiles').onchange = (e) => { if (e.target.files.length && uploadFor >= 0) uploadFiles(uploadFor, e.target.files); e.target.value = ''; };
  $('clubsSave').onclick = save;
  addEventListener('beforeunload', (e) => { if (dirty()) e.preventDefault(); });
}
