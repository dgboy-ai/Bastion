import crypto from "node:crypto";
import { MemoryRecord, AuditEntry, ClusterInfo } from "./models";

interface StoredRecord extends Record<string, unknown> {
  memoryId: string;
  agentId: string;
  memoryType: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  previousHash: string | null;
  cryptographicHash: string;
  createdAt: string;
  expiresAt: string | null;
  accessCount: number;
}

interface StoredAudit extends Record<string, unknown> {
  auditId: string;
  agentId: string;
  workflowId: string;
  action: string;
  details: Record<string, unknown>;
  recordedAt: string;
}

const agentData = new Map<string, StoredRecord[]>();
const auditLog: StoredAudit[] = [];

function computeHash(content: string, metadata: Record<string, unknown>, previousHash: string | null): string {
  const raw = content + JSON.stringify(metadata, Object.keys(metadata).sort()) + (previousHash || "");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function mockStoreMemory(
  agentId: string,
  memoryType: string,
  content: string,
  metadata?: Record<string, unknown>,
  expiresInSeconds?: number | null,
): MemoryRecord {
  if (!agentData.has(agentId)) {
    agentData.set(agentId, []);
  }
  const records = agentData.get(agentId)!;
  const prevHash = records.length > 0 ? records[records.length - 1].cryptographicHash : null;
  const meta = metadata || {};
  const cryptoHash = computeHash(content, meta, prevHash);
  const now = new Date().toISOString();
  const expiresAt = expiresInSeconds !== undefined && expiresInSeconds !== null ? new Date(Date.now() + expiresInSeconds * 1000).toISOString() : null;

  const record: MemoryRecord = {
    memoryId: crypto.randomUUID(),
    agentId,
    memoryType,
    content,
    embedding: new Array(1536).fill(0),
    metadata: meta,
    previousHash: prevHash,
    cryptographicHash: cryptoHash,
    createdAt: now,
    expiresAt,
    accessCount: 0,
  };

  records.push(record as StoredRecord);
  auditLog.push({
    auditId: crypto.randomUUID(),
    agentId,
    workflowId: crypto.randomUUID(),
    action: "memory_store",
    details: { memoryType, contentPreview: content.slice(0, 100) },
    recordedAt: now,
  });

  return record;
}

export function mockSearchMemory(
  agentId: string,
  _query: string,
  k: number = 5,
  _threshold: number = 0.8,
  memoryType?: string | null,
): MemoryRecord[] {
  let records = agentData.get(agentId) || [];
  if (memoryType) {
    records = records.filter((r) => r.memoryType === memoryType);
  }

  const now = new Date();
  const valid = records.filter((r) => {
    if (!r.expiresAt) return true;
    return new Date(r.expiresAt) > now;
  });

  return valid.slice(-k);
}

export function mockGetMemoryAtTime(agentId: string, timestamp: string): MemoryRecord[] {
  const target = new Date(timestamp);
  const records = agentData.get(agentId) || [];
  return records.filter((r) => new Date(r.createdAt) <= target);
}

export function mockGetAudit(agentId: string): AuditEntry[] {
  return auditLog.filter((e) => e.agentId === agentId).map((e) => ({
    auditId: e.auditId,
    agentId: e.agentId,
    workflowId: e.workflowId,
    action: e.action,
    details: e.details,
    recordedAt: e.recordedAt,
  }));
}

export function mockHeal(agentId: string): Record<string, unknown> {
  const records = agentData.get(agentId) || [];
  const before = records.length;
  const now = new Date();
  const valid = records.filter((r) => !r.expiresAt || new Date(r.expiresAt) > now);
  agentData.set(agentId, valid);
  const after = valid.length;

  auditLog.push({
    auditId: crypto.randomUUID(),
    agentId,
    workflowId: crypto.randomUUID(),
    action: "heal",
    details: { recordsBefore: before, recordsAfter: after, pruned: before - after },
    recordedAt: new Date().toISOString(),
  });

  return { agentId, recordsBefore: before, recordsAfter: after, pruned: before - after };
}

export function mockResolveConflict(factA: string, factB: string, _context: string): string {
  return `Merged: ${factA} and ${factB}`;
}

export function mockQueryWithCache(
  agentId: string,
  query: string,
  llmCallback: (q: string) => string,
  memoryType: string = "semantic_cache",
  _threshold: number = 0.97,
): { content: string; meta: Record<string, unknown> } {
  const records = agentData.get(agentId) || [];
  for (const r of [...records].reverse()) {
    if (r.memoryType === memoryType && r.metadata?.query === query) {
      return { content: r.content, meta: { cache: "hit", memoryId: r.memoryId } };
    }
  }
  const response = llmCallback(query);
  mockStoreMemory(agentId, memoryType, response, { query });
  return { content: response, meta: { cache: "miss" } };
}

export function mockDetectAnomalies(agentId: string): Record<string, unknown>[] {
  const alerts: Record<string, unknown>[] = [];
  const records = agentData.get(agentId) || [];
  const contents = records.map((r) => r.content);
  if (new Set(contents).size !== contents.length) {
    alerts.push({ type: "fact_turnover", severity: "medium", detail: "Duplicate content detected in recent memory", agentId });
  }
  if (records.length > 10) {
    alerts.push({ type: "size_spike", severity: "info", detail: `Memory count (${records.length}) exceeds 10 records`, agentId });
  }
  return alerts;
}

export function mockDiff(agentId: string, timestampA: string, timestampB: string): Record<string, unknown> {
  function recordsAt(ts: string): StoredRecord[] {
    const target = new Date(ts);
    return (agentData.get(agentId) || []).filter((r) => new Date(r.createdAt) <= target);
  }
  const stateA = recordsAt(timestampA);
  const stateB = recordsAt(timestampB);
  const hashesA = new Set(stateA.map((r) => r.cryptographicHash));
  const hashesB = new Set(stateB.map((r) => r.cryptographicHash));

  return {
    agentId,
    timestampA,
    timestampB,
    added: stateB.filter((r) => !hashesA.has(r.cryptographicHash)),
    removed: stateA.filter((r) => !hashesB.has(r.cryptographicHash)),
    countA: stateA.length,
    countB: stateB.length,
  };
}

export function mockProvisionCluster(name: string, region: string = "us-east1", _provider: string = "aws"): ClusterInfo {
  return {
    clusterId: `bastion-${name}-${crypto.randomUUID().slice(0, 8)}`,
    connectionString: `postgres://mock:${crypto.randomUUID().slice(0, 12)}@${name}.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full`,
    adminUrl: `https://cockroachlabs.cloud/cluster/${name}`,
    region,
    status: "created",
  };
}

export function reset(): void {
  agentData.clear();
  auditLog.length = 0;
}
