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
5. Select a receipt photo for **each transfer**. Choose several at once or add more before sending. Each JPG, PNG or WebP must be up to 3 MB; one order can hold up to 20 receipts. You can do this immediately after ordering or later in **My orders**. Every photo should show the amount, recipient and transaction reference.
6. Click **Send receipts to SPL** (the button shows your receipt count). Photos upload one at a time, then the full set goes to review. If an upload fails, the successful photos stay attached; retry the remaining photos. The owner cannot confirm an unfinished draft.
7. Track the payment review and order status in **My orders**.

## Split KPay transfers

If your KPay limit is 1,000,000 MMK per transfer, a 2,700,000 MMK order can be paid as 1,000,000 + 1,000,000 + 700,000. Upload all three receipts to that same order. SPL does not enforce a wallet transfer limit or send the transfers for you; use your actual account limits. Confirm delivery charges separately with the shop before paying.

## Owner review

Open **Orders** to see receipts awaiting review. Open every receipt and check each transfer in your actual bank/wallet records. Add the received amounts and make sure they cover the full payment before confirming. A single confirmation covers the whole submitted set. A receipt image is supporting evidence, not proof that money reached the account.

- **Confirmed:** the owner has checked payment. The order can then be confirmed, prepared and completed.
- **Check your receipts:** give the customer a reason, specifying which receipt or transfer needs attention. Good photos stay attached; they can remove an unclear photo and add its replacement, or attach a missing transfer. Removed photos stay in the private history.
- **Receipts to send:** the customer has not sent the full set for review yet. This includes partly uploaded drafts.
- **Receipts under review:** the customer has sent the set and the owner needs to check all transfers.

Adding or removing a photo pauses a pending review. The customer must send the updated set again. Version checks stop an owner from approving a stale set. Confirmed payments and cancelled/completed orders cannot accept receipt changes.

Payment review is separate from order fulfilment. Uploading a receipt does not confirm payment or the order automatically. Confirmation by the owner records a manual decision; there is no bank API reconciliation. Cancellation does not send refunds. Arrange refunds directly with the customer and payment provider.

Receipt images are private: only their customer and the authorised owner can fetch them. They are not placed in public product/QR uploads. Previous receipts and payment decisions stay in the order's history when a replacement is submitted. Keep the whole private data folder in backups, and review your retention/deletion policy before collecting real customer receipts.
