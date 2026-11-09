// Product catalog — shared by the browser AND the server functions.
// The server recomputes every price from this file, so clients can't change prices.
//
// To add a product later:
//   1. Draw an SVG in /public/products/<id>.svg and tag each colorable piece with data-part="<partId>"
//   2. Add an entry to PRODUCTS below.

// Filament colors available in the workshop. Set `available: false` to hide one when out of stock.
export const COLORS = [
  { id: 'black',     name: 'Noir',          hex: '#232526' },
  { id: 'white',     name: 'Blanc',         hex: '#f4f2ec' },
  { id: 'grey',      name: 'Gris',          hex: '#9a9c9e' },
  { id: 'red',       name: 'Rouge',         hex: '#e0422f' },
  { id: 'orange',    name: 'Orange',        hex: '#e98a52' },
  { id: 'yellow',    name: 'Jaune',         hex: '#efc84a' },
  { id: 'olive',     name: 'Vert olive',    hex: '#7f9653' },
  { id: 'green',     name: 'Vert foncé',    hex: '#1f5d3f' },
  { id: 'teal',      name: 'Bleu canard',   hex: '#16808a' },
  { id: 'sky',       name: 'Bleu ciel',     hex: '#33b6dc' },
  { id: 'navy',      name: 'Bleu marine',   hex: '#1d2f66' },
  { id: 'lavender',  name: 'Lavande',       hex: '#a9a6d9' },
  { id: 'purple',    name: 'Violet',        hex: '#a477cf' },
  { id: 'burgundy',  name: 'Bordeaux',      hex: '#7a2638' },
  { id: 'brown',     name: 'Marron',        hex: '#704a35' },
  { id: 'pink',      name: 'Rose',          hex: '#ef8fb4' },
].map((c) => ({ available: true, ...c }));

// Fonts offered for the raised writing. `family` must match the Google Fonts link in /css/fonts.css.
// Set `available: false` to hide one (e.g. if it prints badly).
export const FONTS = [
  { id: 'comic',   name: 'Classique', family: 'Comic Neue',       weight: 700 },
  { id: 'round',   name: 'Arrondie',  family: 'Nunito',           weight: 800 },
  { id: 'sport',   name: 'Sport',     family: 'Oswald',           weight: 600 },
  { id: 'digital', name: 'Digitale',  family: 'Orbitron',         weight: 700 },
  { id: 'slab',    name: 'Élégante',  family: 'Roboto Slab',      weight: 700 },
  { id: 'marker',  name: 'Marqueur',  family: 'Permanent Marker', weight: 400 },
].map((f) => ({ available: true, ...f }));

export const PRODUCTS = [
  {
    id: 'compteur-score',
    name: 'Compteur de score',
    tagline: 'Se fixe sur votre raquette de padel ou de tennis.',
    price: 25, // DT
    image: '/img/compteur.jpg',
    svg: '/products/compteur-score.svg',
    parts: [
      { id: 'body',    label: 'Corps',     hint: 'La plaque principale',          default: 'black' },
      { id: 'writing', label: 'Écriture',  hint: 'Chiffres et textes en relief',  default: 'grey' },
      { id: 'pinsLeft',  label: 'Curseurs gauche', hint: 'Les marqueurs qui coulissent à gauche', default: 'black' },
      { id: 'pinsRight', label: 'Curseurs droite', hint: 'Les marqueurs qui coulissent à droite', default: 'red' },
    ],
    // Font of the part named in `fontPart` (ids from FONTS below)
    fontPart: 'writing',
    defaultFont: 'comic',
    presets: [
      { name: 'Classique', font: 'comic',   colors: { body: 'black', writing: 'grey',  pinsLeft: 'black', pinsRight: 'red' } },
      { name: 'Court',     font: 'sport',   colors: { body: 'green', writing: 'white', pinsLeft: 'white', pinsRight: 'yellow' } },
      { name: 'Océan',     font: 'round',   colors: { body: 'sky',   writing: 'navy',  pinsLeft: 'navy',  pinsRight: 'red' } },
      { name: 'Soleil',    font: 'marker',  colors: { body: 'yellow',writing: 'black', pinsLeft: 'black', pinsRight: 'red' } },
      { name: 'Lavande',   font: 'round',   colors: { body: 'lavender', writing: 'purple', pinsLeft: 'black', pinsRight: 'red' } },
      { name: 'Neige',     font: 'digital', colors: { body: 'white', writing: 'black', pinsLeft: 'grey',  pinsRight: 'orange' } },
    ],
  },
];

export const SHIPPING = {
  freeGovernorates: ['Tunis', 'Ariana', 'Ben Arous', 'La Manouba'],
};

export const GOVERNORATES = [
  'Tunis', 'Ariana', 'Ben Arous', 'La Manouba', 'Nabeul', 'Zaghouan', 'Bizerte', 'Béja', 'Jendouba',
  'Le Kef', 'Siliana', 'Sousse', 'Monastir', 'Mahdia', 'Sfax', 'Kairouan', 'Kasserine', 'Sidi Bouzid',
  'Gabès', 'Médenine', 'Tataouine', 'Gafsa', 'Tozeur', 'Kébili',
];

export const ORDER_STATUSES = [
  { id: 'new',        label: 'Nouvelle' },
  { id: 'confirmed',  label: 'Confirmée' },
  { id: 'production', label: 'En production' },
  { id: 'shipped',    label: 'Expédiée' },
  { id: 'delivered',  label: 'Livrée' },
  { id: 'cancelled',  label: 'Annulée' },
];

export const getProduct = (id) => PRODUCTS.find((p) => p.id === id);
export const getColor = (id) => COLORS.find((c) => c.id === id);
export const getFont = (id) => FONTS.find((f) => f.id === id);
