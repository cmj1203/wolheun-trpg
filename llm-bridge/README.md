# llm-bridge

게임 GM 클라이언트(llama-server 방식 OpenAI API)의 요청을 이 맥의 `claude` CLI(Claude 구독)로 넘기는 로컬 서버.

## 실행

```sh
bun llm-bridge/server.ts --port 18090   # 127.0.0.1 에만 열림
bun test ./llm-bridge                           # 가짜 claude 로 프로토콜 테스트
bun llm-bridge/smoke.ts                  # 실제 Claude 확인(18197, 모델마다 1회 호출)
```

엔드포인트: `GET /health`, `GET /v1/models`(haiku·sonnet·opus), `POST /v1/chat/completions`(요청에 `"model"` 추가, 없으면 haiku).

## 환경 변수

| 이름 | 기본값 | 뜻 |
|---|---|---|
| `BRIDGE_CLAUDE_BIN` | `/Users/choeminju/.local/bin/claude` | 실행할 claude 경로 |
| `BRIDGE_TIMEOUT_MS` | `80000` | 요청 하나의 제한 시간. 넘으면 claude 프로세스 묶음을 끄고 502 |
| `BRIDGE_CONCURRENCY` | `2` | 동시에 돌리는 claude 수. 나머지는 줄을 선다 |

## 스키마 처리

- CLI 는 `prefixItems` 를 거부한다. CLI 에 넘길 때만 `items: {anyOf: [...]}` 로 바꾸고, 자리별 스키마를 시스템 프롬프트 끝에 덧붙인다.
- 답은 원래 요청 스키마로 다시 검사한다(`schema.ts`). 어긋나면 오류 위치를 붙여 남은 시간 안에서 한 번 더 부르고, 또 어긋나면 `502 schema mismatch: <경로>: <이유>`.
- 요청마다 stdout 에 한 줄: 시각, model, id, status, wall, in/out 토큰, retried. 프롬프트·답 글은 남기지 않는다.

## 한계

- `temperature`·`top_p`·`seed`·`max_tokens`·`cache_prompt` 는 받기만 하고 무시한다(CLI 에 넘길 방법이 없다).
- 스트리밍은 흉내다. claude 가 끝난 뒤 전체 답을 한 조각으로 보내므로 첫 글자 시간 = 전체 시간이다.
- `max_tokens: 1` 이고 스키마가 없는 요청(`LlmClient.warm`)은 claude 를 부르지 않고 빈 답을 바로 돌려준다.
- 요청마다 claude 를 새로 띄워 몇 초가 더 걸린다. 모델이 생각(thinking)을 쓰며 그 토큰도 `completion_tokens` 에 들어간다.
- Claude 구독 사용량을 쓴다. 게임 글(시스템 프롬프트·입력)이 Anthropic 서버로 간다.
- CLAUDE.md·훅·플러그인·MCP·도구는 막지만, CLI 가 넣는 계정 이메일 한 줄과 오늘 날짜는 끌 방법이 없어 문맥에 들어간다.
