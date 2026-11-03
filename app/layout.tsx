import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './shop.css';
import './portal.css';
import './retail.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  ...(siteUrl ? { alternates: { canonical: siteUrl } } : {}),
  title: 'SHWE PYAE SAN — Find your next laptop',
  description:
    'Shop Brand New and Good Second laptops at SHWE PYAE SAN in Yangon. Browse by brand, order online and track payment confirmation.',
  icons: { icon: `${basePath}/spl-original-logo.png` },
  openGraph: {
    title: 'SHWE PYAE SAN Laptop & Mobile',
    description:
      'Browse laptops by brand, compare prices and order from SHWE PYAE SAN in Yangon.',
    siteName: 'SHWE PYAE SAN Laptop & Mobile',
    type: 'website',
    ...(siteUrl
      ? {
          url: siteUrl,
          images: [
            {
              url: `${siteUrl}/products/laptop-1.jpg`,
              alt: 'Lenovo ThinkPad X1 Carbon from the SPL laptop collection',
            },
          ],
        }
      : {}),
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SHWE PYAE SAN Laptop & Mobile',
    description:
      'Browse Brand New and Good Second laptops at SHWE PYAE SAN in Yangon.',
    ...(siteUrl ? { images: [`${siteUrl}/products/laptop-1.jpg`] } : {}),
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
