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
