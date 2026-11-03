import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const root = path.resolve(
  option('--dir', fileURLToPath(new URL('../dist/client', import.meta.url))),
);
const configFile = path.join(root, 'site-config.json');
const recordedBase = fs.existsSync(configFile)
  ? JSON.parse(fs.readFileSync(configFile, 'utf8')).basePath
  : '';
const base = option(
  '--base',
  process.env.NEXT_PUBLIC_BASE_PATH ?? recordedBase,
).replace(/\/$/, '');
const port = Number(option('--port', '4174'));
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid port');
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
  '.ico': 'image/x-icon',
};
if (!fs.existsSync(path.join(root, 'index.html')))
  throw new Error(`No index.html in ${root}. Run npm run build first.`);
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname,
    );
    if (base && pathname === base) {
      res.writeHead(302, { Location: `${base}/` });
      res.end();
      return;
    }
    if (base && !pathname.startsWith(`${base}/`)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const relative = pathname.slice(base.length);
    const file = path.resolve(
      root,
      `.${relative.endsWith('/') ? `${relative}index.html` : relative}`,
    );
    if (
      !file.startsWith(root + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`SPL preview: http://127.0.0.1:${port}${base}/`),
);
