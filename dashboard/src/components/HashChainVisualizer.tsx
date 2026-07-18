"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";

interface HashChainEntry {
  memoryId: string;
  content: string;
  cryptographicHash: string;
  previousHash: string | null;
  createdAt: string;
  importanceScore: number;
}

export default function HashChainVisualizer() {
  const [chain, setChain] = useState<HashChainEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<HashChainEntry | null>(null);
  const [chainValid, setChainValid] = useState<boolean | null>(null);

  useEffect(() => {
    fetchChain();
  }, []);

  const fetchChain = async () => {
    try {
      const res = await fetchWithTimeout("/api/memories?limit=10");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      // Handle the apiSuccess envelope: { success: true, data: { memories: [...] } }
      const memories = data?.data?.memories || data?.memories || [];
      setChain(memories);

      // Verify chain integrity
      let valid = true;
      for (let i = 1; i < memories.length; i++) {
        if (memories[i].previousHash !== memories[i - 1].cryptographicHash) {
          valid = false;
          break;
        }
      }
      setChainValid(memories.length > 1 ? valid : true);
    } catch (err) {
      console.error("Failed to fetch chain:", err);
      setError(err instanceof Error ? err.message : "Failed to load chain");
    } finally {
      setLoading(false);
    }
  };

  const truncateHash = (hash: string | null | undefined) => {
    if (!hash) return "genesis";
    if (hash.length < 16) return hash;
    return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
  };

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="animate-pulse text-gray-500">Loading hash chain...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔐</span>
          <div>
            <h2 className="text-xl font-bold text-white">Hash Chain Integrity</h2>
            <p className="text-gray-400 text-sm">
              SHA-256 cryptographic linking — tamper-proof memory chain
            </p>
          </div>
        </div>
        <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
          chainValid === true ? "bg-green-900 text-green-300" :
          chainValid === false ? "bg-red-900 text-red-300" :
          "bg-gray-800 text-gray-400"
        }`}>
          {chainValid === true ? "✓ Chain Verified" :
           chainValid === false ? "✗ Chain Broken" :
           "— Unknown"}
        </div>
      </div>

      {/* Chain visualization */}
      {chain.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No memories in chain yet.</div>
      ) : (
        <div className="space-y-2">
          {chain.map((entry, idx) => (
            <div key={entry.memoryId} className="relative">
              {/* Connector line */}
              {idx < chain.length - 1 && (
                <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-gradient-to-b from-cyan-500/50 to-cyan-500/20" />
              )}

              {/* Entry card */}
              <div
                className={`relative pl-14 p-4 rounded-lg border transition cursor-pointer ${
                  selectedEntry?.memoryId === entry.memoryId
                    ? "bg-gray-800 border-cyan-500/50"
                    : "bg-gray-800/50 border-gray-700 hover:border-gray-600"
                }`}
                onClick={() => setSelectedEntry(
                  selectedEntry?.memoryId === entry.memoryId ? null : entry
                )}
              >
                {/* Chain node */}
                <div className={`absolute left-3 top-4 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  entry.previousHash ? "bg-cyan-600 text-white" : "bg-green-600 text-white"
                }`}>
                  {idx === 0 ? "G" : idx}
                </div>

                {/* Content */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium text-sm truncate">
                        {entry.content?.substring(0, 80) || "No content"}
                      </span>
                    </div>

                    {/* Hash display */}
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-gray-500">Hash:</span>
                      <span className="text-cyan-400">{truncateHash(entry.cryptographicHash)}</span>
                      {entry.previousHash && (
                        <>
                          <span className="text-gray-600">←</span>
                          <span className="text-gray-500">Prev:</span>
                          <span className="text-gray-400">{truncateHash(entry.previousHash)}</span>
                        </>
                      )}
                    </div>

                    <div className="text-xs text-gray-500 mt-1">
                      {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "Unknown time"}
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {selectedEntry?.memoryId === entry.memoryId && (
                  <div className="mt-4 pt-4 border-t border-gray-700 space-y-2 text-sm">
                    <div className="flex gap-2">
                      <span className="text-gray-500 w-20">Full Hash:</span>
                      <code className="text-cyan-400 font-mono text-xs break-all">{entry.cryptographicHash}</code>
                    </div>
                    {entry.previousHash && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-20">Prev Hash:</span>
                        <code className="text-gray-400 font-mono text-xs break-all">{entry.previousHash}</code>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <span className="text-gray-500 w-20">Memory ID:</span>
                      <code className="text-blue-400 font-mono text-xs">{entry.memoryId}</code>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-gray-500 w-20">Importance:</span>
                      <span className="text-white">{entry.importanceScore?.toFixed(1) || "N/A"}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chain stats */}
      {chain.length > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-cyan-400">{chain.length}</div>
            <div className="text-xs text-gray-500">Chain Links</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-green-400">
              {chain.filter(e => e.previousHash !== null).length}
            </div>
            <div className="text-xs text-gray-500">Linked</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-purple-400">
              {chain.filter(e => e.previousHash === null).length}
            </div>
            <div className="text-xs text-gray-500">Genesis</div>
          </div>
        </div>
      )}
    </div>
  );
}
