# Frontend Gaps Audit — Bastion Dashboard

Generated from deep-dive analysis across routes, components, libs, styles, UX, and accessibility.

---

## CRITICAL (Must Fix)

| # | Issue | File:Line | Description |
|---|-------|-----------|-------------|
| C1 | **SQL Injection in cache-stats** | `api/cache-stats/route.ts:58` | `agentId` string-interpolated into SQL via template literal instead of parameterized query |
| C2 | **Missing favicon** | `public/` | No `favicon.ico` or `favicon.svg` — browser tab shows default icon |
| C3 | **Missing `output: 'standalone'`** | `next.config.ts` | Dockerfile references `.next/standalone` but config doesn't generate it |
| C4 | **Memory Distribution donut is FAKE** | `dashboard/page.tsx:304-306` | `strokeDasharray` hardcoded — never reflects actual data proportions |
| C5 | **Cache Hit sparkline is FAKE** | `dashboard/page.tsx:402` | Static SVG path never changes regardless of data |
| C6 | **`/api/asi06` GET always mock** | `api/asi06/route.ts:60` | Guard panel shows fabricated stats even with live DB |

---

## HIGH (Should Fix)

| # | Issue | File:Line | Description |
|---|-------|-----------|-------------|
| H1 | **No Next.js middleware** | (missing) | All dashboard pages accessible without auth — API routes have `requireAuth()` but pages don't |
| H2 | **`fetch.ts` leaks DB conn string** | `src/lib/fetch.ts` | Sends `localStorage.bastion_db_conn` as `x-bastion-conn` header on every request |
| H3 | **5 dead components (~1100 lines)** | `src/components/` | SqlExplainer, CdcPipelineViz+3 sub-components, CacheCostWidget, CspannHud, KpiCardGrid, CostComparison — never imported |
| H4 | **Orphaned `src/app/styles/`** | `src/app/styles/` | 5 CSS files with conflicting design tokens — never imported by globals.css |
| H5 | **CSS system inconsistency** | Multiple components | 5+ components use Tailwind (`bg-gray-900`, `rounded-xl`) while 10+ use design system CSS vars |
| H6 | **No state management** | All components | Raw `fetch` in `useEffect` — no React Query/SWR. No caching, dedup, or retry |
| H7 | **No shared types** | API + frontend | 10+ independently-defined interfaces for same data shapes — will drift |
| H8 | **Disabled search bar** | `dashboard/layout.tsx:199` | Input has `disabled` prop — UI suggests search but it's non-functional |
| H9 | **Flight Recorder uses Tailwind** | `flight-recorder/page.tsx` | Visually inconsistent with rest of dashboard |
| H10 | **Graph page breaks on mobile** | `graph/page.tsx:205` | Fixed `gridTemplateColumns: "1.9fr 1fr"` and `height: "640px"` — no responsive stacking |
| H11 | **No breadcrumbs** | All dashboard pages | No orientation cue within dashboard |
| H12 | **No `loading.tsx` for sub-routes** | graph/logs/health/compliance/flight-recorder | Only `/dashboard` has route-level skeleton |
| H13 | **Connection modal has no focus trap** | `dashboard/layout.tsx:309-430` | No `role="dialog"`, no Escape handler, no focus management |
| H14 | **Health page no auto-refresh** | `health/page.tsx` | Single fetch on mount unlike dashboard (10s polling) |
| H15 | **`/api/ltm-stats` empty `top_reused`** | `api/ltm-stats/route.ts:91` | Live mode returns `top_reused: []` while mock has data |
| H16 | **`/api/region-stats` hardcoded zeros** | `api/region-stats/route.ts:76` | `cross_region_syncs: 0` always in live mode |
| H17 | **Version strings inconsistent** | NavBar vs api/a2a | "v0.6.0" vs "v0.3.0" vs package.json "0.1.0" |
| H18 | **No OG/meta tags** | `layout.tsx` | No `og:title`, `og:description`, `og:image`, `twitter:card` |
| H19 | **Contact form has no backend** | `(marketing)/contact/page.tsx:210` | Client-side only — shows fake success |
| H20 | **`withFallback` masks outages** | `api-response.ts` | Silently returns mock data on DB failure |

---

## MEDIUM (Nice to Fix)

| # | Issue | Description |
|---|-------|-------------|
| M1 | No toast/notification system | CSS defines `.toast` classes but no component uses them |
| M2 | No pagination in logs/flight-recorder | Limited data with no user pagination controls |
| M3 | Marketing pages duplicate navbars | 3 separate nav implementations (landing, docs, contact) |
| M4 | `NEXT_PUBLIC_APP_URL` unused | Documented in .env.example but never referenced |
| M5 | Rate limiter per-process | Ineffective on serverless with multiple instances |
| M6 | `GlobalErrorHandler` rendered twice | Once in root layout, once in dashboard layout |
| M7 | Mock data never changes | Same 1,247 memories on every page load |
| M8 | Docs sidebar no mobile collapse | Fixed 260px width at all breakpoints |
| M9 | No export on graph/logs/flight-recorder | Only compliance page has export |
| M10 | SSE max connections unlimited | No connection limit on `/api/events` |
| M11 | `console.error` logs full objects | Dashboard routes log raw error objects |
| M12 | No real-time on graph/logs/health | Single fetch on mount, no polling or SSE |
| M13 | Inline design tokens in dashboard/page.tsx | `const C = {...}` duplicates CSS vars with different values |
| M14 | No print-friendly styles | No `@media print` for any page |
| M15 | Connection modal `window.location.reload()` | Should use state-based refresh instead |

---

## LOW (Polish)

| # | Issue | Description |
|---|-------|-------------|
| L1 | No page transition animations | Instant navigation, no fade/slide between pages |
| L2 | No skip-to-content link | Accessibility gap |
| L3 | No `<main>` landmark | `.page-container` has no semantic tag |
| L4 | No `aria-live` on event feed | Screen readers won't announce new events |
| L5 | Charts lack `<title>`/`<desc>` | DriftChart, TrustRing are pure SVG with no accessible text |
| L6 | Search input no `aria-label` | Disabled input has no label explaining state |
| L7 | Time slider no ARIA attributes | Missing `aria-valuemin`/`aria-valuemax`/`aria-valuenow` |
| L8 | FAQ buttons no `aria-expanded` | Accordion buttons lack expansion state |
| L9 | Color-only indicators | Green dot = live, red = error — no text alternatives |
| L10 | `prefers-color-scheme` not supported | No light mode option for accessibility |
| L11 | Hourly growth bars can overflow | Raw count * 15 + 20 can exceed 100% height |
| L12 | No manifest.json | No PWA support |
| L13 | No robots.txt or sitemap | SEO gap |
| L14 | CSP allows `unsafe-eval`/`unsafe-inline` | Weakens XSS protection |
| L15 | Dockerfile HEALTHCHECK hits wrong route | `/healthz` vs `/api/health` |
