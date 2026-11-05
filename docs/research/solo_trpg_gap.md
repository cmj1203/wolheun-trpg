# 솔로·GM 진행 규칙과 engine.ts 처리 비교 (2026-11-05, 중단본)

> **상태: 중단본.** 크레딧이 떨어져 작업 도중 멈췄다. 새 1차 자료(Mythic 2판, Ironsworn 공식 PDF, Apocalypse World, Lone Wolf/Project Aon, Blades SRD 추가 쪽)를 조사하던 하위 에이전트 3개는 결과를 내기 전에 껐다. 그래서 아래 규칙 쪽 근거는 **저장소에 이미 받아 둔 원문**(`docs/research/sources/`)과 그 원문을 옮긴 `solo_trpg_study.md`에서만 가져왔다. Apocalypse World와 Lone Wolf는 이번에 1차 자료를 읽지 못했다(아래 '확인 못 한 것' 참고). 엔진 쪽은 코드를 직접 읽었고, `--no-llm` 경로(`LocalGm(null)`)로 직접 돌려 확인했다.

## 근거

| 약칭 | 파일(저장소) | 성격 |
|---|---|---|
| Ironsworn | `sources/ironsworn_moves.txt` (elstiko.github.io/ironsworn) | 팬 사이트에 옮긴 무브 원문. 공식 PDF와 대조하지 못함 |
| Blades 판정·결과·시계 | `sources/bitd_action_roll.txt`, `bitd_consequences.txt`, `bitd_clocks.txt` (bladesinthedark.com SRD) | 1차(공식 SRD) |
| DW | `sources/dw_gm.txt` (dungeonworldsrd.com) | Apocalypse World에서 나온 게임. **AW 원문이 아니다** |
| Mythic | `sources/mythic_chaos.txt` (oldhobsgameroom 블로그) | 2차(블로그 요약). 공식 책과 대조하지 못함 |
| Alexandrian | `sources/alex_three_clue.txt`, `alex_pacing.txt` | 2차(GM 운영 글) |

옮긴 원문 문장(모두 위 파일과 `solo_trpg_study.md`에 있다):
- Ironsworn Face Danger: "When you attempt something risky or react to an imminent threat, envision your action and roll."
- Ironsworn Ask the Oracle: "Draw a conclusion: Decide the answer based on the most interesting and obvious result." / "Ask a yes/no question: Decide the odds of a 'yes', and roll…"
- Blades: 판정 1단계 "The Player States Their Goal". 7~9 대가에 대해 "Don't inflict a complication that negates a successful roll".
- DW: "Play to find out what happens". "A soft move ignored becomes a golden opportunity for a hard move." "Never speak the name of your move". GM 무브 "Show signs of an approaching threat".
- Mythic(블로그 요약): 장면을 시작할 때 d10을 카오스 팩터와 비교한다. 카오스 팩터 이하이고 홀수면 바뀐 장면(altered), 짝수면 끼어든 장면(interrupt). 카오스 팩터는 **장면이 끝날 때** PC가 상황을 쥐고 있었는지에 따라 오르내린다.

## 엔진 확인 방법

- 코드 읽기: `app/src/engine/engine.ts` 전부, `dice.ts`, `prices.ts`, `app/src/gm/rules.ts`, `app/content/ep01_desert.yaml`의 규칙 묶음(foreshadow·fates·danger·identity·refuse·callbacks).
- 직접 실행(저장소 밖 임시 스크립트, `LocalGm(null)` = `--no-llm` 경로, 선택지는 첫 번째 것, 시드 1~7):
  - "모르겠다"를 넣으면 **시드 1~6 모두** 판정이 굴렀다(`ROLL[모르겠다 …]`). 시드 7에서는 b05에서 "저는 웰든 공녀예요" 다음에 "모르겠다"를 넣자 7~9가 나왔고, 대가로 의심이 10이 되어 `x_spy_cut` 결말로 갔다.
  - b02에서 "음…"을 거듭하자 위협 징조 → 압박 → 무릎 징조 순서로 나왔다. 그 뒤 b05에서 두 번 더 말하자 쓰러짐 결말(`x_collapse`)로 끝났다.
  - "저는 웰든 공녀예요"(b05, 남자 앞): 징조 속마음 다음에 의심 +3이 붙고, **이어서** '신분과 교양을 내세운다' 판정이 굴러 대가(의심 +2)와 결과 효과(+1)가 더 붙었다. 의심은 3 → 9가 됐다.
- 쓰기만 하고 읽지 않는 플래그, 쓰이지 않는 수치는 엔진 조사 에이전트 보고를 받아 표본(`상처`, `귀찌_숨김`, `무릎_꿇림`, `탈주`, `호감`, `남자_정체_앎`, `뒤_화`)을 grep으로 다시 확인했다.

## 비교표

### A. 주사위를 언제 굴리나

| # | 규칙(출처) | engine.ts 실제 처리 | 어긋남 | 고칠 방향 |
|---|---|---|---|---|
| A1 | 위험한 것을 **시도할 때** 굴린다(Ironsworn Face Danger 첫 문장. Blades 판정은 목표 선언부터 시작) | 규칙 해석 `rules.ts:52`가 `다`로 끝나는 문장을 모두 즉흥 행동(improv)으로 본다. 그래서 "모르겠다"도 `improvRoll`(`engine.ts:1301`) → `resolve`로 가서 굴린다 | **시도하지 않겠다는 말이 판정이 된다.** 실행해 보니 시드 6개 모두 굴렀고, 한 번은 이 굴림으로 결말까지 갔다 | 엔진이 improv를 굴리기 전에 '행동 동사가 있는가'를 확인하는 관문을 둔다(`rules.ts` 쪽 분류 또는 `applyReading`). 망설이는 말("모르겠다", "글쎄", "어쩌지")은 talk로 받는다. 단위 시험에 이런 입력 묶음을 넣는다 |
| A2 | 플레이어가 하지 않은 행동은 굴리지 않는다. 플레이어가 GM을 바라보면 GM이 무브를 한다(DW: 굴림 없이 세계가 움직임) | `worldMove`(`engine.ts:1003-1018`): 무브 표를 다 쓰면(시계 무브 포함) 같은 턴에 `default_approach`로 **판정을 대신 굴린다** | 플레이어가 고르지 않은 접근으로, 플레이어가 보지 못한 능력치로 판정한다. 결과가 실패면 그 대가를 플레이어가 진다 | 대신 굴리지 말고, 하드 무브는 작가가 쓴 고정 결과로 둔다(예: 남자가 먼저 결정한다). 굴림이 꼭 필요하면 화면에 '세계가 대신 정함'을 보인다(문구는 사용자 승인 필요) |
| A3 | 한 행동에는 한 번 판정하고, 그 결과가 대가를 정한다(Blades 결과 구조) | 정체 입력: `guardRisk`(`engine.ts:793-804`)가 고정 효과(의심 +3)를 먼저 붙이고 `'go'`를 돌려준다. 그 뒤 같은 입력이 접근 판정으로 다시 굴러 대가가 또 붙는다 | 한 입력에 대가가 두 번 붙는다(실행해 보니 의심 +6). 주석(`engine.ts:68` "나머지는 주사위 없이 고정 줄로 받는다")과 동작이 다르다 | 둘 중 하나로 정한다. (a) 고정 효과만 주고 굴리지 않는다(주석대로) (b) 굴리고, 고정 효과는 판정 결과 쪽 대가로 옮긴다. 어느 쪽이든 시험으로 고정한다 |
| A4 | Mythic 장면 검사: d10과 카오스 팩터(1~9)를 비교하고, CF는 **장면 끝**에 PC가 상황을 쥐었는지로 바꾼다 | `sceneCheck`(`engine.ts:557`)는 d6과 긴장(1~6)을 비교한다. 긴장은 **판정마다** 바뀐다(`bumpTension`, `engine.ts:546`: 성공 -1, 실패 +1) | 기준이 장면이 아니라 판정이다. 긴장이 6이면 검사가 항상 걸려 100%가 된다(Mythic은 CF 9에서도 90%) | 긴장을 장면이 끝날 때 한 번만 바꾸거나 이유를 문서에 적는다. 최대값을 5로 두는 것도 생각할 수 있다. 원작 대면 장면에는 검사하지 않는다는 사용자 결정은 그대로 둔다 |
| A5 | 오라클: 대본에 없는 세계 사실은 확률을 정해 예/아니오로 굴린다(Ironsworn Ask the Oracle) | 오라클이 없다. 질문은 `askGm` → `gm.explain`(LLM)이 '아는 범위'에서 답한다 | 세계 사실을 LLM이 정한다(19차 계획 ⑩이 아직 구현되지 않음) | `ask` 가운데 수첩 밖 세계 사실을 묻는 것만 2d6 예/아니오로 정하고, 서술은 LLM에 맡긴다. 결과는 플래그로 남긴다 |
| A6 | 플레이어가 굴림과 그 의미를 본다 | `roll` 이벤트를 모두 화면에 보낸다(`engine.ts:615`). 등급 설명 `explainTier`(`:620`)는 어디서도 부르지 않는다 | 판정은 공개된다. 죽은 코드가 남아 있다 | `explainTier`를 지우거나 질문 모드로 옮긴다(사용자 규칙: 이야기 화면에 여우 줄 없음) |

### B. 시도하지 않음과 실패

| # | 규칙(출처) | engine.ts 실제 처리 | 어긋남 | 고칠 방향 |
|---|---|---|---|---|
| B1 | 소프트 무브를 무시하면 하드 무브의 기회가 된다. 경고는 **그 위협**에 대한 것이다(DW) | `머뭇`은 전역 플래그이고 장면이 바뀌어도 줄지 않는다(`bumpHesitation`, `engine.ts:489`). 무릎 징조는 판마다 한 번이다(`warnFates`, `:476`). 실행해 보니 b02에서 징조가 나오고, b05(칼 앞)에서 말 두 번 만에 쓰러짐 결말로 갔다 | 앞 장면의 망설임이 다른 위협(칼 앞)의 장면에서 경고 없이 쓰러짐으로 이어진다. 그 장면 안에서는 징조가 없었다 | 머뭇을 장면마다 새로 세거나, 장면이 바뀌면 징조를 다시 낼 수 있게 한다. 또는 b05의 하드 무브를 '쓰러짐'이 아니라 그 장면의 위협(칼)으로 둔다 |
| B2 | 7~9는 성공을 뒤집지 않는다(Blades) | `prices.ts:18`: 7~9에서는 soft 대가만 뽑는다. 로더가 soft 대가에 next·lose·탈주 감소가 없는지 검사한다(`scenario.ts:205-209`) | 규칙에 맞는다. 다만 7~9의 대가와 결과 효과가 함께 붙어 의심 문턱을 넘으면(A3 실행에서 의심 9 → 다음 7~9로 10) **7~9 연속으로 결말**이 난다 | fates 문턱을 넘긴 원인이 mixed뿐이면 문턱 바로 위에서 멈추는 규칙(`holdAboveThreshold`)을 다시 걸지 검토한다 |
| B3 | 실패해도 '아무 일도 없음'이 아니다. 이야기가 움직인다(Blades, Ironsworn Pay the Price) | 자유 입력 장면은 `turns` 기본값이 1(`scenario.ts:350`)이고 ep01은 이 값을 바꾸지 않는다. 그래서 어떤 등급이든 한 번 굴리면 장면이 끝난다 | 규칙에 맞는다(실패해도 진행한다). 대신 같은 장면에서 다시 시도하는 일은 없다 | 그대로 둔다. 문서에 적어 둔다 |
| B4 | 행동을 거절하는 것(변장 풀기 등)은 허구 안에서 막는다 | `refuse` 줄 다음 `worldMove(hard=false)`(`engine.ts:678-681`)를 부른다. talks는 늘지 않는다 | 규칙에 맞는다 | 그대로 둔다 |
| B5 | 의도가 애매하면 되묻는다(19-E 사용자 결정 '애매할 때만') | bold improv만 의도 카드를 띄운다(`engine.ts:1218`). '다른 뜻'을 고르면 아무 대가가 없다 | A1의 "모르겠다"는 bold가 아니라서 카드 없이 바로 굴린다 | A1 관문으로 해결한다 |

### C. 복선과 회수

| # | 규칙(출처) | engine.ts 실제 처리 | 어긋남 | 고칠 방향 |
|---|---|---|---|---|
| C1 | 단서는 플레이어가 **볼 수 있게** 깔아야 회수가 공정하다(Alexandrian 세 단서 규칙) | `sayGuide`(`engine.ts:1171-1183`)는 여우 줄 없이 `짚음_*` 플래그만 세운다. `remembered`(`:1125`)는 그 낱말을 쓰면 +1을 준다. '별·지도'는 b01 나레이션에 지도가 보이지만 '별'은 보이지 않는다. '보석·터번'은 b03 범위에서 찾지 못했다(b05 나레이션에 '터번'이 있다) | 깔리지 않았거나 약하게 깔린 단서에 보너스를 준다 | 복선마다 '보이는 줄'(나레이션)을 yaml에 하나씩 붙이고, 로더가 `at` 비트의 줄에 `words` 가운데 하나가 있는지 검사한다(문구 추가는 사용자 승인 필요) |
| C2 | 깐 것은 회수한다(Ashwell·Short: 가짜 선택 없애기) | 수치 `탈주`·`호감`은 자주 바뀌고 HUD에도 보이지만, 어떤 조건(`if`·`when`)도 읽지 않는다. 플래그 15개(`상처`, `귀찌_숨김`, `무릎_꿇림` 등)는 쓰기만 하고 읽지 않는다 | 보이는 수치가 결말에 영향을 주지 않는다. 깔아 놓고 회수하지 않은 셈이다 | 회수 조건을 하나씩 달거나 HUD에서 숨긴다. 로더 시험으로 '쓰기만 하는 플래그'를 경고한다 |
| C3 | 숨은 항목은 열릴 길이 있어야 한다 | `lore_wolheun.yaml`의 `남자_정체_앎`·`뒤_화`는 조건에서 읽지만 ep01 어디서도 세우지 않는다 | 열리지 않는 수첩 항목 | 2화에서 쓸 것이면 주석으로 적고, 아니면 지운다 |
| C4 | 플레이어가 한 말이 뒤에 돌아온다(DW "Ask questions and use the answers") | `callbacks` + `sayCallback`(`engine.ts:1157`): 장면마다 한 줄씩 되받는다. `inventedClaim`(`:1147`)은 부르는 곳이 없다 | 되받기는 규칙에 맞는다. 죽은 코드가 있다 | `inventedClaim`을 지운다 |
| C5 | 위협은 미리 보인다(DW "Show signs of an approaching threat") | `fates.warn` 징조, `holdAboveThreshold`로 '한 번의 실패로는 끝나지 않음'을 지킨다(`engine.ts:435-454`). `reckless`는 warn 없이 `danger.omen`(판마다 한 번)으로 대신한다 | 대체로 맞다. B1처럼 징조가 판마다 한 번이라 다른 장면에서는 다시 나오지 않는다 | B1과 같다 |

## 우선순위 제안

1. A1(망설이는 말이 판정이 됨): 결말까지 가는 버그다. 시험을 붙이기 쉽다.
2. A3(정체 입력에 대가가 두 번 붙음), A2(판정을 대신 굴림).
3. B1(머뭇이 장면을 넘어 쌓임), C1(보이지 않는 복선에 보너스).
4. C2·C3·A6·C4(회수 없는 수치·플래그, 죽은 코드), A4·A5.

## 확인 못 한 것

- Apocalypse World 원문(MC 무브 "announce future badness", fronts·countdown clocks 등), Lone Wolf(Project Aon) 규칙, Mythic 2판 공식 문장, Ironsworn 공식 PDF, Blades SRD의 fortune·resistance·devil's bargain·flashback 쪽: 조사 에이전트를 결과 전에 껐다. 셸 curl은 프록시가 막는다(bladesinthedark.com, projectaon.org 모두 403).
- LLM 경로: 모델이 없어서 "모르겠다"를 LLM이 어떻게 분류하는지는 보지 못했다. A1은 `--no-llm`과, LLM이 실패해 규칙 해석으로 돌아가는 경우에 해당한다.
- 교차 검증·자기 검토: 엔진 조사 에이전트 보고와 내가 직접 읽은 결과를 표본으로 맞춰 봤을 뿐이다. 두 번 이상 하라고 한 검토는 하지 못했다.
