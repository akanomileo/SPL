# SPL Connected Shop v3.5

This release adds multiple transfer receipts to the connected customer shop and owner dashboard.

- Customers can select several receipt photos, preview them, remove a selected photo, or add more. One order accepts up to 20 receipts, each a JPG, PNG or WebP up to 3 MB.
- Split payments stay together on one order. For a 1,000,000 MMK transfer limit, a 2,700,000 MMK payment can have three receipts: 1,000,000 + 1,000,000 + 700,000.
- The owner sees all photos together and confirms payment after checking every transfer and the combined amount in their bank/wallet app.
- Uploads remain drafts until the full set is sent. Successful photos survive an interrupted upload; retry sends only the remaining photos. Adding or removing a photo pauses review until the customer sends the updated set.
- Customers can replace an unclear photo while keeping the other transfer receipts. Private history records which photos were submitted and reviewed, including removed photos. Version checks prevent confirmation of an outdated set.
- Receipt access remains limited to the order's customer and the single Google owner. Confirmed payments and cancelled/completed orders reject receipt changes.
- Existing v3.4 data migrates automatically: the current receipt stays attached, older photos stay in history, and owner identity, payment methods, orders and products are preserved.

Public browsing, Google-only checkout/owner login, Brand New / Good Second collections, brand filters, bank/wallet/QR settings and the v3.4 interface remain included. Transfers and confirmation are manual; this release does not connect to a bank payment API or extract amounts automatically from photos.

## Upgrade and run

Read UPGRADE.md. Stop v3.4 and copy your private Google settings and complete data folder before starting v3.5. The release intentionally excludes credentials and customer data. Do not regenerate an existing owner's setup code.

The ZIP includes both interfaces, shared Node/SQLite server, full source and prebuilt frontend. Requires Node.js 22.13+. From the folder containing package.json, run `npm.cmd start`; no dependency installation is required to run the included build. For development, use `npm.cmd ci` and the scripts in README.md.

## Validation

41 Node 22.13 automated tests pass, plus TypeScript, lint and production build checks. Payment tests cover multiple drafts/submission, receipt privacy and limits, rejection/selective replacement, stale-owner review prevention, confirmed/cancelled-order protection, failed upload cleanup and v3.4 migration without reactivating removed photos.

Browser checks cover three-receipt selection and previews, interrupted upload/retry without duplicates, owner gallery, selective replacement, confirmation of the full set, Google-only flows, public browsing, preserved bags, and layouts at 320, 390 and 1440 pixels. Google responses and payment photos use test fixtures; no real transfer is performed.
