import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeAndCheckExport } from './check-export.mjs';
import { loadDotenv } from 'vinext/internal/config/dotenv';
import { validateSiteUrl, writeDiscoveryFiles } from './site-config.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const outputDirectory = fileURLToPath(new URL('../dist', import.meta.url));
const outputIndex = fileURLToPath(
  new URL('../dist/client/index.html', import.meta.url),
);
const vinextCli = fileURLToPath(
  new URL('../node_modules/vinext/dist/cli.js', import.meta.url),
);

loadDotenv({ root: projectRoot, mode: 'production' });
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');
if (basePath && !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(basePath)) {
  throw new Error(
    'NEXT_PUBLIC_BASE_PATH must be empty or a simple /repository-name path.',
  );
}
if (basePath)
  throw new Error(
    'The connected shop must be hosted at a domain root; leave NEXT_PUBLIC_BASE_PATH empty.',
  );
process.env.NEXT_PUBLIC_BASE_PATH = basePath;
const siteUrl = validateSiteUrl(process.env.NEXT_PUBLIC_SITE_URL, basePath);
process.env.NEXT_PUBLIC_SITE_URL = siteUrl;
if (!siteUrl)
  console.log(
    'Portable build: no domain-specific canonical URL or sitemap. Set NEXT_PUBLIC_SITE_URL to enable them.',
  );

rmSync(outputDirectory, { recursive: true, force: true });

const cliArgs =
  process.platform === 'win32'
    ? [
        '--import',
        new URL('./graceful-cli-exit.mjs', import.meta.url).href,
        vinextCli,
        'build',
      ]
    : [vinextCli, 'build'];
const result = spawnSync(process.execPath, cliArgs, {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
  timeout: 180000,
});

if (result.error) {
  throw result.error;
}

if (result.status === 0) {
  if (!existsSync(outputIndex)) {
    console.error('Build completed without the expected static entry page.');
    process.exit(1);
  }
  normalizeAndCheckExport(
    fileURLToPath(new URL('../dist/client', import.meta.url)),
    process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  );
  writeDiscoveryFiles(
    fileURLToPath(new URL('../dist/client', import.meta.url)),
    siteUrl,
  );
  process.exit(0);
}

console.error(
  `Build failed${result.signal ? ` (${result.signal})` : ''}; output was not accepted.`,
);
process.exit(result.status ?? 1);
