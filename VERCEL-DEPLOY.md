# Deploy the storefront through Git to Vercel

This project keeps SQLite and uploaded receipts on a persistent disk. Vercel
serves the storefront and proxies its API requests, while the included Render
Blueprint runs the Node backend on a persistent disk. Do not deploy the current
server as a Vercel Function by itself: function filesystems are not durable.

The backend disk requires a paid Render web-service plan. Keep a separate
backup of `/var/data`; the disk is not a substitute for backups.

## 1. Push this project to Git

Push the contents of this project directory to a private GitHub repository.
`.gitignore` excludes the local database, uploads, `.env` files, dependencies,
and build output. Do not add `data/`, OAuth secrets, owner setup codes, or
customer information to Git.

## 2. Create the Vercel site

Import the GitHub repository into Vercel. The supplied production frontend is
checked into `dist/client`; `vercel.json` tells Vercel to skip the build and
serve that directory. The Vercel Functions under `api/` proxy API calls and
uploaded product/QR photos to the persistent backend. Keep `dist/client` in
Git. This project build currently skips its dynamic routes during a fresh
static export, so do not switch Vercel to `npm run build` until that export is
fixed and verified.

Set these Vercel environment variables for Production (and Preview only if you
intend to test against a separate backend):

| Variable | Value |
| --- | --- |
| `BACKEND_ORIGIN` | The backend's HTTPS origin, with no path; fill this after step 3. |
| `VERCEL_PROXY_SECRET` | A new random secret shared with the backend in step 3. |
| `NEXT_PUBLIC_SITE_URL` | The final HTTPS storefront origin, for example `https://shop.example.com`. |
| `NEXT_PUBLIC_BASE_PATH` | Leave empty. |

Vercel can deploy the storefront before the backend is configured, but API
requests will return 503 until `BACKEND_ORIGIN` is set and redeployed.

## 3. Create the persistent backend

In Render, create a Blueprint from the same repository and select
`render.yaml`. It defines a Node web service in Singapore with a 5 GB persistent
disk mounted at `/var/data`. The app binds to Render's `PORT` on `0.0.0.0`.
Render disk-backed services require a paid plan; review the plan and disk cost
in Render before creating the service.

Enter these values when Render requests them:

| Variable | Value |
| --- | --- |
| `PUBLIC_ORIGIN` | The final HTTPS Vercel storefront origin. |
| `GOOGLE_CLIENT_ID` | Your Google OAuth web client ID. |
| `GOOGLE_CLIENT_SECRET` | Your Google OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | `https://YOUR-STOREFRONT-DOMAIN/api/auth/google/callback` |
| `VERCEL_PROXY_SECRET` | Exactly the same new random secret set in Vercel. |

Generate a secret locally in PowerShell with:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Keep the secret private. The backend rejects direct API calls that do not come
through the Vercel proxy. The Vercel proxy forwards the visitor address for the
shop's sign-in rate limit.

In Google Cloud, add the redirect URI shown above to the OAuth web client.
Set the consent screen and publish/test-user access as required for your use.
Use the same origin in `PUBLIC_ORIGIN` and `NEXT_PUBLIC_SITE_URL`.

## 4. Connect both services

After Render deploys, set Vercel's `BACKEND_ORIGIN` to the Render service's
HTTPS origin, with no trailing path (for example,
`https://spl-connected-shop-api.onrender.com`). Redeploy the Vercel project.

From the Render service shell, run `npm run owner:setup` once and keep the
printed setup code private. Open the Vercel storefront's `/owner/`, enter the
code, and sign in with the Google account that will own the shop. Then add
payment methods and review the sample products before accepting orders.

## 5. Verify before accepting real orders

Use separate customer and owner browser profiles. Confirm sign-in, catalog
browsing, checkout, receipt upload and review, order cancellation, stock return,
and customer order privacy. Confirm you can stop the backend, restart it, and
still see the data on `/var/data`. Configure and test a separate backup before
using real customer information.

The proxy accepts request bodies up to 4 MiB, which covers this app's 3 MiB
receipt and product-photo upload limits. It buffers those requests in memory.
The Vercel site is not a standalone deployment: keep the persistent backend
running and configure both services' environment variables.
