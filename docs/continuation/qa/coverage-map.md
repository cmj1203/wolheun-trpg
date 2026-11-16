# 합성 캠페인 실주행 QA 커버리지 지도

작성 기준: 2026-11-09T05:11:49.125Z (한국 시각 2026-11-09). **정적 조사와 실주행 준비 문서**다. 모델 호출, HTTP, 서버, 브라우저, 그림 생성, Engine/FakeGm 플레이는 실행하지 않았다. 실제 실주행 증거는 0건이다. 원작 대조·UI·프레임·그림 승인까지 통과했다는 뜻이 아니다.

기계 판독 원본: `work/continuation/qa/campaign-contract-inventory.json`. 각 ID·조건·고정 줄의 전체 내용과 근거 경로는 이 파일에 있다. 아래 표와 JSON의 case는 **검증 의무**이며 통과 기록이 아니다. endpoint fixture는 어떤 경우에도 완주나 실제 checkpoint로 세지 않는다.

## 1. 현행 전체 범위와 증거

별도 Bun 1.4.2 프로세스에서 현재 파일을 `loadCampaignScenario` → `loadLore` → `withNotes`로 읽었다. exit=0, stderr는 비었다. 기존 persistent module cache를 사용하지 않았다. 최종 추출과 최초 추출 사이 합성 내용 변화는 없었다. JSON `evidence.fingerprints`에 콘텐츠·파서·타입·엔진·GM 계약 23개 파일의 SHA-256이 있다. 이후 콘텐츠가 바뀌면 해당 계약의 현재 지문과 실제 run의 지문을 구분해야 한다.

| 항목 | 수 |
|---|---:|
| 화 / 비트 | 10 / 643 |
| 선택지 정지점 / 선택지 occurrence | 37 / 66 |
| 자유 입력 정지점 / 목표 / 표준 접근 | 13 / 38 / 35 |
| 실제 종료 ending / 계속 경계 | 11 / 11 |
| 실제 비종결 정지점 | 50 |
| 조건부 next 비트 / 전체 if·when occurrence | 9 / 280 |
| 대가 후보 / 지식 / 숨김 지식 | 59 / 29 / 17 |
| 고정 line occurrence / 글이 있는 line | 1785 / 1686 |
| CG 등록 | 607 |

열 화의 비트 수는 순서대로 **32, 31, 64, 84, 65, 79, 63, 63, 70, 92**이다. 모든 파일의 파싱된 계약을 `scenarioContract.beats`에 보존했다. fixed line 수에는 outcome·fallback·twist·callback·lore 반응도 포함한다. 빈 line 99건은 그림/연출 증거로 따로 검수한다.

읽은 계약의 핵심 근거: `app/src/engine/scenario.ts`의 parseNext/parseOutcome/checkPrices/parseFree와 시나리오 검사, `types.ts:116` GoalSpec, `types.ts:170` ChoiceSpec, `types.ts:204` FreeSpec, `types.ts:346` BeatSpec, `types.ts:704` Action; `continuation.ts:117` 열 화 합성; `gm/lore.ts:183` withNotes. 실제 로더가 열 화 모두의 오류 검사까지 실행했다.

재현용 최소 명령(새 프로세스, 모델 불필요):

```bash
bun -e 'import {loadCampaignScenario} from "./app/src/engine/continuation.ts"; import {loadLore,withNotes} from "./app/src/gm/lore.ts"; const s=withNotes(await loadCampaignScenario("app/content/ep01_desert.yaml"),await loadLore("app/content/lore_wolheun.yaml")); console.log({start:s.start,beats:Object.keys(s.beats).length,choices:Object.values(s.beats).reduce((n,b)=>n+(b.choices?.length??0),0),endings:Object.entries(s.beats).filter(([,b])=>b.ending).map(([id,b])=>[id,b.ending.id])});'
```

실제로 사용한 전체 추출 코드와 실행 결과는 JSON `evidence.extractionCode`, `freshProcessExit`, `stderr`에 있다. 서버나 모델을 import해 실행하는 명령이 아니다.

## 2. 먼저 돌릴 원작 우선 정책

시작은 반드시 `Engine.newGame(seed, session)`이다. 실제 최초 경로는 `b00_open → b01_sand → b02_people`. seed는 새 게임 인수로만 정하고 기록한다. 이후 beat/items/flags/RNG를 주입하지 않는다. 아래 override는 실제 도착한 정지점에만 쓴다. 예상 밖 입력 자리는 정직하게 미계획으로 기록하고 중단한다. 진짜 ending은 그대로 해당 run을 끝낸다. 사막 독립 결말을 포획 본선으로 강제 회수하지 않는다.

자유 입력 순서:

- `b02_people`: `(달려가서 길을 묻는다)`
- `b05_why`: `대륙에서 하나뿐인 미소녀니까요.`
- `b06_swing`: `(몸을 던져 칼날을 피한다)`
- `b08_gaze`: `(똑바로 눈을 마주 본다)`
- `ep02_unlock`: `(핀을 살살 넣어 걸리는 곳을 찾는다)`
- `ep02_question`: `(잠금장치가 고장났다고 속여 기술을 감춘다)`
- `ep04_i02_accusation`: `(납치당한 쪽은 나라고 근거를 들어 항의한다)`

선택지:

```json
{
  "e_curious": "continue_chapter",
  "e_survivor": "continue_chapter",
  "ep02_court_boundary": "continue_ep03",
  "ep03_c046": "ep03_i01_protest",
  "ep03_c049": "ep03_i02_quiet",
  "ep03_c061": "continue_ep04",
  "ep04_i01_scout": "passage",
  "ep04_i03_origin": "conceal",
  "ep04_i04_distance": "retort",
  "ep04_boundary": "continue_ep05",
  "ep04_distance_boundary": "continue_ep05",
  "ep05_c020": "ep05_role_original",
  "ep05_c045": "ep05_summons_original",
  "ep05_c053": "ep05_reply_original",
  "ep05_boundary": "continue_ep06",
  "ep06_c003": "ep06_decline_direct",
  "ep06_c008": "ep06_purpose_direct",
  "ep06_c035": "ep06_origin_direct",
  "ep06_c038": "ep06_question_direct",
  "ep06_c046": "ep06_politics_direct",
  "ep06_c056_response": "ep06_travel_direct",
  "ep06_c065": "continue_ep07",
  "ep07_c063": "continue_ep08",
  "ep08_c024": "ep08_c024_ask",
  "ep08_c057": "ep08_c057_quiet",
  "ep08_c062": "continue_ep09",
  "ep09_c063": "ep09_protest",
  "ep09_c080": "ep09_breath",
  "ep09_c084": "continue_ep10",
  "ep10_c026": "ep10_hair_source",
  "ep10_c029": "ep10_family_tell",
  "ep10_c034": "ep10_name_tell",
  "ep10_c043": "ep10_travel_retort",
  "ep10_travel_choice": "ep10_travel_retort",
  "ep10_c052": "ep10_title_behi",
  "ep10_c058": "ep10_contact_silent"
}
```

`ep04_i01_scout/passage`는 본선 합류를 위한 탐색 선택이며 원작 고정 대사라고 주장하지 않는다. `ep10_travel_choice`는 이름을 간단히 확인하는 대체 경로에서 만날 수 있는 실제 정지점이다. 본선의 여행 질문 정지점은 `ep10_c043`이다. 같은 choice ID가 두 비트에 있으므로 반드시 beat+choice로 식별한다.

원작 우선 입력으로도 실제 판정이 독립 분기/결말을 만들 수 있다. 위 입력은 10화 도달 보장이 아니다. `r2_bind` 등을 만나면 본선 의도를 이유로 고정 진행하지 않는다. 분기 전용 정책으로 별도 기록하려면 아래의 실제 조건과 입력을 따라야 한다.

## 현재 다섯 등급과 이전 표의 구분

공유 판정에 `fumble`이 추가된 뒤에는 아래의 기존 4등급 수치를 현재 범위로 쓰지 않는다. 모델 없이 실제 현재 캠페인을 읽는 `campaign_qa_main.ts`의 준비 출력이 `TIER_LABEL`에서 등급을 직접 가져온다.

| 자유입력 판정 의무 | 이전 표 | 현재 템플릿 |
|---|---:|---:|
| 목표 | 152 | 190 |
| 접근 | 140 | 175 |
| improv / improv_bold | 66 | 110 |
| 합계 | 358 | 475 |

이전 local 66건은 명시된 hit/mixed/miss만 셌다. 현재 local 110건은 기본 파생 crit와 fumble도 포함한다. `work/continuation/ep02/run/campaign-runtime-tier-plan.json`에는 중복 없는 475개 ID가 있으며 모두 earned=false·verified=false다. 준비 검사·타입 검사는0, 모델 호출은0이다. 선택지36개는 실제 대본 ID와 대조한 첫 대표판의 입력 계획이다.

이 표는 자유입력 결과 템플릿 범위다. 실제 획득 저장·조건 충족·원시 생성문 검수·화면 검수의 증거가 아니다. 새 대실패의 실제 추가 비용으로 전역 결말이 달라질 수 있으므로 이전 miss의 다음 경로를 그대로 통과했다고 세지 않는다. 실제 관측 후 판정·비용·전이를 함께 기록한다. 이전 첫 판과 152개 목표 의무를 담은 기록은 당시 스냅샷으로 보존한다.

## 3. 실제 정지점과 유한 checkpoint DAG

`engine.ts:620–675`의 enter는 `ending`, `choices`, `free`에서만 멈춘다. 일반 고정 비트는 한 act 안에서 다음 정지점까지 자동 통과한다. 따라서 `ep07_c003` 같은 중간 비트를 저장점이라고 지정하면 안 된다. 엔진의 현재 정지점과 화면이 아직 읽고 있는 장면도 다를 수 있다.

JSON `checkpointDAG.checkpoints`는 **실제 정지 가능한 50개 beat 템플릿**이다. 전부 `earned:false`. 실제 키는 `cp:<beat>@<realRunId>:<logLength>:<unchangedStateHash>`로 구분한다. 같은 beat여도 부모 경로, RNG, 비용, 소지품, 발화, 공개 정보, 생성 문장이 다른 checkpoint를 합치지 않는다.

DAG를 만드는 규칙:

1. 실제로 번 정지점에서 한 choice, 한 목표/접근의 결과 또는 한 conversation을 검증 단위로 잡는다.
2. 그 액션 이후 고정 next 사슬을 다음 genuine pause/ending까지 펼친다. JSON의 각 case.expected에 `trail`과 `guards`가 있다. 조건부 next는 **위에서 먼저 참인 route**를 따른다. 뒤 route는 앞 조건이 거짓이라는 의무도 갖는다(`engine.ts:714`).
3. 선택지 66건, 목표별 crit/hit/mixed/miss 152건, 표준 접근별 140건, improv/improv_bold의 명시 결과 66건, 직접 conversation 2건을 구분한다. 총 426개 기호 전이 case다. 서로 동시에 독립 run을 뜻하지 않는다. 하나의 실제 trace가 여러 의무를 충족할 수 있다.
4. 펼쳐진 앞으로 전이 647건은 `forwardEdges`에 있다. 단순 동일 pause 재방문 2건(`ep02_unlock`의 local improv hit/mixed)을 분리하면 순환이 없다. idle 13개는 patience/세계 행동/동일 pause 재방문을 따로 기술했다. local 재방문은 대표 1회 확인 뒤 steady/listen 목표로 진행한다. collapse 검증은 실제 세계 행동과 머뭇 문턱까지 따로 간다.
5. 조건·대가·장면 변화·정보 공개는 해당 edge에 붙는 checkpoint 의무다. 전체 플래그나 모든 자연어의 Cartesian product를 만들지 않는다. 지식/아이템처럼 후속 조건이 실제로 읽는 차이는 그 소비 지점까지 반드시 운반한다. 모델이 각 trace에서 만든 문장은 합류를 이유로 검수를 생략하지 않는다.

정적 next 참조는 739건, 시작에서 기호적으로 연결된 비트는 638개다. 나머지 `e_quit`, `x_unmasked`, `x_spy_cut`, `x_reckless`, `x_collapse`는 quit/fate의 전역 전이 목적지다. 그래프에서 빠진 사라진 비트가 아니다. 이 계산은 조건의 실제 동시 충족이나 판정 tier의 실제 획득을 증명하지 않는다.

공유 본선과 필요한 상태 차이는 다음 네 운반 정책으로 시작한다. 네 개는 전체 경로 수가 아니라 **실제 후속 소비 조건을 나눈 기본 정책**이다.

| 정책 | 실제 fork와 override | 끝까지 운반할 사실 |
|---|---|---|
| A 표준·긴 답 | 실제 `ep04_i04_distance/retort`, `ep05_c053/ep05_reply_original` | 기존 밤 사건/입맞춤 이력과 실제 지난밤 발화 → 6화 표준 진입 |
| B 표준·짧은 답 | A에서 실제 번 `ep05_c053` → `ep05_reply_short` | 밤 사건은 있었으나 말하지 않은 지난밤 대화를 6화에서 만들지 않음 |
| C 거리 hit·긴 답 | 실제 `ep04_i04_distance/distance` → `ep04_distance_free`, hit 관측; 5화 긴 답 | 거리를 확보한 별도 밤 이력 → 5화의 모든 거리 분기, 입맞춤 회상 제외 |
| D 거리 mixed·짧은 답 | 실제 거리 시도에서 mixed 관측; 5화 짧은 답 | 거리 성공 + 실제 독립 비용, 6화 짧은 답 진입까지 유지 |

목표 tier는 희망값이다. checkpoint의 RNG를 바꿔 hit/mixed를 만들지 않는다. 실제 게임이 제공한 행운을 쓰면 원래 tier, 바꾼 tier, 행운 비용과 남은 비용을 모두 기록한다. 원하는 결과를 관측하지 못한 셀은 미실시로 남긴다. 새 게임 seed를 바꾸는 경우도 시작부터 실제로 플레이해야 한다.

6화의 6개 두 갈래 선택이나 10화의 각 독립 발화 선택은 해당 earned checkpoint에서 형제 fork를 한 번씩 검증하면 된다. 2의 거듭제곱 형태로 모든 조합을 만들 이유는 없다. 반대로 `ep10_c034/ep10_name_only`는 `ep10_travel_choice`라는 별도 정지점을 열기 때문에 이름 상세 경로와 따로 확인한다. 각 fork는 아래 37개 정지점 표 및 JSON의 부모 의존성을 따른다.

## 4. 선택지 66개 전체

모든 행의 모든 choice를 한 번 이상 실제로 선택해야 한다. source choice의 lines와 형제 choice의 lines, 이어지는 공통 고정 lines를 함께 읽어 선택하지 않은 말이 뒤에 덧붙지 않는지 확인한다. 직접 입력 경로는 choice를 누른 것으로 세지 않는다.

| 정지점 | choice ID → 즉시 next |
|---|---|
| `b02_observed` | `approach → b03_ask`<br>`avoid → r3_slip` |
| `e_curious` | `continue_chapter → ep02_prison_wake` |
| `e_survivor` | `continue_chapter → ep02_prison_wake` |
| `ep02_court_boundary` | `continue_ep03 → ep03_c001` |
| `ep03_c046` | `ep03_i01_protest → ep03_c047`<br>`ep03_i01_ask → ep03_c047` |
| `ep03_c049` | `ep03_i02_quiet → ep03_c050`<br>`ep03_i02_others → ep03_c050` |
| `ep03_c061` | `continue_ep04 → ep04_c001` |
| `ep04_i01_scout` | `guards → ep04_scout_guards`<br>`passage → ep04_scout_passage`<br>`decoration → ep04_scout_decoration` |
| `ep04_i03_origin` | `conceal → ep04_c051`<br>`custom → ep04_origin_free`<br>`silent → ep04_origin_silence` |
| `ep04_i04_distance` | `retort → ep04_c056`<br>`distance → ep04_distance_free` |
| `ep04_boundary` | `continue_ep05 → ep05_entry` |
| `ep04_distance_boundary` | `continue_ep05 → ep05_entry` |
| `ep05_c020` | `ep05_role_original → ep05_c021`<br>`ep05_role_rest → ep05_role_rest` |
| `ep05_c045` | `ep05_summons_original → ep05_summons_original`<br>`ep05_summons_accept → ep05_summons_accept` |
| `ep05_c053` | `ep05_reply_original → ep05_c054`<br>`ep05_reply_short → ep05_reply_short` |
| `ep05_boundary` | `continue_ep06 → ep06_c001` |
| `ep06_c003` | `ep06_decline_direct → ep06_c004`<br>`ep06_decline_pause → ep06_decline_pause` |
| `ep06_c008` | `ep06_purpose_direct → ep06_c008_reply`<br>`ep06_purpose_pause → ep06_purpose_pause` |
| `ep06_c035` | `ep06_origin_direct → ep06_c036`<br>`ep06_origin_pause → ep06_origin_pause` |
| `ep06_c038` | `ep06_question_direct → ep06_c039`<br>`ep06_question_pause → ep06_question_pause` |
| `ep06_c046` | `ep06_politics_direct → ep06_c046_reply`<br>`ep06_politics_pause → ep06_politics_pause` |
| `ep06_c056_response` | `ep06_travel_direct → ep06_c057`<br>`ep06_travel_pause → ep06_travel_pause` |
| `ep06_c065` | `continue_ep07 → ep07_c001` |
| `ep07_c063` | `continue_ep08 → ep08_c001` |
| `ep08_c024` | `ep08_c024_ask → ep08_c025`<br>`ep08_c024_home → ep08_c025` |
| `ep08_c057` | `ep08_c057_quiet → ep08_c058`<br>`ep08_c057_tell → ep08_c058` |
| `ep08_c062` | `continue_ep09 → ep09_c001` |
| `ep09_c063` | `ep09_protest → ep09_protest`<br>`ep09_silent → ep09_silent` |
| `ep09_c080` | `ep09_breath → ep09_breath`<br>`ep09_gaze → ep09_gaze` |
| `ep09_c084` | `continue_ep10 → ep10_c001` |
| `ep10_c026` | `ep10_hair_source → ep10_c027`<br>`ep10_hair_hold → ep10_c028` |
| `ep10_c029` | `ep10_family_tell → ep10_family_source`<br>`ep10_family_hold → ep10_c030` |
| `ep10_c034` | `ep10_name_tell → ep10_name_source`<br>`ep10_name_only → ep10_travel_question` |
| `ep10_c043` | `ep10_travel_retort → ep10_c044`<br>`ep10_travel_hold → ep10_c047` |
| `ep10_c052` | `ep10_title_behi → ep10_title_source`<br>`ep10_title_king → ep10_c055` |
| `ep10_c058` | `ep10_contact_silent → ep10_c059`<br>`ep10_contact_refuse → ep10_distance_refusal`<br>`ep10_contact_escape → ep10_withdraw` |
| `ep10_travel_choice` | `ep10_travel_retort → ep10_c044`<br>`ep10_travel_hold → ep10_c047` |

`ep03_c046` 직접 입력은 `ep03_i01_custom_tail`, `ep03_c049` 직접 입력은 `ep03_i02_custom_tail`로 간다. 실제 Action은 `interject`이며 현재 scene, 실제 shown, 실제 pending을 쓴다. 엔진 계약상 대사를 다 읽고 pending이 빈 경우에만 conversation이 된다(`engine.ts:1211`). 이 경로에는 선택하지 않은 아시나의 항의/질문을 넣지 않는다.

확인할 구체적 잔여 문제: `ep08_c024_home`도 `ep08_c025`로 간다. `ep08_c025`의 “하렘은 왜 이렇게 큰 걸까?”, “누르는 그 이유를 알아?”는 조건 없는 고정 줄이다. 즉 사람에 관한 대체 질문을 고른 뒤에도 크기 질문이 추가 출력되는 구조다. 근거: `ep08_harem.yaml:1051–1079`, `engine.ts:729–745`. 이번 읽기 전용 조사에서 고치지 않았다. 미선택 대사 배제 의도와 충돌하는지 리드가 판정할 항목이다.

## 5. 자유 목표 38개와 별도 비용

표의 next는 **해당 목표가 실제로 지원·선택되어 crit/hit/mixed로 성취된 뒤**의 경로다. 실패 목적지는 JSON goalCases/approachCases의 실제 technique별로 다르다. 같은 이름의 approach와 goal을 자동 동일시하면 안 된다. 목표가 없는 표준 접근은 `finishResolve`에서 해당 goals의 효과를 자동 적용하지 않는다(`engine.ts:1786`). 특히 `b08_gaze/flee`, `r2_bind/flee`, `r4_prove/flee`, `r5_claim/flee`는 해당 flee 표준 접근이 없으므로 지원 목표를 해석한 실제 즉흥 입력 경로가 필요하다.

G0 = `의심 < 10 && !flag:체력_쓰러짐 && !flag:위험_실패 && flag:머뭇 < 3 && (!flag:귀찌_설명 || 귀찌 > 0)`라는 의미의 원본 DNF 조건. 파서는 괄호 문법을 지원하지 않으므로 이 표현을 새 조건식으로 주입하지 않는다. JSON에는 원본 DNF를 그대로 보존했다. G1 = G0 + `item:map && item:magic_bag`. G2 = goal.if 없음. G2도 실제 부모 경로와 장면 범위를 건너뛸 수 있다는 뜻은 아니다.

| beat | goal | 성취 next | mixed의 독립 price 후보 | 조건 |
|---|---|---|---|---|
| `b02_people` | `run` | `b03_ask` | `mind_strain` | G0 |
| `b02_people` | `watch` | `b02_observed` | `mind_strain` | G0 |
| `b02_people` | `avoid` | `r3_slip` | `mind_strain` | G0 |
| `b05_why` | `beauty` | `b06_swing` | `mind_strain` | G0 |
| `b05_why` | `plead` | `b06_swing` | `mind_strain` | G0 |
| `b05_why` | `bluff` | `r4_prove` | `mind_strain` | G0 |
| `b05_why` | `noble` | `r5_claim` | `mind_strain` | G0 |
| `b05_why` | `resist` | `r3_flee` | `mind_strain` | G0 |
| `b05_why` | `bag` | `b06_swing` | `mind_strain` | G1 |
| `b06_swing` | `dodge` | `b07_rule` | `mind_strain` | G0 |
| `b06_swing` | `block` | `b07_rule` | `mind_strain` | G0 |
| `b06_swing` | `flee` | `r3_flee` | `mind_strain` | G0 |
| `b08_gaze` | `stare_back` | `b09_verdict` | `mind_strain` | G0 |
| `b08_gaze` | `retort` | `b09_verdict` | `mind_strain` | G0 |
| `b08_gaze` | `hide_earring` | `b09_verdict` | `mind_strain` | G0 |
| `b08_gaze` | `flee` | `r3_flee` | `mind_strain` | G0 |
| `r2_bind` | `deny` | `e_spy` | `mind_strain` | G0 |
| `r2_bind` | `cover` | `e_spy` | `mind_strain` | G0 |
| `r2_bind` | `silent` | `e_spy` | `mind_strain` | G0 |
| `r2_bind` | `flee` | `r3_flee` | `mind_strain` | G0 |
| `r3_dusk` | `read` | `r3_night` | `mind_strain` | G0 |
| `r3_dusk` | `drink` | `r3_night` | `mind_strain` | G0 |
| `r3_dusk` | `shelter` | `r3_night` | `water_spill` | G0 |
| `r4_prove` | `guide` | `r4_walk` | `mind_strain` | G0 |
| `r4_prove` | `wits` | `r4_walk` | `mind_strain` | G0 |
| `r4_prove` | `charm` | `r4_walk` | `mind_strain` | G0 |
| `r4_prove` | `flee` | `r3_flee` | `mind_strain` | G0 |
| `r5_claim` | `manners` | `r5_price` | `mind_strain` | G0 |
| `r5_claim` | `knowledge` | `r5_price` | `mind_strain` | G0 |
| `r5_claim` | `bluster` | `r5_price` | `mind_strain` | G0 |
| `r5_claim` | `flee` | `r3_flee` | `mind_strain` | G0 |
| `ep02_unlock` | `steady` | `ep02_confidence` | `lock_fatigue`, `lock_time` | G2 |
| `ep02_question` | `conceal` | `ep02_call` | `conceal_scrutiny`, `question_fatigue` | G2 |
| `ep02_question` | `bargain` | `ep02_call` | `bargain_attention`, `question_fatigue` | G2 |
| `ep02_question` | `escape` | `ep02_city_escape` | `escape_scrape`, `escape_fatigue` | G2 |
| `ep04_i02_accusation` | `ep04_heard` | `ep04_c034` | `ep04_i02_accusation_strain` | G2 |
| `ep04_origin_free` | `ep04_origin_scope` | `ep04_c051` | `ep04_origin_free_strain` | G2 |
| `ep04_distance_free` | `ep04_keep_distance` | `ep04_distance_c056` | `ep04_distance_free_strain` | G2 |

각 목표의 동작 원문은 JSON `goalDefinitions[].text`, 후보 입력은 `goalCases[].action`에 있다. 이 입력은 실제 모델이 어떤 target/approach로 읽었는지 확인해야 하는 제안이다. 목표 ID를 직접 주입하는 명령이 아니다. canonical-first에는 짧은 원문 예시 입력을 따로 제공했다.

모든 목표의 hit와 mixed에서 성취 effect와 실제 next를 각각 확인한다. `engine.ts:1786–1802`는 목표 effect/next를 비용보다 먼저 확정하고 `1830–1855`에서 결과 효과와 비용을 적용한다. hit/crit에는 price가 없다. crit는 별도 결과가 없을 때 hit의 좋은 변화 증폭/정신력 회복을 쓰므로 명시된 원본 hit JSON과 최종 수치가 같다고 단정하지 않는다.

mixed는 목표 성취를 취소하지 않는 soft 비용 1건이다. `scenario.ts:238–257`에서 soft의 아이템 상실·탈주 감소·false 플래그를 금지한다. `prices.ts:30`에서 실제 조건·once·spoken·이미 사용한 후보·아이템 관련 우선순위를 검사한다. 바닥 수치 때문에 실제 지불이 없는 명목 비용을 통과로 세지 않는다. miss는 hard 우선 후보와 실제 효과를 기록한다. 인라인 손상과 price가 같은 피해를 중복 차감하지 않는지도 구분한다.

특히 `ep04_keep_distance`의 hit와 mixed는 모두 `ep04_distance_kept=true`, `ep04_distance_c056`에서 시작하는 별도 경로와 `ep04_distance_boundary`를 거친다. mixed의 `ep04_distance_free_strain`은 조건 `정신력 > 0`, 정신력 -1이다. miss는 `ep04_c056 → ep04_boundary`로 간다. 성공한 거리를 접촉·눕힘·귓가 접근·포획으로 취소하면 실패다. 5화의 별도 거리 장면과 6화 진입까지 상태를 검증한다.

성공한 avoid/flee/도시 escape도 해당 next에서 실제로 끝나거나 탈출 경로로 가야 한다. “성공”을 말한 뒤 강제로 포획하지 않는다. 전역 체력 포획과 fate의 조건은 별도 의무이며 성공 직전 이미 위기가 있었다면 그 사실과 목표 지원 조건을 함께 검수한다.

## 6. 순서 있는 조건 경로 전체

| beat | 위에서부터 최초로 참인 경로 |
|---|---|
| `b02_people` | `flag:도주` → `r3_slip`<br>`flag:다가감 || flag:길_물음` → `b03_ask`<br>`그 외` → `b03_met` |
| `b05_why` | `flag:도주` → `r3_flee`<br>`flag:거래` → `r4_prove`<br>`flag:신분` → `r5_claim`<br>`그 외` → `b06_swing` |
| `b06_swing` | `flag:도주` → `r3_flee`<br>`그 외` → `b07_rule` |
| `b09_verdict` | `의심 >= 6` → `r2_bind`<br>`집착 >= 4` → `e_curious`<br>`그 외` → `e_survivor` |
| `ep05_entry` | `flag:ep04_distance_kept` → `ep05_c010`<br>`그 외` → `ep05_c001` |
| `ep05_c031` | `flag:ep04_distance_kept` → `ep05_distance_c032`<br>`그 외` → `ep05_c032` |
| `ep05_c033` | `flag:ep04_distance_kept` → `ep05_c037`<br>`그 외` → `ep05_c034` |
| `ep05_c051` | `flag:ep04_distance_kept` → `ep05_distance_c052`<br>`그 외` → `ep05_c052` |
| `ep06_c001` | `flag:ep05_시선답변 && !flag:ep05_지난밤답변 && !flag:ep05_지난밤되물음` → `ep06_c005`<br>`그 외` → `ep06_c002` |

각 route의 true/false 및 앞 route false를 실주행 상태로 증명한다. 280개 전체 조건 occurrence는 JSON `conditionalCases`에 경로별로 남겼다. 여기에는 고정 줄 조건, 목표 가능 조건, 접근 보정, price, facts, sprites/CG alt, knowledge, callbacks 등의 조건도 있다. “조건 문자열을 읽었다”는 것과 실제 witness를 얻었다는 것은 다르다. 실제 부모 경로에서 불가능한 참/거짓 셀은 근거를 붙여 도달 불가로 기록하고 임의 상태로 맞추지 않는다.

5화 짧은 답은 `ep05_reply_short`의 `sets:ep05_시선답변`을 실제 출력한다. 긴 답에서 출력되는 `ep05_지난밤답변`, `ep05_지난밤되물음`은 말하지 않았는데 세우면 안 된다. 6화의 두 첫 줄도 각 if를 만족한 것만 나온다. 짧은 답 후 원작 긴 문답을 재생하거나 없는 지난밤 발화를 회상하면 실패다.

장면 검사도 포함한다: `b02_people`의 altered `closer/glare`, interrupt `sandstorm/strap`; `r3_dusk`의 altered `warm_rock/clouds`, interrupt `howl/footprints`, 각 unchanged 경우다. 2개 비트의 8개 변형 + 2개 unchanged는 새 게임부터 번 seed/장면 검사 결과로 기록한다. callback 5개, foreshadow 2개의 발동/비발동도 JSON 원문 조건 및 setter를 따른다. 이들 10개 장면 검사 셀을 모든 목표/선택지와 곱하지 않는다.

## 7. 진짜 독립 결말과 계속 경계

현재 실제 ending은 아래 **11개**다. 이것이 전체를 임의의 11개 route로 줄여도 된다는 뜻은 아니다. 한 ending에 들어오는 목표/조건/대화의 차이는 각각 별도 의무다.

| beat / ending ID | 실제 도달 정책·조건 |
|---|---|
| `e_quit / quit` | 실제 입력 “게임 종료” 등의 확인 창에서 `confirm ok:true`; 거절도 별도 동작 확인 |
| `e_road / road` | b02 avoid 또는 지원 flee 성취 → r3_slip/r3_flee → r3_dusk의 read/drink/shelter → r3_night. 실제 생존/위기 상태를 유지 |
| `e_deal / deal` | b05 bluff 성취 → r4_prove의 guide/wits/charm → r4_walk. flee를 고르면 다른 독립 경로 |
| `e_value / value` | b05 noble 성취 → r5_claim의 manners/knowledge/bluster → r5_price. 명목 성공을 포획 본선으로 되돌리지 않음 |
| `e_spy / spy` | b09에서 의심 ≥6이 먼저 선택되어 r2_bind → deny/cover/silent. 또는 후속 시작 전 실제 체력 쓰러짐의 collapseTo. 두 원인을 구분 |
| `x_unmasked / unmasked` | `!flag:후속_시작 && flag:귀찌_설명 && 귀찌 <= 0` 및 실제 경고/위기 처리 |
| `x_spy_cut / spy_cut` | `!flag:후속_시작 && 의심 >= 10` 및 경고 유예 처리 |
| `x_reckless / reckless` | `!flag:후속_시작 && flag:위험_실패`; 실제 위험 확인 뒤 강행한 실패. flag 직접 주입 금지 |
| `x_collapse / collapse` | `!flag:후속_시작 && flag:머뭇 >= 3`; 실제 무시도/세계 행동으로 도달. 무시도 자체에 주사위 금지 |
| `ep02_city_escape / ep02_city_escape` | ep02_question의 escape 목표 hit/mixed → 도시 이탈. 계속 단추를 만들지 않음 |
| `ep10_end / ep10_boundary` | 10화 세 접촉 선택의 실제 각각 다른 이력 후 도달. 이후 연결은 미확정이며 종료 |

사막의 체력은 처음 0이 된 타격과 **0에서 다음 별도 음수 피해**를 구별한다. 후자에서 `체력_쓰러짐`이 생기며 collapseTo는 `e_spy`다(`engine.ts:1940–1975`). `x_collapse`는 체력 포획과 다른 머뭇 결말이다. 후속이 시작되면 기존 사막 fate는 `!flag:후속_시작`으로 비활성화된다.

아래 11개는 독립 ending이 아니라 **실제 합성에서 ending이 제거된 계속 경계**다. 줄과 선택지 효과가 적용된 뒤 실제 단추로 계속한다.

| beat | 단독 파일의 ending | 합성 choice | 다음 화 시작 |
|---|---|---|---|
| `e_curious` | `curious` | `continue_chapter` | `ep02_prison_wake` |
| `e_survivor` | `survivor` | `continue_chapter` | `ep02_prison_wake` |
| `ep02_court_boundary` | `ep02_court_boundary` | `continue_ep03` | `ep03_c001` |
| `ep03_c061` | `ep03_boundary` | `continue_ep04` | `ep04_c001` |
| `ep04_boundary` | `ep04_boundary` | `continue_ep05` | `ep05_entry` |
| `ep04_distance_boundary` | `ep04_distance_boundary` | `continue_ep05` | `ep05_entry` |
| `ep05_boundary` | `ep05_boundary` | `continue_ep06` | `ep06_c001` |
| `ep06_c065` | `ep06_internal_end` | `continue_ep07` | `ep07_c001` |
| `ep07_c063` | `ep07_internal_end` | `continue_ep08` | `ep08_c001` |
| `ep08_c062` | `ep08_boundary` | `continue_ep09` | `ep09_c001` |
| `ep09_c084` | `ep09_internal_end` | `continue_ep10` | `ep10_c001` |

`ep06_c065`, `ep07_c063`, `ep09_c084`는 파일명에 internal_end가 있었다는 이유로 최종 ending 처리하면 안 된다. 반대로 `ep10_end`는 현재 실제 ending이다. 드라이버는 파일의 옛 ending 명칭이 아니라 로드된 beat.ending을 판정한다.

## 8. 가방·지도 손실과 7/9/10화 부분 반환

소유권 변경은 JSON `possessionEffects`의 6개 경로 전체와 컨테이너 규칙으로 확인한다.

- `beats/b05_why/free/prices/4/effects`: lose `magic_bag`
- `beats/r3_dusk/free/prices/4/effects`: lose `map`
- `beats/r4_prove/free/prices/5/effects`: lose `map`
- `beats/e_spy/lines/2/effects`: lose `magic_bag`
- `beats/ep03_c008/effects`: lose `magic_bag, map`
- `beats/ep04_c001/effects`: lose `magic_bag, map`

`b05_why`의 hard 가방 상실은 지도 미노출이면 지도도 잃는다. `map.container.unless = flag:지도_꺼냄 || flag:짐_쏟음`인 실제 두 문맥을 구분한다. 이미 꺼낸 지도와 가방 안 지도는 같은 소지 상태가 아니다. `r3_dusk`, `r4_prove`의 지도 손실 price도 따로 기록한다. 3화 목욕과 4화 진입은 가방·지도를 명시적으로 제거한다.

7화 `ep07_c003/lines/1/effects`는 **`ep03_짐_수중없음=false`, `ep07_짐_부분반환=true`만 설정**한다. 현행 열 화 전체에 `gain:magic_bag` 또는 `gain:map`은 없다. 합당한 일부 반환 서술은 가능하지만 반환품 상세, 가방/지도/치부책을 전부 가졌다는 주장, 보호 마법 때문에 열람이 불가능했다는 확정은 근거가 없다. `ep07_c004`는 보호 마법을 믿는 아시나의 독백이다.

실제 검수 창은 `ep06_c065/continue_ep07 → ep07_c063` 사이 event 전체다. c003에 state.beat를 주입하지 않는다. 9화 `ep09_c033/c035/c038/c060`, `ep09_c063`의 두 선택, `ep09_c068`을 보면서 일부 반환과 아직 조사 측에 남은 짐을 섞지 않는다. 황제 승인·나시르 발화도 item gain은 아니다. 10화 `ep10_c026/c029/c034` 및 종료까지 가방·지도를 자동 복구하지 않고 실제 공개한 머리·가족·이름만 기억으로 사용한다.

## 9. 괄호·행동·발화·정보 공개

JSON `behaviorCases`에 요청 범주 25개를 실제 beat와 후보 입력으로 붙였다. 모든 자유 입력 자리에서 입력 종류가 달라질 때의 공통 계약을 검수하고, 다음 특별 소비 지점을 별도로 확인한다.

| 범주 | 실행할 자리·입력 | 관찰 의무 |
|---|---|---|
| 행동 | b02_people `(사람들의 눈을 피해 옆으로 몸을 뺀다)` | 실제 목표 avoid; 말하지 않은 대사 생성 금지 |
| 발화 | b05_why `저는 길을 잃었어요.` | 발화를 신체 행동으로 변환 금지. b02는 addressed 규칙으로 멀리 있는 사람에게 부르는 말이 접근 판정으로 바뀔 수 있으므로 구분 |
| 혼합 | b08_gaze `(머리카락으로 귀찌를 가린다) 그렇게 빤히 보지 마세요.` | 실제 동작과 실제 발화를 각각 받음 |
| 무시도 | b02_people `(가만히 있는다)`; 거리 자유 자리 `(눈물이 흐른다)` | 주사위 없음. 세계 행동/머뭇은 실제 계약대로 진행; 임의 목표 성공/길 묻기 강제 금지 |
| 세계 밖 | b05_why `(핸드폰을 꺼내 전화를 건다)` | 인물 반응으로 넘기고 스토리 판정/수치/소유 변화 없음; 현대 물건을 소지·기억으로 만들지 않음 |
| 큰 행동 | b05_why `(그 남자의 뺨에 갑자기 입을 맞춘다)` | 행동 크기에 맞는 결과와 인물 반응 전체. 구현되지 않은 지속 성취를 local로 숨겨 축소 금지 |
| 괄호 오류 | 미닫힘, 빈 괄호, 중첩, 서로 다른 전각 짝 | parseStoryInput 오류 안내; 모델/판정/스토리 변경 없이 재입력 |
| 전각 | b08_gaze `（머리카락으로 귀찌를 가린다）` | 정상 행동 |
| 게임 질문 | 실제 GM 질문 모드의 `어떻게 진행하는 게임이야?` | 이야기 인물이 게임 규칙을 아는 발화로 처리 금지 |
| 공개와 부정 | b05_why에서 “공녀가 아니라…” / “그분이 공녀라고요?” / 실제 “저는 웰든 공녀예요.” | 부정·질문·독백·괄호 안 무발화를 공개로 오인하지 않음; 실제 공개만 identity 위험/효과 적용 |

`text.ts:23`의 parseStoryInput은 괄호 안 action과 밖 speech를 분리한다. `assertedSpeech`와 `discloses`는 실제 발화·부정·질문을 구분한다. 오류 또는 아직 모르는 이름을 입력했을 때 플레이어 말 자체를 다른 표현으로 고쳐 쓰지 않는다. 수정할 이유와 재입력 안내를 낸다.

숨김 지식의 17개 공개 gate를 모두 대조한다. 공개 setter의 **직전과 최초 공개 줄 직후**를 fresh event observer로 확보한다. 한 act 끝 상태로 그 act의 앞줄도 이미 공개됐었다고 역추정하면 안 된다.

| 지식 ID | 열리는 조건 | 현재 setter 근거 |
|---|---|---|
| `fesian` | `flag:페시안_앎` | `beats/ep02_prison_country/lines/1/sets` |
| `man_title` | `flag:시하드_호칭` | `beats/ep02_call/lines/0/sets` |
| `man_true` | `flag:ep04_name_known` | `beats/ep04_c040/lines/0/sets` |
| `man_ruler` | `flag:ep04_ruler_known` | `beats/ep04_c041/lines/0/sets` |
| `man_la_kun` | `flag:ep04_title_known` | `beats/ep04_c042/lines/1/sets` |
| `ep03_harem` | `flag:ep03_하렘_앎` | `beats/ep03_c040/lines/4/sets` |
| `jail` | `flag:감옥_앎` | `beats/ep02_prison_window/lines/3/sets` |
| `ep05_nur` | `flag:ep05_아시나_누르소개` | `beats/ep05_c014/lines/0/sets` |
| `ep05_aira_meaning` | `flag:ep05_아시나_아이라뜻` | `beats/ep05_c017/lines/0/sets` |
| `ep06_nasir` | `flag:ep06_아시나_나시르소개` | `beats/ep06_c021/lines/1/sets` |
| `ep07_karim` | `flag:ep07_카림_이름앎` | `beats/ep07_c040/lines/3/effects/flags/ep07_카림_이름앎` |
| `ep08_jahannam_name` | `flag:ep08_r03` | `beats/ep08_c008/lines/0/sets` |
| `ep08_harem_residents` | `flag:ep08_r07` | `beats/ep08_c026/lines/1/sets` |
| `ep08_harem_marriage` | `flag:ep08_r08` | `beats/ep08_c027/lines/2/sets` |
| `ep08_clan_marriage` | `flag:ep08_r09` | `beats/ep08_c028/lines/1/sets` |
| `ep08_vizier_office` | `flag:ep08_r10` | `beats/ep08_c034/lines/0/sets` |
| `ep10_eye_notice` | `flag:ep10_눈색인지_앎` | `beats/ep10_c078/lines/3/effects/flags/ep10_눈색인지_앎`<br>`beats/ep10_distance_question/lines/2/effects/flags/ep10_눈색인지_앎` |

`knowledgeCases`에는 common/asina 지식까지 총 29개와 after 조건도 있다. `perspective:audience` 장면의 궁정 대화·왕의 보고·독자 삽입컷은 주인공이 들은 것으로 취급하지 않는다. 같은 인물끼리라도 실제 들은 말만 기억해야 한다. 3화 직접 대화의 응답자별 기억 제한과 7화 치부책 독백, 9화 보고, 10화 가족/이름의 말함 선택을 따로 검수한다.

`engine.ts:2006–2025`에서 각 고정 줄의 sets/effects가 출력 순간 적용된다. observer는 해당 fresh prefix를 사용해야 하며 resume로 재출력된 과거 줄은 그때의 실제 공개 상태 증거가 아니다(`types.ts:718`). 아직 모를 이름은 예를 들어 `ep03_c046`에서 베히다트를 직접 지칭했을 때와, `ep04_name_known`을 실제로 얻은 후를 비교한다.

## 10. 저장·복원과 실제 화면 검증의 분리

저장은 실제로 번 비종결 pause 50개, 실제 만들어진 pendingIntent/pendingRisk/pendingLuck 창, 실제 결말에서만 만든다. 각 snapshot에 원본 run의 start seed, 모든 행동·입력, 부모 checkpoint, 콘텐츠/모델 지문과 변조하지 않은 state를 남긴다. rng/flags/items/beat/free/said/spoken/preempted/공개 기억/pending/log를 그대로 보존한다. offline/FakeGm/endpoint fixture는 이 계보에 들어갈 수 없다.

`engine.ts:329` resume은 enter를 다시 실행하지 않는다. 등장 효과·귀찌 소모·아이템 손실·지식 플래그·대가를 한 번 더 적용하지 않는지 검사한다. pending 창이 사라져 다음 “응”이 보이지 않는 확인에 사용되지 않는지도 확인한다. 복원된 줄의 재표시와 이후 실제 중복 발화는 구분한다. JSON saveContract에 항목을 남겼다.

엔진 QA로 인정할 것: 실제 Action/Step/observer/log, 상태 변화, 분기 조건, 목표/tier/price, 종료, save/resume 계보. 이것만으로 UI/frame QA를 통과했다고 하지 않는다.

실제 UI에서 별도로 확인할 것: 화면 대사 진행 중 저장/복원 위치, 남은 pending 대사, 선택지/질문 모드 표시, 사용자에게 보이는 공개 시점, 그림 전환·누락·검은 프레임·중복 줄. PC 실제 플레이 및 차가운 캐시 전환 원본 프레임이 필요하다. 이번 조사에서 화면 검증은 실행하지 않았다.

## 11. 고정 줄·생성 문장·그림의 검수 장부

**고정 줄:** JSON fixedLineReview의 1785개 occurrence를 각각 source pointer와 text로 식별한다. 현재 플레이어 경로와 대사 조건, 원작 컷, 인물/표정/복장/사건 순서/공개 지식을 대조한다. 동일 문장이라도 다른 branch/fallback 위치는 별도 occurrence다. fallback·대가·대체 분기·후속 연결 줄도 검수 대상이다. 비어 있는 그림 line도 생략하지 않는다. 이번에는 원작 원문 컷 대조를 하지 않았으므로 원작 충실성 통과는 0건이다.

**생성 문장:** 아직 0건이다. 앞으로 발생하는 모든 narrate/talk/interject/odd/ask의 **각 문장**을 run/checkpoint/action/call/reply-line/sentence ID로 남긴다. 승인 응답뿐 아니라 재시도·거절된 raw 생성문도 구분해 보관한다. 원문 전체, 문법·띄어쓰기·말투, 실제 들은 말, 공개 전후, 성공/대가, 행동 크기, 소지품, 선행 스포일러, 미선택/반복 대사를 검수한다. reply 평균 점수나 몇 문장 표본으로 대체하지 않는다. fallback은 새 생성문 통과로 세지 않고 고정 줄 장부와 대조한다.

**그림:** CG 등록 607개와 alias는 JSON artReview에 각각 있다. 승인 근거와 후보 여부는 이번 조사에서 확인하지 않았다. 파일명·등록·파서 통과·실제 표시·원작 충실성·사용자 승인·후보 채택은 각각 다른 사실이다. 승인 근거 없는 그림을 “승인 완료”라고 부르지 않는다. 원작 컷 대조와 실제 PC 프레임 QA를 별도로 해야 한다.

## 12. 아직 증명하지 않은 것

- **R01 실주행 미실시:** 이번 조사는 파서 및 정적 계약만 실행했다. 실제 모델 행동/문장/결말 도달 증거는 0건이다. 모든 동적 커버리지 셀은 미실시다.
- **R02 고정 대사 추가 출력:** ep08_c024_home도 ep08_c025로 이동한다. ep08_c025의 두 질문은 if가 없어서 사람에 관한 대체 질문 뒤에 하렘 크기 질문이 추가 출력된다. 미선택 대사 배제 의도와 충돌하는지 리드 판정 필요.
- **R03 부분 반환의 모델링 한계:** ep07_c003/lines/1/effects는 플래그만 바꾼다. 반환품 상세와 치부책 위치/열람은 미확정이며 magic_bag/map gain은 현행 캠페인 어디에도 없다. 7/9/10에서 확인 가능한 부분 반환만 인정한다.
- **R04 정지점 아닌 장면:** ep07_c003, ep09 일반 고정 장면, ep10 공개 줄 중간은 자동 통과한다. 그곳에 state.beat를 넣은 fixture는 불법이다. 실제 pause 전후 저장과 같은 act의 event observer로 검수한다.
- **R05 판정 결과 획득:** hit/mixed/miss/crit는 희망 결과이다. 같은 checkpoint의 rng를 바꾸거나 상태를 주입하지 않는다. 게임이 제시한 행운만 선택 가능하며 변환 전/후 tier와 비용을 모두 기록한다. 미관측 셀은 미실시로 남긴다.
- **R06 표준 접근과 자유 목표 구분:** 목표 38개와 접근 35개는 일대일이 아니다. approach.goal이 없는 표준 접근은 같은 이름의 goals 항목을 자동 적용하지 않는다. target 실제 해석과 finishResolve의 목표 적용 여부 또는 명세상 성취 동등성을 따로 기록한다.
- **R07 원작과 그림 승인:** 원작 원문 컷 대조, 그림 후보/승인 판정, UI와 프레임 재생은 이번 조사에서 하지 않았다. 파서가 CG alias를 받아들였다는 사실은 승인/시각 적합성 증거가 아니다.
- **R08 반복 및 무한 표현:** ep02_unlock local hit/mixed와 idle은 같은 pause를 재방문할 수 있다. 대표 1회 재방문 후 steady/listen 지원 목표로 진행한다. 무한 대화/자연어 전체를 유한 검증했다고 주장하지 않는다.
- **R09 상태별 도달성:** 정적 next 그래프 638개 + 전역 quit/fate 목적지 5개는 구조 참조이며 모든 조건 조합의 실제 도달성을 증명하지 않는다. earned witness 없는 조건 셀은 미확인이다.

따라서 이번 산출물의 완료 기준은 **현행 구조와 검수 의무를 빠짐없이 식별한 것**이다. 실모델 완주, 모든 조건 witness, 원작/문장/UI/프레임/그림 승인의 통과 상태는 이후 실제 증거가 생긴 셀만 갱신해야 한다. 전체 READY 판정은 하지 않는다.

