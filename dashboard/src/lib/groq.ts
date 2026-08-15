export interface GroqMessage {
  role: string;
  content: string;
}

export interface GroqResult {
  text: string;
  model: string;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Call the Groq chat completions API with retry-and-backoff on rate limits
 * (429). The agent loop issues several sequential LLM calls per turn, and free
 * tier quotas trip easily — so transient 429s are retried instead of surfacing
 * as hard errors.
 */
export async function callGroq(
  system: string,
  messages: GroqMessage[],
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {},
): Promise<GroqResult> {
  const groqKey = process.env.GROQ_API_KEY;
  const groqModel = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
  const { temperature = 0.3, maxTokens = 4096, timeoutMs = 15000 } = opts;

  if (!groqKey) {
    throw new Error("GROQ_API_KEY is not set");
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const llmRes = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: groqModel,
          messages: [{ role: "system", content: system }, ...messages],
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (llmRes.status === 429 && attempt < MAX_RETRIES) {
        lastError = new Error(`Groq API 429 (attempt ${attempt + 1})`);
        console.warn(`[groq] Rate limited, retrying in ${BASE_DELAY_MS * 2 ** attempt}ms...`);
        await sleep(BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      if (!llmRes.ok) throw new Error(`Groq API ${llmRes.status}`);

      const llmData = await llmRes.json();
      const choice = llmData.choices?.[0];
      const rawContent = choice?.message?.content || "";
      const rawReasoning = choice?.message?.reasoning || "";
      return {
        text: rawContent.trim() || rawReasoning.trim(),
        model: groqModel,
      };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError" && attempt < MAX_RETRIES) {
        lastError = new Error("Groq API timeout");
        console.warn("[groq] Timeout, retrying...");
        await sleep(BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("Groq API request failed");
}