import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { createStore, HttpError } from './store.mjs';
import { createGoogleAuth } from './google.mjs';
import { clientAddress } from './client-address.mjs';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.rsc': 'text/x-component',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.ico': 'image/x-icon',
};
const json = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
};
const fail = (status, message) => {
  throw new HttpError(status, message);
};
async function readBody(req, max = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) fail(413, 'Request is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function readJson(req) {
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json'))
    fail(415, 'JSON content required.');
  try {
    const body = JSON.parse((await readBody(req)).toString());
    if (!body || typeof body !== 'object' || Array.isArray(body))
      fail(400, 'Invalid JSON request.');
    return body;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    fail(400, 'Invalid JSON request.');
  }
}
const imageType = (bytes) => {
  const dimensions = (width, height) => {
    if (
      !width ||
      !height ||
      width > 10000 ||
      height > 10000 ||
      width * height > 40_000_000
    )
      fail(400, 'Choose an image with reasonable dimensions, up to 3 MB.');
  };
  if (
    bytes.length >= 45 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    if (
      bytes.readUInt32BE(8) !== 13 ||
      bytes.subarray(12, 16).toString() !== 'IHDR'
    )
      fail(400, 'The PNG image is damaged.');
    dimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
    let offset = 8;
    let hasData = false;
    let ended = false;
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset);
      if (size > bytes.length - offset - 12)
        fail(400, 'The PNG image is damaged.');
      const type = bytes.subarray(offset + 4, offset + 8).toString();
      let crc = 0xffffffff;
      for (let i = offset + 4; i < offset + 8 + size; i++) {
        crc ^= bytes[i];
        for (let bit = 0; bit < 8; bit++)
          crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
      if ((crc ^ 0xffffffff) >>> 0 !== bytes.readUInt32BE(offset + 8 + size))
        fail(400, 'The PNG image is damaged.');
      if (type === 'IDAT' && size > 0) hasData = true;
      offset += size + 12;
      if (type === 'IEND') {
        ended = size === 0 && offset === bytes.length;
        break;
      }
    }
    if (!hasData || !ended) fail(400, 'The PNG image is incomplete.');
    return { ext: 'png', mime: 'image/png' };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[bytes.length - 2] === 255 &&
    bytes[bytes.length - 1] === 217
  ) {
    let offset = 2;
    let sized = false;
    let scanned = false;
    while (offset < bytes.length - 2) {
      if (bytes[offset++] !== 255) fail(400, 'The JPG image is damaged.');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda) {
        scanned = true;
        break;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) fail(400, 'The JPG image is damaged.');
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length)
        fail(400, 'The JPG image is damaged.');
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (length < 8) fail(400, 'The JPG image is damaged.');
        dimensions(
          bytes.readUInt16BE(offset + 5),
          bytes.readUInt16BE(offset + 3),
        );
        sized = true;
      }
      offset += length;
    }
    if (!sized || !scanned) fail(400, 'The JPG image is incomplete.');
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (
    bytes.length >= 20 &&
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP' &&
    bytes.readUInt32LE(4) + 8 === bytes.length
  ) {
    let offset = 12;
    let sized = false;
    while (offset + 8 <= bytes.length) {
      const type = bytes.subarray(offset, offset + 4).toString();
      const length = bytes.readUInt32LE(offset + 4);
      const start = offset + 8;
      if (length > bytes.length - start)
        fail(400, 'The WebP image is damaged.');
      if (
        type === 'VP8 ' &&
        length >= 10 &&
        bytes.subarray(start + 3, start + 6).equals(Buffer.from([157, 1, 42]))
      ) {
        dimensions(
          bytes.readUInt16LE(start + 6) & 0x3fff,
          bytes.readUInt16LE(start + 8) & 0x3fff,
        );
        sized = true;
      } else if (type === 'VP8L' && length >= 5 && bytes[start] === 47) {
        const bits = bytes.readUInt32LE(start + 1);
        dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
        sized = true;
      }
      offset = start + length + (length & 1);
    }
    if (!sized || offset !== bytes.length)
      fail(400, 'The WebP image is incomplete.');
    return { ext: 'webp', mime: 'image/webp' };
  }
  fail(400, 'Choose a JPG, PNG or WebP image, up to 3 MB.');
};
const equal = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const getToken = (req) =>
  String(req.headers.cookie ?? '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('spl_session='))
    ?.slice(12);

export function createBackend({
  databasePath,
  staticDirectory,
  uploadDirectory,
  receiptDirectory = path.join(path.dirname(databasePath), 'receipts'),
  allowedOrigins,
  secureCookies = false,
  google = null,
  googleTransport = {},
  trustedProxyIPs = [],
  proxySecret = '',
  storeOptions = {},
}) {
  const receiptRoot = path.resolve(receiptDirectory);
  // Compare canonical locations so an upload/static directory junction cannot expose receipts.
  const canonicalPath = (location) => {
    if (fs.existsSync(location)) return fs.realpathSync(location);
    const parent = path.dirname(location);
    return parent === location
      ? location
      : path.join(canonicalPath(parent), path.basename(location));
  };
  const inside = (location, root) => {
    const relative = path.relative(root, location);
    return (
      !relative ||
      (!relative.startsWith('..' + path.sep) &&
        relative !== '..' &&
        !path.isAbsolute(relative))
    );
  };
  const checkPrivateLocation = () => {
    const canonicalReceipt = canonicalPath(receiptRoot);
    for (const publicRoot of [staticDirectory, uploadDirectory])
      if (inside(canonicalReceipt, canonicalPath(path.resolve(publicRoot))))
        throw new Error(
          'Receipt storage must be outside public files and uploads.',
        );
  };
  checkPrivateLocation();
  const privateReceiptDirectory = () => {
    checkPrivateLocation();
    fs.mkdirSync(receiptRoot, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(receiptRoot).isSymbolicLink())
      throw new Error(
        'Receipt storage must use a private directory without symbolic links.',
      );
    fs.chmodSync(receiptRoot, 0o700);
  };
  const store = createStore(databasePath, storeOptions);
  store.expireReservations();
  const googleAuth = createGoogleAuth(store, google, googleTransport);
  const googleCookie = (binding, maxAge = 600) =>
    `spl_google=${binding}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
  const rates = new Map();
  const limitAuth = (req) => {
    const forwardedClient = req.headers['x-spl-client-ip'];
    const ip =
      proxySecret &&
      equal(req.headers['x-vercel-proxy-secret'], proxySecret) &&
      typeof forwardedClient === 'string' &&
      isIP(forwardedClient)
        ? forwardedClient
        : clientAddress(req, trustedProxyIPs);
    const now = Date.now();
    if (rates.size > 2000) {
      for (const [key, entry] of rates)
        if (entry.until <= now) rates.delete(key);
      if (rates.size > 2000) fail(429, 'Please try again later.');
    }
    const rate = rates.get(ip) ?? { count: 0, until: now + 15 * 60_000 };
    if (rate.until <= now) {
      rate.count = 0;
      rate.until = now + 15 * 60_000;
    }
    rate.count++;
    rates.set(ip, rate);
    if (rate.count > 30)
      fail(429, 'Too many sign-in attempts. Please try again in 15 minutes.');
  };
  const cookie = (res, token, maxAge = 604800) =>
    res.setHeader(
      'Set-Cookie',
      `spl_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`,
    );
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      const requestUrl = new URL(req.url, 'http://local');
      const pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname.startsWith('/api/')) {
        if (
          proxySecret &&
          !equal(req.headers['x-vercel-proxy-secret'], proxySecret)
        )
          fail(403, 'Request proxy validation failed.');
        const token = getToken(req);
        let session = store.session(token);
        if (
          session &&
          (session.provider !== 'google' ||
            !google ||
            (session.user.role === 'owner' &&
              !store.isCurrentOwner(session.user.id)))
        ) {
          store.revokeSession(token);
          session = null;
        }
        if (
          !['GET', 'HEAD'].includes(req.method) &&
          !allowedOrigins.includes(req.headers.origin)
        )
          fail(403, 'Request origin is not allowed.');
        const authenticated = () => {
          if (!session) fail(401, 'Please sign in.');
          return session.user;
        };
        const owner = () => {
          const user = authenticated();
          if (user.role !== 'owner') fail(403, 'Owner access required.');
          return user;
        };
        const mutation = () => {
          const user = authenticated();
          if (!equal(req.headers['x-csrf-token'], session.csrf))
            fail(403, 'Session validation failed. Refresh and try again.');
          return user;
        };
        if (pathname === '/api/auth/google/config' && req.method === 'GET')
          return json(res, 200, {
            enabled: Boolean(google),
            ownerEnabled: Boolean(
              google &&
              (store.ownerInfo().configured || store.ownerInfo().pending),
            ),
            ownerSetupRequired: !store.ownerInfo().configured,
          });
        if (pathname === '/api/auth/google/callback' && req.method === 'GET') {
          const binding = String(req.headers.cookie ?? '')
            .split(';')
            .map((v) => v.trim())
            .find((v) => v.startsWith('spl_google='))
            ?.slice(11);
          res.setHeader('Set-Cookie', googleCookie('', 0));
          try {
            const result = await googleAuth.finish({
              state: requestUrl.searchParams.get('state'),
              binding,
              code: requestUrl.searchParams.get('code'),
              error: requestUrl.searchParams.get('error'),
            });
            store.revokeSession(token);
            const auth = store.newSession(result.user.id, 'google');
            cookie(res, auth.token);
            res.setHeader('Set-Cookie', [
              res.getHeader('Set-Cookie'),
              googleCookie('', 0),
            ]);
            res.writeHead(303, {
              Location: result.destination,
              'Cache-Control': 'no-store',
            });
            return res.end();
          } catch (error) {
            const message =
              error instanceof HttpError
                ? error.message
                : 'Google sign-in is temporarily unavailable. Please try again.';
            res.writeHead(303, {
              Location: '/account/?authError=' + encodeURIComponent(message),
              'Cache-Control': 'no-store',
            });
            return res.end();
          }
        }
        if (
          pathname === '/api/auth/google/start' &&
          ['GET', 'POST'].includes(req.method)
        ) {
          limitAuth(req);
          const body = req.method === 'POST' ? await readJson(req) : {};
          const audience =
            body.audience ??
            requestUrl.searchParams.get('audience') ??
            'customer';
          const flow = googleAuth.start({
            audience,
            setupCode: body.setupCode,
            returnTo:
              body.returnTo ?? requestUrl.searchParams.get('returnTo') ?? '/',
          });
          res.setHeader('Set-Cookie', googleCookie(flow.binding));
          if (req.method === 'POST') return json(res, 200, { url: flow.url });
          res.writeHead(302, {
            Location: flow.url,
            'Cache-Control': 'no-store',
          });
          return res.end();
        }
        if (pathname === '/api/shop-visit' && req.method === 'POST') {
          const body = await readJson(req);
          if (
            session?.user.role === 'owner' ||
            req.headers.dnt === '1' ||
            /bot|spider|crawler|headless|preview/i.test(
              String(req.headers['user-agent'] ?? ''),
            )
          )
            return json(res, 200, { ok: true });
          const saved = String(req.headers.cookie ?? '')
            .split(';')
            .map((v) => v.trim())
            .find((v) => v.startsWith('spl_visit='))
            ?.slice(10);
          let [visitor, signature] = (saved ?? '').split('.');
          if (
            !/^[a-f0-9]{64}$/.test(visitor ?? '') ||
            !equal(signature, store.visitorSignature(visitor))
          ) {
            visitor = randomBytes(32).toString('hex');
            signature = store.visitorSignature(visitor);
            res.setHeader(
              'Set-Cookie',
              `spl_visit=${visitor}.${signature}; HttpOnly; SameSite=Lax; Path=/api/shop-visit; Max-Age=2592000${secureCookies ? '; Secure' : ''}`,
            );
          }
          store.recordShopVisit(visitor, body.viewId);
          return json(res, 200, { ok: true });
        }
        if (pathname === '/api/owner/accounts' && req.method === 'GET') {
          return json(
            res,
            200,
            store.customerAccounts(owner(), {
              search: requestUrl.searchParams.get('search') ?? '',
              status: requestUrl.searchParams.get('status') ?? 'all',
              page: Number(requestUrl.searchParams.get('page') ?? '1'),
            }),
          );
        }
        const accountMatch = pathname.match(
          /^\/api\/owner\/accounts\/([a-f0-9-]{36})$/,
        );
        if (accountMatch && req.method === 'PUT') {
          owner();
          return json(res, 200, {
            account: store.setCustomerStatus(
              mutation(),
              accountMatch[1],
              await readJson(req),
            ),
          });
        }
        if (pathname === '/api/owner/analytics' && req.method === 'GET') {
          return json(
            res,
            200,
            store.shopAnalytics(
              owner(),
              Number(requestUrl.searchParams.get('days') ?? '30'),
            ),
          );
        }
        if (pathname === '/api/health' && req.method === 'GET')
          return json(res, 200, { ok: true });
        if (pathname === '/api/catalog' && req.method === 'GET') {
          return json(res, 200, {
            products: store.catalog(),
            brands: store.brands(),
          });
        }
        if (pathname === '/api/payment-methods' && req.method === 'GET')
          return json(res, 200, { paymentMethods: store.paymentMethods() });
        if (pathname === '/api/auth/session' && req.method === 'GET')
          return json(res, 200, {
            user: session?.user ?? null,
            csrf: session?.csrf ?? null,
          });
        if (
          [
            '/api/auth/login',
            '/api/auth/register',
            '/api/auth/google/link',
          ].includes(pathname)
        )
          fail(
            410,
            'Use Google sign-in. Password login and registration are disabled.',
          );
        if (pathname === '/api/auth/logout' && req.method === 'POST') {
          mutation();
          store.revokeSession(token);
          cookie(res, '', 0);
          return json(res, 200, { ok: true });
        }
        if (pathname === '/api/orders' && req.method === 'GET') {
          const user = authenticated();
          if (user.role !== 'customer') fail(403, 'Customer access required.');
          return json(
            res,
            200,
            store.orderDirectory(user, {
              page: Number(requestUrl.searchParams.get('page') ?? '1'),
              pageSize: Number(requestUrl.searchParams.get('pageSize') ?? '25'),
              status: requestUrl.searchParams.get('status') ?? 'all',
              search: requestUrl.searchParams.get('search') ?? '',
            }),
          );
        }
        if (pathname === '/api/orders/recover' && req.method === 'POST') {
          const user = mutation();
          const body = await readJson(req);
          return json(res, 200, store.resolveSubmission(user, body.key));
        }
        if (pathname === '/api/orders' && req.method === 'POST') {
          const user = mutation();
          const result = store.placeOrder(
            user,
            await readJson(req),
            req.headers['idempotency-key'],
          );
          return json(res, 201, { order: result });
        }
        const receiptMatch = pathname.match(
          /^\/api\/orders\/(SPL-[A-F0-9-]+)\/receipt(-draft)?$/,
        );
        if (receiptMatch && req.method === 'POST') {
          const user = mutation();
          if (user.role !== 'customer') fail(403, 'Customer access required.');
          store.receiptOrder(user, receiptMatch[1]);
          const bytes = await readBody(req, 3 * 1024 * 1024);
          store.receiptUploadAllowance(user, receiptMatch[1], bytes.length);
          const type = imageType(bytes);
          privateReceiptDirectory();
          const id = randomUUID();
          const fileName = `${id}.${type.ext}`;
          const filename = path.join(receiptRoot, fileName);
          fs.writeFileSync(filename, bytes, { mode: 0o600, flag: 'wx' });
          try {
            const order = store.addReceipt(
              user,
              receiptMatch[1],
              {
                id,
                fileName,
                mime: type.mime,
                size: bytes.length,
              },
              Boolean(receiptMatch[2]),
            );
            return json(res, 201, { order });
          } catch (error) {
            fs.rmSync(filename, { force: true });
            throw error;
          }
        }
        const receiptImageMatch = pathname.match(
          /^\/api\/orders\/(SPL-[A-F0-9-]+)\/receipts\/([a-f0-9-]{36})$/,
        );
        const submitReceiptsMatch = pathname.match(
          /^\/api\/orders\/(SPL-[A-F0-9-]+)\/receipts\/submit$/,
        );
        if (submitReceiptsMatch && req.method === 'POST')
          return json(res, 200, {
            order: store.submitReceipts(
              mutation(),
              submitReceiptsMatch[1],
              await readJson(req),
            ),
          });
        if (receiptImageMatch && req.method === 'DELETE')
          return json(res, 200, {
            order: store.removeReceipt(
              mutation(),
              receiptImageMatch[1],
              receiptImageMatch[2],
              await readJson(req),
            ),
          });
        if (receiptImageMatch && ['GET', 'HEAD'].includes(req.method)) {
          const receipt = store.receiptFile(
            authenticated(),
            receiptImageMatch[1],
            receiptImageMatch[2],
          );
          privateReceiptDirectory();
          const filename = path.join(receiptRoot, receipt.file_name);
          if (
            !/^[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(receipt.file_name) ||
            !fs.existsSync(filename) ||
            fs.lstatSync(filename).isSymbolicLink()
          )
            fail(404, 'Receipt not found.');
          res.writeHead(200, {
            'Content-Type': receipt.mime,
            'Cache-Control': 'private, no-store',
            'Content-Disposition': 'inline',
          });
          if (req.method === 'HEAD') return res.end();
          return fs.createReadStream(filename).pipe(res);
        }
        if (pathname === '/api/owner/payment-methods' && req.method === 'GET') {
          owner();
          return json(res, 200, { paymentMethods: store.paymentMethods(true) });
        }
        const methodMatch = pathname.match(
          /^\/api\/owner\/payment-methods\/([a-f0-9-]{36})$/,
        );
        if (
          (pathname === '/api/owner/payment-methods' &&
            req.method === 'POST') ||
          (methodMatch && req.method === 'PATCH')
        ) {
          mutation();
          owner();
          const body = await readJson(req);
          if (body.qrImage) {
            const name =
              typeof body.qrImage === 'string'
                ? body.qrImage.match(
                    /^\/uploads\/([a-f0-9-]{36}\.(?:jpg|png|webp))$/,
                  )?.[1]
                : null;
            if (
              !name ||
              !fs.existsSync(path.join(uploadDirectory, name)) ||
              fs.lstatSync(path.join(uploadDirectory, name)).isSymbolicLink()
            )
              fail(
                400,
                'Upload the QR image before saving this payment method.',
              );
          }
          return json(res, methodMatch ? 200 : 201, {
            paymentMethod: store.savePaymentMethod(
              methodMatch?.[1] ?? null,
              body,
            ),
          });
        }
        const paymentReviewMatch = pathname.match(
          /^\/api\/owner\/orders\/(SPL-[A-F0-9-]+)\/payment$/,
        );
        if (paymentReviewMatch && req.method === 'POST') {
          mutation();
          return json(res, 200, {
            order: store.reviewPayment(
              owner(),
              paymentReviewMatch[1],
              await readJson(req),
            ),
          });
        }
        if (pathname === '/api/owner/brands' && req.method === 'GET') {
          owner();
          return json(res, 200, { brands: store.brands() });
        }
        if (pathname === '/api/owner/brands' && req.method === 'POST') {
          mutation();
          const name = store.addBrand(owner(), await readJson(req));
          return json(res, 200, { name, brands: store.brands() });
        }
        if (pathname === '/api/owner/brands' && req.method === 'DELETE') {
          mutation();
          store.removeBrand(owner(), await readJson(req));
          return json(res, 200, { brands: store.brands() });
        }
        if (pathname === '/api/owner/products' && req.method === 'GET') {
          owner();
          return json(res, 200, {
            products: store.catalog(true),
            brands: store.brands(),
          });
        }
        if (pathname === '/api/owner/products' && req.method === 'POST') {
          mutation();
          owner();
          return json(res, 201, {
            product: store.saveProduct(null, await readJson(req)),
          });
        }
        const productMatch = pathname.match(/^\/api\/owner\/products\/(\d+)$/);
        if (productMatch && req.method === 'PUT') {
          mutation();
          owner();
          return json(res, 200, {
            product: store.saveProduct(
              Number(productMatch[1]),
              await readJson(req),
            ),
          });
        }
        if (pathname === '/api/owner/orders' && req.method === 'GET') {
          return json(
            res,
            200,
            store.orderDirectory(owner(), {
              customerId: requestUrl.searchParams.get('customerId'),
              page: Number(requestUrl.searchParams.get('page') ?? '1'),
              pageSize: Number(requestUrl.searchParams.get('pageSize') ?? '25'),
              status: requestUrl.searchParams.get('status') ?? 'all',
              search: requestUrl.searchParams.get('search') ?? '',
            }),
          );
        }
        const orderMatch = pathname.match(
          /^\/api\/owner\/orders\/(SPL-[A-F0-9-]+)$/,
        );
        if (orderMatch && req.method === 'PUT') {
          mutation();
          const user = owner();
          return json(res, 200, {
            order: store.changeStatus(user, orderMatch[1], await readJson(req)),
          });
        }
        if (pathname === '/api/owner/images' && req.method === 'POST') {
          mutation();
          owner();
          const bytes = await readBody(req, 3 * 1024 * 1024);
          const { ext } = imageType(bytes);
          fs.mkdirSync(uploadDirectory, { recursive: true, mode: 0o700 });
          const name = `${randomUUID()}.${ext}`;
          fs.writeFileSync(path.join(uploadDirectory, name), bytes, {
            mode: 0o600,
          });
          return json(res, 201, { image: `/uploads/${name}` });
        }
        fail(404, 'API endpoint not found.');
      }
      if (!['GET', 'HEAD'].includes(req.method))
        fail(405, 'Method not allowed.');
      let file;
      let root;
      if (/^\/uploads\/[a-f0-9-]+\.(?:jpg|png|webp)$/.test(pathname)) {
        root = path.resolve(uploadDirectory);
        file = path.join(root, path.basename(pathname));
        if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink())
          fail(404, 'Not found.');
      } else {
        root = path.resolve(staticDirectory);
        file = path.resolve(root, '.' + pathname);
        if (!file.startsWith(root + path.sep) && file !== root)
          fail(404, 'Not found.');
        if (fs.existsSync(file) && fs.statSync(file).isDirectory())
          file = path.join(file, 'index.html');
        if (
          !fs.existsSync(file) &&
          !path.extname(file) &&
          fs.existsSync(file + '.html')
        )
          file += '.html';
      }
      if (
        (req.headers.rsc === '1' || requestUrl.searchParams.has('_rsc')) &&
        file.endsWith('.html')
      )
        file = fs.existsSync(file.slice(0, -5) + '.txt')
          ? file.slice(0, -5) + '.txt'
          : file.slice(0, -5) + '.rsc';
      if (
        !file.startsWith(root + path.sep) ||
        !fs.existsSync(file) ||
        !fs.statSync(file).isFile()
      )
        fail(404, 'Not found.');
      res.writeHead(200, {
        'Content-Type': /(?:index|account|owner)\.txt$/.test(file)
          ? 'text/x-component'
          : (mime[path.extname(file)] ?? 'application/octet-stream'),
        'Cache-Control': pathname.startsWith('/_next/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      if (!(error instanceof HttpError))
        console.error(
          'SPL request failed:',
          req.method,
          String(req.url).split('?')[0],
          error instanceof Error ? error.name : 'UnknownError',
        );
      if (!res.headersSent)
        json(res, error instanceof HttpError ? error.status : 500, {
          error:
            error instanceof HttpError
              ? error.message
              : 'Server error. Please try again.',
        });
      else res.end();
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  const maintenance = setInterval(() => {
    try {
      store.expireReservations();
    } catch {
      console.error(
        'SPL reservation maintenance failed. Check database and disk availability.',
      );
    }
  }, 60_000);
  maintenance.unref();
  server.on('close', () => clearInterval(maintenance));
  return { server, store };
}
