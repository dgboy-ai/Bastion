export interface OpenRouterMessage {
  role: string;
  content: string;
}

export interface OpenRouterResult {
  text: string;
  model: string;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Call the OpenRouter chat completions API with retry-and-backoff on rate limits.
 * OpenRouter proxies to many providers (Anthropic, Google, Meta, etc.) and has
 * generous free-tier quotas — good fallback when Groq is throttled.
 */
export async function callOpenRouter(
  system: string,
  messages: OpenRouterMessage[],
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number; model?: string } = {},
): Promise<OpenRouterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = opts.model || process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free";
  const { temperature = 0.3, maxTokens = 4096, timeoutMs = 30000 } = opts;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const llmRes = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://bastion-self.vercel.app",
          "X-Title": "Bastion Agent",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: system }, ...messages],
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if ((llmRes.status === 429 || llmRes.status === 413) && attempt < MAX_RETRIES) {
        lastError = new Error(`OpenRouter API ${llmRes.status} (attempt ${attempt + 1})`);
        console.warn(`[openrouter] Rate limited (${llmRes.status}), retrying in ${BASE_DELAY_MS * 2 ** attempt}ms...`);
        await sleep(BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      if (!llmRes.ok) {
        const body = await llmRes.text().catch(() => "");
        throw new Error(`OpenRouter API ${llmRes.status}: ${body.slice(0, 200)}`);
      }

      const llmData = await llmRes.json();
      const choice = llmData.choices?.[0];
      const rawContent = choice?.message?.content || "";
      return {
        text: rawContent.trim(),
        model,
      };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError" && attempt < MAX_RETRIES) {
        lastError = new Error("OpenRouter API timeout");
        console.warn("[openrouter] Timeout, retrying...");
        await sleep(BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("OpenRouter API request failed");
}
