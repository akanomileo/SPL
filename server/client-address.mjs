import { isIP } from 'node:net';

const normalize = (value) =>
  value?.startsWith('::ffff:') ? value.slice(7) : value;

export function clientAddress(req, trustedProxyIPs = []) {
  const remote = normalize(req.socket.remoteAddress) ?? 'unknown';
  const trusted = new Set(trustedProxyIPs.map(normalize));
  if (!trusted.has(remote)) return remote;
  const forwarded = String(req.headers['x-forwarded-for'] ?? '');
  if (!forwarded || forwarded.length > 1024) return remote;
  const chain = forwarded.split(',').map((ip) => normalize(ip.trim()));
  if (chain.length > 16 || chain.some((ip) => !isIP(ip))) return remote;
  // Walk from the trusted socket towards the client; ignore spoofed prefixes
  // before the first untrusted hop. The edge proxy must append/overwrite XFF.
  let address = remote;
  for (const hop of chain.reverse()) {
    if (!trusted.has(address)) break;
    address = hop;
  }
  return address;
}

export function trustedProxyIPs(value = '') {
  const addresses = value
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
  if (addresses.some((ip) => !isIP(ip)))
    throw new Error(
      'TRUSTED_PROXY_IPS must contain comma-separated exact IPv4/IPv6 addresses.',
    );
  return addresses;
}
