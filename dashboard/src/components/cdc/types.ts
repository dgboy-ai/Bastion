export interface PipelineEvent {
  id: string;
  type: "write" | "cdc" | "tailer" | "memory" | "anomaly";
  agentId: string;
  content: string;
  timestamp: string;
  latency: number;
}

export interface PipelineParticle {
  id: string;
  stage: number;
  startTime: number;
}
