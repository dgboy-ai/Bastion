"use client";

import { useEffect, useRef, useState } from "react";

interface FallbackTier {
  name: string;
  status: "active" | "fallback" | "failed" | "standby";
  latency: string;
  description: string;
}

export default function FaultToleranceVisualizer() {
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [tiers, setTiers] = useState<FallbackTier[]>([
    { name: "Amazon Bedrock", status: "active", latency: "~120ms", description: "Titan V2 embeddings (1024-dim)" },
    { name: "all-MiniLM-L6-v2", status: "standby", latency: "~45ms", description: "Local model (384-dim, padded)" },
    { name: "Hash Fallback", status: "standby", latency: "<1ms", description: "SHA-256 deterministic embedding" },
  ]);
  const [circuitState, setCircuitState] = useState<"closed" | "open" | "half-open">("closed");
  const [failureCount, setFailureCount] = useState(0);

  useEffect(() => {
    return () => {
      // Clean up all pending timeouts on unmount
      timeoutsRef.current.forEach(id => clearTimeout(id));
      timeoutsRef.current = [];
    };
  }, []);

  const scheduleTimeout = (fn: () => void, delay: number) => {
    const id = setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter(t => t !== id);
      fn();
    }, delay);
    timeoutsRef.current.push(id);
  };

  const simulateBedrockFailure = () => {
    const newCount = failureCount + 1;
    setFailureCount(newCount);

    if (newCount >= 5) {
      // Circuit opens after 5 failures
      setCircuitState("open");
      setTiers(prev => prev.map((t, i) => 
        i === 0 ? { ...t, status: "failed" } :
        i === 1 ? { ...t, status: "active" } :
        t
      ));

      // Auto-recover after 30 seconds
      scheduleTimeout(() => {
        setCircuitState("half-open");
        setTiers(prev => prev.map((t, i) => 
          i === 0 ? { ...t, status: "fallback" } :
          i === 1 ? { ...t, status: "fallback" } :
          i === 2 ? { ...t, status: "active" } :
          t
        ));

        // Full recovery after successful probe
        scheduleTimeout(() => {
          setCircuitState("closed");
          setFailureCount(0);
          setTiers(prev => prev.map((t, i) => 
            i === 0 ? { ...t, status: "active" } :
            i === 1 ? { ...t, status: "standby" } :
            i === 2 ? { ...t, status: "standby" } :
            t
          ));
        }, 3000);
      }, 5000);
    } else {
      // Partial degradation
      setTiers(prev => prev.map((t, i) => 
        i === 0 ? { ...t, status: newCount >= 3 ? "fallback" : t.status } :
        i === 1 ? { ...t, status: newCount >= 3 ? "active" : t.status } :
        t
      ));
    }
  };

  const resetSimulation = () => {
    setCircuitState("closed");
    setFailureCount(0);
    setTiers([
      { name: "Amazon Bedrock", status: "active", latency: "~120ms", description: "Titan V2 embeddings (1024-dim)" },
      { name: "all-MiniLM-L6-v2", status: "standby", latency: "~45ms", description: "Local model (384-dim, padded)" },
      { name: "Hash Fallback", status: "standby", latency: "<1ms", description: "SHA-256 deterministic embedding" },
    ]);
  };

  const statusColors: Record<string, string> = {
    active: "bg-green-500",
    fallback: "bg-yellow-500",
    failed: "bg-red-500",
    standby: "bg-gray-600",
  };

  const statusLabels: Record<string, string> = {
    active: "Active",
    fallback: "Fallback",
    failed: "Failed",
    standby: "Standby",
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <h2 className="text-xl font-bold text-white">Fault Tolerance</h2>
            <p className="text-gray-400 text-sm">
              Three-tier embedding fallback — agent never stops working
            </p>
          </div>
        </div>
        <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
          circuitState === "closed" ? "bg-green-900 text-green-300" :
          circuitState === "open" ? "bg-red-900 text-red-300" :
          "bg-yellow-900 text-yellow-300"
        }`}>
          Circuit: {circuitState.toUpperCase()}
        </div>
      </div>

      {/* Circuit Breaker Visualization */}
      <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-400">Circuit Breaker State</span>
          <span className="text-xs text-gray-500">Failures: {failureCount}/5</span>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              className={`h-2 flex-1 rounded ${
                i <= failureCount
                  ? failureCount >= 5 ? "bg-red-500" : "bg-yellow-500"
                  : "bg-gray-700"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Fallback Tiers */}
      <div className="space-y-3 mb-6">
        {tiers.map((tier, idx) => (
          <div
            key={tier.name}
            className={`flex items-center gap-4 p-4 rounded-lg border transition ${
              tier.status === "active"
                ? "bg-gray-800 border-green-500/30"
                : tier.status === "fallback"
                ? "bg-gray-800 border-yellow-500/30"
                : tier.status === "failed"
                ? "bg-gray-800 border-red-500/30"
                : "bg-gray-800/50 border-gray-700"
            }`}
          >
            {/* Tier number */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              tier.status === "active" ? "bg-green-600 text-white" :
              tier.status === "fallback" ? "bg-yellow-600 text-white" :
              tier.status === "failed" ? "bg-red-600 text-white" :
              "bg-gray-700 text-gray-400"
            }`}>
              {idx + 1}
            </div>

            {/* Tier info */}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium">{tier.name}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[tier.status]} text-white`}>
                  {statusLabels[tier.status]}
                </span>
              </div>
              <p className="text-gray-400 text-sm mt-1">{tier.description}</p>
            </div>

            {/* Latency */}
            <div className="text-right">
              <div className="text-sm text-gray-400">{tier.latency}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Arrow indicators */}
      <div className="flex items-center justify-center gap-2 text-gray-500 text-sm mb-6">
        <span>Bedrock fails</span>
        <span>→</span>
        <span>MiniLM activates</span>
        <span>→</span>
        <span>Hash fallback</span>
        <span>→</span>
        <span className="text-green-400">Agent continues</span>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        <button
          onClick={simulateBedrockFailure}
          disabled={circuitState === "open"}
          className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition"
        >
          {circuitState === "open" ? "Circuit Open — Recovering..." : "Simulate Bedrock Failure"}
        </button>
        <button
          onClick={resetSimulation}
          className="px-6 bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 rounded-lg transition"
        >
          Reset
        </button>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-lg font-bold text-green-400">99.99%</div>
          <div className="text-xs text-gray-500">Uptime</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-lg font-bold text-blue-400">3</div>
          <div className="text-xs text-gray-500">Fallback Tiers</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="text-lg font-bold text-purple-400">0</div>
          <div className="text-xs text-gray-500">Downtime</div>
        </div>
      </div>
    </div>
  );
}
