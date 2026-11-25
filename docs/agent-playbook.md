# Agent-oriented maintenance playbook

The original portfolio source is modular, so you can safely assign future updates to distinct AI coding agents. **These role descriptions are a workflow for future edits, not a claim that autonomous agents were used or deployed.**

## 1. UI/UX designer agent

**Scope:** `apps/web/src/styles/` (tokens + primitives; never edit `legacy-admin.css` for public changes), the per-component/page stylesheets next to their `.tsx` files, `apps/web/src/components/` (including the `fx/` motion library), and `preview/`.

**Goal:** Keep the visual language consistent: dark navy surfaces, mint accents, readable Space Grotesk headings, accessible contrast, whitespace, clear navigation, and meaningful animation.

**Prompt:** "Audit mobile and desktop views (375, 768, 1440 px) of this portfolio. Preserve existing content contracts and improve contrast, focus states, typography, visual hierarchy, and perceived performance. Make screenshots for before/after comparison. Respect `prefers-reduced-motion`. Do not touch auth or routes without an explicit handoff."

## 2. Frontend engineer agent

**Scope:** `apps/web/src/pages/`, `context/`, `types.ts`, `lib/api.ts`.

**Goal:** Keep screens typed and content editable. Prefer controlled inputs, meaningful empty states, responsive layout, and no hardcoded personal identifiers outside seed JSON.

**Prompt:** "Implement the approved design with React + TS. Use existing `Site`, `Project`, and `Post` interfaces. Keep admin edits persisted via API. Do not add direct database credentials to the browser bundle."

## 3. API/security engineer agent

**Scope:** `apps/api/src/`.

**Goal:** Google ID-token verification, verified-email first-owner claim, immutable owner, RBAC, input validation, safe session and upload handling.

**Prompt:** "Review trust boundaries in auth, admin CRUD and uploads. Verify all state-changing routes enforce active roles and same-origin semantics, preserve owner immutability and revoke sessions on role changes. Add tests for any new authorization logic."

## 4. Content editor agent

**Scope:** `content/seed.json` (for new deployments) and admin-managed content.

**Goal:** Human, accurate, concise engineering storytelling. Do not publish sample blog posts as personal stories. Do not invent employer metrics, project links, or client secrets.

**Prompt:** "Rewrite these portfolio summaries in a natural first-person engineering voice, with evidence-backed scope and clear outcomes. Flag claims needing verification."

## 5. QA/accessibility agent

**Scope:** E2E tests, responsive screenshots, keyboard navigation, accessibility audits.

**Goal:** Check core journeys: homepage → project, blog search → article, owner Google login → dashboard, project edit → publish, post draft → publish, role approval → access, disabled account → session revocation, upload → saved image.

**Prompt:** "Run build/typecheck, automated tests, keyboard-only navigation and accessibility scans. Report reproducible defects by severity. Never silently change auth requirements or sample content."

## Merge / handoff rule

Each agent should deliver (a) affected files, (b) assumptions and changes, (c) tests run, (d) screenshot or API result, (e) known risks. One integrator reviews the total changes before deployment. Never allow an AI agent to deploy or grant Google admin access without the owner's explicit approval.
