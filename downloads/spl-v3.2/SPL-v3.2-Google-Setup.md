# Google-only sign-in setup

SPL uses Google OAuth 2.0 / OpenID Connect for customers and the single owner. It requests only openid/email/profile. It does not read Gmail messages or ask for your Google password. Your first Google sign-in creates an account; subsequent sign-ins reuse it.

## Google Cloud configuration

1. Open https://console.cloud.google.com/ and select/create a project.
2. Configure Google Auth Platform / OAuth consent screen (app name, support/developer email, audience). For personal Gmail accounts choose External. During testing, add your chosen owner and customer Google accounts as test users.
3. Under Clients / Credentials create a **Web application** OAuth client.
4. Add this exact **Authorized redirect URI**:

   `http://localhost:4174/api/auth/google/callback`

   This is a server redirect flow; Authorized JavaScript origins are not needed.
5. Obtain the client ID and private client secret. Never post the secret in chat or GitHub.

Create `.env.local` beside package.json with your real values:

```dotenv
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_PRIVATE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=http://localhost:4174/api/auth/google/callback
```

Replace all placeholders. No owner email is configured in this file. GOOGLE_OWNER_EMAILS from v3.1 is no longer used. Supported identities are Gmail and verified Google Workspace accounts; third-party non-Google-hosted emails attached to Google accounts are rejected because Google may not remain authoritative for them.

## Choose exactly one owner

In a private terminal in the application folder:

```powershell
npm.cmd run owner:setup
npm.cmd start
```

The first command prints a private one-time code valid for 24 hours. Open http://localhost:4174/owner/, enter the code and choose any Google account you intend to own the shop. Its stable Google account ID is bound in the private database. A different Google account cannot enter the owner dashboard or create another owner. The setup code authorizes first ownership, not normal login; keep it private and do not send screenshots containing it. If the code expires before successful setup, stop the server and run owner:setup again. Creating another code before binding invalidates the prior code.

Customers open http://localhost:4174/ for Google login/sign-up, then the shop. Use **localhost consistently** for the website and callback. Owners have no public link in customer navigation and open /owner/ directly or bookmark it privately. Normal owner login needs only Google, with no setup code. The route URL is not an access credential; server authentication controls owner data.

An administrator with private console access can intentionally change the owner using `npm.cmd run owner:setup -- --replace`. This revokes old owner sessions immediately and makes the former owner a customer. The new setup code selects the replacement Google account; only one account is allowed at a time. Orders/products are retained. Do not expose this command through the website.

## Updating existing accounts

Keep the old data folder and .env.local. Previously Google-linked customers retain their accounts/orders. Legacy password login is disabled. A private administrator can approve a legacy customer's Google migration with `npm.cmd run account:migrate -- customer@gmail.com`, after verifying the correct account owner. Its next verified Google sign-in uses the original account and orders. It does not grant owner access. During authorized owner setup, the chosen verified Google owner can use an older account with the same email; the setup code authorizes that migration. Existing user sessions with password providers are rejected.

## Development / production

For `npm.cmd run dev`, add and use this callback instead:

`http://localhost:3000/api/auth/google/callback`

Update GOOGLE_REDIRECT_URI and restart. Open http://localhost:3000/; port 3001 is only the internal backend.

For hosting, register `https://YOUR-REAL-DOMAIN/api/auth/google/callback`. Set GOOGLE_REDIRECT_URI to that full URL, PUBLIC_ORIGIN to https://YOUR-REAL-DOMAIN and NODE_ENV=production. Use HTTPS and the same domain for callback/public origin. Complete Google's consent/publishing requirements before serving users beyond the test list. Domain purchase alone does not supply the Node server/database hosting.

If Google credentials are absent, the first page remains a login page explaining that Google setup is required. It does not show the shop or allow password fallback. Partial Google settings fail startup. If sign-in fails, check the exact callback URL, test-user list and client ID/secret. Restricted hosting firewalls need HTTPS access to accounts.google.com, oauth2.googleapis.com and www.googleapis.com; never disable TLS verification.

Real OAuth credentials were not supplied during development. Automated tests use signed mock Google responses and browser tests simulate Google selection, so live Google consent/sign-in is still to be verified after your configuration. No client secret, owner binding, private setup code, customer data, database or private uploads are shipped in the ZIP.
