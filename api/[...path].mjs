import { proxyToShop } from '../server/vercel-proxy.mjs';

export default function handler(req, res) {
  return proxyToShop(req, res);
}
