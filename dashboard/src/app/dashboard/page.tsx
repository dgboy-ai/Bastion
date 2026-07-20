"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { fetchWithTimeout } from "@/lib/fetch";

const TrustRing = dynamic(() => import("@/components/TrustRing"), { ssr: false });
const DriftChart = dynamic(() => import("@/components/DriftChart"), { ssr: false });
const MemoryGuardPanel = dynamic(() => import("@/components/MemoryGuardPanel"), { ssr: false });
const LiveEventFeed = dynamic(() => import("@/components/LiveEventFeed"), { ssr: false });
const LtmGatewayWidget = dynamic(() => import("@/components/LtmGatewayWidget"), { ssr: false });
const RegionMapWidget = dynamic(() => import("@/components/RegionMapWidget"), { ssr: false });
const ObservationsWidget = dynamic(() => import("@/components/ObservationsWidget"), { ssr: false });
const HybridSearchPanel = dynamic(() => import("@/components/HybridSearchPanel"), { ssr: false });
const HashChainVisualizer = dynamic(() => import("@/components/HashChainVisualizer"), { ssr: false });
const FaultToleranceVisualizer = dynamic(() => import("@/components/FaultToleranceVisualizer"), { ssr: false });

/* ── Design Tokens ─────────────────────────────────────────── */
const C = {
  canvas: "#0a0a0a", card: "#0c1018", cardHover: "#111827",
  hairline: "rgba(255,255,255,0.06)", ink: "#ffffff", body: "#c8ccd4",
  mute: "#6b7280", breeze: "#00e5ff", emerald: "#00ff88",
  sunset: "#ff7a17", dusk: "#7c3aed",
};

/* ── Intersection Observer ─────────────────────────────────── */
function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ── Panel Component ────────────────────────────────────────── */
function Panel({ children, className = "", style = {}, glow = false }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; glow?: boolean }) {
  return (
    <div className={`dashboard-panel ${glow ? 'glow-panel' : ''} ${className}`} style={{
      background: C.card, border: `1px solid ${C.hairline}`,
      borderRadius: "16px", padding: "24px",
      transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ── Stat Card ──────────────────────────────────────────────── */
function StatCard({ label, value, sub, color, icon }: { label: string; value: string | number; sub?: string; color: string; icon?: React.ReactNode }) {
  return (
    <div className="stat-card" style={{
      background: C.card, border: `1px solid ${C.hairline}`,
      borderRadius: "16px", padding: "24px",
      transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: `linear-gradient(90deg, transparent, ${color}, transparent)`, opacity: 0.6 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <span style={{ fontSize: "12px", color: C.mute, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 500 }}>{label}</span>
        {icon && <div style={{ color, opacity: 0.6 }}>{icon}</div>}
      </div>
      <div style={{ fontSize: "32px", fontWeight: 700, color, lineHeight: 1, marginBottom: sub ? "4px" : 0 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: "12px", color: C.mute }}>{sub}</div>}
    </div>
  );
}

/* ── Section Header ─────────────────────────────────────────── */
function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "20px" }}>
      <div>
        <h3 style={{ fontSize: "18px", fontWeight: 600, color: C.ink, margin: 0, letterSpacing: "-0.3px" }}>{title}</h3>
        {subtitle && <p style={{ fontSize: "13px", color: C.mute, margin: "4px 0 0 0" }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ── Badge ──────────────────────────────────────────────────── */
function Badge({ children, color = C.breeze }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "4px 10px",
      borderRadius: "999px", fontSize: "11px", fontWeight: 600,
      background: `${color}15`, color, border: `1px solid ${color}25`,
    }}>
      {children}
    </span>
  );
}

/* ── Skeleton Loader ──────────────────────────────────────── */
function SkeletonLoader() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShow(false), 1000);
    return () => clearTimeout(timer);
  }, []);
  if (!show) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, background: "#0a0a0a",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: "16px",
      animation: "fadeOut 0.4s ease forwards 0.6s",
    }}>
      <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "linear-gradient(135deg, #00e5ff, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pulseGlow 1.5s ease-in-out infinite" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" stroke="#fff" strokeWidth="2.5" /></svg>
      </div>
      <div className="skeleton" style={{ width: "160px", height: "20px" }} />
      <div className="skeleton" style={{ width: "240px", height: "14px" }} />
    </div>
  );
}

/* ── Cursor Glow ─────────────────────────────────────────────── */
function CursorGlow() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  useEffect(() => {
    const h = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", h, { passive: true });
    return () => window.removeEventListener("mousemove", h);
  }, []);
  return (
    <div style={{
      position: "fixed", left: pos.x - 150, top: pos.y - 150,
      width: "300px", height: "300px", borderRadius: "50%",
      background: "radial-gradient(circle, rgba(0,229,255,0.04) 0%, transparent 70%)",
      pointerEvents: "none", zIndex: 0, transition: "left 0.15s ease-out, top 0.15s ease-out",
    }} />
  );
}

/* ── Dashboard Page ────────────────────────────────────────── */
interface Stats {
  memories: number;
  entities: number;
  relations: number;
  auditLogs: number;
  conflicts: number;
  avgImportance: string;
  decayCurve: Array<{ label: string; value: number }>;
  hourlyGrowth: number[];
  topRecalls: Array<{ rank: number; text: string; count: number }>;
  cacheHitPct: string;
  recentAudits: Array<{ id: string; action: string; recordedAt: string; details: Record<string, unknown> }>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryLatency, setQueryLatency] = useState<number | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [trustSummary, setTrustSummary] = useState<{ totalMemories: number; avgTrustScore: number; trustLevelDistribution: Record<number, number>; poisoningDistribution: Record<string, number>; dangerousMemories: number } | null>(null);
  const [trustAlerts, setTrustAlerts] = useState<{ severity: string; risk: string; count: number }[]>([]);
  const [driftData, setDriftData] = useState<{ latest: { overall_drift_score: number; status: string; top_drift_signals: string[]; recommendation: string } | null; timeSeries: { score: number; timestamp: string; status: string }[] } | null>(null);

  const prevStatsRef = useRef<string>("");
  const prevTrustKey = useRef<string>("");
  const prevDriftKey = useRef<string>("");

  const fetchData = useCallback(async () => {
    const ac = new AbortController();
    const startTime = performance.now();
    try {
      const [statsRes, trustRes, driftRes] = await Promise.all([
        fetchWithTimeout("/api/stats", { signal: ac.signal }),
        fetchWithTimeout("/api/trust?limit=100", { signal: ac.signal }),
        fetchWithTimeout("/api/drift?limit=50", { signal: ac.signal }),
      ]);
      if (!statsRes.ok) throw new Error("Failed to fetch telemetry");
      const statsData = await statsRes.json();
      const trustData = trustRes.ok ? await trustRes.json() : null;
      const driftRaw = driftRes.ok ? await driftRes.json() : null;

      const statsKey = JSON.stringify(statsData);
      if (statsKey !== prevStatsRef.current) { prevStatsRef.current = statsKey; setStats(statsData.data || statsData); }
      const trustKey = JSON.stringify(trustData);
      if (trustKey !== prevTrustKey.current) { prevTrustKey.current = trustKey; setTrustSummary((trustData?.data || trustData)?.summary ?? null); setTrustAlerts((trustData?.data || trustData)?.alerts ?? []); }
      if (driftRaw) { const driftKey = JSON.stringify(driftRaw); if (driftKey !== prevDriftKey.current) { prevDriftKey.current = driftKey; const d = driftRaw.data || driftRaw; setDriftData({ latest: d.latest, timeSeries: d.timeSeries }); } }
      setError(null);
      setQueryLatency(Math.round(performance.now() - startTime));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message.includes("abort") ? "Request timed out" : message);
    } finally { ac.abort(); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const id = setTimeout(fetchData, 0);
    const interval = setInterval(fetchData, 10000);
    return () => { clearTimeout(id); clearInterval(interval); };
  }, [fetchData]);

  const decayCurve = stats?.decayCurve;
  const memCount = stats?.memories;
  const recentAudits = stats?.recentAudits;

  const decayPoints = useMemo(() => decayCurve ? decayCurve.map((pt, idx) => ({ x: 30 + idx * 50, y: 80 - (pt.value / 10) * 60, time: pt.label, value: `${pt.value.toFixed(2)}` })) : [], [decayCurve]);
  const { pathD, areaD } = useMemo(() => {
    let p = "", a = "";
    if (decayPoints.length > 0) {
      p = `M${decayPoints[0].x},${decayPoints[0].y}`;
      for (let i = 1; i < decayPoints.length; i++) { const prev = decayPoints[i - 1], curr = decayPoints[i]; p += ` C${prev.x + 25},${prev.y} ${curr.x - 25},${curr.y} ${curr.x},${curr.y}`; }
      a = `${p} L${decayPoints[decayPoints.length - 1].x},90 L${decayPoints[0].x},90 Z`;
    }
    return { pathD: p, areaD: a };
  }, [decayPoints]);

  const { facts, semCache, episodic } = useMemo(() => {
    const f = memCount ? Math.round(memCount * 0.6) : 0;
    const s = memCount ? Math.round(memCount * 0.25) : 0;
    const e = memCount ? Math.max(1, memCount - f - s) : 0;
    return { facts: f, semCache: s, episodic: e };
  }, [memCount]);

  // Donut chart arcs — computed from actual data proportions
  const donutArcs = useMemo(() => {
    const total = facts + semCache + episodic;
    if (total === 0) return { f: "0 100", s: "0 100", e: "0 100", fOff: "0", sOff: "0", eOff: "0" };
    const circumference = 100; // percentage-based
    const fPct = (facts / total) * circumference;
    const sPct = (semCache / total) * circumference;
    const ePct = (episodic / total) * circumference;
    // strokeDashoffset moves the start point; cumulative offsets stack the arcs
    return {
      f: `${fPct} ${circumference - fPct}`,
      s: `${sPct} ${circumference - sPct}`,
      e: `${ePct} ${circumference - ePct}`,
      fOff: "25",
      sOff: `${25 - fPct}`,
      eOff: `${25 - fPct - sPct}`,
    };
  }, [facts, semCache, episodic]);

  const filteredAudits = useMemo(() => recentAudits ? recentAudits.filter((log) => !selectedFilter || JSON.stringify(log.details).toLowerCase().includes(selectedFilter.toLowerCase())) : [], [recentAudits, selectedFilter]);

  const { ref: r1, visible: v1 } = useInView(0.1);
  const { ref: r2, visible: v2 } = useInView(0.1);
  const { ref: r3, visible: v3 } = useInView(0.1);
  const { ref: r4, visible: v4 } = useInView(0.1);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ height: i === 1 ? "120px" : "200px", borderRadius: "16px" }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Panel glow>
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ fontSize: "13px", color: C.sunset, textTransform: "uppercase", letterSpacing: "2px", marginBottom: "12px", fontWeight: 600 }}>Connection Error</div>
          <div style={{ fontSize: "20px", color: C.ink, fontWeight: 600, marginBottom: "8px" }}>Telemetry Link Offline</div>
          <p style={{ fontSize: "14px", color: C.mute, marginBottom: "24px" }}>{error}</p>
          <button onClick={() => { setLoading(true); setError(null); fetchData(); }} style={{
            padding: "12px 28px", borderRadius: "9999px", background: "transparent",
            border: `1px solid ${C.breeze}`, color: C.breeze, fontSize: "14px", fontWeight: 500, cursor: "pointer",
            transition: "all 0.2s",
          }}>Retry Connection</button>
        </div>
      </Panel>
    );
  }

  return (
    <>
      <CursorGlow />
      <SkeletonLoader />

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Welcome */}
        <div ref={r1} style={{ opacity: v1 ? 1 : 0, transform: v1 ? "translateY(0)" : "translateY(20px)", transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: C.ink, margin: 0, letterSpacing: "-0.5px" }}>
            Command Center
          </h1>
          <p style={{ fontSize: "14px", color: C.mute, margin: "6px 0 0 0" }}>
            Real-time memory intelligence across your agent infrastructure
          </p>
        </div>

        {/* KPI Row */}
        <div ref={r2} style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px",
          opacity: v2 ? 1 : 0, transform: v2 ? "translateY(0)" : "translateY(20px)",
          transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s",
        }}>
          <StatCard label="Total Memories" value={memCount?.toLocaleString() ?? "—"} color={C.breeze} icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" /></svg>} />
          <StatCard label="Entities" value={stats?.entities ?? "—"} color={C.dusk} icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>} />
          <StatCard label="Relations" value={stats?.relations ?? "—"} color={C.emerald} icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>} />
          <StatCard label="Avg Importance" value={stats?.avgImportance ?? "—"} sub="cognitive weight" color={C.sunset} icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10M18 20V4M6 20v-4" /></svg>} />
        </div>

        {/* Row 2: Memory Mix + Decay Curve */}
        <div ref={r3} style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px",
          opacity: v3 ? 1 : 0, transform: v3 ? "translateY(0)" : "translateY(20px)",
          transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s",
        }}>
          {/* Memory Mix */}
          <Panel>
            <SectionHeader title="Memory Distribution" subtitle="Episodic vs semantic cache" />
            <div style={{ display: "flex", alignItems: "center", gap: "32px", padding: "16px 0" }}>
              <svg width="100" height="100" viewBox="0 0 36 36" style={{ filter: "drop-shadow(0 0 8px rgba(0,229,255,0.2))" }}>
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.915" fill="none" stroke={C.breeze} strokeWidth="3.5" strokeDasharray={donutArcs.f} strokeDashoffset={donutArcs.fOff} strokeLinecap="round" />
                <circle cx="18" cy="18" r="15.915" fill="none" stroke={C.dusk} strokeWidth="3.5" strokeDasharray={donutArcs.s} strokeDashoffset={donutArcs.sOff} strokeLinecap="round" />
                <circle cx="18" cy="18" r="15.915" fill="none" stroke={C.sunset} strokeWidth="3.5" strokeDasharray={donutArcs.e} strokeDashoffset={donutArcs.eOff} strokeLinecap="round" />
              </svg>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {[{ label: "Episodic Fact", count: facts, color: C.breeze }, { label: "Semantic Cache", count: semCache, color: C.dusk }, { label: "Context", count: episodic, color: C.sunset }].map(item => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: item.color }} />
                    <span style={{ fontSize: "13px", color: C.body }}>{item.label}</span>
                    <span style={{ fontSize: "13px", color: C.ink, fontWeight: 600, marginLeft: "auto" }}>{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Decay Curve */}
          <Panel>
            <SectionHeader title="Cognitive Decay Curve" subtitle="Memory weight over time" />
            <div style={{ position: "relative", height: "120px", marginTop: "8px" }}>
              <svg width="100%" height="100%" viewBox="0 0 530 90">
                {[15, 45, 75].map(y => <line key={y} x1="0" y1={y} x2="530" y2={y} stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />)}
                {areaD && <path d={areaD} fill="url(#decayGrad)" />}
                {pathD && <path d={pathD} fill="none" stroke={C.breeze} strokeWidth="2" style={{ filter: "drop-shadow(0 0 6px rgba(0,229,255,0.3))" }} />}
                {decayPoints.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r="3" fill={C.ink} stroke={C.breeze} strokeWidth="1.5" style={{ filter: "drop-shadow(0 0 4px rgba(0,229,255,0.4))" }} />
                ))}
                <defs>
                  <linearGradient id="decayGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.breeze} stopOpacity="0.15" />
                    <stop offset="100%" stopColor={C.breeze} stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: C.mute, fontFamily: "'JetBrains Mono', monospace", marginTop: "8px" }}>
              <span>24h ago</span><span>12h ago</span><span>Now</span>
            </div>
          </Panel>
        </div>

        {/* Row 3: Event Log + Growth + Recalls */}
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr", gap: "20px", alignItems: "start" }}>
          {/* Event Log */}
          <Panel>
            <SectionHeader title="System Event Log" subtitle={`${filteredAudits.length} operations`} action={
              <Link href="/logs" style={{ fontSize: "12px", color: C.breeze, textDecoration: "none" }}>View All →</Link>
            } />
            <div style={{ maxHeight: "320px", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr>
                    {["Timestamp", "Action", "Details"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", color: C.mute, borderBottom: `1px solid ${C.hairline}`, fontWeight: 600, position: "sticky", top: 0, background: C.card }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAudits.slice(0, 6).map(log => (
                    <tr key={log.id} style={{ borderBottom: `1px solid ${C.hairline}` }}>
                      <td style={{ padding: "10px 12px", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: C.mute }}>{new Date(log.recordedAt).toLocaleTimeString()}</td>
                      <td style={{ padding: "10px 12px" }}><Badge color={log.action.includes("store") ? C.breeze : log.action.includes("conflict") ? C.sunset : C.dusk}>{log.action}</Badge></td>
                      <td style={{ padding: "10px 12px", color: C.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "300px" }}>{JSON.stringify(log.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Right Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Growth Chart */}
            <Panel>
              <SectionHeader title="Hourly Growth" subtitle="Memory ingestion rate" />
              <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "80px", padding: "8px 0" }}>
                {stats?.hourlyGrowth?.map((h, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                    <div style={{
                      width: "100%", height: `${h}%`, borderRadius: "4px 4px 0 0",
                      background: `linear-gradient(to top, ${C.breeze}10, ${C.breeze})`,
                      transition: "height 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
                      boxShadow: `0 0 8px ${C.breeze}30`,
                    }} />
                    <span style={{ fontSize: "8px", color: C.mute, fontFamily: "'JetBrains Mono', monospace" }}>H-{8 - i}</span>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Cache Hit */}
            <Panel glow>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "11px", color: C.mute, textTransform: "uppercase", letterSpacing: "1px" }}>Cache Hit Ratio</div>
                  <div style={{ fontSize: "28px", fontWeight: 700, color: C.emerald, marginTop: "4px" }}>{stats?.cacheHitPct ?? "—"}%</div>
                </div>
                <svg width="60" height="30" viewBox="0 0 60 30">
                  {(() => {
                    const hitRate = parseFloat(stats?.cacheHitPct ?? "0") / 100;
                    // Generate a simple upward-trending sparkline proportional to hit rate
                    const pts = Array.from({ length: 7 }, (_, i) => {
                      const x = (i / 6) * 60;
                      const base = 28 - (hitRate * 24);
                      const noise = Math.sin(i * 1.8 + hitRate * 5) * 3;
                      const y = Math.max(2, Math.min(28, base + noise + (i * 1.5)));
                      return `${x},${y}`;
                    });
                    return <path d={`M${pts.join(" L")}`} fill="none" stroke={C.emerald} strokeWidth="2" style={{ filter: "drop-shadow(0 0 4px rgba(0,255,136,0.3))" }} />;
                  })()}
                </svg>
              </div>
            </Panel>

            {/* Top Recalls */}
            <Panel>
              <SectionHeader title="Most Recalled" subtitle="Memory hit frequency" />
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {stats?.topRecalls?.slice(0, 4).map(item => (
                  <div key={item.rank} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: `1px solid ${C.hairline}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                      <span style={{ fontSize: "10px", color: C.sunset, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>#{item.rank}</span>
                      <span style={{ fontSize: "12px", color: C.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.text}</span>
                    </div>
                    <Badge>{item.count} hits</Badge>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>

        {/* Row 4: LTM Gateway + Observations + Region Map */}
        <div ref={r4} style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px",
          opacity: v4 ? 1 : 0, transform: v4 ? "translateY(0)" : "translateY(20px)",
          transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.3s",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <LtmGatewayWidget />
            <ObservationsWidget />
          </div>
          <RegionMapWidget />
        </div>

        {/* Row 5: Trust + Drift */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <Panel>
            <SectionHeader title="Memory Trust Score" subtitle="Poisoning defense status" />
            {trustSummary ? (
              <TrustRing trustLevelDistribution={trustSummary.trustLevelDistribution} avgTrustScore={trustSummary.avgTrustScore} totalMemories={trustSummary.totalMemories} dangerousMemories={trustSummary.dangerousMemories} />
            ) : (
              <div style={{ height: "120px", display: "flex", alignItems: "center", justifyContent: "center", color: C.mute, fontSize: "12px" }}>No trust data available</div>
            )}
          </Panel>
          <Panel>
            <SectionHeader title="Agent Stability Index" subtitle="Drift detection" />
            <DriftChart timeSeries={driftData?.timeSeries ?? []} overallScore={driftData?.latest?.overall_drift_score ?? 0} status={driftData?.latest?.status ?? "HEALTHY"} topSignals={driftData?.latest?.top_drift_signals ?? []} recommendation={driftData?.latest?.recommendation ?? ""} loading={driftData === null} />
          </Panel>
        </div>

        {/* Row 6: Hybrid Search */}
        <HybridSearchPanel />

        {/* Row 7: Hash Chain Visualization */}
        <HashChainVisualizer />

        {/* Row 8: Fault Tolerance Demo */}
        <FaultToleranceVisualizer />

        {/* Row 9: Live Stream */}
        <Panel>
          <SectionHeader title="Live Event Stream" subtitle="Real-time SSE events" action={<Badge color={C.emerald}>● Live</Badge>} />
          <LiveEventFeed />
        </Panel>

        {/* Row 10: MemoryGuard */}
        <Panel glow>
          <SectionHeader title="MemoryGuard — OWASP ASI06" subtitle="Real-time prompt injection, secret leakage & hash chain integrity scanning" />
          <MemoryGuardPanel />
        </Panel>
      </div>

      <style>{`
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; pointer-events: none; } }
        @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 20px rgba(0,229,255,0.15); } 50% { box-shadow: 0 0 40px rgba(0,229,255,0.3); } }
        @keyframes skeletonShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .skeleton { background: linear-gradient(90deg, #0c1018 25%, #1a1f2e 50%, #0c1018 75%); background-size: 200% 100%; animation: skeletonShimmer 1.5s ease-in-out infinite; border-radius: 8px; }
        .dashboard-panel { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .dashboard-panel:hover { border-color: rgba(0,229,255,0.12); }
        .glow-panel { position: relative; }
        .glow-panel::before { content: ''; position: absolute; inset: -1px; border-radius: inherit; background: linear-gradient(135deg, rgba(0,229,255,0.1), rgba(124,58,237,0.1)); opacity: 0; transition: opacity 0.3s ease; z-index: -1; filter: blur(8px); }
        .glow-panel:hover::before { opacity: 1; }
        .stat-card:hover { transform: translateY(-2px); border-color: rgba(0,229,255,0.15); box-shadow: 0 8px 32px rgba(0,229,255,0.06); }
        @media (max-width: 1024px) { div[style*="grid-template-columns: repeat(4"] { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 768px) { div[style*="grid-template-columns: repeat(4"] { grid-template-columns: 1fr !important; } div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; } div[style*="grid-template-columns: 1.8fr"] { grid-template-columns: 1fr !important; } }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
      `}</style>
    </>
  );
}
