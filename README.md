# SETPOINT shop

Static shop on **Netlify** + **Netlify Functions** (API) + **MongoDB Atlas M0** (free database).

| URL | What |
|---|---|
| `/` | Shop home + product list |
| `/produit?id=compteur-score` | Customizer (body, writing, pins, clips colors) |
| `/panier` | Cart + checkout (cash on delivery) |
| `/a/<ADMIN_PATH>` | Orders dashboard: secret URL + password (`/admin` returns 404) |

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:8888. Without `MONGODB_URI` in `.env`, orders are saved to `.data/orders.json`.

Run `npm run admin-setup` once to create the admin URL and password (written to the git-ignored `admin-credentials.local.txt`).

## Deploy (one time setup)

1. **MongoDB Atlas** (free): create an account at mongodb.com/atlas → create a free **M0** cluster → *Database Access*: add a user with a password → *Network Access*: allow `0.0.0.0/0` (Netlify functions have no fixed IP) → *Connect → Drivers*: copy the connection string.
2. **Netlify** → your site → *Site configuration → Environment variables*, add:
   - `MONGODB_URI` = the Atlas connection string (with your password filled in)
   - `MONGODB_DB` = `setpoint`
   - `ADMIN_PATH`, `ADMIN_PASSWORD_HASH`, `AUTH_SECRET` = copy from your `.env` after `npm run admin-setup`
3. Connect the site to this Git repo (*Site configuration → Build & deploy → Link repository*). Netlify reads `netlify.toml`: publish dir `public`, functions in `netlify/functions`. No build command needed.
   (Drag-and-drop deploys don't include functions — use Git, or `npx netlify-cli deploy --prod`.)

## Change colors / products

Everything lives in [`public/js/products.js`](public/js/products.js):
- Out of a filament color? Set `available: false` on it.
- Change price, part names, presets there. The server recomputes prices from this file.
- New product: draw an SVG in `public/products/`, tag each colorable piece with `data-part="..."`, add an entry to `PRODUCTS`.

## Admin security

- The dashboard only exists at `/a/<ADMIN_PATH>` (48 random characters, stored only in env vars, never in this public repo).
- Only a scrypt **hash** of the password is stored; the login also requires the secret path.
- 5 wrong passwords from one IP → locked for 15 minutes. Sessions expire after 8 hours.
- To change the password / URL: `npm run admin-setup` (add `--keep-url` to keep the URL, or pass your own password: `npm run admin-setup -- "a long password"`), then update the 3 values in Netlify and redeploy.

## Notifications (new order → email + WhatsApp)

Each channel is optional and switches on when its Netlify environment variables exist. After adding
variables: **Deploys → Trigger deploy**, then use **🔔 Tester les notifications** in the admin.
`/api/health` shows which channels are on. Every order stores what was sent (see the order drawer).

### 1. Email to you — Resend (free, 2 min)
1. Sign up at resend.com **with the email address where you want the alerts**.
2. API Keys → Create API key → copy it.
3. Netlify variables: `RESEND_API_KEY` (mark as secret) and `NOTIFY_EMAIL` = that same address.

Without a verified domain, Resend only delivers to your own sign-up address — which is all this needs.

### 2. Telegram to you — official bot (free, unlimited, 3 min) — recommended
The alert has the full order and a **"Confirmer au client sur WhatsApp"** button: one tap opens WhatsApp
with the confirmation ready, sent from your own number.
1. In Telegram, open **@BotFather** → send `/newbot` → choose a name and a username ending in `bot` → copy the **token**.
2. Open your new bot and press **Start** (send it any message) — a bot can only write to people who started it.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and copy the number after `"chat":{"id":`.
4. Netlify variables: `TELEGRAM_BOT_TOKEN` (mark as secret) and `TELEGRAM_CHAT_ID`.

To alert several people, create a Telegram group, add the bot, and use the group's chat id (a negative number).

### 2b. WhatsApp to you — CallMeBot (optional; free but often has no free slots)
1. Add **+34 644 51 95 23** to your phone contacts (check callmebot.com → "WhatsApp" for the current number).
2. Send it this WhatsApp message: `I allow callmebot to send me messages`
3. It replies with your API key.
4. Netlify variables: `OWNER_WHATSAPP` = your number with country code, digits only (e.g. `21650992700`),
   and `CALLMEBOT_APIKEY` (mark as secret).

CallMeBot is a free third-party relay, so the message only carries a summary (reference, total, first name,
governorate, items). Full details are in the email and the dashboard.

### 3. WhatsApp to the customer — WhatsApp Business Cloud API (official, by Meta)
Needs a phone number that is **not** currently used in the WhatsApp or WhatsApp Business app.
1. business.facebook.com → create a Business account. developers.facebook.com → Create app → type *Business* → add the **WhatsApp** product.
2. WhatsApp → API Setup: add and verify your phone number. Copy the **Phone number ID**.
3. WhatsApp Manager → Message templates → Create: category **Utility**, name `commande_recue`, language **French**, body:

   > Bonjour {{1}} 👋 Merci pour votre commande SETPOINT {{2}} ({{3}} DT). Nous vous appelons très vite pour la confirmer. Suivez votre commande ici : {{4}}

   Samples for the variables: `Amine`, `SP-261113-AB12`, `33`, `https://setpointzero.netlify.app/suivi?ref=SP-261113-AB12`. Wait for approval.
4. Business settings → Users → System users → add one (Admin) → assign the app + WhatsApp account → Generate token with
   `whatsapp_business_messaging` and `whatsapp_business_management`, expiration **Never**.
5. Netlify variables: `WHATSAPP_TOKEN` (mark as secret), `WHATSAPP_PHONE_ID`, and optionally
   `WHATSAPP_TEMPLATE_CLIENT` (default `commande_recue`) / `WHATSAPP_TEMPLATE_LANG` (default `fr`).
6. Add a payment method in WhatsApp Manager: template messages are billed per message by Meta.

Optional: `WHATSAPP_TEMPLATE_ADMIN` = an approved template with 4 variables (reference, total, customer, items)
sends your own alert through Meta instead of CallMeBot.
