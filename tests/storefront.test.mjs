import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { products } from '../lib/catalog.ts';
import {
  searchProducts,
  brandsForCollection,
  sanitizeCart,
  setQuantity,
  validateDelivery,
  restoreState,
  requestText,
} from '../lib/storefront.ts';

test('search covers category and detailed specifications, normalizes whitespace and sorts a copy', () => {
  assert.equal(searchProducts(products, ' Business ').length, 2);
  assert.equal(searchProducts(products, '84%   battery')[0].id, 1);
  assert.equal(searchProducts(products, 'fingerprint')[0].id, 7);
  assert.equal(searchProducts(products, '', 'Workstation').length, 2);
  assert.equal(
    searchProducts(products, '', 'All laptops', 'price-asc')[0].id,
    7,
  );
  assert.equal(
    searchProducts(products, '', 'All laptops', 'price-desc')[0].id,
    3,
  );
  assert.equal(products[0].id, 1);
});

test('collections and brands filter independently of laptop type and search, with no invented new stock', () => {
  assert.equal(
    products.every((product) => product.collection === 'good-second'),
    true,
  );
  assert.deepEqual(brandsForCollection(products, 'good-second'), [
    'Dell',
    'HP',
    'Lenovo',
    'Microsoft',
  ]);
  assert.deepEqual(brandsForCollection(products, 'brand-new'), []);
  assert.equal(
    searchProducts(products, '', 'All laptops', 'featured', 'brand-new').length,
    0,
  );
  assert.deepEqual(
    searchProducts(
      products,
      '',
      'All laptops',
      'featured',
      'good-second',
      'HP',
    ).map((product) => product.id),
    [3, 6],
  );
  assert.deepEqual(
    searchProducts(
      products,
      '16GB',
      'Business',
      'featured',
      'good-second',
      'Lenovo',
    ).map((product) => product.id),
    [7],
  );
  assert.deepEqual(
    searchProducts(products, 'Microsoft').map((product) => product.id),
    [4, 8],
  );
  const newLaptop = {
    ...products[0],
    id: 99,
    collection: 'brand-new',
    brand: 'Example Brand',
  };
  const mixed = [...products, newLaptop];
  assert.deepEqual(brandsForCollection(mixed, 'brand-new'), ['Example Brand']);
  assert.deepEqual(
    searchProducts(
      mixed,
      '',
      'All laptops',
      'featured',
      'brand-new',
      'Example Brand',
    ).map((product) => product.id),
    [99],
  );
});

test('all quantity updates clamp to stock and remove zero quantities', () => {
  assert.deepEqual(setQuantity({}, products[0], 100), { 1: 3 });
  assert.deepEqual(setQuantity({ 1: 2 }, products[0], -1), {});
  assert.deepEqual(setQuantity({ 1: 2 }, products[0], NaN), {});
  assert.deepEqual(setQuantity({}, { ...products[0], stock: 0 }, 1), {});
  assert.deepEqual(
    sanitizeCart(
      { 1: 99, 2: '3', 3: -1, 4: Infinity, 5: 1.9, 999: 1 },
      products,
    ),
    { 1: 3, 5: 1 },
  );
});

test('delivery rejects missing details and malformed phones; accepts formatted international numbers', () => {
  assert.deepEqual(
    Object.keys(
      validateDelivery({ name: '', phone: '', address: '', note: '' }),
    ),
    ['name', 'phone', 'address'],
  );
  assert.ok(
    validateDelivery({
      name: 'Test Customer',
      phone: 'not a number',
      address: 'Test street, Yangon',
      note: '',
    }).phone,
  );
  assert.deepEqual(
    validateDelivery({
      name: 'Test Customer',
      phone: '+95 (9) 123-456-789',
      address: 'Test street, Yangon',
      note: '',
    }),
    {},
  );
});

test('saved data recovers from corrupted storage and removes unknown catalog ids', () => {
  const empty = { cart: {}, saved: [], requests: [] };
  assert.deepEqual(restoreState('{broken', products), empty);
  assert.deepEqual(restoreState('null', products), empty);
  assert.deepEqual(
    restoreState(
      JSON.stringify({
        cart: { 1: 90 },
        saved: [1, 1, 999, '2'],
        requests: [],
      }),
      products,
    ),
    { cart: { 1: 3 }, saved: [1], requests: [] },
  );
});

test('saved owner-added laptops restore from the live catalogue, including after an OAuth reload', () => {
  const ownerAdded = {
    ...products[0],
    id: 42,
    collection: 'brand-new',
    brand: 'Asus',
    stock: 2,
  };
  const liveCatalogue = [...products, ownerAdded];
  const persisted = JSON.stringify({
    cart: { 42: 1, 1: 2 },
    saved: [42, 7],
    requests: [],
  });
  const firstLoad = restoreState(persisted, liveCatalogue);
  assert.deepEqual(firstLoad.cart, { 1: 2, 42: 1 });
  assert.deepEqual(firstLoad.saved, [42, 7]);
  const oauthReturn = restoreState(JSON.stringify(firstLoad), liveCatalogue);
  assert.deepEqual(oauthReturn, firstLoad);
  assert.deepEqual(restoreState(persisted, products), {
    cart: { 1: 2 },
    saved: [7],
    requests: [],
  });
  const updatedStock = liveCatalogue.map((product) =>
    product.id === 42 ? { ...product, stock: 0 } : product,
  );
  assert.deepEqual(restoreState(persisted, updatedStock).cart, { 1: 2 });
});

test('request restore validates totals and retains no contact information', () => {
  const request = {
    id: 'SPL-TEST1234-ABCDEF12',
    createdAt: '2026-09-27T00:00:00Z',
    items: [{ id: 1, name: products[0].name, price: 1500000, quantity: 1 }],
    total: 1500000,
  };
  const restored = restoreState(
    JSON.stringify({
      requests: [
        {
          ...request,
          phone: 'private',
          address: 'private',
          delivery: { name: 'private' },
        },
      ],
    }),
    products,
  );
  assert.deepEqual(restored.requests, [request]);
  assert.equal(
    restoreState(
      JSON.stringify({ requests: [{ ...request, total: 1 }] }),
      products,
    ).requests.length,
    0,
  );
  const summary = requestText(request, {
    name: 'Test Customer',
    phone: '09123456789',
    address: 'Example Street, Yangon',
    note: 'Test only',
  });
  assert.match(summary, /1,500,000 Ks/);
  assert.match(summary, /No payment has been made/);
  assert.doesNotMatch(requestText(request), /Test Customer/);
});

test('Windows graceful-exit helper drains successful work and preserves failed exit codes', () => {
  const loader = new URL('../scripts/graceful-cli-exit.mjs', import.meta.url)
    .href;
  const ok = spawnSync(
    process.execPath,
    [
      '--import',
      loader,
      '-e',
      'setTimeout(() => console.log("drained"),20); process.exit(0);',
    ],
    { encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /drained/);
  const failed = spawnSync(
    process.execPath,
    ['--import', loader, '-e', 'process.exit(7);'],
    { encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(failed.status, 7);
});
