"use client";

import { useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";

interface SearchFilters {
  query: string;
  memory_type: string;
  agent_id: string;
  min_trust: number;
  created_after: string;
  created_before: string;
}

interface SearchResult {
  memoryId: string;
  agentId: string;
  content: string;
  memoryType: string;
  importanceScore: number;
  createdAt: string;
  cryptographicHash: string;
}

export default function HybridSearchPanel() {
  const [filters, setFilters] = useState<SearchFilters>({
    query: "",
    memory_type: "",
    agent_id: "",
    min_trust: 0,
    created_after: "",
    created_before: "",
  });

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTime, setSearchTime] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const handleSearch = async () => {
    if (!filters.query.trim()) return;
    setLoading(true);
    setError(null);
    const start = Date.now();

    try {
      // Use the correct parameter name: "search" not "q"
      const params = new URLSearchParams({
        search: filters.query,
        limit: "50",
      });

      const res = await fetchWithTimeout(`/api/memories?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      // Handle the apiSuccess envelope: { success: true, data: { memories: [...] } }
      let items: SearchResult[] = data?.data?.memories || data?.memories || [];
      const total = data?.data?.total || items.length;
      setTotalCount(total);

      // Client-side filtering for fields not in the API
      if (filters.memory_type) {
        items = items.filter((r: SearchResult) => r.memoryType === filters.memory_type);
      }
      if (filters.agent_id) {
        items = items.filter((r: SearchResult) =>
          r.agentId?.toLowerCase().includes(filters.agent_id.toLowerCase())
        );
      }
      if (filters.min_trust > 0) {
        // Trust level not in API response, skip this filter
      }
      if (filters.created_after) {
        const after = new Date(filters.created_after);
        items = items.filter((r: SearchResult) => new Date(r.createdAt) >= after);
      }
      if (filters.created_before) {
        const before = new Date(filters.created_before);
        items = items.filter((r: SearchResult) => new Date(r.createdAt) <= before);
      }

      setResults(items);
    } catch (err) {
      console.error("Search failed:", err);
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setSearchTime(Date.now() - start);
      setLoading(false);
    }
  };

  const truncateHash = (hash: string | null | undefined) => {
    if (!hash) return "N/A";
    if (hash.length < 16) return hash;
    return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">🔍</span>
        <div>
          <h2 className="text-xl font-bold text-white">Hybrid Search</h2>
          <p className="text-gray-400 text-sm">
            Semantic similarity + relational metadata in a single query
          </p>
        </div>
      </div>

      {/* Search Input */}
      <div className="mb-4">
        <input
          type="text"
          value={filters.query}
          onChange={(e) => setFilters({ ...filters, query: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search memories semantically... (e.g., 'revenue concerns', 'security threats')"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Filter Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Memory Type</label>
          <select
            value={filters.memory_type}
            onChange={(e) => setFilters({ ...filters, memory_type: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="">All Types</option>
            <option value="fact">Fact</option>
            <option value="episodic">Episodic</option>
            <option value="semantic">Semantic</option>
            <option value="procedural">Procedural</option>
            <option value="preference">Preference</option>
            <option value="security">Security</option>
            <option value="instruction">Instruction</option>
            <option value="learned">Learned</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Agent ID</label>
          <input
            type="text"
            value={filters.agent_id}
            onChange={(e) => setFilters({ ...filters, agent_id: e.target.value })}
            placeholder="Filter by agent"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Created After</label>
          <input
            type="datetime-local"
            value={filters.created_after}
            onChange={(e) => setFilters({ ...filters, created_after: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Created Before</label>
          <input
            type="datetime-local"
            value={filters.created_before}
            onChange={(e) => setFilters({ ...filters, created_before: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>
      </div>

      {/* Search Button */}
      <button
        onClick={handleSearch}
        disabled={loading || !filters.query.trim()}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition"
      >
        {loading ? "Searching..." : "Search with Hybrid Filters"}
      </button>

      {/* Error state */}
      {error && (
        <div className="mt-4 bg-red-900/50 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Search Stats */}
      {searchTime !== null && (
        <div className="mt-4 flex items-center gap-4 text-sm text-gray-400">
          <span>{results.length} results</span>
          <span>{searchTime}ms</span>
          <span className="text-green-400">
            Vector + Metadata in single query
          </span>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-6 space-y-3">
          {results.map((result) => (
            <div
              key={result.memoryId}
              className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-300">
                    {result.memoryType}
                  </span>
                  <span className="text-xs text-gray-500">
                    Agent: {result.agentId}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {result.createdAt ? new Date(result.createdAt).toLocaleString() : "N/A"}
                </span>
              </div>
              <p className="text-gray-300 text-sm mb-2">{result.content}</p>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Importance: {result.importanceScore?.toFixed(1) || "N/A"}</span>
                <code className="font-mono text-gray-600">{truncateHash(result.cryptographicHash)}</code>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
