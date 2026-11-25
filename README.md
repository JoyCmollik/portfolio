# Joy / Studio — a full-stack engineer's portfolio

Modern, content-managed MERN portfolio for **Joy Chandra Mollik**. Built with React + TypeScript + Vite, Express, MongoDB, verified Google sign-in, and D3-powered skills. Everything is original and designed to be maintained without editing components whenever you publish a post or project.

> **Status:** Complete source project. The frontend has offline preview data, but publishing and authentication require MongoDB, a Google OAuth client ID, and server configuration. Dependencies could not be installed in the packaging environment because the npm registry was unreachable; run `npm install` locally to compile and launch.

## What's included

- Responsive dark-mode design, professional photo treatment, micro-animations, navigation and custom project artwork.
- Homepage, project archive with category filters, individual project pages, about/experience timeline, blog search & tags, and Markdown article pages.
- **D3** `forceSimulation` skill constellation. Honors reduced-motion preferences.
- `/admin`: dashboard, editable hero/about, contact links, images, role history, skills, stats, project management, blog Markdown editor with preview and drafts, and access controls.
- Google Identity Services ID credential verified **on the backend** with Google's auth library; short-lived identity ID tokens are not used as sessions. Instead, the API issues **HTTP-only, SameSite=Lax, Secure-in-production** 7-day signed session cookies.
- Atomic one-time **owner claim** with `Ownership._id='owner'`. In production, `BOOTSTRAP_ADMIN_EMAIL` restricts that claim to your designated Google account. Everyone else starts `pending/viewer`; the owner or administrator must approve access.
- Role permissions: `owner` (permanent, cannot be demoted), `admin` (manage content and ordinary users), `editor` (manage content only), `viewer` (no dashboard access). Only owner can create or change other admins. User edits revoke old sessions.
- File uploads for JPG/PNG/WebP, capped at 6 MB and checked by actual file signature; backed by local persistent disk.
- Content pre-seeded from `content/seed.json` **only when collections are empty**; subsequent edits are stored in MongoDB.

## Repository map

```text
joy-mern-portfolio/
├── apps/
│   ├── web/                     React 19 + TypeScript + Vite 8
│   │   ├── public/images/       Your photo and hero cutout
│   │   └── src/
│   │       ├── components/      Site shell, command palette, cards, project art, D3 constellation
│   │       │   ├── fx/          Motion & effects library (smooth scroll, cursor, reveals, WebGL shader…)
│   │       │   └── home/        Home page sections
│   │       ├── pages/           Public pages (+ their CSS) and the Admin studio
│   │       ├── context/         Auth and content providers
│   │       ├── lib/             HTTP client, safe URLs, motion + intro helpers
│   │       ├── styles/          tokens.css, base.css, legacy-admin.css (admin only)
│   │       └── config.ts        Owner time zone for the live local-time displays
│   └── api/                     Express 5 + Mongoose
│       ├── src/models/          User, Ownership, Site, Project, Post
│       ├── src/routes/          Auth, public and RBAC admin routes
│       ├── src/middleware/      Session and permissions
│       └── uploads/            Generated media: use persistent disk
├── content/seed.json           Initial content for both demo + database
├── README.md
└── package.json                npm workspaces
```

## 1. Requirements

- Node.js **22.12+** (recommended Node 22 LTS or 24 LTS)
- npm 10+
- MongoDB 7+ locally or MongoDB Atlas
- Google Cloud Project with a **Web** OAuth 2.0 client ID

## 2. Local setup

```bash
# From the repository root
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Edit `apps/api/.env`:

```ini
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/joy_portfolio
GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
SESSION_SECRET=AN_UNGUESSABLE_RANDOM_STRING_AT_LEAST_32_CHARACTERS
BOOTSTRAP_ADMIN_EMAIL=your-own-google-email@example.com
WEB_ORIGIN=http://localhost:5173
```

Generate the secret with `openssl rand -hex 48`.

Edit `apps/web/.env`:

```ini
VITE_GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
```

**The API and web client must use the same Google Web OAuth client ID.** Restart after changing `.env`.

In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), create an OAuth client ID of type **Web application**, and add these **Authorized JavaScript origins**:

- `http://localhost:5173` for development
- `https://your-domain.com` for production

You do not need Google API scopes for this identity-only login, or a Gmail/Drive API integration. Configure the OAuth consent screen and its test users/publishing status as appropriate for your Google Cloud app. The client ID is public; the server's `SESSION_SECRET` must be private.

Start MongoDB locally (or set your Atlas URL). If Docker is installed, `docker compose up -d` starts the included loopback-only MongoDB service. Then:

```bash
npm run dev
```

Visit **http://localhost:5173** for the website and **http://localhost:5173/admin** for the content studio. The Express API is proxied at `/api` and listens on port 4000. Health endpoint: `http://localhost:4000/api/health`.

**Only want to preview the design?** Run `npm run dev:web`. If the API cannot be reached, the public pages show initial demo content from `content/seed.json`; the admin dashboard still needs the server and database. The included `design-preview.html` also shows a partial static home mockup without npm.

## 3. First-owner signup and later accounts

1. Set `BOOTSTRAP_ADMIN_EMAIL` to the Google address **you control** before public deployment.
2. Open `/admin` and sign in with that account. The Google ID token is validated for signature, issuer, audience, expiration and verified email by Google's library.
3. The server inserts the singleton ownership record on first authorized login. **That account becomes `owner`**. The owner claim cannot be transferred through the regular admin UI.
4. Other people may sign in with Google, but start as `pending/viewer`, without access to the studio.
5. In **Team & roles**, change a person's status to `active` and role to `editor` or, as owner, `admin`. Click **Save**. A `viewer` has no admin access. Disabling access invalidates prior sessions.
6. Sign out via dashboard sidebar. Sessions expire after seven days or after permissions change; users reauthenticate using Google as needed. No Google refresh tokens are stored.

**Safety:** `BOOTSTRAP_ADMIN_EMAIL` is mandatory in production. Without it, a first-visitor-wins signup pattern would let a stranger take ownership. Development allows first verified user if this variable is absent for local experimentation; keep it configured even locally.

## 4. Maintaining the content

Use the studio instead of modifying code:

| Dashboard section | Controls |
|---|---|
| Site & profile | Intro, titles, bio, contact email, links, resume URL, photos |
| Experience | Create, edit, delete chronological work history entries |
| Skills & stats | Skill categories (D3 nodes) and homepage metrics |
| Projects | Add, reorder, tag, feature, draft, publish, upload screenshots, link GitHub/demo |
| Blog articles | Markdown writing & safe preview, tag filtering, article covers, draft/publish |
| Team & roles | Approve, disable, edit roles; prevent self-demotion and owner removal |

**Important before launch:** Seeded blog articles are examples and visibly labeled as such. Replace them with your own writing. Project case studies are starting descriptions based on your provided profile; review and add accurate links. Your public email, GitHub, LinkedIn and resume are blank, not guessed.

### Managing images

The edited tapered-faux-hawk studio portrait is used for both `/images/joy-portrait.webp` and `/images/joy-hero.webp`. The unedited original JPEG, the full-resolution updated studio PNG, and the earlier transparent PNG are included in `design-assets/` for Photoshop-friendly editing; see `docs/IMAGE_DESIGN_GUIDE.md`. You can change both independently under **Site & profile**. Uploaded images are stored in `apps/api/uploads/` and returned as `/uploads/...`. They survive application restarts only if the server's storage does. For deployment on a stateless provider, mount a persistent volume **or adapt the upload module for S3** before enabling uploads.

## 5. Deployment

### Single-domain deployment (recommended)

1. Provision MongoDB Atlas or MongoDB with auth, TLS and a private connection string.
2. Set the production environment variables in `apps/api/.env` / your hosting provider:

```ini
NODE_ENV=production
PORT=4000
MONGODB_URI=mongodb+srv://...
GOOGLE_CLIENT_ID=...
SESSION_SECRET=...   # strong and private
BOOTSTRAP_ADMIN_EMAIL=...
WEB_ORIGIN=https://your-domain.com
```

3. Before building, set `VITE_GOOGLE_CLIENT_ID` for the web build (Vite embeds it at build time).
4. From the project root:

```bash
npm ci       # if package-lock.json was generated locally; otherwise npm install
npm run build
npm start
```

5. The API serves `apps/web/dist` as static web content, and serves SPA routes via the fallback. Put a TLS-enabled reverse proxy in front of port 4000. Route the frontend and `/api` through the **same origin** to keep HTTP-only cookies same-site.
6. Configure Google's authorized JavaScript origin for that HTTPS domain and make sure the OAuth consent screen is correctly published/tested.
7. Set a **persistent upload directory** on the server, back up the MongoDB database, add monitoring, and review your security and privacy posture before a public launch. A `Dockerfile` is included for platforms supporting containers; pass `VITE_GOOGLE_CLIENT_ID` as a build argument, and all server settings as runtime environment variables.

**Production considerations:** You can add image optimization/CDN, a managed object store, a contact-email service, and tests with a disposable MongoDB database. Rate limits and secure headers are present but should be verified against your hosting platform and reverse proxy. Avoid making a production deployment without checking configuration and security.

## 6. NPM commands

```bash
npm run dev          # API + Vite, development
npm run dev:web      # Public site preview without a backend
npm run dev:api      # Express only
npm run build        # Type-check and bundle frontend
npm run test         # Backend helper unit tests
npm start            # Production Express server
```

## 7. Design/engineering decisions

- **D3 only where it adds value:** interactive skill clusters use force collision and group attraction. CSS handles simple visual motion, keeping the site fast.
- **Photo placement:** a full-bleed tapered-faux-hawk studio hero portrait keeps the headline legible; the unedited original photo remains available in the design assets. Both are included locally to avoid flaky external image URLs.
- **Backend-driven CMS:** public API content and admin CRUD are separate; public routes only expose published work. Admin content uses Zod input validation; MongoDB collections persist changes.
- **Safe Markdown:** the browser renders Markdown with `rehype-sanitize`, not raw HTML execution.
- **No invented links:** add your email, public socials, GitHub repos and demos only when you want them public.
- **Accessibility:** visible focus states, semantic headings, useful labels and reduced-motion support; review on real devices before launching.

## 8. Design system, motion and effects

The public site uses a "signal over noise" design language: deep ink surfaces, a mint/cyan/violet signal gradient, Space Grotesk display type with an Instrument Serif italic accent, JetBrains Mono labels, and purposeful motion.

- **Tokens and primitives:** `apps/web/src/styles/tokens.css` (colours, type scale, spacing, easing) and `base.css` (buttons, chips, kickers, glass, grid backgrounds). Every page and component imports its own stylesheet next to it.
- **Motion library:** `apps/web/src/components/fx/` provides Lenis smooth scrolling, a custom cursor, a first-visit preloader, masked word reveals, magnetic buttons, spotlight cards, tilt, counters, marquees, scroll-linked highlighting, a live local-time clock and a raw-WebGL aurora backdrop (no 3D library).
- **Generated project art:** projects without an `imageUrl` get deterministic, accent-coloured key art (`components/ProjectArt.tsx`). Upload a screenshot in the studio to replace it.
- **Command palette:** press <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> anywhere on the public site to jump to pages, projects, articles and links.
- **Accessibility:** everything honours `prefers-reduced-motion` (no smooth scroll, cursor, preloader, parallax or autoplaying motion), keyboard focus is visible and managed in overlays, and decorative layers are hidden from assistive tech.
- **Time zone:** the local-time displays use `TIMEZONE` in `apps/web/src/config.ts` (`Asia/Dhaka`).
- **Effects playground:** in development, open <http://localhost:5173/lab> to see every primitive, the shader and all project-art variants. This route is excluded from production builds.
- **Content Studio isolation:** the admin keeps its original look through `styles/legacy-admin.css`, where every rule is scoped under `.admin-main`, so public styles and admin styles never affect each other.

## Source references

- [Google: Verify ID tokens on your backend](https://developers.google.com/identity/sign-in/web/backend-auth)
- [Vite 8 documentation and Node requirements](https://vite.dev/guide/)

**License:** You own this generated project and may adapt it for personal or commercial use. Verify upstream dependency licenses before distributing them.
