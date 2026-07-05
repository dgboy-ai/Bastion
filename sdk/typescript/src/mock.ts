import crypto from "node:crypto";
import { MemoryRecord, AuditEntry, ClusterInfo, EntityRecord, RelationRecord } from "./models";

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
  importanceScore: number;
}

interface StoredAudit extends Record<string, unknown> {
  auditId: string;
  agentId: string;
  workflowId: string;
  action: string;
  details: Record<string, unknown>;
  timestamp: string;
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
    embedding: new Array(1024).fill(0),
    metadata: meta,
    previousHash: prevHash,
    cryptographicHash: cryptoHash,
    createdAt: now,
    expiresAt,
    accessCount: 0,
    importanceScore: 5.0,
  };

  records.push(record as StoredRecord);
  auditLog.push({
    auditId: crypto.randomUUID(),
    agentId,
    workflowId: crypto.randomUUID(),
    action: "memory_store",
    details: { memoryType, contentPreview: content.slice(0, 100) },
    timestamp: now,
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

  const scored = valid.map((r) => {
    const created = new Date(r.createdAt);
    const hours = (now.getTime() - created.getTime()) / 3600000;
    const importance = r.importanceScore ?? 5.0;
    return { record: r, score: importance / (1.0 + 0.01 * hours) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.record);
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
    timestamp: e.timestamp,
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
    timestamp: new Date().toISOString(),
  });

  return { agentId, recordsBefore: before, recordsAfter: after, pruned: before - after };
}

export function mockResolveConflict(factA: string, factB: string, _context: string): string {
  return `Merged: ${factA} and ${factB}`;
}

export function mockReinforce(agentId: string, memoryId: string, success: boolean = true): Record<string, unknown> {
  const records = agentData.get(agentId) || [];
  for (const r of records) {
    if (r.memoryId === memoryId) {
      const base = r.importanceScore ?? 5.0;
      const boost = 0.1 + (success ? 1.0 : 0.0);
      const newImp = Math.min(base + boost, 10.0);
      r.importanceScore = newImp;
      r.accessCount = (r.accessCount ?? 0) + 1;
      return { status: "reinforced", memory_id: memoryId, importance_score: newImp, delta: Math.round((newImp - base) * 100) / 100 };
    }
  }
  return { status: "not_found" };
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

const entities = new Map<string, Array<Record<string, unknown>>>();
const relations: Array<Record<string, unknown>> = [];

function extractTriples(text: string): Array<[string, string, string, string, number]> {
  const triples: Array<[string, string, string, string, number]> = [];
  const patternDefs: Array<{ rx: RegExp; type: string }> = [
    { rx: /(\w+)\s+is\s+a\s+(\w+)/gi, type: "is_a" },
    { rx: /(\w+)\s+is\s+(\w+(?:\s+\w+){0,3})/gi, type: "is" },
    { rx: /(\w+)\s+loves\s+(\w+)/gi, type: "loves" },
    { rx: /(\w+)\s+likes\s+(\w+)/gi, type: "likes" },
    { rx: /(\w+)\s+uses\s+(\w+)/gi, type: "uses" },
    { rx: /(\w+)\s+builds\s+(\w+)/gi, type: "builds" },
    { rx: /(\w+)\s+works\s+on\s+(\w+)/gi, type: "works_on" },
    { rx: /(\w+)\s+created\s+(\w+)/gi, type: "created" },
    { rx: /(\w+)\s+owns\s+(\w+)/gi, type: "owns" },
    { rx: /(\w+)\s+manages\s+(\w+)/gi, type: "manages" },
    { rx: /(\w+)\s+reports\s+to\s+(\w+)/gi, type: "reports_to" },
    { rx: /(\w+)\s+belongs\s+to\s+(\w+)/gi, type: "belongs_to" },
  ];
  const typeMap: Record<string, string> = {
    is_a: "entity_type", loves: "relation", likes: "relation", uses: "relation",
    builds: "relation", works_on: "relation", created: "relation", owns: "relation",
    manages: "relation", reports_to: "relation", belongs_to: "relation",
  };
  for (const { rx, type: relType } of patternDefs) {
    const kind = typeMap[relType] || "relation";
    for (const match of text.matchAll(rx)) {
      triples.push([match[1].toLowerCase(), match[2].toLowerCase(), relType, kind, 1.0]);
    }
  }
  return triples;
}

function ensureEntity(agentId: string, name: string, entityType: string = "concept"): string {
  if (!entities.has(agentId)) entities.set(agentId, []);
  const list = entities.get(agentId)!;
  const existing = list.find((e) => e.name === name);
  if (existing) return String(existing.entity_id);
  const eid = crypto.randomUUID();
  list.push({
    entity_id: eid, agent_id: agentId, entity_type: entityType, name,
    attributes: {}, valid_from: new Date().toISOString(), valid_until: null,
    created_at: new Date().toISOString(),
  });
  return eid;
}

export function mockStoreWithGraph(
  agentId: string,
  content: string,
  metadata?: Record<string, unknown>,
  expiresInSeconds?: number | null,
): [MemoryRecord, EntityRecord[], RelationRecord[]] {
  const record = mockStoreMemory(agentId, "fact", content, metadata, expiresInSeconds);
  const triples = extractTriples(content);
  const createdEntities: EntityRecord[] = [];
  const createdRelations: RelationRecord[] = [];

  for (const [srcName, tgtName, relType, kind] of triples) {
    if (kind === "entity_type") {
      ensureEntity(agentId, srcName, tgtName);
    } else {
      const eidSrc = ensureEntity(agentId, srcName, "person");
      const eidTgt = ensureEntity(agentId, tgtName, "concept");
      const rel: Record<string, unknown> = {
        relation_id: crypto.randomUUID(), agent_id: agentId,
        source_entity_id: eidSrc, target_entity_id: eidTgt,
        relation_type: relType, confidence: 1.0,
        valid_from: new Date().toISOString(), valid_until: null,
        source_memory_id: record.memoryId,
        created_at: new Date().toISOString(),
      };
      relations.push(rel);
    }
  }

  const seenEnts = new Set<string>();
  for (const e of entities.get(agentId) || []) {
    const id = String(e.entity_id);
    if (!seenEnts.has(id)) {
      seenEnts.add(id);
      createdEntities.push({
        entityId: id,
        agentId: String(e.agent_id),
        entityType: String(e.entity_type),
        name: String(e.name),
        attributes: (e.attributes as Record<string, unknown>) || {},
        validFrom: String(e.valid_from),
        validUntil: e.valid_until ? String(e.valid_until) : null,
        createdAt: String(e.created_at),
      });
    }
  }
  const seenRels = new Set<string>();
  for (const r of relations) {
    const id = String(r.relation_id);
    if (!seenRels.has(id)) {
      seenRels.add(id);
      createdRelations.push({
        relationId: id,
        agentId: String(r.agent_id),
        sourceEntityId: String(r.source_entity_id),
        targetEntityId: String(r.target_entity_id),
        relationType: String(r.relation_type),
        confidence: Number(r.confidence),
        validFrom: String(r.valid_from),
        validUntil: r.valid_until ? String(r.valid_until) : null,
        sourceMemoryId: r.source_memory_id ? String(r.source_memory_id) : null,
        createdAt: String(r.created_at),
      });
    }
  }
  return [record, createdEntities, createdRelations];
}

export function mockGraphQuery(
  agentId: string,
  startEntity: string,
  relationPath?: string[],
  hops: number = 2,
): Record<string, unknown>[] {
  const entList = entities.get(agentId) || [];
  const start = entList.find((e) => e.name === startEntity);
  if (!start) return [];

  const found: Record<string, unknown>[] = [];
  const visited = new Set<string>();
  const queue: Array<[string, number]> = [[String(start.entity_id), 0]];

  while (queue.length) {
    const [eid, depth] = queue.shift()!;
    if (depth >= hops || visited.has(eid)) continue;
    visited.add(eid);

    for (const rel of relations) {
      if (String(rel.source_entity_id) !== eid) continue;
      if (relationPath && !relationPath.includes(String(rel.relation_type))) continue;
      const target = entList.find((e) => e.entity_id === rel.target_entity_id);
      if (target) {
        found.push({
          source: startEntity,
          target: target.name,
          relation: rel.relation_type,
          confidence: rel.confidence,
          depth: depth + 1,
        });
        queue.push([String(target.entity_id), depth + 1]);
      }
    }
  }
  return found;
}

export function mockGraphAtTime(agentId: string, timestamp: string, entity?: string): Record<string, unknown> {
  const target = new Date(timestamp);
  let ents = entities.get(agentId) || [];
  if (entity) ents = ents.filter((e) => e.name === entity);
  const validEntities = ents.filter((e) => {
    const vf = new Date(String(e.valid_from));
    const vu = e.valid_until ? new Date(String(e.valid_until)) : null;
    return vf <= target && (!vu || vu > target);
  });
  return {
    agent_id: agentId, timestamp,
    entities: validEntities,
    relations: relations.filter((r) =>
      validEntities.some((e) => e.entity_id === r.source_entity_id)
    ),
  };
}

export function mockGraphStats(agentId: string): Record<string, unknown> {
  const ents = entities.get(agentId) || [];
  const connected = new Set([
    ...relations.map((r) => String(r.source_entity_id)),
    ...relations.map((r) => String(r.target_entity_id)),
  ]);
  return {
    entities: ents.length,
    relations: relations.length,
    orphans: ents.filter((e) => !connected.has(String(e.entity_id))).length,
    entity_types: [...new Set(ents.map((e) => String(e.entity_type)))],
  };
}

export function reset(): void {
  agentData.clear();
  auditLog.length = 0;
  entities.clear();
  relations.length = 0;
}
