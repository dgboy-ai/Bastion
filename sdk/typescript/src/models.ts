export interface MemoryRecord {
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

export interface CheckpointState {
  workflowId: string;
  agentId: string;
  stepNumber: number;
  stepType: string;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  idempotencyKey: string | null;
  tokenCost: number | null;
  status: string;
  healthScore: number | null;
  createdAt: string;
  completedAt: string | null;
  region: string | null;
}

export interface AuditEntry {
  auditId: string;
  agentId: string;
  workflowId: string;
  action: string;
  details: Record<string, unknown>;
  recordedAt: string;
}

export interface ClusterInfo {
  clusterId: string;
  connectionString: string;
  adminUrl: string;
  region: string;
  status: string;
}

export interface CoordinationLock {
  lockId: string;
  agentId: string;
  resource: string;
  lockType: string;
  acquiredAt: string;
  expiresAt: string | null;
  payload: Record<string, unknown>;
}
