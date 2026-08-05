import { createHash } from "crypto";
import { pipeline } from "@xenova/transformers";

type ExtractFn = (texts: string | string[], options?: { pooling?: string; normalize?: boolean }) => Promise<{ tolist: () => number[][] }>;

let _extract: ExtractFn | null = null;

async function getModel(): Promise<ExtractFn> {
  if (!_extract) {
    _extract = (await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2")) as unknown as ExtractFn;
  }
  return _extract;
}

// DB schema expects VECTOR(1024); all-MiniLM-L6-v2 outputs 384-dim.
// Pad the remaining 640 dimensions with zeros, then re-normalize.
const TARGET_DIM = 1024;

function padToTarget(vec: number[]): number[] {
  if (vec.length >= TARGET_DIM) return vec.slice(0, TARGET_DIM);
  const padded = [...vec, ...new Array(TARGET_DIM - vec.length).fill(0)];
  const norm = Math.sqrt(padded.reduce((s, v) => s + v * v, 0)) || 1;
  return padded.map((v) => v / norm);
}

export async function embed(text: string): Promise<number[]>;
export async function embed(texts: string[]): Promise<number[][]>;
export async function embed(texts: string | string[]): Promise<number[] | number[][]> {
  const model = await getModel();
  const result = await model(texts, { pooling: "mean", normalize: true });
  const list = result.tolist();
  if (typeof texts === "string") {
    return padToTarget(list[0]);
  }
  return list.map(padToTarget);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function vecToString(vec: number[]): string {
  return "[" + vec.join(",") + "]";
}

// Deterministic 1024-dim hash embedding matching Python's
// `_hash_fallback_embed`: SHA-256 digest tiled 32x, values mapped to
// [-1, 1] (byte / 127.5 - 1.0), then L2-normalized. Same text => same
// vector, so cosine similarity stays meaningful without a model.
export function hashFallbackEmbed(text: string): number[] {
  const digest = createHash("sha256").update(text, "utf8").digest();
  const raw: number[] = [];
  for (let t = 0; t < 32; t++) {
    for (const byte of digest) {
      raw.push(byte / 127.5 - 1.0);
    }
  }
  const norm = Math.sqrt(raw.reduce((s, v) => s + v * v, 0)) || 1;
  return raw.map((v) => v / norm);
}

// Embed to a Postgres vector literal string. Prefers the local
// all-MiniLM-L6-v2 model (1024-dim padded), falling back to the
// deterministic hash embedding so API parity holds offline.
export async function embedToVectorString(text: string): Promise<string> {
  try {
    const vec = await embed(text);
    return vecToString(vec);
  } catch {
    return vecToString(hashFallbackEmbed(text));
  }
}
