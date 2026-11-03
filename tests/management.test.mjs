import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore, shopDay } from '../server/store.mjs';
import { createBackend } from '../server/http.mjs';
import { laptopBrandOptions } from '../lib/brands.ts';
import { searchProducts } from '../lib/storefront.ts';
const identity = (key) => ({
  subject: key,
  name: key,
  email: key + '@example.test',
});
function ownerFor(store) {
  const code = store.createOwnerSetup();
  return store.googleUser(identity('owner'), {
    audience: 'owner',
    ownerSetupHash: store.validateOwnerSetup(code),
  });
}

test('account suspension revokes every session, blocks Google and preserves orders; restore keeps the same customer', (t) => {
  const s = createStore(':memory:');
  t.after(() => s.close());
  const owner = ownerFor(s),
    customer = s.googleUser(identity('alice'));
  const a = s.newSession(customer.id, 'google'),
    b = s.newSession(customer.id, 'google');
  const pay = s.savePaymentMethod(null, {
    label: 'Test wallet',
    kind: 'wallet',
    bankName: '',
    accountName: 'Test shop',
    accountNumber: '123456789',
    instructions: '',
    qrImage: '',
    active: true,
  });
  const order = s.placeOrder(
    customer,
    {
      items: [{ id: 1, quantity: 1, price: 1500000 }],
      expectedTotal: 1500000,
      delivery: {
        name: 'Alice Customer',
        phone: '09797097778',
        address: 'Test Street, Yangon',
        note: '',
      },
      paymentMethodId: pay.id,
    },
    'account-order-key',
  );
  const before = s.customerAccounts(owner).accounts[0];
  assert.equal(before.orderCount, 1);
  assert.equal(before.googleLinked, true);
  assert.ok(before.createdAt);
  assert.ok(before.lastLoginAt);
  assert.throws(
    () =>
      s.setCustomerStatus(customer, customer.id, {
        status: 'suspended',
        version: 1,
      }),
    (e) => e.status === 403,
  );
  assert.throws(
    () =>
      s.setCustomerStatus(owner, owner.id, { status: 'suspended', version: 1 }),
    (e) => e.status === 403,
  );
  assert.throws(
    () =>
      s.setCustomerStatus(owner, customer.id, { status: 'owner', version: 1 }),
    (e) => e.status === 400,
  );
  s.setCustomerStatus(owner, customer.id, {
    status: 'suspended',
    version: before.version,
  });
  assert.equal(s.session(a.token), null);
  assert.equal(s.session(b.token), null);
  assert.throws(
    () => s.googleUser(identity('alice')),
    (e) => e.status === 403 && /suspended/.test(e.message),
  );
  assert.throws(
    () => s.newSession(customer.id, 'google'),
    (e) => e.status === 403,
  );
  assert.throws(
    () =>
      s.setCustomerStatus(owner, customer.id, {
        status: 'active',
        version: before.version,
      }),
    (e) => e.status === 409,
  );
  assert.equal(s.orders(owner, customer.id)[0].id, order.id);
  const suspended = s.customerAccounts(owner, { status: 'suspended' })
    .accounts[0];
  s.setCustomerStatus(owner, customer.id, {
    status: 'active',
    version: suspended.version,
  });
  assert.equal(s.googleUser(identity('alice')).id, customer.id);
  assert.ok(s.session(s.newSession(customer.id, 'google').token));
  assert.equal(s.orders(customer)[0].id, order.id);
  assert.equal(s.isCurrentOwner(owner.id), true);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 2);
});

test('customer directory filters literal search, paginates and exposes no authentication secrets', (t) => {
  const s = createStore(':memory:');
  t.after(() => s.close());
  const owner = ownerFor(s);
  for (let i = 0; i < 27; i++)
    s.createUser({
      name: 'Customer ' + i,
      email: `person${i}@example.test`,
      password: 'test-password-only-123',
    });
  const first = s.customerAccounts(owner);
  assert.equal(first.counts.total, 27);
  assert.equal(first.accounts.length, 25);
  assert.equal(first.pages, 2);
  assert.equal(s.customerAccounts(owner, { page: 2 }).accounts.length, 2);
  assert.equal(s.customerAccounts(owner, { search: 'person26' }).total, 1);
  assert.equal(s.customerAccounts(owner, { search: '%' }).total, 0);
  assert.equal(s.customerAccounts(owner, { search: 'CUSTOMER' }).total, 27);
  assert.throws(
    () => s.customerAccounts(owner, { page: NaN }),
    (e) => e.status === 400,
  );
  assert.throws(
    () => s.customerAccounts(owner, { status: 'owner' }),
    (e) => e.status === 400,
  );
  for (const row of first.accounts) {
    assert.equal(row.googleLinked, false);
    assert.equal('password_hash' in row, false);
    assert.equal('subject' in row, false);
  }
});

test('existing user records migrate without fabricated dates or resetting owner/product data', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-management-old-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'shop.sqlite');
  const old = new DatabaseSync(filename);
  old.exec(
    'CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,password_hash TEXT NOT NULL)',
  );
  old
    .prepare('INSERT INTO users VALUES(?,?,?,?,?)')
    .run(
      'old-account',
      'old@example.test',
      'Existing Customer',
      'customer',
      'test-placeholder',
    );
  old.close();
  const s = createStore(filename);
  const owner = ownerFor(s);
  const row = s.customerAccounts(owner).accounts[0];
  assert.equal(row.id, 'old-account');
  assert.equal(row.status, 'active');
  assert.equal(row.createdAt, null);
  assert.equal(row.lastLoginAt, null);
  const product = s.catalog()[0];
  s.close();
  const reloaded = createStore(filename);
  assert.equal(reloaded.isCurrentOwner(owner.id), true);
  assert.deepEqual(reloaded.catalog()[0], product);
  reloaded.close();
});

test('visitor counts deduplicate browsers and retries, fill missing days and roll over at Myanmar midnight', (t) => {
  const s = createStore(':memory:');
  t.after(() => s.close());
  const owner = ownerFor(s);
  const token = randomBytes(32).toString('hex');
  const other = randomBytes(32).toString('hex');
  s.db
    .prepare('UPDATE shop_metrics_settings SET started_day=? WHERE id=1')
    .run('2026-10-10');
  const before = Date.parse('2026-10-09T17:29:59Z'),
    after = Date.parse('2026-10-09T17:30:01Z');
  assert.equal(shopDay(before), '2026-10-09');
  assert.equal(shopDay(after), '2026-10-10');
  const view = randomUUID();
  s.recordShopVisit(token, view, before);
  s.recordShopVisit(token, view, before);
  s.recordShopVisit(other, view, before);
  s.recordShopVisit(token, randomUUID(), before);
  s.recordShopVisit(other, randomUUID(), before);
  s.recordShopVisit(token, randomUUID(), after);
  const report = s.shopAnalytics(owner, 3, after);
  assert.deepEqual(
    report.daily.map(({ day, visitors, pageViews }) => ({
      day,
      visitors,
      pageViews,
    })),
    [
      { day: '2026-10-08', visitors: 0, pageViews: 0 },
      { day: '2026-10-09', visitors: 2, pageViews: 3 },
      { day: '2026-10-10', visitors: 1, pageViews: 1 },
    ],
  );
  assert.equal(report.timezone, 'Asia/Yangon');
  assert.equal(report.daily[0].tracked, false);
  assert.equal(report.daily[2].tracked, true);
  assert.equal(report.trackedDays, 2);
  assert.equal(report.totals.visitorDays, 3);
  assert.equal(report.totals.pageViews, 4);
  assert.throws(
    () => s.shopAnalytics(owner, 91),
    (e) => e.status === 400,
  );
  assert.throws(
    () => s.shopAnalytics(s.googleUser(identity('guest')), 7),
    (e) => e.status === 403,
  );
  assert.throws(
    () => s.recordShopVisit(token, 'invalid'),
    (e) => e.status === 400,
  );
  const stored = s.db.prepare('SELECT * FROM shop_visit_seen').all();
  assert.ok(
    stored.every(
      (row) => row.visitor_hash !== token && row.visitor_hash !== other,
    ),
  );
  s.recordShopVisit(token, randomUUID(), after + 3 * 86400_000);
  assert.ok(
    s.db
      .prepare('SELECT * FROM shop_visit_seen')
      .all()
      .every((row) => row.day > '2026-10-10'),
  );
  assert.equal(
    s.shopAnalytics(owner, 7, after + 3 * 86400_000).totals.pageViews,
    5,
  );
});

test('visitor signatures survive restarts and cookie tampering fails validation', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-visitor-restart-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'shop.sqlite');
  const token = randomBytes(32).toString('hex');
  const s = createStore(filename);
  const owner = ownerFor(s);
  const signature = s.visitorSignature(token);
  s.recordShopVisit(token, randomUUID());
  s.close();
  const again = createStore(filename);
  assert.equal(again.visitorSignature(token), signature);
  assert.notEqual(again.visitorSignature(token.slice(0, -1) + 'z'), signature);
  again.recordShopVisit(token, randomUUID());
  const today = again.shopAnalytics(owner).todayCounts;
  assert.equal(today.visitors, 1);
  assert.equal(today.pageViews, 2);
  again.close();
});

test('brand options include only shop-managed or actual product names; brand filtering ignores case', () => {
  assert.deepEqual(laptopBrandOptions(), []);
  const options = laptopBrandOptions(
    [{ brand: 'Asus' }, { brand: 'ASUS' }, { brand: 'My Laptop Brand' }],
    ['ASUS', 'Owner Brand'],
  );
  assert.equal(options.filter((x) => x.toLowerCase() === 'asus').length, 1);
  assert.ok(options.includes('My Laptop Brand'));
  assert.ok(options.includes('Owner Brand'));
  assert.equal(options.includes('Toshiba'), false);
  assert.equal(options.includes('Framework'), false);
  const p = {
    id: 1,
    name: 'Asus Laptop',
    subtitle: 'test',
    price: 1,
    stock: 1,
    collection: 'brand-new',
    brand: 'Asus',
    category: 'Laptop',
    condition: 'New',
    specs: [],
    image: '/products/laptop-1.jpg',
  };
  assert.equal(
    searchProducts([p], '', 'All laptops', 'featured', 'brand-new', 'ASUS')
      .length,
    1,
  );
  assert.equal(
    searchProducts([p], '', 'All laptops', 'featured', 'good-second', 'ASUS')
      .length,
    0,
  );
});

test('account and analytics APIs enforce owner, origin and CSRF; visit endpoint counts guests but excludes owner, bots and DNT', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-management-api-'));
  const publicDir = path.join(dir, 'public');
  fs.mkdirSync(publicDir);
  const app = createBackend({
    databasePath: path.join(dir, 'shop.sqlite'),
    staticDirectory: publicDir,
    uploadDirectory: path.join(dir, 'uploads'),
    allowedOrigins: ['https://shop.test'],
    google: {
      clientId: 'mock.apps.googleusercontent.com',
      clientSecret: 'mock-test',
      redirectUri: 'https://shop.test/api/auth/google/callback',
    },
    secureCookies: true,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    app.server.closeAllConnections();
    await new Promise((resolve) => app.server.close(resolve));
    app.store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const owner = ownerFor(app.store),
    customer = app.store.googleUser(identity('customer'));
  const ownerSession = app.store.newSession(owner.id, 'google'),
    customerSession = app.store.newSession(customer.id, 'google');
  const cookie = 'spl_session=' + ownerSession.token;
  const customerCookie = 'spl_session=' + customerSession.token;
  async function request(route, method = 'GET', body, headers = {}) {
    const res = await fetch(base + route, {
      method,
      headers: {
        ...(method !== 'GET'
          ? { Origin: 'https://shop.test', 'Content-Type': 'application/json' }
          : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json(), headers: res.headers };
  }
  for (const route of [
    '/api/owner/brands',
    '/api/owner/accounts',
    '/api/owner/analytics',
    '/api/owner/orders?customerId=' + customer.id,
  ]) {
    assert.equal((await request(route)).status, 401);
    assert.equal(
      (await request(route, 'GET', undefined, { Cookie: customerCookie }))
        .status,
      403,
    );
    assert.equal(
      (await request(route, 'GET', undefined, { Cookie: cookie })).status,
      200,
    );
  }
  assert.equal(
    (
      await request('/api/owner/analytics?days=500', 'GET', undefined, {
        Cookie: cookie,
      })
    ).status,
    400,
  );
  const brandRoute = '/api/owner/brands';
  for (const method of ['POST', 'DELETE']) {
    const body = { name: 'Owner Choice' };
    assert.equal((await request(brandRoute, method, body)).status, 401);
    assert.equal(
      (
        await request(brandRoute, method, body, {
          Cookie: customerCookie,
          'X-CSRF-Token': customerSession.csrf,
        })
      ).status,
      403,
    );
    assert.equal(
      (await request(brandRoute, method, body, { Cookie: cookie })).status,
      403,
    );
    assert.equal(
      (
        await request(brandRoute, method, body, {
          Cookie: cookie,
          'X-CSRF-Token': ownerSession.csrf,
          Origin: 'https://evil.test',
        })
      ).status,
      403,
    );
  }
  const brandHeaders = { Cookie: cookie, 'X-CSRF-Token': ownerSession.csrf };
  assert.equal(
    (await request(brandRoute, 'POST', { name: 'Owner Choice' }, brandHeaders))
      .status,
    200,
  );
  assert.ok(
    (await request('/api/catalog')).body.brands.includes('Owner Choice'),
  );
  assert.equal(
    (
      await request(
        brandRoute,
        'DELETE',
        { name: 'Owner Choice' },
        brandHeaders,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request('/api/catalog')).body.brands.includes('Owner Choice'),
    false,
  );
  const accountRoute = '/api/owner/accounts/' + customer.id,
    change = { status: 'suspended', version: 1 };
  assert.equal(
    (await request(accountRoute, 'PUT', change, { Cookie: cookie })).status,
    403,
  );
  assert.equal(
    (
      await request(accountRoute, 'PUT', change, {
        Cookie: cookie,
        'X-CSRF-Token': ownerSession.csrf,
        Origin: 'https://evil.test',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(accountRoute, 'PUT', change, {
        Cookie: cookie,
        'X-CSRF-Token': ownerSession.csrf,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request('/api/orders', 'GET', undefined, { Cookie: customerCookie }))
      .status,
    401,
  );
  assert.equal(
    (
      await request(
        accountRoute,
        'PUT',
        { status: 'active', version: 2 },
        { Cookie: cookie, 'X-CSRF-Token': ownerSession.csrf },
      )
    ).status,
    200,
  );
  const another = app.store.googleUser(identity('another'));
  const pay = app.store.savePaymentMethod(null, {
    label: 'Test wallet',
    kind: 'wallet',
    bankName: '',
    accountName: 'Test shop',
    accountNumber: '123456789',
    instructions: '',
    qrImage: '',
    active: true,
  });
  const orderBody = {
    items: [{ id: 1, quantity: 1, price: 1500000 }],
    expectedTotal: 1500000,
    delivery: {
      name: 'Test Customer',
      phone: '09797097778',
      address: 'Test Street, Yangon',
      note: '',
    },
    paymentMethodId: pay.id,
  };
  const one = app.store.placeOrder(customer, orderBody, 'customer-order-key');
  app.store.placeOrder(another, orderBody, 'another-order-key');
  const filtered = await request(
    '/api/owner/orders?customerId=' + customer.id,
    'GET',
    undefined,
    { Cookie: cookie },
  );
  assert.equal(filtered.body.orders.length, 1);
  assert.equal(filtered.body.orders[0].id, one.id);
  assert.equal(
    (
      await request('/api/owner/orders?customerId=unknown', 'GET', undefined, {
        Cookie: cookie,
      })
    ).status,
    404,
  );
  const visit = { viewId: randomUUID() };
  const first = await request('/api/shop-visit', 'POST', visit, {
    'User-Agent': 'Customer Browser',
  });
  assert.equal(first.status, 200);
  const visitCookie = first.headers.get('set-cookie');
  assert.match(visitCookie, /HttpOnly/);
  assert.match(visitCookie, /Secure/);
  assert.match(visitCookie, /SameSite=Lax/);
  const saved = visitCookie.split(';')[0];
  assert.equal(
    (await request('/api/shop-visit', 'POST', visit, { Cookie: saved })).status,
    200,
  );
  await request(
    '/api/shop-visit',
    'POST',
    { viewId: randomUUID() },
    { Cookie: saved },
  );
  for (const extra of [
    { Cookie: cookie },
    { 'User-Agent': 'Googlebot' },
    { DNT: '1' },
  ])
    await request('/api/shop-visit', 'POST', { viewId: randomUUID() }, extra);
  assert.equal(
    (
      await request(
        '/api/shop-visit',
        'POST',
        { viewId: randomUUID() },
        { Origin: 'https://evil.test' },
      )
    ).status,
    403,
  );
  const report = (
    await request('/api/owner/analytics?days=7', 'GET', undefined, {
      Cookie: cookie,
    })
  ).body;
  assert.equal(report.todayCounts.visitors, 1);
  assert.equal(report.todayCounts.pageViews, 2);
  const invalid = saved.replace(/.$/, 'z');
  const fresh = await request(
    '/api/shop-visit',
    'POST',
    { viewId: randomUUID() },
    { Cookie: invalid },
  );
  assert.ok(fresh.headers.get('set-cookie'));
  assert.equal(
    (await request('/api/shop-visit', 'POST', { viewId: 'bad' })).status,
    400,
  );
  assert.ok(
    (
      await request('/api/owner/accounts', 'GET', undefined, { Cookie: cookie })
    ).body.accounts.some((a) => a.email === customer.email),
  );
});

test('owner brands backfill real listings, deduplicate, persist and refuse removal while in use', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-brands-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'shop.sqlite');
  const store = createStore(file);
  const owner = ownerFor(store);
  const customer = store.googleUser(identity('brand-customer'));
  const original = store.catalog(true);
  assert.deepEqual(store.brands(), laptopBrandOptions(original));
  assert.equal(store.brands().includes('Framework'), false);
  assert.throws(
    () => store.addBrand(customer, { name: 'New Brand' }),
    (e) => e.status === 403,
  );
  for (const name of ['', ' '.repeat(5), 'A'.repeat(51), 'All brands'])
    assert.throws(
      () => store.addBrand(owner, { name }),
      (e) => e.status === 400,
    );
  assert.equal(
    store.addBrand(owner, { name: '  Owner Choice  ' }),
    'Owner Choice',
  );
  assert.equal(store.addBrand(owner, { name: 'owner choice' }), 'Owner Choice');
  assert.equal(
    store.brands().filter((b) => b.toLowerCase() === 'owner choice').length,
    1,
  );
  assert.equal(store.addBrand(owner, { name: 'Café' }), 'Café');
  assert.equal(store.addBrand(owner, { name: 'Cafe\u0301' }), 'Café');
  store.removeBrand(owner, { name: 'CAFÉ' });
  const product = store.saveProduct(null, {
    ...original[0],
    brand: 'OWNER CHOICE',
    name: 'Owner choice laptop',
  });
  assert.equal(product.brand, 'Owner Choice');
  assert.throws(
    () => store.removeBrand(owner, { name: 'owner choice' }),
    (e) => e.status === 409,
  );
  assert.throws(
    () => store.removeBrand(customer, { name: 'Owner Choice' }),
    (e) => e.status === 403,
  );
  assert.throws(
    () =>
      store.saveProduct(product.id, {
        ...product,
        version: 9999,
        brand: 'Failed Brand',
      }),
    (e) => e.status === 409,
  );
  assert.equal(store.brands().includes('Failed Brand'), false);
  const updated = store.saveProduct(product.id, {
    ...product,
    brand: 'Product Brand',
    active: false,
  });
  assert.equal(updated.version, product.version + 1);
  assert.ok(store.brands().includes('Product Brand'));
  assert.throws(
    () => store.removeBrand(owner, { name: 'Product Brand' }),
    (e) => e.status === 409,
  );
  store.removeBrand(owner, { name: 'owner choice' });
  assert.throws(
    () => store.removeBrand(owner, { name: 'owner choice' }),
    (e) => e.status === 404,
  );
  const expected = store.brands();
  store.close();
  const reopened = createStore(file);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.brands(), expected);
  assert.equal(
    reopened.catalog(true).find((p) => p.id === product.id).brand,
    'Product Brand',
  );
  assert.equal(
    reopened.catalog().some((p) => p.id === product.id),
    false,
  );
});
