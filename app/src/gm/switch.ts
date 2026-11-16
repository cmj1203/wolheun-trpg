import { LlmClient, type ChatRequest, type LlmResult } from './llm.ts';

export interface LlmChoice {
  key: string | null;
  client: LlmClient;
  /** 이 모델에만 쓰는 GM 시간 예산(models.json 의 gm_budget_ms). 없으면 GM 기본값. */
  budgetMs?: number;
}

/**
 * 고른 모델로 요청을 넘기는 LLM. GM 은 이것 하나를 쥐고, 서버는 판(Engine·세션)을 그대로 둔 채 고른 모델만 바꾼다.
 * 바꾸면 다음 GM 호출부터 새 모델로 간다. 이미 보낸 요청은 보낸 모델에서 끝난다.
 */
export class SwitchableLlm extends LlmClient {
  private choice: LlmChoice;

  constructor(initial: LlmChoice) {
    // 이 객체 자신은 아무 데도 요청하지 않는다. 부모 생성자가 요구하는 루프백 주소만 채운다.
    super({ baseUrl: 'http://127.0.0.1', timeoutMs: 1 });
    this.choice = initial;
  }

  get key(): string | null {
    return this.choice.key;
  }

  get budgetMs(): number | undefined {
    return this.choice.budgetMs;
  }

  select(choice: LlmChoice): void {
    this.choice = choice;
  }

  override health(): Promise<{ ok: boolean; model: string | null }> {
    return this.choice.client.health();
  }

  override warm(system: string): Promise<void> {
    return this.choice.client.warm(system);
  }

  override chatJson(req: ChatRequest): Promise<LlmResult> {
    return this.choice.client.chatJson(req);
  }
}
