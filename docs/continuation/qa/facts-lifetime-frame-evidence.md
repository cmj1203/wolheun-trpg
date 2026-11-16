# 후속 사실 수명과 확정 프레임 근거

조사일: 2026-11-09. 기존 로그와 코드를 읽은 조사다. 모델 호출, warm, 브라우저, 서버 재시작, 테스트 실행을 하지 않았다. 제품 파일을 변경하지 않았다. 아래 JSONL 행 번호는 빈 줄 없는 원본의 1부터 세는 물리 행이다. Bun에서 행별 JSON 파싱 후 필요한 필드만 추출했다.

## 확인된 누출

기준 디렉터리 Q는 `work/continuation/map/run/question-relation64`, R은 `work/continuation/qa/real-1794206518713`이다.

`Q/logs/model-requests.jsonl` 27행은 `chatJson_request`, id=14다. 질문은 “방금 저 둘이 크롬웰의 정보를 캐내자고 한 대화를 아시나도 들은 거야?”다. `request.user`를 다시 JSON으로 파싱하면 다음 공개 evidence가 들어 있다.

| evidence 키 | 실제 내용 또는 식별 부분 | 원본 출처와 판정 |
|---|---|---|
| `scene` | title=`크롬웰의 정보`, perspective=`audience` | 2화 관객 장면. 장면 자체는 올바르다. |
| `displayed` | 푸른 머리 수행원: 그러니 저자를 잘 구슬려내 크롬웰의 정보를 캐내는 건 어떨지요. | 현재 표시 줄 자체는 올바르다. |
| `fact:0` | 아시나는 이미 후드를 벗어 얼굴을 드러냈다. 후드를 벗는 장면은 다시 쓰지 않는다. | `app/content/ep01_desert.yaml:113`. 이미 획득한 과거 사실이며 누출 항목으로 취급하면 안 된다. |
| `fact:1` | 8화 독립 내부 검증용이다. 소지품과 수치는 캠페인 진입 상태를 증명하지 않는다. 궁정 알현과 순례 서술은 아시나가 보거나 들은 일이 아니다. 베히다트와 쿤·시하드는 같은 인물이며 속마음도 다른 인물에게 전달되지 않는다. | `app/content/ep08_harem.yaml:524-532`, facts 배열 0번. `flag:ep08_r01 || !flag:ep08_r01`는 항진식이다. 미래 인물 동일성 및 내부 검증 메모까지 공개 evidence가 됐다. |
| `fact:2` | 아시나는 누르에게 조심할 인물에 관한 답을 아직 듣지 못했다. | 같은 파일 `:534-539`, facts 배열 1번. `!flag:ep08_r10`는 2화처럼 플래그가 없는 때에도 참이다. 누르와 이후 질문 맥락을 너무 일찍 노출한다. |

`Q/logs/gm-trace.jsonl` 8행은 이 원문 질문의 1차 의도 분류, 9행은 관계 판정이다. 모두 beat=`ep02_court_boundary`다. 9행은 subject=`아시나`, relation=`대화 청취 여부`, answerType=`boolean`, answerable=false, evidence=[]다. 요청 로그 28행 id14 응답도 같은 결과다. 따라서 **입력 근거의 사실 누출은 확인됐지만 이 요청에서 모델이 그 사실을 답으로 말한 것으로 확대해 주장하지 않는다.**

같은 trace 10·11행은 “저 사람들이 나눈 이야기가 아시나 귀에도 들어간 거야?”라는 동의 표현이다. 요청 로그 31행 id16에도 동일한 fact:0~2가 들어갔다. 단일 표현만의 오분류가 아니다.

## 실제 질문 프레임과 소비 경계

`Q/audience-original-before-raw.json`에는 서버 저장 형식의 `state`, `view`, 비공개 `viewpoint.current/pending`이 함께 있다.

- `viewpoint.current.event`: type=line, speaker=`ep02_수행원`, display=`푸른 머리 수행원`, 위의 크롬웰 정보 대사.
- current token=`e4d8a759-3c50-4b8a-8a25-da297345847e`, current.state.beat=`ep02_court_boundary`, pending=[].
- 권위 state.beat도 같은 비트다. 권위 flags와 current.state.flags 사이의 값 차이는 없다. 양쪽 모두 ep08_r01/ep08_r10 키가 없다.
- 권위 log 길이=88, current.state.log 길이=85. 양쪽 recent 마지막 줄은 속마음 “살려주세요!!!”다. recent의 끝을 관객 화면의 현재 줄로 해석하면 안 된다.
- `Q/cases.json`은 slot3/audience-origin에서 해당 프레임을 불러온 사례임을 기록한다. 이 자료는 실제 질문 요청의 프레임 증거다. 이것만으로 정상 시작부터의 전체 진행을 재증명하지는 않는다.

현재 제품 호출 순서는 다음과 같다.

1. `app/src/server/main.ts:378-411`: ask는 `viewpoint.question(action.frame)`을 먼저 얻어 `engine.act(s.state, ..., { observer, question })`에 전달한다. 권위 `s.state`는 계속 별도로 존재한다.
2. `app/src/server/viewpoint.ts:31-54`: fresh 관측만 pending에 넣고, 순서대로 confirm한 current만 질문에 쓴다. `question()`은 current.state를 복제하고 current.readLog()를 결합한다. line이면 표시 줄도 별도로 전달한다. 이 서버 전용 투영의 저장 형태는 `:57-74`에 있다.
3. `app/src/engine/engine.ts:406-416`: 확정 question이 있으면 `structuredClone(question.state)`를 `projected`로 만들고 `askGm(projected, beatOf(projected), ..., question.line)`를 호출한다. 질문 뒤 추가 log와 그만두기 pendingRisk만 권위 state로 옮긴다. question 없는 엔진 직접 호출은 권위 state/scene 경로다. 제품 HTTP 경로와 혼동하지 않는다.
4. 같은 파일 `:964-994`: askGm은 받은 projected 상태를 그대로 `GmContext.state`로 넣어 interpret/explain에 전달한다.
5. `app/src/gm/prompt.ts:11-24`: questionFacts는 열린 비hidden 수첩, scene, displayed와 **`activeFacts(ctx.scenario, ctx.state)` 전체**를 공개 evidence에 넣는다. `:112-132`의 질문 분류 프롬프트도 같은 state로 activeFacts를 별도로 읽는다.
6. `app/src/gm/gm.ts:471-503`: readInquiry가 questionFacts로 관계 판정 근거를 만든다. `:511-525` explain에서도 questionFacts를 다시 만들어 인용 근거를 검증한다.
7. `app/src/engine/engine.ts:210-212`: activeFacts는 받은 state의 tracks/abilities/flags/items로 조건만 평가한다. beat나 chapter를 읽지 않는다.
8. `app/src/engine/continuation.ts:64-98`, 특히 `:93`: 후속 장을 붙일 때 `facts: [...base.facts, ...chapter.facts]`로 평탄하게 합친다. 출처 장과 수명 조건을 추가하지 않는다. `:117-138` 이후는 1화 시작 캠페인에 2~10화를 로드·연결한다.

결론: 제품의 확정 프레임 분리가 작동해도, 그 프레임 flags가 아직 비어 있다는 이유로 미래 장의 부정 조건·항진식이 활성화된다. **id14의 직접 원인은 권위 상태를 잘못 받았다는 증거가 아니라, 합쳐진 facts의 장 수명 경계 부재다.** 질문 근거와 분류 프롬프트를 각각 임시 필터링하는 대신 둘 다 읽는 캠페인 사실 집합에서 해결할 수 있는 경계가 있다.

## 장 진입 플래그와 관측 시점

| 장 | 기존 시작 비트 | 시작 효과에 실제 있는 장 표시 | 정상 진행 scene 관측 행 / action |
|---|---|---|---|
| 1 | b00_open | 장 진입 전용 플래그 없음 | R/canonical_first.jsonl 1 / 0 |
| 2 | ep02_prison_wake | 후속_시작=true. 앞 포획 경계에서도 이미 true가 된다. | 247 / 8 |
| 3 | ep03_c001 | ep03_시작=true, 후속_시작=true | 596 / 12 |
| 4 | ep04_c001 | ep04_started=true, ep04_active=true | 917 / 15 |
| 5 | ep05_entry | ep04_active=false. ep05 시작 전용 플래그 없음 | 1282 / 22 |
| 6 | ep06_c001 | 시작 effects 없음. ep06 시작 전용 플래그 없음 | 1551 / 26 |
| 7 | ep07_c001 | ep07_시작=true, 후속_시작=true | 1957 / 33 |
| 8 | ep08_c001 | 시작 effects 없음. ep08_r01은 시작 표시가 아님 | 2283 / 34 |
| 9 | ep09_c001 | ep09_시작=true, 후속_시작=true | 2583 / 37 |
| 10 | ep10_c001 | ep10_시작=true | 2926 / 40 |

선언 위치: `ep03_palace.yaml:781`, `ep04_night.yaml:1151-1152`, `ep05_audience.yaml:473`, `ep07_harem.yaml:789`, `ep09_palace.yaml:681`, `ep10_internal.yaml:585`. 2화 전 경계의 후속_시작 추가는 `continuation.ts:81`이다. 위 YAML 경로는 모두 `app/content/` 아래다.

관측 선후를 정확히 구분해야 한다.

- `engine.ts:651-670`: beat를 바꾸고 scene을 먼저 observe한다. 이어 lead 줄을 처리하고 onEnter effects를 적용한 다음 **마지막 비메타 lead 또는 scene을 다시 observe**한다. eventQueue는 push 시 event에 연결된 마지막 observation을 전달한다(`:282-303`).
- 조사한 각 장 시작 비트에는 lead가 없다. 따라서 표의 실제 scene 관측에는 onEnter의 장 플래그가 이미 반영된다. “scene은 무조건 효과 전”이라는 가정은 틀리다.
- 일반 비트에 비메타 lead가 있으면 마지막 lead가 재관측 대상이므로 scene은 효과 전일 수 있다. 이 일반 제약은 향후 시작 비트를 바꿀 때도 적용된다.
- 줄은 `engine.ts:2091-2095`에서 sets와 effects를 먼저 적용하고 observe한다. 같은 비트라도 공개 전 scene과 공개 줄의 flags가 다를 수 있다.
- ep08_r01은 `ep08_harem.yaml:625`의 줄 sets다. 실제 최초 true 관측은 R 2292행/action34, ep08_c003의 쿤 속마음 “‘남자’인 내가 불편한 건가.”다. ep08_c001의 scene/line 2283·2284행에는 없다. 이를 8화 진입 gate로 쓰면 첫 두 비트가 빠진다.
- ep08_r10은 같은 YAML `:1265`의 줄 sets다. R 2416행의 ep08_c034 scene에는 없고, 바로 다음 2417행 “대재상… 아닐까요?”에서 true가 된다. 이것이 pending 사실과 획득 사실의 실제 전환 경계다.

## 정상 실제 진행에서 확보한 회귀 자료

`R/origin.json`: surface=engine, provider=real-model, canonicalStart=b00_open, acceptsInjectedState=false, root seed=913. `R/summary.json`: canonical_first가 46 actions로 ep10_end/ep10_boundary에 도달했다. uiCompleted=false, storyQaAccepted=false이며 화면·미술·전체 스토리 QA 승인을 뜻하지 않는다.

`R/canonical_first.jsonl`에는 3,278행이 있다. observation의 `detail.state`에는 log가 빠지고 `detail.logLength`가 따로 있다. 실제 상태를 재구성해야 한다면 같은 action 체크포인트의 append된 log에서 해당 길이만 잘라 쓴다는 근거를 남겨야 한다. 관측 상태에 임의 플래그를 추가한 뒤 정상 진행이라고 부르면 안 된다.

| 회귀 목적 | 실제 관측 | 같은 진행의 체크포인트 / 권위 상태 차이 |
|---|---|---|
| 2화 관객 질문에서 미래 사실 배제 | 563행 scene, 564행 line, action11, ep02_court_boundary, logLength=102. 564행은 id14와 같은 표시 문장 | `R/checkpoints/earned_11.json`, beat=ep02_court_boundary. 아직 8화 플래그가 없다. 후드 과거 사실은 남아야 한다. |
| 한 action 중 권위 비트가 더 앞으로 진행된 경우 | 596행 scene, 597행 line, action12, ep03_c001, logLength=104, ep03_시작=true | `earned_12.json`의 최종 beat=ep03_c046. 질문 컨텍스트가 이 마지막 비트가 아니라 관측 프레임 상태를 받아야 한다. |
| 8화 첫 프레임에 r01 없이도 장 수명 시작 | 2283행 scene, 2284행 “언제까지…”, action34, ep08_c001, logLength=461. r01/r10 없음 | `earned_34.json`: ep08_c024, r01=true, r10 없음. 첫 프레임 질문이 뒤의 r01을 빌려서는 안 된다. |
| 같은 비트에서 질문 답 획득 직전/직후 | 2416행 scene/2417행 line, action35, ep08_c034, logLength=496. r10 없음 → true | `earned_35.json`: ep08_c057, r01=true, r10=true. 권위 상태로 물으면 직전 질문에 답을 앞당기게 된다. |
| 이후 장에서도 획득 사실 유지 | 2583행 ep09_c001/action37, 2926행 ep10_c001/action40 | 두 프레임 모두 ep08_r10=true. “누르가 대재상을 권력자로 꼽았다”는 획득 사실을 장이 끝났다는 이유만으로 지우면 회귀다. |

`R/checkpoint-index.json`의 slot·rootSession·afterActions와 실제 파일을 대조했다. 아래 SHA256 네 개가 색인 값과 일치함을 Bun CryptoHasher로 확인했다.

| 파일 | SHA256 |
|---|---|
| earned_11.json | f21b9da508bcb307a660671cbfdff62c1cde199d90e9745ed8e39f16e65d7c3f |
| earned_12.json | 5e2c451ee25111985129c2b706ab928a407d799c88e79984892df2cf3fb399b6 |
| earned_34.json | df2cdd56f24ca50410a43c2cff1faf19e3bbc9d0153e0aeb1b1d05794646ba28 |
| earned_35.json | d9c204c3bc5d451e94cecbb887d4a499773d8cafc1b03a2ad8fa52dbbba84554 |

## 수정 경계와 집중 회귀 권고

생산자 계약을 바꾸지 않는 선택지가 있다. `continuation.ts`는 평탄화 전에 원본 장의 facts와 시작 beat를 함께 알고 있고, 이미 연결용 effects.flags를 합성한다. 이 조립 단계에서 사실 수명을 정하고 기존 조건 언어로 감쌀 수 있다. 이번 조사에서는 구현하지 않았다.

- 모든 과거 facts에 “현재 장만” gate를 붙이면 안 된다. 후드를 벗은 이력, 이미 들은 지명·인물 정보, 획득한 ep08_r10 사실 등은 뒤 장에서도 유지할 근거가 있다. 반대로 현재 복장·소지품·현재 모름/대기 상태는 해당 상태가 끝나는 조건을 가져야 한다. 이미 존재하는 ep04_active, 아이템 반환 플래그 같은 종료 조건을 없애지 않는다.
- 최소 P1 대상은 8화 내부 검증 facts[0]와 선행 부정 조건 facts[1]이다. facts[0]는 단순 장 gate만 붙여도 **8화 도달 후에는 내부 검증 메모와 동일인 정답을 공개 evidence로 내보낸다.** 캠페인에서 standalone 검증 사실을 제외하거나 공개 가능한 내용과 분리해야 하는 대상이다. facts[1]는 8화 진입 후, r10 전까지만 현재 사실로 성립시킬 수 있다. facts[2]의 획득 정보는 이후에도 보존하는 쪽으로 회귀를 잡는다.
- 현재 플래그만으로 모든 장의 “정확한 첫 프레임부터 진입”을 표현할 수는 없다. 5·6·8화 전용 진입 플래그가 없고 ep08_r01은 늦다. 조건 문맥도 beat/log/chapter를 받지 않는다(`conditions.ts:6-16`, `engine.ts:210-212`). 전역 하나의 후속_시작으로 8화를 가려서는 안 된다.
- engine/types/gm/YAML을 그대로 둬야 한다면, 캠페인 조립에서 시작 beat.effects.flags에 캠페인 전용 장 진입·현재 장 표시를 합성하고 facts.if를 조립하는 방식이 가능하다. flags는 기존 `Record<string, FlagValue>` 계약이다. 시작 효과가 실제 첫 scene에 보이는지는 위 관측 타이밍을 회귀로 고정한다. 새 합성 플래그가 없는 기존 저장의 자동 이행까지 해결됐다고 가정하지 않는다. 기존 저장 지원은 별도로 정책을 정해야 한다.
- 조건 파서는 괄호를 지원하지 않고 OR 그룹/AND 원자로 분해한다(`conditions.ts:20-37`). 기존 `A || B`를 gate와 결합하려면 각 OR 절에 gate를 배분해야 한다. `gate && A || B`는 B 경로 누출을 남긴다.
- standalone 8화 검증과 캠페인 조립을 구분해야 한다. 원본 YAML 자체를 캠페인 조건으로 바꾸면 standalone의 의도를 훼손한다. 조립된 campaign facts를 검사하고 원본을 보존하는 테스트가 맞다.

추천 회귀는 다음 순서다.

1. 위 실제 2화 프레임으로 캠페인 activeFacts와 questionFacts를 검사한다. facts[0] 내부 검증 문장과 누르 대기 문장은 없어야 하고, 획득한 후드 사실은 있어야 한다. 질문 분류 프롬프트의 별도 activeFacts 경로도 함께 검사한다.
2. 실제 8화 2283·2284행을 사용해 r01 이전 첫 scene/line의 수명을 확인한다. 수정으로 합성되는 gate를 수동 주입해 통과시키지 말고, 변경된 캠페인 조립과 실제 엔진 관측을 거쳐 생기는지 확인한다. 기존 관측은 변경 전 출처 자료다.
3. 2416/2417행의 동일 비트 전환을 확정 프레임으로 재생하고, 앞선 권위 상태 earned_35와 분리해 질문의 activeFacts 입력 state를 포착한다. r10 전에는 대기 사실, r10 후에는 획득 사실이어야 한다. 공개 전 장면에서 뒤의 권위 flags를 가져오지 않아야 한다.
4. ep09/ep10 실제 프레임에서도 획득 사실을 보존하고, 내부 검증 메모는 계속 배제한다. 현재 장 facts를 줄이는 수정이 과거 지식 소실을 만들지 않아야 한다.
5. 기존 `app/tests/viewpoint64.test.ts:58-99`는 FakeGm과 합성 audience 비트를 만들고 future/ending/tracks를 수동 변경하는 단위 테스트다. `:101` 이후도 합성 reveal 비트다. 이 테스트는 경계 계약에 유용하지만 정상 실제 스토리 진행 증거라고 부르면 안 된다. 실제 관측/체크포인트에서 가져온 집중 회귀를 별도로 둔다.

이번 결과는 원인·소비 경계·실제 진행 근거를 문서화한 것이다. 제품 수정 또는 수정 후 회귀 통과를 주장하지 않는다.
