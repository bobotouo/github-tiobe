/**
 * OpenAI 兼容 Chat Completions（也适用于多数代理 / 自建兼容网关）。
 */

import {
  getLlm429BackoffBaseMs,
  getLlm429BackoffMaxMs,
  getLlmApiKey,
  getLlmBaseUrl,
  getLlmJsonObjectResponseFormat,
  getLlmMinRequestIntervalMs,
  getLlmModel,
  getLlmRetryMax,
  getLlmTimeoutMs,
} from "@/lib/env-config";

export type LlmChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatContentPart =
  | string
  | { type?: string; text?: string | null }
  | Record<string, unknown>;

let lastLlmRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableLlmError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("fetch failed") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("UND_ERR") ||
    msg.includes("aborted") ||
    /LLM 5\d\d:/.test(msg) ||
    /LLM 429:/.test(msg)
  );
}

function retryBackoffMs(err: unknown, attempt: number): number {
  const msg = err instanceof Error ? err.message : String(err);
  // 限流时需要更长退避，避免连续撞上免费模型的瞬时额度
  if (/LLM 429:/.test(msg)) {
    const base = getLlm429BackoffBaseMs();
    const max = getLlm429BackoffMaxMs();
    return Math.min(max, base * 2 ** attempt);
  }
  return Math.min(20_000, 600 * 2 ** attempt);
}

async function chatJsonCompletionOnce(
  messages: LlmChatMessage[],
  timeoutMs: number,
  useJsonObject: boolean,
): Promise<string> {
  const apiKey = getLlmApiKey();
  if (!apiKey) {
    throw new Error("LLM_API_KEY or OPENAI_API_KEY is not set.");
  }
  const base = getLlmBaseUrl();
  const model = getLlmModel();

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.25,
  };
  if (useJsonObject) {
    body.response_format = { type: "json_object" };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const minIntervalMs = getLlmMinRequestIntervalMs();
    const logWait = (process.env.LLM_LOG_RATE_LIMIT_WAIT ?? "").trim() === "1";
    const now = Date.now();
    const waitMs = Math.max(0, minIntervalMs - (now - lastLlmRequestAt));
    if (waitMs > 0) {
      if (logWait) console.info(`[llm] rate limit wait ${waitMs}ms`);
      await sleep(waitMs);
    }
    lastLlmRequestAt = Date.now();

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`LLM ${res.status}: ${text.slice(0, 800)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{
        message?: { content?: string | ChatContentPart[] | null };
      }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    const content =
      typeof raw === "string"
        ? raw
        : Array.isArray(raw)
          ? raw
              .map((p) => {
                if (typeof p === "string") return p;
                if (p && typeof p === "object" && typeof p.text === "string") return p.text;
                return "";
              })
              .join("")
          : "";
    if (content.trim() === "") {
      throw new Error("LLM returned empty content.");
    }
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

export async function chatJsonCompletion(
  messages: LlmChatMessage[],
): Promise<string> {
  const timeoutMs = getLlmTimeoutMs();
  const useJsonObject = getLlmJsonObjectResponseFormat();
  const retries = getLlmRetryMax();

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      if (attempt > 0) {
        console.warn(`[llm] retry ${attempt}/${retries}`);
      }
      return await chatJsonCompletionOnce(messages, timeoutMs, useJsonObject);
    } catch (e) {
      lastErr = e;
      if (attempt >= retries || !isRetryableLlmError(e)) {
        break;
      }
      const backoffMs = retryBackoffMs(e, attempt);
      console.warn(`[llm] backoff ${backoffMs}ms`);
      await sleep(backoffMs);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** 去掉 ```json 围栏后 JSON.parse */
export function parseJsonObjectFromLlmText(text: string): unknown {
  const normalize = (s: string): string =>
    s
      // 移除 BOM 与不可见控制字符（保留常见空白）
      .replace(/^\uFEFF/, "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .trim();

  const tryParse = (s: string): unknown => JSON.parse(normalize(s)) as unknown;

  let s = normalize(text);

  // 1) 优先去除围栏
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(s);
  if (fence?.[1]) {
    s = normalize(fence[1]);
  }

  try {
    return tryParse(s);
  } catch {
    // 2) 抽取首个 JSON 对象片段，处理前后夹杂解释文本
    const start = s.indexOf("{");
    if (start >= 0) {
      let depth = 0;
      let inStr = false;
      let esc = false;
      for (let i = start; i < s.length; i += 1) {
        const ch = s[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === "\\") esc = true;
          else if (ch === "\"") inStr = false;
          continue;
        }
        if (ch === "\"") inStr = true;
        else if (ch === "{") depth += 1;
        else if (ch === "}") {
          depth -= 1;
          if (depth === 0) {
            const candidate = s.slice(start, i + 1);
            return tryParse(candidate);
          }
        }
      }
    }
    // 3) 常见错误兜底：去尾逗号
    const noTrailingComma = s.replace(/,\s*([}\]])/g, "$1");
    return tryParse(noTrailingComma);
  }
}
