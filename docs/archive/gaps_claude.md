# Bastion Dashboard — Honest Frontend Gap Analysis
> Written for: CockroachDB Hackathon submission readiness  
> Scope: `/dashboard` frontend only (not landing page)  
> Author: Antigravity analysis pass, July 2026

---

## Executive Verdict

**Honest score: 4/10 for production-readiness.**

The dashboard has a solid data layer (real CockroachDB queries, SSE, MVCC time-travel) but the frontend presentation is broken in ways judges will notice immediately. Two completely different design systems are fighting each other. Key panels look like they were written by different developers on different days.

The good news: the *data* is real. The gaps are 100% fixable UI/UX work.

---

## 🔴 CRITICAL: Two Incompatible CSS Systems Are Clashing

### The Root Problem
The dashboard uses **two completely different CSS frameworks simultaneously**:

1. **Custom design system** (`globals.css` → `variables.css`, `reset.css`, `components.css`) — uses CSS variables like `var(--canvas)`, `var(--accent-breeze)`, panel classes like `panel`, `kpi-card`, etc.
2. **Tailwind CSS utility classes** — used directly inside `LtmGatewayWidget.tsx` and `ObservationsWidget.tsx` with classes like `bg-gray-900`, `rounded-lg`, `text-emerald-400`, `flex`, `space-y-4`.

### Where It Breaks
- `LtmGatewayWidget.tsx` line 56: `className="bg-gray-900 rounded-lg border border-gray-800 p-6"` — **Tailwind**
- `ObservationsWidget.tsx` line 65: `className="bg-gray-900 rounded-lg border border-gray-800 p-6"` — **Tailwind**
- `dashboard/page.tsx`: Uses `background: C.card`, `border: 1px solid ${C.hairline}` — **Custom vars**

### Visual Impact (what judges see)
These two widgets render with **completely different backgrounds, border colors, spacing, and typography** from every other panel. The "LTM Gateway" and "Observations" section in the screenshot renders as a wall of raw, unstyled text. Tailwind classes like `grid grid-cols-3` and `bg-gray-800` are not being applied because Tailwind is either not configured or not purging correctly for those components.

### Fix Required
Rewrite `LtmGatewayWidget.tsx` and `ObservationsWidget.tsx` to use the same inline style approach or CSS variable system as the rest of the dashboard. Use the `C` design token object already defined in `dashboard/page.tsx`.

---

## 🔴 CRITICAL: LTM Gateway Widget Renders as Unstyled Text Dump

From the screenshots (screenshot 2):
- The LTM Gateway section renders as a vertical list of bare text — `$12.47`, `74%`, `1847K`, `Checks`, `847`, `Reuses`, `623` etc. stacked with zero visual grouping
- There are no card containers, no grid layout, no color coding
- This is because `bg-gray-800`, `grid grid-cols-3 gap-4` Tailwind classes are **not being applied**

The same problem affects `ObservationsWidget.tsx` — the pattern cards with `bg-blue-900/30` render as flat unstyled text blocks.

**This is the single highest-priority fix.** It makes the bottom half of the dashboard page look broken.

---

## 🔴 CRITICAL: Observations Widget Has No Height Constraint

The Observations widget is in a 1:1 grid column alongside the Region Map. The observations list can be 20+ items tall, forcing the grid row to be enormous while the Region Map sits cramped in the right column. This destroys the page layout rhythm.

In screenshot 3 you can see the Observations section is 3x taller than anything else, with the Region Map data appearing below as a separate section rather than side-by-side.

---

## 🟠 HIGH: Hash Chain Shows Mock/Placeholder Hashes

From screenshot 4, the Hash Chain Integrity section shows:
```
Hash:00000000...00000001
Hash:00000000...00000002←Prev:00000000...00000001
Hash:00000000...00000003←Prev:00000000...00000002
```

These are clearly sequential zero-padded placeholder hashes, not real SHA-256 digests. Judges evaluating a cryptographic memory ledger will immediately see this as a demo placeholder. The component needs to display real truncated SHA-256 hex strings from the database.

---

## 🟠 HIGH: Memory Distribution Donut Chart Uses Hardcoded Ratios (Fake Data)

`dashboard/page.tsx` lines 168–172:
```js
const f = memCount ? Math.round(memCount * 0.6) : 0;  // 60% episodic — HARDCODED
const s = memCount ? Math.round(memCount * 0.25) : 0; // 25% semantic — HARDCODED
const e = memCount ? Math.max(1, memCount - f - s) : 0; // rest — DERIVED
```

These are **hardcoded proportions** (60/25/15), not real data from CockroachDB. The donut chart tells judges 60% of memories are "Episodic Facts" regardless of actual data. The `/api/stats` endpoint needs to return real `memory_type` breakdown counts grouped from the DB. Until then, label the chart "Estimated Distribution."

---

## 🟠 HIGH: No DB Connection Status Indicator

The dashboard header shows "Command Center" with no indication of:
- Whether CockroachDB is actually connected
- Which cluster/region is active  
- Last successful data fetch time

For CockroachDB judges, **the entire value proposition is the live database connection**. There must be a visible badge: `● LIVE · cluster.cockroachlabs.cloud · 16ms` at the top of every page. Without this, the dashboard looks static.

---

## 🟠 HIGH: Health Page Uses Completely Different Visual Style

`health/page.tsx` uses `card-interactive` CSS class with `borderLeft: 3px solid ${color}` — different from every other page. The page header uses `welcome-title` class but the body uses entirely different component patterns.

The KPI cards there use emoji icons (`💾`, `📌`, `📈`, `⭐`) while the main dashboard uses inline SVG icons. This inconsistency signals to judges that different features were built by different people who never synced their styles.

**Fix:** Use the same `StatCard` and `Panel` components from `dashboard/page.tsx`.

---

## 🟠 HIGH: Compliance Page Uses Emoji Pass/Fail Indicators

`compliance/page.tsx` line 153: `{isPassed ? "🟢" : "🔴"}` — uses emoji circles as compliance status indicators in a legal/regulatory context. This looks unprofessional. 

The compliance page is meant to demonstrate EU AI Act Article 12 conformance — this is a serious feature. It needs proper SVG checkmarks/X marks with badge styling, not emoji that render differently on every OS.

---

## 🟡 MEDIUM: Time-Travel Graph Feature is Not Discoverable

`graph/page.tsx` has a `sliderVal` state and `INTERVALS` array with 11 time options. This drives the `AS OF SYSTEM TIME` MVCC query — **Bastion's single most impressive CockroachDB feature**.

However, based on the screenshots, the time-travel slider is not visually prominent. It needs to be the **hero element** of the Graph page — a large, clearly labeled scrubber showing "Viewing agent memory state from 5 minutes ago" with a real-time animation as you drag it.

This feature alone can win the hackathon. It needs to be unmissable, not buried in a dropdown.

---

## 🟡 MEDIUM: Logs Page Has No Pagination or Sorting

`logs/page.tsx` fetches all memories with no server-side limit. The table shows everything in a `maxHeight: 560px` scroll container.

Problems:
- No pagination controls — 1000+ memories = an infinite scroll wall
- No sorting by column (no click on "Created At" to sort desc/asc)
- No filter by agent ID
- No filter by memory type
- Search only passes `?search=` param — no multi-field filtering

---

## 🟡 MEDIUM: Layout Shift on Page Load (No Component-Level Skeletons)

The dashboard fetches KPI stats, trust data, and drift data in parallel. The top KPI cards appear fast, but the bottom rows (`LtmGatewayWidget`, `ObservationsWidget`, `RegionMapWidget`, `HashChainVisualizer`) each independently fetch and load at different times.

This creates a visible layout shift — the bottom half of the page pops into existence 1-2 seconds after the top. Each dynamic component shows either blank space or a `p-4 text-gray-500 animate-pulse` Tailwind loading state (which also won't render if Tailwind isn't configured).

---

## 🟡 MEDIUM: No Real-Time Refresh Indicator

The dashboard polls every 10 seconds but there's no visual feedback. Judges will not know if data is live or stale. Add a "Last updated: 3s ago" counter or a subtle pulse animation on KPI values when they update.

---

## 🟡 MEDIUM: NavBar Version is Hardcoded

`NavBar.tsx` line 72: `v0.10.0` hardcoded. Minor but noticeable. Should be `v0.16` (matching `package.json`) or removed.

---

## 🟡 MEDIUM: "Flight Recorder" Page — Unknown State

The sidebar links to `/flight-recorder`. The directory exists in the app but was not analyzed. If this page is incomplete or empty, judges clicking through the nav hit a dead end. Either complete it or remove the nav link.

---

## 🔵 LOW: Error Recovery Uses `window.location.reload()`

Several components call `window.location.reload()` on retry. This is a full hard reload that destroys all loaded state and causes a flash. Should use the existing `fetchData` callbacks for soft retry.

---

## 🔵 LOW: Agent Event Log Details Column Shows Raw JSON

`dashboard/page.tsx` line 317: `{JSON.stringify(log.details)}` — dumps raw JSON object as string directly in the table cell. This is unreadable. At minimum, extract a key field (`content_preview`, `memory_id`, `action_result`) and show that. Use `title={JSON.stringify(log.details)}` as tooltip for full data on hover.

---

## 🔵 LOW: No Empty State Illustrations

When the database is empty (fresh install, demo environment):
- Event log: shows nothing
- Most Recalled: shows nothing
- Observations: shows a text message
- Hash Chain: shows zero-padded placeholders

Need proper empty states with clear calls-to-action: "No memories stored yet. Run an agent to populate your ledger." with a code snippet showing the MCP command.

---

## Prioritized Fix Roadmap

### Day 1 — Stop the Bleeding (~4 hours)
1. **Rewrite `LtmGatewayWidget.tsx`** — replace all Tailwind with inline styles using the `C` token object. This single fix eliminates the biggest visual inconsistency.
2. **Rewrite `ObservationsWidget.tsx`** — same treatment. Add `maxHeight` + `overflowY: auto` to cap its growth.
3. **Add DB connection status badge** to the dashboard header/viewport — `● LIVE · cluster · Xms`
4. **Fix Compliance page** — replace emoji `🟢`/`🔴` with proper SVG status badges

### Day 2 — Make Data Honest (~3 hours)
5. **Fix Memory Distribution chart** — add real `GROUP BY memory_type` count query to `/api/stats` and pass actual data to the donut chart
6. **Fix Hash Chain component** — ensure it uses real SHA-256 hex from DB, not mock sequences
7. **Add "Last refreshed Xs ago" counter** to dashboard header
8. **Health page** — use same `StatCard` and `Panel` components

### Day 3 — Hero Features Front and Center (~3 hours)
9. **Make Time-Travel slider the hero** of the Graph page — large scrubber, animated, labeled prominently
10. **Add pagination to Logs page** — 50 per page, prev/next controls, column sorting
11. **Add agent ID + type filter** to Logs page
12. **Add component-level skeletons** matching the `Panel` component design to all lazy-loaded widgets

### Before Demo Video (~1 hour)
13. **Add `● LIVE` pulsing animation** on badge when data refreshes
14. **Fix or remove Flight Recorder page** from nav
15. **Remove hardcoded `v0.10.0`** from sidebar

---

## What to Show in the Demo Video (Prioritized)

1. **Landing page** → click "Try Demo Dashboard" → dashboard loads with DB: LIVE badge  
2. **Dashboard** → show live KPI numbers, event log populating with real memory operations  
3. **Graph page → TIME TRAVEL SLIDER** — drag to "5 minutes ago" → graph changes → drag back → restores. This is the CockroachDB killer demo.  
4. **Logs page** → search for a specific memory → see results filtered in real time  
5. **Compliance page** → all Article 12 checks green → hit "Export JSON Report" → show the file  
6. **Landing page Poisoning Simulator** → run the attack → OWASP ASI06 blocks it → state recovers in <1s  

The time-travel graph demo + poisoning simulator are the two features no competing project has. Everything else is supporting evidence.

---
---

# Part 2 — UI/UX, Design Language, Motion & Information Architecture

> This section covers design beyond code bugs. It answers: what should the dashboard *feel* like, what should it *show*, and how should information be *structured*.

---

## The Core Design Problem: No Visual Hierarchy

Looking at every screenshot, the fundamental issue is **everything has equal visual weight**. The 4 KPI cards at the top, the charts, the event log, the LTM gateway wall of text — they all look the same level of important. There is no focal point. There is no story being told.

A world-class dashboard tells a story in **3 seconds**:
1. **Is the system healthy?** (instant glance → one big status indicator)
2. **What is happening right now?** (live data, last 60 seconds)
3. **What does the AI agent know?** (memory state)

Right now the dashboard dumps 10 different widgets with no narrative hierarchy.

---

## Background: The Canvas is Dead Black, Nothing Lives There

The dashboard background is pure `#0a0508` — a flat, static black void. There is nothing to indicate this is a living, breathing system.

### What it should be
The background should feel like looking into a system that is **actively running**. Reference: Linear.app, Vercel dashboard, Raycast — all use subtle particle systems, animated gradients, or faint grid patterns that pulse with the underlying data.

**Specific fixes:**

1. **Subtle animated grid** — a `1px` grid at `48px` spacing with `opacity: 0.025`, animate rows that light up briefly when a memory write event fires (SSE-driven). Each grid cell that lights up represents a memory ingestion event. Zero performance cost, massive "alive" feeling.

2. **Radial glow behind the Trust Ring** — when the Trust Score is high (green), a very faint radial `rgba(0, 255, 136, 0.04)` glow behind the panel. When score drops, it shifts to `rgba(255, 85, 0, 0.06)`. This single change makes the trust score feel like a system heartbeat.

3. **Sidebar ambient glow** — the sidebar left edge gets a 1px glow line that pulses when a new SSE event arrives. Color matches event type (green for store, orange for consolidation, red for injection block).

4. **Header viewport background** — use `backdrop-filter: blur(20px)` with `rgba(10, 2, 8, 0.7)` instead of solid. The slight blur behind the header against the content makes it feel layered and modern.

---

## Motion: Nothing Moves, Nothing Feels Real

Every widget is completely static after initial render. Number values don't animate when they update. The event log doesn't animate new rows in. Charts don't transition.

### Motion principles to implement

**1. Number Countup on First Load**
All KPI values (969 memories, 16 entities, 5.04 importance) should count up from 0 on first load using `requestAnimationFrame`. Duration: 800ms, easing: `cubic-bezier(0.16, 1, 0.3, 1)`. This is the single highest-ROI motion enhancement — 30 lines of code, transforms the first impression completely.

**2. Live Data Flash Animation**
Every time the 10-second poll refreshes and a value changes, flash the number briefly:
```
value changes → background flashes rgba(0,229,255,0.08) for 300ms → fades out
```
This tells judges "this is live." Without it, they cannot tell if the data is static.

**3. Event Log Row Slide-In**
New rows in the System Event Log should slide in from the top with `animation: slideInFromTop 0.3s ease-out`. Currently rows just appear. The log should feel like a live terminal.

**4. SSE-Driven Pulse**
When an SSE event fires, the "Live Event Stream" badge should pulse once with a scale(1.2) → scale(1) animation at exactly the moment the event arrives. This proves the SSE connection is real.

**5. Chart Line Draw Animation**
The Cognitive Decay Curve SVG path should draw itself on first render using `stroke-dashoffset` animation — the line "draws" left to right over 1 second. Makes the chart feel like it just computed. Industry standard in dashboard design.

**6. Donut Chart Arc Animation**
The memory distribution donut arcs should animate from 0 to their final value on mount using `strokeDasharray` transition. Currently they just appear fully formed.

---

## Information Architecture: The Wrong Things Are Prominent

### Current structure (what you have)
```
Row 1: 4 KPI cards (memories, entities, relations, importance)
Row 2: Memory Distribution donut + Cognitive Decay curve
Row 3: System Event Log + [Hourly Growth, Cache Hit, Most Recalled]
Row 4: LTM Gateway + Observations | Region Map
Row 5: Trust Score | Drift Chart
Row 6: Hybrid Search
Row 7: Hash Chain Visualizer
Row 8: Fault Tolerance Demo
Row 9: Live Event Stream
Row 10: MemoryGuard
```

**Problems:**
- Trust Score (your most important security metric) is at row 5 — below the fold on most screens
- Hash Chain Integrity (core technical differentiator) is row 7 — judges may never reach it
- MemoryGuard (OWASP ASI06) is row 10 — almost certainly never seen in a demo
- LTM Gateway + Observations (both broken) take up a massive row 4 that judges see first
- The "Most Recalled" panel is squished into a tiny column next to Hourly Growth

### Redesigned structure (what it should be)

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: [DB: ● LIVE · cluster.cockroachlabs.cloud · 12ms]      │
│          [Last refreshed: 3s ago]  [● SSE Connected]            │
├─────────────────────────────────────────────────────────────────┤
│  HERO ROW: Big Trust Score ring + [SECURE / COMPROMISED] status │
│            Agent Stability Index drift score side by side        │
│            → The two "is Bastion working?" metrics FIRST         │
├─────────────────────────────────────────────────────────────────┤
│  KPI ROW: Memories | Entities | Relations | Importance          │
│           (4 cards, but smaller than trust hero)                 │
├─────────────────────────────────────────────────────────────────┤
│  LIVE ACTIVITY ROW:                                             │
│  [System Event Log — live, 8 rows, SSE-driven]                 │
│  [MemoryGuard ASI06 — injection attempts in last 60s]           │
│  → What is happening RIGHT NOW                                   │
├─────────────────────────────────────────────────────────────────┤
│  MEMORY INTELLIGENCE ROW:                                        │
│  [Memory Distribution donut] [Decay Curve] [Hash Chain strip]   │
│  → What does the agent know + is it cryptographically intact?   │
├─────────────────────────────────────────────────────────────────┤
│  GLOBAL VIEW ROW:                                                │
│  [Region Map — full width, beautiful]                           │
│  → Where is the data stored across 6 CockroachDB regions        │
├─────────────────────────────────────────────────────────────────┤
│  INTELLIGENCE ROW:                                               │
│  [LTM Gateway savings] [Observations patterns] [Most Recalled]  │
│  → The "smart memory" layer                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Why this order matters
- **Trust Score first** → judges immediately see security is the core feature
- **Live activity second** → proves the system is running in real-time
- **Memory intelligence third** → shows what the data layer knows
- **Region Map fourth** → the CockroachDB global distribution moment
- **Intelligence layer fifth** → bonus features for depth

---

## The Hero Panel: Trust Score Should Be Giant

The current Trust Ring is `160x160px` in a 50/50 grid split with the Drift Chart. It is tiny.

The Trust Score is your **headline security claim** — "Bastion protects AI memory from poisoning." That claim needs a visual that fills a quarter of the screen above the fold.

### What it should look like
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   ┌──────────────────────┐   ┌─────────────────────────────┐    │
│   │                      │   │  AGENT STABILITY INDEX      │    │
│   │    ╔══════════╗      │   │                             │    │
│   │    ║          ║      │   │  Score: 23   ● HEALTHY      │    │
│   │    ║    63    ║      │   │                             │    │
│   │    ║  SECURE  ║      │   │  ░░░░░░░░░░░░░░░░░░▓▓▓▓▓   │    │
│   │    ║          ║      │   │  drift timeline sparkline   │    │
│   │    ╚══════════╝      │   │                             │    │
│   │                      │   │  Top signals:               │    │
│   │  Dangerous: 0   ● 0  │   │  ↑ Memory retrieval +2%    │    │
│   │  Total: 100          │   │                             │    │
│   └──────────────────────┘   └─────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

The ring should be `240x240px`. The score number `63` should be `72px` font-weight 900. The `SECURE` label should pulse green. This is the first thing judges see.

---

## Region Map: It's Good But Wasted

The Region Map currently shows 6 CockroachDB regions as circles with connection lines. This is the right idea but it's visually buried below the broken LTM/Observations row.

### Improvements needed
1. **Make it full-width** — currently 50% column next to LTM Gateway. Give it 100% width at a dedicated row
2. **Animate connection lines** — the lines between regions should have animated dashes flowing from node to node, like data packets traveling. `stroke-dashoffset` animation on the SVG paths
3. **Latency color coding** — nodes should be colored by latency: green (<20ms), yellow (20-40ms), red (>40ms). Currently all nodes are the same color
4. **Hover state** — hovering a region bubble should show a tooltip with: region name, memory count, latency, last sync time
5. **Memory count bubble size** — node bubble radius should scale with memory count. `us-east1` with 1,247 memories should be noticeably larger than `ap-northeast1` with 198

---

## The System Event Log: Make It Feel Like a Terminal

The current event log shows raw `JSON.stringify(log.details)` in a table. This looks like a database dump, not an intelligence feed.

### What it should show per row
```
┌──────────────┬────────────────────────┬────────────────────────────────────────┐
│ 8:24:52 am   │ ● memory_store         │ Agent DEFI_01 stored memory about      │
│              │   [episodic_fact]      │ "Python preference for data tasks"     │
│              │                        │ importance: 8.2 · hash: a3f8c2...      │
├──────────────┼────────────────────────┼────────────────────────────────────────┤
│ 8:24:45 am   │ ⚠ injection_blocked    │ OWASP ASI06: blocked "ignore previous  │
│              │   [CRITICAL]          │ instructions" from agent ANON_03       │
│              │                        │ risk score: 0.94 · quarantined ✓       │
```

- Color-code by event type: `memory_store` = cyan, `injection_blocked` = red, `consolidation` = amber
- Show a human-readable description, not raw JSON
- New rows should slide in from top with animation
- Critical/injection events should have a red left border that pulses

---

## Typography: Too Small, Too Uniform

Looking at the screenshots, almost everything is between `11px` and `14px`. There is no typographic contrast. The headline "Command Center" is only `28px`.

### Hierarchy that's missing
- **Page titles** should be `32-40px`, weight 800
- **Primary metrics** (969 memories) should be `40-48px`, weight 900
- **Section labels** should be `10px` monospace uppercase, high letter-spacing (eyebrow text)
- **Body text** should be `13-14px`
- **Metadata/timestamps** should be `11px` monospace

Currently everything floats in the `13-14px` zone with no peaks or valleys. This makes the dashboard feel flat even without the design system conflict.

### Specific numbers that should be BIG
- Total Memories: currently `32px` → should be `48px`
- Trust Score ring number: currently `~30px` → should be `72px`
- Cache Hit Ratio: `28px` → fine as-is
- Latency badge: `16ms` → should be `36px` with the unit `ms` in `18px`

---

## Color Usage: Cyan Monotony

The entire dashboard uses `#00e5ff` (cyan) for almost everything — KPI values, chart lines, badges, links. Orange/amber (`#ffaa00`) appears occasionally. There is no semantic color mapping.

### What color should mean in this dashboard
- **Cyan** `#00e5ff` → information / memory data
- **Green** `#00ff88` → healthy / secure / verified
- **Amber** `#ffaa00` → CockroachDB brand / time-travel features
- **Orange/Red** `#ff5500` → injection attacks / security alerts / danger
- **Purple** `#b026ff` → cryptographic / hash chain features
- **White** → primary labels and headlines

Right now cyan does ALL of these jobs. When everything is cyan, nothing is cyan — the color loses all meaning.

---

## What Data Should Actually Be Shown (By Feature Priority)

### 🥇 Tier 1: CockroachDB Differentiators (Show These First)
These prove you're *actually* using CockroachDB and not just a wrapper:

| Data Point | Where to Show | Why It Matters |
|---|---|---|
| Active CockroachDB cluster hostname | Header badge | Proves live connection |
| Region-by-region memory counts + latency | Region Map (hero) | Proves 6-region distribution |
| MVCC AS OF SYSTEM TIME query time | Graph page hero | Proves time-travel |
| SHA-256 hash chain block count | Dashboard KPI | Proves tamper-evidence |
| Last consolidation daemon run time | Dashboard | Proves background processing |

### 🥈 Tier 2: Security (Your Core Differentiator)
| Data Point | Where to Show | Why It Matters |
|---|---|---|
| Trust Score (avg across all memories) | Hero panel (huge) | Core security claim |
| Injection attempts blocked (last 24h) | Near trust score | OWASP ASI06 in action |
| % memories above trust threshold | Trust ring breakdown | Granularity |
| Last injection attempt timestamp | Live feed | Real-time proof |
| Drift score trend (7-day sparkline) | Agent Stability hero | Behavioral forensics |

### 🥉 Tier 3: Memory Intelligence
| Data Point | Where to Show | Why It Matters |
|---|---|---|
| Memory count by type (real, not estimated) | Donut chart | Shows data diversity |
| Decay curve (importance over time) | Line chart | Memory consolidation |
| Top recalled memories | List | What the agent uses most |
| LTM cost savings | Widget | Business value of memory |
| Pattern detections (Observations) | Collapsed accordion | Advanced intelligence |

### ❌ Remove or Demote
| Item | Reason |
|---|---|
| Cache Hit Ratio `0.0%` | If always 0, remove it |
| "Most Recalled" with blank data | Hide if empty |
| Fault Tolerance Demo | Move to docs or its own page |
| Raw JSON in event log details | Replace with parsed summary |
| Hourly Growth bar chart | Useful but tertiary — move below fold |

---

## The Missing "Aha Moment" Panel

There should be one panel on the dashboard that makes a judge say "oh wow, I've never seen that before." Right now there isn't one.

**Candidate: Memory Injection Timeline**
A horizontal timeline (last 60 minutes, x-axis = time) showing:
- Green dots = memory stores
- Red dots = injection attempts (blocked)
- Yellow dots = consolidation events
- Lines connecting related events (store → consolidation → seal)

This single visualization tells the entire Bastion story in one glance: "agents wrote memories, attackers tried to corrupt them, Bastion blocked every attempt, and the daemon sealed the chain."

This should be 100% width, above the fold, driven by SSE in real-time.

---

## Sidebar: Clean It Up

Current sidebar issues:
1. Emoji icons (`📊`, `🕸️`, `📜`) mixed with text — looks like a mobile app
2. "Bastion Agent / v0.10.0" footer persona is confusing — whose agent?
3. "Flight Recorder" link goes nowhere
4. No visual grouping of nav items (all 6 links are flat)

### Improved sidebar structure
```
BASTION
MEMORY ENGINE
─────────────
📊 Dashboard          ← monitoring group
🌍 Graph              ← exploration group
📜 Memory Logs        ←
💓 Health             ← system group
⚖️ Compliance         ←
─────────────
                      ← remove Flight Recorder or complete it
─────────────
● LIVE                ← connection status at bottom
cockroachlabs.cloud
16ms avg
```

Replace emoji with consistent 16px SVG icons. Group links with subtle dividers. Move the DB status indicator to the sidebar footer instead of (or in addition to) the header.

---

## Final Honest Assessment

| Dimension | Current | Target |
|---|---|---|
| Information hierarchy | ❌ Flat, no focal point | Hero → Activity → Memory → Global |
| Background / canvas | ❌ Dead static black | Subtle animated grid, SSE-driven pulses |
| Motion / animation | ❌ Nothing moves | Countup, slide-in, chart draw, live flash |
| Color semantics | ❌ Cyan for everything | Semantic color system (security/data/time/hash) |
| Typography scale | ❌ All same size (13-14px) | Clear 5-level hierarchy |
| Trust Score prominence | ❌ Row 5, 160px ring | Row 1, 240px hero with giant number |
| CockroachDB proof | ❌ No visible cluster connection | Header badge + region map + MVCC time label |
| Data honesty | ❌ Hardcoded ratios, mock hashes | Real GROUP BY queries, real SHA-256 |
| Live feeling | ❌ Static after load | SSE-driven animations, refresh flash |
| "Aha moment" panel | ❌ Missing | Injection Timeline visualization |

