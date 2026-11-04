export class LlmError extends Error {
  override name = 'LlmError';
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface LlmConfig {
  baseUrl: string;
  timeoutMs: number;
  chatTemplateKwargs?: Record<string, unknown>;
}

export interface ChatRequest {
  system: string;
  user: string;
  schema: object;
  temperature: number;
  seed: number;
  maxTokens: number;
}

export interface LlmResult {
  text: string;
  ttftMs: number | null;
  totalMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  promptMs: number | null;
  genMs: number | null;
  model: string | null;
}

interface StreamChunk {
  error?: { message?: string };
  model?: string;
  choices?: { delta?: { content?: string | null } }[];
  timings?: { prompt_n?: number; prompt_ms?: number; predicted_n?: number; predicted_ms?: number };
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function isCompleteJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

export function assertLoopback(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`GM 은 이 컴퓨터 안의 LLM 서버(http://127.0.0.1)만 쓸 수 있습니다. 받은 주소: ${url}`);
  }
  return parsed;
}

export class LlmClient {
  private readonly base: URL;

  constructor(private readonly cfg: LlmConfig) {
    this.base = assertLoopback(cfg.baseUrl);
  }

  async health(): Promise<{ ok: boolean; model: string | null }> {
    try {
      const res = await fetch(new URL('/health', this.base), { signal: AbortSignal.timeout(2000) });
      if (!res.ok) return { ok: false, model: null };
      const models = (await fetch(new URL('/v1/models', this.base), { signal: AbortSignal.timeout(2000) })
        .then((r) => r.json())
        .catch(() => null)) as { data?: { id?: string }[]; models?: { name?: string }[] } | null;
      return { ok: true, model: models?.data?.[0]?.id ?? models?.models?.[0]?.name ?? null };
    } catch {
      return { ok: false, model: null };
    }
  }

  async warm(system: string): Promise<void> {
    await fetch(new URL('/v1/chat/completions', this.base), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: '.' },
        ],
        max_tokens: 1,
        temperature: 0,
        cache_prompt: true,
        ...(this.cfg.chatTemplateKwargs ? { chat_template_kwargs: this.cfg.chatTemplateKwargs } : {}),
      }),
      signal: AbortSignal.timeout(this.cfg.timeoutMs),
    });
  }

  async chatJson(req: ChatRequest): Promise<LlmResult> {
    const started = performance.now();
    const body = {
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      temperature: req.temperature,
      top_p: 0.9,
      seed: req.seed,
      max_tokens: req.maxTokens,
      stream: true,
      cache_prompt: true,
      response_format: { type: 'json_schema', json_schema: { name: 'gm_output', strict: true, schema: req.schema } },
      ...(this.cfg.chatTemplateKwargs ? { chat_template_kwargs: this.cfg.chatTemplateKwargs } : {}),
    };
    let res: Response;
    try {
      res = await fetch(new URL('/v1/chat/completions', this.base), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
    } catch (err) {
      throw new LlmError(`LLM 서버에 연결하지 못했습니다: ${(err as Error).message}`, false);
    }
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      throw new LlmError(`LLM 서버 오류 ${res.status}: ${detail.slice(0, 300)}`, res.status >= 500);
    }

    let text = '';
    let streamError: string | null = null;
    let ttftMs: number | null = null;
    let last: StreamChunk = {};
    let model: string | null = null;
    let buffer = '';
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf('\n');
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          const chunk = JSON.parse(data) as StreamChunk;
          if (chunk.error) streamError = chunk.error.message ?? 'LLM 서버가 오류 조각을 보냈습니다';
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            if (ttftMs === null) ttftMs = performance.now() - started;
            text += delta;
          }
          if (chunk.model) model = chunk.model;
          if (chunk.timings || chunk.usage) last = { ...last, ...chunk };
        }
      }
    } catch (err) {
      throw new LlmError(`LLM 응답을 읽다가 끊겼습니다: ${(err as Error).message}`, (err as Error).name !== 'TimeoutError');
    }
    if (streamError !== null && !isCompleteJson(text)) throw new LlmError(`LLM 서버 오류: ${streamError}`, true);
    return {
      text,
      ttftMs,
      totalMs: performance.now() - started,
      promptTokens: last.timings?.prompt_n ?? last.usage?.prompt_tokens ?? null,
      completionTokens: last.timings?.predicted_n ?? last.usage?.completion_tokens ?? null,
      promptMs: last.timings?.prompt_ms ?? null,
      genMs: last.timings?.predicted_ms ?? null,
      model,
    };
  }
}
