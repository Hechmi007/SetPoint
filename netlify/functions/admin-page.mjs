// GET /a/<ADMIN_PATH> — serves the admin dashboard only at the secret path set in the
// ADMIN_PATH environment variable. Any other key gets a plain 404, so the page can't be found by guessing /admin.
import { secretEquals } from '../lib/http.mjs';

const PAGE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>SETPOINT Admin</title>
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/style.css">
<link rel="stylesheet" href="/css/fonts.css">
<link rel="stylesheet" href="/css/admin.css">
</head>
<body>
<header class="nav">
  <a class="logo" href=""><img src="/img/logo-mark.svg" alt="" width="30" height="30">SETPOINT · Admin</a>
  <nav><a href="/" target="_blank" rel="noopener noreferrer">Voir la boutique ↗</a><a href="#" id="logout" hidden>Déconnexion</a></nav>
</header>

<div id="login" class="login" hidden>
  <form class="card" id="loginForm">
    <h1 style="font-size:1.5rem">Espace admin</h1>
    <div class="field"><label for="pw">Mot de passe</label><input id="pw" type="password" autocomplete="current-password" required></div>
    <button class="btn p" style="width:100%;margin-top:14px">Se connecter</button>
    <p id="loginErr" style="color:var(--err);font-weight:600;margin:10px 0 0"></p>
  </form>
</div>

<div id="app" hidden>
  <nav class="tabs" id="tabs" aria-label="Sections">
    <a href="#commandes" data-tab="commandes">📦 Commandes <span class="tb" id="tbOrders"></span></a>
    <a href="#production" data-tab="production">🖨️ Production <span class="tb" id="tbProd"></span></a>
    <a href="#produits" data-tab="produits">🏷️ Produits</a>
    <span class="tabs-right"><span class="note" id="updated"></span><button class="btn s sm" id="refresh">↻</button></span>
  </nav>

  <main class="w" style="padding-bottom:64px">
    <section id="view-commandes" class="view">
      <div class="top"><h1>Commandes</h1><button class="btn s sm" id="notifyTest" type="button">🔔 Tester les notifications</button></div>
      <div id="notifyResult" class="notify-result" hidden></div>
      <div class="stats" id="stats"></div>
      <div class="filters" id="filters"></div>
      <div class="table" id="list"></div>
    </section>

    <section id="view-production" class="view" hidden>
      <div class="top"><h1>Production</h1>
        <div class="seg" id="prodMode" role="group" aria-label="Regrouper">
          <button type="button" data-mode="filament" aria-pressed="true">Par filament</button>
          <button type="button" data-mode="order" aria-pressed="false">Par commande</button>
        </div>
        <label class="chk-inline"><input type="checkbox" id="prodHideDone" checked> Masquer les pièces imprimées</label>
        <label class="chk-inline"><input type="checkbox" id="prodNew" checked> Inclure les nouvelles</label>
        <button class="btn s sm" id="prodPrint" type="button">🖨 Imprimer la fiche</button>
      </div>
      <div id="prodSummary"></div>
      <div id="prodBoard"></div>
    </section>

    <section id="view-produits" class="view" hidden>
      <div class="top"><h1>Produits</h1><button class="btn p sm" id="newProduct" type="button">+ Nouveau produit</button></div>
      <p class="note" style="margin-top:-8px">Les produits publiés apparaissent dans la boutique. Les brouillons ne sont visibles qu’ici (bouton Aperçu).</p>
      <div class="pgrid" id="pgrid"></div>
    </section>
  </main>
</div>

<dialog id="drawer"><div class="dw" id="dw"></div></dialog>
<dialog id="editor" class="editor"><form id="edForm" class="ed" novalidate></form></dialog>

<script type="module" src="/js/admin.js"></script>
</body>
</html>
`;

const HEADERS = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
};

export default async (req, context) => {
  const key = context?.params?.key ?? new URL(req.url).pathname.split('/')[2] ?? '';
  const expected = process.env.ADMIN_PATH || '';
  if (expected.length < 20 || !secretEquals(decodeURIComponent(key), expected)) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain', ...HEADERS } });
  }
  return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', ...HEADERS } });
};

export const config = { path: '/a/:key' };
