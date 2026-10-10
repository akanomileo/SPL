# Owner accounts and visitor counts

Sign in to /owner/ with your existing owner Google account. Only that account can use these sections.

## Accounts

Search customers by name or email, filter by access status and browse pages of 25 accounts. Guests are not registered accounts. The owner account is excluded from the list. View order counts and completed-item totals across the customer’s history; click the order count to open their latest 200 orders. Join and last Google sign-in dates use Myanmar time. Existing older dates cannot be reconstructed and show Not recorded.

To suspend a customer, select Suspend, check the name/email and confirm. This immediately invalidates their SPL sessions and blocks future SPL sign-in with that Google identity. Existing orders and private receipts remain available to the owner for payment/delivery management. Suspension does not cancel or refund orders and does not change the person’s Google account. To restore access, select Restore and confirm; they sign in again with the same Google account and keep their orders. No passwords or extra owner accounts are created here. A stale action is rejected if another update has changed the account.

## Visitors

Choose Visitors and select the last 7, 30 or 90 days. The chart and table show visitors and shop openings for each Myanmar calendar day (UTC+06:30). Today’s counts and average visitors per tracked day appear above them. Refresh traffic updates immediately; the panel also refreshes every minute.

One browser with the shop’s anonymous first-party cookie counts once per day. Each new customer-shop page opening increments openings; automatic catalogue refreshes and repeated request retries do not. Guest and customer sessions both count. Owner sessions, recognised bots and Do Not Track requests are excluded. Visitors are estimated browsers, not verified people: multiple devices, private browsing, cleared cookies, blocked cookies or undetected automation affect counts.

Tracking starts when this version first runs. Earlier dates show a dash and are excluded from the daily average. There are no preloaded traffic figures and no way to recover past visits from older versions. Daily totals persist in the private SQLite database for about one year; recent daily deduplication hashes are pruned after two days. Analytics do not store IP addresses, email addresses or Google identity IDs. The visitor cookie is HttpOnly, SameSite=Lax, limited to the visitor endpoint and expires after 30 days; HTTPS hosting adds Secure. This uses your existing backend and does not require Google Analytics, another API key or a paid analytics service.

## Laptop brands

The customer filter has 88 current, regional and legacy names. Find a brand with its own search field. Radio buttons and labels share a left edge; numbers show actual listings for the selected condition. A zero count means no laptop for that brand/condition is listed; no stock is invented.

The owner Brand name field offers the same names and accepts another brand up to 50 characters. A saved visible product adds a custom brand to the directory automatically. Case differences such as Asus/ASUS match the same customer filter. No fixed list can permanently cover every local or future manufacturer; the custom field keeps the shop open to those brands.

## Upgrading

Stop the previous SPL server and follow UPGRADE.md to copy its entire private data folder and private .env settings. Keep your existing owner and OAuth callback. Do not run owner:setup again for a working owner. Back up the complete data folder, including receipts and uploads; keep private files outside public hosting directories and release ZIPs.
