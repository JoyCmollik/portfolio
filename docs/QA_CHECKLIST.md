# Launch QA checklist

## Automated (run locally after npm install)

- [ ] `npm run build` passes TypeScript + Vite bundle.
- [ ] `npm run test` passes helpers and any added API tests.
- [ ] `/api/health` responds with `ok: true`, `database: true`.
- [ ] `curl` public content contains only `published` projects/articles.

## Public site

- [ ] Homepage and navigation at 375px, 768px, 1024px and 1440px.
- [ ] Hero portrait does not overflow viewport or cover text.
- [ ] Menu can open/close with keyboard and touch.
- [ ] D3 visualization moves smoothly on desktop; reduced-motion users see a stable map.
- [ ] Projects category filters and detail pages work.
- [ ] Blog searches/tags and Markdown page content work.
- [ ] Missing email/socials do not show fake links.
- [ ] Heading hierarchy, visible focus and 200% zoom are usable.

## Identity & authorization

- [ ] Production without `BOOTSTRAP_ADMIN_EMAIL` refuses startup.
- [ ] Wrong Google email cannot claim initial owner.
- [ ] Correct owner email claims singleton once.
- [ ] Google token for a different OAuth client ID is rejected.
- [ ] New accounts are pending until explicitly approved.
- [ ] Editor can manage content but cannot manage users.
- [ ] Admin cannot promote a user to admin or demote another admin.
- [ ] Owner cannot be demoted via the UI/API.
- [ ] Disabled users lose old session access immediately.
- [ ] CSRF and cookie attributes behave correctly behind HTTPS reverse proxy.
- [ ] Image upload rejects >6 MB files and non-image bytes.

## Data/content

- [ ] `content/seed.json` only seeds empty collections.
- [ ] Project content, image and publication status persist after restart.
- [ ] Blog draft is never exposed from public API.
- [ ] Markdown HTML is sanitized.
- [ ] All illustrative sample articles replaced or unpublished.
- [ ] Your email, LinkedIn, GitHub, portfolio links and resume URLs are accurate.
- [ ] File uploads are backed by persistent storage.

## Hosting & security

- [ ] MongoDB Atlas network/auth/TLS configured, backed up.
- [ ] `SESSION_SECRET` is random (>=32 chars), never committed.
- [ ] Same-origin HTTPS website + `/api`; Google allowed origin updated.
- [ ] Headers/CSP confirmed in deployed browser console.
- [ ] Rate limits verified against production proxy/IP settings.
- [ ] Monitoring and error logs configured without sensitive data.
