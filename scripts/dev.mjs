// Minimal local dev server: serves /public and routes /api/* to the Netlify functions.
// Usage: npm run dev   (reads .env if present; without MONGODB_URI orders go to .data/orders.json)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.SETPOINT_DEV_STORE = '1';
const PORT = Number(process.env.PORT) || 8888;
const ROOT = path.resolve('public');

const fnDir = path.resolve('netlify/functions');
const routes = []; // [{ re, handler }] — supports Netlify-style "/a/:key" params
for (const f of await fs.readdir(fnDir)) {
  const mod = await import(pathToFileURL(path.join(fnDir, f)).href);
  const names = [];
  const re = new RegExp('^' + mod.config.path.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
  routes.push({ re, names, handler: mod.default });
}
const match = (p) => {
  for (const r of routes) {
    const m = r.re.exec(p);
    if (m) return { handler: r.handler, params: Object.fromEntries(r.names.map((n, i) => [n, m[i + 1]])) };
  }
  return null;
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    const route = match(url.pathname);
    if (route) {
      const { handler, params } = route;
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const response = await handler(request, { params, ip: req.socket.remoteAddress });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      console.log(req.method, url.pathname.startsWith('/a/') ? '/a/***' : url.pathname, response.status);
      return;
    }
    let file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) throw new Error('bad path');
    if ((await fs.stat(file).catch(() => null))?.isDirectory()) file = path.join(file, 'index.html');
    if (!(await fs.stat(file).catch(() => null)) && !path.extname(file)) file += '.html';
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`SETPOINT dev → http://localhost:${PORT}  (orders: ${process.env.MONGODB_URI ? 'MongoDB Atlas' : '.data/orders.json'})`);
  console.log(process.env.ADMIN_PATH ? 'Admin URL: see admin-credentials.local.txt or ADMIN_PATH in .env'
    : 'Admin not configured yet: run  npm run admin-setup');
});
