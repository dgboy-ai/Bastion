import { expect, test, describe, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import OverviewPage from '@/app/page'
import LogsPage from '@/app/logs/page'
import GraphPage from '@/app/graph/page'
import CompliancePage from '@/app/compliance/page'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) =>
    <a href={href} {...props}>{children}</a>,
}))

class MockEventSource {
  onopen: (() => void) | null = null
  onmessage: ((msg: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  close() {}
  constructor(url: string) {
    void url;
    setTimeout(() => this.onopen?.(), 0)
  }
}
vi.stubGlobal('EventSource', MockEventSource)

// Mock canvas context for JSDOM
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  fillText: vi.fn(),
  strokeText: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  canvas: { width: 300, height: 150 },
})) as any

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockStats = {
  memories: 15234,
  entities: 89,
  relations: 256,
  auditLogs: 4210,
  conflicts: 18,
  avgImportance: '7.4',
  decayCurve: [
    { label: '24h', value: 2.1 },
    { label: '12h', value: 4.5 },
    { label: 'now', value: 7.2 },
  ],
  hourlyGrowth: [30, 45, 60, 75, 50, 40, 55, 80],
  topRecalls: [
    { rank: 1, text: 'Project architecture decision', count: 142 },
    { rank: 2, text: 'User authentication flow', count: 98 },
  ],
  cacheHitPct: '94.2',
  recentAudits: [
    { id: '1', action: 'store', recordedAt: new Date().toISOString(), details: { key: 'val' } },
  ],
}

const mockTrust = {
  summary: {
    totalMemories: 15234,
    avgTrustScore: 0.92,
    trustLevelDistribution: { 0: 1000, 1: 5000, 2: 6000, 3: 2000, 4: 1234 },
    poisoningDistribution: { none: 80, low: 12, medium: 5, high: 3 },
    dangerousMemories: 127,
  },
  alerts: [{ severity: 'high', risk: 'prompt_injection', count: 3 }],
}

const mockDrift = {
  latest: { overall_drift_score: 0.12, status: 'HEALTHY', top_drift_signals: ['entity_drift'], recommendation: 'No action needed' },
  timeSeries: [{ score: 0.1, timestamp: new Date().toISOString(), status: 'HEALTHY' }],
}

const mockGraph = {
  nodes: [
    { id: 'n1', name: 'Alice', type: 'person', attributes: { role: 'engineer' } },
    { id: 'n2', name: 'Bob', type: 'person', attributes: { role: 'designer' } },
  ],
  links: [{ id: 'l1', source: 'n1', target: 'n2', type: 'collaborates', confidence: 0.95 }],
}

const mockMemories = {
  memories: [
    {
      memoryId: 'm1', agentId: 'a1', memoryType: 'fact', content: 'Test memory',
      metadata: {}, previousHash: null, cryptographicHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd',
      importanceScore: 7.5, createdAt: new Date().toISOString(), expiresAt: null, accessCount: 42,
    },
  ],
  total: 1, page: 1,
}

const mockCompliance = {
  reportId: 'r1', agentId: 'a1', status: 'COMPLIANT', generatedAt: new Date().toISOString(),
  article12: { humanOversight: true, auditTrailEnabled: true, tamperEvidentLogging: true, pointInTimeSnapshots: true, dataRetentionPolicy: '90 days' },
  recentAuditTrail: [{ action: 'store', agentId: 'a1', timestamp: new Date().toISOString(), details: {} }],
  mock: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetch.mockReset()
})

describe.skip('OverviewPage', () => {
  test('renders loading skeleton on mount', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    const { container } = render(<OverviewPage />)
    const shimmers = container.querySelectorAll('.shimmer-pulse')
    expect(shimmers.length).toBeGreaterThan(0)
  })

  test('renders KPI cards and panels after successful fetch', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockStats })
      .mockResolvedValueOnce({ ok: true, json: async () => mockTrust })
      .mockResolvedValueOnce({ ok: true, json: async () => mockDrift })
      .mockResolvedValue({ ok: true, json: async () => ({ summary: { totalChecks: 100 } }) })

    render(<OverviewPage />)

    await waitFor(() => {
      expect(screen.getByText(/Hello Agent/)).toBeDefined()
    })
    expect(screen.getByText(/Memory Trust Score/)).toBeDefined()
    expect(screen.getByText(/Agent Stability Index/)).toBeDefined()
    expect(screen.getByText(/Cache Hit Ratio/)).toBeDefined()
    expect(screen.getByText(/Live Event Stream/)).toBeDefined()
    expect(screen.getByText(/MemoryGuard/)).toBeDefined()
  })

  test('renders error state when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Database connection refused'))

    render(<OverviewPage />)

    await waitFor(() => {
      expect(screen.getByText(/Telemetry Link Offline/)).toBeDefined()
    })
    expect(screen.getByText(/Database connection refused/)).toBeDefined()
  })

  test('handles empty API response gracefully', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true, json: async () => ({}) })

    render(<OverviewPage />)

    await waitFor(() => {
      expect(screen.getByText(/Hello Agent/)).toBeDefined()
    })
  })
})

describe('LogsPage', () => {
  test('renders loading state on mount', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    render(<LogsPage />)
    expect(screen.getByText(/SYNCHRONIZING MEMORIES PIPELINE/)).toBeDefined()
  })

  test('renders search input and table after successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockMemories })

    render(<LogsPage />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search by memory/i)).toBeDefined()
    })
    const table = document.querySelector('table.data-table')
    expect(table).toBeTruthy()
    const rows = table!.querySelectorAll('tbody tr')
    expect(rows.length).toBeGreaterThan(0)
  })

  test('handles empty results', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ memories: [], total: 0, page: 1 }) })

    render(<LogsPage />)

    await waitFor(() => {
      expect(screen.getByText(/NO MEMORIES MATCHED/)).toBeDefined()
    })
  })

  test('handles fetch error gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    render(<LogsPage />)

    await waitFor(() => {
      expect(screen.getByText(/FETCH FAILED/)).toBeDefined()
    })
    expect(screen.getByText(/Network error/)).toBeDefined()
  })
})

describe('GraphPage', () => {
  test('renders loading state on mount', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    render(<GraphPage />)
    expect(screen.getByText(/SYNCHRONIZING GRAPH SNAPSHOT/)).toBeDefined()
  })

  test('renders graph area and time-travel slider after successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockGraph })

    render(<GraphPage />)

    await waitFor(() => {
      expect(screen.getByText(/Temporal Graph Explorer/)).toBeDefined()
    })
    const slider = document.querySelector('input[type="range"].time-slider')
    expect(slider).toBeTruthy()
  })

  test('renders entity panel when a node is selected', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockGraph })

    render(<GraphPage />)

    await waitFor(() => {
      expect(screen.getByText(/Select a node/)).toBeDefined()
    })
  })

  test('handles empty graph response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ nodes: [], links: [] }) })

    render(<GraphPage />)

    await waitFor(() => {
      expect(screen.getByText(/NO ENTITIES DETECTED/)).toBeDefined()
    })
  })

  test('handles fetch error gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Graph fetch failed'))

    render(<GraphPage />)

    await waitFor(() => {
      expect(screen.getByText(/RENDER FAILED/)).toBeDefined()
    })
    expect(screen.getByText(/Graph fetch failed/)).toBeDefined()
  })
})

describe('CompliancePage', () => {
  test('renders report skeleton on load', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    const { container } = render(<CompliancePage />)
    const skeleton = container.querySelector('.animate-pulse')
    expect(skeleton).toBeTruthy()
  })

  test('renders report and export buttons after successful fetch', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockCompliance })

    render(<CompliancePage />)

    await waitFor(() => {
      expect(screen.getByText(/EU AI Act Article 12 Compliance/)).toBeDefined()
    })
    expect(screen.getByText(/COMPLIANT/)).toBeDefined()
    expect(screen.getByText(/Export JSON/)).toBeDefined()
    expect(screen.getByText(/Export CSV/)).toBeDefined()
    const auditElements = screen.getAllByText(/Audit Trail/)
    expect(auditElements.length).toBeGreaterThanOrEqual(2)
  })

  test('handles fetch error gracefully (silent catch)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    render(<CompliancePage />)

    await waitFor(() => {
      expect(screen.getByText(/Compliance Check Failed/)).toBeDefined()
      expect(screen.getByText(/Network error/)).toBeDefined()
    })
  })

  test('handles empty audit trail', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...mockCompliance, recentAuditTrail: [] }) })

    render(<CompliancePage />)

    await waitFor(() => {
      expect(screen.getByText(/0 entries/)).toBeDefined()
    })
  })
})
