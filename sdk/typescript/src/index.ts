import * as mock from "./mock";
import { MemoryRecord, AuditEntry, ClusterInfo } from "./models";

export { MemoryRecord, AuditEntry, ClusterInfo } from "./models";
export { reset } from "./mock";

function isMockMode(mock?: boolean): boolean {
  if (mock !== undefined) return mock;
  return process.env.BASTION_MOCK?.toLowerCase() === "true";
}

export class BastionMemory {
  public readonly agentId: string;
  private _mock: boolean;
  private _connStr: string | null;

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

  close(): Promise<void> {
    return Promise.resolve();
  }

  // Real-mode implementations (stubs — require `pg` package)

  private async _storeReal(
    _memoryType: string,
    _content: string,
    _metadata?: Record<string, unknown>,
    _expiresInSeconds?: number | null,
  ): Promise<MemoryRecord> {
    throw new Error("Real mode requires `pg` package: npm install pg");
  }

  private async _searchReal(
    _query: string,
    _k: number,
    _threshold: number,
    _memoryType?: string | null,
  ): Promise<MemoryRecord[]> {
    throw new Error("Real mode requires `pg` package: npm install pg");
  }

  private async _getAtTimeReal(_agentId: string, _timestamp: string): Promise<MemoryRecord[]> {
    throw new Error("Real mode requires `pg` package: npm install pg");
  }

  private async _auditReal(_agentId: string): Promise<AuditEntry[]> {
    throw new Error("Real mode requires `pg` package: npm install pg");
  }

  private async _healReal(_agentId: string): Promise<Record<string, unknown>> {
    throw new Error("Real mode requires `pg` package: npm install pg");
  }

  private async _resolveConflictReal(_factA: string, _factB: string, _context: string): Promise<string> {
    throw new Error("Real mode requires `pg` package: npm install pg");
  }

  private async _queryWithCacheReal(
    _query: string,
    _llmCallback: (q: string) => string,
    _memoryType: string,
    _threshold: number,
  ): Promise<[string, Record<string, unknown>]> {
    throw new Error("Real mode requires `pg` package: npm install pg");
  }

  private async _detectAnomaliesReal(_agentId: string): Promise<Record<string, unknown>[]> {
    throw new Error("Real mode requires `pg` package: npm install pg");
  }

  private async _diffReal(_agentId: string, _timestampA: string, _timestampB: string): Promise<Record<string, unknown>> {
    throw new Error("Real mode requires `pg` package: npm install pg");
  }

  private async _provisionClusterReal(_name: string, _region: string, _provider: string): Promise<ClusterInfo> {
    throw new Error("Real mode requires `pg` package: npm install pg");
  }
}
