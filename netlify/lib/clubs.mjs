// The Clubs page (/clubs): a simple showcase edited in the admin "Clubs" tab, separate from the shop.
// Stored as one document { id: 'clubs', ... } in the `settings` collection.
import crypto from 'node:crypto';
import { store } from './db.mjs';
import { imageUrl } from './catalog.mjs';

const text = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const line = (v, max) => text(v, max).replace(/\s+/g, ' ');

export const DEFAULT_CLUBS_PAGE = {
  title: 'Équipez votre club, à vos couleurs.',
  intro: 'Compteurs de score, porte-clés et accessoires imprimés en Tunisie pour les clubs de padel et de tennis : pour vos membres, vos tournois, votre boutique d’accueil ou en cadeau de bienvenue.',
  showShop: true,
  items: [],
};

class Invalid extends Error { constructor(m) { super(m); this.status = 400; } }

/** Validates the page sent by the admin. Prices are optional (empty = "sur devis"). */
export function cleanClubsPage(raw) {
  const items = [];
  for (const it of (Array.isArray(raw?.items) ? raw.items : []).slice(0, 60)) {
    const title = line(it?.title, 100);
    const images = (Array.isArray(it?.images) ? it.images : []).map(imageUrl).filter(Boolean).slice(0, 10);
    const description = text(it?.description, 3000);
    if (!title && !images.length && !description) continue;          // empty card: dropped
    let price = null;
    if (it?.price !== '' && it?.price != null) {
      price = Number(String(it.price).replace(',', '.'));
      if (!Number.isFinite(price) || price < 0 || price > 100000) throw new Invalid(`Prix invalide pour « ${title || 'un produit'} »`);
      price = Math.round(price * 1000) / 1000;
    }
    const id = /^[a-f0-9]{12}$/.test(it?.id) ? it.id : crypto.randomBytes(6).toString('hex');
    items.push({ id, title, description, images, price, priceNote: line(it?.priceNote, 40) });
  }
  return {
    title: line(raw?.title, 120) || DEFAULT_CLUBS_PAGE.title,
    intro: text(raw?.intro, 1000),
    showShop: raw?.showShop !== false,
    items,
  };
}

export async function getClubsPage() {
  const doc = await store.get('settings', { id: 'clubs' });
  if (!doc) return { ...DEFAULT_CLUBS_PAGE };
  const { id, _id, ...page } = doc;
  return page;
}

export async function saveClubsPage(page) {
  const doc = { ...page, updatedAt: new Date().toISOString() };
  if (await store.get('settings', { id: 'clubs' })) await store.update('settings', { id: 'clubs' }, doc);
  else await store.insert('settings', { id: 'clubs', ...doc });
  return doc;
}
