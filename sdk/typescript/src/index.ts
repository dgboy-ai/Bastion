import * as mock from "./mock";
import { AuditEntry, CheckpointState, ClusterInfo, CoordinationLock, MemoryRecord } from "./models";

export { AuditEntry, CheckpointState, ClusterInfo, CoordinationLock, MemoryRecord } from "./models";
export { reset } from "./mock";

function isMockMode(mock?: boolean): boolean {
  if (mock !== undefined) return mock;
  return process.env.BASTION_MOCK?.toLowerCase() === "true";
}

export class BastionMemory {
  public readonly agentId: string;
  private _mock: boolean;
  private _connStr: string | null;
  private _pool: unknown | null = null;

  constructor(
    agentId: string,
    connectionString?: string,
    mock?: boolean,
  ) {
    this.agentId = agentId;
    this._mock = isMockMode(mock);
    this._connStr = connectionString || null;

    if (!this._mock && !connectionString) {
      throw new Error("connectionString is required when mock=false");
    }
  }

  store(
    memoryType: string,
    content: string,
    metadata?: Record<string, unknown>,
    expiresInSeconds?: number | null,
  ): Promise<MemoryRecord> {
    if (this._mock) {
      return Promise.resolve(mock.mockStoreMemory(this.agentId, memoryType, content, metadata, expiresInSeconds));
    }
    return this._storeReal(memoryType, content, metadata, expiresInSeconds);
  }

  search(
    query: string,
    k: number = 5,
    threshold: number = 0.8,
    memoryType?: string | null,
  ): Promise<MemoryRecord[]> {
    if (this._mock) {
      return Promise.resolve(mock.mockSearchMemory(this.agentId, query, k, threshold, memoryType));
    }
    return this._searchReal(query, k, threshold, memoryType);
  }

  getAtTime(timestamp: string, agentId?: string): Promise<MemoryRecord[]> {
    const aid = agentId || this.agentId;
    if (this._mock) {
      return Promise.resolve(mock.mockGetMemoryAtTime(aid, timestamp));
    }
    return this._getAtTimeReal(aid, timestamp);
  }

  audit(agentId?: string): Promise<AuditEntry[]> {
    const aid = agentId || this.agentId;
    if (this._mock) {
      return Promise.resolve(mock.mockGetAudit(aid));
    }
    return this._auditReal(aid);
  }

  heal(agentId?: string): Promise<Record<string, unknown>> {
    const aid = agentId || this.agentId;
    if (this._mock) {
      return Promise.resolve(mock.mockHeal(aid));
    }
    return this._healReal(aid);
  }

  resolveConflict(factA: string, factB: string, context?: string): Promise<string> {
    if (this._mock) {
      return Promise.resolve(mock.mockResolveConflict(factA, factB, context || ""));
    }
    return this._resolveConflictReal(factA, factB, context || "");
  }

  queryWithCache(
    query: string,
    llmCallback: (q: string) => string,
    memoryType: string = "semantic_cache",
    threshold: number = 0.97,
  ): Promise<[string, Record<string, unknown>]> {
    if (this._mock) {
      const result = mock.mockQueryWithCache(this.agentId, query, llmCallback, memoryType, threshold);
      return Promise.resolve([result.content, result.meta]);
    }
    return this._queryWithCacheReal(query, llmCallback, memoryType, threshold);
  }

  detectAnomalies(agentId?: string): Promise<Record<string, unknown>[]> {
    const aid = agentId || this.agentId;
    if (this._mock) {
      return Promise.resolve(mock.mockDetectAnomalies(aid));
    }
    return this._detectAnomaliesReal(aid);
  }

  diff(timestampA: string, timestampB: string, agentId?: string): Promise<Record<string, unknown>> {
    const aid = agentId || this.agentId;
    if (this._mock) {
      return Promise.resolve(mock.mockDiff(aid, timestampA, timestampB));
    }
    return this._diffReal(aid, timestampA, timestampB);
  }

  provisionCluster(name: string, region: string = "us-east1", provider: string = "aws"): Promise<ClusterInfo> {
    if (this._mock) {
      return Promise.resolve(mock.mockProvisionCluster(name, region, provider));
    }
    return this._provisionClusterReal(name, region, provider);
  }

  async close(): Promise<void> {
    if (this._pool) {
      const { Pool } = await import("pg");
      await (this._pool as InstanceType<typeof Pool>).end();
      this._pool = null;
    }
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  private async _pool_(): Promise<unknown> {
    if (!this._pool) {
      const { Pool } = await import("pg");
      this._pool = new Pool({ connectionString: this._connStr! });
    }
    return this._pool;
  }

  private async _query(sql: string, params: unknown[]): Promise<unknown[]> {
    const pool = await this._pool_();
    const { Pool } = await import("pg");
    const result = await (pool as InstanceType<typeof Pool>).query(sql, params);
    return result.rows;
  }

  /** Deterministic hash-based 1024-dim unit-normalised embedding (JS fallback) */
  private _hashEmbed(text: string): number[] {
    const { createHash } = require("crypto");
    const digest: Buffer = createHash("sha256").update(text, "utf8").digest();
    const raw: number[] = [];
    for (let i = 0; i < 32; i++) {
      for (const byte of digest) {
        raw.push(byte / 127.5 - 1.0);
      }
    }
    const norm = Math.sqrt(raw.reduce((s, v) => s + v * v, 0)) || 1.0;
    return raw.map((v) => v / norm);
  }

  private async _embed(text: string): Promise<number[]> {
    try {
      // @ts-ignore - optional dependency, gracefully falls back to hash embedding
      const { BedrockRuntimeClient, InvokeModelCommand } = await import("@aws-sdk/client-bedrock-runtime");
      const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-south-1";
      const client = new BedrockRuntimeClient({ region });
      const body = JSON.stringify({ inputText: text, dimensions: 1024, normalize: true });
      const cmd = new InvokeModelCommand({
        modelId: "amazon.titan-embed-text-v2:0",
        body,
        contentType: "application/json",
        accept: "application/json",
      });
      const resp = await client.send(cmd);
      const parsed = JSON.parse(new TextDecoder().decode(resp.body));
      return parsed.embedding as number[];
    } catch {
      return this._hashEmbed(text);
    }
  }

  private async _getLastHash(): Promise<string | null> {
    const rows = await this._query(
      "SELECT cryptographic_hash FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1",
      [this.agentId],
    ) as Array<{ cryptographic_hash: string }>;
    return rows.length ? rows[0].cryptographic_hash : null;
  }

  private _sha256(data: string): string {
    const { createHash } = require("crypto");
    return createHash("sha256").update(data, "utf8").digest("hex");
  }

  private _rowToRecord(r: Record<string, unknown>): MemoryRecord {
    let embedding: number[] = [];
    if (r.embedding) {
      embedding = typeof r.embedding === "string" ? JSON.parse(r.embedding) : (r.embedding as number[]);
    }
    return {
      memoryId: String(r.memory_id),
      agentId: String(r.agent_id),
      memoryType: String(r.memory_type),
      content: String(r.content),
      embedding,
      metadata: (r.metadata as Record<string, unknown>) || {},
      previousHash: r.previous_hash ? String(r.previous_hash) : null,
      cryptographicHash: String(r.cryptographic_hash),
      createdAt: r.created_at instanceof Date ? (r.created_at as Date).toISOString() : String(r.created_at),
      expiresAt: r.expires_at ? (r.expires_at instanceof Date ? (r.expires_at as Date).toISOString() : String(r.expires_at)) : null,
      accessCount: Number(r.access_count ?? 0),
    };
  }

  // ── Real-mode implementations ─────────────────────────────────────────────────

  private async _storeReal(
    memoryType: string,
    content: string,
    metadata?: Record<string, unknown>,
    expiresInSeconds?: number | null,
  ): Promise<MemoryRecord> {
    const embedding = await this._embed(content);
    const prevHash = await this._getLastHash();
    const { randomUUID } = require("crypto");
    const meta = metadata || {};
    const cryptoHash = this._sha256(JSON.stringify({ content, meta, previousHash: prevHash }));
    const now = new Date();
    let expiresAt: string | null = null;
    if (expiresInSeconds !== null && expiresInSeconds !== undefined) {
      expiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString();
    }
    const rows = await this._query(
      `INSERT INTO agent_memory
        (agent_id, memory_type, content, embedding, metadata, previous_hash, cryptographic_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING memory_id, created_at`,
      [this.agentId, memoryType, content, JSON.stringify(embedding), JSON.stringify(meta),
       prevHash, cryptoHash, expiresAt],
    ) as Array<{ memory_id: string; created_at: string }>;
    const row = rows[0];

    const workflowId = randomUUID();
    await this._query(
      "INSERT INTO agent_audit (agent_id, workflow_id, action, details) VALUES ($1, $2, $3, $4)",
      [this.agentId, workflowId, "memory_store",
       JSON.stringify({ memory_type: memoryType, content_preview: content.slice(0, 100) })],
    );

    return {
      memoryId: String(row.memory_id),
      agentId: this.agentId,
      memoryType,
      content,
      embedding,
      metadata: meta,
      previousHash: prevHash,
      cryptographicHash: cryptoHash,
      createdAt: row.created_at,
      expiresAt,
      accessCount: 0,
    };
  }

  private async _searchReal(
    query: string,
    k: number,
    threshold: number,
    memoryType?: string | null,
  ): Promise<MemoryRecord[]> {
    const embedding = await this._embed(query);
    const embJson = JSON.stringify(embedding);

    let sql = `SELECT *, embedding <=> $2::vector(1024) AS _dist
               FROM agent_memory
               WHERE agent_id = $1
                 AND (expires_at IS NULL OR expires_at > now())
               ORDER BY embedding <=> $2::vector(1024) ASC
               LIMIT $3`;
    const params: unknown[] = [this.agentId, embJson, k];

    if (memoryType) {
      sql = `SELECT *, embedding <=> $3::vector(1024) AS _dist
             FROM agent_memory
             WHERE agent_id = $1
               AND memory_type = $2
               AND (expires_at IS NULL OR expires_at > now())
             ORDER BY embedding <=> $3::vector(1024) ASC
             LIMIT $4`;
      params.splice(1, 0, memoryType);
    }

    const rows = await this._query(sql, params) as Array<Record<string, unknown>>;
    const results: MemoryRecord[] = [];
    for (const r of rows) {
      const dist = Number(r._dist ?? 1);
      if (dist > (1 - threshold)) continue;
      results.push(this._rowToRecord(r));
    }
    return results;
  }

  private async _getAtTimeReal(agentId: string, timestamp: string): Promise<MemoryRecord[]> {
    const rows = await this._query(
      "SELECT * FROM agent_memory AS OF SYSTEM TIME $1 WHERE agent_id = $2 ORDER BY created_at ASC",
      [timestamp, agentId],
    ) as Array<Record<string, unknown>>;
    return rows.map((r) => this._rowToRecord(r));
  }

  private async _auditReal(agentId: string): Promise<AuditEntry[]> {
    const rows = await this._query(
      "SELECT * FROM agent_audit WHERE agent_id = $1 ORDER BY timestamp DESC LIMIT 100",
      [agentId],
    ) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      auditId: String(r.audit_id),
      agentId: String(r.agent_id),
      workflowId: String(r.workflow_id),
      action: String(r.action),
      details: typeof r.details === "string" ? JSON.parse(r.details) : (r.details as Record<string, unknown>),
      timestamp: r.timestamp instanceof Date ? (r.timestamp as Date).toISOString() : String(r.timestamp),
    }));
  }

  private async _healReal(agentId: string): Promise<Record<string, unknown>> {
    const before = await this._query(
      "SELECT COUNT(*) AS cnt FROM agent_memory WHERE agent_id = $1",
      [agentId],
    ) as Array<{ cnt: string }>;
    const beforeCount = Number(before[0].cnt);

    await this._query(
      "DELETE FROM agent_memory WHERE agent_id = $1 AND expires_at IS NOT NULL AND expires_at <= now()",
      [agentId],
    );

    const after = await this._query(
      "SELECT COUNT(*) AS cnt FROM agent_memory WHERE agent_id = $1",
      [agentId],
    ) as Array<{ cnt: string }>;
    const afterCount = Number(after[0].cnt);

    return { pruned: beforeCount - afterCount, remaining: afterCount };
  }

  private async _resolveConflictReal(factA: string, factB: string, context: string): Promise<string> {
    const combined = [factA, factB, context].filter(Boolean).join(" ");
    return this._sha256(combined);
  }

  private async _queryWithCacheReal(
    query: string,
    llmCallback: (q: string) => string,
    memoryType: string,
    threshold: number,
  ): Promise<[string, Record<string, unknown>]> {
    const hits = await this._searchReal(query, 1, threshold, memoryType);
    if (hits.length > 0) {
      return [hits[0].content, { cache: "hit", memoryId: hits[0].memoryId }];
    }
    const result = llmCallback(query);
    const record = await this._storeReal(memoryType, result, { source: "llm_callback" });
    return [result, { cache: "miss", memoryId: record.memoryId }];
  }

  private async _detectAnomaliesReal(agentId: string): Promise<Record<string, unknown>[]> {
    const alerts: Record<string, unknown>[] = [];
    const countRows = await this._query(
      "SELECT COUNT(*) AS cnt FROM agent_memory WHERE agent_id = $1",
      [agentId],
    ) as Array<{ cnt: string }>;
    const total = Number(countRows[0].cnt);
    if (total > 100) {
      alerts.push({ type: "size_spike", severity: "info", detail: `Memory count (${total}) exceeds 100 records`, agent_id: agentId });
    }
    return alerts;
  }

  private async _diffReal(agentId: string, timestampA: string, timestampB: string): Promise<Record<string, unknown>> {
    const stateA = await this._getAtTimeReal(agentId, timestampA);
    const stateB = await this._getAtTimeReal(agentId, timestampB);
    const hashesA = new Set(stateA.map((r) => r.cryptographicHash));
    const hashesB = new Set(stateB.map((r) => r.cryptographicHash));
    return {
      agent_id: agentId,
      timestamp_a: timestampA,
      timestamp_b: timestampB,
      added: stateB.filter((r) => !hashesA.has(r.cryptographicHash)),
      removed: stateA.filter((r) => !hashesB.has(r.cryptographicHash)),
      count_a: stateA.length,
      count_b: stateB.length,
    };
  }

  private async _provisionClusterReal(_name: string, _region: string, _provider: string): Promise<ClusterInfo> {
    throw new Error("Cluster provisioning is only supported in mock mode. Use CockroachDB Cloud Console to create a real cluster.");
  }
}
