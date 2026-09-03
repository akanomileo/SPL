# SHWE PYAE SAN Laptop & Mobile Shop

A clean modern online storefront for SHWE PYAE SAN Laptop & Mobile Phone Store. It includes product browsing, search, saved items, cart, customer and business sign-in UI, order tracking, a seller dashboard, and a KPay/bank/cash checkout demo.

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the local address shown in the terminal.

## Customize before going live

Product data, prices, descriptions, and payment choices are in `app/marketplace.tsx`. The original shop logo is `public/spl-original-logo.png`.

The Google button and payment flow are safe demonstrations. Connect your own Google OAuth application, KPay merchant account, and bank details before accepting real customers or money.

Copy `.env.example` to `.env.local` and set:

```env
NEXT_PUBLIC_SITE_URL=https://your-domain.com
NEXT_PUBLIC_BASE_PATH=
```

Keep `NEXT_PUBLIC_BASE_PATH` blank when the site is served at the root of a domain.

## Build a static website

```bash
npm ci
npm run build
```

The upload-ready static website is generated in `dist/client`. Upload the contents of that folder to any static web host, cPanel public directory, Netlify, Cloudflare Pages, GitHub Pages, or another custom-domain host.

## Upload to GitHub

Create an empty repository, then run:

```bash
git init
git add .
git commit -m "Initial SPL shop"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/YOUR-REPOSITORY.git
git push -u origin main
```

The included GitHub Pages workflow builds and deploys the site automatically from the `main` branch. In GitHub, enable **Settings → Pages → Source → GitHub Actions**.

For a custom domain on GitHub Pages, add the domain in GitHub Pages settings and set `NEXT_PUBLIC_BASE_PATH` to blank in the workflow.
