# SPL Connected Shop v3.9

The owner controls the shop brand list. Open Brands, enter a name and click Add brand. The customer filter and laptop editor use those names. The fixed 88-name worldwide directory has been removed. Existing product brands are imported automatically, without resetting products or private data. Typing a new name while saving a laptop also adds it to Brands. Case variations share one entry. Unused names can be removed; names used by any laptop, including a hidden listing, are protected from removal.

Brand New and Good Second remain the two collections. Brand counts show actual listings; zero-count names do not invent stock. Brand controls and the customer filter fit mobile and desktop screens, with aligned labels and counts.

“Test Google User” in older previews was an isolated test account. New previews use “Demo owner” and “Demo customer”; no demo accounts or purchases are shipped. The real dashboard uses the signed-in Google account’s name. Authentication still verifies Google responses and restricts the owner dashboard to your selected single account.

Both websites, Accounts and Visitors, 12-photo laptop galleries, editable bank/wallet/QR methods, Google-only checkout and 20-receipt split-payment review remain included. Follow UPGRADE.md to preserve your complete data folder and private Google settings. Node.js 22.13+ is required; npm.cmd start runs the included build without installing dependencies.

51 automated tests pass on Node 22.13, plus TypeScript, lint and the production build. Brand checks cover authorization, origin/CSRF, input validation, Unicode/case deduplication, persistence, migration from actual listings, removal guards, automatic product registration and stale-save rollback. Isolated browser checks exercise brand additions/removal and customer synchronization alongside galleries, Google checkout, three receipts, account suspension/restoration and daily visitor reports at 320/390/1440 pixels. Google responses and transfer photos are mocked for checks; no real credentials or shop data are shipped.
