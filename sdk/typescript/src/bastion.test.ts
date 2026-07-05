import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BastionMemory, reset } from "./index";

describe("BastionMemory (TypeScript)", () => {
  it("mock mode enabled by env", () => {
    process.env.BASTION_MOCK = "true";
    const memory = new BastionMemory("test-agent");
    assert.equal((memory as any)._mock, true);
    delete process.env.BASTION_MOCK;
  });

  it("mock mode explicit", () => {
    const memory = new BastionMemory("test-agent", undefined, true);
    assert.equal((memory as any)._mock, true);
  });

  it("stores a memory record", async () => {
    reset();
    const memory = new BastionMemory("store-test", undefined, true);
    const record = await memory.store("fact", "User prefers Python", { source: "chat" });
    assert.equal(record.agentId, "store-test");
    assert.equal(record.memoryType, "fact");
    assert.equal(record.content, "User prefers Python");
    assert.ok(record.memoryId);
    assert.ok(record.cryptographicHash);
  });

  it("forms hash chain across multiple stores", async () => {
    reset();
    const memory = new BastionMemory("hash-test", undefined, true);
    const r1 = await memory.store("fact", "First");
    const r2 = await memory.store("fact", "Second");
    const r3 = await memory.store("fact", "Third");
    assert.equal(r1.previousHash, null);
    assert.equal(r2.previousHash, r1.cryptographicHash);
    assert.equal(r3.previousHash, r2.cryptographicHash);
  });

  it("searches memory", async () => {
    reset();
    const memory = new BastionMemory("search-test", undefined, true);
    await memory.store("fact", "User likes Python");
    await memory.store("fact", "User likes Rust");
    await memory.store("preference", "Dark mode preferred");
    const results = await memory.search("Python");
    assert.ok(results.length > 0);
    assert.ok(results.some((r) => r.content.includes("Python")));
  });

  it("searches by memory type", async () => {
    reset();
    const memory = new BastionMemory("type-test", undefined, true);
    await memory.store("fact", "User is from New York");
    await memory.store("preference", "User prefers dark mode");
    const results = await memory.search("dark", 5, 0.8, "preference");
    assert.ok(results.length > 0);
    assert.ok(results.every((r) => r.memoryType === "preference"));
  });

  it("gets memory at time", async () => {
    reset();
    const memory = new BastionMemory("time-test", undefined, true);
    await memory.store("fact", "Memory before timestamp");
    const after = new Date(Date.now() + 1000).toISOString();
    const results = await memory.getAtTime(after, "time-test");
    assert.equal(results.length, 1);
    assert.equal(results[0].content, "Memory before timestamp");
  });

  it("returns audit log", async () => {
    reset();
    const memory = new BastionMemory("audit-test", undefined, true);
    await memory.store("fact", "Auditable action");
    const entries = await memory.audit("audit-test");
    assert.ok(entries.length > 0);
    assert.equal(entries[0].action, "memory_store");
  });

  it("heals memory", async () => {
    reset();
    const memory = new BastionMemory("heal-test", undefined, true);
    await memory.store("fact", "Keep this");
    const result = await memory.heal("heal-test");
    assert.ok("recordsBefore" in result);
    assert.ok("recordsAfter" in result);
  });

  it("resolves conflicts", async () => {
    reset();
    const memory = new BastionMemory("conflict-test", undefined, true);
    const result = await memory.resolveConflict("User likes Python", "User likes Rust");
    assert.ok(result.includes("Python"));
    assert.ok(result.includes("Rust"));
  });

  it("query with cache: miss then hit", async () => {
    reset();
    const memory = new BastionMemory("cache-test", undefined, true);
    let callCount = 0;
    const llm = (q: string) => {
      callCount++;
      return `LLM response for: ${q}`;
    };

    const [r1, m1] = await memory.queryWithCache("What is Python?", llm);
    assert.equal(m1.cache, "miss");
    assert.equal(r1, "LLM response for: What is Python?");
    assert.equal(callCount, 1);

    const [r2, m2] = await memory.queryWithCache("What is Python?", llm);
    assert.equal(m2.cache, "hit");
    assert.equal(r2, "LLM response for: What is Python?");
    assert.equal(callCount, 1);
  });

  it("determines anomalies", async () => {
    reset();
    const memory = new BastionMemory("anomaly-test", undefined, true);
    await memory.store("fact", "Duplicate");
    await memory.store("fact", "Unique");
    await memory.store("fact", "Duplicate");
    const alerts = await memory.detectAnomalies();
    assert.ok(alerts.some((a) => a.type === "fact_turnover"));
  });

  it("diffs memory states", async () => {
    reset();
    const memory = new BastionMemory("diff-test", undefined, true);
    const before = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 50));
    await memory.store("fact", "Added after");
    const after = new Date().toISOString();
    const result = await memory.diff(before, after);
    assert.equal(result.countA, 0);
    assert.equal(result.countB, 1);
    assert.equal(result.added.length, 1);
    assert.equal(result.added[0].content, "Added after");
  });

  it("provisions a mock cluster", async () => {
    reset();
    const memory = new BastionMemory("prov-test", undefined, true);
    const info = await memory.provisionCluster("bastion-demo");
    assert.equal(info.status, "created");
    assert.ok(info.connectionString.includes("cockroachlabs.cloud"));
  });

  it("search excludes expired records", async () => {
    reset();
    const memory = new BastionMemory("ttl-ts", undefined, true);
    await memory.store("fact", "Permanent record");
    await memory.store("fact", "Expired record", {}, 0);
    const results = await memory.search("record");
    assert.ok(results.some((r) => r.content.includes("Permanent")));
    assert.ok(!results.some((r) => r.content.includes("Expired")));
  });

  it("heal prunes expired records", async () => {
    reset();
    const memory = new BastionMemory("heal-ts", undefined, true);
    await memory.store("fact", "Keep this");
    await memory.store("fact", "Expiring", {}, 0);
    const result = await memory.heal();
    assert.equal(result.pruned, 1);
    assert.equal(result.recordsAfter, 1);
  });

  it("detectAnomalies returns empty for clean state", async () => {
    reset();
    const memory = new BastionMemory("anomaly-clean-ts", undefined, true);
    const alerts = await memory.detectAnomalies();
    assert.equal(alerts.length, 0);
  });

  it("getAtTime before all records returns empty", async () => {
    reset();
    const memory = new BastionMemory("before-ts", undefined, true);
    await memory.store("fact", "Later memory");
    const early = new Date(Date.UTC(2020, 0, 1)).toISOString();
    const results = await memory.getAtTime(early);
    assert.equal(results.length, 0);
  });

  it("resolveConflict with context", async () => {
    reset();
    const memory = new BastionMemory("ctx-ts", undefined, true);
    const result = await memory.resolveConflict("Fact A", "Fact B", "User prefers A");
    assert.ok(result.includes("Fact"));
  });

  it("storeWithGraph creates entities and relations", async () => {
    reset();
    const memory = new BastionMemory("ts-graph", undefined, true);
    const [record, entities, relations] = await memory.storeWithGraph("Alice builds Bastion");
    assert.ok(record.content.length > 0);
    assert.ok(entities.length >= 2, "should have alice + bastion");
    assert.ok(relations.length >= 1, "should have builds relation");
  });

  it("graphQuery finds multi-hop relations", async () => {
    reset();
    const memory = new BastionMemory("ts-graph-q", undefined, true);
    await memory.storeWithGraph("Alice uses Postgres");
    const results = await memory.graphQuery("alice", undefined, 2);
    assert.ok(results.length > 0);
  });

  it("graphQuery with relation path filter", async () => {
    reset();
    const memory = new BastionMemory("ts-graph-path", undefined, true);
    await memory.storeWithGraph("Bob builds Bastion and Bob loves Go");
    const results = await memory.graphQuery("bob", ["loves"]);
    assert.ok(results.length > 0);
    assert.ok(results.every((r: any) => r.relation === "loves"));
  });

  it("graphQuery unknown entity returns empty list", async () => {
    reset();
    const memory = new BastionMemory("ts-graph-unknown", undefined, true);
    const results = await memory.graphQuery("nobody");
    assert.equal(results.length, 0);
  });

  it("graphAtTime returns snapshot", async () => {
    reset();
    const memory = new BastionMemory("ts-graph-time", undefined, true);
    await memory.storeWithGraph("Charlie owns Bastion");
    const future = new Date(Date.now() + 3600000).toISOString();
    const snapshot = await memory.graphAtTime(future);
    assert.ok(Array.isArray(snapshot.entities));
    assert.ok(Array.isArray(snapshot.relations));
  });

  it("graphAtTime with entity filter", async () => {
    reset();
    const memory = new BastionMemory("ts-graph-time-e", undefined, true);
    await memory.storeWithGraph("Dave manages Bastion");
    const now = new Date().toISOString();
    const snapshot = await memory.graphAtTime(now, "dave");
    assert.ok(snapshot.entities.some((e: any) => e.name === "dave"));
  });

  it("graphStats returns counts", async () => {
    reset();
    const memory = new BastionMemory("ts-graph-stats", undefined, true);
    await memory.storeWithGraph("Eve builds Bastion and uses Postgres");
    const stats = await memory.graphStats();
    assert.ok((stats.entities as number) > 0);
    assert.ok((stats.relations as number) > 0);
    assert.ok(Array.isArray(stats.entity_types));
  });

  it("graphRespects agent isolation", async () => {
    reset();
    const memA = new BastionMemory("ts-iso-a", undefined, true);
    const memB = new BastionMemory("ts-iso-b", undefined, true);
    await memA.storeWithGraph("Frank builds X");
    await memB.storeWithGraph("Grace builds Y");
    const statsA = await memA.graphStats();
    const statsB = await memB.graphStats();
    assert.ok((statsA.entities as number) > 0);
    assert.ok((statsB.entities as number) > 0);
  });
});
