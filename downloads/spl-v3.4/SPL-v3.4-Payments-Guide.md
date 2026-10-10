# Bank and wallet payments

SPL displays the shop's payment instructions and records receipts. Customers transfer money using their own banking/wallet app; this website does not initiate transfers or process cards.

## Owner setup

Sign in at `/owner/` and open **Payment methods**. Add a method with:

- A short label customers can recognise, such as your actual bank or wallet name.
- Bank/wallet name, recipient name and account number, or a QR image with payment instructions.
- Any details the customer needs before paying. Include your delivery-fee arrangement if applicable; the website's order total is the item subtotal.

Upload a JPG, PNG or WebP QR photo, up to 3 MB. Confirm the QR and account details are yours before making the method visible. No payment method is preconfigured. Customers cannot place new orders until the shop has at least one visible method.

You can edit or hide methods later. Each order keeps the details selected when it was placed, including the original QR image. Changing the settings does not rewrite existing orders. If old details must no longer be used, contact affected customers directly before they transfer; editing the method does not notify them automatically.

## Customer purchase

1. Browse products and add them to the bag without signing in.
2. Continue to checkout and sign in with Google.
3. Enter delivery details, choose one of the shop's visible payment methods, review the total and place the order.
4. Use the order's saved bank/wallet instructions or QR photo. Confirm any delivery fee with the shop before transferring; it is not added automatically.
5. Upload a clear JPG, PNG or WebP receipt photo, up to 3 MB. You can do this immediately after ordering or later in **My orders**. The receipt should show the amount, recipient and transaction reference.
6. Track the payment review and order status in **My orders**.

## Owner review

Open **Orders** to see receipts awaiting review. Check the transfer in your actual bank/wallet records before confirming payment. A receipt image is supporting evidence, not proof that money reached the account.

- **Confirmed:** the owner has checked payment. The order can then be confirmed, prepared and completed.
- **Needs a new receipt:** give the customer a reason. They see that note and can upload a replacement.
- **Awaiting receipt:** the customer has not uploaded yet.
- **Pending review:** a receipt has arrived and the owner needs to check it.

Payment review is separate from order fulfilment. Uploading a receipt does not confirm payment or the order automatically. Confirmation by the owner records a manual decision; there is no bank API reconciliation. Cancellation does not send refunds. Arrange refunds directly with the customer and payment provider.

Receipt images are private: only their customer and the authorised owner can fetch them. They are not placed in public product/QR uploads. Previous receipts and payment decisions stay in the order's history when a replacement is submitted. Keep the whole private data folder in backups, and review your retention/deletion policy before collecting real customer receipts.
