# SPL Connected Shop v3.1

Customer storefront: browse products, register/sign in, place orders directly and follow status in /account/. Private owner dashboard at /owner/: edit products, upload photos, set prices and available stock, publish/hide products and manage orders. Both interfaces share a Node.js HTTP backend and persistent SQLite database.

Orders use server-validated prices, atomic inventory reservations and idempotent retries. Cancellation restores stock once; completed/cancelled orders are final. Authentication uses salted password hashes and protected session cookies. Server-side role, origin and CSRF checks protect private operations. Customers can read only their own orders. Product and order version checks reject stale edits.

Verification: production export, TypeScript, lint and 24 automated tests passed. Browser checks covered customer checkout, owner confirmation, customer status updates, product creation/photo upload/publish/hide, customer isolation, restart persistence and layouts at 320, 390 and 1440 pixels. Revised development launcher endpoints also returned HTTP 200 after workspace reconnection.

This ZIP includes complete source and the prebuilt frontend. It contains no owner password, customer database, private uploads or node_modules. With Node.js 22.13+, run npm run owner:create, then npm start. Read START-HERE.md and README.md. For frontend development install locked dependencies with npm ci and run npm run dev.

Hosting requires a Node.js server, HTTPS and durable private disk with backups. A Namecheap domain can point to that host; static-only hosting cannot run the shared backend. Set PUBLIC_ORIGIN to the real HTTPS domain root and build with NEXT_PUBLIC_SITE_URL when the domain is known. No domain was supplied, so the portable build omits domain-specific metadata and sitemap. Production DNS/TLS and a real deployment have not been tested.

Payments are recorded as a preference and confirmed separately by the shop; no online payment processing or email/SMS notifications are included. There is no email verification, password reset or MFA. Views show the latest 200 orders. Product photos, prices, warranty and contact details originate from the uploaded files and require owner confirmation before public launch. A complete accessibility/all-browser audit has not been performed.

The inherited dependency review reported 9 findings (0 critical, 6 high, 3 moderate) in framework/build dependency chains. The standalone backend/runtime uses Node builtin modules; development/build dependencies still require upstream patch review. See README.md for deployment and privacy limitations. Main was preserved; this delivery is published only on the authorized downloads branch.

## New in v3.1: Google accounts

Google OAuth authorization-code flow with PKCE, browser-bound single-use state, nonce and signature/issuer/audience/expiry/email verification. Customers register/sign in via Google; privately approved Google emails can provision new owners. Explicit authenticated CSRF-protected linking preserves existing accounts/orders without silently merging emails or elevating existing customers. Allowlist removals invalidate Google owner sessions on their next request after restart. Only openid/email/profile permissions are requested; no mailbox access or Google tokens are stored. Password login continues to work.

24 automated tests passed, including mocked Google exchange, forged-identity rejection, owner restrictions, one-time/browser-bound/expired state safe linking and preservation of legacy password sessions during database upgrade. No real Google client credentials were supplied, so live Google sign-in is pending the setup in GOOGLE-SETUP.md. TypeScript, lint, production build and local browser UI checks are included in release validation.

Customer-facing navigation no longer includes an owner login link. The /owner/ entry is used directly by owners and retains server-side role enforcement.
