import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../server/store.mjs';
import { loadRuntimeEnvironment } from '../server/environment.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
loadRuntimeEnvironment(root);
if (process.argv.length !== 3)
  throw new Error('Usage: npm run account:migrate -- existing-email@gmail.com');
const store = createStore(
  path.join(
    path.resolve(process.env.DATA_DIRECTORY ?? path.join(root, 'data')),
    'shop.sqlite',
  ),
);
try {
  store.authorizeGoogleMigration(process.argv[2]);
  console.log(
    'Approved this existing account for migration on its next verified Google sign-in. Its orders will be preserved.',
  );
} finally {
  store.close();
}
