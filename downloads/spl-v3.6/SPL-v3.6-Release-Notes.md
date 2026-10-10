# SPL Connected Shop v3.6

This release adds multiple laptop photos to the owner dashboard and a gallery to the customer shop. It includes v3.5’s split-payment receipt workflow and both connected interfaces.

- Owners can select several JPG, PNG or WebP photos per laptop: up to 12, each up to 3 MB.
- Photo previews include cover selection, reordering and removal. The first photo becomes the cover on the customer card and in the bag. Click Save product to publish changes.
- New listings require at least one photo and start without a borrowed sample image. Existing listings keep their original image as a one-photo gallery.
- Customers can use thumbnails, next/previous buttons and arrow keys, and open the main photo at full size. A card shows its photo count. Guests can view galleries without signing in.
- Failed uploads keep photos already uploaded in the editor. Save and editor switching are disabled during uploads. Stale listing saves are rejected through the existing product version checks.
- Galleries reject empty/oversized lists, duplicate paths, external URLs, private receipt paths and unsupported image types. Removing a photo from one product does not delete a file used by another listing.

Google-only checkout and single-owner access, public Brand New / Good Second collections and brand filters, bank/wallet/QR settings, and up to 20 private receipts per order remain included. The owner still checks every transfer and the combined amount manually before confirming payment.

## Upgrade

Stop v3.5 and follow UPGRADE.md to preserve your private Google settings and full data folder. Do not generate a new owner setup code for an existing shop. Read PRODUCT-PHOTOS.md to add galleries. The ZIP includes both interfaces, full source, the shared Node/SQLite server and prebuilt frontend. Node.js 22.13+ is required; `npm.cmd start` runs the included build without installing dependencies.

## Validation

43 Node 22.13 automated tests pass, plus lint, TypeScript and the production build. Gallery tests check upload permissions, ordered-photo persistence, cover changes, removal without deleting shared files, stale saves, legacy single-photo input and invalid gallery paths/lists. Existing Google, orders, inventory and multiple-receipt tests remain included.

Browser checks use an isolated shop with mocked Google responses and test photos. They exercise multiple-photo upload, interruption/retry, cover and ordering changes, removal, saved-gallery reloads, customer thumbnails/arrows/keyboard/full-size links, old one-photo listings, and layouts at 320, 390 and 1440 pixels. The full checkout and split-receipt review flow is also checked. No real credentials, owner identity, receipts or shop data are shipped.
