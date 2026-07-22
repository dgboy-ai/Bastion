import { expect, test, describe } from 'vitest'
import { 
  getMockMemories, 
  getMockStats, 
  getMockAnomalies, 
  getMockGraph, 
  getMockDrift, 
  getMockCompliance, 
  getMockTrust, 
  getMockCacheStats 
} from '@/lib/mock-data'

describe('getMockMemories', () => {
  test('returns array of memories with required fields', () => {
    const memories = getMockMemories()
    expect(Array.isArray(memories)).toBe(true)
    expect(memories.length).toBeGreaterThan(0)
    for (const m of memories) {
      expect(m).toHaveProperty('memoryId')
      expect(m).toHaveProperty('agentId')
      expect(m).toHaveProperty('content')
      expect(m).toHaveProperty('memoryType')
      expect(m).toHaveProperty('cryptographicHash')
      expect(m).toHaveProperty('previousHash')
      expect(m).toHaveProperty('importanceScore')
      expect(m).toHaveProperty('createdAt')
      expect(typeof m.memoryId).toBe('string')
      expect(typeof m.importanceScore).toBe('number')
      expect(m.importanceScore).toBeGreaterThanOrEqual(1)
      expect(m.importanceScore).toBeLessThanOrEqual(10)
    }
  })

  test('hashes are non-empty hex strings', () => {
    const memories = getMockMemories()
    for (const m of memories) {
      expect(m.cryptographicHash).toMatch(/^[a-f0-9]{68}$/)
      if (m.previousHash) {
        expect(m.previousHash).toMatch(/^[a-f0-9]{68}$/)
      }
    }
  })

  test('chain integrity: each memory after the first has previousHash matching prior cryptographicHash', () => {
    const memories = getMockMemories()
    for (let i = 1; i < memories.length; i++) {
      expect(memories[i].previousHash).toBe(memories[i - 1].cryptographicHash)
    }
  })
})

describe('getMockStats', () => {
  test('returns numeric KPIs', () => {
    const stats = getMockStats()
    expect(typeof stats.memories).toBe('number')
    expect(typeof stats.entities).toBe('number')
    expect(typeof stats.avgImportance).toBe('string')
    expect(typeof stats.auditLogs).toBe('number')
    expect(stats.memories).toBeGreaterThan(0)
  })

  test('hourlyGrowth has growth numbers array', () => {
    const stats = getMockStats()
    expect(Array.isArray(stats.hourlyGrowth)).toBe(true)
    expect(stats.hourlyGrowth.length).toBeGreaterThan(0)
    for (const point of stats.hourlyGrowth) {
      expect(typeof point).toBe('number')
    }
  })
})

describe('getMockAnomalies', () => {
  test('returns anomaly alerts array', () => {
    const anomalies = getMockAnomalies()
    expect(anomalies).toHaveProperty('alerts')
    expect(Array.isArray(anomalies.alerts)).toBe(true)
    for (const a of anomalies.alerts) {
      expect(a).toHaveProperty('type')
      expect(a).toHaveProperty('severity')
      expect(a).toHaveProperty('message')
      expect(['info', 'low', 'medium', 'high', 'critical']).toContain(a.severity)
    }
  })
})

describe('getMockGraph', () => {
  test('returns nodes and links', () => {
    const graph = getMockGraph()
    expect(Array.isArray(graph.nodes)).toBe(true)
    expect(Array.isArray(graph.links)).toBe(true)
    for (const entity of graph.nodes) {
      expect(entity).toHaveProperty('id')
      expect(entity).toHaveProperty('name')
      expect(entity).toHaveProperty('type')
    }
    for (const rel of graph.links) {
      expect(rel).toHaveProperty('source')
      expect(rel).toHaveProperty('target')
      expect(rel).toHaveProperty('relation')
    }
  })
})

describe('getMockDrift', () => {
  test('returns drift report with latest, timeSeries', () => {
    const drift = getMockDrift()
    expect(drift).toHaveProperty('latest')
    expect(drift).toHaveProperty('timeSeries')
    if (drift.latest) {
      expect(drift.latest).toHaveProperty('overall_drift_score')
      expect(typeof drift.latest.overall_drift_score).toBe('number')
      expect(drift.latest).toHaveProperty('dimensions')
    }
  })
})

describe('getMockCompliance', () => {
  test('returns compliance report with EU AI Act fields', () => {
    const report = getMockCompliance()
    expect(report).toHaveProperty('reportId')
    expect(report).toHaveProperty('agentId')
    expect(report).toHaveProperty('status')
    expect(report).toHaveProperty('article12')
    expect(report.article12).toHaveProperty('humanOversight')
    expect(report.article12).toHaveProperty('auditTrailEnabled')
    expect(report.article12).toHaveProperty('tamperEvidentLogging')
    expect(report.article12).toHaveProperty('dataRetentionPolicy')
    expect(report).toHaveProperty('recentAuditTrail')
    expect(report.mock).toBe(true)
  })

  test('recentAuditTrail entries have required fields', () => {
    const report = getMockCompliance()
    for (const entry of report.recentAuditTrail) {
      expect(entry).toHaveProperty('action')
      expect(entry).toHaveProperty('agentId')
      expect(entry).toHaveProperty('timestamp')
      expect(entry).toHaveProperty('details')
    }
  })
})

describe('getMockTrust', () => {
  test('returns trust summary with categorized distribution', () => {
    const trust = getMockTrust()
    expect(trust).toHaveProperty('summary')
    expect(trust.summary).toHaveProperty('totalMemories')
    expect(trust.summary).toHaveProperty('avgTrustScore')
    expect(trust.summary).toHaveProperty('highTrust')
    expect(trust.summary).toHaveProperty('mediumTrust')
    expect(trust.summary).toHaveProperty('lowTrust')
    expect(trust.summary.highTrust + trust.summary.mediumTrust + trust.summary.lowTrust)
      .toBe(trust.summary.totalMemories)
  })

  test('memories array has trust scores in 0-1 range', () => {
    const trust = getMockTrust()
    for (const m of trust.memories) {
      expect(m.trustScore).toBeGreaterThanOrEqual(0)
      expect(m.trustScore).toBeLessThanOrEqual(1)
    }
  })
})

describe('getMockCacheStats', () => {
  test('returns cache stats with hit rate calculation', () => {
    const stats = getMockCacheStats()
    expect(stats).toHaveProperty('summary')
    expect(stats.summary).toHaveProperty('totalQueries')
    expect(stats.summary).toHaveProperty('cacheHits')
    expect(stats.summary).toHaveProperty('cacheMisses')
    expect(stats.summary).toHaveProperty('hitRate')
    expect(stats.summary.cacheHits + stats.summary.cacheMisses).toBe(stats.summary.totalQueries)
    expect(stats.summary.hitRate).toBeGreaterThan(0)
    expect(stats.summary.hitRate).toBeLessThan(1)
  })

  test('hourlyBreakdown has 24 entries', () => {
    const stats = getMockCacheStats()
    expect(Array.isArray(stats.hourlyBreakdown)).toBe(true)
    expect(stats.hourlyBreakdown.length).toBe(24)
  })

  test('competitorComparison includes Bastion with cost data', () => {
    const stats = getMockCacheStats()
    const bastion = stats.competitorComparison.find(c => c.name === 'Bastion')
    expect(bastion).toBeDefined()
    expect(typeof bastion!.costPer10KQueries).toBe('number')
    expect(typeof bastion!.cacheHitRate).toBe('number')
  })
})
