# SPL Connected Shop v3.10

This ZIP contains both the customer shop and owner dashboard, plus the shared server and the ready-to-run build. Requires Node.js 22.13 or newer.

## Upgrading your existing shop

Read UPGRADE.md first. Stop the old server, back up its complete `data` folder, and copy that folder and your private `.env` / `.env.local` configuration into the new project. Keep your existing owner account; do not generate a new setup code for a working owner.

Open PowerShell in the extracted folder containing `package.json`:

```powershell
npm.cmd start
```

- Shop: http://localhost:4174/
- Owner: http://localhost:4174/owner/
- Customer orders: http://localhost:4174/account/

Keep PowerShell open. Stop the server with Ctrl+C. The included build does not need `npm ci` to run.

## First installation

Follow GOOGLE-SETUP.md to create a Google OAuth web client and save the settings in `.env` or `.env.local` (use one file consistently). No credentials are included. Set the redirect URI to `http://localhost:4174/api/auth/google/callback` for this build.

```powershell
npm.cmd run owner:setup
npm.cmd start
```

Use the private setup code on `/owner/` and choose the single Google account that owns the shop. Do not share that code. Later owner sign-ins use Google only. No Google password is entered into SPL.

## Set up your shop

1. Open **Brands** in the owner dashboard and add your brand names. Existing laptop brands are already listed. Then open **Products** and review your laptops. Assign **Brand New** or **Good Second** and enter the brand for each product. Upload several laptop photos, choose a cover and click Save product. The original sample laptops are all listed as Good Second.
2. Open **Payment methods** and add your actual bank/wallet details and QR photo. At least one method must be visible before customers can place new orders.
3. Test a purchase using a separate Google customer account/browser. Customers browse without an account and sign in only at checkout or to view their orders.
4. After ordering, the customer transfers payment using the saved instructions and selects all receipt photos and sends them together (one photo per transfer). Review every transfer in your bank/wallet app and the combined amount before confirming payment. Receipt upload alone does not mark an order paid.

5. Use **Accounts** to search customers and suspend/restore shop access. Use **Visitors** to see daily browser counts in Myanmar time. Tracking continues from your preserved database; it cannot recover visits from before tracking was installed.

Read MANAGEMENT-GUIDE.md for brands, accounts and traffic, PRODUCT-PHOTOS.md for galleries, PAYMENTS-GUIDE.md for receipt review and README.md for development and hosting.

## Reliability changes

New orders have a 24-hour receipt deadline by default. A receipt upload pauses automatic expiry for owner review. Existing orders are preserved without a new deadline. Customers can have three unpaid orders at once. Order history now has reference search, status filters and Previous/Next pages. Read REVIEW-AND-CHANGES.md before upgrading and check `.env.example` for optional hosting and receipt-limit settings.
