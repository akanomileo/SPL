import fs from 'node:fs';
import path from 'node:path';
export function loadRuntimeEnvironment(root) {
  const mode =
    process.env.NODE_ENV === 'production' ? 'production' : 'development';
  for (const name of [
    `.env.${mode}.local`,
    '.env.local',
    `.env.${mode}`,
    '.env',
  ]) {
    const filename = path.join(root, name);
    if (fs.existsSync(filename)) process.loadEnvFile(filename);
  }
}
