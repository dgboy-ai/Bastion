# Frontend Gaps — Exhaustive Line-by-Line Audit (2026-07-19)

## FIXES APPLIED THIS SESSION (4 fixes)

| # | Issue | Fix |
|---|-------|-----|
| 1 | "JUDGES_RECOMMENDED" meta-text visible on screen | Changed to "RECOMMENDED" |
| 2 | Donut chart uses hardcoded strokeDasharray | Now computes from actual facts/semCache/episodic data |
| 3 | Stats API shows fake growth data when DB empty | Shows zeros instead of fake `[35,60,45,80,50,95,75,100]` |
| 4 | Landing page hash chain uses 8-char hashes | Changed to real 64-char SHA-256 hashes |

## PREVIOUS FIXES (from earlier sessions)

| # | Issue | Fix |
|---|-------|-----|
| 5 | Landing page shows "CLUSTER: OFFLINE" in red | Changed to "DEMO MODE" in amber |
| 6 | Duplicate CSS directory | Removed |
| 7 | Dead useInView.ts | Removed |
| 8 | Stale tests with describe.skip | Rewrote clean test file |
| 9 | No skip-to-content link | Added accessible skip link |
| 10 | No aria-hidden on canvas | Added aria-hidden="true" |
| 11 | Graph page no loading skeleton | Added shimmer skeleton |
| 12 | Tailwind CSS not imported | Added @import "tailwindcss" |
| 13 | CSP blocks Google Fonts | Added fonts.gstatic.com to font-src |
| 14 | Missing CSS classes | Added card-interactive, hover-glow, etc. |
| 15 | Mock graph data missing fields | Added attributes, id, type |
| 16 | Mock trust data missing distribution | Added trustLevelDistribution |

## WHAT JUDGES SEE NOW

### Landing Page (/)
- "THE FORTRESS OF AGENTIC" with rotating typewriter
- "DEMO MODE" in amber (not alarming red)
- Hash chain ledger with real 64-char SHA-256 hashes
- "RECOMMENDED" instead of "JUDGES_RECOMMENDED"
- Interactive poisoning simulator
- Feature comparison table
- FAQ with proper aria-expanded

### Dashboard (/dashboard)
- "Command Center" with live KPIs
- Donut chart that reflects ACTUAL data proportions
- Hourly growth shows real data (zeros when empty, not fake numbers)
- Memory Trust Score with real trust ring
- Agent Stability Index with drift chart
- Live Event Feed with SSE reconnect
- MemoryGuard OWASP ASI06 scanner

### Graph (/graph)
- Loading skeleton → D3 force-directed graph
- Time-travel slider (AS OF SYSTEM TIME)
- Node inspector with trust ring, drift chart, hash timeline

### Logs (/logs)
- Paginated table with search (25/page)
- Real hash display with tooltips

### Health (/health)
- Real-time freshness distribution

### Compliance (/compliance)
- EU AI Act Article 12 report
- Export JSON/CSV buttons
- "DISPLAYING SIMULATED DATA" when mock mode

### Flight Recorder (/flight-recorder)
- Audit event timeline with filters

## REMAINING ITEMS

### Would Be Nice (Not Blocking Top 3)
- 6 dead components (SqlExplainer, CspannHud, etc.) — fully built but not wired up
- Contact form sends nothing (client-side only)
- 1336-line landing page could be split
- Font inconsistency between pages (Space Grotesk vs Inter)
- No page transition animations

### Code Quality Notes
- 0 TypeScript `any` types (except one from pg library)
- 0 console.log in components (only console.error for error handlers)
- 16 API routes with consistent envelope
- 7 test files covering components, API, mock data, security
- Proper error boundaries on every page
- SSE with exponential backoff reconnection
- Timing-safe API key comparison
- Rate limiting (120 req/min per IP)
