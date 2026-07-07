import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  const agentCard = {
    name: "Bastion Memory Agent",
    description:
      "A2A-compliant memory agent with hash-chain integrity, C-SPANN vector indexing, knowledge graph, and time travel.",
    version: "0.3.0",
    url: "https://bastion-self.vercel.app",
    documentationUrl: "https://github.com/dgboy-ai/Bastion",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    skills: [
      {
        id: "memory_store",
        name: "Store Agent Memory",
        description:
          "Store a memory with SHA-256 hash-chain integrity and C-SPANN vector indexing.",
        tags: ["memory", "storage", "hash-chain", "c-spann"],
        examples: [
          "Store that the user prefers Python over TypeScript",
          "Remember the deployment deadline is Friday",
        ],
      },
      {
        id: "memory_search",
        name: "Search Agent Memories",
        description:
          "Semantic vector search across agent memories with cognitive decay weighting.",
        tags: ["memory", "search", "vector", "c-spann"],
        examples: [
          "Find memories about project architecture decisions",
          "What does the user prefer for frontend?",
        ],
      },
      {
        id: "memory_timetravel",
        name: "Time Travel Query",
        description:
          "Query agent memory state at any past timestamp using CockroachDB AS OF SYSTEM TIME.",
        tags: ["memory", "temporal", "audit", "cockroachdb"],
        examples: [
          "What did the agent know at 9:47 AM yesterday?",
          "Show memory state before the incident",
        ],
      },
      {
        id: "memory_audit",
        name: "Memory Audit Log",
        description:
          "Retrieve the append-only, hash-chained audit log for an agent.",
        tags: ["audit", "compliance", "eu-ai-act"],
        examples: [
          "Show all memory operations for this agent",
          "Generate EU AI Act compliance report",
        ],
      },
      {
        id: "memory_heal",
        name: "Memory Self-Healing",
        description:
          "Trigger CDC-based self-healing: prune expired memories, detect anomalies, compact storage.",
        tags: ["healing", "cdc", "anomaly-detection"],
        examples: [
          "Run memory consolidation",
          "Check for memory poisoning attempts",
        ],
      },
      {
        id: "graph_query",
        name: "Knowledge Graph Query",
        description:
          "Traverse the knowledge graph with multi-hop BFS starting from an entity.",
        tags: ["graph", "knowledge", "traversal"],
        examples: [
          "Find what technologies the user's projects use",
          "Show entity relationships for project X",
        ],
      },
      {
        id: "resolve_conflict",
        name: "Resolve Memory Conflict",
        description:
          "Resolve conflicting memories from multiple agents using SERIALIZABLE isolation and LLM merge.",
        tags: ["conflict", "crdt", "serializable", "multi-agent"],
        examples: [
          "Agent A says Python, Agent B says Rust — resolve",
          "Merge contradictory facts about user preferences",
        ],
      },
      {
        id: "trust_score",
        name: "Memory Trust Scoring",
        description:
          "Compute trust scores for memories based on provenance, hash chain integrity, and poisoning risk.",
        tags: ["trust", "security", "owasp-asi06"],
        examples: [
          "Show trust scores for all memories",
          "Check for poisoning attempts on memory X",
        ],
      },
    ],
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
    supportsAuthenticatedExtendedCard: false,
    provider: {
      organization: "Bastion",
      url: "https://github.com/dgboy-ai/Bastion",
    },
  };

  return NextResponse.json(agentCard, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
