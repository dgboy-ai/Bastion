export interface PipelineEvent {
  id: string;
  type: "write" | "cdc" | "lambda" | "memory" | "anomaly";
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
