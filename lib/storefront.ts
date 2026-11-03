import type { Product, ProductCollection } from './catalog';

export type Cart = Record<number, number>;
export type Delivery = {
  name: string;
  phone: string;
  address: string;
  note: string;
};
export type DeliveryErrors = Partial<Record<keyof Delivery, string>>;
export type RequestItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
};
export type OrderRequest = {
  id: string;
  createdAt: string;
  items: RequestItem[];
  total: number;
};
export type SortOrder = 'featured' | 'price-asc' | 'price-desc';
export type CollectionFilter = ProductCollection | 'all';
export const collectionNames: Record<ProductCollection, string> = {
  'brand-new': 'Brand New',
  'good-second': 'Good Second',
};

export function brandsForCollection(
  catalog: Product[],
  collection: CollectionFilter,
) {
  return [
    ...new Set(
      catalog
        .filter(
          (product) =>
            collection === 'all' || product.collection === collection,
        )
        .map((product) => product.brand),
    ),
  ].sort((a, b) => a.localeCompare(b));
}
export const STORAGE_KEY = 'spl-storefront-v2';
export const shop = {
  name: 'SHWE PYAE SAN',
  phone: '09 797 097778',
  phoneHref: 'tel:+959797097778',
  city: 'Yangon, Myanmar',
};
export const money = (value: number) =>
  `${new Intl.NumberFormat('en-US').format(value)} Ks`;
export const asset = (path: string) =>
  `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/${path.replace(/^\//, '')}`;

export function searchProducts(
  catalog: Product[],
  query: string,
  category = 'All laptops',
  sort: SortOrder = 'featured',
  collection: CollectionFilter = 'all',
  brand = 'All brands',
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = catalog.filter((product) => {
    const searchable = [
      product.name,
      product.subtitle,
      product.category,
      product.brand,
      collectionNames[product.collection],
      product.condition,
      ...product.specs,
    ]
      .join(' ')
      .toLocaleLowerCase();
    return (
      (category === 'All laptops' || product.category === category) &&
      (collection === 'all' || product.collection === collection) &&
      (brand === 'All brands' ||
        product.brand.toLowerCase() === brand.toLowerCase()) &&
      terms.every((term) => searchable.includes(term))
    );
  });
  if (sort === 'price-asc') matches.sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') matches.sort((a, b) => b.price - a.price);
  return matches;
}

export function sanitizeCart(value: unknown, catalog: Product[]): Cart {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const cart: Cart = {};
  for (const product of catalog) {
    const quantity = (value as Record<number, unknown>)[product.id];
    if (
      typeof quantity === 'number' &&
      Number.isFinite(quantity) &&
      quantity >= 1 &&
      product.stock > 0
    )
      cart[product.id] = Math.min(Math.floor(quantity), product.stock);
  }
  return cart;
}

export function setQuantity(
  cart: Cart,
  product: Product,
  quantity: number,
): Cart {
  const next = { ...cart };
  const bounded = Number.isFinite(quantity)
    ? Math.max(0, Math.min(Math.floor(quantity), product.stock))
    : 0;
  if (bounded) next[product.id] = bounded;
  else delete next[product.id];
  return next;
}

export function normalizePhone(value: string): string {
  return value.replace(/[၀-၉]/g, (digit) =>
    String(digit.charCodeAt(0) - 0x1040),
  );
}

// These references identify local requests; they are not authentication tokens.
export function createRequestId(provider = globalThis.crypto): string {
  if (typeof provider?.randomUUID === 'function')
    return `SPL-${provider.randomUUID().toUpperCase()}`;
  if (typeof provider?.getRandomValues !== 'function')
    throw new Error('Secure random generation is unavailable.');
  const bytes = provider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `SPL-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toUpperCase();
}

export function validateDelivery(delivery: Delivery): DeliveryErrors {
  const errors: DeliveryErrors = {};
  if (delivery.name.trim().length < 2) errors.name = 'Enter your full name.';
  const phone = normalizePhone(delivery.phone).replace(/[\s()+-]/g, '');
  if (!/^\d{7,15}$/.test(phone))
    errors.phone = 'Enter a valid phone number (7–15 digits).';
  if (delivery.address.trim().length < 8)
    errors.address = 'Include your street, township and city.';
  return errors;
}

export function restoreState(
  raw: string | null,
  catalog: Product[],
): { cart: Cart; saved: number[]; requests: OrderRequest[] } {
  const empty = {
    cart: {} as Cart,
    saved: [] as number[],
    requests: [] as OrderRequest[],
  };
  if (!raw) return empty;
  try {
    const state = JSON.parse(raw);
    if (!state || typeof state !== 'object' || Array.isArray(state))
      return empty;
    const saved = Array.isArray(state.saved)
      ? [
          ...new Set<number>(
            state.saved.filter(
              (id: unknown): id is number =>
                typeof id === 'number' && catalog.some((p) => p.id === id),
            ),
          ),
        ]
      : [];
    const requests = Array.isArray(state.requests)
      ? state.requests
          .filter((r: OrderRequest) => {
            return (
              r &&
              typeof r.id === 'string' &&
              /^SPL-[A-Z0-9-]{8,50}$/.test(r.id) &&
              typeof r.createdAt === 'string' &&
              Number.isFinite(Date.parse(r.createdAt)) &&
              typeof r.total === 'number' &&
              Number.isFinite(r.total) &&
              r.total >= 0 &&
              Array.isArray(r.items) &&
              r.items.length > 0 &&
              r.items.length <= 30 &&
              r.items.every(
                (i) =>
                  i &&
                  Number.isInteger(i.id) &&
                  typeof i.name === 'string' &&
                  i.name.length < 200 &&
                  Number.isInteger(i.quantity) &&
                  i.quantity > 0 &&
                  i.quantity <= 100 &&
                  Number.isFinite(i.price) &&
                  i.price >= 0,
              ) &&
              r.total ===
                r.items.reduce((sum, i) => sum + i.price * i.quantity, 0)
            );
          })
          .slice(0, 20)
          .map((r: OrderRequest) => ({
            id: r.id,
            createdAt: r.createdAt,
            total: r.total,
            items: r.items.map((i) => ({
              id: i.id,
              name: i.name,
              price: i.price,
              quantity: i.quantity,
            })),
          }))
      : [];
    return { cart: sanitizeCart(state.cart, catalog), saved, requests };
  } catch {
    return empty;
  }
}

export function requestText(
  request: OrderRequest,
  delivery?: Delivery,
  payment = 'Discuss with the shop',
) {
  return [
    `${shop.name} — order request`,
    `Reference: ${request.id}`,
    `Prepared: ${new Date(request.createdAt).toLocaleString('en-GB')}`,
    '',
    ...request.items.map(
      (item) =>
        `${item.quantity} × ${item.name} — ${money(item.price * item.quantity)}`,
    ),
    '',
    `Items total: ${money(request.total)}`,
    'Delivery fee: to be confirmed by SPL',
    ...(delivery
      ? [
          '',
          `Name: ${delivery.name.trim()}`,
          `Phone: ${normalizePhone(delivery.phone).trim()}`,
          `Address: ${delivery.address.trim()}`,
          ...(delivery.note.trim() ? [`Note: ${delivery.note.trim()}`] : []),
          `Payment preference: ${payment}`,
        ]
      : []),
    '',
    'Please confirm availability, condition, final price, delivery and payment before accepting this request.',
    'This request was prepared on the customer’s device. No payment has been made.',
  ].join('\n');
}
