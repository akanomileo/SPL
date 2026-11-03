const maxRequestBytes = 4 * 1024 * 1024;
const hopByHopHeaders = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

async function requestBytes(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxRequestBytes) {
      const error = new Error('Request body exceeds the Vercel proxy limit.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function proxyToShop(req, res, { uploads = false } = {}) {
  const backendOrigin = process.env.BACKEND_ORIGIN?.trim();
  const proxySecret = process.env.VERCEL_PROXY_SECRET?.trim();
  if (!backendOrigin || !proxySecret) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: 'Shop backend is not configured. Set its Vercel environment variables.',
      }),
    );
    return;
  }

  let origin;
  try {
    origin = new URL(backendOrigin);
  } catch {
    res.statusCode = 500;
    res.end('BACKEND_ORIGIN must be a full HTTPS origin.');
    return;
  }
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    res.statusCode = 500;
    res.end('BACKEND_ORIGIN must be a full HTTPS origin.');
    return;
  }

  try {
    const incoming = new URL(req.url ?? '/', 'https://vercel.invalid');
    const route = uploads
      ? incoming.pathname.replace(/^\/api\/uploads(?=\/|$)/, '/uploads')
      : incoming.pathname;
    const target = new URL(route + incoming.search, origin);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (
        value === undefined ||
        hopByHopHeaders.has(name.toLowerCase()) ||
        name.toLowerCase().startsWith('x-vercel-') ||
        name.toLowerCase() === 'x-spl-client-ip'
      )
        continue;
      headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    headers.set('x-vercel-proxy-secret', proxySecret);
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      const clientIp = forwarded.split(',')[0].trim();
      if (clientIp) headers.set('x-spl-client-ip', clientIp);
    }

    const method = (req.method ?? 'GET').toUpperCase();
    const body = ['GET', 'HEAD'].includes(method) ? undefined : await requestBytes(req);
    const upstream = await fetch(target, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(25_000),
    });
    const responseHeaders = {};
    for (const [name, value] of upstream.headers) {
      if (
        hopByHopHeaders.has(name.toLowerCase()) ||
        name.toLowerCase() === 'set-cookie'
      )
        continue;
      responseHeaders[name] = value;
    }
    const cookies = upstream.headers.getSetCookie?.() ?? [];
    if (cookies.length) responseHeaders['Set-Cookie'] = cookies;
    responseHeaders['Cache-Control'] =
      upstream.headers.get('cache-control') ?? 'no-store';
    res.writeHead(upstream.status, responseHeaders);
    if (method === 'HEAD' || upstream.status === 204 || upstream.status === 304) {
      res.end();
      return;
    }
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    const status = Number(error?.statusCode) || 502;
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        error:
          status === 413
            ? 'Request is too large for the Vercel proxy.'
            : 'Shop backend could not be reached.',
      }),
    );
  }
}
