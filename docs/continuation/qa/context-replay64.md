# A17/A18 원래 획득 문맥의 분류 표적 재생

준비 단계에서는18196이 branch-map 전용 창이었으므로 추론·예열·계측 API를 호출하지 않았다. 준비 스크립트는 네트워크 outbound를 막은 sandbox에서 실행했다. 이후 리드가 반환된 창을 동결된 두 요청에 배정해 아래 실제 표적 재생을 수행했다.

## 비교 원점

정상 첫 판 `work/continuation/qa/real-1794206518713`의 원시 기록·획득 저장을 읽는다. 새 게임이나46행동 재주행으로 대체하지 않는다.

| 대상 | 실제 입력 | 원래 선행 저장 | 이전 원시 결과 |
|---|---|---|---|
| A17 | 듣지도 않고 도둑으로 몰지 마세요. 물건을 훔친 적 없어요. | canonical_first_16 / earned_16 | 입력8020+출력172=8192. JSON 끝 difficulty 문자열 절단, rule talk |
| A18 | (또렷하게 상대를 바라본다) 무슨 근거로 그런 말을 하는 거죠? | canonical_first_17 / earned_17 | 입력8155+출력37=8192. reason 도중 절단, 목표 재입력 안내 |

A18에는 A17 뒤 실제로 전달된 인물 반응이 이미 있다. 둘을 같은16번 저장으로 재생하면 다른 실험이므로 허용하지 않는다.

## 복구와 동결

허용 작업 폴더의 `replay64.ts` 준비 모드는 다음을 수행한다.

1. 각 행동에서 유일한320토큰 주 해석 요청과 해당 자유 입력·원시 해석 추적을 찾는다.
2. 직전 실제 state를 기존 `assertState`로 읽고 실제 checkpoint 파일 hash·rootSession·rootSeed·afterActions를 검사한다. `readSave`로 읽은 실제 획득 저장과 원시 state를 깊이 비교한다.
3. state/flags/items/RNG/beat/free/recent/heard/log를 바꾸지 않고 원문을 `parseStoryInput`에 전달한다. 실제 beat/free와 같은 state로 GmContext를 만든다.
4. `buildInterpretUser`가 원래 요청 user와 완전히 같은지 검사한다. 기존 `buildSystem` 재구성의 일치 여부도 기록해 원래 문맥과 코드 변경을 구분한다.
5. 같은 문맥에서 새 `buildInterpretSystem`만 만들고 원래 schema·temperature·seed·maxTokens=320을 유지한다. 새 용량 예약 `reserveContext=true`를 켠다.
6. 두 묶음과 manifest에 원래 요청 행·상태 행·checkpoint·요청/상태/소스 hash를 기록한다. 준비 중 state 또는 공유 소스가 바뀌면 중단한다.

기존 system 재구성이 불일치하면 차이를 확인하기 전에는 실제 재생 준비가 끝났다고 보지 않는다. user·state 불일치는 임의로 수정해 통과시키지 않는다.

## 다음 창의 실행 경계

새 리드 배정 뒤 아래 명령을 한 번 실행했다. 추가 예열·재시도·세계 행동은 없다.

```sh
bun work/continuation/qa/context-replay64/replay64.ts --run --model-window-assigned
```

`--run`만 주면 새 창 배정이 필요하다는 오류로 client 생성 전에 멈춘다. 새 배정 없이는 위 전체 명령을 사용하지 않는다. 기본 모드는 준비뿐이다.

실행 모드는 동결된 묶음·요청·runtime hash를 검사한 뒤 LlmClient.chatJson으로 각 주 분류 요청을 한 번씩만 보낸다. 용량 사전 검사 API는 이 배정된 실행 단계에서만 쓰고 completion과 구분한다. 예열·LocalGm.interpret의 추가 보조 판단·서술·Engine.act·저장 재개·세계 진행·재시도는 없다. 용량 거절이나 JSON 절단도 원문대로 기록하며 괄호를 보정하지 않는다.

## 판정할 내용

- 원시 응답 전체가 JSON으로 끝까지 파싱되는지 확인한다. 단순 길이 증가를 의미 성공으로 보지 않는다.
- kind/target/approach/scope/reason을 원문과 당시 상대의 의심·압박, `ep04_heard` 목표와 대조한다.
- A17은 도둑이라는 비난에 결백을 주장하는 말이다. A18은 직전 비웃음에 근거를 요구하며 맞서는 말이다. 상대에게 한 말과 불확실한 사회적 성취를 구분하며, 질문형이라는 이유만으로 게임 설명 질문으로 바꿨는지도 확인한다.
- 준비 단계는 원하는 분류를 응답에 주입하지 않는다. action/ep04_heard가 나왔다는 이유만으로 정확하다고 승인하지 않고 reason·당시 문맥을 함께 읽는다. 다른 분류도 원문과 비교해 보고한다.
- 완결성·의미·요청/응답 토큰·소요시간·오류와 동결된 원래 state 불변을 별도로 기록한다.
- 재생은 분류만 검증한다. 원래 정상 판의 실행 이력, 실패 응답,46행동 완주,1199줄 대사 검수를 고쳐 쓰거나 새로운 통과 증거로 승격하지 않는다.

## 근거와 검증 기록

- core 정본: `docs/lead_check63/interpret_context64.md`, `question_relation64_implementation.md`.
- core의 기존 비추론 계측은 새 입력5135/5238, 예약 포함5455/5558을 기록했다. 이 수치는 본 준비에서 다시 계측한 값이나 실제 새 JSON·분류 통과가 아니다.
- 네트워크 outbound 차단 sandbox 준비 실행 exit0, 전용 tsconfig 타입 검사 exit0이다. `prepare.log`, `typecheck.log`에 기록했다.
- 배정 플래그 없는 `--run`은 client 생성 전 `ReplayError: 새 리드 모델 창 배정이 필요합니다`로 exit1을 냈다. `results.json`은 없으며 검증 명령은 `NO_GRANT_GUARD_PASS`로 종료했다. 근거는 `no-grant.log`다.

| 복구 검사 | A17 | A18 |
|---|---|---|
| 원시 요청 행 | 1096 | 1112 |
| 원시 선행 state 행 | 1069 | 1105 |
| 획득 경계 | canonical_first_16 | canonical_first_17 |
| 원시 state와 실제 저장 | 깊은 비교 일치 | 깊은 비교 일치 |
| 원래 user 재구성 | 완전 일치 | 완전 일치 |
| 기존 system 재구성 | 완전 일치 | 완전 일치 |
| 준비 중 state 변경 | 없음 | 없음 |

두 묶음은 `A17.bundle.json`, `A18.bundle.json`이고 checkpoint·state·요청 hash와 준비 소스 hash는 `manifest.json`에 고정했다. 이 준비 단계의 모델·예열·계측 API 호출은0이다. 허용 작업 폴더와 본 문서 외에 쓰지 않았다.

## 실제 표적 재생 결과

실행과 전용 타입 검사 모두 exit0이다. 종료 직후 도리 보고로18196 창을 반환했다. 결과가 나온 뒤 추가 모델 호출은 없다.

| 항목 | A17 | A18 |
|---|---:|---:|
| 원래 입력/출력 토큰 | 8020 / 172, 절단 | 8155 / 37, 절단 |
| 새 예약 계측 입력 토큰 | 5135 | 5238 |
| 요청 출력 예약 | 320 | 320 |
| 입력+예약 | 5455 | 5558 |
| 실제 completion 입력/출력 | 5135 / 129 | 5238 / 161 |
| 슬롯 n_ctx | 8192 | 8192 |
| TTFT ms | 7219.568 | 4624.373 |
| chatJson 전체 ms | 9534.534 | 7536.526 |
| JSON 완결성 | object로 완전 파싱 | object로 완전 파싱 |
| kind / target / scope | action / ep04_heard / ready | action / ep04_heard / ready |

실제 HTTP는 총8회이며 모두200이다. 예약 계측은 `/props`, `/apply-template`, `/tokenize` 각2회, 합계6회다. 실제 completion은 `/v1/chat/completions` 2회다. 계측을 completion 수에 더하지 않는다. 예열·재시도·Engine.act·새 newGame·전체 재주행은0이다. 전송을 관찰하는 wrapper는 요청 body와 응답을 바꾸지 않고, completion 스트림은 원래 LlmClient가 그대로 읽었다.

원시 경로는 작업 폴더의 `A17.result.json`, `A18.result.json`, `results.json`, `wire.json`이다. manifest에 고정한6파일(prompt/llm/gm/lore/scenario/continuation)은 준비와 실행 전 값이 같고 실행 전후 hash 차이도0이다. 전체 작업공간의 모든 파일이 같다는 주장은 아니다. 마지막 대조와 실행 스크립트 hash는 `execution-hashes.json`에 있다. 동결된 두 묶음은 실행 후에도 그대로이며, 기존 정상판 JSONL의 SHA-256도 준비 당시와 일치한다.

### A17 원시 출력과 의미

```json
{"reason":"상대의 억울한 몰이에 대해 항의하며 해명의 근거를 들어 말을 끝까지 듣게 하려는 사회적 도전임.","label":"억울함 호소","question":"","kind":"action","about":"none","risk":"none","approach":"ep04_heard","target":"ep04_heard","scope":"ready","item":"","odd":false,"absurd":false,"bold":false,"deed":"도둑으로 몰지 말라며 해명의 근거를 들어 항의한다.","stat":"재치","difficulty":"보통"}
```

당시 상대는 “훔쳐보는 취미라도 있는 건가? 아니면 첩자짓?”이라고 의심했다. 입력은 도둑으로 몰지 말라는 항의와 절도 부정이다. 이를 상대에게 끝까지 듣게 하려는 사회적 시도로 읽은 reason과 ep04_heard 선택은 당시 목표와 맞는다. 질문 모드로 바꾸거나 이미 결백이 입증됐다고 결과를 확정하지 않았다. 주 분류 의미는 일치로 판단한다.

### A18 원시 출력과 의미 잔여

```json
{"reason":"상대의 의심에 대해 논리적인 근거를 요구하며, 자신의 결백을 입증하기 위해 대화를 이어가려는 능동적인 사회적 도전임. 단순히 묻는 것을 넘어 상대의 판단에 맞서려는 의도가 포함됨.","label":"항의의 근거 요구","question":"","kind":"action","about":"none","risk":"none","approach":"ep04_heard","target":"ep04_heard","scope":"ready","item":"","odd":false,"absurd":false,"bold":false,"deed":"상대의 의심에 대해 무슨 근거로 그런 말을 하는지 물으며 항의의 근거를 듣는다.","stat":"재치","difficulty":"보통"}
```

당시 상대는 “도둑질을 안 했다면, 왜 남의 구역을 기웃거리는 거지?”라고 비웃었고 의심을 유지했다. 이 상황의 근거 요구를 사회적 도전으로 읽은 kind/target은 맞는 방향이다.

다만 원래 목표는 **“아시나가 말한 항의나 해명의 근거를 상대가 끝까지 듣는다. 첩자 의심이 완전히 풀린 것은 아니다.”**다. 새 deed는 아시나가 “항의의 근거를 듣는다”로 읽혀 듣는 주체·내용이 원래 목표와 어긋난다. `kind=action`과 올바른 target만으로 전체 의미를 깨끗한 통과로 세지 않는다. 이 잔여는 원문 그대로 먼저 리드에게 보고했으며 출력 교정·추가 호출은 하지 않았다.

두 출력의 `stat=재치`는 선언된 ep04_heard의 `stat=매력`과 다르다. 기존 정의 접근 소비 경계에서는 선언된 stat을 쓰지만 이번에는 Engine이나 LocalGm의 후속 판단을 실행하지 않았으므로 실제 판정 능력·행동 적용을 검증한 것으로 세지 않는다.

## 증거 범위

이번 결과는 원래 두 획득 문맥에서 새 system의 JSON 완결성과 주 분류 의미만 비교한다. 원래 A17/A18의 잘린 응답·정상판46행동 완료·1199줄 대사 검수는 그대로 보존했다. 새 결과로 기존 정상판의 실패 기록이나 검수 결과를 덮거나 승격하지 않는다.

branch-map의4질문이 모두 unknown이었던 청취·관계 질문 품질 잔여는 이 두 요청으로 통과하지 않는다. 현재 질문 관계 품질, 실제 세계 적용, UI/frame·그림·소리와 다른 경로도 검증하지 않았다.
