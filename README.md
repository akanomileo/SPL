# SPL Connected Shop v3.10 — Reliability update

Customers open `/` directly to the public shop. Anyone can browse products, search, save products and add items to the cart without an account. Google sign-in is required when proceeding to checkout or viewing orders. After signing in from checkout, customers return to checkout with their cart preserved. `/account/` shows their orders. Owner access is at `/owner/`, with no owner link in customer navigation. Password login and registration are disabled on the server. First Google sign-in creates an account; later sign-ins reuse it.

Exactly one Google account owns the shop. No owner email is hardcoded: the administrator creates a private one-time setup code, then chooses the owner Google account during the first owner sign-in. The database binds its stable Google account ID. Other Google accounts can be customers but cannot enter the owner dashboard. A private server command can intentionally replace the owner later.

## Storefront and payments

The shop has two main collections: **Brand New** and **Good Second**, with searchable shop brands and listing counts within each. In the owner dashboard, open Brands to add the names you sell. Existing laptop brands are imported automatically; there is no built-in worldwide directory. Brands without listings show a zero count. Original sample products are Good Second; add your genuine new stock through the owner editor. Device type, specifications, condition, price, stock and visibility remain editable. The shop uses a compact white-and-red retail layout, header search, category and brand filters, clear prices and stock, and labelled Add to cart buttons. Mobile screens show two products per row and compact filters. The owner dashboard uses a management menu with Orders, Products, Brands, Payments, Accounts and Visitors. Product galleries, checkout and order history use the same visual style; short hover transitions respect reduced-motion preferences.

Owners can manage multiple bank/wallet methods, account details, instructions and uploaded QR photos in **Payment methods**. There are no default real bank details. New checkout orders select an active method and keep its details as a snapshot. After ordering, the customer attaches one photo per transfer and sends the full receipt set. Up to 20 receipts (3 MB each) can be attached to one order. The owner checks every transfer, confirms payment or requests changes, then manages fulfilment. Receipt files are private to the correct customer and the single owner. See PAYMENTS-GUIDE.md.

Owners can upload up to 12 photos per laptop, set the first photo as the cover, reorder and remove photos before saving. Customers open a laptop’s details to browse thumbnails, use next/previous controls or arrow keys, and open a photo at full size. Existing single-photo listings keep their original image. See PRODUCT-PHOTOS.md.

## Customer accounts and shop visitors

Accounts is visible only to the signed-in owner. Search by name/email, filter active or suspended accounts, and open a customer’s paginated order history. Account counts and completed order totals cover their full history. Suspension signs the customer out and blocks SPL sign-in; restoration permits the same Google identity to return. Products, orders, receipts and the owner binding are preserved. Shop access controls do not modify the customer’s Google account. Older account join/sign-in dates are shown as not recorded until applicable; no history is invented.

Visitors shows daily distinct browsers and shop openings, with 7/30/90-day views. Counts use Asia/Yangon (UTC+06:30). Tracking begins when v3.8 starts; dates before that are unavailable. Guests and signed-in customers are counted, while owner sessions, recognised bots and Do Not Track requests are excluded. An HttpOnly first-party cookie estimates distinct browsers per day. Different devices or cleared cookies can count again; these are not verified individual people. There is no Google Analytics integration or extra analytics credential. Daily totals are retained for about one year; daily deduplication hashes are retained for two days. No IP addresses or Google account identities are saved to the analytics tables. Read MANAGEMENT-GUIDE.md.

## Start the included build

Requires Node.js 22.13+. Extract the ZIP and open PowerShell in the folder containing package.json.

If upgrading a working installation, use UPGRADE.md to preserve the complete data directory and all private `.env` settings; start with `npm.cmd start` and keep your existing owner. The following setup-code steps are for a new installation.

1. Follow GOOGLE-SETUP.md to create your Google OAuth client and put its three private settings in `.env` or `.env.local`. Google credentials are not supplied in the ZIP.
2. Generate a private owner setup code:

   ```powershell
   npm.cmd run owner:setup
   ```

3. Start both interfaces:

   ```powershell
   npm.cmd start
   ```

4. Open http://localhost:4174/owner/, enter the private code once, click Continue with Google, and choose your owner account. The code expires in 24 hours and is consumed by a successful owner setup. Keep it out of chat, screenshots, public files and GitHub.
5. In the owner dashboard, review products and add at least one visible payment method before accepting new orders.
6. Customers open http://localhost:4174/ and browse freely. Checkout and order history use Google sign-in/sign-up. Use a separate browser profile/private window to test customer and owner roles.

Normal owner sign-in uses Google only, without the setup code. No Google password is entered in SPL. `START-PREVIEW.cmd` starts the same server on Windows. The prebuilt frontend and backend run with Node builtin modules; npm ci is needed only for builds/development. With Google unconfigured, public browsing still works; checkout and order history explain that Google setup is required.

## Changing the one owner account

With private server-console access, intentionally replace owner access:

```powershell
npm.cmd run owner:setup -- --replace
```

This immediately clears the owner binding, invalidates former owner sessions and changes previous owners into customers. Use the new private code on `/owner/` to choose the replacement Google account. Products, orders and customer data are retained. Never expose this console command through a public API.

## Updating from older releases

For a working v3.7 installation, follow UPGRADE.md. Existing Google owner binding and sessions are retained. v3.4 orders retain their current receipt and payment state; orders from before v3.4 keep their legacy payment workflow. New orders need receipts and payment review. Product JSON without collection/brand is backfilled conservatively without resetting stock or prices.

### Earlier v3/v3.1 installations

Stop the old server and back up the entire existing `data` folder first. Preserve that folder and `.env.local` when replacing application files. Uploaded images and SQLite data must remain together. New tables are added without deleting catalog, customers or orders.

- Previously Google-linked customers continue with Google and retain their account/orders.
- Previous owner sessions are not accepted until the single owner is configured in this version. Run owner:setup and choose the correct Google account.
- A legacy password customer cannot sign in with its password. After verifying the correct account owner, an administrator can authorize its Google migration through the private console:

  ```powershell
  npm.cmd run account:migrate -- customer@gmail.com
  ```

  The next verified Google sign-in with that exact Gmail/Workspace email attaches it to the old customer ID and preserves orders. Emails are not silently merged for ordinary customers. This command does not grant owner privileges. Legacy password sessions are rejected even if the old database rows still exist.

## Development and validation

```powershell
npm.cmd ci
npm.cmd run dev
```

Development frontend: http://localhost:3000/. API: internal port 3001. Register/use http://localhost:3000/api/auth/google/callback for development; the included build uses port 4174. Stop the other app instance before switching workflows. Both use the same private data directory by default.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

The connected application must be hosted at a domain root (NEXT_PUBLIC_BASE_PATH empty). Node 22.13 may print experimental SQLite/type stripping warnings. No Node dependencies are needed for the prebuilt runtime; frontend tooling uses the lockfile. The CI workflow tests/builds but does not deploy.

## Orders and privacy

Google accounts use protected session cookies. The backend verifies Google signatures, issuer, audience, expiry, email and nonce; OAuth uses PKCE and browser-bound single-use state. Sessions are stored hashed and must be Google sessions. Owner API authorization checks the persistent single-owner binding. Mutations enforce origin/CSRF checks. Catalogue requests are public. Placing orders and reading order history require an authenticated Google session. Static images/build assets can remain publicly retrievable; access to private orders/dashboard data is protected by server authentication, not secrecy of the route URL.

Server-validated prices, atomic inventory reservations and idempotent retries prevent duplicate orders and overselling. Owners review payment, then confirm, prepare, complete or cancel orders. Cancellation restores stock once. Customers read only their own order/history. Catalog and dashboard data refresh every 15 seconds; account and dashboard have manual Refresh controls. Order history is paginated and searchable by reference, with server-side status filters. Dashboard totals cover the complete history.

New unpaid orders hold stock for 24 hours by default, with up to three outstanding unpaid orders per customer. If no receipt has ever been uploaded by the deadline, the order is cancelled and its stock is returned exactly once. Any receipt upload stops automatic expiry for owner review, even if that photo is later removed. Existing orders receive no invented deadline. Customers who transferred money but cannot upload a receipt should contact SPL before the deadline.

Checkout records only an opaque, customer-scoped submission key in session storage for this tab. After a lost response, reopening or reloading checkout recovers the original order, or atomically closes the absent attempt before another submission is allowed. Delivery details are not saved in browser storage.

Customers transfer money in their own bank/wallet app using the owner-configured details, then upload a receipt for each transfer and send the full set. The owner manually checks and confirms payment. There is no payment gateway, bank API reconciliation, card processing, automatic refund or email/SMS notification. Receipt review and fulfilment are separate states. New orders cannot be confirmed before payment review succeeds; cancelling an order restores reserved stock but does not refund a transfer. Google supplies verified account identity and its own account security; SPL does not provide a separate password/reset flow or Google account recovery. Google sign-in requests only openid/email/profile, with no mailbox access, and does not retain Google access/refresh tokens.

Delivery names, phone numbers, addresses, notes and receipt images are stored privately on the shop server so the owner can fulfill orders. They are visible to their customer and the single authorized owner, and are not put in local storage. Establish appropriate retention, backup access and deletion procedures before collecting real customer information. Verify original product photos, prices, stock, warranty and contact information; uploaded shop facts/image rights were not independently authenticated. ASSET-SOURCES.json records third-party image sources.

## Hosting and Namecheap

A Namecheap domain can point to a Node.js host later. A domain alone, static-only hosting or uploading dist/client into public_html will not run accounts/orders. Use Node 22.13+, one running application instance and durable private disk for SQLite/product images/QR images/private receipts. Configure HTTPS at a trusted reverse proxy, private DATA_DIRECTORY outside the public web root, NODE_ENV=production, PUBLIC_ORIGIN=https://YOUR-REAL-DOMAIN, HOST=0.0.0.0 and the host's PORT. Set the Google callback to the same domain plus `/api/auth/google/callback`. Complete Google's consent/publishing requirements before adding public users beyond test accounts.

Preserve the data directory across deployments and make private backups. Stop the app before copying its complete data folder for a simple consistent backup; live backups require SQLite-aware tooling. Set NEXT_PUBLIC_SITE_URL to the actual HTTPS domain and rebuild for canonical/social metadata and sitemap. DNS, certificates, production hosting and live Google sign-in were not tested with real credentials. See RELEASE-NOTES.md for test coverage and inherited dependency findings; this is not a complete security/accessibility audit.

For a Git-based Vercel storefront with a persistent Node backend, follow [VERCEL-DEPLOY.md](VERCEL-DEPLOY.md). This deployment uses Vercel for the static site and API proxy, plus a disk-backed Node web service for SQLite and uploads.

## v3.10 operational limits

Receipt limits include historical photos removed from the active review: 60 files / 120 MiB per order, 512 MiB per customer and 5 GiB for the shop. Successful uploads are limited to 40 per customer per rolling hour. The active-review limit remains 20 receipts and each upload remains at most 3 MiB. These limits survive restarts and never automatically delete payment evidence. Older receipt sizes are counted conservatively as 3 MiB each. Set the optional limits in `.env.example` according to your private disk capacity and documented retention policy; monitor total disk use as these limits cover receipt bytes, not the database, backups or product photos.

Sign-in limits ignore forwarded IP headers by default. Behind a reverse proxy, set `TRUSTED_PROXY_IPS` to its exact IPv4/IPv6 socket addresses only. The proxy must append or overwrite `X-Forwarded-For`; block direct public access to the application port. Never trust arbitrary forwarded headers or wildcard client addresses.

Unexpected server errors emit a concise operation and error class without query strings, customer details or authentication tokens. Read REVIEW-AND-CHANGES.md for the fixes and validation.
