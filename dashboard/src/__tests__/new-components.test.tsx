import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("HybridSearchPanel", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders search input and filter controls", async () => {
    const { default: HybridSearchPanel } = await import("@/components/HybridSearchPanel");
    render(<HybridSearchPanel />);
    expect(screen.getByPlaceholderText(/Search memories semantically/)).toBeDefined();
    expect(screen.getByText("Search with Hybrid Filters")).toBeDefined();
  });

  it("does not search when query is empty", async () => {
    const { default: HybridSearchPanel } = await import("@/components/HybridSearchPanel");
    render(<HybridSearchPanel />);
    const button = screen.getByText("Search with Hybrid Filters");
    expect(button).toBeDisabled();
  });

  it("sends correct 'search' parameter (not 'q')", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { memories: [], total: 0 } }),
    });

    const { default: HybridSearchPanel } = await import("@/components/HybridSearchPanel");
    render(<HybridSearchPanel />);

    const input = screen.getByPlaceholderText(/Search memories semantically/);
    fireEvent.change(input, { target: { value: "test query" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain("search=test+query");
      expect(callUrl).not.toContain("q=");
    });
  });

  it("handles apiSuccess envelope correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          memories: [
            {
              memoryId: "test-1",
              agentId: "agent-1",
              content: "Test memory content",
              memoryType: "fact",
              importanceScore: 8.5,
              createdAt: new Date().toISOString(),
              cryptographicHash: "abc123def456",
            },
          ],
          total: 1,
        },
      }),
    });

    const { default: HybridSearchPanel } = await import("@/components/HybridSearchPanel");
    render(<HybridSearchPanel />);

    const input = screen.getByPlaceholderText(/Search memories semantically/);
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Test memory content")).toBeDefined();
      expect(screen.getByText("fact")).toBeDefined();
    });
  });

  it("displays error state on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    const { default: HybridSearchPanel } = await import("@/components/HybridSearchPanel");
    render(<HybridSearchPanel />);

    const input = screen.getByPlaceholderText(/Search memories semantically/);
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText(/503/)).toBeDefined();
    });
  });
});

describe("HashChainVisualizer", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders loading state", async () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {})); // Never resolves
    const { default: HashChainVisualizer } = await import("@/components/HashChainVisualizer");
    render(<HashChainVisualizer />);
    expect(screen.getByText("Loading hash chain...")).toBeDefined();
  });

  it("renders chain with correct field names (camelCase)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          memories: [
            {
              memoryId: "mem-1",
              content: "First memory",
              cryptographicHash: "hash-1-abc",
              previousHash: null,
              createdAt: new Date().toISOString(),
              importanceScore: 8.0,
            },
            {
              memoryId: "mem-2",
              content: "Second memory",
              cryptographicHash: "hash-2-def",
              previousHash: "hash-1-abc",
              createdAt: new Date().toISOString(),
              importanceScore: 7.5,
            },
          ],
        },
      }),
    });

    const { default: HashChainVisualizer } = await import("@/components/HashChainVisualizer");
    render(<HashChainVisualizer />);

    await waitFor(() => {
      expect(screen.getByText("First memory")).toBeDefined();
      expect(screen.getByText("Second memory")).toBeDefined();
      expect(screen.getByText("✓ Chain Verified")).toBeDefined();
    });
  });

  it("detects broken chain", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          memories: [
            {
              memoryId: "mem-1",
              content: "First memory",
              cryptographicHash: "hash-1-abc",
              previousHash: null,
              createdAt: new Date().toISOString(),
              importanceScore: 8.0,
            },
            {
              memoryId: "mem-2",
              content: "Second memory",
              cryptographicHash: "hash-2-def",
              previousHash: "WRONG-HASH", // Broken chain
              createdAt: new Date().toISOString(),
              importanceScore: 7.5,
            },
          ],
        },
      }),
    });

    const { default: HashChainVisualizer } = await import("@/components/HashChainVisualizer");
    render(<HashChainVisualizer />);

    await waitFor(() => {
      expect(screen.getByText("✗ Chain Broken")).toBeDefined();
    });
  });

  it("displays error state on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { default: HashChainVisualizer } = await import("@/components/HashChainVisualizer");
    render(<HashChainVisualizer />);

    await waitFor(() => {
      expect(screen.getByText(/Error/)).toBeDefined();
    });
  });
});

describe("FlightRecorderPage", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders the page header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { events: [] } }),
    });

    const { default: FlightRecorderPage } = await import("@/app/flight-recorder/page");
    render(<FlightRecorderPage />);

    expect(screen.getByText("Agent Flight Recorder")).toBeDefined();
  });

  it("fetches from /api/audit (not /api/events)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { events: [] } }),
    });

    const { default: FlightRecorderPage } = await import("@/app/flight-recorder/page");
    render(<FlightRecorderPage />);

    await waitFor(() => {
      expect(mockFetch.mock.calls[0][0]).toBe("/api/audit?limit=50");
    });
  });

  it("displays events with correct field names", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          events: [
            {
              id: "audit-1",
              timestamp: new Date().toISOString(),
              type: "store",
              agent_id: "agent-1",
              content_preview: "Test memory stored",
              hash: "abc123",
              previous_hash: null,
              trust_score: 0.9,
              status: "success",
              details: "{}",
            },
          ],
        },
      }),
    });

    const { default: FlightRecorderPage } = await import("@/app/flight-recorder/page");
    render(<FlightRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText("Test memory stored")).toBeDefined();
      expect(screen.getByText("store")).toBeDefined();
    });
  });

  it("shows empty state when no events", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { events: [] } }),
    });

    const { default: FlightRecorderPage } = await import("@/app/flight-recorder/page");
    render(<FlightRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText(/No events recorded yet/)).toBeDefined();
    });
  });

  it("filters events by type", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          events: [
            { id: "1", timestamp: new Date().toISOString(), type: "store", agent_id: "a", content_preview: "Store event", status: "success" },
            { id: "2", timestamp: new Date().toISOString(), type: "guard_block", agent_id: "a", content_preview: "Block event", status: "blocked" },
          ],
        },
      }),
    });

    const { default: FlightRecorderPage } = await import("@/app/flight-recorder/page");
    render(<FlightRecorderPage />);

    await waitFor(() => {
      expect(screen.getByText("Store event")).toBeDefined();
      expect(screen.getByText("Block event")).toBeDefined();
    });

    // Click filter button for "store" type (use the button with emoji prefix)
    const storeFilter = screen.getByRole("button", { name: /💾 store/i });
    fireEvent.click(storeFilter);

    await waitFor(() => {
      expect(screen.getByText("Store event")).toBeDefined();
      expect(screen.queryByText("Block event")).toBeNull();
    });
  });
});

describe("FaultToleranceVisualizer", () => {
  it("renders the component", async () => {
    const { default: FaultToleranceVisualizer } = await import("@/components/FaultToleranceVisualizer");
    render(<FaultToleranceVisualizer />);
    expect(screen.getByText("Fault Tolerance")).toBeDefined();
    expect(screen.getByText("Amazon Bedrock")).toBeDefined();
    expect(screen.getByText("all-MiniLM-L6-v2")).toBeDefined();
    expect(screen.getByText("Hash Fallback")).toBeDefined();
  });

  it("shows circuit breaker closed by default", async () => {
    const { default: FaultToleranceVisualizer } = await import("@/components/FaultToleranceVisualizer");
    render(<FaultToleranceVisualizer />);
    expect(screen.getByText("Circuit: CLOSED")).toBeDefined();
  });

  it("simulates Bedrock failure", async () => {
    vi.useFakeTimers();
    const { default: FaultToleranceVisualizer } = await import("@/components/FaultToleranceVisualizer");
    render(<FaultToleranceVisualizer />);

    // Click failure button 5 times to open circuit
    for (let i = 0; i < 5; i++) {
      fireEvent.click(screen.getByText("Simulate Bedrock Failure"));
    }

    expect(screen.getByText("Circuit: OPEN")).toBeDefined();
    expect(screen.getByText("Failed")).toBeDefined();

    vi.useRealTimers();
  });
});
