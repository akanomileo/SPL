import { DatabaseSync } from 'node:sqlite';
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
  createHmac,
} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { products as seedProducts } from '../lib/catalog.ts';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};
const text = (value, min, max, label) => {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.trim().length > max
  )
    fail(400, `${label} must be ${min}–${max} characters.`);
  return value.trim();
};
const integer = (value, min, max, label) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail(400, `${label} is invalid.`);
  return value;
};
export const statuses = [
  'pending',
  'confirmed',
  'ready',
  'completed',
  'cancelled',
];
export const nextStatuses = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
export const digest = (value) =>
  createHash('sha256').update(value).digest('hex');
export function validateEmail(value) {
  const email = text(value, 5, 254, 'Email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail(400, 'Enter a valid email address.');
  return email;
}
function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function passwordMatches(password, saved) {
  const [salt, hash] = saved.split(':');
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(hash, 'hex'),
  );
}
const userView = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});
const inferBrand = (name) => {
  if (/^Surface (?:Laptop|Pro|Book|Go)\b/i.test(name ?? '')) return 'Microsoft';
  for (const brand of [
    'Lenovo',
    'Dell',
    'HP',
    'Microsoft',
    'Apple',
    'ASUS',
    'Acer',
    'Samsung',
    'MSI',
    'Huawei',
  ])
    if (new RegExp(`^${brand}\\b`, 'i').test(name ?? '')) return brand;
  return 'Other';
};
const productView = (row) => {
  const details = JSON.parse(row.details);
  return {
    ...details,
    images: details.images?.length ? details.images : [details.image],
    id: row.id,
    stock: row.stock,
    price: row.price,
    active: Boolean(row.active),
    version: row.version,
  };
};
export function validateProduct(body) {
  const name = text(body.name, 3, 120, 'Product name');
  const subtitle = text(body.subtitle, 1, 180, 'Subtitle');
  const category = text(body.category, 2, 40, 'Category');
  if (!['brand-new', 'good-second'].includes(body.collection))
    fail(400, 'Choose Brand New or Good Second.');
  const brand = text(body.brand, 1, 50, 'Brand');
  const condition = text(body.condition, 2, 100, 'Condition');
  const price = integer(body.price, 1, 1_000_000_000_000, 'Price');
  const stock = integer(body.stock, 0, 1_000_000, 'Stock');
  const photos = body.images === undefined ? [body.image] : body.images;
  if (!Array.isArray(photos) || photos.length < 1 || photos.length > 12)
    fail(400, 'Add 1–12 product photos.');
  const validatePhoto = (photo) => {
    const image = text(photo, 1, 250, 'Product photo');
    if (
      !/^\/(?:products|uploads)\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(
        image,
      )
    )
      fail(400, 'Use uploaded photos or local product images.');
    return image;
  };
  // Keep validating the legacy cover field even when a gallery is supplied.
  if (body.image !== undefined) validatePhoto(body.image);
  const images = photos.map(validatePhoto);
  if (new Set(images).size !== images.length)
    fail(400, 'Each product photo must be different.');
  const image = images[0];
  if (
    !Array.isArray(body.specs) ||
    body.specs.length < 1 ||
    body.specs.length > 15
  )
    fail(400, 'Add 1–15 specifications.');
  const specs = body.specs.map((s) => text(s, 1, 160, 'Specification'));
  if (typeof body.active !== 'boolean')
    fail(400, 'Choose whether the product is visible.');
  const oldPrice =
    body.oldPrice == null
      ? undefined
      : integer(body.oldPrice, price + 1, 1_000_000_000_000, 'Previous price');
  return {
    name,
    subtitle,
    category,
    collection: body.collection,
    brand,
    condition,
    price,
    stock,
    image,
    images,
    specs,
    oldPrice,
    active: body.active,
  };
}
export function validatePaymentMethod(body) {
  const label = text(body.label, 2, 80, 'Payment name');
  if (!['bank', 'wallet'].includes(body.kind))
    fail(400, 'Choose bank or wallet.');
  const bankName = text(body.bankName ?? '', 0, 80, 'Bank name');
  const accountName = text(body.accountName ?? '', 0, 100, 'Account name');
  const accountNumber = text(body.accountNumber ?? '', 0, 80, 'Account number');
  const instructions = text(
    body.instructions ?? '',
    0,
    600,
    'Payment instructions',
  );
  const qrImage = text(body.qrImage ?? '', 0, 150, 'QR image');
  if (qrImage && !/^\/uploads\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(qrImage))
    fail(400, 'Upload a QR image from this shop.');
  if (
    !qrImage &&
    (accountName.length < 2 ||
      accountNumber.length < 3 ||
      (body.kind === 'bank' && bankName.length < 2))
  )
    fail(400, 'Add a QR image or complete the account details.');
  if (typeof body.active !== 'boolean')
    fail(400, 'Choose whether the payment method is available.');
  return {
    label,
    kind: body.kind,
    bankName,
    accountName,
    accountNumber,
    instructions,
    qrImage,
    active: body.active,
  };
}
const paymentMethodView = (row) => ({
  ...JSON.parse(row.details),
  id: row.id,
  active: Boolean(row.active),
  version: row.version,
});
function validateDelivery(body) {
  if (!body || typeof body !== 'object')
    fail(400, 'Delivery details are required.');
  const name = text(body.name, 2, 80, 'Full name');
  const phone = text(body.phone, 7, 80, 'Phone')
    .replace(/[၀-၉]/g, (d) => String(d.charCodeAt(0) - 0x1040))
    .replace(/[\s()+-]/g, '');
  if (!/^\d{7,15}$/.test(phone)) fail(400, 'Enter a valid phone number.');
  return {
    name,
    phone,
    address: text(body.address, 8, 300, 'Address'),
    note: text(body.note ?? '', 0, 300, 'Note'),
  };
}

export const shopDay = (now = Date.now()) =>
  new Date(now + 6.5 * 60 * 60_000).toISOString().slice(0, 10);
const dayOffset = (day, offset) =>
  new Date(Date.parse(day + 'T00:00:00Z') + offset * 86400_000)
    .toISOString()
    .slice(0, 10);

export function createStore(
  filename,
  {
    now: clock = Date.now,
    reservationMinutes = 1440,
    maxUnpaidOrders = 3,
    maxReceiptFiles = 60,
    maxReceiptBytes = 120 * 1024 * 1024,
    maxCustomerReceiptBytes = 512 * 1024 * 1024,
    maxShopReceiptBytes = 5 * 1024 * 1024 * 1024,
    receiptUploadsPerHour = 40,
  } = {},
) {
  integer(reservationMinutes, 15, 10080, 'Reservation minutes');
  integer(maxUnpaidOrders, 1, 1000, 'Unpaid order limit');
  for (const limit of [
    maxReceiptFiles,
    maxReceiptBytes,
    maxCustomerReceiptBytes,
    maxShopReceiptBytes,
    receiptUploadsPerHour,
  ])
    integer(limit, 1, Number.MAX_SAFE_INTEGER, 'Receipt limit');
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  }
  const db = new DatabaseSync(filename);
  if (filename !== ':memory:') fs.chmodSync(filename, 0o600);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','customer')), password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT, details TEXT NOT NULL, price INTEGER NOT NULL, stock INTEGER NOT NULL CHECK(stock >= 0), active INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES users(id), items TEXT NOT NULL, delivery TEXT NOT NULL, payment TEXT NOT NULL, total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, UNIQUE(customer_id,idempotency_key));
    CREATE TABLE IF NOT EXISTS payment_methods(id TEXT PRIMARY KEY, details TEXT NOT NULL, active INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), file_name TEXT UNIQUE NOT NULL, mime TEXT NOT NULL, uploaded_at TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS payment_events(id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL REFERENCES orders(id), actor_id TEXT NOT NULL REFERENCES users(id), decision TEXT NOT NULL, note TEXT NOT NULL, receipt_id TEXT REFERENCES receipts(id), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS order_events(id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL REFERENCES orders(id), actor_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS orders_customer ON orders(customer_id);
    CREATE TABLE IF NOT EXISTS owner_setup(id INTEGER PRIMARY KEY CHECK(id=1), subject TEXT, setup_hash TEXT, expires_at INTEGER);
    INSERT OR IGNORE INTO owner_setup(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS pending_google_migrations(user_id TEXT PRIMARY KEY REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS google_identities(subject TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS google_flows(state_hash TEXT PRIMARY KEY, binding_hash TEXT NOT NULL, details TEXT NOT NULL, expires_at INTEGER NOT NULL);`);
  const userColumns = new Set(
    db
      .prepare('PRAGMA table_info(users)')
      .all()
      .map((c) => c.name),
  );
  for (const [column, definition] of [
    ['account_status', "TEXT NOT NULL DEFAULT 'active'"],
    ['account_version', 'INTEGER NOT NULL DEFAULT 1'],
    ['created_at', 'TEXT'],
    ['last_login_at', 'TEXT'],
  ])
    if (!userColumns.has(column))
      db.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
  db.exec(`CREATE TABLE IF NOT EXISTS shop_metrics_settings(id INTEGER PRIMARY KEY CHECK(id=1), secret TEXT NOT NULL, started_day TEXT);
    CREATE TABLE IF NOT EXISTS shop_visit_days(day TEXT PRIMARY KEY, visitors INTEGER NOT NULL DEFAULT 0, page_views INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS shop_visit_seen(day TEXT NOT NULL, visitor_hash TEXT NOT NULL, PRIMARY KEY(day, visitor_hash));
    CREATE TABLE IF NOT EXISTS shop_view_seen(day TEXT NOT NULL, view_hash TEXT NOT NULL, PRIMARY KEY(day, view_hash));`);
  if (
    !db
      .prepare('PRAGMA table_info(shop_metrics_settings)')
      .all()
      .some((c) => c.name === 'started_day')
  )
    db.exec('ALTER TABLE shop_metrics_settings ADD COLUMN started_day TEXT');
  db.prepare(
    'INSERT OR IGNORE INTO shop_metrics_settings(id,secret,started_day) VALUES(1,?,?)',
  ).run(randomBytes(32).toString('hex'), shopDay());
  db.prepare(
    'UPDATE shop_metrics_settings SET started_day=? WHERE started_day IS NULL',
  ).run(shopDay());
  const metricsSecret = db
    .prepare('SELECT secret FROM shop_metrics_settings WHERE id=1')
    .get().secret;
  const requireManager = (owner) => {
    if (
      owner?.role !== 'owner' ||
      !db
        .prepare(
          'SELECT 1 FROM google_identities g JOIN owner_setup o ON o.subject=g.subject WHERE o.id=1 AND g.user_id=?',
        )
        .get(owner.id)
    )
      fail(403, 'Owner access required.');
  };
  const allowAccount = (user) => {
    if (user?.account_status === 'suspended')
      fail(403, 'Your shop account is suspended. Contact SPL for help.');
  };
  if (
    !db
      .prepare('PRAGMA table_info(sessions)')
      .all()
      .some((column) => column.name === 'auth_provider')
  )
    db.exec(
      "ALTER TABLE sessions ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password'",
    );
  const orderColumns = new Set(
    db
      .prepare('PRAGMA table_info(orders)')
      .all()
      .map((column) => column.name),
  );
  for (const [column, definition] of [
    ['payment_method', 'TEXT'],
    ['payment_status', "TEXT NOT NULL DEFAULT 'not_required'"],
    ['payment_review_note', "TEXT NOT NULL DEFAULT ''"],
    ['receipt_id', 'TEXT REFERENCES receipts(id)'],
    ['reservation_expires_at', 'TEXT'],
    ['cancellation_reason', "TEXT NOT NULL DEFAULT ''"],
  ])
    if (!orderColumns.has(column))
      db.exec(`ALTER TABLE orders ADD COLUMN ${column} ${definition}`);
  if (
    !db
      .prepare('PRAGMA table_info(receipts)')
      .all()
      .some((c) => c.name === 'size_bytes')
  )
    db.exec(
      'ALTER TABLE receipts ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 3145728',
    );
  db.exec(`CREATE INDEX IF NOT EXISTS orders_date ON orders(created_at DESC,id DESC);
    CREATE INDEX IF NOT EXISTS orders_status_date ON orders(status,created_at DESC);
    CREATE INDEX IF NOT EXISTS orders_reservation_expiry ON orders(reservation_expires_at)
      WHERE status='pending' AND payment_status='awaiting_receipt';
    CREATE INDEX IF NOT EXISTS receipts_order ON receipts(order_id);
    CREATE INDEX IF NOT EXISTS receipts_actor_date ON receipts(actor_id,uploaded_at);
    CREATE INDEX IF NOT EXISTS payment_events_order ON payment_events(order_id);
    CREATE INDEX IF NOT EXISTS order_events_order ON order_events(order_id);
    CREATE TABLE IF NOT EXISTS closed_order_submissions(customer_id TEXT NOT NULL REFERENCES users(id),
      submission_key TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(customer_id,submission_key));
    CREATE INDEX IF NOT EXISTS closed_submissions_date ON closed_order_submissions(created_at);`);
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  transaction(() => {
    if (
      !db
        .prepare('PRAGMA table_info(receipts)')
        .all()
        .some((c) => c.name === 'active')
    ) {
      db.exec(
        'ALTER TABLE receipts ADD COLUMN active INTEGER NOT NULL DEFAULT 0',
      );
      // Only the current receipt belongs to a v3.4 review; older photos stay in its history.
      db.exec(
        'UPDATE receipts SET active=1 WHERE id IN (SELECT receipt_id FROM orders WHERE receipt_id IS NOT NULL)',
      );
    }
    if (
      !db
        .prepare('PRAGMA table_info(payment_events)')
        .all()
        .some((c) => c.name === 'receipt_ids')
    ) {
      db.exec(
        "ALTER TABLE payment_events ADD COLUMN receipt_ids TEXT NOT NULL DEFAULT '[]'",
      );
      for (const event of db
        .prepare(
          'SELECT id,receipt_id FROM payment_events WHERE receipt_id IS NOT NULL',
        )
        .all())
        db.prepare('UPDATE payment_events SET receipt_ids=? WHERE id=?').run(
          JSON.stringify([event.receipt_id]),
          event.id,
        );
    }
  });
  transaction(() => {
    if (
      db.prepare('SELECT COUNT(*) AS count FROM products').get().count === 0
    ) {
      const insert = db.prepare(
        'INSERT INTO products(id,details,price,stock,active) VALUES(?,?,?,?,1)',
      );
      for (const p of seedProducts)
        insert.run(p.id, JSON.stringify(p), p.price, p.stock);
    }
    // Older catalogs describe used devices. Never migrate them as brand new.
    for (const row of db.prepare('SELECT id,details FROM products').all()) {
      const details = JSON.parse(row.details);
      if (
        !['brand-new', 'good-second'].includes(details.collection) ||
        !details.brand
      ) {
        details.collection = ['brand-new', 'good-second'].includes(
          details.collection,
        )
          ? details.collection
          : 'good-second';
        details.brand = details.brand || inferBrand(details.name);
        db.prepare('UPDATE products SET details=? WHERE id=?').run(
          JSON.stringify(details),
          row.id,
        );
      }
    }
  });
  // Backfill only names already used by this shop. No global brand directory.
  db.exec(
    'CREATE TABLE IF NOT EXISTS brands(key TEXT PRIMARY KEY, name TEXT NOT NULL)',
  );
  const registerBrand = (raw) => {
    const name = text(raw, 1, 50, 'Brand name').normalize('NFC');
    if (name.toLowerCase() === 'all brands')
      fail(400, 'Choose a different brand name.');
    const key = name.toLowerCase();
    db.prepare('INSERT OR IGNORE INTO brands(key,name) VALUES(?,?)').run(
      key,
      name,
    );
    return db.prepare('SELECT name FROM brands WHERE key=?').get(key).name;
  };
  transaction(() => {
    for (const row of db
      .prepare('SELECT details FROM products ORDER BY id')
      .all())
      registerBrand(JSON.parse(row.details).brand);
  });
  const dummyHash = passwordHash(randomBytes(32).toString('hex'));
  // Existing orders have no invented deadline. Any receipt upload stops automatic
  // expiry because it can represent a transfer already made by the customer.
  const expireReservations = () =>
    transaction(() => {
      const stamp = new Date(clock()).toISOString();
      const expired = db
        .prepare(`SELECT * FROM orders WHERE status='pending'
      AND payment_status='awaiting_receipt' AND reservation_expires_at<=?
      AND NOT EXISTS(SELECT 1 FROM receipts WHERE order_id=orders.id)`)
        .all(stamp);
      for (const order of expired) {
        for (const item of JSON.parse(order.items))
          db.prepare(
            'UPDATE products SET stock=stock+?,version=version+1 WHERE id=?',
          ).run(item.quantity, item.id);
        db.prepare(`UPDATE orders SET status='cancelled',cancellation_reason=?,
        reservation_expires_at=NULL,updated_at=?,version=version+1 WHERE id=?`).run(
          'Payment deadline passed before a receipt was uploaded.',
          stamp,
          order.id,
        );
        db.prepare(
          'INSERT INTO order_events(order_id,actor_id,status,created_at) VALUES(?,?,?,?)',
        ).run(order.id, order.customer_id, 'cancelled', stamp);
      }
      return expired.length;
    });
  const receiptUploadAllowance = (user, id, size) => {
    if (user.role !== 'customer') fail(403, 'Customer access required.');
    integer(size, 1, 3 * 1024 * 1024, 'Receipt size');
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    if (!order || order.customer_id !== user.id) fail(404, 'Order not found.');
    if (
      ['cancelled', 'completed'].includes(order.status) ||
      !['awaiting_receipt', 'needs_receipt', 'pending_review'].includes(
        order.payment_status,
      )
    )
      fail(409, 'This order is not accepting receipts. Refresh your orders.');
    const used = db
      .prepare(
        'SELECT COUNT(*) AS files,COALESCE(SUM(size_bytes),0) AS bytes FROM receipts WHERE order_id=?',
      )
      .get(id);
    const customerBytes = db
      .prepare(
        'SELECT COALESCE(SUM(size_bytes),0) AS bytes FROM receipts WHERE actor_id=?',
      )
      .get(user.id).bytes;
    const shopBytes = db
      .prepare('SELECT COALESCE(SUM(size_bytes),0) AS bytes FROM receipts')
      .get().bytes;
    if (
      used.files >= maxReceiptFiles ||
      used.bytes + size > maxReceiptBytes ||
      customerBytes + size > maxCustomerReceiptBytes ||
      shopBytes + size > maxShopReceiptBytes
    )
      fail(
        409,
        'Receipt storage limit reached. Contact SPL for help before uploading more photos.',
      );
    const recent = db
      .prepare(
        'SELECT COUNT(*) AS n FROM receipts WHERE actor_id=? AND uploaded_at>=?',
      )
      .get(user.id, new Date(clock() - 3600_000).toISOString()).n;
    if (recent >= receiptUploadsPerHour)
      fail(
        429,
        'Too many receipt uploads. Please try again in one hour or contact SPL.',
      );
  };
  const activeReceiptIds = (id) =>
    db
      .prepare(
        'SELECT id FROM receipts WHERE order_id=? AND active=1 ORDER BY uploaded_at,rowid',
      )
      .all(id)
      .map((r) => r.id);
  const receiptView = (receipt, id) => ({
    id: receipt.id,
    imageUrl: `/api/orders/${id}/receipts/${receipt.id}`,
    uploadedAt: receipt.uploaded_at,
  });
  const orderView = (row) => ({
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    items: JSON.parse(row.items),
    delivery: JSON.parse(row.delivery),
    payment: row.payment,
    paymentMethod: row.payment_method ? JSON.parse(row.payment_method) : null,
    paymentStatus: row.payment_status,
    paymentReviewNote: row.payment_review_note,
    receipts: db
      .prepare(
        'SELECT id,uploaded_at FROM receipts WHERE order_id=? AND active=1 ORDER BY uploaded_at,rowid',
      )
      .all(row.id)
      .map((receipt) => receiptView(receipt, row.id)),
    receipt: row.receipt_id
      ? (() => {
          const receipt = db
            .prepare(
              'SELECT id,uploaded_at FROM receipts WHERE id=? AND order_id=?',
            )
            .get(row.receipt_id, row.id);
          return receipt
            ? {
                id: receipt.id,
                imageUrl: `/api/orders/${row.id}/receipts/${receipt.id}`,
                uploadedAt: receipt.uploaded_at,
              }
            : null;
        })()
      : null,
    paymentEvents: db
      .prepare(
        'SELECT decision,note,receipt_id,receipt_ids,created_at FROM payment_events WHERE order_id=? ORDER BY id',
      )
      .all(row.id)
      .map((event) => ({
        decision: event.decision,
        note: event.note,
        receiptId: event.receipt_id,
        receipts: JSON.parse(event.receipt_ids).map((id) => ({
          id,
          imageUrl: `/api/orders/${row.id}/receipts/${id}`,
        })),
        imageUrl: event.receipt_id
          ? `/api/orders/${row.id}/receipts/${event.receipt_id}`
          : null,
        createdAt: event.created_at,
      })),
    total: row.total,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reservationExpiresAt: row.reservation_expires_at,
    cancellationReason: row.cancellation_reason,
    version: row.version,
    events: db
      .prepare(
        'SELECT status, created_at AS createdAt FROM order_events WHERE order_id=? ORDER BY id',
      )
      .all(row.id),
  });
  return {
    db,
    close: () => db.close(),
    expireReservations,
    receiptUploadAllowance,
    createUser(body, role = 'customer') {
      const email = validateEmail(body.email);
      const name = text(body.name, 2, 80, 'Name');
      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length < 12 || password.length > 128)
        fail(400, 'Use a password of 12–128 characters.');
      if (db.prepare('SELECT id FROM users WHERE email=?').get(email))
        fail(409, 'An account with that email already exists.');
      const user = { id: randomUUID(), name, email, role };
      db.prepare(
        'INSERT INTO users(id,email,name,role,password_hash) VALUES(?,?,?,?,?)',
      ).run(user.id, email, name, role, passwordHash(password));
      db.prepare('UPDATE users SET created_at=? WHERE id=?').run(
        new Date().toISOString(),
        user.id,
      );
      return user;
    },
    authenticate(emailValue, password) {
      const email = validateEmail(emailValue);
      if (typeof password !== 'string' || password.length > 128)
        fail(401, 'Email or password is incorrect.');
      const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
      const match = passwordMatches(password, u?.password_hash ?? dummyHash);
      if (!u || !match) fail(401, 'Email or password is incorrect.');
      allowAccount(u);
      return userView(u);
    },
    saveGoogleFlow(state, binding, details) {
      db.prepare('DELETE FROM google_flows WHERE expires_at<=?').run(
        Date.now(),
      );
      if (db.prepare('SELECT COUNT(*) AS n FROM google_flows').get().n >= 2000)
        fail(429, 'Please try signing in later.');
      db.prepare('INSERT INTO google_flows VALUES(?,?,?,?)').run(
        digest(state),
        digest(binding),
        JSON.stringify(details),
        Date.now() + 10 * 60_000,
      );
    },
    consumeGoogleFlow(state, binding) {
      if (
        typeof state !== 'string' ||
        state.length > 200 ||
        typeof binding !== 'string' ||
        binding.length > 200
      )
        fail(401, 'Google sign-in expired. Please try again.');
      return transaction(() => {
        const flow = db
          .prepare('SELECT * FROM google_flows WHERE state_hash=?')
          .get(digest(state));
        if (
          !flow ||
          flow.expires_at <= Date.now() ||
          flow.binding_hash !== digest(binding)
        )
          fail(401, 'Google sign-in expired. Please try again.');
        db.prepare('DELETE FROM google_flows WHERE state_hash=?').run(
          digest(state),
        );
        return JSON.parse(flow.details);
      });
    },
    ownerInfo() {
      const row = db.prepare('SELECT * FROM owner_setup WHERE id=1').get();
      return {
        configured: Boolean(row.subject),
        pending: Boolean(
          !row.subject && row.setup_hash && row.expires_at > Date.now(),
        ),
      };
    },
    isCurrentOwner(userId) {
      return Boolean(
        db
          .prepare(
            'SELECT 1 FROM google_identities g JOIN owner_setup o ON o.subject=g.subject WHERE o.id=1 AND g.user_id=?',
          )
          .get(userId),
      );
    },
    createOwnerSetup(replace = false) {
      return transaction(() => {
        const row = db.prepare('SELECT * FROM owner_setup WHERE id=1').get();
        if (row.subject && !replace)
          fail(
            409,
            'An owner is already configured. Use --replace only to intentionally change the owner account.',
          );
        const code = randomBytes(32).toString('base64url');
        db.prepare(
          'UPDATE owner_setup SET subject=NULL, setup_hash=?, expires_at=? WHERE id=1',
        ).run(digest(code), Date.now() + 24 * 60 * 60_000);
        db.exec(
          "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role='owner'); UPDATE users SET role='customer' WHERE role='owner';",
        );
        return code;
      });
    },
    validateOwnerSetup(code) {
      const row = db.prepare('SELECT * FROM owner_setup WHERE id=1').get();
      if (
        row.subject ||
        !row.setup_hash ||
        row.expires_at <= Date.now() ||
        typeof code !== 'string' ||
        code.length > 200 ||
        digest(code) !== row.setup_hash
      )
        fail(403, 'The private owner setup code is invalid or expired.');
      return row.setup_hash;
    },
    authorizeGoogleMigration(email) {
      const user = db
        .prepare('SELECT id FROM users WHERE email=?')
        .get(validateEmail(email));
      if (!user) fail(404, 'No existing account uses that email.');
      db.prepare(
        'INSERT OR IGNORE INTO pending_google_migrations(user_id) VALUES(?)',
      ).run(user.id);
    },
    googleUser(
      identity,
      { audience = 'customer', ownerSetupHash = null } = {},
    ) {
      return transaction(() => {
        const binding = db
          .prepare('SELECT * FROM owner_setup WHERE id=1')
          .get();
        let approvedOwner = binding.subject === identity.subject;
        if (audience === 'owner' && !approvedOwner) {
          if (
            binding.subject ||
            !ownerSetupHash ||
            binding.setup_hash !== ownerSetupHash ||
            binding.expires_at <= Date.now()
          )
            fail(
              403,
              'Only the configured Google owner account can access this dashboard.',
            );
          db.prepare(
            'UPDATE owner_setup SET subject=?,setup_hash=NULL,expires_at=NULL WHERE id=1',
          ).run(identity.subject);
          approvedOwner = true;
        }
        const role = approvedOwner ? 'owner' : 'customer';
        let user = db
          .prepare(
            'SELECT u.* FROM users u JOIN google_identities g ON g.user_id=u.id WHERE g.subject=?',
          )
          .get(identity.subject);
        if (user) {
          allowAccount(user);
          if (
            user.email !== identity.email &&
            db
              .prepare('SELECT id FROM users WHERE email=? AND id<>?')
              .get(identity.email, user.id)
          )
            fail(
              409,
              'Your changed Google email conflicts with an existing account. Contact the shop.',
            );
          if (user.role !== role)
            db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
          db.prepare(
            'UPDATE users SET email=?,role=?,last_login_at=? WHERE id=?',
          ).run(identity.email, role, new Date().toISOString(), user.id);
          return { ...userView(user), email: identity.email, role };
        }
        user = db
          .prepare('SELECT * FROM users WHERE email=?')
          .get(identity.email);
        if (user) {
          allowAccount(user);
          if (
            !approvedOwner &&
            !db
              .prepare(
                'SELECT 1 FROM pending_google_migrations WHERE user_id=?',
              )
              .get(user.id)
          )
            fail(
              409,
              'This email has an older password account. Ask the shop administrator to approve its Google migration.',
            );
          if (
            db
              .prepare('SELECT 1 FROM google_identities WHERE user_id=?')
              .get(user.id)
          )
            fail(
              409,
              'This email is already linked to a different Google account. Contact the shop.',
            );
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
          db.prepare('UPDATE users SET role=?,last_login_at=? WHERE id=?').run(
            role,
            new Date().toISOString(),
            user.id,
          );
          db.prepare('INSERT INTO google_identities VALUES(?,?)').run(
            identity.subject,
            user.id,
          );
          db.prepare(
            'DELETE FROM pending_google_migrations WHERE user_id=?',
          ).run(user.id);
          return { ...userView(user), role };
        }
        user = {
          id: randomUUID(),
          email: identity.email,
          name: identity.name,
          role,
        };
        db.prepare(
          'INSERT INTO users(id,email,name,role,password_hash) VALUES(?,?,?,?,?)',
        ).run(
          user.id,
          user.email,
          user.name,
          user.role,
          passwordHash(randomBytes(64).toString('hex')),
        );
        db.prepare('INSERT INTO google_identities VALUES(?,?)').run(
          identity.subject,
          user.id,
        );
        db.prepare(
          'UPDATE users SET created_at=?,last_login_at=? WHERE id=?',
        ).run(new Date().toISOString(), new Date().toISOString(), user.id);
        return user;
      });
    },
    newSession(userId, provider = 'password') {
      const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
      if (!user) fail(404, 'Account not found.');
      allowAccount(user);
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
      const token = randomBytes(32).toString('hex');
      const csrf = randomBytes(32).toString('hex');
      db.prepare(
        'INSERT INTO sessions(token_hash,user_id,csrf,expires_at,auth_provider) VALUES(?,?,?,?,?)',
      ).run(digest(token), userId, csrf, Date.now() + 7 * 86400_000, provider);
      return { token, csrf };
    },
    session(token) {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
      const row = db
        .prepare(
          'SELECT u.*,s.csrf,s.auth_provider FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
        )
        .get(digest(token), Date.now());
      return row && row.account_status === 'active'
        ? { user: userView(row), csrf: row.csrf, provider: row.auth_provider }
        : null;
    },
    revokeSession(token) {
      if (token)
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(
          digest(token),
        );
    },
    customerAccounts(owner, { search = '', status = 'all', page = 1 } = {}) {
      requireManager(owner);
      search = text(search, 0, 100, 'Search');
      if (!['all', 'active', 'suspended'].includes(status))
        fail(400, 'Choose an account status.');
      integer(page, 1, 1_000_000, 'Page');
      const clause =
        "u.role='customer' AND (?='all' OR u.account_status=?) AND (?='' OR instr(lower(u.name),lower(?))>0 OR instr(lower(u.email),lower(?))>0)";
      const args = [status, status, search, search, search];
      const total = db
        .prepare(`SELECT COUNT(*) AS n FROM users u WHERE ${clause}`)
        .get(...args).n;
      const counts = db
        .prepare(
          "SELECT COUNT(*) AS total, COALESCE(SUM(account_status='active'),0) AS active, COALESCE(SUM(account_status='suspended'),0) AS suspended FROM users WHERE role='customer'",
        )
        .get();
      const pages = Math.max(1, Math.ceil(total / 25));
      page = Math.min(page, pages);
      const accounts = db
        .prepare(
          `SELECT u.id,u.name,u.email,u.account_status AS status,u.account_version AS version,u.created_at AS createdAt,u.last_login_at AS lastLoginAt,(SELECT COUNT(*) FROM orders o WHERE o.customer_id=u.id) AS orderCount,(SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.customer_id=u.id AND o.status='completed') AS completedTotal,EXISTS(SELECT 1 FROM google_identities g WHERE g.user_id=u.id) AS googleLinked FROM users u WHERE ${clause} ORDER BY u.created_at DESC,u.email LIMIT 25 OFFSET ?`,
        )
        .all(...args, (page - 1) * 25)
        .map((row) => ({ ...row, googleLinked: Boolean(row.googleLinked) }));
      return { accounts, counts, total, page, pages };
    },
    setCustomerStatus(owner, id, body) {
      requireManager(owner);
      if (!['active', 'suspended'].includes(body.status))
        fail(400, 'Choose active or suspended.');
      integer(body.version, 1, 1_000_000_000, 'Account version');
      return transaction(() => {
        const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
        if (!user) fail(404, 'Account not found.');
        if (
          user.role !== 'customer' ||
          db
            .prepare(
              'SELECT 1 FROM google_identities g JOIN owner_setup o ON o.subject=g.subject WHERE g.user_id=?',
            )
            .get(id)
        )
          fail(403, 'The owner account cannot be changed here.');
        if (user.account_version !== body.version)
          fail(409, 'This account changed. Refresh before trying again.');
        db.prepare(
          'UPDATE users SET account_status=?,account_version=account_version+1 WHERE id=?',
        ).run(body.status, id);
        if (body.status === 'suspended')
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
        return { id, status: body.status, version: user.account_version + 1 };
      });
    },
    visitorSignature(token) {
      return createHmac('sha256', metricsSecret).update(token).digest('hex');
    },
    recordShopVisit(token, viewId, now = Date.now()) {
      if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9-]{36}$/.test(viewId))
        fail(400, 'Invalid shop visit.');
      const day = shopDay(now);
      return transaction(() => {
        db.prepare('DELETE FROM shop_visit_seen WHERE day<?').run(
          dayOffset(day, -1),
        );
        db.prepare('DELETE FROM shop_view_seen WHERE day<?').run(
          dayOffset(day, -1),
        );
        db.prepare('DELETE FROM shop_visit_days WHERE day<?').run(
          dayOffset(day, -365),
        );
        // A repeated mount or network retry is one page opening, including when its cookie response was lost.
        const view = db
          .prepare('INSERT OR IGNORE INTO shop_view_seen VALUES(?,?)')
          .run(day, digest(day + ':' + viewId)).changes;
        if (!view) return;
        const visitor = db
          .prepare('INSERT OR IGNORE INTO shop_visit_seen VALUES(?,?)')
          .run(day, digest(day + ':' + token)).changes;
        db.prepare(
          'INSERT INTO shop_visit_days VALUES(?,?,1) ON CONFLICT(day) DO UPDATE SET visitors=visitors+excluded.visitors,page_views=page_views+1',
        ).run(day, visitor);
      });
    },
    shopAnalytics(owner, days = 30, now = Date.now()) {
      requireManager(owner);
      integer(days, 1, 90, 'Days');
      const today = shopDay(now);
      const trackingStartedDay = db
        .prepare('SELECT started_day FROM shop_metrics_settings WHERE id=1')
        .get().started_day;
      const start = dayOffset(today, 1 - days);
      const rows = new Map(
        db
          .prepare('SELECT * FROM shop_visit_days WHERE day>=? AND day<=?')
          .all(start, today)
          .map((row) => [row.day, row]),
      );
      const daily = Array.from({ length: days }, (_, i) => {
        const day = dayOffset(start, i);
        return rows.get(day) ?? { day, visitors: 0, page_views: 0 };
      }).map((row) => ({
        day: row.day,
        visitors: row.visitors,
        pageViews: row.page_views,
        tracked: row.day >= trackingStartedDay || rows.has(row.day),
      }));
      const first = db
        .prepare('SELECT MIN(day) AS day FROM shop_visit_days')
        .get().day;
      return {
        timezone: 'Asia/Yangon',
        trackingStartedDay,
        trackedDays: daily.filter((d) => d.tracked).length,
        today,
        firstRecordedDay: first,
        days,
        daily,
        totals: {
          visitorDays: daily.reduce((n, d) => n + d.visitors, 0),
          pageViews: daily.reduce((n, d) => n + d.pageViews, 0),
        },
        todayCounts: daily.at(-1),
      };
    },
    catalog(owner = false) {
      expireReservations();
      return db
        .prepare(
          `SELECT * FROM products ${owner ? '' : 'WHERE active=1'} ORDER BY id`,
        )
        .all()
        .map(productView);
    },
    brands() {
      return db
        .prepare('SELECT name FROM brands')
        .all()
        .map((b) => b.name)
        .sort((a, b) => a.localeCompare(b));
    },
    addBrand(owner, body) {
      requireManager(owner);
      return registerBrand(body.name);
    },
    removeBrand(owner, body) {
      requireManager(owner);
      const name = text(body.name, 1, 50, 'Brand name').normalize('NFC');
      const key = name.toLowerCase();
      if (
        db
          .prepare('SELECT details FROM products')
          .all()
          .some(
            (p) =>
              JSON.parse(p.details).brand.normalize('NFC').toLowerCase() ===
              key,
          )
      )
        fail(
          409,
          'This brand is used by a laptop. Change its brand in Products first.',
        );
      const removed = db.prepare('DELETE FROM brands WHERE key=?').run(key);
      if (!removed.changes) fail(404, 'Brand not found. Refresh the list.');
    },
    saveProduct(id, body) {
      const p = validateProduct(body);
      if (p.brand.normalize('NFC').toLowerCase() === 'all brands')
        fail(400, 'Choose a different brand name.');
      return transaction(() => {
        if (id == null) {
          p.brand = registerBrand(p.brand);
          const r = db
            .prepare(
              'INSERT INTO products(details,price,stock,active) VALUES(?,?,?,?)',
            )
            .run(JSON.stringify(p), p.price, p.stock, Number(p.active));
          return productView(
            db
              .prepare('SELECT * FROM products WHERE id=?')
              .get(r.lastInsertRowid),
          );
        }
        integer(body.version, 1, Number.MAX_SAFE_INTEGER, 'Product version');
        const r = db
          .prepare(
            'UPDATE products SET details=?,price=?,stock=?,active=?,version=version+1 WHERE id=? AND version=?',
          )
          .run(
            JSON.stringify(p),
            p.price,
            p.stock,
            Number(p.active),
            id,
            body.version,
          );
        if (r.changes !== 1)
          fail(
            409,
            'This product changed. Refresh the catalog before saving again.',
          );
        p.brand = registerBrand(p.brand);
        db.prepare('UPDATE products SET details=? WHERE id=?').run(
          JSON.stringify(p),
          id,
        );
        return productView(
          db.prepare('SELECT * FROM products WHERE id=?').get(id),
        );
      });
    },
    paymentMethods(owner = false) {
      return db
        .prepare(
          `SELECT * FROM payment_methods ${owner ? '' : 'WHERE active=1'} ORDER BY rowid`,
        )
        .all()
        .map(paymentMethodView);
    },
    savePaymentMethod(id, body) {
      const method = validatePaymentMethod(body);
      if (id == null) {
        id = randomUUID();
        db.prepare(
          'INSERT INTO payment_methods(id,details,active) VALUES(?,?,?)',
        ).run(id, JSON.stringify(method), Number(method.active));
      } else {
        integer(
          body.version,
          1,
          Number.MAX_SAFE_INTEGER,
          'Payment method version',
        );
        const changed = db
          .prepare(
            'UPDATE payment_methods SET details=?,active=?,version=version+1 WHERE id=? AND version=?',
          )
          .run(JSON.stringify(method), Number(method.active), id, body.version);
        if (changed.changes !== 1)
          fail(
            409,
            'This payment method changed. Refresh before saving again.',
          );
      }
      return paymentMethodView(
        db.prepare('SELECT * FROM payment_methods WHERE id=?').get(id),
      );
    },
    receiptOrder(user, id) {
      expireReservations();
      const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
      if (!order || (user.role !== 'owner' && order.customer_id !== user.id))
        fail(404, 'Order not found.');
      return order;
    },
    receiptFile(user, id, receiptId) {
      const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
      if (!order || (user.role !== 'owner' && order.customer_id !== user.id))
        fail(404, 'Receipt not found.');
      const receipt = db
        .prepare('SELECT * FROM receipts WHERE id=? AND order_id=?')
        .get(receiptId, id);
      if (!receipt) fail(404, 'Receipt not found.');
      return receipt;
    },
    addReceipt(user, id, receipt, draft = false) {
      if (user.role !== 'customer') fail(403, 'Customer access required.');
      expireReservations();
      return transaction(() => {
        receiptUploadAllowance(user, id, receipt.size ?? 3 * 1024 * 1024);
        const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
        if (!order || order.customer_id !== user.id)
          fail(404, 'Order not found.');
        if (
          ['cancelled', 'completed'].includes(order.status) ||
          !(
            draft
              ? ['awaiting_receipt', 'needs_receipt', 'pending_review']
              : ['awaiting_receipt', 'needs_receipt']
          ).includes(order.payment_status)
        )
          fail(
            409,
            'This order is not accepting a receipt. Refresh your orders.',
          );
        if (activeReceiptIds(id).length >= 20)
          fail(
            409,
            'You can attach up to 20 receipts to one order. Remove a photo before adding another.',
          );
        const now = new Date(clock()).toISOString();
        // The legacy endpoint replaces a rejected receipt; the new draft flow keeps
        // every transfer and lets the customer remove only the unreadable photo.
        if (!draft && order.payment_status === 'needs_receipt')
          db.prepare('UPDATE receipts SET active=0 WHERE order_id=?').run(id);
        db.prepare(
          'INSERT INTO receipts(id,order_id,file_name,mime,uploaded_at,actor_id,active,size_bytes) VALUES(?,?,?,?,?,?,1,?)',
        ).run(
          receipt.id,
          id,
          receipt.fileName,
          receipt.mime,
          now,
          user.id,
          receipt.size ?? 3 * 1024 * 1024,
        );
        db.prepare(
          'UPDATE orders SET reservation_expires_at=NULL WHERE id=?',
        ).run(id);
        db.prepare(
          'UPDATE orders SET receipt_id=?,payment_status=?,payment_review_note=?,updated_at=?,version=version+1 WHERE id=?',
        ).run(
          receipt.id,
          draft ? 'awaiting_receipt' : 'pending_review',
          draft ? order.payment_review_note : '',
          now,
          id,
        );
        db.prepare(
          'INSERT INTO payment_events(order_id,actor_id,decision,note,receipt_id,receipt_ids,created_at) VALUES(?,?,?,?,?,?,?)',
        ).run(
          id,
          user.id,
          draft ? 'receipt_added' : 'pending_review',
          '',
          receipt.id,
          JSON.stringify(activeReceiptIds(id)),
          now,
        );
        return orderView(db.prepare('SELECT * FROM orders WHERE id=?').get(id));
      });
    },
    submitReceipts(user, id, body) {
      if (user.role !== 'customer') fail(403, 'Customer access required.');
      integer(body.version, 1, Number.MAX_SAFE_INTEGER, 'Order version');
      return transaction(() => {
        const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
        if (!order || order.customer_id !== user.id)
          fail(404, 'Order not found.');
        if (order.version !== body.version)
          fail(
            409,
            'This order changed. Refresh before sending your receipts.',
          );
        if (
          ['cancelled', 'completed'].includes(order.status) ||
          !['awaiting_receipt', 'needs_receipt'].includes(order.payment_status)
        )
          fail(
            409,
            'This order is not accepting receipts. Refresh your orders.',
          );
        const ids = activeReceiptIds(id);
        if (!ids.length) fail(400, 'Add at least one receipt before sending.');
        const now = new Date().toISOString();
        db.prepare(
          "UPDATE orders SET payment_status='pending_review',payment_review_note='',updated_at=?,version=version+1 WHERE id=?",
        ).run(now, id);
        db.prepare(
          'INSERT INTO payment_events(order_id,actor_id,decision,note,receipt_id,receipt_ids,created_at) VALUES(?,?,?,?,?,?,?)',
        ).run(
          id,
          user.id,
          'pending_review',
          '',
          order.receipt_id,
          JSON.stringify(ids),
          now,
        );
        return orderView(db.prepare('SELECT * FROM orders WHERE id=?').get(id));
      });
    },
    removeReceipt(user, id, receiptId, body) {
      if (user.role !== 'customer') fail(403, 'Customer access required.');
      integer(body.version, 1, Number.MAX_SAFE_INTEGER, 'Order version');
      return transaction(() => {
        const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
        if (!order || order.customer_id !== user.id)
          fail(404, 'Order not found.');
        if (order.version !== body.version)
          fail(409, 'This order changed. Refresh before removing a receipt.');
        if (
          ['cancelled', 'completed'].includes(order.status) ||
          !['awaiting_receipt', 'needs_receipt', 'pending_review'].includes(
            order.payment_status,
          )
        )
          fail(409, 'Receipts cannot be changed after payment is confirmed.');
        const receipt = db
          .prepare(
            'SELECT id FROM receipts WHERE id=? AND order_id=? AND active=1',
          )
          .get(receiptId, id);
        if (!receipt) fail(404, 'Receipt not found.');
        // Keep the private photo and review history; exclude it from the next review.
        db.prepare('UPDATE receipts SET active=0 WHERE id=?').run(receiptId);
        const ids = activeReceiptIds(id);
        const now = new Date().toISOString();
        db.prepare(
          "UPDATE orders SET receipt_id=?,payment_status='awaiting_receipt',updated_at=?,version=version+1 WHERE id=?",
        ).run(ids.at(-1) ?? null, now, id);
        db.prepare(
          'INSERT INTO payment_events(order_id,actor_id,decision,note,receipt_id,receipt_ids,created_at) VALUES(?,?,?,?,?,?,?)',
        ).run(
          id,
          user.id,
          'receipt_removed',
          '',
          receiptId,
          JSON.stringify([receiptId]),
          now,
        );
        return orderView(db.prepare('SELECT * FROM orders WHERE id=?').get(id));
      });
    },
    reviewPayment(owner, id, body) {
      if (owner.role !== 'owner') fail(403, 'Owner access required.');
      integer(body.version, 1, Number.MAX_SAFE_INTEGER, 'Order version');
      if (!['confirmed', 'needs_receipt'].includes(body.decision))
        fail(400, 'Choose confirm payment or request a new receipt.');
      const note = text(
        body.note ?? '',
        body.decision === 'needs_receipt' ? 5 : 0,
        500,
        'Review note',
      );
      return transaction(() => {
        const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
        if (!order) fail(404, 'Order not found.');
        if (order.version !== body.version)
          fail(409, 'This order changed. Refresh before reviewing payment.');
        if (
          order.payment_status !== 'pending_review' ||
          !activeReceiptIds(id).length ||
          ['cancelled', 'completed'].includes(order.status)
        )
          fail(409, 'This payment is not waiting for review.');
        const now = new Date().toISOString();
        db.prepare(
          'UPDATE orders SET payment_status=?,payment_review_note=?,updated_at=?,version=version+1 WHERE id=?',
        ).run(body.decision, note, now, id);
        db.prepare(
          'INSERT INTO payment_events(order_id,actor_id,decision,note,receipt_id,receipt_ids,created_at) VALUES(?,?,?,?,?,?,?)',
        ).run(
          id,
          owner.id,
          body.decision,
          note,
          order.receipt_id,
          JSON.stringify(activeReceiptIds(id)),
          now,
        );
        return orderView(db.prepare('SELECT * FROM orders WHERE id=?').get(id));
      });
    },
    orderDirectory(
      user,
      {
        customerId = null,
        page = 1,
        pageSize = 25,
        status = 'all',
        search = '',
      } = {},
    ) {
      expireReservations();
      if (customerId !== null) {
        requireManager(user);
        if (
          !db
            .prepare("SELECT 1 FROM users WHERE id=? AND role='customer'")
            .get(customerId)
        )
          fail(404, 'Customer not found.');
      }
      integer(page, 1, 1_000_000, 'Page');
      integer(pageSize, 1, 200, 'Page size');
      if (!['all', 'receipt-review', ...statuses].includes(status))
        fail(400, 'Choose a valid order status.');
      search = text(search, 0, 100, 'Order search');
      const selected = user.role === 'owner' ? customerId : user.id;
      const where = `(? IS NULL OR o.customer_id=?) AND
        (?='all' OR (?='receipt-review' AND o.payment_status='pending_review' AND o.status NOT IN ('cancelled','completed')) OR o.status=?) AND
        (?='' OR instr(lower(o.id),lower(?))>0)`;
      const args = [selected, selected, status, status, status, search, search];
      const total = db
        .prepare(`SELECT COUNT(*) AS n FROM orders o WHERE ${where}`)
        .get(...args).n;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      page = Math.min(page, pages);
      const orders = db
        .prepare(
          `SELECT o.*,u.name AS customer_name,u.email AS customer_email FROM orders o JOIN users u ON u.id=o.customer_id
            WHERE ${where} ORDER BY o.created_at DESC,o.id DESC LIMIT ? OFFSET ?`,
        )
        .all(...args, pageSize, (page - 1) * pageSize)
        .map(orderView);
      const summary = db
        .prepare(`SELECT COUNT(*) AS total,
        COALESCE(SUM(status='pending'),0) AS pending,
        COALESCE(SUM(payment_status='pending_review' AND status NOT IN ('cancelled','completed')),0) AS paymentsToCheck,
        COALESCE(SUM(CASE WHEN status='completed' THEN total ELSE 0 END),0) AS completedTotal
        FROM orders WHERE (? IS NULL OR customer_id=?)`)
        .get(selected, selected);
      return { orders, total, page, pages, pageSize, summary };
    },
    orders(user, customerId = null) {
      return this.orderDirectory(user, { customerId, pageSize: 200 }).orders;
    },
    resolveSubmission(user, key) {
      if (user.role !== 'customer') fail(403, 'Customer access required.');
      key = text(key, 8, 80, 'Order submission key');
      expireReservations();
      return transaction(() => {
        const row = db
          .prepare(
            'SELECT * FROM orders WHERE customer_id=? AND idempotency_key=?',
          )
          .get(user.id, key);
        if (row) return { order: orderView(row) };
        // Closing an absent key in the same transaction prevents a delayed POST
        // from creating an order after recovery has reported "not placed".
        db.prepare(
          'DELETE FROM closed_order_submissions WHERE created_at<?',
        ).run(new Date(clock() - 30 * 86400_000).toISOString());
        const existing = db
          .prepare(
            'SELECT 1 FROM closed_order_submissions WHERE customer_id=? AND submission_key=?',
          )
          .get(user.id, key);
        if (
          !existing &&
          db
            .prepare(
              'SELECT COUNT(*) AS n FROM closed_order_submissions WHERE customer_id=?',
            )
            .get(user.id).n >= 1000
        )
          fail(
            429,
            'Too many checkout recovery attempts. Contact SPL for help.',
          );
        db.prepare(
          'INSERT OR IGNORE INTO closed_order_submissions VALUES(?,?,?)',
        ).run(user.id, key, new Date(clock()).toISOString());
        return { order: null };
      });
    },
    placeOrder(user, body, key) {
      if (user.role !== 'customer')
        fail(403, 'Sign in with a customer account to order.');
      key = text(key, 8, 80, 'Order submission key');
      const delivery = validateDelivery(body.delivery);
      const paymentMethodId = text(
        body.paymentMethodId,
        36,
        36,
        'Payment method',
      );
      if (
        !Array.isArray(body.items) ||
        body.items.length < 1 ||
        body.items.length > 30
      )
        fail(400, 'Choose 1–30 products.');
      const seen = new Set();
      const lines = body.items
        .map((line) => {
          const id = integer(line.id, 1, 1_000_000_000, 'Product ID');
          if (seen.has(id)) fail(400, 'Duplicate product in order.');
          seen.add(id);
          return {
            id,
            quantity: integer(line.quantity, 1, 100, 'Quantity'),
            price: integer(line.price, 1, 1_000_000_000_000, 'Reviewed price'),
          };
        })
        .sort((a, b) => a.id - b.id);
      integer(body.expectedTotal, 1, Number.MAX_SAFE_INTEGER, 'Reviewed total');
      const hash = digest(
        JSON.stringify({
          lines,
          delivery,
          paymentMethodId,
          total: body.expectedTotal,
        }),
      );
      expireReservations();
      return transaction(() => {
        const previous = db
          .prepare(
            'SELECT * FROM orders WHERE customer_id=? AND idempotency_key=?',
          )
          .get(user.id, key);
        if (previous) {
          if (previous.request_hash !== hash)
            fail(409, 'This submission key belongs to another order.');
          return orderView(previous);
        }
        if (
          db
            .prepare(
              'SELECT 1 FROM closed_order_submissions WHERE customer_id=? AND submission_key=?',
            )
            .get(user.id, key)
        )
          fail(
            409,
            'This checkout attempt was closed. Review your cart and submit a new attempt.',
          );
        const unpaid = db
          .prepare(`SELECT COUNT(*) AS n FROM orders WHERE customer_id=?
          AND status NOT IN ('cancelled','completed')
          AND payment_status IN ('awaiting_receipt','needs_receipt','pending_review')`)
          .get(user.id).n;
        if (unpaid >= maxUnpaidOrders)
          fail(
            409,
            `You already have ${maxUnpaidOrders} unpaid orders. Open My orders or contact SPL before placing another.`,
          );
        const selectedMethod = db
          .prepare('SELECT * FROM payment_methods WHERE id=? AND active=1')
          .get(paymentMethodId);
        if (!selectedMethod)
          fail(
            409,
            'That payment method is unavailable. Choose another method.',
          );
        const paymentMethod = paymentMethodView(selectedMethod);
        const items = lines.map((line) => {
          const row = db
            .prepare('SELECT * FROM products WHERE id=? AND active=1')
            .get(line.id);
          if (!row || row.stock < line.quantity)
            fail(
              409,
              'Availability changed. Refresh your bag before ordering.',
            );
          if (row.price !== line.price)
            fail(
              409,
              'A price changed. Refresh your bag and review the new total.',
            );
          return {
            id: line.id,
            quantity: line.quantity,
            price: row.price,
            name: JSON.parse(row.details).name,
          };
        });
        const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
        if (total !== body.expectedTotal)
          fail(409, 'The total changed. Review your bag again.');
        for (const item of items)
          db.prepare(
            'UPDATE products SET stock=stock-?,version=version+1 WHERE id=?',
          ).run(item.quantity, item.id);
        const id = `SPL-${randomUUID().toUpperCase()}`;
        const now = new Date(clock()).toISOString();
        db.prepare(
          "INSERT INTO orders(id,customer_id,items,delivery,payment,total,created_at,updated_at,idempotency_key,request_hash,payment_method,payment_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,'awaiting_receipt')",
        ).run(
          id,
          user.id,
          JSON.stringify(items),
          JSON.stringify(delivery),
          paymentMethod.label,
          total,
          now,
          now,
          key,
          hash,
          JSON.stringify(paymentMethod),
        );
        db.prepare('UPDATE orders SET reservation_expires_at=? WHERE id=?').run(
          new Date(Date.parse(now) + reservationMinutes * 60_000).toISOString(),
          id,
        );
        db.prepare(
          'INSERT INTO order_events(order_id,actor_id,status,created_at) VALUES(?,?,?,?)',
        ).run(id, user.id, 'pending', now);
        return orderView(db.prepare('SELECT * FROM orders WHERE id=?').get(id));
      });
    },
    changeStatus(owner, id, body) {
      if (owner.role !== 'owner') fail(403, 'Owner access required.');
      integer(body.version, 1, Number.MAX_SAFE_INTEGER, 'Order version');
      return transaction(() => {
        const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
        if (!order) fail(404, 'Order not found.');
        if (order.version !== body.version)
          fail(409, 'This order changed. Refresh before updating it.');
        if (!nextStatuses[order.status].includes(body.status))
          fail(400, 'That status change is not allowed.');
        if (
          body.status === 'confirmed' &&
          !['confirmed', 'not_required'].includes(order.payment_status)
        )
          fail(
            409,
            'Confirm the payment receipt before confirming this order.',
          );
        if (body.status === 'cancelled') {
          for (const item of JSON.parse(order.items))
            db.prepare(
              'UPDATE products SET stock=stock+?,version=version+1 WHERE id=?',
            ).run(item.quantity, item.id);
        }
        const now = new Date().toISOString();
        db.prepare(
          'UPDATE orders SET status=?,updated_at=?,version=version+1 WHERE id=?',
        ).run(body.status, now, id);
        db.prepare(
          'INSERT INTO order_events(order_id,actor_id,status,created_at) VALUES(?,?,?,?)',
        ).run(id, owner.id, body.status, now);
        return orderView(db.prepare('SELECT * FROM orders WHERE id=?').get(id));
      });
    },
  };
}
