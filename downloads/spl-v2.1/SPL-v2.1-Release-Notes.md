# SPL Storefront v2.1 release notes

## Changes

- Myanmar phone digits are accepted and normalized in prepared summaries.
- Browser request references fall back to cryptographic getRandomValues when randomUUID is unavailable. Missing randomness shows a recoverable error and retains the bag and form.
- Preparing a request keeps the bag. The share step explicitly reminds customers to copy/download the full summary before leaving. Saved history explicitly identifies its product-only downloads.
- Build configuration checks reject example domains, HTTP URLs, credentials, query/fragment URLs and mismatched site paths before removing build output.
- robots.txt is generated for all builds. A sitemap and domain-specific canonical/social metadata are produced when the actual HTTPS site URL is supplied.
- Updated React/react-dom/react-server-dom-webpack to 19.2.8, Vinext to 1.1.0, Vite to 8.3.4, RSC plugin to 0.5.34, and oxfmt to 0.72.0. Compatible transitive dependencies were refreshed and locked.
- Removed the unused shadcn CLI package. Its existing Tailwind stylesheet is retained locally with the original MIT license; generated UI components and branding are preserved.

## Analysis and verification

- Original source upload and its separate hosting ZIP matched exactly.
- Locked dependency installation, TypeScript, lint and 10 regression tests passed.
- Production root and /shop builds passed. The /shop build used the reserved test domain spl.test to verify canonical URL, social image URL, sitemap and robots output. That test domain is not included in the final portable build.
- Chromium checks at desktop and phone widths passed: image loading, specification search, saved items, bag, invalid-delivery handling, Back navigation, Burmese phone input, missing-randomness recovery, randomUUID fallback, full-summary download, retained bag after reload, and product-only request history downloads.
- Delivery details were absent from persisted browser state. No JavaScript page errors appeared in those flows.
- No horizontal overflow at 320, 390 and 1440 pixels. This is not a complete accessibility or all-browser audit.
- Both exports have 16 HTML-referenced assets; their HTTP responses were checked.

## Dependency limitations

npm audit dropped from 22 findings (3 critical, 16 high, 3 moderate) in the uploaded version to 9 (0 critical, 6 high, 3 moderate) after updates. Remaining flagged packages are braces, fast-glob, micromatch, vite-plugin-commonjs, vite-plugin-dynamic-import, vinext, fflate, satori and @vercel/og. They belong to framework/build/server dependency chains; the audit does not establish that each advisory applies to the static browser upload. No blanket security guarantee is made. Do not expose the development server publicly. There was no patched braces release in the registry during this review; audit's suggested Vinext downgrade would substantially change the framework and was not applied. Revisit upstream patches before adding a production Node server or processing untrusted build inputs.

## Before public launch

The ready-to-upload package is a portable domain-root build. No actual domain was supplied, so it omits canonical URLs, domain-specific sharing images and a sitemap rather than embedding a false URL. Set NEXT_PUBLIC_SITE_URL to your real full HTTPS URL in the source project and rebuild to enable those files. Configure HTTPS and redirects at your host. DNS, certificates and the real-domain deployment have not been tested.

Confirm real product photos and image usage rights, prices, stock, specifications, warranty and phone number. These facts were preserved from the upload, not independently authenticated. Requests still require customers to share them manually. Automatic orders, payments, accounts and live inventory are not implemented. Contact details are not retained after reload. Nothing was deployed or pushed to GitHub.
