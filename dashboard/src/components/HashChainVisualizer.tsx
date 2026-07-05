"use client";

import { useEffect, useState } from "react";

interface MemoryBlock {
  memoryId: string;
  content: string;
  cryptographicHash: string;
  previousHash: string | null;
  createdAt: string;
  importanceScore: number;
}

interface HashChainVisualizerProps {
  agentId?: string;
}

export default function HashChainVisualizer({ agentId = "demo-agent" }: HashChainVisualizerProps) {
  const [blocks, setBlocks] = useState<MemoryBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBlock, setSelectedBlock] = useState<MemoryBlock | null>(null);
  const [chainValid, setChainValid] = useState(true);

  useEffect(() => {
    async function fetchChain() {
      try {
        const res = await fetch(`/api/memories?agent_id=${agentId}`);
        if (!res.ok) throw new Error("Failed to fetch memories");
        const data = await res.json();
        const memories: MemoryBlock[] = data.memories || [];
        setBlocks(memories);

        // Verify chain integrity
        let valid = true;
        for (let i = 1; i < memories.length; i++) {
          if (memories[i].previousHash !== memories[i - 1].cryptographicHash) {
            valid = false;
            break;
          }
        }
        setChainValid(valid);
      } catch (err) {
        console.error("Failed to load hash chain:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchChain();
    const interval = setInterval(fetchChain, 5000);
    return () => clearInterval(interval);
  }, [agentId]);

  if (loading) {
    return (
      <div className="panel" style={{ padding: "20px" }}>
        <div className="panel-header">
          <span className="title-sm">Hash Chain Integrity</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
          <div className="shimmer-pulse" style={{ width: "200px", height: "20px" }} />
        </div>
      </div>
    );
  }

  const truncatedHash = (hash: string) => {
    if (!hash) return "genesis";
    return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
  };

  return (
    <div className="panel" style={{ padding: "20px" }}>
      <div className="panel-header" style={{ marginBottom: "16px" }}>
        <span className="title-sm">Hash Chain Integrity</span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: chainValid ? "var(--accent-emerald)" : "#ff4444",
              boxShadow: chainValid ? "0 0 8px var(--accent-emerald)" : "0 0 8px #ff4444",
            }}
          />
          <span
            style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: chainValid ? "var(--accent-emerald)" : "#ff4444",
            }}
          >
            {chainValid ? "CHAIN VALID" : "CHAIN BROKEN"}
          </span>
        </div>
      </div>

      {/* Visual Chain */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          overflowX: "auto",
          padding: "12px 0",
          minHeight: "80px",
        }}
      >
        {blocks.slice(-10).map((block, idx) => (
          <div key={block.memoryId} style={{ display: "flex", alignItems: "center" }}>
            {/* Block */}
            <div
              onClick={() => setSelectedBlock(selectedBlock?.memoryId === block.memoryId ? null : block)}
              style={{
                minWidth: "100px",
                padding: "8px 12px",
                background: selectedBlock?.memoryId === block.memoryId
                  ? "rgba(0, 229, 255, 0.1)"
                  : "rgba(255, 255, 255, 0.02)",
                border: `1px solid ${
                  selectedBlock?.memoryId === block.memoryId
                    ? "var(--accent-breeze)"
                    : "var(--glass-border)"
                }`,
                borderRadius: "6px",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <div
                style={{
                  fontSize: "8px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--mute)",
                  marginBottom: "4px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "90px",
                }}
              >
                {truncatedHash(block.cryptographicHash)}
              </div>
              <div
                style={{
                  fontSize: "9px",
                  color: "var(--body)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "90px",
                }}
              >
                {block.content.substring(0, 20)}...
              </div>
              <div
                style={{
                  fontSize: "7px",
                  color: "var(--accent-breeze)",
                  marginTop: "4px",
                }}
              >
                Score: {block.importanceScore.toFixed(1)}
              </div>
            </div>

            {/* Arrow */}
            {idx < blocks.slice(-10).length - 1 && (
              <div
                style={{
                  color: "var(--accent-breeze)",
                  fontSize: "14px",
                  padding: "0 2px",
                  opacity: 0.5,
                }}
              >
                →
              </div>
            )}
          </div>
        ))}

        {blocks.length === 0 && (
          <div
            style={{
              color: "var(--mute)",
              fontSize: "12px",
              padding: "20px",
              textAlign: "center",
              width: "100%",
            }}
          >
            No memory blocks in chain
          </div>
        )}
      </div>

      {/* Chain Stats */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderTop: "1px solid var(--glass-border)",
          paddingTop: "12px",
          marginTop: "8px",
        }}
      >
        <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>
          Chain Length: <span style={{ color: "var(--ink)" }}>{blocks.length}</span>
        </div>
        <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>
          SHA-256 Links: <span style={{ color: "var(--accent-emerald)" }}>{Math.max(0, blocks.length - 1)}</span>
        </div>
        <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>
          Status:{" "}
          <span style={{ color: chainValid ? "var(--accent-emerald)" : "#ff4444" }}>
            {chainValid ? "INTACT" : "TAMPERED"}
          </span>
        </div>
      </div>

      {/* Selected Block Detail */}
      {selectedBlock && (
        <div
          style={{
            marginTop: "16px",
            padding: "16px",
            background: "rgba(0, 229, 255, 0.03)",
            border: "1px solid var(--glass-border)",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "11px", color: "var(--accent-breeze)", marginBottom: "8px", fontWeight: 600 }}>
            Block Detail
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "10px" }}>
            <div>
              <span style={{ color: "var(--mute)" }}>Memory ID: </span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
                {selectedBlock.memoryId.substring(0, 12)}...
              </span>
            </div>
            <div>
              <span style={{ color: "var(--mute)" }}>Created: </span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
                {new Date(selectedBlock.createdAt).toLocaleString()}
              </span>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <span style={{ color: "var(--mute)" }}>Content: </span>
              <span style={{ color: "var(--ink)" }}>{selectedBlock.content}</span>
            </div>
            <div>
              <span style={{ color: "var(--mute)" }}>Prev Hash: </span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink)", fontSize: "9px" }}>
                {truncatedHash(selectedBlock.previousHash || "")}
              </span>
            </div>
            <div>
              <span style={{ color: "var(--mute)" }}>Hash: </span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent-emerald)", fontSize: "9px" }}>
                {truncatedHash(selectedBlock.cryptographicHash)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
