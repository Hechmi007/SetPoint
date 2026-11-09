// GET /a/<ADMIN_PATH> — serves the admin dashboard only at the secret path set in the
// ADMIN_PATH environment variable. Any other key gets a plain 404, so the page can't be found by guessing /admin.
import { secretEquals } from '../lib/http.mjs';

const PAGE = "<!DOCTYPE html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"robots\" content=\"noindex, nofollow\">\n<meta name=\"referrer\" content=\"no-referrer\">\n<title>Commandes — SETPOINT Admin</title>\n<link rel=\"stylesheet\" href=\"/css/style.css\">\n<link rel=\"stylesheet\" href=\"/css/fonts.css\">\n<link rel=\"stylesheet\" href=\"/css/admin.css\">\n</head>\n<body>\n<header class=\"nav\">\n  <a class=\"logo\" href=\"\">SETPOINT · Admin</a>\n  <nav><a href=\"/\" target=\"_blank\" rel=\"noopener noreferrer\">Voir la boutique ↗</a><a href=\"#\" id=\"logout\" hidden>Déconnexion</a></nav>\n</header>\n\n<div id=\"login\" class=\"login\" hidden>\n  <form class=\"card\" id=\"loginForm\">\n    <h1 style=\"font-size:1.5rem\">Espace admin</h1>\n    <div class=\"field\"><label for=\"pw\">Mot de passe</label><input id=\"pw\" type=\"password\" autocomplete=\"current-password\" required></div>\n    <button class=\"btn p\" style=\"width:100%;margin-top:14px\">Se connecter</button>\n    <p id=\"loginErr\" style=\"color:var(--err);font-weight:600;margin:10px 0 0\"></p>\n  </form>\n</div>\n\n<main id=\"app\" class=\"w\" hidden style=\"padding-bottom:64px\">\n  <div class=\"top\">\n    <h1>Commandes</h1>\n    <span class=\"note\" id=\"updated\"></span>\n    <button class=\"btn s sm\" id=\"refresh\">↻ Actualiser</button>\n  </div>\n  <div class=\"stats\" id=\"stats\"></div>\n\n  <div class=\"filters\" id=\"filters\"></div>\n  <div class=\"table\" id=\"list\"></div>\n\n  <section class=\"prod card\" style=\"padding:20px\">\n    <h3 style=\"margin-bottom:4px\">🧵 Filament à prévoir</h3>\n    <p class=\"note\" style=\"margin:0 0 14px\">Pièces à imprimer pour les commandes nouvelles, confirmées et en production.</p>\n    <div class=\"prod-grid\" id=\"prod\"></div>\n  </section>\n</main>\n\n<dialog id=\"drawer\"><div class=\"dw\" id=\"dw\"></div></dialog>\n\n<script type=\"module\" src=\"/js/admin.js\"></script>\n</body>\n</html>\n";

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
