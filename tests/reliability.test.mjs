import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBackend } from '../server/http.mjs';
import { createStore } from '../server/store.mjs';
import { clientAddress, trustedProxyIPs } from '../server/client-address.mjs';
import {
  pendingCheckout,
  rememberCheckout,
  forgetCheckout,
} from '../lib/checkout-recovery.ts';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==',
  'base64',
);
async function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'spl-reliability-'));
  const staticDirectory = path.join(directory, 'public');
  fs.mkdirSync(staticDirectory);
  const app = createBackend({
    databasePath: path.join(directory, 'shop.sqlite'),
    staticDirectory,
    uploadDirectory: path.join(directory, 'uploads'),
    allowedOrigins: ['https://spl.test'],
    google: {
      clientId: 'mock',
      clientSecret: 'mock',
      redirectUri: 'https://spl.test/api/auth/google/callback',
    },
    ...options,
  });
  const setup = app.store.createOwnerSetup();
  const owner = app.store.googleUser(
    { subject: 'owner', email: 'owner@gmail.com', name: 'Owner' },
    { audience: 'owner', ownerSetupHash: app.store.validateOwnerSetup(setup) },
  );
  const customer = app.store.googleUser({
    subject: 'customer',
    email: 'customer@gmail.com',
    name: 'Customer',
  });
  const other = app.store.googleUser({
    subject: 'other',
    email: 'other@gmail.com',
    name: 'Other',
  });
  const sessions = new Map(
    [owner, customer, other].map((user) => [
      user.id,
      app.store.newSession(user.id, 'google'),
    ]),
  );
  const method = app.store.savePaymentMethod(null, {
    label: 'Test Bank',
    kind: 'bank',
    bankName: 'Test Bank',
    accountName: 'Test Shop',
    accountNumber: '123456',
    instructions: '',
    qrImage: '',
    active: true,
  });
  const product = app.store.catalog()[0];
  app.store.saveProduct(product.id, { ...product, stock: 1000 });
  const body = {
    items: [{ id: product.id, quantity: 1, price: product.price }],
    expectedTotal: product.price,
    delivery: {
      name: 'Customer',
      phone: '09123456789',
      address: 'Test address Yangon',
      note: '',
    },
    paymentMethodId: method.id,
  };
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (
    route,
    verb = 'GET',
    value,
    user = customer,
    extra = {},
  ) => {
    const session = user && sessions.get(user.id);
    const response = await fetch(base + route, {
      method: verb,
      redirect: 'manual',
      headers: {
        Origin: 'https://spl.test',
        'Content-Type': Buffer.isBuffer(value)
          ? 'image/png'
          : 'application/json',
        ...(session
          ? {
              Cookie: `spl_session=${session.token}`,
              'X-CSRF-Token': session.csrf,
            }
          : {}),
        ...extra,
      },
      body:
        value === undefined
          ? undefined
          : Buffer.isBuffer(value)
            ? value
            : JSON.stringify(value),
    });
    return {
      status: response.status,
      data: await response.json().catch(() => null),
    };
  };
  t.after(async () => {
    app.server.closeAllConnections();
    await new Promise((resolve) => app.server.close(resolve));
    app.store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return {
    ...app,
    directory,
    customer,
    other,
    owner,
    body,
    request,
    place: (key, user = customer) => app.store.placeOrder(user, body, key),
  };
}

test('new unpaid reservations expire once across restarts; historical orders keep no invented deadline', async (t) => {
  let time = Date.now();
  const options = { now: () => time, reservationMinutes: 15 };
  const f = await fixture(t, { storeOptions: options });
  const expired = f.place('expiry-order-one');
  const historical = f.place('historical-order');
  f.store.db
    .prepare('UPDATE orders SET reservation_expires_at=NULL WHERE id=?')
    .run(historical.id);
  assert.equal(f.store.catalog()[0].stock, 998);
  time += 16 * 60_000;
  assert.equal(f.store.expireReservations(), 1);
  assert.equal(f.store.expireReservations(), 0);
  assert.equal(f.store.catalog()[0].stock, 999);
  const recovered = f.store.resolveSubmission(
    f.customer,
    'expiry-order-one',
  ).order;
  assert.equal(recovered.id, expired.id);
  assert.equal(recovered.status, 'cancelled');
  assert.match(recovered.cancellationReason, /deadline/);
  const reopened = createStore(path.join(f.directory, 'shop.sqlite'), options);
  try {
    assert.equal(reopened.expireReservations(), 0);
    assert.equal(reopened.catalog()[0].stock, 999);
    assert.equal(
      reopened.orders(f.customer).find((o) => o.id === historical.id).status,
      'pending',
    );
  } finally {
    reopened.close();
  }
});

test('uploading a receipt prevents auto-expiry even after removal; expired orders reject late uploads', async (t) => {
  let time = Date.now();
  const f = await fixture(t, {
    storeOptions: { now: () => time, reservationMinutes: 15 },
  });
  const paid = f.place('receipt-pauses-expiry');
  const unpaid = f.place('no-receipt-expires');
  const upload = await f.request(
    `/api/orders/${paid.id}/receipt-draft`,
    'POST',
    png,
  );
  assert.equal(upload.status, 201);
  assert.equal(upload.data.order.reservationExpiresAt, null);
  const receipt = upload.data.order.receipts[0];
  assert.equal(
    (
      await f.request(receipt.imageUrl, 'DELETE', {
        version: upload.data.order.version,
      })
    ).status,
    200,
  );
  time += 16 * 60_000;
  assert.equal(f.store.expireReservations(), 1);
  assert.equal(
    f.store.orders(f.customer).find((o) => o.id === paid.id).status,
    'pending',
  );
  assert.equal(
    (await f.request(`/api/orders/${unpaid.id}/receipt-draft`, 'POST', png))
      .status,
    409,
  );
});

test('outstanding unpaid order cap preserves idempotent retries and another customer can still order', async (t) => {
  const f = await fixture(t);
  const first = f.place('unpaid-order-one');
  f.place('unpaid-order-two');
  f.place('unpaid-order-three');
  assert.throws(
    () => f.place('unpaid-order-four'),
    (e) => e.status === 409,
  );
  assert.equal(f.place('unpaid-order-one').id, first.id);
  assert.ok(f.place('another-customer-order', f.other).id);
  f.store.changeStatus(f.owner, first.id, {
    status: 'cancelled',
    version: first.version,
  });
  assert.ok(f.place('unpaid-order-four').id);
});

test('receipt removal cannot bypass lifetime file quotas and rejected uploads leave no files', async (t) => {
  const f = await fixture(t, { storeOptions: { maxReceiptFiles: 3 } });
  const order = f.place('receipt-file-quota');
  for (let i = 0; i < 3; i++) {
    const uploaded = await f.request(
      `/api/orders/${order.id}/receipt-draft`,
      'POST',
      png,
    );
    assert.equal(uploaded.status, 201);
    assert.equal(
      (
        await f.request(uploaded.data.order.receipts[0].imageUrl, 'DELETE', {
          version: uploaded.data.order.version,
        })
      ).status,
      200,
    );
  }
  assert.equal(
    (await f.request(`/api/orders/${order.id}/receipt-draft`, 'POST', png))
      .status,
    409,
  );
  assert.equal(fs.readdirSync(path.join(f.directory, 'receipts')).length, 3);
  const reopened = createStore(path.join(f.directory, 'shop.sqlite'), {
    maxReceiptFiles: 3,
  });
  try {
    assert.throws(
      () => reopened.receiptUploadAllowance(f.customer, order.id, png.length),
      (e) => e.status === 409,
    );
  } finally {
    reopened.close();
  }
});

test('receipt byte quotas cover the order, customer and shop, including historical photos', async (t) => {
  for (const quota of [
    'maxReceiptBytes',
    'maxCustomerReceiptBytes',
    'maxShopReceiptBytes',
  ]) {
    await t.test(quota, async (t) => {
      const f = await fixture(t, { storeOptions: { [quota]: png.length } });
      const order = f.place('receipt-byte-quota');
      assert.equal(
        (await f.request(`/api/orders/${order.id}/receipt-draft`, 'POST', png))
          .status,
        201,
      );
      const target =
        quota === 'maxCustomerReceiptBytes'
          ? f.place('second-byte-order')
          : quota === 'maxShopReceiptBytes'
            ? f.place('other-byte-order', f.other)
            : order;
      const actor = quota === 'maxShopReceiptBytes' ? f.other : f.customer;
      assert.equal(
        (
          await f.request(
            `/api/orders/${target.id}/receipt-draft`,
            'POST',
            png,
            actor,
          )
        ).status,
        409,
      );
      assert.equal(
        fs.readdirSync(path.join(f.directory, 'receipts')).length,
        1,
      );
    });
  }
});

test('receipt rate limit is customer-wide, survives removal, and resets after one hour', async (t) => {
  let time = Date.now();
  const f = await fixture(t, {
    storeOptions: { now: () => time, receiptUploadsPerHour: 1 },
  });
  const order = f.place('receipt-rate-limit');
  const uploaded = await f.request(
    `/api/orders/${order.id}/receipt-draft`,
    'POST',
    png,
  );
  assert.equal(uploaded.status, 201);
  assert.equal(
    (
      await f.request(uploaded.data.order.receipts[0].imageUrl, 'DELETE', {
        version: uploaded.data.order.version,
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.request(`/api/orders/${order.id}/receipt-draft`, 'POST', png))
      .status,
    429,
  );
  time += 3600_001;
  assert.equal(
    (await f.request(`/api/orders/${order.id}/receipt-draft`, 'POST', png))
      .status,
    201,
  );
});

test('trusted proxy resolution ignores spoofed prefixes, malformed headers and untrusted peers', () => {
  const req = (remoteAddress, header) => ({
    socket: { remoteAddress },
    headers: { 'x-forwarded-for': header },
  });
  assert.equal(
    clientAddress(req('192.0.2.1', '198.51.100.1'), ['127.0.0.1']),
    '192.0.2.1',
  );
  assert.equal(
    clientAddress(req('::ffff:127.0.0.1', 'spoofed,198.51.100.1'), [
      '127.0.0.1',
    ]),
    '127.0.0.1',
  );
  assert.equal(
    clientAddress(req('127.0.0.1', '203.0.113.9,198.51.100.1'), ['127.0.0.1']),
    '198.51.100.1',
  );
  assert.equal(
    clientAddress(req('127.0.0.1', '203.0.113.9,192.0.2.1'), [
      '127.0.0.1',
      '192.0.2.1',
    ]),
    '203.0.113.9',
  );
  assert.deepEqual(trustedProxyIPs('127.0.0.1, ::1'), ['127.0.0.1', '::1']);
  assert.throws(() => trustedProxyIPs('*'));
});

test('customers behind an explicitly trusted proxy have separate sign-in rate budgets', async (t) => {
  const f = await fixture(t, { trustedProxyIPs: ['127.0.0.1'] });
  for (let i = 0; i < 35; i++)
    assert.equal(
      (
        await f.request('/api/auth/google/start', 'GET', undefined, null, {
          'X-Forwarded-For': `192.0.2.${i + 1}`,
        })
      ).status,
      302,
    );
  for (let i = 0; i < 29; i++)
    assert.equal(
      (
        await f.request('/api/auth/google/start', 'GET', undefined, null, {
          'X-Forwarded-For': '192.0.2.1',
        })
      ).status,
      302,
    );
  assert.equal(
    (
      await f.request('/api/auth/google/start', 'GET', undefined, null, {
        'X-Forwarded-For': '192.0.2.1',
      })
    ).status,
    429,
  );
});

test('pagination and server filters reach orders older than 200 and keep customers isolated', async (t) => {
  const f = await fixture(t, { storeOptions: { maxUnpaidOrders: 1000 } });
  const oldest = f.place('oldest-order-key');
  f.store.db
    .prepare('UPDATE orders SET created_at=? WHERE id=?')
    .run('2020-01-01T00:00:00.000Z', oldest.id);
  for (let i = 0; i < 200; i++) f.place(`newer-order-${i}`);
  const other = f.place('other-private-order', f.other);
  const last = await f.request('/api/orders?page=9');
  assert.equal(last.status, 200);
  assert.equal(last.data.total, 201);
  assert.equal(last.data.orders.length, 1);
  assert.equal(last.data.orders[0].id, oldest.id);
  const ownerSearch = await f.request(
    `/api/owner/orders?search=${oldest.id}&status=pending`,
    'GET',
    undefined,
    f.owner,
  );
  assert.equal(ownerSearch.data.total, 1);
  assert.equal(ownerSearch.data.summary.total, 202);
  assert.equal(ownerSearch.data.summary.pending, 202);
  assert.equal(
    (await f.request(`/api/orders?search=${other.id}`)).data.total,
    0,
  );
  assert.equal((await f.request('/api/orders?page=0')).status, 400);
  assert.equal((await f.request('/api/orders?status=invalid')).status, 400);
  assert.equal((await f.request('/api/orders?pageSize=201')).status, 400);
});

test('checkout recovery returns an existing order or atomically blocks a delayed submission', async (t) => {
  const f = await fixture(t);
  const order = f.place('committed-lost-response');
  const recovered = await f.request('/api/orders/recover', 'POST', {
    key: 'committed-lost-response',
  });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.data.order.id, order.id);
  assert.equal(
    (
      await f.request(
        '/api/orders/recover',
        'POST',
        { key: 'committed-lost-response' },
        f.other,
      )
    ).data.order,
    null,
  );
  const closed = await f.request('/api/orders/recover', 'POST', {
    key: 'delayed-submit-key',
  });
  assert.equal(closed.data.order, null);
  const delayed = await f.request('/api/orders', 'POST', f.body, f.customer, {
    'Idempotency-Key': 'delayed-submit-key',
  });
  assert.equal(delayed.status, 409);
  assert.equal(f.store.catalog()[0].stock, 999);
  assert.ok(f.place('fresh-reviewed-attempt').id);
  const reopened = createStore(path.join(f.directory, 'shop.sqlite'));
  try {
    assert.throws(
      () => reopened.placeOrder(f.customer, f.body, 'delayed-submit-key'),
      (e) => e.status === 409,
    );
  } finally {
    reopened.close();
  }
  assert.equal(
    (
      await f.request(
        '/api/orders/recover',
        'POST',
        { key: 'any-recovery-key' },
        f.owner,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request(
        '/api/orders/recover',
        'POST',
        { key: 'any-recovery-key' },
        f.customer,
        { 'X-CSRF-Token': 'wrong' },
      )
    ).status,
    403,
  );
});

test('checkout recovery stores only a tab-scoped opaque key and separates customer identities', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const key = 'SPL-12345678-1234-1234-1234-123456789ABC';
  rememberCheckout(storage, 'customer-a', key);
  assert.equal(pendingCheckout(storage, 'customer-a'), key);
  assert.equal(pendingCheckout(storage, 'customer-b'), null);
  assert.deepEqual([...values.values()], [key]);
  forgetCheckout(storage, 'customer-a');
  assert.equal(pendingCheckout(storage, 'customer-a'), null);
});
