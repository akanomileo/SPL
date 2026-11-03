import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createBackend } from '../server/http.mjs';
import { createStore } from '../server/store.mjs';

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-connected-'));
  const publicDir = path.join(dir, 'public');
  fs.mkdirSync(publicDir);
  fs.writeFileSync(path.join(publicDir, 'index.html'), 'SPL customer');
  fs.writeFileSync(path.join(publicDir, 'owner.html'), 'SPL owner');
  const filename = path.join(dir, 'shop.sqlite');
  const app = createBackend({
    databasePath: filename,
    staticDirectory: publicDir,
    uploadDirectory: path.join(dir, 'uploads'),
    allowedOrigins: ['https://spl.test'],
    secureCookies: true,
    google: {
      clientId: 'mock',
      clientSecret: 'mock',
      redirectUri: 'https://spl.test/api/auth/google/callback',
    },
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    app.server.closeAllConnections();
    await new Promise((resolve) => app.server.close(resolve));
    app.store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const password = randomBytes(16).toString('hex');
  const setupCode = app.store.createOwnerSetup();
  app.store.googleUser(
    { email: 'owner@spl.test', name: 'Shop owner', subject: 'owner-subject' },
    {
      audience: 'owner',
      ownerSetupHash: app.store.validateOwnerSetup(setupCode),
    },
  );
  async function request(route, method = 'GET', body, auth, extra = {}) {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(method === 'GET'
          ? {}
          : { Origin: 'https://spl.test', 'Content-Type': 'application/json' }),
        ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, data, headers: response.headers };
  }
  async function auth(email) {
    const user = app.store.googleUser({
      email,
      name: 'Test user',
      subject:
        email === 'owner@spl.test'
          ? 'owner-subject'
          : email.replace(/[^a-z0-9]/g, ''),
    });
    const login = app.store.newSession(user.id, 'google');
    return { user, csrf: login.csrf, cookie: 'spl_session=' + login.token };
  }
  const owner = await auth('owner@spl.test');
  const customer = await auth('a@spl.test');
  const other = await auth('b@spl.test');
  const paymentMethod = app.store.savePaymentMethod(null, {
    label: 'Test bank',
    kind: 'bank',
    bankName: 'Test Bank',
    accountName: 'Shop owner',
    accountNumber: '123456789',
    instructions: '',
    qrImage: '',
    active: true,
  });
  const order = (quantity = 1, price = 1500000) => ({
    items: [{ id: 1, quantity, price }],
    expectedTotal: quantity * price,
    delivery: {
      name: 'Test Customer',
      phone: '၀၉၇၉၇၀၉၇၇၇၈',
      address: 'Example Street, Yangon',
      note: 'Test note',
    },
    paymentMethodId: paymentMethod.id,
  });
  return {
    ...app,
    filename,
    dir,
    base,
    request,
    owner,
    customer,
    other,
    order,
    password,
  };
}

test('owner permissions, CSRF and origin checks are enforced on the server', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/owner/products')).status, 401);
  assert.equal(
    (await f.request('/api/owner/products', 'GET', undefined, f.customer))
      .status,
    403,
  );
  assert.equal(
    (await f.request('/api/owner/orders', 'GET', undefined, f.customer)).status,
    403,
  );
  assert.equal(
    (
      await f.request('/api/auth/register', 'POST', {
        name: 'Intruder',
        email: 'bad@spl.test',
        password: f.password,
        role: 'owner',
      })
    ).status,
    410,
  );
  const product = f.store.catalog(true)[0];
  assert.equal(
    (await f.request('/api/owner/products/1', 'PUT', product, f.customer))
      .status,
    403,
  );
  assert.equal(
    (
      await f.request('/api/owner/products/1', 'PUT', product, f.owner, {
        'X-CSRF-Token': 'bad',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/api/owner/products/1', 'PUT', product, f.owner, {
        Origin: 'https://evil.test',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/api/owner/products/1', 'PUT', product, f.owner, {
        'X-CSRF-Token': 'é'.repeat(64),
      })
    ).status,
    403,
  );
});

test('Google sessions are hashed, password endpoints are disabled, and logout invalidates access', async (t) => {
  const f = await fixture(t);
  for (const endpoint of [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/google/link',
  ])
    assert.equal(
      (
        await f.request(endpoint, 'POST', {
          email: 'a@spl.test',
          password: f.password,
        })
      ).status,
      410,
    );
  assert.equal((await f.request('/api/catalog')).status, 200);
  const tokens = f.store.db.prepare('SELECT token_hash FROM sessions').all();
  assert.ok(
    tokens.every((row) => row.token_hash !== f.customer.cookie.slice(12)),
  );
  assert.equal((await f.request('/api/orders')).status, 401);
  assert.equal((await f.request('/api/orders', 'POST', f.order())).status, 401);
  const legacy = f.store.newSession(f.customer.user.id, 'password');
  assert.equal(
    (
      await f.request('/api/orders', 'GET', undefined, {
        ...f.customer,
        cookie: 'spl_session=' + legacy.token,
      })
    ).status,
    401,
  );
  assert.equal(
    (await f.request('/api/auth/logout', 'POST', {}, f.customer)).status,
    200,
  );
  assert.equal(
    (await f.request('/api/orders', 'GET', undefined, f.customer)).status,
    401,
  );
});

test('orders reserve stock once, retry idempotently and isolate customers', async (t) => {
  const f = await fixture(t);
  const key = 'test-submission-123';
  const placed = await f.request(
    '/api/orders',
    'POST',
    f.order(2),
    f.customer,
    { 'Idempotency-Key': key },
  );
  assert.equal(placed.status, 201);
  assert.equal(placed.data.order.delivery.phone, '09797097778');
  assert.equal(f.store.catalog()[0].stock, 1);
  const retry = await f.request('/api/orders', 'POST', f.order(2), f.customer, {
    'Idempotency-Key': key,
  });
  assert.equal(retry.status, 201);
  assert.equal(retry.data.order.id, placed.data.order.id);
  assert.equal(f.store.catalog()[0].stock, 1);
  assert.equal(
    (
      await f.request('/api/orders', 'POST', f.order(1), f.customer, {
        'Idempotency-Key': key,
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.request('/api/orders', 'GET', undefined, f.other)).data.orders
      .length,
    0,
  );
  assert.equal(
    (await f.request('/api/orders', 'GET', undefined, f.customer)).data.orders
      .length,
    1,
  );
  assert.equal(
    (await f.request('/api/owner/orders', 'GET', undefined, f.owner)).data
      .orders.length,
    1,
  );
  assert.equal(
    (
      await f.request('/api/orders', 'POST', f.order(2), f.other, {
        'Idempotency-Key': 'another-submission',
      })
    ).status,
    409,
  );
  assert.equal(f.store.catalog()[0].stock, 1);
});

test('server validates prices and totals and rolls back unavailable multi-item orders', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.request('/api/orders', 'POST', f.order(1, 1), f.customer, {
        'Idempotency-Key': 'tampered-price',
      })
    ).status,
    409,
  );
  const wrong = f.order();
  wrong.expectedTotal = 1;
  assert.equal(
    (
      await f.request('/api/orders', 'POST', wrong, f.customer, {
        'Idempotency-Key': 'tampered-total',
      })
    ).status,
    409,
  );
  const multi = f.order();
  multi.items.push({ id: 3, quantity: 3, price: 2700000 });
  multi.expectedTotal += 8100000;
  assert.equal(
    (
      await f.request('/api/orders', 'POST', multi, f.customer, {
        'Idempotency-Key': 'multi-unavailable',
      })
    ).status,
    409,
  );
  assert.equal(f.store.catalog()[0].stock, 3);
  assert.equal(f.store.orders(f.customer.user).length, 0);
  const dup = f.order();
  dup.items.push(dup.items[0]);
  assert.equal(
    (
      await f.request('/api/orders', 'POST', dup, f.customer, {
        'Idempotency-Key': 'duplicate-item',
      })
    ).status,
    400,
  );
});

test('competing orders cannot oversell and cancellation restores inventory exactly once', async (t) => {
  const f = await fixture(t);
  const replies = await Promise.all([
    f.request('/api/orders', 'POST', f.order(2), f.customer, {
      'Idempotency-Key': 'race-customer-a',
    }),
    f.request('/api/orders', 'POST', f.order(2), f.other, {
      'Idempotency-Key': 'race-customer-b',
    }),
  ]);
  assert.deepEqual(replies.map((r) => r.status).sort(), [201, 409]);
  assert.equal(f.store.catalog()[0].stock, 1);
  const order = replies.find((r) => r.status === 201).data.order;
  assert.equal(
    (
      await f.request(
        `/api/owner/orders/${order.id}`,
        'PUT',
        { status: 'cancelled', version: order.version },
        f.customer,
      )
    ).status,
    403,
  );
  const cancelled = await f.request(
    `/api/owner/orders/${order.id}`,
    'PUT',
    { status: 'cancelled', version: order.version },
    f.owner,
  );
  assert.equal(cancelled.status, 200);
  assert.equal(f.store.catalog()[0].stock, 3);
  assert.equal(
    (
      await f.request(
        `/api/owner/orders/${order.id}`,
        'PUT',
        { status: 'cancelled', version: cancelled.data.order.version },
        f.owner,
      )
    ).status,
    400,
  );
  assert.equal(f.store.catalog()[0].stock, 3);
});

test('order transitions reject stale edits and customer status stays synchronized', async (t) => {
  const f = await fixture(t);
  const placed = await f.request('/api/orders', 'POST', f.order(), f.customer, {
    'Idempotency-Key': 'status-order',
  });
  let order = placed.data.order;
  assert.equal(
    (
      await f.request(
        `/api/owner/orders/${order.id}`,
        'PUT',
        { status: 'completed', version: 1 },
        f.owner,
      )
    ).status,
    400,
  );
  const receiptReply = await fetch(f.base + `/api/orders/${order.id}/receipt`, {
    method: 'POST',
    headers: {
      Origin: 'https://spl.test',
      Cookie: f.customer.cookie,
      'X-CSRF-Token': f.customer.csrf,
      'Content-Type': 'image/png',
    },
    body: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  assert.equal(receiptReply.status, 201);
  order = (await receiptReply.json()).order;
  const paymentReply = await f.request(
    `/api/owner/orders/${order.id}/payment`,
    'POST',
    { decision: 'confirmed', note: '', version: order.version },
    f.owner,
  );
  assert.equal(paymentReply.status, 200);
  order = paymentReply.data.order;
  for (const status of ['confirmed', 'ready', 'completed']) {
    const r = await f.request(
      `/api/owner/orders/${order.id}`,
      'PUT',
      { status, version: order.version },
      f.owner,
    );
    assert.equal(r.status, 200);
    order = r.data.order;
  }
  assert.equal(
    (
      await f.request(
        `/api/owner/orders/${order.id}`,
        'PUT',
        { status: 'cancelled', version: 1 },
        f.owner,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request(
        `/api/owner/orders/${order.id}`,
        'PUT',
        { status: 'cancelled', version: order.version },
        f.owner,
      )
    ).status,
    400,
  );
  const account = (await f.request('/api/orders', 'GET', undefined, f.customer))
    .data.orders[0];
  assert.equal(account.status, 'completed');
  assert.deepEqual(
    account.events.map((e) => e.status),
    ['pending', 'confirmed', 'ready', 'completed'],
  );
});

test('owner catalog updates publish, hidden products reject orders, and prices remain snapshotted', async (t) => {
  const f = await fixture(t);
  const original = f.store.catalog(true)[0];
  const placed = await f.request('/api/orders', 'POST', f.order(), f.customer, {
    'Idempotency-Key': 'before-price-change',
  });
  assert.equal(placed.status, 201);
  assert.equal(
    (
      await f.request(
        '/api/owner/products/1',
        'PUT',
        { ...original, price: 2000000, oldPrice: undefined },
        f.owner,
      )
    ).status,
    409,
  );
  const latest = f.store.catalog(true)[0];
  const updated = await f.request(
    '/api/owner/products/1',
    'PUT',
    { ...latest, price: 2000000, oldPrice: undefined },
    f.owner,
  );
  assert.equal(updated.status, 200);
  assert.equal(
    (await f.request('/api/catalog', 'GET', undefined, f.customer)).data
      .products[0].price,
    2000000,
  );
  assert.equal(
    (await f.request('/api/orders', 'GET', undefined, f.customer)).data
      .orders[0].items[0].price,
    1500000,
  );
  const hidden = await f.request(
    '/api/owner/products/1',
    'PUT',
    { ...updated.data.product, active: false },
    f.owner,
  );
  assert.equal(hidden.status, 200);
  assert.ok(
    !(
      await f.request('/api/catalog', 'GET', undefined, f.customer)
    ).data.products.some((p) => p.id === 1),
  );
  assert.equal(
    (
      await f.request('/api/orders', 'POST', f.order(1, 2000000), f.customer, {
        'Idempotency-Key': 'hidden-product-order',
      })
    ).status,
    409,
  );
  const newProduct = await f.request(
    '/api/owner/products',
    'POST',
    { ...original, id: undefined, active: true, stock: 5 },
    f.owner,
  );
  assert.equal(newProduct.status, 201);
  assert.equal(newProduct.data.product.id, 9);
  const invalid = await f.request(
    '/api/owner/products',
    'POST',
    { ...original, image: 'https://evil.test/image.svg' },
    f.owner,
  );
  assert.equal(invalid.status, 400);
});

test('data persists after database reopen and private files are never served', async (t) => {
  const f = await fixture(t);
  await f.request('/api/orders', 'POST', f.order(), f.customer, {
    'Idempotency-Key': 'persisted-order',
  });
  const second = createStore(f.filename);
  try {
    assert.equal(second.orders(f.customer.user).length, 1);
    assert.equal(second.catalog()[0].stock, 2);
  } finally {
    second.close();
  }
  for (const route of [
    '/shop.sqlite',
    '/server/store.mjs',
    '/uploads/../shop.sqlite',
  ])
    assert.equal((await fetch(f.base + route)).status, 404);
  assert.equal((await fetch(f.base + '/owner/')).status, 200);
  assert.equal((await fetch(f.base + '/owner')).status, 200);
  const image = await fetch(f.base + '/api/owner/images', {
    method: 'POST',
    headers: {
      Origin: 'https://spl.test',
      Cookie: f.owner.cookie,
      'X-CSRF-Token': f.owner.csrf,
      'Content-Type': 'image/svg+xml',
    },
    body: '<svg></svg>',
  });
  assert.equal(image.status, 400);
  const unauthed = await fetch(f.base + '/api/owner/images', {
    method: 'POST',
    headers: { Origin: 'https://spl.test' },
    body: 'x',
  });
  assert.equal(unauthed.status, 401);
});

test('owner saves an ordered photo gallery, changes its cover and removes photos without deleting shared files', async (t) => {
  const f = await fixture(t);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==',
    'base64',
  );
  const images = [];
  const upload = (account, csrf = account.csrf) =>
    fetch(f.base + '/api/owner/images', {
      method: 'POST',
      headers: {
        Origin: 'https://spl.test',
        'Content-Type': 'image/png',
        Cookie: account.cookie,
        'X-CSRF-Token': csrf,
      },
      body: png,
    });
  assert.equal((await upload(f.customer)).status, 403);
  assert.equal((await upload(f.owner, 'bad')).status, 403);
  for (let i = 0; i < 3; i++) {
    const response = await upload(f.owner);
    assert.equal(response.status, 201);
    images.push((await response.json()).image);
  }
  let product = { ...f.store.catalog(true)[0], images, image: images[0] };
  let response = await f.request(
    '/api/owner/products/1',
    'PUT',
    product,
    f.owner,
  );
  assert.equal(response.status, 200);
  product = response.data.product;
  assert.deepEqual(product.images, images);
  assert.equal(product.image, images[0]);
  const publicProduct = (await f.request('/api/catalog')).data.products[0];
  assert.deepEqual(publicProduct.images, images);
  for (const image of images)
    assert.equal((await fetch(f.base + image)).status, 200);
  response = await f.request(
    '/api/owner/products/1',
    'PUT',
    { ...product, images: [images[2], images[0]] },
    f.owner,
  );
  assert.equal(response.status, 200);
  product = response.data.product;
  assert.equal(product.image, images[2]);
  assert.deepEqual(product.images, [images[2], images[0]]);
  assert.equal((await fetch(f.base + images[1])).status, 200);
  assert.equal(
    (
      await f.request(
        '/api/owner/products/1',
        'PUT',
        { ...product, version: product.version - 1, images },
        f.owner,
      )
    ).status,
    409,
  );
  const reopened = createStore(f.filename);
  try {
    assert.deepEqual(reopened.catalog()[0].images, [images[2], images[0]]);
    assert.equal(reopened.catalog()[0].image, images[2]);
    assert.equal(reopened.catalog()[0].stock, 3);
    assert.ok(reopened.isCurrentOwner(f.owner.user.id));
  } finally {
    reopened.close();
  }
});

test('gallery validation rejects empty, oversized, duplicate, external and private paths without changing a listing', async (t) => {
  const f = await fixture(t);
  const product = f.store.catalog(true)[0];
  const route = '/api/owner/products/1';
  assert.deepEqual(product.images, [product.image]);
  assert.equal(
    (
      await f.request(
        route,
        'PUT',
        {
          ...product,
          images: ['/products/laptop-1.jpg', '/products/laptop-2.jpg'],
        },
        f.customer,
      )
    ).status,
    403,
  );
  for (const images of [
    [],
    'not-an-array',
    null,
    [null],
    Array.from({ length: 13 }, (_, i) => `/products/photo-${i}.jpg`),
    [product.image, product.image],
    ['https://example.com/laptop.jpg'],
    ['/api/orders/private/receipts/file'],
    ['/uploads/../private.jpg'],
    ['/uploads/example.svg'],
  ]) {
    const response = await f.request(
      route,
      'PUT',
      { ...product, images },
      f.owner,
    );
    assert.equal(response.status, 400, JSON.stringify(images));
    assert.equal(f.store.catalog()[0].version, product.version);
  }
  // A v3.5 product body with only the original image still saves as a one-photo gallery.
  const { images, ...legacy } = product;
  const result = await f.request(route, 'PUT', legacy, f.owner);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.product.images, [legacy.image]);
  const hidden = await f.request(
    route,
    'PUT',
    { ...result.data.product, active: false },
    f.owner,
  );
  assert.equal(hidden.status, 200);
  assert.equal(
    (await f.request('/api/catalog')).data.products.some((p) => p.id === 1),
    false,
  );
});
