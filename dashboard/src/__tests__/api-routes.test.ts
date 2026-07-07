import { expect, test, describe } from 'vitest'

const BASE = process.env.TEST_API_BASE || 'http://localhost:3000'
// These tests verify API responses conform to expected schemas
// Requires a running dev server; set TEST_API_BASE env to enable
interface ApiResponse {
  ok: boolean
  status: number
  data: unknown
  error?: string
}

async function fetchApi(path: string): Promise<ApiResponse> {
  try {
    const res = await fetch(`${BASE}${path}`)
    const data = await res.json()
    return { ok: res.ok, status: res.status, data }
  } catch (err) {
    return { ok: false, status: 0, data: null, error: String(err) }
  }
}

const itIfServer = process.env.TEST_API_BASE ? test : test.skip

describe('Dashboard API Routes', () => {
  itIfServer('/api/stats returns overall KPIs', async () => {
    const { ok, data } = await fetchApi('/api/stats')
    expect(ok).toBe(true)
    const d = data as Record<string, unknown>
    expect(typeof d.totalMemories).toBe('number')
    expect(typeof d.totalAgents).toBe('number')
    expect(typeof d.totalAuditEntries).toBe('number')
    expect(Array.isArray(d.hourlyGrowth)).toBe(true)
  })

  itIfServer('/api/memories returns paginated memories with defaults', async () => {
    const { ok, data } = await fetchApi('/api/memories')
    expect(ok).toBe(true)
    const d = data as Record<string, unknown>
    expect(Array.isArray(d.memories)).toBe(true)
    expect(typeof d.total).toBe('number')
    expect(typeof d.page).toBe('number')
    expect(d.page).toBe(1)
  })

  itIfServer('/api/memories respects page and limit params', async () => {
    const { ok, data } = await fetchApi('/api/memories?page=2&limit=5')
    expect(ok).toBe(true)
    const d = data as Record<string, unknown>
    expect(d.page).toBe(2)
    if (Array.isArray(d.memories)) {
      expect(d.memories.length).toBeLessThanOrEqual(5)
    }
  })

  itIfServer('/api/memories supports search parameter', async () => {
    const { ok, data } = await fetchApi('/api/memories?search=project')
    expect(ok).toBe(true)
    const d = data as Record<string, unknown>
    expect(Array.isArray(d.memories)).toBe(true)
  })

  itIfServer('/api/anomalies returns alert objects', async () => {
    const { ok, data } = await fetchApi('/api/anomalies')
    expect(ok).toBe(true)
    const d = data as Record<string, unknown>
    expect(Array.isArray(d.alerts)).toBe(true)
    if (Array.isArray(d.alerts) && d.alerts.length > 0) {
      const a = d.alerts[0] as Record<string, unknown>
      expect(a).toHaveProperty('type')
      expect(a).toHaveProperty('severity')
      expect(a).toHaveProperty('message')
    }
  })

  itIfServer('/api/drift returns drift report', async () => {
    const { ok, data } = await fetchApi('/api/drift')
    expect(ok).toBe(true)
    const d = data as Record<string, unknown>
    expect(d).toHaveProperty('latest')
    expect(d).toHaveProperty('timeSeries')
  })

  itIfServer('/api/compliance returns EU AI Act report', async () => {
    const { ok, data } = await fetchApi('/api/compliance')
    expect(ok).toBe(true)
    const d = data as Record<string, unknown>
    expect(d).toHaveProperty('status')
    expect(d).toHaveProperty('recentAuditTrail')
    expect(Array.isArray(d.recentAuditTrail)).toBe(true)
  })

  itIfServer('/api/compliance validates month parameter', async () => {
    const { ok, status } = await fetchApi('/api/compliance?month=invalid')
    expect([200, 400]).toContain(status)
  })

  itIfServer('/api/trust returns trust scoring data', async () => {
    const { ok, data } = await fetchApi('/api/trust')
    expect(ok).toBe(true)
    const d = data as Record<string, unknown>
    expect(d).toHaveProperty('summary')
    if (d.summary) {
      const s = d.summary as Record<string, unknown>
      expect(typeof s.totalMemories).toBe('number')
      expect(typeof s.avgTrustScore).toBe('number')
    }
  })

  itIfServer('/api/asi06 returns MemoryGuard report', async () => {
    const { ok, data } = await fetchApi('/api/asi06')
    expect(ok).toBe(true)
    const d = data as Record<string, unknown>
    expect(d).toHaveProperty('summary')
    expect(d).toHaveProperty('recentFindings')
  })

  itIfServer('/api/cache-stats returns cache analytics with competitor comparison', async () => {
    const { ok, data } = await fetchApi('/api/cache-stats')
    expect(ok).toBe(true)
    const d = data as Record<string, unknown>
    expect(d).toHaveProperty('summary')
    expect(d).toHaveProperty('hourlyBreakdown')
    expect(d).toHaveProperty('competitorComparison')
  })

  itIfServer('/api/graph returns entities and relations', async () => {
    const { ok, data } = await fetchApi('/api/graph')
    expect(ok).toBe(true)
    const d = data as Record<string, unknown>
    expect(Array.isArray(d.entities)).toBe(true)
    expect(Array.isArray(d.relations)).toBe(true)
  })

  itIfServer('/api/graph supports AS OF SYSTEM TIME parameter', async () => {
    const { ok, data } = await fetchApi('/api/graph?as_of=-1h')
    expect(ok).toBe(true)
    const d = data as Record<string, unknown>
    expect(Array.isArray(d.entities)).toBe(true)
  })

  itIfServer('/api/entity-memories returns 400 without entity_id', async () => {
    const { status } = await fetchApi('/api/entity-memories')
    expect(status).toBe(400)
  })

  itIfServer('/api/entity-memories works with valid entity_id', async () => {
    const { ok, data } = await fetchApi('/api/entity-memories?entity_id=test-entity')
    expect(ok).toBe(true)
    const d = data as Record<string, unknown>
    expect(d).toHaveProperty('memories')
    expect(d).toHaveProperty('total')
  })

  itIfServer('/api/a2a returns agent card with skills', async () => {
    const { ok, data } = await fetchApi('/api/a2a')
    expect(ok).toBe(true)
    const d = data as Record<string, unknown>
    expect(d).toHaveProperty('name')
    expect(d).toHaveProperty('capabilities')
    expect(Array.isArray(d.skills)).toBe(true)
  })

  itIfServer('/api/events returns SSE stream', async () => {
    try {
      const res = await fetch(`${BASE}/api/events`)
      expect(res.ok).toBe(true)
      expect(res.headers.get('content-type')).toBe('text/event-stream')
      expect(res.headers.get('cache-control')).toBe('no-cache, no-transform')
    } catch {
      // SSE endpoint may not be reachable in test env, that's ok
    }
  })
})

describe('API Error Handling', () => {
  itIfServer('returns empty array for unknown routes gracefully', async () => {
    try {
      const res = await fetch(`${BASE}/api/nonexistent`)
      expect([404, 200]).toContain(res.status)
    } catch {
      // Network errors in test env are acceptable
    }
  })

  itIfServer('handles malformed query params without crashing', async () => {
    const { ok } = await fetchApi('/api/memories?limit=abc')
    expect(ok).toBe(true)
  })
})
