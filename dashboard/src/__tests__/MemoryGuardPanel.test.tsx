import { expect, test, describe, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MemoryGuardPanel from '@/components/MemoryGuardPanel'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockReport = {
  summary: {
    totalChecks: 15234,
    blockedCount: 127,
    blockedPct: 0.83,
    avgTrustScore: 0.92,
    poisoningRiskDistribution: { none: 80, low: 12, medium: 5, high: 3 },
  },
  recentFindings: [
    {
      detector: 'prompt_injection',
      threatType: 'jailbreak',
      severity: 'critical',
      detail: 'Detected "ignore all previous instructions" pattern',
      confidence: 0.99,
      timestamp: new Date().toISOString(),
    },
    {
      detector: 'secret_leak',
      threatType: 'credential_exposure',
      severity: 'high',
      detail: 'GitHub token detected in stored memory',
      confidence: 0.95,
      timestamp: new Date().toISOString(),
    },
  ],
  mock: true,
}

describe('MemoryGuardPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  test('renders loading state initially', () => {
    mockFetch.mockImplementationOnce(() => new Promise(() => {}))
    const { container } = render(<MemoryGuardPanel />)
    const skeleton = container.querySelector('.skeleton')
    expect(skeleton).toBeTruthy()
  })

  test('renders summary cards after loading', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockReport,
    })
    render(<MemoryGuardPanel />)
    
    await waitFor(() => {
      expect(screen.getByText('15,234')).toBeDefined()
    })
    expect(screen.getByText('127')).toBeDefined()
    expect(screen.getByText('0.92')).toBeDefined()
    expect(screen.getByText('0.83%')).toBeDefined()
  })

  test('renders scan input and results', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockReport,
    })
    
    const mockScanResult = {
      isSafe: false,
      findings: [
        { detector: 'prompt_injection', severity: 'critical', detail: 'Test injection detected' },
      ],
    }
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockScanResult,
    })

    render(<MemoryGuardPanel />)
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/paste text/i)).toBeDefined()
    })

    const input = screen.getByPlaceholderText(/paste text/i)
    await userEvent.type(input, 'test injection content')
    
    const scanButton = screen.getByRole('button', { name: /evaluate/i })
    await userEvent.click(scanButton)

    await waitFor(() => {
      expect(screen.getByText(/THREAT BLOCKED/i)).toBeDefined()
    })
  })

  test('renders recent findings list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockReport,
    })
    render(<MemoryGuardPanel />)
    
    await waitFor(() => {
      expect(screen.getByText(/ignore all previous instructions/)).toBeDefined()
      expect(screen.getByText(/GitHub token detected/)).toBeDefined()
    })
  })

  test('shows mock mode indicator when applicable', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockReport,
    })
    render(<MemoryGuardPanel />)
    
    await waitFor(() => {
      expect(screen.getByText(/Total Checks/)).toBeDefined()
    })
  })

  test('handles fetch error gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    render(<MemoryGuardPanel />)
    
    await waitFor(() => {
      expect(screen.getByText('Security Node Offline')).toBeDefined()
    })
  })
})
