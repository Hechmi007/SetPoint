// Order storage. Uses MongoDB Atlas when MONGODB_URI is set.
// For local development only (SETPOINT_DEV_STORE=1), falls back to a JSON file in .data/.
import { MongoClient } from 'mongodb';
import fs from 'node:fs/promises';
import path from 'node:path';

let clientPromise; // reused across warm serverless invocations

async function mongoCollection(name = 'orders') {
  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 });
    clientPromise = client.connect().then(async (c) => {
      const col = c.db(process.env.MONGODB_DB || 'setpoint').collection('orders');
      await col.createIndex({ ref: 1 }, { unique: true });
      await col.createIndex({ createdAt: -1 });
      return c;
    }).catch((err) => { clientPromise = undefined; throw err; });
  }
  const c = await clientPromise;
  return c.db(process.env.MONGODB_DB || 'setpoint').collection(name);
}

// ---------- dev file store ----------
const FILE = path.join(process.cwd(), '.data', 'orders.json');
async function readFile() {
  try { return JSON.parse(await fs.readFile(FILE, 'utf8')); } catch { return []; }
}
async function writeFile(rows) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

function useMongo() {
  if (process.env.MONGODB_URI) return true;
  if (process.env.SETPOINT_DEV_STORE === '1') return false;
  throw new Error('MONGODB_URI is not configured');
}

const strip = ({ _id, ...rest }) => rest;

/** Short, secret-free reason for a database failure (shown to visitors and in /api/health). */
export function classifyDbError(e) {
  const msg = `${e?.name || ''} ${e?.message || ''}`;
  if (/MONGODB_URI is not configured/.test(msg)) return 'config-missing';
  if (/Invalid scheme|MongoParseError|MongoAPIError|ENOTFOUND|URI must|connection string/i.test(msg)) return 'uri-invalid';
  if (/bad auth|Authentication failed|AuthenticationFailed/i.test(msg) || e?.code === 18 || e?.code === 8000) return 'auth-failed';
  if (/ServerSelection|timed out|ECONNREFUSED|ETIMEDOUT|ECONNRESET|whitelist|SSL|TLS/i.test(msg)) return 'network-blocked';
  return 'db-error';
}

/** Checks the database connection (used by /api/health). */
export async function pingDb() {
  if (!useMongo()) return 'file-store';
  await (await mongoCollection()).estimatedDocumentCount();
  return 'ok';
}

export async function insertOrder(order) {
  if (useMongo()) {
    await (await mongoCollection()).insertOne({ ...order });
  } else {
    const rows = await readFile();
    rows.push(order);
    await writeFile(rows);
  }
  return order;
}

export async function listOrders({ status, q, limit = 500 } = {}) {
  if (useMongo()) {
    const filter = {};
    if (status) filter.status = status;
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ ref: rx }, { 'customer.name': rx }, { 'customer.phone': rx }];
    }
    const rows = await (await mongoCollection()).find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
    return rows.map(strip);
  }
  let rows = (await readFile()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (status) rows = rows.filter((r) => r.status === status);
  if (q) {
    const s = q.toLowerCase();
    rows = rows.filter((r) => [r.ref, r.customer.name, r.customer.phone].some((v) => v.toLowerCase().includes(s)));
  }
  return rows.slice(0, limit);
}

// ---------- failed admin logins (auto-expire after 15 minutes) ----------
const WINDOW_MS = 15 * 60_000;
const memAttempts = []; // dev store only
let attemptsIndexed = false;
async function attemptsCollection() {
  const col = await mongoCollection('login_attempts');
  if (!attemptsIndexed) {
    await col.createIndex({ at: 1 }, { expireAfterSeconds: WINDOW_MS / 1000 });
    attemptsIndexed = true;
  }
  return col;
}
export async function countFailedLogins(ip) {
  const since = new Date(Date.now() - WINDOW_MS);
  if (useMongo()) return (await attemptsCollection()).countDocuments({ ip, at: { $gt: since } });
  return memAttempts.filter((a) => a.ip === ip && a.at > since).length;
}
export async function recordFailedLogin(ip) {
  if (useMongo()) await (await attemptsCollection()).insertOne({ ip, at: new Date() });
  else memAttempts.push({ ip, at: new Date() });
}
export async function clearFailedLogins(ip) {
  if (useMongo()) await (await attemptsCollection()).deleteMany({ ip });
  else for (let i = memAttempts.length - 1; i >= 0; i--) if (memAttempts[i].ip === ip) memAttempts.splice(i, 1);
}

export async function updateOrder(ref, patch) {
  if (useMongo()) {
    const res = await (await mongoCollection()).findOneAndUpdate(
      { ref }, { $set: patch }, { returnDocument: 'after' });
    return res ? strip(res) : null;
  }
  const rows = await readFile();
  const row = rows.find((r) => r.ref === ref);
  if (!row) return null;
  Object.assign(row, patch);
  await writeFile(rows);
  return row;
}
