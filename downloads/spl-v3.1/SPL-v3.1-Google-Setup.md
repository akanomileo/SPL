# Google sign-in setup — customers and owners

This version uses Google OAuth 2.0 / OpenID Connect, not access to Gmail messages. It requests only `openid email profile`. Google passwords are entered on Google's own page, never in SPL. The server exchanges a one-time authorization code and verifies Google's signed identity token. Access/refresh tokens are not retained.

The customer website contains no owner-dashboard link. Owners open `/owner/` directly or keep a private bookmark. Dashboard data is protected by server-side authentication and owner checks; the URL itself is not an access credential. No owner email is sent in the public Google configuration endpoint.

## Create the Google OAuth application

1. Open https://console.cloud.google.com/ and select or create your project.
2. Configure Google Auth Platform (OAuth consent screen): app name, support/developer email and audience. For testing with personal Gmail accounts, choose External and add the customer/owner Google accounts as test users.
3. Under Clients / Credentials, create an OAuth client with application type **Web application**.
4. Add this **Authorized redirect URI**, exactly:

   `http://localhost:4174/api/auth/google/callback`

   This is a server-side redirect flow; Authorized JavaScript origins are not needed.
5. Keep the client ID and client secret from that client. Do not post the secret in chat, GitHub or source files.

## Configure your local copy

Create a file named `.env.local` beside `package.json` with your real values:

```dotenv
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_PRIVATE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=http://localhost:4174/api/auth/google/callback
GOOGLE_OWNER_EMAILS=YOUR_OWNER_EMAIL@gmail.com
```

Replace all placeholders. You may use comma-separated owner emails. Gmail and Google Workspace accounts are supported; unrelated non-Google-hosted email addresses attached to Google accounts are intentionally rejected because Google may not remain authoritative for them.

Restart the app using `npm.cmd start`, then open **http://localhost:4174/** (use localhost consistently for the callback, cookie and website).

- Customer: click **Continue with Google**. A new verified account is created automatically. Existing accounts sign in without registration.
- Owner: open **http://localhost:4174/owner/** and use **Continue with Google** with an approved email. A fresh approved Google email creates an owner account; you do not need `owner:create` first.
- Ordinary customers cannot request owner status. Owner approval comes only from the private server configuration.

### If your email already has a password account

Google will not silently take over or merge an existing account. Sign in with its current password, open your customer/owner dashboard and click **Link Google account**. Select the Google account with the exact same verified email. Subsequent Google sign-ins use the same account and orders. Linking a customer never promotes it to owner. If an approved owner email was previously registered as a customer, an administrator must resolve/provision its owner role through the private server; changing the allowlist alone will not elevate that existing customer.

Existing password owners must also have their email in GOOGLE_OWNER_EMAILS before linking. Removing an owner from the allowlist and restarting the server invalidates its Google owner sessions on the next request; password owner access remains controlled by the existing owner account. Changing the allowlist does not remove an existing user's underlying role. To revoke all access, the administrator must revoke the local account/sessions too.

## Development / future hosting

For `npm.cmd run dev`, add a separate authorized redirect URI:

`http://localhost:3000/api/auth/google/callback`

Change GOOGLE_REDIRECT_URI to that exact address, restart development, and open http://localhost:3000/. Do not use the backend's internal port 3001 for Google's callback.

For hosting, register `https://YOUR-REAL-DOMAIN/api/auth/google/callback` in the same OAuth client (or a dedicated production client). Set GOOGLE_REDIRECT_URI to that URL and PUBLIC_ORIGIN to `https://YOUR-REAL-DOMAIN`, set NODE_ENV=production, and restart. Production callbacks require HTTPS and the same domain as PUBLIC_ORIGIN. Keep private environment values on the server and outside the web root. Complete Google's consent/publishing requirements before opening sign-in to customers beyond your test users.

If Google is unconfigured, the app hides the Google button and password sign-in still works. A partially configured client fails startup rather than pretending sign-in is available. If the Google button appears but sign-in fails, confirm the exact redirect URI, test-user list, client ID/secret and chosen owner address. No real OAuth client/secret or live-domain Google login was available during development; tests use locally signed mock Google responses and reject bad signatures, issuer/audience, expiry, unverified emails, wrong nonce, replayed/wrong-browser state and unauthorized owner accounts.

Only allow outbound HTTPS to accounts.google.com, oauth2.googleapis.com and www.googleapis.com where your hosting firewall restricts it. Use the host's supported proxy configuration if required; never disable TLS verification.

Keep the existing `data` folder when updating from v3. The backend adds Google identity/flow tables and a session-provider column without deleting users, orders or catalog data. Stop the old server and back up the full data folder before replacing application files. Do not overwrite .env.local. No database, private uploads or Google credentials are included in the release ZIP.
