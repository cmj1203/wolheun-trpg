# 분류 컨텍스트 경계 수리

2026-11-09. 질문 정합성 교정과 같은 GM 소유 범위에서 입력 분류의 공유 컨텍스트 원인을 분리했다. 실제 추론은 추가하지 않았다.

## 원시 증거와 비추론 대조

정상 대표 판 원문: `work/continuation/qa/real-1794206518713/canonical_first.jsonl`.

| 요청 | 원시 입력 토큰 | 실제 생성 토큰 | 합 | 요청 출력 상한 |
|---|---:|---:|---:|---:|
| A17 / ep04_i02_accusation | 8020 | 172 | 8192 | 320 |
| A18 / ep04_i02_accusation | 8155 | 37 | 8192 | 320 |

두 결과는 모두 JSON Parse error: Unterminated string이다. 요청한 320에 도달한 출력 길이 문제가 아니라, 슬롯 컨텍스트의 남은 172/37토큰에서 생성이 끝났다는 강한 경계 증거다.

이 세션도 GET /props에서 n_ctx=8192, total_slots=1, build b10964-b29c606e2를 확인했다. POST /apply-template 뒤 /tokenize로 원시 messages를 처리했을 때 add_special=false이면 8019/8154, true이면 원시 prompt_tokens와 정확히 같은 8020/8155였다. BOS를 포함해야 한다.

같은 이전 상태·입력으로 새 분류 문맥을 만들고 템플릿·토큰화만 대조했다.

| 요청 | 기존 입력+320 | 새 입력 | 새 입력+320 | 새 입력 뒤 전체 출력 여유 |
|---|---:|---:|---:|---:|
| A17 | 8340 > 8192 | 5135 | 5455 | 3057 |
| A18 | 8475 > 8192 | 5238 | 5558 | 2954 |

계측 스크립트 `app/tests/context_measure64.ts`는 props/apply-template/tokenize만 호출한다. completion·warm 호출은 없다. 근거는 `work/demo-slice/lane64/context-budget-measure.json`과 `.log`다. 새 모델이 JSON을 완성하거나 올바른 분류를 했다는 증거로 승격하지 않는다.

공식 API 근거: `https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md`의 props/apply-template/tokenize 절. apply-template은 추론 없이 실제 채팅 템플릿을 적용한다.

## 수정

- 입력 분류는 생성용 buildSystem 대신 buildInterpretSystem을 사용한다. 현재 상황·의도·목표, 현재 공개된 화면 시점·표시 줄, 인물의 현재 판단 맥락, 능력/수치/소지품, 성립하는 사실·제약, 최근 대화 참조 4개와 플레이어 참조 2개를 보존한다.
- 생성용 문체·표정 지침·원작 예문·숨은 설정 본문·전역 성취 장부·오래된 무관 대화를 분류에 복사하지 않는다. 접근/성공 목표·달성 여부·공개 note 후보·잠금은 기존 buildInterpretUser와 schema에서 그대로 제공한다. 질문이 요구하는 관계의 실제 정본 본문은 별도 Inquiry 단계에 제공한다.
- LlmClient의 선택형 reserveContext 경계는 실제 props → 같은 생성 body의 apply-template → BOS 포함 tokenize 순서로 계산한다. 입력 토큰+요청 maxTokens가 해당 슬롯 n_ctx를 넘으면 생성 요청을 보내지 않고 수치가 담긴 비재시도 ContextBudgetError로 중단한다. n_ctx를 슬롯 수로 임의 나누거나 캐시하지 않는다.
- 이 경계는 주 분류, 질문 관계 근거 판정, 설명 관계 검수에 켰다. 이미 확인된 용량 초과를 일반 talk/행동 대체로 흘리지 않고 GameError로 전달해 원래 세계 상태를 보존한다. 사전 검사 API가 실패한 경우에도 모델 생성으로 우회하지 않는다.
- 서비스 ctx·출력 상한·재시도 수는 늘리지 않았다. 입력 문장을 자르거나 JSON 끝을 보정하지 않았다. 출력 공간만 확보한 것이므로 내용 품질은 별도 실모델 검증이 필요하다.
- 생성 전송의 기존 body·seed·옵션은 유지한다. 예산 옵션을 켜지 않은 기존 생성 경로를 모두 같은 계약으로 바꿨다고 주장하지 않는다.

## 검증

- 독립 예산 게이트: 수정 전 33fail/4pass → 수정 후 37pass/0fail, 108expect. 실제 무작위 포트 모의 서버로 정확한 경계·+1 초과·BOS·템플릿 옵션·다른 슬롯 용량·용량 재확인·잘못된 API 응답/연결 실패·예약량·기존 전송 보존을 확인했다. 원문은 `work/demo-slice/lane64/llm-budget64-red.log`, `llm-budget64-green.log`다.
- 부모 통합: `context-question-integration.log` 53pass/0fail, 255expect. 분류 문맥의 장기 기억/생성 예문 분리, 현재 정보 보존, 초과 시 상태 불변·무재시도, 일반 혼합 관찰/위험/설득, 완결 재질문, 국가/목적지/관객 관계, 근거 위조, 모든 후보 반려, 공개 gate와 독립 잠금을 포함한다.
- `context-question-tsc.log`는 진단 없음, tsc exit 0이다. 통과한 전용 fumble 묶음과 전체 과거 suite는 실행하지 않았다.

## 잔여 소유 분리

| 항목 | 소유·현재 범위 |
|---|---|
| 질문 주체·관계·근거와 분류 컨텍스트 | demo-slice 소스·단위 READY. 실제 모델은 리드의 새 소스 배정 뒤 검증한다. |
| `짓누르던`→숨긴 이름 `누르` 오탐 | 공유 GM 어휘 경계의 별도 잔여. 이번에는 원시 인수만 했고 수정하지 않았다. 특정 문자열 예외 목록으로 고치지 않는다. |
| ep04_c058의 이력에 없는 외모 조롱 회상 | continuation 데이터 소유. 이번 공유 프롬프트 수정의 해결 증거로 세지 않는다. |
| ep06 제작용 화자 미확정 표시 노출 | continuation 데이터 소유. 실제 화면·원작 근거와 별도 확인한다. |
| 생성 비문·시제·시간 연결 | 공유 GM 문법/반응 검수의 별도 잔여. 이번 토큰 여유나 관계 회귀로 해결됐다고 세지 않는다. |
| 복원 큐·표시 세대 경합 | branch-map 소유. 이번 작업은 frame 코드를 바꾸지 않았다. |
| PC fumble 카드·안내 검수 | root 소유. 전용 fumble 통과 묶음을 재실행하지 않았다. |

사용자 서버·모델 프로세스·서비스 설정·푸시·코드 커밋은 건드리지 않았다.

예산 사전 검사에 거절된 chatJson 호출은 실제 completion 요청이나 모델 추론으로 집계하면 안 된다. props/apply-template/tokenize도 추론 호출과 구분한다.

최종 crq add는 exit 1이며 변경 1253개가 150개 한도를 넘어 미등록이다. 이를 우회하려고 공유 변경을 커밋하거나 결과물을 숨기지 않았다.
