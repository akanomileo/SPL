# SPL Connected Shop v3.10 — Reliability update

This release addresses the five issues identified in the v3.9 review.

- New unpaid orders have a configurable receipt deadline (24 hours by default) and a per-customer limit of three outstanding unpaid orders. Expiry returns stock once. Existing orders receive no invented deadline. Uploading any receipt stops automatic expiry so potential transfers remain for owner review, even if a photo is later removed.
- Receipt uploads now enforce cumulative file/byte limits across each order, customer and shop, plus a rolling customer upload limit. Removing a photo does not reset usage. Existing evidence is preserved, and old receipt sizes are conservatively counted as 3 MiB each.
- `TRUSTED_PROXY_IPS` allows explicit trusted-proxy configuration for independent client sign-in budgets. Untrusted forwarded headers are ignored; the proxy must append or overwrite `X-Forwarded-For`.
- Checkout preserves an opaque submission key in this tab's session storage. Recovery either returns the existing customer order or closes the absent attempt atomically, preventing a delayed submission from racing a new attempt. Contact details are never stored in session storage.
- Customer and owner order history now has pagination, reference search and server-side status filters. The owner dashboard totals cover all orders.

Additional maintenance: corrected the `@shadcn/react` lockfile mismatch so `npm ci` succeeds, added query indexes, and added concise server error reporting without customer details or tokens.

Validation: 65 automated tests pass on Node.js 24.19.0, including the original 51 and new reliability cases. TypeScript, lint and the production build pass. See REVIEW-AND-CHANGES.md for validation scope and limitations.

The ZIP includes source and the rebuilt ready-to-run frontend. It contains no private database, customer data, receipts, owner binding or Google credentials. Follow UPGRADE.md before replacing a working installation. Keep the complete private data folder and configuration together. No deployment or real Google/bank transaction was performed.
