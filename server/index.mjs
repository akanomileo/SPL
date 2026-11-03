import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRuntimeEnvironment } from '../server/environment.mjs';
import { createBackend } from './http.mjs';
import { googleConfiguration } from './google.mjs';
import { trustedProxyIPs } from './client-address.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
loadRuntimeEnvironment(root);
const port = Number(process.env.PORT ?? 4174);
const production = process.env.NODE_ENV === 'production';
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be 1–65535.');
const configuredOrigin = process.env.PUBLIC_ORIGIN?.trim();
let origin;
if (configuredOrigin) {
  const parsed = new URL(configuredOrigin);
  if (
    !['https:', 'http:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(
      'PUBLIC_ORIGIN must be the domain root URL without credentials, query or fragment.',
    );
  origin = parsed.origin;
}
if (production && (!origin || new URL(origin).protocol !== 'https:'))
  throw new Error(
    'Set PUBLIC_ORIGIN to the full HTTPS domain root for production.',
  );
const allowedOrigins = origin ? [origin] : [];
if (!production)
  allowedOrigins.push(
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  );
const data = path.resolve(
  process.env.DATA_DIRECTORY ?? path.join(root, 'data'),
);
const { server, store } = createBackend({
  databasePath: path.join(data, 'shop.sqlite'),
  staticDirectory: path.join(root, 'dist/client'),
  uploadDirectory: path.join(data, 'uploads'),
  allowedOrigins,
  secureCookies: production,
  google: googleConfiguration(process.env),
  trustedProxyIPs: trustedProxyIPs(process.env.TRUSTED_PROXY_IPS),
  proxySecret: process.env.VERCEL_PROXY_SECRET ?? '',
  storeOptions: {
    reservationMinutes: Number(process.env.RESERVATION_MINUTES ?? 1440),
    maxUnpaidOrders: Number(process.env.MAX_UNPAID_ORDERS ?? 3),
    maxReceiptFiles: Number(process.env.MAX_ORDER_RECEIPT_FILES ?? 60),
    maxReceiptBytes:
      Number(process.env.MAX_ORDER_RECEIPT_MB ?? 120) * 1024 * 1024,
    maxCustomerReceiptBytes:
      Number(process.env.MAX_CUSTOMER_RECEIPT_MB ?? 512) * 1024 * 1024,
    maxShopReceiptBytes:
      Number(process.env.MAX_RECEIPT_STORAGE_MB ?? 5120) * 1024 * 1024,
    receiptUploadsPerHour: Number(process.env.RECEIPT_UPLOADS_PER_HOUR ?? 40),
  },
});
server.listen(port, process.env.HOST ?? '127.0.0.1', () =>
  console.log(
    `SPL connected shop running on port ${port}. Customer: / | Account: /account/ | Owner: /owner/`,
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
