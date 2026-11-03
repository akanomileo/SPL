# SPL Connected Shop v3.10 — Review and changes

Prepared from the supplied SPL Connected Shop v3.9 project on 17 October 2026.

## Changes

| Review finding | Implemented behavior |
| --- | --- |
| Unpaid stock held indefinitely | New orders expire after a configurable receipt deadline. Stock is restored transactionally and once only. Three unpaid orders per customer are allowed by default. |
| Receipt removal bypassed storage limits | Removed files still count towards lifetime file/byte quotas. Customer upload limits span all their orders and survive restarts. Rejected uploads leave no new file. |
| Proxy clients shared the sign-in allowance | Explicit trusted proxy IPs resolve the client address from the right side of the forwarded chain. Headers from untrusted peers are ignored. |
| Reopening checkout lost the submission key | A per-customer, tab-scoped opaque key survives component remounts and reloads. Recovery returns the original order or atomically closes an absent attempt before allowing a new key. |
| Orders beyond the newest 200 were inaccessible | Both interfaces offer paginated history, reference search and server-side filters. Management totals cover the complete history. |

## Default operational settings

| Setting | Default |
| --- | --- |
| Receipt deadline for a new unpaid order | 1,440 minutes / 24 hours |
| Outstanding unpaid orders per customer | 3 |
| Active receipts per review | 20 |
| Maximum single receipt | 3 MiB |
| Cumulative receipt files per order | 60, including removed photos |
| Cumulative receipt bytes per order | 120 MiB |
| Cumulative receipt bytes per customer | 512 MiB |
| Cumulative receipt bytes for the shop | 5 GiB |
| Successful uploads per customer | 40 per rolling hour |
| Trusted proxies | None until explicitly configured |

Optional environment settings are documented in `.env.example`. Receipt quotas cover receipt-file bytes; they do not cover product photos, database overhead, backups or other disk use. Monitor private disk capacity and plan retention accordingly. The app does not automatically delete financial evidence. Raising a quota requires an explicit administrator configuration change and sufficient private disk capacity.

## Payment and migration precautions

Existing orders, owner identity, Google sessions, products, payment methods and receipts are preserved by additive database migrations. Existing orders receive no new expiry deadline. Legacy receipt sizes are conservatively counted as 3 MiB rather than inventing exact historical sizes. Existing outstanding unpaid orders count towards the new order limit.

The first receipt upload removes automatic expiry, because it may represent money already transferred. A customer who has transferred money but cannot upload should contact SPL before their deadline. The owner must resolve these orders manually. Expiry or cancellation never issues a bank refund.

Back up the stopped application's complete data directory and private environment configuration before upgrading. Do not generate a new owner setup code for an already configured owner. Do not use an older application to write to the upgraded database. UPGRADE.md includes the Windows steps.

## Verification

- `npm ci` succeeds with the corrected lockfile.
- `npm test`: 65 passing tests on Node.js 24.19.0.
- `npm run typecheck`: passes.
- `npm run lint`: passes.
- `npm run build`: passes and checks the static export's referenced assets.
- Chromium browser checks passed for customer pagination and reference search, owner search, recovery of an existing submission, and a committed order whose response was deliberately dropped before reopening checkout. Customer and owner layouts were checked at 320, 390 and 1,440 pixels with no horizontal overflow or uncaught page errors. Test-only accounts and payment details were used.
- Reliability tests cover expiry and one-time stock return across database reopen, protection after receipt upload/removal, unpaid-order limits, cumulative receipt quotas, rolling upload rates, trusted proxy handling, access to orders older than 200, customer isolation and checkout-recovery races.

Automated authentication tests use mock Google responses. No real Google credentials, transfers or customer records were used. This release has not been tested on the user's production host and is not a complete security or accessibility audit.

## Run

The included build requires Node.js 22.13 or later. This release was verified on Node.js 24.19.0.

```powershell
npm.cmd start
```

Customer shop: `http://localhost:4174/`  
Owner dashboard: `http://localhost:4174/owner/`  
Customer orders: `http://localhost:4174/account/`

Google setup and any existing private settings remain necessary for sign-in. No npm dependency installation is needed just to run the included build.
