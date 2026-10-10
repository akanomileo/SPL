# SPL Connected Shop v3.7

## Storefront

The catalogue now sits near the top of the page. A compact header combines the shop logo, search, account links and cart; a second row opens All laptops, Brand New, Good Second or Saved. Desktop filters sit beside the products. Mobile uses compact filters and two product columns.

White cards, grey dividers and SPL red replace the large promotional sections. Product photos, names, specifications, prices and stock are easier to scan. Add to cart is a labelled button on every product. There are no invented reviews, sales counts or brands. Text is shorter and focuses on shopping, delivery and payment.

## Owner and checkout

Orders, Products and Payment methods are in a management menu. The product editor, customer gallery, checkout and order history share the updated styling. Brief control transitions remain; reduced-motion preferences are respected.

Google sign-in rules, public browsing, the single owner account, up to 12 laptop photos and up to 20 private payment receipts per order remain included. The owner still checks each transfer and the combined amount manually before confirming payment.

## Upgrade

Follow UPGRADE.md to stop your working version, back up and copy its complete data folder and private .env settings into v3.7. Keep your existing owner; do not generate another setup code. The ZIP includes both interfaces, full source, the shared Node/SQLite server and the built frontend. Node.js 22.13+ is required. Run npm.cmd start from the folder containing package.json; no dependency installation is needed for the included build.

## Validation

43 Node 22.13 automated tests pass, plus lint, TypeScript and the production build. Browser checks cover categories, brand filters, search, cart persistence through Google sign-in, photo upload/retry and gallery controls, checkout, split-payment receipts, owner review and receipt privacy. Layouts are checked at 320, 390 and 1440 pixels with reduced motion. Google responses and payment images in these checks are isolated test fixtures; no real credentials or shop data are shipped.
