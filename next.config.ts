import type { NextConfig } from 'next';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  output: 'export',
  // Export the customer and owner interfaces; the Node server supplies the API.
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
};

export default nextConfig;
