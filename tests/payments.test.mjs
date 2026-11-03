import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createBackend } from '../server/http.mjs';
import { createStore } from '../server/store.mjs';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==',
  'base64',
);
const methodBody = (extra = {}) => ({
  label: 'AYA Bank',
  kind: 'bank',
  bankName: 'AYA Bank',
  accountName: 'SPL Shop',
  accountNumber: '0123456789',
  instructions: 'Include your order number.',
  qrImage: '',
  active: true,
  ...extra,
});
async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-payment-'));
  const staticDirectory = path.join(directory, 'public');
  const uploadDirectory = path.join(directory, 'uploads');
  fs.mkdirSync(staticDirectory);
  fs.writeFileSync(path.join(staticDirectory, 'index.html'), 'Shop');
  const app = createBackend({
    databasePath: path.join(directory, 'shop.sqlite'),
    staticDirectory,
    uploadDirectory,
    allowedOrigins: ['https://spl.test'],
    google: {
      clientId: 'mock',
      clientSecret: 'mock',
      redirectUri: 'https://spl.test/api/auth/google/callback',
    },
  });
  const setup = app.store.createOwnerSetup();
  const ownerUser = app.store.googleUser(
    { subject: 'owner', email: 'owner@gmail.com', name: 'Owner' },
    { audience: 'owner', ownerSetupHash: app.store.validateOwnerSetup(setup) },
  );
  const customerUser = app.store.googleUser({
    subject: 'customer',
    email: 'customer@gmail.com',
    name: 'Customer',
  });
  const otherUser = app.store.googleUser({
    subject: 'other',
    email: 'other@gmail.com',
    name: 'Other',
  });
  const auth = (user) => {
    const session = app.store.newSession(user.id, 'google');
    return {
      user,
      Cookie: `spl_session=${session.token}`,
      'X-CSRF-Token': session.csrf,
    };
  };
  const owner = auth(ownerUser),
    customer = auth(customerUser),
    other = auth(otherUser);
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => {
    app.server.closeAllConnections();
    await new Promise((resolve) => app.server.close(resolve));
    app.store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const request = async (route, verb = 'GET', body, account, headers = {}) => {
    const raw = Buffer.isBuffer(body);
    const response = await fetch(base + route, {
      method: verb,
      headers: {
        ...(verb === 'GET'
          ? {}
          : {
              Origin: 'https://spl.test',
              'Content-Type': raw ? 'image/png' : 'application/json',
            }),
        ...(account
          ? { Cookie: account.Cookie, 'X-CSRF-Token': account['X-CSRF-Token'] }
          : {}),
        ...headers,
      },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, data, headers: response.headers };
  };
  const createMethod = async (body = methodBody()) => {
    const response = await request(
      '/api/owner/payment-methods',
      'POST',
      body,
      owner,
    );
    assert.equal(response.status, 201);
    return response.data.paymentMethod;
  };
  const orderBody = (method) => ({
    items: [{ id: 1, quantity: 1, price: 1500000 }],
    expectedTotal: 1500000,
    delivery: {
      name: 'Customer Name',
      phone: '09797097778',
      address: 'Example street, Yangon',
      note: '',
    },
    paymentMethodId: method.id,
  });
  const place = async (method, key = 'payment-order-test') => {
    const response = await request(
      '/api/orders',
      'POST',
      orderBody(method),
      customer,
      { 'Idempotency-Key': key },
    );
    assert.equal(response.status, 201);
    return response.data.order;
  };
  const receipt = (order, account = customer, body = png, headers) =>
    request(`/api/orders/${order.id}/receipt`, 'POST', body, account, headers);
  const review = (order, decision, note = '', account = owner) =>
    request(
      `/api/owner/orders/${order.id}/payment`,
      'POST',
      { decision, note, version: order.version },
      account,
    );
  return {
    ...app,
    directory,
    staticDirectory,
    uploadDirectory,
    base,
    owner,
    customer,
    other,
    request,
    createMethod,
    orderBody,
    place,
    receipt,
    review,
  };
}

test('payment methods expose active entries publicly and enforce owner, CSRF and local QR validation', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(
    (await f.request('/api/payment-methods')).data.paymentMethods,
    [],
  );
  assert.equal((await f.request('/api/owner/payment-methods')).status, 401);
  assert.equal(
    (
      await f.request(
        '/api/owner/payment-methods',
        'GET',
        undefined,
        f.customer,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request(
        '/api/owner/payment-methods',
        'POST',
        methodBody(),
        f.customer,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request(
        '/api/owner/payment-methods',
        'POST',
        methodBody(),
        f.owner,
        { 'X-CSRF-Token': 'wrong' },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request(
        '/api/owner/payment-methods',
        'POST',
        methodBody(),
        f.owner,
        { Origin: 'https://evil.test' },
      )
    ).status,
    403,
  );
  for (const invalid of [
    { kind: 'cash' },
    { label: '' },
    { active: 'true' },
    { qrImage: 'https://external.test/qr.png' },
    { qrImage: '/api/orders/private/receipts/123' },
    { qrImage: '/uploads/00000000-0000-0000-0000-000000000000.png' },
    { accountNumber: '', accountName: '' },
  ])
    assert.equal(
      (
        await f.request(
          '/api/owner/payment-methods',
          'POST',
          methodBody(invalid),
          f.owner,
        )
      ).status,
      400,
    );
  const method = await f.createMethod();
  await f.createMethod(methodBody({ label: 'Hidden Bank', active: false }));
  assert.equal(
    (await f.request('/api/payment-methods')).data.paymentMethods.length,
    1,
  );
  assert.equal(
    (await f.request('/api/owner/payment-methods', 'GET', undefined, f.owner))
      .data.paymentMethods.length,
    2,
  );
  const updated = await f.request(
    `/api/owner/payment-methods/${method.id}`,
    'PATCH',
    { ...method, accountNumber: '999888777' },
    f.owner,
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.data.paymentMethod.version, 2);
  assert.equal(
    (
      await f.request(
        `/api/owner/payment-methods/${method.id}`,
        'PATCH',
        method,
        f.owner,
      )
    ).status,
    409,
  );
  const upload = await f.request('/api/owner/images', 'POST', png, f.owner);
  assert.equal(upload.status, 201);
  const wallet = await f.createMethod(
    methodBody({
      label: 'KPay QR',
      kind: 'wallet',
      bankName: '',
      accountName: '',
      accountNumber: '',
      qrImage: upload.data.image,
    }),
  );
  assert.equal(wallet.qrImage, upload.data.image);
  assert.equal((await fetch(f.base + wallet.qrImage)).status, 200);
});

test('orders require an active payment method and retain immutable details across owner edits and idempotent retries', async (t) => {
  const f = await fixture(t);
  const method = await f.createMethod();
  const legacyBody = {
    ...f.orderBody(method),
    paymentMethodId: undefined,
    payment: 'KPay',
  };
  assert.equal(
    (
      await f.request('/api/orders', 'POST', legacyBody, f.customer, {
        'Idempotency-Key': 'legacy-bypass',
      })
    ).status,
    400,
  );
  const order = await f.place(method, 'stable-method-order');
  assert.equal(order.paymentStatus, 'awaiting_receipt');
  assert.equal(order.receipt, null);
  assert.equal(order.paymentMethod.accountNumber, method.accountNumber);
  const changed = await f.request(
    `/api/owner/payment-methods/${method.id}`,
    'PATCH',
    {
      ...method,
      label: 'Changed Bank',
      accountNumber: '999888777',
      active: false,
    },
    f.owner,
  );
  assert.equal(changed.status, 200);
  const retry = await f.request(
    '/api/orders',
    'POST',
    f.orderBody(method),
    f.customer,
    { 'Idempotency-Key': 'stable-method-order' },
  );
  assert.equal(retry.status, 201);
  assert.equal(retry.data.order.id, order.id);
  assert.deepEqual(retry.data.order.paymentMethod, method);
  assert.equal(
    (
      await f.request('/api/orders', 'POST', f.orderBody(method), f.customer, {
        'Idempotency-Key': 'inactive-method-order',
      })
    ).status,
    409,
  );
  assert.equal(f.store.catalog()[0].stock, 2);
});

test('private receipts remain customer-scoped and uploads never imply confirmed payment', async (t) => {
  const f = await fixture(t);
  const order = await f.place(await f.createMethod());
  assert.equal((await f.receipt(order, f.other)).status, 404);
  assert.equal((await f.receipt(order, f.owner)).status, 403);
  assert.equal(
    (await f.receipt(order, undefined, png, { 'X-CSRF-Token': 'bad' })).status,
    403,
  );
  for (const invalid of [
    Buffer.from('<svg></svg>'),
    png.subarray(0, 24),
    Buffer.from(png).map((value, index) => (index === 45 ? value ^ 1 : value)),
  ])
    assert.equal((await f.receipt(order, f.customer, invalid)).status, 400);
  assert.equal(
    (await f.receipt(order, f.customer, Buffer.alloc(3 * 1024 * 1024 + 1)))
      .status,
    413,
  );
  const uploaded = await f.receipt(order);
  assert.equal(uploaded.status, 201);
  const pending = uploaded.data.order;
  assert.equal(pending.paymentStatus, 'pending_review');
  assert.equal(pending.status, 'pending');
  assert.equal(pending.paymentEvents[0].decision, 'pending_review');
  assert.equal(pending.paymentEvents[0].imageUrl, pending.receipt.imageUrl);
  assert.equal(
    (
      await f.request(
        `/api/owner/orders/${order.id}`,
        'PUT',
        { status: 'confirmed', version: pending.version },
        f.owner,
      )
    ).status,
    409,
  );
  assert.equal((await fetch(f.base + pending.receipt.imageUrl)).status, 401);
  assert.equal(
    (
      await fetch(f.base + pending.receipt.imageUrl, {
        headers: { Cookie: f.other.Cookie },
      })
    ).status,
    404,
  );
  for (const account of [f.customer, f.owner]) {
    const response = await fetch(f.base + pending.receipt.imageUrl, {
      headers: { Cookie: account.Cookie },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  }
  const filename = fs.readdirSync(path.join(f.directory, 'receipts'))[0];
  assert.equal((await fetch(f.base + '/uploads/' + filename)).status, 404);
  assert.equal((await fetch(f.base + '/receipts/' + filename)).status, 404);
  assert.equal((await f.receipt(pending)).status, 409);
  assert.equal(fs.readdirSync(path.join(f.directory, 'receipts')).length, 1);
});

test('receipt rejection, resubmission and concurrent owner review preserve an audit and enforce versions', async (t) => {
  const f = await fixture(t);
  const order = await f.place(await f.createMethod());
  assert.equal((await f.review(order, 'confirmed')).status, 409);
  let pending = (await f.receipt(order)).data.order;
  assert.equal(
    (await f.review(pending, 'confirmed', '', f.customer)).status,
    403,
  );
  assert.equal((await f.review(pending, 'needs_receipt', '')).status, 400);
  assert.equal(
    (await f.review({ ...pending, version: order.version }, 'confirmed'))
      .status,
    409,
  );
  const rejected = await f.review(
    pending,
    'needs_receipt',
    'Amount is not readable. Please upload a clearer receipt.',
  );
  assert.equal(rejected.status, 200);
  assert.equal(rejected.data.order.paymentStatus, 'needs_receipt');
  const oldReceipt = rejected.data.order.receipt;
  const competingUploads = await Promise.all([
    f.receipt(rejected.data.order),
    f.receipt(rejected.data.order),
  ]);
  assert.deepEqual(
    competingUploads.map((reply) => reply.status).sort(),
    [201, 409],
  );
  pending = competingUploads.find((reply) => reply.status === 201).data.order;
  assert.notEqual(pending.receipt.id, oldReceipt.id);
  assert.equal(pending.paymentReviewNote, '');
  assert.equal(fs.readdirSync(path.join(f.directory, 'receipts')).length, 2);
  assert.equal(
    (
      await fetch(f.base + oldReceipt.imageUrl, {
        headers: { Cookie: f.owner.Cookie },
      })
    ).status,
    200,
  );
  const reviews = await Promise.all([
    f.review(pending, 'confirmed', 'Transfer received.'),
    f.review(pending, 'needs_receipt', 'Please upload again.'),
  ]);
  assert.deepEqual(reviews.map((reply) => reply.status).sort(), [200, 409]);
  let final = reviews.find((reply) => reply.status === 200).data.order;
  if (final.paymentStatus === 'needs_receipt') {
    pending = (await f.receipt(final)).data.order;
    final = (await f.review(pending, 'confirmed')).data.order;
  }
  assert.equal(final.paymentStatus, 'confirmed');
  assert.equal((await f.receipt(final)).status, 409);
  const confirmed = await f.request(
    `/api/owner/orders/${final.id}`,
    'PUT',
    { status: 'confirmed', version: final.version },
    f.owner,
  );
  assert.equal(confirmed.status, 200);
  const audit = f.store.db
    .prepare(
      'SELECT actor_id,decision,note,receipt_id FROM payment_events WHERE order_id=? ORDER BY id',
    )
    .all(order.id);
  assert.equal(audit[0].actor_id, f.customer.user.id);
  assert.equal(audit[0].decision, 'pending_review');
  assert.equal(audit[1].actor_id, f.owner.user.id);
  assert.equal(audit[1].decision, 'needs_receipt');
  assert.ok(audit[1].note.includes('clearer receipt'));
  assert.equal(audit[1].receipt_id, oldReceipt.id);
  assert.equal(final.paymentEvents[1].imageUrl, oldReceipt.imageUrl);
  assert.ok(final.paymentEvents[1].note.includes('clearer receipt'));
  assert.equal(audit.at(-1).decision, 'confirmed');
});

test('cancelled orders reject receipt uploads without leaving orphan files', async (t) => {
  const f = await fixture(t);
  const order = await f.place(await f.createMethod());
  const cancel = await f.request(
    `/api/owner/orders/${order.id}`,
    'PUT',
    { status: 'cancelled', version: order.version },
    f.owner,
  );
  assert.equal(cancel.status, 200);
  assert.equal((await f.receipt(order)).status, 409);
  const receiptDirectory = path.join(f.directory, 'receipts');
  assert.equal(
    fs.existsSync(receiptDirectory)
      ? fs.readdirSync(receiptDirectory).length
      : 0,
    0,
  );
  assert.equal(
    f.store.db.prepare('SELECT COUNT(*) AS n FROM receipts').get().n,
    0,
  );
  assert.equal(f.store.catalog()[0].stock, 3);
});

test('legacy database migration preserves orders and the single Google owner without relabeling used products as new', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-migrate-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'shop.sqlite');
  const old = new DatabaseSync(filename);
  old.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,password_hash TEXT NOT NULL);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL,auth_provider TEXT NOT NULL DEFAULT 'google');
    CREATE TABLE products(id INTEGER PRIMARY KEY,details TEXT NOT NULL,price INTEGER NOT NULL,stock INTEGER NOT NULL,active INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE orders(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL,items TEXT NOT NULL,delivery TEXT NOT NULL,payment TEXT NOT NULL,total INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,UNIQUE(customer_id,idempotency_key));
    CREATE TABLE owner_setup(id INTEGER PRIMARY KEY,subject TEXT,setup_hash TEXT,expires_at INTEGER);
    CREATE TABLE google_identities(subject TEXT PRIMARY KEY,user_id TEXT UNIQUE NOT NULL);
    INSERT INTO users VALUES('owner','owner@gmail.com','Owner','owner','unused');
    INSERT INTO users VALUES('customer','customer@gmail.com','Customer','customer','unused');
    INSERT INTO owner_setup VALUES(1,'google-owner',NULL,NULL);
    INSERT INTO google_identities VALUES('google-owner','owner');`);
  old
    .prepare(
      'INSERT INTO products(id,details,price,stock,active) VALUES(?,?,?,?,1)',
    )
    .run(
      1,
      JSON.stringify({
        name: 'Lenovo ThinkPad',
        condition: 'Grade A',
        image: '/products/laptop-1.jpg',
        specs: ['8GB'],
      }),
      1500000,
      2,
    );
  old
    .prepare(
      'INSERT INTO orders(id,customer_id,items,delivery,payment,total,created_at,updated_at,idempotency_key,request_hash) VALUES(?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      'SPL-LEGACY',
      'customer',
      JSON.stringify([
        { id: 1, quantity: 1, price: 1500000, name: 'Lenovo ThinkPad' },
      ]),
      '{}',
      'KPay',
      1500000,
      '2026-10-01',
      '2026-10-01',
      'old-order',
      'old-hash',
    );
  old
    .prepare(
      'INSERT INTO products(id,details,price,stock,active) VALUES(?,?,?,?,1)',
    )
    .run(
      8,
      JSON.stringify({
        name: 'Surface Laptop Platinum',
        condition: 'Grade A',
        image: '/products/laptop-8.jpg',
        specs: ['8GB'],
      }),
      950000,
      1,
    );
  old.close();
  const store = createStore(filename);
  try {
    assert.ok(store.isCurrentOwner('owner'));
    assert.deepEqual(store.ownerInfo(), { configured: true, pending: false });
    const product = store.catalog()[0];
    assert.equal(product.collection, 'good-second');
    assert.equal(product.brand, 'Lenovo');
    assert.equal(product.stock, 2);
    const surface = store.catalog().find((item) => item.id === 8);
    assert.equal(surface.brand, 'Microsoft');
    assert.equal(surface.collection, 'good-second');
    assert.equal(surface.price, 950000);
    assert.equal(surface.stock, 1);
    const order = store.orders({ id: 'customer', role: 'customer' })[0];
    assert.equal(order.paymentStatus, 'not_required');
    assert.equal(order.paymentMethod, null);
    assert.equal(order.receipt, null);
    assert.equal(order.total, 1500000);
    assert.equal(
      store.changeStatus({ id: 'owner', role: 'owner' }, order.id, {
        status: 'confirmed',
        version: 1,
      }).status,
      'confirmed',
    );
  } finally {
    store.close();
  }
});

test('receipt directory guards reject public locations and public directory aliases', (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'spl-receipt-location-'),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const staticDirectory = path.join(directory, 'public');
  const receipts = path.join(directory, 'receipts');
  fs.mkdirSync(staticDirectory);
  fs.mkdirSync(receipts);
  const options = {
    databasePath: path.join(directory, 'shop.sqlite'),
    staticDirectory,
    uploadDirectory: path.join(directory, 'uploads'),
    allowedOrigins: [],
  };
  assert.throws(
    () =>
      createBackend({
        ...options,
        receiptDirectory: path.join(staticDirectory, 'receipts'),
      }),
    /outside public/,
  );
  const alias = path.join(directory, 'public-receipts-alias');
  fs.symlinkSync(
    receipts,
    alias,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  assert.throws(
    () =>
      createBackend({
        ...options,
        uploadDirectory: alias,
        receiptDirectory: receipts,
      }),
    /outside public/,
  );
});

test('split transfers stay in draft until submitted and the owner confirms the entire versioned set', async (t) => {
  const f = await fixture(t);
  let order = await f.place(await f.createMethod());
  const initial = order;
  const draft = async () =>
    f.request(`/api/orders/${order.id}/receipt-draft`, 'POST', png, f.customer);
  const send = (version = order.version) =>
    f.request(
      `/api/orders/${order.id}/receipts/submit`,
      'POST',
      { version },
      f.customer,
    );
  assert.equal((await send()).status, 400);
  for (let i = 0; i < 3; i++) {
    const result = await draft();
    assert.equal(result.status, 201);
    order = result.data.order;
    assert.equal(order.receipts.length, i + 1);
    assert.equal(order.paymentStatus, 'awaiting_receipt');
    assert.equal((await f.review(order, 'confirmed')).status, 409);
  }
  assert.equal((await send(initial.version)).status, 409);
  order = (await send()).data.order;
  assert.equal(order.paymentStatus, 'pending_review');
  assert.equal(order.paymentEvents.at(-1).receipts.length, 3);
  const reviewVersion = order;
  // Adding another photo pauses review until the customer submits again.
  order = (await draft()).data.order;
  assert.equal(order.receipts.length, 4);
  assert.equal((await f.review(reviewVersion, 'confirmed')).status, 409);
  assert.equal((await f.review(order, 'confirmed')).status, 409);
  order = (await send()).data.order;
  const accepted = await f.review(order, 'confirmed');
  assert.equal(accepted.status, 200);
  order = accepted.data.order;
  assert.equal(order.receipts.length, 4);
  assert.deepEqual(
    order.paymentEvents.at(-1).receipts.map((r) => r.id),
    order.receipts.map((r) => r.id),
  );
  assert.equal((await draft()).status, 409);
  assert.equal((await send()).status, 409);
  assert.equal(
    (
      await f.request(
        order.receipts[0].imageUrl,
        'DELETE',
        { version: order.version },
        f.customer,
      )
    ).status,
    409,
  );
  assert.equal(fs.readdirSync(path.join(f.directory, 'receipts')).length, 4);
});

test('receipt changes retain history, require owner/customer isolation and pause a submitted review', async (t) => {
  const f = await fixture(t);
  let order = await f.place(await f.createMethod());
  const draftPath = `/api/orders/${order.id}/receipt-draft`;
  const sendPath = `/api/orders/${order.id}/receipts/submit`;
  for (const [account, status] of [
    [undefined, 401],
    [f.other, 404],
    [f.owner, 403],
  ]) {
    assert.equal(
      (await f.request(draftPath, 'POST', png, account)).status,
      status,
    );
    assert.equal(
      (await f.request(sendPath, 'POST', { version: order.version }, account))
        .status,
      status,
    );
  }
  assert.equal(
    (
      await f.request(draftPath, 'POST', png, f.customer, {
        'X-CSRF-Token': 'bad',
      })
    ).status,
    403,
  );
  order = (await f.request(draftPath, 'POST', png, f.customer)).data.order;
  const first = order.receipts[0];
  // A later invalid upload does not discard the saved first photo or submit it.
  assert.equal(
    (await f.request(draftPath, 'POST', Buffer.from('broken'), f.customer))
      .status,
    400,
  );
  assert.equal(f.store.orders(f.customer.user)[0].receipts.length, 1);
  assert.equal(
    f.store.orders(f.customer.user)[0].paymentStatus,
    'awaiting_receipt',
  );
  order = (await f.request(draftPath, 'POST', png, f.customer)).data.order;
  order = (
    await f.request(sendPath, 'POST', { version: order.version }, f.customer)
  ).data.order;
  const submitted = order;
  order = (
    await f.review(
      order,
      'needs_receipt',
      'Receipt 1 is unclear; keep receipt 2 and replace only receipt 1.',
    )
  ).data.order;
  assert.equal(order.receipts.length, 2);
  for (const [account, status] of [
    [undefined, 401],
    [f.other, 404],
    [f.owner, 403],
  ])
    assert.equal(
      (
        await f.request(
          first.imageUrl,
          'DELETE',
          { version: order.version },
          account,
        )
      ).status,
      status,
    );
  assert.equal(
    (
      await f.request(
        first.imageUrl,
        'DELETE',
        { version: order.version },
        f.customer,
        { 'X-CSRF-Token': 'bad' },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request(
        first.imageUrl,
        'DELETE',
        { version: submitted.version },
        f.customer,
      )
    ).status,
    409,
  );
  order = (
    await f.request(
      first.imageUrl,
      'DELETE',
      { version: order.version },
      f.customer,
    )
  ).data.order;
  assert.equal(order.receipts.length, 1);
  assert.equal(order.paymentStatus, 'awaiting_receipt');
  assert.ok(order.paymentReviewNote.includes('unclear'));
  assert.equal(
    (
      await f.request(
        first.imageUrl,
        'DELETE',
        { version: order.version },
        f.customer,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(f.base + first.imageUrl, {
        headers: { Cookie: f.owner.Cookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(f.base + first.imageUrl, {
        headers: { Cookie: f.other.Cookie },
      })
    ).status,
    404,
  );
  order = (await f.request(draftPath, 'POST', png, f.customer)).data.order;
  order = (
    await f.request(sendPath, 'POST', { version: order.version }, f.customer)
  ).data.order;
  const stale = order;
  order = (
    await f.request(
      order.receipts[0].imageUrl,
      'DELETE',
      { version: order.version },
      f.customer,
    )
  ).data.order;
  assert.equal((await f.review(stale, 'confirmed')).status, 409);
  assert.equal((await f.review(order, 'confirmed')).status, 409);
  order = (
    await f.request(
      order.receipts[0].imageUrl,
      'DELETE',
      { version: order.version },
      f.customer,
    )
  ).data.order;
  assert.equal(order.receipts.length, 0);
  assert.equal(order.receipt, null);
  assert.equal(
    (await f.request(sendPath, 'POST', { version: order.version }, f.customer))
      .status,
    400,
  );
  const previousReview = order.paymentEvents.find(
    (e) => e.decision === 'needs_receipt',
  );
  assert.equal(previousReview.receipts.length, 2);
  assert.equal(previousReview.receipts[0].id, first.id);
});

test('multi-receipt limits and cancelled orders reject uploads without orphan files', async (t) => {
  const f = await fixture(t);
  let order = await f.place(await f.createMethod());
  const draftPath = `/api/orders/${order.id}/receipt-draft`;
  for (let i = 0; i < 20; i++) {
    const response = await f.request(draftPath, 'POST', png, f.customer);
    assert.equal(response.status, 201);
    order = response.data.order;
  }
  assert.equal(order.receipts.length, 20);
  assert.equal(
    (await f.request(draftPath, 'POST', png, f.customer)).status,
    409,
  );
  assert.equal(fs.readdirSync(path.join(f.directory, 'receipts')).length, 20);
  const removed = await f.request(
    order.receipts[0].imageUrl,
    'DELETE',
    { version: order.version },
    f.customer,
  );
  assert.equal(removed.status, 200);
  order = (await f.request(draftPath, 'POST', png, f.customer)).data.order;
  assert.equal(order.receipts.length, 20);
  const cancel = await f.request(
    `/api/owner/orders/${order.id}`,
    'PUT',
    { status: 'cancelled', version: order.version },
    f.owner,
  );
  assert.equal(cancel.status, 200);
  order = cancel.data.order;
  assert.equal(
    (await f.request(draftPath, 'POST', png, f.customer)).status,
    409,
  );
  assert.equal(
    (
      await f.request(
        `/api/orders/${order.id}/receipts/submit`,
        'POST',
        { version: order.version },
        f.customer,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request(
        order.receipts[0].imageUrl,
        'DELETE',
        { version: order.version },
        f.customer,
      )
    ).status,
    409,
  );
  assert.equal(fs.readdirSync(path.join(f.directory, 'receipts')).length, 21);
});

test('v3.4 receipt migration keeps only the current photo active and preserves historical review images', async (t) => {
  const f = await fixture(t);
  let order = await f.place(await f.createMethod());
  order = (await f.receipt(order)).data.order;
  const oldReceipt = order.receipt;
  order = (
    await f.review(order, 'needs_receipt', 'Please send a clearer receipt.')
  ).data.order;
  order = (await f.receipt(order)).data.order;
  const filename = path.join(f.directory, 'v34.sqlite');
  // Recreate the v3.4 schema from a real populated database.
  f.store.db.prepare('VACUUM INTO ?').run(filename);
  const old = new DatabaseSync(filename);
  old.exec(
    'ALTER TABLE receipts DROP COLUMN active; ALTER TABLE payment_events DROP COLUMN receipt_ids;',
  );
  old.close();
  let upgraded = createStore(filename);
  let current = upgraded.orders(f.customer.user)[0];
  assert.equal(current.paymentStatus, 'pending_review');
  assert.deepEqual(
    current.receipts.map((r) => r.id),
    [order.receipt.id],
  );
  assert.equal(current.paymentEvents[0].receipts[0].id, oldReceipt.id);
  assert.equal(
    upgraded.receiptFile(f.owner.user, current.id, oldReceipt.id).id,
    oldReceipt.id,
  );
  current = upgraded.removeReceipt(
    f.customer.user,
    current.id,
    current.receipt.id,
    { version: current.version },
  );
  assert.equal(current.receipts.length, 0);
  upgraded.close();
  upgraded = createStore(filename);
  try {
    assert.equal(upgraded.orders(f.customer.user)[0].receipts.length, 0);
    assert.ok(upgraded.isCurrentOwner(f.owner.user.id));
    assert.equal(upgraded.paymentMethods().length, 1);
  } finally {
    upgraded.close();
  }
});
