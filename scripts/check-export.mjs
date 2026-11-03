import fs from 'node:fs';
import path from 'node:path';

export function normalizeAndCheckExport(directory, basePath = '') {
  const root = path.resolve(directory);
  const base = basePath.replace(/\/$/, '');
  if (base && !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(base))
    throw new Error('Use a simple /repository-name base path.');
  // Some Vinext exports emit assetPrefix in the filesystem as well as in URLs.
  // A static host mounts this entire output at the prefix, so flatten only
  // the generated _next directory; keep the public URL prefix unchanged.
  if (base) {
    const nested = path.resolve(root, base.slice(1), '_next');
    const target = path.resolve(root, '_next');
    if (
      !nested.startsWith(root + path.sep) ||
      !target.startsWith(root + path.sep)
    )
      throw new Error('Unsafe generated asset path');
    if (fs.existsSync(nested)) {
      if (fs.existsSync(target))
        throw new Error('Conflicting generated asset directories');
      fs.renameSync(nested, target);
      const manifestFile = path.join(root, '.vite', 'manifest.json');
      if (fs.existsSync(manifestFile)) {
        const replace = (value) =>
          typeof value === 'string'
            ? value.replace(new RegExp(`^${base.slice(1)}/_next/`), '_next/')
            : Array.isArray(value)
              ? value.map(replace)
              : value && typeof value === 'object'
                ? Object.fromEntries(
                    Object.entries(value).map(([key, v]) => [key, replace(v)]),
                  )
                : value;
        fs.writeFileSync(
          manifestFile,
          JSON.stringify(
            replace(JSON.parse(fs.readFileSync(manifestFile, 'utf8'))),
            null,
            2,
          ),
        );
      }
    }
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  if (!html.includes('SHWE PYAE SAN'))
    throw new Error('Storefront HTML is missing');
  const urls = [
    ...html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/g),
  ]
    .map((match) => match[1])
    .filter((url) => url.startsWith('/') && !url.startsWith('//'));
  for (const url of urls) {
    if (base && !url.startsWith(`${base}/`))
      throw new Error(`Missing hosting prefix: ${url}`);
    const relative = decodeURIComponent(
      url.split('?')[0].slice(base.length),
    ).replace(/^\//, '');
    const file = path.resolve(root, relative);
    if (
      !file.startsWith(root + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    )
      throw new Error(`Missing exported asset: ${url}`);
  }
  console.log(
    `Static export verified: ${new Set(urls).size} referenced assets; base path ${base || '/'}.`,
  );
  fs.writeFileSync(
    path.join(root, 'site-config.json'),
    JSON.stringify({ basePath: base }),
  );
}
