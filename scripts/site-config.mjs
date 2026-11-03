import fs from 'node:fs';
import path from 'node:path';

export function validateSiteUrl(value = '', basePath = '') {
  if (!value.trim()) return '';
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      'NEXT_PUBLIC_SITE_URL must be a full HTTPS URL without credentials, a query or a fragment.',
    );
  if (
    [
      'your-domain.com',
      'your-real-domain.com',
      'example.com',
      'localhost',
    ].includes(url.hostname)
  )
    throw new Error(
      'Replace the example site URL with your actual domain, or leave it blank.',
    );
  if (url.pathname.replace(/\/$/, '') !== basePath)
    throw new Error('The site URL path must match NEXT_PUBLIC_BASE_PATH.');
  return url.href.replace(/\/$/, '');
}

export function writeDiscoveryFiles(directory, siteUrl = '') {
  const sitemap = path.join(directory, 'sitemap.xml');
  const robots = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /owner/',
    'Disallow: /account/',
    'Disallow: /api/',
  ];
  if (siteUrl) {
    const escaped = siteUrl.replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&apos;',
        })[char],
    );
    fs.writeFileSync(
      sitemap,
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escaped}/</loc></url></urlset>\n`,
    );
    robots.push(`Sitemap: ${siteUrl}/sitemap.xml`);
  } else if (fs.existsSync(sitemap)) {
    fs.unlinkSync(sitemap);
  }
  fs.writeFileSync(
    path.join(directory, 'robots.txt'),
    `${robots.join('\n')}\n`,
  );
}
