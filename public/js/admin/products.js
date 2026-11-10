// Produits tab: list + editor for catalog products (keychains, ...).
// The editor keeps the product in `ed.p`; text fields write into it as you type (data-k="path"),
// buttons (data-act) change its structure and re-draw the form.
import { toast } from '/js/common.js';
import { $, api, esc, money } from '/js/admin/core.js';

let list = [], builtIn = [];
let ed = null; // { id: existing id or null, p: product being edited }

const LAYOUTS = [
  { id: 'classic', name: 'Classique', hint: 'Photos à gauche, achat à droite, détails dessous.' },
  { id: 'gallery', name: 'Galerie', hint: 'Grandes photos qui défilent, achat centré dessous.' },
  { id: 'story', name: 'Story', hint: 'Grande photo plein écran, puis votre histoire en sections.' },
];
const SECTIONS = { text: '📝 Texte', features: '⭐ Points forts', image: '🖼️ Image', specs: '📐 Caractéristiques' };
const blank = () => ({ name: '', ref: '', category: 'Porte-clés', price: '', status: 'draft', tagline: '', description: '', layout: 'classic',
  images: [], sections: [], variantLabel: 'Couleur', variants: [], personalization: { enabled: false, label: 'Prénom à graver', maxLength: 15, required: false } });

export async function load() {
  try {
    const d = await api('/api/admin/products');
    list = d.products; builtIn = d.builtIn; renderList();
  } catch (ex) { toast(ex.message); }
}

function renderList() {
  const card = (p, custom) => `<article class="pcard card">
    <div class="pimg">${p.image || p.images?.[0] ? `<img src="${esc(p.image || p.images[0])}" alt="">` : '<span>🏷️</span>'}</div>
    <div class="pbody">
      <div class="prow-top"><span class="mono">${esc(p.ref)}</span>${custom ? '<span class="badge st-confirmed">Personnalisable · intégré</span>'
        : `<span class="badge ${p.status === 'published' ? 'st-delivered' : 'st-cancelled'}">${p.status === 'published' ? 'Publié' : 'Brouillon'}</span>`}</div>
      <h3>${esc(p.name)}</h3>
      <div class="note">${money(p.price)}${custom ? '' : ` · ${p.variants.length} variante(s)${p.personalization?.enabled ? ' · personnalisable' : ''}`}</div>
      <div class="pactions">${custom ? `<a class="btn s sm" href="/produit?id=${esc(p.id)}" target="_blank">Voir</a><span class="note">Couleurs et prix : fichier products.js</span>`
        : `<button type="button" class="btn p sm" data-edit="${esc(p.id)}">Modifier</button><button type="button" class="btn s sm" data-preview="${esc(p.id)}">Aperçu</button><button type="button" class="btn s sm danger" data-del="${esc(p.id)}">Supprimer</button>`}</div>
    </div></article>`;
  $('pgrid').innerHTML = builtIn.map((p) => card(p, true)).join('') + list.map((p) => card(p, false)).join('')
    + (list.length ? '' : `<div class="empty card">Aucun produit pour l’instant. Créez votre premier porte-clé avec « + Nouveau produit ».</div>`);
}

const preview = (id) => window.open(`/article?id=${encodeURIComponent(id)}`, '_blank'); // keeps the admin session for drafts

export function init() {
  $('newProduct').onclick = () => openEditor(null);
  $('pgrid').addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.edit) openEditor(list.find((p) => p.id === t.dataset.edit));
    if (t.dataset.preview) preview(t.dataset.preview);
    if (t.dataset.del) {
      const p = list.find((x) => x.id === t.dataset.del);
      if (!confirm(`Supprimer définitivement « ${p.name} » (${p.ref}) ?\nLes commandes déjà passées ne sont pas touchées.`)) return;
      try { await api('/api/admin/products?id=' + encodeURIComponent(p.id), { method: 'DELETE' }); toast('Produit supprimé'); load(); }
      catch (ex) { toast(ex.message); }
    }
  });

  const form = $('edForm');
  // typing: write the value into the product without re-drawing (keeps focus)
  form.addEventListener('input', (e) => {
    const el = e.target.closest('[data-k]'); if (!el) return;
    setPath(ed.p, el.dataset.k, el.type === 'checkbox' ? el.checked : el.value);
    if (el.dataset.k === 'name' && !ed.id) { const u = $('edUrl'); if (u) u.textContent = '/article?id=' + slug(el.value); }
    if (el.dataset.redraw !== undefined) draw();
  });
  form.addEventListener('change', (e) => { if (e.target.closest('[data-redraw]') && e.target.tagName === 'SELECT') draw(); });
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    e.preventDefault();
    act(b.dataset.act, b.dataset);
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); save(false); });
  $('editor').addEventListener('cancel', (e) => { if (!confirmLeave()) e.preventDefault(); });
}

const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
let savedJson = '';
const confirmLeave = () => JSON.stringify(ed?.p) === savedJson || confirm('Quitter sans enregistrer les modifications ?');

function openEditor(p) {
  ed = { id: p?.id || null, p: structuredClone(p ? stripMeta(p) : blank()) };
  savedJson = JSON.stringify(ed.p);
  draw();
  $('editor').showModal();
}
const stripMeta = ({ createdAt, updatedAt, ...rest }) => rest;

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)] = value;
}

const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };

async function act(a, d) {
  const p = ed.p; const i = Number(d.i), j = Number(d.j);
  switch (a) {
    case 'close': if (confirmLeave()) $('editor').close(); return;
    case 'save': return save(false);
    case 'save-preview': return save(true);
    case 'upload': return $('edFiles').click();
    case 'img-left': move(p.images, i, -1); break;
    case 'img-right': move(p.images, i, 1); break;
    case 'img-del': p.images.splice(i, 1); break;
    case 'layout': p.layout = d.layout; break;
    case 'sec-add': p.sections.push(d.type === 'text' ? { type: 'text', title: '', body: '' }
      : d.type === 'features' ? { type: 'features', title: 'Pourquoi vous allez l’adorer', items: [{ icon: '✨', title: '', text: '' }] }
      : d.type === 'image' ? { type: 'image', url: p.images[0] || '', caption: '', wide: false }
      : { type: 'specs', title: 'Caractéristiques', rows: [{ label: 'Matière', value: 'PLA, imprimé en 3D en Tunisie' }, { label: 'Dimensions', value: '' }] }); break;
    case 'sec-up': move(p.sections, i, -1); break;
    case 'sec-down': move(p.sections, i, 1); break;
    case 'sec-del': p.sections.splice(i, 1); break;
    case 'feat-add': p.sections[i].items.push({ icon: '', title: '', text: '' }); break;
    case 'feat-del': p.sections[i].items.splice(j, 1); break;
    case 'spec-add': p.sections[i].rows.push({ label: '', value: '' }); break;
    case 'spec-del': p.sections[i].rows.splice(j, 1); break;
    case 'var-add': p.variants.push({ name: '', ref: '', price: '', image: '', available: true }); break;
    case 'var-del': p.variants.splice(i, 1); break;
    case 'var-up': move(p.variants, i, -1); break;
    case 'var-down': move(p.variants, i, 1); break;
    default: return;
  }
  draw();
}

// ---------- photos: resized in the browser (max 1400px, JPEG) then uploaded ----------
async function resize(file, max = 1400) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}
async function uploadFiles(files) {
  const status = $('edUpStatus');
  for (const [n, f] of [...files].entries()) {
    if (ed.p.images.length >= 12) { toast('12 photos maximum'); break; }
    status.textContent = `Envoi de la photo ${n + 1}/${files.length}…`;
    try {
      const { url } = await api('/api/admin/images', { method: 'POST', body: JSON.stringify({ dataUrl: await resize(f) }) });
      ed.p.images.push(url);
    } catch (ex) { toast(`${f.name} : ${ex.message}`); }
  }
  status.textContent = '';
  draw();
}

async function save(thenPreview) {
  const btns = $('edForm').querySelectorAll('[data-act^="save"]');
  btns.forEach((b) => { b.disabled = true; });
  $('edErr').textContent = '';
  try {
    const { product } = ed.id
      ? await api('/api/admin/products', { method: 'PATCH', body: JSON.stringify({ id: ed.id, product: ed.p }) })
      : await api('/api/admin/products', { method: 'POST', body: JSON.stringify({ product: ed.p }) });
    ed = { id: product.id, p: stripMeta(product) };
    savedJson = JSON.stringify(ed.p);
    toast('Produit enregistré ✓');
    draw(); load();
    if (thenPreview) preview(product.id);
  } catch (ex) {
    $('edErr').textContent = ex.message;
  } finally { btns.forEach((b) => { b.disabled = false; }); }
}

// ---------- the form ----------
const v = (x) => esc(x ?? '');
const imgSelect = (key, current, images) => `<select data-k="${key}" data-redraw>
  <option value="">— aucune —</option>${images.map((u, n) => `<option value="${v(u)}" ${u === current ? 'selected' : ''}>Photo ${n + 1}</option>`).join('')}</select>`;

function draw() {
  const p = ed.p;
  $('edForm').innerHTML = `
  <header class="ed-head">
    <h2>${ed.id ? `Modifier · <span class="mono">${v(p.ref)}</span>` : 'Nouveau produit'}</h2>
    <div class="ed-actions">
      <button class="btn s sm" data-act="close" type="button">Fermer</button>
      <button class="btn s sm" data-act="save-preview" type="button">Enregistrer et voir</button>
      <button class="btn p sm" data-act="save" type="button">Enregistrer</button>
    </div>
  </header>
  <p id="edErr" class="ed-err" role="alert"></p>

  <div class="ed-body">
    <section class="ed-card">
      <h3>1. Informations</h3>
      <div class="form-grid">
        <div class="field full"><label>Nom du produit *</label><input data-k="name" value="${v(p.name)}" placeholder="Porte-clé raquette personnalisé" maxlength="80"></div>
        <div class="field"><label>Référence *</label><input data-k="ref" value="${v(p.ref)}" placeholder="SP-PC-001" maxlength="30" style="text-transform:uppercase"></div>
        <div class="field"><label>Prix (DT) *</label><input data-k="price" value="${v(p.price)}" inputmode="decimal" placeholder="15"></div>
        <div class="field"><label>Catégorie</label><input data-k="category" value="${v(p.category)}" placeholder="Porte-clés" maxlength="40"></div>
        <div class="field"><label>Statut</label><select data-k="status"><option value="draft" ${p.status !== 'published' ? 'selected' : ''}>Brouillon (caché)</option><option value="published" ${p.status === 'published' ? 'selected' : ''}>Publié (visible en boutique)</option></select></div>
        <div class="field full"><label>Accroche (une phrase)</label><input data-k="tagline" value="${v(p.tagline)}" maxlength="160" placeholder="Votre prénom, votre sport, imprimé en 3D en Tunisie."></div>
        <div class="field full"><label>Description</label><textarea data-k="description" rows="4" maxlength="3000" placeholder="Laissez une ligne vide pour commencer un nouveau paragraphe.">${v(p.description)}</textarea></div>
      </div>
      <p class="note">Adresse de la page : <span class="mono" id="edUrl">/article?id=${v(ed.id || slug(p.name))}</span>${ed.id ? ' (fixe)' : ''}</p>
    </section>

    <section class="ed-card">
      <h3>2. Photos <span class="note">(la première est la photo principale)</span></h3>
      <div class="ed-imgs">${p.images.map((u, n) => `<figure><img src="${v(u)}" alt=""><figcaption>
        <button data-act="img-left" data-i="${n}" title="Avancer" ${n === 0 ? 'disabled' : ''}>←</button><span>${n + 1}</span>
        <button data-act="img-right" data-i="${n}" title="Reculer" ${n === p.images.length - 1 ? 'disabled' : ''}>→</button>
        <button data-act="img-del" data-i="${n}" title="Retirer" class="x">✕</button></figcaption></figure>`).join('')}
        <button class="ed-add-img" data-act="upload" type="button">＋<br>Ajouter des photos</button></div>
      <input type="file" id="edFiles" accept="image/jpeg,image/png,image/webp" multiple hidden>
      <p class="note" id="edUpStatus"></p>
    </section>

    <section class="ed-card">
      <h3>3. Mise en page</h3>
      <div class="ed-layouts">${LAYOUTS.map((l) => `<button type="button" class="ed-layout" data-act="layout" data-layout="${l.id}" aria-pressed="${p.layout === l.id}">
        <span class="schema s-${l.id}"><i></i><i></i><i></i><i></i></span><strong>${l.name}</strong><span class="note">${l.hint}</span></button>`).join('')}</div>
    </section>

    <section class="ed-card">
      <h3>4. Variantes <span class="note">(couleurs, modèles… laissez vide s’il n’y en a pas)</span></h3>
      <div class="field" style="max-width:280px"><label>Nom du choix affiché au client</label><input data-k="variantLabel" value="${v(p.variantLabel)}" placeholder="Couleur, Modèle, Sport…" maxlength="40"></div>
      ${p.variants.length ? `<div class="ed-vars"><div class="ed-var head"><span>Nom</span><span>Référence</span><span>Prix (vide = ${v(p.price || 'prix du produit')})</span><span>Photo</span><span>Dispo</span><span></span></div>
        ${p.variants.map((x, n) => `<div class="ed-var">
          <input data-k="variants.${n}.name" value="${v(x.name)}" placeholder="Rouge" maxlength="60">
          <input data-k="variants.${n}.ref" value="${v(x.ref)}" placeholder="${v((p.ref || 'SP-XX') + '-' + String(n + 1).padStart(2, '0'))}" maxlength="30" style="text-transform:uppercase">
          <input data-k="variants.${n}.price" value="${v(x.price)}" inputmode="decimal" placeholder="—">
          <span class="ed-varimg">${x.image ? `<img src="${v(x.image)}" alt="">` : ''}${imgSelect(`variants.${n}.image`, x.image, p.images)}</span>
          <label class="sw-toggle"><input type="checkbox" data-k="variants.${n}.available" ${x.available !== false ? 'checked' : ''}><span></span></label>
          <span class="ed-mini"><button data-act="var-up" data-i="${n}" title="Monter">↑</button><button data-act="var-down" data-i="${n}" title="Descendre">↓</button><button data-act="var-del" data-i="${n}" class="x" title="Supprimer">✕</button></span>
        </div>`).join('')}</div>` : ''}
      <button class="btn s sm" data-act="var-add" type="button" style="margin-top:10px">+ Ajouter une variante</button>
    </section>

    <section class="ed-card">
      <h3>5. Personnalisation</h3>
      <label class="chk-inline"><input type="checkbox" data-k="personalization.enabled" data-redraw ${p.personalization.enabled ? 'checked' : ''}> Le client peut écrire un texte (prénom, initiales…)</label>
      ${p.personalization.enabled ? `<div class="form-grid" style="margin-top:12px">
        <div class="field"><label>Question posée</label><input data-k="personalization.label" value="${v(p.personalization.label)}" maxlength="80"></div>
        <div class="field"><label>Nombre de caractères max</label><input data-k="personalization.maxLength" value="${v(p.personalization.maxLength)}" inputmode="numeric"></div>
        <label class="chk-inline full"><input type="checkbox" data-k="personalization.required" ${p.personalization.required ? 'checked' : ''}> Obligatoire</label></div>` : ''}
    </section>

    <section class="ed-card">
      <h3>6. Sections de la page <span class="note">(dans l’ordre d’affichage, après la description)</span></h3>
      ${p.sections.map((s, n) => `<div class="ed-sec">
        <div class="ed-sec-head"><strong>${SECTIONS[s.type]}</strong>
          <span class="ed-mini"><button data-act="sec-up" data-i="${n}" ${n === 0 ? 'disabled' : ''}>↑</button><button data-act="sec-down" data-i="${n}" ${n === p.sections.length - 1 ? 'disabled' : ''}>↓</button><button data-act="sec-del" data-i="${n}" class="x">✕</button></span></div>
        ${sectionFields(s, n, p.images)}</div>`).join('')}
      <div class="ed-sec-add">${Object.entries(SECTIONS).map(([t, l]) => `<button class="btn s sm" data-act="sec-add" data-type="${t}" type="button">+ ${l}</button>`).join('')}</div>
    </section>
  </div>`;
  $('edFiles').onchange = (e) => { if (e.target.files.length) uploadFiles(e.target.files); e.target.value = ''; };
}

function sectionFields(s, n, images) {
  const k = (f) => `sections.${n}.${f}`;
  if (s.type === 'text') return `<div class="field"><label>Titre</label><input data-k="${k('title')}" value="${v(s.title)}" maxlength="100"></div>
    <div class="field"><label>Texte</label><textarea data-k="${k('body')}" rows="4" maxlength="4000">${v(s.body)}</textarea></div>`;
  if (s.type === 'image') return `<div class="ed-sec-img">${s.url ? `<img src="${v(s.url)}" alt="">` : '<span class="note">Choisissez une photo (ajoutez-la d’abord dans « Photos »)</span>'}
    <div><div class="field"><label>Photo</label>${imgSelect(k('url'), s.url, images)}</div>
    <div class="field"><label>Légende</label><input data-k="${k('caption')}" value="${v(s.caption)}" maxlength="200"></div>
    <label class="chk-inline"><input type="checkbox" data-k="${k('wide')}" ${s.wide ? 'checked' : ''}> Pleine largeur</label></div></div>`;
  if (s.type === 'features') return `<div class="field"><label>Titre</label><input data-k="${k('title')}" value="${v(s.title)}" maxlength="100"></div>
    ${s.items.map((it, j) => `<div class="ed-row3"><input data-k="${k(`items.${j}.icon`)}" value="${v(it.icon)}" placeholder="🎾" maxlength="8" class="ic">
      <input data-k="${k(`items.${j}.title`)}" value="${v(it.title)}" placeholder="Titre" maxlength="80">
      <input data-k="${k(`items.${j}.text`)}" value="${v(it.text)}" placeholder="Texte court" maxlength="400">
      <button data-act="feat-del" data-i="${n}" data-j="${j}" class="x">✕</button></div>`).join('')}
    <button class="btn s sm" data-act="feat-add" data-i="${n}" type="button">+ Point fort</button>`;
  return `<div class="field"><label>Titre</label><input data-k="${k('title')}" value="${v(s.title)}" maxlength="100"></div>
    ${s.rows.map((r, j) => `<div class="ed-row2"><input data-k="${k(`rows.${j}.label`)}" value="${v(r.label)}" placeholder="Matière" maxlength="60">
      <input data-k="${k(`rows.${j}.value`)}" value="${v(r.value)}" placeholder="PLA" maxlength="200">
      <button data-act="spec-del" data-i="${n}" data-j="${j}" class="x">✕</button></div>`).join('')}
    <button class="btn s sm" data-act="spec-add" data-i="${n}" type="button">+ Ligne</button>`;
}
