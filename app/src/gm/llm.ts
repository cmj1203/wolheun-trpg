export class LlmError extends Error {
  override name = 'LlmError';
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export class ContextBudgetError extends LlmError {
  override name = 'ContextBudgetError';
  constructor(
    readonly contextTokens: number,
    readonly promptTokens: number,
    readonly outputTokens: number,
  ) {
    super(`LLM 문맥 용량이 부족합니다: 입력 ${promptTokens} + 출력 예약 ${outputTokens} > 슬롯 용량 ${contextTokens}`, false);
  }
}

export interface LlmConfig {
  baseUrl: string;
  timeoutMs: number;
  chatTemplateKwargs?: Record<string, unknown>;
  /** 브리지(llama-server 가 아닌 루프백 중계 서버)가 고를 모델 이름. 있으면 요청에 model 을 넣고 llama 전용 주소(/props · /apply-template · /tokenize)는 부르지 않는다. */
  servedModel?: string;
}

export interface ChatRequest {
  system: string;
  user: string;
  schema: object;
  temperature: number;
  seed: number;
  maxTokens: number;
  reserveContext?: boolean;
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
      const served = this.cfg.servedModel;
      if (served !== undefined) {
        const listed = models?.data?.some((m) => m.id === served) === true;
        return { ok: listed, model: listed ? served : null };
      }
      return { ok: true, model: models?.data?.[0]?.id ?? models?.models?.[0]?.name ?? null };
    } catch {
      return { ok: false, model: null };
    }
  }

  async warm(system: string): Promise<void> {
    // 프롬프트 캐시 데우기는 llama-server 전용이다. 브리지에서는 한 번의 모델 호출이 되므로 보내지 않는다.
    if (this.cfg.servedModel !== undefined) return;
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
      ...(this.cfg.servedModel !== undefined ? { model: this.cfg.servedModel } : {}),
    };
    if (req.reserveContext === true && this.cfg.servedModel === undefined) {
      if (!Number.isSafeInteger(req.maxTokens) || req.maxTokens <= 0) {
        throw new LlmError('LLM 출력 예약량은 양의 정수여야 합니다.', false);
      }
      try {
        const readJson = async (path: string, payload?: object): Promise<unknown> => {
          const response = await fetch(new URL(path, this.base), {
            ...(payload === undefined ? {} : {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            }),
            signal: AbortSignal.timeout(this.cfg.timeoutMs),
          });
          if (!response.ok) throw new LlmError(`LLM 문맥 사전 검사 ${path} 실패: HTTP ${response.status}`, false);
          return response.json();
        };
        const props = await readJson('/props');
        if (typeof props !== 'object' || props === null || !('default_generation_settings' in props)) {
          throw new LlmError('LLM 슬롯 설정이 없습니다.', false);
        }
        const settings = props.default_generation_settings;
        if (typeof settings !== 'object' || settings === null || !('n_ctx' in settings)
          || typeof settings.n_ctx !== 'number' || !Number.isSafeInteger(settings.n_ctx) || settings.n_ctx <= 0) {
          throw new LlmError('LLM 슬롯 문맥 용량이 올바르지 않습니다.', false);
        }
        const contextTokens = settings.n_ctx;
        const template = await readJson('/apply-template', body);
        if (typeof template !== 'object' || template === null || !('prompt' in template)
          || typeof template.prompt !== 'string' || template.prompt.length === 0) {
          throw new LlmError('LLM 템플릿 프롬프트가 올바르지 않습니다.', false);
        }
        const tokenized = await readJson('/tokenize', {
          content: template.prompt,
          add_special: true,
          parse_special: true,
        });
        if (typeof tokenized !== 'object' || tokenized === null || !('tokens' in tokenized)
          || !Array.isArray(tokenized.tokens) || tokenized.tokens.length === 0
          || !tokenized.tokens.every((token: unknown) => typeof token === 'number' && Number.isSafeInteger(token) && token >= 0)) {
          throw new LlmError('LLM 프롬프트 토큰 정보가 올바르지 않습니다.', false);
        }
        const promptTokens = tokenized.tokens.length;
        if (promptTokens + req.maxTokens > contextTokens) {
          throw new ContextBudgetError(contextTokens, promptTokens, req.maxTokens);
        }
      } catch (err) {
        if (err instanceof LlmError) throw err;
        throw new LlmError(`LLM 문맥 사전 검사를 완료하지 못했습니다: ${err instanceof Error ? err.message : String(err)}`, false);
      }
    }
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
      model: model ?? this.cfg.servedModel ?? null,
    };
  }
}
