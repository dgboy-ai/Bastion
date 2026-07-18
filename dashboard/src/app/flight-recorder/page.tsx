"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";

interface FlightEvent {
  id: string;
  timestamp: string;
  type: "store" | "search" | "delete" | "guard_block" | "time_travel" | "recovery" | "audit" | "hash_verify";
  agent_id: string;
  memory_id?: string;
  content_preview: string;
  hash?: string;
  previous_hash?: string;
  trust_score?: number;
  status: "success" | "blocked" | "recovered" | "failed";
  details?: string;
}

const EVENT_COLORS: Record<string, string> = {
  store: "bg-green-500",
  search: "bg-blue-500",
  delete: "bg-red-500",
  guard_block: "bg-yellow-500",
  time_travel: "bg-purple-500",
  recovery: "bg-cyan-500",
  audit: "bg-gray-500",
  hash_verify: "bg-emerald-500",
};

const EVENT_ICONS: Record<string, string> = {
  store: "💾",
  search: "🔍",
  delete: "🗑️",
  guard_block: "🛡️",
  time_travel: "⏰",
  recovery: "🔄",
  audit: "📋",
  hash_verify: "🔐",
};

export default function FlightRecorderPage() {
  const [events, setEvents] = useState<FlightEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [selectedEvent, setSelectedEvent] = useState<FlightEvent | null>(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const res = await fetchWithTimeout("/api/audit?limit=50");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      // Handle the apiSuccess envelope: { success: true, data: { events: [...] } }
      const eventList = data?.data?.events || data?.events || [];
      setEvents(eventList);
    } catch (err) {
      console.error("Failed to fetch audit events:", err);
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = filter === "all"
    ? events
    : events.filter(e => e.type === filter);

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Agent Flight Recorder</h1>
          <p className="text-gray-400">
            Immutable, cryptographically-signed audit trail of all memory operations.
            Every event is hash-chained for tamper-proof integrity.
          </p>
        </div>

        {/* Filter Bar */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {["all", "store", "search", "guard_block", "time_travel", "recovery", "hash_verify"].map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                filter === type
                  ? "bg-white text-black"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {type === "all" ? "All Events" : `${EVENT_ICONS[type] || ""} ${type.replace("_", " ")}`}
            </button>
          ))}
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6 text-red-300">
            Error loading events: {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="text-center py-12 text-gray-500">
            <div className="animate-pulse">Loading flight recorder data...</div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filteredEvents.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            {filter === "all" ? "No events recorded yet. Store some memories to see the audit trail." : `No "${filter.replace("_", " ")}" events found.`}
          </div>
        )}

        {/* Timeline */}
        {!loading && filteredEvents.length > 0 && (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-700" />

            {/* Events */}
            <div className="space-y-4">
              {filteredEvents.map((event, idx) => (
                <div
                  key={event.id || idx}
                  className="relative pl-20 cursor-pointer hover:bg-gray-900/50 rounded-lg p-4 transition"
                  onClick={() => setSelectedEvent(selectedEvent?.id === event.id ? null : event)}
                >
                  {/* Timeline dot */}
                  <div className={`absolute left-6 top-6 w-5 h-5 rounded-full ${EVENT_COLORS[event.type] || "bg-gray-500"} border-2 border-black`} />

                  {/* Event card */}
                  <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xl">{EVENT_ICONS[event.type] || "📝"}</span>
                          <span className="font-semibold text-white capitalize">
                            {event.type.replace("_", " ")}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            event.status === "success" ? "bg-green-900 text-green-300" :
                            event.status === "blocked" ? "bg-yellow-900 text-yellow-300" :
                            event.status === "recovered" ? "bg-cyan-900 text-cyan-300" :
                            "bg-red-900 text-red-300"
                          }`}>
                            {event.status}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm mb-2">{event.content_preview}</p>
                        <div className="flex gap-4 text-xs text-gray-500">
                          <span>{new Date(event.timestamp).toLocaleString()}</span>
                          <span>Agent: {event.agent_id}</span>
                          {event.trust_score !== undefined && (
                            <span className={event.trust_score > 0.7 ? "text-green-500" : "text-yellow-500"}>
                              Trust: {(event.trust_score * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {selectedEvent?.id === event.id && (
                      <div className="mt-4 pt-4 border-t border-gray-800 space-y-2 text-sm">
                        {event.hash && (
                          <div className="flex gap-2">
                            <span className="text-gray-500 w-24">Hash:</span>
                            <code className="text-green-400 font-mono text-xs break-all">{event.hash}</code>
                          </div>
                        )}
                        {event.previous_hash && (
                          <div className="flex gap-2">
                            <span className="text-gray-500 w-24">Prev Hash:</span>
                            <code className="text-gray-400 font-mono text-xs break-all">{event.previous_hash}</code>
                          </div>
                        )}
                        {event.memory_id && (
                          <div className="flex gap-2">
                            <span className="text-gray-500 w-24">Memory ID:</span>
                            <code className="text-blue-400 font-mono text-xs">{event.memory_id}</code>
                          </div>
                        )}
                        {event.details && (
                          <div className="flex gap-2">
                            <span className="text-gray-500 w-24">Details:</span>
                            <span className="text-gray-300">{event.details}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats footer */}
        {!loading && events.length > 0 && (
          <div className="mt-8 grid grid-cols-4 gap-4">
            <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
              <div className="text-2xl font-bold text-white">{events.length}</div>
              <div className="text-gray-500 text-sm">Total Events</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
              <div className="text-2xl font-bold text-green-400">
                {events.filter(e => e.status === "success").length}
              </div>
              <div className="text-gray-500 text-sm">Successful</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
              <div className="text-2xl font-bold text-yellow-400">
                {events.filter(e => e.status === "blocked").length}
              </div>
              <div className="text-gray-500 text-sm">Blocked</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
              <div className="text-2xl font-bold text-cyan-400">
                {events.filter(e => e.status === "recovered").length}
              </div>
              <div className="text-gray-500 text-sm">Recovered</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
