// Order notifications. Every channel is optional and switches on when its environment variables exist:
//
//   Email to the shop owner      RESEND_API_KEY + NOTIFY_EMAIL            (resend.com, free)
//   Telegram to the shop owner   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID    (official Telegram bot, free) with a
//                                one-tap button that opens WhatsApp to confirm to the customer from your own number
//   WhatsApp to the shop owner   OWNER_WHATSAPP + CALLMEBOT_APIKEY        (callmebot.com, free, own number only)
//                                or OWNER_WHATSAPP + WHATSAPP_TEMPLATE_ADMIN with the Meta settings below
//   WhatsApp to the customer     WHATSAPP_TOKEN + WHATSAPP_PHONE_ID       (official WhatsApp Business Cloud API)
//                                + an approved template named WHATSAPP_TEMPLATE_CLIENT (default "commande_recue")
//
// A failing channel never blocks an order: each result is "sent", "off" or "failed: reason",
// stored on the order (order.notifications) and shown in the admin.

const env = (k) => (process.env[k] || '').trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Tunisian numbers are stored as typed ("20 123 456"); WhatsApp wants 21620123456. */
export function intlPhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = '216' + d;
  return d.length >= 10 && d.length <= 15 ? d : '';
}

export function channels() {
  const meta = !!(env('WHATSAPP_TOKEN') && env('WHATSAPP_PHONE_ID'));
  const owner = intlPhone(env('OWNER_WHATSAPP'));
  return {
    email: !!(env('RESEND_API_KEY') && env('NOTIFY_EMAIL')),
    telegram: !!(env('TELEGRAM_BOT_TOKEN') && env('TELEGRAM_CHAT_ID')),
    ownerWhatsapp: owner && env('CALLMEBOT_APIKEY') ? 'callmebot' : owner && meta && env('WHATSAPP_TEMPLATE_ADMIN') ? 'meta' : false,
    clientWhatsapp: meta,
  };
}

async function call(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) });
  const body = await res.text();
  if (!res.ok) {
    let msg = body.slice(0, 160);
    try { const j = JSON.parse(body); msg = j.error?.message || j.message || msg; } catch { /* plain text */ }
    throw new Error(`${res.status} ${String(msg).replace(/\s+/g, ' ').slice(0, 160)}`);
  }
  return body;
}

const itemLine = (it) => {
  const bits = [];
  if (it.colors) bits.push(Object.values(it.colors).map((c) => `${c.part} ${c.name}`).join(', '));
  if (it.font) bits.push(`police ${it.font.name}`);
  if (it.variantName) bits.push(it.variantName);
  if (it.personalization) bits.push(`« ${it.personalization} »`);
  return { title: `${it.qty} × ${it.name}`, ref: it.variantRef || it.productRef || '', detail: bits.join(' · '), amount: it.unitPrice * it.qty };
};

// ---------- email to the owner (Resend) ----------
function emailHtml(o, siteUrl) {
  const phone = intlPhone(o.customer.phone);
  const confirm = confirmText(o, siteUrl);
  const row = (k, v) => `<tr><td style="padding:4px 12px 4px 0;color:#6E655D">${k}</td><td style="padding:4px 0"><strong>${v}</strong></td></tr>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#1F1A18">
  <div style="background:#E70013;color:#fff;padding:18px 22px;border-radius:14px 14px 0 0">
    <div style="font-size:13px;letter-spacing:2px">SETPOINT · NOUVELLE COMMANDE</div>
    <div style="font-size:26px;font-weight:900;margin-top:4px">${esc(o.ref)} — ${esc(o.total)} DT</div>
  </div>
  <div style="border:1px solid #EBDFD0;border-top:0;padding:20px 22px;border-radius:0 0 14px 14px">
    <table style="border-collapse:collapse;font-size:15px">${row('Client', esc(o.customer.name))}${row('Téléphone', `<a href="tel:${esc(o.customer.phone)}">${esc(o.customer.phone)}</a>`)}
      ${row('Gouvernorat', esc(o.customer.governorate))}${row('Adresse', esc(o.customer.address))}${o.customer.notes ? row('Notes', esc(o.customer.notes)) : ''}
      ${row('Porte-clé offert', esc(o.keychainName || '—'))}</table>
    <h3 style="margin:20px 0 8px;font-size:16px">Articles</h3>
    ${o.items.map(itemLine).map((l) => `<div style="padding:8px 0;border-top:1px solid #EBDFD0;font-size:15px">
      <strong>${esc(l.title)}</strong> <span style="color:#6E655D;font-size:12px">${esc(l.ref)}</span><span style="float:right">${esc(l.amount)} DT</span>
      ${l.detail ? `<div style="color:#6E655D;font-size:13px">${esc(l.detail)}</div>` : ''}</div>`).join('')}
    <div style="padding:8px 0;border-top:1px solid #EBDFD0;font-size:15px">Livraison<span style="float:right">${esc(o.shipping?.price ?? '—')} DT</span></div>
    <div style="padding:10px 0;border-top:2px solid #1F1A18;font-size:18px;font-weight:900">Total<span style="float:right">${esc(o.total)} DT</span></div>
    <p style="margin:20px 0 0">
      ${phone ? `<a href="https://wa.me/${phone}?text=${encodeURIComponent(confirm)}" style="background:#E70013;color:#fff;text-decoration:none;padding:12px 20px;border-radius:99px;font-weight:700;display:inline-block;margin:0 8px 8px 0">Confirmer au client sur WhatsApp</a>` : ''}
      <a href="tel:${esc(o.customer.phone)}" style="border:2px solid #1F1A18;color:#1F1A18;text-decoration:none;padding:10px 20px;border-radius:99px;font-weight:700;display:inline-block">Appeler</a></p>
    <p style="color:#6E655D;font-size:12px;margin:16px 0 0">Ouvrez votre tableau de bord pour changer le statut et préparer l’impression.</p>
  </div></div>`;
}

async function sendEmail(o, siteUrl) {
  await call('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env('NOTIFY_FROM') || 'SETPOINT <onboarding@resend.dev>',
      to: env('NOTIFY_EMAIL').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5),
      subject: `🎾 Nouvelle commande ${o.ref} — ${o.total} DT — ${o.customer.name}`,
      html: emailHtml(o, siteUrl),
    }),
  });
}

// ---------- Telegram to the owner (official Bot API) ----------
const confirmText = (o, site) => `Bonjour ${o.customer.name}, ici SETPOINT 🎾 Nous confirmons votre commande ${o.ref} (${o.total} DT). Suivez-la ici : ${site}/suivi?ref=${o.ref}`;

async function sendTelegram(o, siteUrl) {
  const phone = intlPhone(o.customer.phone);
  const lines = o.items.map(itemLine).map((l) => `• <b>${esc(l.title)}</b>${l.detail ? `\n   ${esc(l.detail)}` : ''}`);
  const text = [`🎾 <b>Nouvelle commande ${esc(o.ref)}</b>`, `<b>${esc(o.total)} DT</b> (livraison incluse)`, '',
    `👤 ${esc(o.customer.name)}`, `📞 ${esc(o.customer.phone)}`, `📍 ${esc(o.customer.governorate)} — ${esc(o.customer.address)}`,
    o.customer.notes ? `📝 ${esc(o.customer.notes)}` : null, '', ...lines, `🎁 Porte-clé : ${esc(o.keychainName || '—')}`]
    .filter((l) => l !== null).join('\n').slice(0, 3900);
  const buttons = [];
  if (phone) buttons.push([{ text: '✅ Confirmer au client sur WhatsApp', url: `https://wa.me/${phone}?text=${encodeURIComponent(confirmText(o, siteUrl))}` }]);
  if (/^https:\/\//.test(siteUrl)) buttons.push([{ text: '🔎 Voir le suivi', url: `${siteUrl}/suivi?ref=${encodeURIComponent(o.ref)}` }]);
  await call(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env('TELEGRAM_CHAT_ID'), text, parse_mode: 'HTML', disable_web_page_preview: true,
      ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}) }),
  });
}

// ---------- WhatsApp to the owner ----------
// CallMeBot is a free third-party relay, so the message carries only a short summary (no address, no phone).
const ownerText = (o) => `🎾 Nouvelle commande SETPOINT\n${o.ref} · ${o.total} DT\n${String(o.customer.name).split(' ')[0]} (${o.customer.governorate})\n`
  + o.items.map((it) => `• ${it.qty} × ${it.name}${it.variantName ? ` (${it.variantName})` : ''}`).join('\n');

async function sendOwnerCallMeBot(o) {
  const q = new URLSearchParams({ phone: '+' + intlPhone(env('OWNER_WHATSAPP')), text: ownerText(o), apikey: env('CALLMEBOT_APIKEY') });
  const body = await call(`https://api.callmebot.com/whatsapp.php?${q}`, { method: 'GET' });
  if (/apikey is invalid|not registered|error/i.test(body) && !/queued|sent/i.test(body)) throw new Error(body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 120));
}

// ---------- WhatsApp Business Cloud API (Meta): template messages ----------
// Template variables may not contain line breaks, tabs or long runs of spaces.
const param = (v) => ({ type: 'text', text: String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || '-' });

async function sendTemplate(to, name, params) {
  const version = env('WHATSAPP_API_VERSION'); // e.g. "v23.0"; empty = the app's default version
  await call(`https://graph.facebook.com/${version ? version + '/' : ''}${env('WHATSAPP_PHONE_ID')}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template',
      template: { name, language: { code: env('WHATSAPP_TEMPLATE_LANG') || 'fr' }, components: [{ type: 'body', parameters: params.map(param) }] } }),
  });
}

// Client template body ({{1}} first name, {{2}} reference, {{3}} total, {{4}} tracking link) — see README.
function sendClient(o, siteUrl) {
  const to = intlPhone(o.customer.phone);
  if (!to) throw new Error('numéro du client invalide');
  return sendTemplate(to, env('WHATSAPP_TEMPLATE_CLIENT') || 'commande_recue',
    [String(o.customer.name).split(' ')[0], o.ref, o.total, `${siteUrl}/suivi?ref=${o.ref}`]);
}
// Owner template body ({{1}} reference, {{2}} total, {{3}} customer, {{4}} items)
const sendOwnerMeta = (o) => sendTemplate(intlPhone(env('OWNER_WHATSAPP')), env('WHATSAPP_TEMPLATE_ADMIN'),
  [o.ref, o.total, `${o.customer.name} (${o.customer.governorate})`, o.items.map((it) => `${it.qty} x ${it.name}`).join(', ')]);

/** Sends every configured notification for a new order. Never throws. */
export async function notifyNewOrder(order, siteUrl) {
  const on = channels();
  const site = String(siteUrl || '').replace(/\/+$/, '');
  const run = async (enabled, fn) => {
    if (!enabled) return 'off';
    try { await fn(); return 'sent'; }
    catch (e) { console.error('notification failed', e); return `failed: ${String(e?.name === 'TimeoutError' ? 'délai dépassé' : e?.message || e).slice(0, 180)}`; }
  };
  const [email, telegram, ownerWhatsapp, clientWhatsapp] = await Promise.all([
    run(on.email, () => sendEmail(order, site)),
    run(on.telegram, () => sendTelegram(order, site)),
    run(on.ownerWhatsapp, () => (on.ownerWhatsapp === 'callmebot' ? sendOwnerCallMeBot(order) : sendOwnerMeta(order))),
    run(on.clientWhatsapp, () => sendClient(order, site)),
  ]);
  return { email, telegram, ownerWhatsapp, clientWhatsapp, at: new Date().toISOString() };
}
