"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchWithTimeout } from "@/lib/fetch";

interface Region {
  region: string;
  label: string;
  memories: number;
  latency_ms: number;
  status: string;
  utilization: number;
}

interface RegionStats {
  regions: Region[];
  total_memories: number;
  cross_region_syncs: number;
  avg_global_latency_ms: number;
  compliance: Record<string, string[]>;
}

const REGION_COORDS: Record<string, { x: number; y: number; name: string }> = {
  "us-east1": { x: 28, y: 38, name: "US East (N. Virginia)" },
  "us-west1": { x: 15, y: 36, name: "US West (Oregon)" },
  "eu-west1": { x: 45, y: 30, name: "Europe West (Ireland)" },
  "eu-central1": { x: 50, y: 32, name: "Europe Central (Frankfurt)" },
  "ap-south1": { x: 68, y: 44, name: "Asia Pacific (Mumbai)" },
  "ap-northeast1": { x: 84, y: 33, name: "Asia Pacific (Tokyo)" },
};

/* ── Cyber Nether Premium Design Tokens ──────────────────────────────── */
const C = {
  card: "rgba(18, 10, 20, 0.7)",
  hairline: "rgba(255, 94, 0, 0.16)",
  hairlineGlow: "rgba(255, 94, 0, 0.4)",
  ink: "#ffffff",
  body: "#d4cdd8",
  mute: "#7e7586",
  breeze: "#00f0ff",
  emerald: "#00ff8c",
  sunset: "#ffae00",
  dusk: "#ff5e00",
  magma: "#ff3c00",
};

export default function RegionMapWidget() {
  const [stats, setStats] = useState<RegionStats | null>(null);
  const [error, setError] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string>("us-east1");

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout("/api/region-stats")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (!cancelled) setStats(data.data ?? data);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[RegionMapWidget] fetch failed:", err);
          setError(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const activeRegionDetails = useMemo(() => {
    if (!stats) return null;
    const reg = stats.regions.find(r => r.region === selectedRegion);
    if (!reg) return stats.regions[0];
    return reg;
  }, [stats, selectedRegion]);

  if (error) {
    return (
      <div style={{ padding: "24px", color: C.magma, fontFamily: "var(--font-mono)", fontSize: "13px" }}>
        ⚠️ Failed to synchronize global region coordinates.
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ padding: "32px", color: C.mute, display: "flex", gap: "10px", alignItems: "center", fontFamily: "var(--font-mono)" }}>
        <span className="live-pulse-dot" /> SYNCHRONIZING MULTI-REGION TOPOLOGY MAP...
      </div>
    );
  }

  const maxMemories = Math.max(1, ...stats.regions.map((r) => r.memories));

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.hairline}`,
      borderRadius: "16px",
      padding: "24px",
      backdropFilter: "blur(12px)",
      boxShadow: "0 10px 40px rgba(0, 0, 0, 0.4)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "20px" }}>
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: C.ink, margin: 0, letterSpacing: "-0.3px", fontFamily: "var(--font-sg)" }}>
            MULTI-REGION TOPOLOGY SCANNER
          </h3>
          <p style={{ fontSize: "12px", color: C.mute, margin: "4px 0 0 0" }}>
            Replication status and cross-region consensus sweeps across CockroachDB nodes.
          </p>
        </div>
        <span style={{
          fontSize: "10.5px",
          fontFamily: "var(--font-mono)",
          color: C.emerald,
          background: "rgba(0, 255, 140, 0.08)",
          padding: "4px 10px",
          borderRadius: "999px",
          border: "1px solid rgba(0, 255, 140, 0.2)"
        }}>
          ● ACTIVE CONSENSUS
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "24px", alignItems: "start" }}>
        
        {/* WORLD TOPOLOGY MAP AREA */}
        <div style={{
          position: "relative",
          background: "rgba(0,0,0,0.6)",
          border: "1px dashed rgba(255, 94, 0, 0.2)",
          borderRadius: "12px",
          overflow: "hidden"
        }}>
          {/* Futuristic radar rotating ring behind map */}
          <div className="topo-radar-scan" />

          <svg viewBox="0 0 100 60" style={{ width: "100%", height: "auto", display: "block" }}>
            {/* Latitude Ellipses (Spherical projection effect) */}
            {[10, 20, 30, 40, 50].map((y) => (
              <path 
                key={`lat-${y}`} 
                d={`M 0 ${y} Q 50 ${y - 4} 100 ${y}`} 
                fill="none" 
                stroke="rgba(255, 94, 0, 0.08)" 
                strokeWidth="0.15" 
              />
            ))}
            
            {/* Longitude curved lines */}
            {[20, 40, 60, 80].map((x) => (
              <path 
                key={`lon-${x}`} 
                d={`M ${x} 0 Q ${x + 6} 30 ${x} 60`} 
                fill="none" 
                stroke="rgba(255, 94, 0, 0.08)" 
                strokeWidth="0.15" 
              />
            ))}

            {/* Glowing Active Consensus flow lanes (Data packages traveling) */}
            {stats.regions.map((r, i) =>
              stats.regions.slice(i + 1).map((r2) => {
                const c1 = REGION_COORDS[r.region];
                const c2 = REGION_COORDS[r2.region];
                if (!c1 || !c2) return null;
                return (
                  <path
                    key={`${r.region}-${r2.region}`}
                    d={`M ${c1.x} ${c1.y} Q ${(c1.x + c2.x) / 2} ${(c1.y + c2.y) / 2 - 4} ${c2.x} ${c2.y}`}
                    fill="none"
                    stroke={selectedRegion === r.region || selectedRegion === r2.region ? C.sunset : "rgba(255, 94, 0, 0.15)"}
                    strokeWidth={selectedRegion === r.region || selectedRegion === r2.region ? "0.45" : "0.2"}
                    className="consensus-lane"
                  />
                );
              })
            )}

            {/* Region Node Elements */}
            {stats.regions.map((r) => {
              const coords = REGION_COORDS[r.region];
              if (!coords) return null;
              const isSelected = selectedRegion === r.region;
              const size = 1.2 + (r.memories / maxMemories) * 2.2;
              
              return (
                <g key={r.region} style={{ cursor: "pointer" }} onClick={() => setSelectedRegion(r.region)}>
                  {/* Concentric rotating glowing ring */}
                  <circle 
                    cx={coords.x} 
                    cy={coords.y} 
                    r={size + 2} 
                    fill="none" 
                    stroke={isSelected ? C.sunset : "rgba(255, 94, 0, 0.3)"} 
                    strokeWidth="0.25" 
                    strokeDasharray="2,1.5"
                    className="concentric-spin"
                  />
                  {/* Pulse wave ring */}
                  <circle cx={coords.x} cy={coords.y} r={size} fill="none" stroke={isSelected ? C.dusk : "rgba(255, 94, 0, 0.2)"} strokeWidth="0.3">
                    <animate attributeName="r" from={size} to={size + 3} dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.7" to="0" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                  {/* Inner node cores */}
                  <circle cx={coords.x} cy={coords.y} r={size} fill={isSelected ? C.sunset : "rgba(255, 94, 0, 0.45)"} />
                  <circle cx={coords.x} cy={coords.y} r={size * 0.4} fill="#fff" />
                  
                  {/* Text tags */}
                  <text 
                    x={coords.x} 
                    y={coords.y - size - 1.2} 
                    textAnchor="middle" 
                    fill={isSelected ? "#fff" : C.mute} 
                    fontSize="1.6" 
                    fontWeight={isSelected ? 800 : 500}
                    fontFamily="var(--font-mono)"
                  >
                    {r.region}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* DETAILED SPEC SELECTED NODE HUD */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {activeRegionDetails ? (
            <div style={{
              padding: "20px",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 94, 0, 0.25)",
              borderRadius: "12px",
              position: "relative"
            }}>
              {/* Regional identifier title */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div>
                  <div style={{ fontSize: "9.5px", fontFamily: "var(--font-mono)", color: C.sunset, letterSpacing: "1.5px", textTransform: "uppercase" }}>
                    REGION INSTANCE HUD
                  </div>
                  <h4 style={{ fontSize: "16px", fontWeight: 800, color: "#fff", margin: "2px 0 0 0", fontFamily: "var(--font-sg)" }}>
                    {REGION_COORDS[activeRegionDetails.region]?.name || activeRegionDetails.label}
                  </h4>
                </div>
                <span className="live-pulse-dot" />
              </div>

              {/* Ingestion stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.03)" }}>
                  <div style={{ fontSize: "9.5px", color: C.mute, textTransform: "uppercase" }}>Memories Ingested</div>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                    {activeRegionDetails.memories.toLocaleString()}
                  </div>
                </div>
                <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.03)" }}>
                  <div style={{ fontSize: "9.5px", color: C.mute, textTransform: "uppercase" }}>Sync Latency</div>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: C.emerald, fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                    {activeRegionDetails.latency_ms}ms
                  </div>
                </div>
              </div>

              {/* Replication parameters */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.mute }}>Consensus Leaseholder:</span>
                  <span style={{ color: "#fff", fontFamily: "var(--font-mono)" }}>
                    {activeRegionDetails.region === "us-east1" ? "TRUE (LEADER)" : "FALSE (FOLLOWER)"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.mute }}>Follower Reads:</span>
                  <span style={{ color: C.emerald }}>ENABLED (AS OF TIME)</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.mute }}>Replication Zone Index:</span>
                  <span style={{ color: C.breeze, fontFamily: "var(--font-mono)" }}>
                    ZONE_CRDB_{activeRegionDetails.region.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: "20px", color: C.mute, textAlign: "center", fontSize: "13px" }}>
              Click a coordinate node on the map scanner.
            </div>
          )}

          {/* GLOBAL CONSENSUS SUMMARY BAR */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "12px",
            background: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(255, 94, 0, 0.12)",
            borderRadius: "10px",
            padding: "16px"
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "18px", fontWeight: 900, color: "#fff", fontFamily: "var(--font-mono)" }}>
                {stats.total_memories.toLocaleString()}
              </div>
              <div style={{ fontSize: "9.5px", color: C.mute, textTransform: "uppercase", marginTop: "2px" }}>Global Nodes</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "18px", fontWeight: 900, color: C.breeze, fontFamily: "var(--font-mono)" }}>
                {stats.avg_global_latency_ms}ms
              </div>
              <div style={{ fontSize: "9.5px", color: C.mute, textTransform: "uppercase", marginTop: "2px" }}>Avg Sync</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "18px", fontWeight: 900, color: C.emerald, fontFamily: "var(--font-mono)" }}>
                {stats.regions.length}
              </div>
              <div style={{ fontSize: "9.5px", color: C.mute, textTransform: "uppercase", marginTop: "2px" }}>Zones</div>
            </div>
          </div>

        </div>

      </div>

      <style>{`
        .topo-radar-scan {
          position: absolute;
          width: 320px;
          height: 320px;
          border-radius: 50%;
          border: 1px dashed rgba(255, 94, 0, 0.08);
          pointer-events: none;
          animation: radarRotate 12s linear infinite;
          opacity: 0.5;
          top: -40px;
          left: -40px;
        }
        @keyframes radarRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .consensus-lane {
          stroke-dasharray: 2, 2;
          animation: packetFlow 10s linear infinite;
        }
        @keyframes packetFlow {
          from { stroke-dashoffset: 20; }
          to { stroke-dashoffset: 0; }
        }

        .concentric-spin {
          transform-origin: center;
          animation: spinNode 8s linear infinite;
        }
        @keyframes spinNode {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .live-pulse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #00ff8c;
          box-shadow: 0 0 10px #00ff8c;
          animation: livePulse 1.8s infinite;
        }
        @keyframes livePulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
