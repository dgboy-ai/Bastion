import { pipeline } from "@xenova/transformers";

type ExtractFn = (texts: string | string[], options?: { pooling?: string; normalize?: boolean }) => Promise<{ tolist: () => number[][] }>;

let _extract: ExtractFn | null = null;

async function getModel(): Promise<ExtractFn> {
  if (!_extract) {
    _extract = (await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2")) as unknown as ExtractFn;
  }
  return _extract;
}

export async function embed(text: string): Promise<number[]>;
export async function embed(texts: string[]): Promise<number[][]>;
export async function embed(texts: string | string[]): Promise<number[] | number[][]> {
  const model = await getModel();
  const result = await model(texts, { pooling: "mean", normalize: true });
  const list = result.tolist();
  if (typeof texts === "string") {
    return list[0];
  }
  return list;
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
