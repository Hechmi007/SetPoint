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
