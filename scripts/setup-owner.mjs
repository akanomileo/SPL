import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../server/store.mjs';
import { loadRuntimeEnvironment } from '../server/environment.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
loadRuntimeEnvironment(root);
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--replace'))
  throw new Error('Usage: npm run owner:setup [-- --replace]');
const store = createStore(
  path.join(
    path.resolve(process.env.DATA_DIRECTORY ?? path.join(root, 'data')),
    'shop.sqlite',
  ),
);
try {
  const code = store.createOwnerSetup(args.includes('--replace'));
  console.log('Private owner setup code (expires in 24 hours):\n' + code);
  console.log(
    'Open /owner/ and enter this code once, then choose your Google account. Keep this code private.',
  );
} finally {
  store.close();
}
