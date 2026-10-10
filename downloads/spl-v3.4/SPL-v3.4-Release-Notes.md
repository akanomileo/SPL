# SPL Connected Shop v3.4

## Changes

- Refreshed customer and owner interfaces with plain shop copy, cream/ink/orange styling, responsive cards, clearer navigation and light entrance/hover animations. Reduced-motion preferences are respected.
- Two main collections, **Brand New** and **Good Second**, with brand filters within each. Owner product editing includes collection and brand. The original eight sample laptops remain Good Second; no genuine new inventory is invented.
- Owner **Payments** settings for multiple bank/wallet methods, recipient/account details, instructions and QR photos. Methods can be edited or hidden. Customers cannot place new orders until at least one method is visible.
- Each new order saves its selected payment details and original QR path. Later settings changes do not rewrite those instructions.
- Customer receipt upload after ordering or from My orders. The owner can confirm payment or request a replacement with a note. Uploading a receipt never marks payment received automatically. Payment review is separate from order fulfilment, and new orders cannot be confirmed before payment is confirmed.
- Private receipt images and review history are accessible only to the order's customer and the authorised owner. Replacement receipts preserve earlier images and decisions. JPG, PNG and WebP uploads are limited to 3 MB and checked for supported image structure/dimensions.
- Fixed a bag/saved-item issue for owner-added products: restoration now uses the live catalogue before writing browser storage, so new product IDs survive reloads and Google sign-in redirects.

## Preserved behaviour and upgrade

Public browsing, search, sorting, saved items and bag require no account. Checkout and order history use Google only. First Google login creates an account and subsequent logins reuse it. Exactly one Google account owns the shop, selected through a private first-time setup code; normal owner sign-in needs no code. Customer navigation has no owner link. Password endpoints and legacy password sessions remain disabled.

The migration preserves the configured Google owner, existing customers/orders, product prices and stock. Existing orders keep their previous payment workflow; new orders require a configured method and receipt review. Products missing collection/brand are backfilled as Good Second with known brand inference (including Microsoft Surface), or Other. Read UPGRADE.md before replacing a working installation; retain the entire private data directory and all local Google settings. Do not regenerate an already configured owner.

## Validation

The full Node 22.13 suite passes **37 automated tests**. Coverage includes Google signature/claims verification, single-use browser-bound OAuth state/PKCE, safe return destinations, owner setup/replacement, account migration, public catalogue and protected orders, CSRF/origin/role enforcement, atomic stock/idempotent orders, payment method validation/visibility, immutable payment snapshots, receipt privacy/content/size, receipt replacement and review races, legacy database migration and owner-added product restoration. TypeScript, full lint and the production build pass; the static export verifies 19 referenced assets.

Browser release checks exercise public collection/brand/search filters, owner and customer Google flows, checkout bag preservation for seeded and owner-added products, the no-payment-method state, owner bank/wallet/QR editing, customer receipt submission/replacement, owner payment review and order confirmation, wrong-owner/customer isolation, and layouts at 320, 390 and 1440 pixels. Google provider responses and payment photos are test fixtures. Real Google login was not verified from this cloud environment; retain your working local OAuth settings and see GOOGLE-SETUP.md. No real transfer, bank API or payment gateway was exercised.

## Package and hosting

One ZIP includes both interfaces, the shared server, full source and the prebuilt frontend. It excludes node_modules, private settings, databases, uploaded bank details/QR photos/receipts, owner identity and setup codes. The included build runs with Node.js 22.13+ and builtin Node modules; npm ci is for frontend development/builds only.

Production requires HTTPS, a Node host, one app instance, durable private storage and backups, plus a matching Google OAuth web client/callback. A domain or static public_html alone cannot run this app. Views show the latest 200 orders. Transfers, delivery fees and refunds are arranged directly with the shop; no card processing, bank reconciliation, automatic refunds or email/SMS notifications are included. Catalogue/QR images are public; receipt files and order data are protected by authentication. Google requests identity permissions only and does not store access/refresh tokens or read Gmail.

Product photos, prices, stock, warranty and contact details come from the supplied files and need owner review. Prior dependency review reported 9 findings (0 critical, 6 high, 3 moderate) in inherited framework/build chains; this release does not change those dependencies. Validation is not a full security/accessibility/all-browser audit. Original main is preserved; downloadable releases use the authorised delivery branch.
