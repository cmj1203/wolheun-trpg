# 대본 기계 점검 (ep01_desert · lore_wolheun) — 2026-11-05

- 도구: `app/scripts/script_audit.ts` (실행: `cd app && bun scripts/script_audit.ts`, 약 8분(상태 46,373개·수 2,750,281개)). `--json` 은 전부, `--stdout` 은 파일을 쓰지 않고 표만 낸다.
- 하는 일: `app/content/ep01_desert.yaml` 과 `app/content/lore_wolheun.yaml` 을 엔진 로더(`loadScenario`·`loadLore`)로 읽고, 엔진 규칙(`src/engine/engine.ts`)을 따라 **모든 비트·갈래·플래그·대가 조합**을 상태 그래프로 펼친 뒤 아래 여덟 가지를 찾는다.
  1. 닿지 않는 비트 2. 막다른 길 3. 세워지지 않거나 읽히지 않는 플래그 4. 쓰이지 않는 조각(조건 줄·대가·갈래·행동·보정) 5. 설정과 어긋나는 대사 6. 그때의 상태와 어긋나는 글 7. 같은 말 반복 8. 앞에서 안 나온 말이 처음 나오는 자리
- 탐색 모형은 맨 아래 '모형의 한계'에 적었다. 대본 글은 하나도 바꾸지 않았다.
- 아래 '사람 판단' 표는 자동 결과와 대본을 직접 읽은 것을 합쳐 **원작을 모르는 처음 하는 사람** 기준으로 적었다. 고칠 글 제안은 PR 본문의 '어디 · 전 → 후' 목록에 있다(사용자 승인 전에는 고치지 않음).

## 사람 판단

심각도: 상 = 처음 하는 사람이 바로 어긋남을 느낀다 / 중 = 특정 갈래에서 어색하다 / 하 = 다듬을 거리.

| # | 심각도 | 종류 | 어디 | 지금 글 | 문제 |
|---|---|---|---|---|---|
| 1 | 상 | 상태 | r2_bind 프롬프트·nudge (ep01_desert.yaml:1307–1308), e_spy (1983–1985) | 프롬프트 "손목이 묶였다. 뭐라고 답할까요?" / nudge "호위가 밧줄을 들고 다가왔다." / e_spy "묶어라." "거친 밧줄이 손목을 파고들었다." | 묶이는 순서가 셋이 다르다. 입력 칸은 이미 묶였다고 하고, 머뭇거리면 그제야 밧줄을 들고 오고, 끝에서 남자가 처음으로 "묶어라" 한다. 첫 줄(1300)도 "팔을 등 뒤로 꺾었다"까지만 말한다. |
| 2 | 상 | 상태 | b06_swing 첫 줄 (927), r2_bind 첫 줄 (1299), e_spy (1985) | "어깨의 가방, 등 뒤의 바위…" / "…어깨의 가방." / "마법 가방까지 빼앗기는 걸 보면서" | b05 실패 대가 bag_taken(호위가 가방을 낚아챔)으로 가방을 잃은 갈래에서도 가방이 어깨에 있다고 나오고, e_spy 는 다시 빼앗긴다. b02 장면 검사 strap(끈이 끊겨 손에 쥐고 다님) 뒤에도 "어깨의 가방". |
| 3 | 상 | 상태 | b06_swing.dodge.mixed (1003) | "…후드가 벗겨지고, 귀찌가 뜨겁게 달아올랐다." | b05 에서 미인계(before: 후드_벗음)나 대가 hood_slip 으로 이미 후드를 벗은 갈래에서 다시 벗겨진다. 같은 비트 neutral.mixed 는 `if: "!flag:후드_벗음"` 으로 막혀 있는데 이 줄은 막혀 있지 않다(facts 의 state_guard "후드가 벗겨" 에도 걸림). |
| 4 | 상 | 반복 | b06_swing.dodge.mixed (1003) + 엔진 첫 귀찌 설명 | "…귀찌가 뜨겁게 달아올랐다." 바로 뒤 "귀찌가 뜨겁게 달아올랐다. 변장이 버틸 시간이 줄고 있다." | 귀찌가 처음 줄어드는 판이 이 결과면 같은 문장이 연달아 두 번 나온다. (b05 hood_slip "귀찌가 뜨거워진다." 뒤도 비슷하다.) |
| 5 | 상 | 설정 | r3_dusk 장면 검사 howl (1454), facts (127) | "멀리서 짐승 울음이 길게 이어졌다…" | lore 지르다: "생명이 살지 않는 모래사막". 수첩에서 지르다를 읽은 사람에게는 모순이다. |
| 6 | 상 | 설정 | b08_gaze 대가 guard_whisper (1138) | "호위가 남자에게 몸을 기울여 귓속말을 했다." | lore 호위: "사막 장면에서는 말하지 않는다", b08 must_not "호위가 말을 한다". GM 에게 금지한 일을 대본 대가가 한다. |
| 7 | 중 | 전제 | r3_slip (1429) | "터번에 호위까지… 저런 사람들한테 길을 물었다간…" | b02 '몰래 돌아서 피해 간다' 성공으로 오는 길에서는 터번·호위를 본 줄이 하나도 없다(그 묘사는 '먼저 살핀다' 성공에만 있다). 처음 하는 사람은 무엇을 봤는지 모른다. |
| 8 | 중 | 전제 | r4_walk (1770) | "…잠깐. 해가 왼쪽에 있는데, 왜 우리는 북쪽으로 걷는 거야?" | 크라차가 남쪽이라는 말은 r3_dusk(혼자 걷는 갈래)에만 나온다. r4 갈래에서는 크라차 방향도, 지금이 오후라는 것도 들은 적이 없어 '해가 왼쪽 → 북쪽 → 길이 틀렸다'를 따라갈 수 없다. |
| 9 | 중 | 전제 | b03_ask 제목 (605), b04_blade 속마음 (641) | 제목 "길을 물어봤을 뿐인데" / "…크라차에 원수라도 진 건지…" | 줄은 `flag:길_물음` 으로 갈라 놨지만 제목과 b04 속마음은 늘 나온다. 직접 입력으로 길을 묻지 않은 갈래(예: '저 사람들을 지켜본다'를 입력해 실패)에서는 크라차 이야기를 한 적이 없는데 크라차 원수를 떠올린다. |
| 10 | 중 | 전제·상태 | b08_gaze offer (1130) | "남자의 눈길이 잠깐 아시나의 손에 든 지도로 옮겨 갔다… 지도는 돌아오지 않을 것이다." | 지도를 손에 들었다는 줄이 앞에 없다(b05 '가방에서 지도를 꺼낸다'를 고른 갈래뿐). 또 이 제안에는 effects 가 없어 "돌아오지 않을 것" 이라는 대가가 실제로 일어나지 않는다. |
| 11 | 중 | 무대 | free_defaults.improv_bold (174–195) 가 b02_people·r3_dusk 로 물려 내려감 | "남자가 내 손목을 붙잡아…", "……미친 여자군." 등 | 두 비트는 남자가 없는(멀리 있거나 혼자인) 장면인데 큰 즉흥 행동 판정에 남자 대사·접촉 줄이 나온다. 두 비트는 improv·talk_fallback 등은 덮어썼지만 improv_bold 만 덮어쓰지 않았다. |
| 12 | 중 | 반복 | b02_people·r3_dusk 의 improv 줄 (472–485, 1506–1519) | "어이없는 짓이었지만, 이상하게도 기운이 조금 돌아왔다." 외 4줄 | 두 비트 즉흥 결과가 글자까지 같다. b02 즉흥 → b05 '칼을 밀어내고 몸을 뺀다' 성공 → r3_dusk 즉흥이면 한 판에 같은 줄이 두 번 나온다. b05·b06·b08 의 기본 improv 줄도 한 판에 되풀이된다(자동 결과 7). |
| 13 | 중 | 반복 | b02 대가 sun (437) ↔ 엔진 시간 대가 대체 줄 | "해가 한 뼘 더 기울었다. 귀찌가 미지근해진다." | 엔진 CLOCK_FALLBACK 과 글자까지 같다. 한 판에 두 번 나올 수 있다. |
| 14 | 중 | 반복 | b06_swing 줄 (933) ↔ free_defaults.press (146) | "그것뿐인가?" → (머뭇거리면) "할 말은 그것뿐인가?" | 같은 장면에서 남자가 거의 같은 말을 두 번 한다. |
| 15 | 중 | 반복 | b05 bluff.hit (794) ↔ r4_prove wits.hit (1713) | "하. 혀는 잘 돌아가는군." → "혀는 정말 잘 돌아가는군." | b05 말재주 → r4 말솜씨 갈래에서 이어서 나온다. 의도한 되받기라면 '정말'만으로는 약하다. |
| 16 | 하 | 말투 | 대가·제안 나레이션 (678, 682, 1130, 1654), fates.spy_cut.warn (270), e_quit (1926) | "호위 하나가 아시나의 뒤로…", "…아시나의 팔을…", "눈은 아시나에게서…", "아시나의 사막은…" | 나레이션은 아시나의 1인칭("나")이라는 lore 규칙(narration.register.forbid_words: 아시나의·아시나에게)과 어긋난다. 같은 장면 다른 줄은 "내 팔을" 로 쓴다. |
| 17 | 하 | 말투 | r5_claim.manners.hit (1826) | "예법 선생님, 감사합니다…!" | 속마음 금지 어미 "니다"(lore thought.register). 선생님께 하는 말이라 일부러일 수 있다. 판단 필요. |
| 18 | 하 | 설정 | lore 지르다 (lore:19) ↔ lore 사막의 세 사람 (lore:71·75) | "두 대륙 사이의 죽음의 사막" / "남대륙 사막 한복판이니" | 설정 사전 안에서 지르다의 자리가 다르다. 수첩에 둘 다 적힌다. |
| 19 | 하 | 전제 | 작품 전체 | (지르다) | '지르다'라는 이름은 장면 제목(시나리오 title)·수첩·되받음 줄 하나(말_여행자)·e_quit 다음 이야기 안내에만 나오고, 이야기 줄에는 한 번도 안 나온다. 되받음 줄 "동행도 없이 지르다를 건너는" 은 처음 하는 사람에게 낯선 이름이다. |
| 20 | 하 | 상태 | b07_rule (1092) | (줄 없음) effects 후드_벗음 | b06 를 후드가 벗겨지지 않은 채 넘긴 갈래(성공·실패)에서 b07 에 들어서면 아무 줄 없이 입식이 후드 없는 그림으로 바뀐다. |
| 21 | 하 | 상태 | b06_swing.flee.hit (1066), r3_flee (1416) | "…그대로 모래 언덕 쪽으로 내달렸다." | b05 대가 guard_grip(호위가 팔을 붙듦)이 나온 갈래에서도 막힘 없이 달아난다. 팔_붙들림 플래그는 세우기만 하고 어디서도 읽지 않는다(자동 결과 3). |
| 22 | 하 | 무대 | r3_flee (1418) | 남자: "내버려 둬라. 사막이 대신 할 일이다." | 무대(cast)에 남자가 없는 장면의 대사. 화면에 입식 없이 목소리만 나온다. 결말 비트의 남자 대사(암전)도 같은 꼴이지만 이는 의도로 본다. |
| 23 | 하 | 쓰이지 않음 | b08_gaze 대가 hair_strand (1137) | "후드 틈으로 흘러내린 머리카락 한 올이…" | 조건 `!flag:후드_벗음` 인데 b08 앞의 b07 이 늘 후드_벗음을 세워 한 번도 뽑히지 않는다. |
| 24 | 하 | 쓰이지 않음 | 플래그 | 기회_물·미인계·정체_눈치·귀찌_숨김·상처·외투_찢김 등 | 세우기만 하고 아무 조건도 읽지 않는다(자동 결과 3). 특히 b02 제안 "물주머니를 흔들어 보였다… 받을 수 있을 것 같았다"(433)는 기회_물을 세우지만 뒤에서 물을 받는 일이 없다. |
| 25 | 하 | 설정 | b00_open (361) | "선사시대 유적지부터 사이베리아의 펜족에게까지…" | 실제 지명 '시베리아'와 닮아 이 세계 이름으로 읽히지 않을 수 있다. 원작 대사라면 둔다. |

자동 결과 가운데 사람이 보고 문제 아님으로 본 것:

- 결말 비트(e_*·x_*)의 남자 대사가 무대에 없다고 나오는 것: 결말은 암전(blackout)이라 목소리만 나오는 것이 맞다.
- b00·b08 의 '은발' 노출 낱말: 변장 설명과 "은발이 드러나는 순간 끝이야" 같은 가정이라 노출이 아니다.
- '늘 나오는 조건 줄'(b02 watch·avoid 의 `!flag:이미_길_물음`): 직접 입력한 판에서는 아시나 대사 줄이 대체 줄에서 빠지므로 화면에는 영향이 없고, LLM 이 참고하는 줄이라 조건이 뜻이 있다.
- 남자_정체_앎·뒤_화(읽기만 함): 다음 화를 위한 숨긴 수첩 조건이다.
- 말버릇 "하."·"지루하군." 3~4번: 남자의 짧은 비웃음은 lore 가 정한 말버릇이다. 다만 "지루하군." 4번은 즉흥 실패(free_defaults improv.miss)가 비트마다 같은 줄이라서다(#12 와 같은 뿌리).

<!-- audit:begin -->
<!-- 이 구역은 `cd app && bun scripts/script_audit.ts` 가 다시 쓴다. 손으로 고치지 말 것. -->

## 자동 점검 결과

탐색한 상태 46373개, 수(상태 사이 이동) 2750281개. 결말별 도달 상태 수: quit 1, reckless 1, spy_cut 1, road 1, deal 1, value 1, unmasked 1, curious 1, survivor 1, collapse 1, spy 1.

### 1. 닿지 않는 비트
_없음_

### 2. 막다른 길
_없음_

### 3. 플래그
세우는 곳·읽는 곳이 한쪽뿐이거나, 읽히지만 탐색 중 한 번도 서지 않는 플래그만 적는다. 전체 목록은 `--json`.

| 플래그 | 문제 | 세우는 곳 | 읽는 곳 |
| --- | --- | --- | --- |
| 귀찌_숨김 | 세우지만 읽는 곳이 없음 | b08_gaze.hide_earring.hit, b08_gaze.hide_earring.mixed |  |
| 귀찌_요구 | 세우지만 읽는 곳이 없음 | r5_claim.prices.ring_demand |  |
| 기회_물 | 세우지만 읽는 곳이 없음 | b02_people.free.offer |  |
| 남자_정체_앎 | 읽지만 세우는 곳이 없음 |  | lore.knowledge.man_true |
| 눈_따가움 | 세우지만 읽는 곳이 없음 | r3_dusk.prices.sand_eyes |  |
| 뒤_화 | 읽지만 세우는 곳이 없음 |  | lore.knowledge.later |
| 무릎_꿇림 | 세우지만 읽는 곳이 없음 | r5_claim.prices.guard_seize |  |
| 물_적음 | 세우지만 읽는 곳이 없음 | r3_dusk.prices.water_spill |  |
| 미인계 | 세우지만 읽는 곳이 없음 | b05_why.beauty.hit, b05_why.beauty.mixed, b05_why.beauty.miss |  |
| 상대_먼저 | 세우지만 읽는 곳이 없음 | b02_people.prices.foe_approach |  |
| 상처 | 세우지만 읽는 곳이 없음 | b06_swing.prices.blade_graze |  |
| 외투_찢김 | 세우지만 읽는 곳이 없음 | b06_swing.prices.cloak_cut |  |
| 이미_미소녀 | 세우지만 읽는 곳이 없음 | b05_why.beauty.said(입력 낱말) |  |
| 자리_낮음 | 세우지만 읽는 곳이 없음 | b06_swing.prices.knee_sand, r3_dusk.prices.dune_slide |  |
| 정체_눈치 | 세우지만 읽는 곳이 없음 | b02_people.watch.hit, b02_people.watch.mixed |  |
| 짐_쏟음 | 세우지만 읽는 곳이 없음 | r2_bind.prices.bag_search |  |
| 팔_붙들림 | 세우지만 읽는 곳이 없음 | b05_why.prices.guard_grip, b06_swing.prices.guard_hold, r2_bind.prices.rope_tight, r4_prove.prices.guard_grab |  |

### 4. 쓰이지 않는 조각(조건 줄·대가·갈래·행동·보정)
| 종류 | 어디 | 글 | 내용 |
| --- | --- | --- | --- |
| 늘 나오는 조건 줄 | b02_people.free.watch.hit.lines[2] (ep01_desert.yaml:545) | 저기요! 길 좀 여쭤봐도 될까요? | if "!flag:이미_길_물음" 가 이 자리에서 한 번도 거짓이 아니다(조건이 필요 없음) |
| 늘 나오는 조건 줄 | b02_people.free.watch.mixed.lines[2] (ep01_desert.yaml:555) | 아, 안녕하세요! 길 좀 여쭤보려고요! | if "!flag:이미_길_물음" 가 이 자리에서 한 번도 거짓이 아니다(조건이 필요 없음) |
| 늘 나오는 조건 줄 | b02_people.free.avoid.mixed.lines[2] (ep01_desert.yaml:555) | 아, 안녕하세요! 길 좀 여쭤보려고요! | if "!flag:이미_길_물음" 가 이 자리에서 한 번도 거짓이 아니다(조건이 필요 없음) |
| 안 뽑히는 대가 | b08_gaze.free.prices.hair_strand (ep01_desert.yaml:1137) | 후드 틈으로 흘러내린 머리카락 한 올이 햇빛에 은빛으로 번쩍였다. | hard · 소지품 · if !flag:후드_벗음: 어떤 결과의 후보에도 오르지 않는다 |
| 안 나오는 되받음 | callbacks.말_상인 (ep01_desert.yaml:327) | 상인이라던 여자가 칼 앞에서 왜 값을 안 부르지? | 플레이어가 그 낱말을 입력해야 선다(탐색은 낱말 입력을 모형에 넣지 않음) |
| 안 나오는 되받음 | callbacks.말_여행자 (ep01_desert.yaml:331) | 여행자라. 동행도 없이 지르다를 건너는 여행자는 처음 본다. | 플레이어가 그 낱말을 입력해야 선다(탐색은 낱말 입력을 모형에 넣지 않음) |
| 안 나오는 되받음 | callbacks.말_고양이 (ep01_desert.yaml:335) | 고양이 타령을 하던 입치고는 잘도 떠는군. | 플레이어가 그 낱말을 입력해야 선다(탐색은 낱말 입력을 모형에 넣지 않음) |

### 5. 설정과 어긋나는 대사
| 어디 | 글 | 내용 |
| --- | --- | --- |
| b00_open.lines[10] (ep01_desert.yaml:367) | 그래서 귀찌로 은발과 붉은 눈을 갈색으로 바꿨다. | 노출 낱말 "은발" (lore exposure — 결말 밖) |
| fates.spy_cut.warn[0] (ep01_desert.yaml:270) | 남자의 손이 칼자루로 내려갔다. 눈은 아시나에게서 떨어지지 않았다. | 나레이션 금지어 "아시나에게" (lore register.forbid_words) |
| r3_dusk.twist.interrupt.howl[0] (ep01_desert.yaml:1454) | 멀리서 짐승 울음이 길게 이어졌다. 한 번, 그리고 또 한 번. 두 번째가 더 가까웠다. | 생명이 살지 않는 사막에 짐승이 있다 — knowledge.common.zirda: "생명이 살지 않는 모래사막" |
| e_quit.lines[0] (ep01_desert.yaml:1926) | 이야기는 여기서 멈췄다. 아시나의 사막은 언제든 다시 이어 갈 수 있다. | 나레이션 금지어 "아시나의" (lore register.forbid_words) |
| b05_why.free.prices.guard_step (ep01_desert.yaml:678) | 호위 하나가 아시나의 뒤로 돌아가 섰다. 퇴로가 막혔다. | 나레이션 금지어 "아시나의" (lore register.forbid_words) |
| b05_why.free.prices.guard_grip (ep01_desert.yaml:682) | 호위가 아시나의 팔을 붙들었다. 손목이 저릿하다. | 나레이션 금지어 "아시나의" (lore register.forbid_words) |
| r4_prove.free.prices.guard_grab (ep01_desert.yaml:1654) | 호위가 아시나의 팔을 붙들어 앞으로 끌어냈다. | 나레이션 금지어 "아시나의" (lore register.forbid_words) |
| r5_claim.free.manners.hit.lines[2] (ep01_desert.yaml:1826) | 예법 선생님, 감사합니다…! | 속마음 말투: "니다" 로 끝남 (lore register.forbid_endings) |
| b08_gaze.free.prices.guard_whisper (ep01_desert.yaml:1138) | 호위가 남자에게 몸을 기울여 귓속말을 했다. | 말하지 않는 호위가 말을 한다 — characters.호위.voice: "사막 장면에서는 말하지 않는다" |
| b08_gaze.free.hide_earring.hit.lines[1] (ep01_desert.yaml:1232) | 이것만은 들키면 안 돼. 은발이 드러나는 순간 끝이야. | 노출 낱말 "은발" (lore exposure — 결말 밖) |
| b08_gaze.free.offer[0] (ep01_desert.yaml:1130) | 남자의 눈길이 잠깐 아시나의 손에 든 지도로 옮겨 갔다. 지도를 내밀면 눈길을 돌릴 수 있을지도 몰랐다. 지도는 돌아오지 않을 것이다. | 나레이션 금지어 "아시나의" (lore register.forbid_words) |
| b02_people.free.improv_bold.hit | 남자의 눈이 아주 잠깐 멈췄다. 비웃음은 나오지 않았다. | 남자 가 무대에 없는 비트(b02_people)에서 쓰일 수 있는 줄(free_defaults 에서 물려받음) |
| b02_people.free.improv_bold.hit | ……미친 여자군. | 남자 가 무대에 없는 비트(b02_people)에서 쓰일 수 있는 줄(free_defaults 에서 물려받음) |
| b02_people.free.improv_bold.hit | 붉은 눈이 나에게서 떨어지지 않았다. | 남자 가 무대에 없는 비트(b02_people)에서 쓰일 수 있는 줄(free_defaults 에서 물려받음) |
| b02_people.free.improv_bold.mixed | …무슨 속셈이지? | 남자 가 무대에 없는 비트(b02_people)에서 쓰일 수 있는 줄(free_defaults 에서 물려받음) |
| b02_people.free.improv_bold.mixed | 남자의 손이 칼자루를 고쳐 쥐었다. 그러나 붉은 눈은 나에게서 떨어지지 않았다. | 남자 가 무대에 없는 비트(b02_people)에서 쓰일 수 있는 줄(free_defaults 에서 물려받음) |
| b02_people.free.improv_bold.miss | 남자가 내 손목을 붙잡아 멈춰 세웠다. 붉은 눈이 얼음처럼 식었다. | 남자 가 무대에 없는 비트(b02_people)에서 쓰일 수 있는 줄(free_defaults 에서 물려받음) |
| b02_people.free.improv_bold.miss | 죽기 직전인 주제에 겁이 없군. | 남자 가 무대에 없는 비트(b02_people)에서 쓰일 수 있는 줄(free_defaults 에서 물려받음) |
| r3_dusk.free.improv_bold.hit | 남자의 눈이 아주 잠깐 멈췄다. 비웃음은 나오지 않았다. | 남자 가 무대에 없는 비트(r3_dusk)에서 쓰일 수 있는 줄(free_defaults 에서 물려받음) |
| r3_dusk.free.improv_bold.hit | ……미친 여자군. | 남자 가 무대에 없는 비트(r3_dusk)에서 쓰일 수 있는 줄(free_defaults 에서 물려받음) |
| r3_dusk.free.improv_bold.hit | 붉은 눈이 나에게서 떨어지지 않았다. | 남자 가 무대에 없는 비트(r3_dusk)에서 쓰일 수 있는 줄(free_defaults 에서 물려받음) |
| r3_dusk.free.improv_bold.mixed | …무슨 속셈이지? | 남자 가 무대에 없는 비트(r3_dusk)에서 쓰일 수 있는 줄(free_defaults 에서 물려받음) |
| r3_dusk.free.improv_bold.mixed | 남자의 손이 칼자루를 고쳐 쥐었다. 그러나 붉은 눈은 나에게서 떨어지지 않았다. | 남자 가 무대에 없는 비트(r3_dusk)에서 쓰일 수 있는 줄(free_defaults 에서 물려받음) |
| r3_dusk.free.improv_bold.miss | 남자가 내 손목을 붙잡아 멈춰 세웠다. 붉은 눈이 얼음처럼 식었다. | 남자 가 무대에 없는 비트(r3_dusk)에서 쓰일 수 있는 줄(free_defaults 에서 물려받음) |
| r3_dusk.free.improv_bold.miss | 죽기 직전인 주제에 겁이 없군. | 남자 가 무대에 없는 비트(r3_dusk)에서 쓰일 수 있는 줄(free_defaults 에서 물려받음) |

### 6. 그때의 상태와 어긋나는 글
| 종류 | 어디 | 글 | 내용 |
| --- | --- | --- | --- |
| 상태 | b06_swing.lines[0] (ep01_desert.yaml:927) | 뜨거운 모래가 발을 붙잡았다. 어깨의 가방, 등 뒤의 바위, 남자의 오른팔. | 마법 가방을 이미 잃었는데 가방이 나온다 ("!item:magic_bag") |
| 상태 | b06_swing.free.dodge.mixed.lines[0] (ep01_desert.yaml:1003) | 간신히 피했지만 모래 위로 나동그라졌다. 후드가 벗겨지고, 귀찌가 뜨겁게 달아올랐다. | "flag:후드_벗음" 인데 "후드가 벗겨" (사실: 아시나는 이미 후드를 벗어 얼굴을 드러냈다. 후드를 벗는 장면은 다시 쓰지 않는다.) |
| 상태 | b06_swing.free.flee.hit.lines[0] (ep01_desert.yaml:1066) | 칼날 아래로 몸을 굴린 나는 그대로 모래 언덕 쪽으로 내달렸다. | 호위에게 팔이 붙들린 채 몸을 날린다 ("flag:팔_붙들림") |
| 상태 | r3_flee.lines[0] (ep01_desert.yaml:1416) | 나는 뒤도 돌아보지 않고 모래 언덕을 향해 내달렸다. | 호위에게 팔이 붙들린 채 몸을 날린다 ("flag:팔_붙들림") |
| 상태 | r2_bind.lines[0] (ep01_desert.yaml:1299) | 마른 풀 냄새가 나는 밧줄이 눈에 들어왔다. 호위의 칼, 남자의 등, 어깨의 가방. | 마법 가방을 이미 잃었는데 가방이 나온다 ("!item:magic_bag") |
| 상태 | e_spy.lines[1] (ep01_desert.yaml:1985) | 거친 밧줄이 손목을 파고들었다. 마법 가방까지 빼앗기는 걸 보면서, 나는 정신을 잃었다. | 마법 가방을 이미 잃었는데 지금 빼앗기는 것으로 나온다 ("!item:magic_bag") |
| 무대 | b00_open.lines[5] (ep01_desert.yaml:357) | 와아… | b00_open 의 cast 에 아시나 가 없다 |
| 무대 | b02_people.free.improv_bold.hit.lines[1] (ep01_desert.yaml:179) | ……미친 여자군. | b02_people 의 cast 에 남자 가 없다 |
| 무대 | b02_people.free.improv_bold.mixed.lines[0] (ep01_desert.yaml:185) | …무슨 속셈이지? | b02_people 의 cast 에 남자 가 없다 |
| 무대 | b02_people.free.improv_bold.miss.lines[1] (ep01_desert.yaml:193) | 죽기 직전인 주제에 겁이 없군. | b02_people 의 cast 에 남자 가 없다 |
| 무대 | r3_flee.lines[2] (ep01_desert.yaml:1418) | 내버려 둬라. 사막이 대신 할 일이다. | r3_flee 의 cast 에 남자 가 없다 |
| 무대 | x_reckless.lines[1] (ep01_desert.yaml:2055) | 겁은 없군. 머리는 없고. | x_reckless 의 cast 에 남자 가 없다 |
| 무대 | x_spy_cut.lines[0] (ep01_desert.yaml:2039) | 첩자군. 더 들을 것도 없다. | x_spy_cut 의 cast 에 남자 가 없다 |
| 무대 | r3_dusk.free.improv_bold.hit.lines[1] (ep01_desert.yaml:179) | ……미친 여자군. | r3_dusk 의 cast 에 남자 가 없다 |
| 무대 | r3_dusk.free.improv_bold.mixed.lines[0] (ep01_desert.yaml:185) | …무슨 속셈이지? | r3_dusk 의 cast 에 남자 가 없다 |
| 무대 | r3_dusk.free.improv_bold.miss.lines[1] (ep01_desert.yaml:193) | 죽기 직전인 주제에 겁이 없군. | r3_dusk 의 cast 에 남자 가 없다 |
| 무대 | e_value.lines[0] (ep01_desert.yaml:1966) | 데려가라. 귀한 몸이라니, 귀하게 모셔야지. | e_value 의 cast 에 남자 가 없다 |
| 무대 | e_value.lines[1] (ep01_desert.yaml:1969) | 데려가라. 값은 크라차에서 매기지. | e_value 의 cast 에 남자 가 없다 |
| 무대 | e_curious.lines[0] (ep01_desert.yaml:1996) | 데려가라. 깨어나면 그 입이 얼마나 더 떠드는지 들어 보지. | e_curious 의 cast 에 남자 가 없다 |
| 무대 | e_survivor.lines[0] (ep01_desert.yaml:2009) | 끌고 가라. | e_survivor 의 cast 에 남자 가 없다 |
| 무대 | e_spy.lines[0] (ep01_desert.yaml:1983) | 묶어라. 수상한 짓을 하면 그 자리에서 베어도 좋다. | e_spy 의 cast 에 남자 가 없다 |

### 7. 같은 말 반복(한 갈래 안)
| 어디(앞 → 뒤) | 글 | 내용 | 갈래 예 |
| --- | --- | --- | --- |
| b02_people.twist.altered.glare[0] → b02_people.free.nudge[0] (ep01_desert.yaml:430) | 나레이션: 멀리 세 사람의 그림자가 움직이기 시작했다. 곧 시야에서 사라질 것 같았다. / 나레이션: 해가 정수리 위에 섰다. 모래가 빛을 되쏘아 눈을 뜨기 힘들었다. 세 사람의 그림자가 아지랑이 속에서 흔들렸다. | 같은 말 "세사람의그림자가" | 시작 → b00_open → b01_sand → b02_people → 장면검사:glare ⇒ 머뭇:threat |
| b05_why.free.resist.miss.lines[0] → b05_why.free.prices.guard_grip (ep01_desert.yaml:682) | 나레이션: 움직이기도 전에 호위 하나가 내 팔을 붙들었다. / 나레이션: 호위가 아시나의 팔을 붙들었다. 손목이 저릿하다. | 같은 말 "팔을붙들었다" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ run(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ resist(단추) → miss → 대가:guard_grip → b06_swing |
| b05_why.free.improv_bold.mixed.lines[1] → fates.spy_cut.warn[0] (ep01_desert.yaml:270) | 나레이션: 남자의 손이 칼자루로 내려갔다. 눈은 아시나에게서 떨어지지 않았다. / 나레이션: 남자의 손이 칼자루를 고쳐 쥐었다. 그러나 붉은 눈은 나에게서 떨어지지 않았다. | 같은 말 "나에게서떨어지지않았다" (같은 글이 8곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ run(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ 즉흥(큰 행동) → mixed → 대가:blade_closer → b06_swing |
| b03_ask.lines[0] → b05_why.free.resist.miss.lines[0] (ep01_desert.yaml:878) | 나레이션: 그때 등 뒤에서 모래 밟는 소리가 났다. 호위 하나가 내 팔을 붙잡아 세 사람 앞으로 끌어냈다. / 나레이션: 움직이기도 전에 호위 하나가 내 팔을 붙들었다. | 같은 말 "호위하나가내팔을붙" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(말) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ resist(단추) → miss → 대가:bag_taken → x_spy_cut |
| b02_people.free.watch.miss.lines[1] → b05_why.free.bag.hit.lines[2] (ep01_desert.yaml:898) | 나레이션: 남자의 시선이 지도와 내 얼굴을 오갔다. 경계가 아주 조금 풀렸다. / 나레이션: 세 남자의 시선이 한꺼번에 꽂혔다. | 같은 말 "남자의시선이" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ bag(단추) → hit → b06_swing |
| fates.spy_cut.warn[0] → b05_why.free.improv_bold.hit.lines[2] (ep01_desert.yaml:180) | 나레이션: 남자의 손이 칼자루로 내려갔다. 눈은 아시나에게서 떨어지지 않았다. / 나레이션: 붉은 눈이 나에게서 떨어지지 않았다. | 같은 말 "나에게서떨어지지않았다" (같은 글이 8곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ 즉흥(큰 행동) → hit → b06_swing |
| r3_dusk.lines[1] → r3_dusk.free.nudge[0] (ep01_desert.yaml:1469) | 나레이션: 해가 기울자 모래가 빠르게 식기 시작했다. 낮에는 살을 태우던 사막이 이제는 뼈를 시리게 했다. / 나레이션: 해가 지평선에 걸렸다. 모래가 빠르게 식어 갔다. | 같은 말 "모래가빠르게식" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ avoid(단추) → hit → r3_slip → r3_dusk ⇒ 머뭇:threat |
| b02_people.free.improv_bold.hit.lines[0] → b05_why.free.improv_bold.hit.lines[0] (ep01_desert.yaml:178) | 나레이션: 남자의 눈이 아주 잠깐 멈췄다. 비웃음은 나오지 않았다. / 나레이션: 남자의 눈이 아주 잠깐 멈췄다. 비웃음은 나오지 않았다. | 같은 줄 (같은 글이 14곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥(큰 행동) → hit → b03_ask → b04_blade → b05_why ⇒ 즉흥(큰 행동) → hit → b06_swing |
| b02_people.free.improv_bold.hit.lines[1] → b05_why.free.improv_bold.hit.lines[1] (ep01_desert.yaml:179) | 남자: ……미친 여자군. / 남자: ……미친 여자군. | 같은 줄 (같은 글이 14곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥(큰 행동) → hit → b03_ask → b04_blade → b05_why ⇒ 즉흥(큰 행동) → hit → b06_swing |
| b02_people.free.improv_bold.hit.lines[2] → b05_why.free.improv_bold.hit.lines[2] (ep01_desert.yaml:180) | 나레이션: 붉은 눈이 나에게서 떨어지지 않았다. / 나레이션: 붉은 눈이 나에게서 떨어지지 않았다. | 같은 줄 (같은 글이 14곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥(큰 행동) → hit → b03_ask → b04_blade → b05_why ⇒ 즉흥(큰 행동) → hit → b06_swing |
| b02_people.free.improv_bold.hit.lines[2] → b05_why.free.improv_bold.mixed.lines[1] (ep01_desert.yaml:187) | 나레이션: 남자의 손이 칼자루를 고쳐 쥐었다. 그러나 붉은 눈은 나에게서 떨어지지 않았다. / 나레이션: 붉은 눈이 나에게서 떨어지지 않았다. | 같은 말 "나에게서떨어지지않았다" (같은 글이 28곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥(큰 행동) → hit → b03_ask → b04_blade → b05_why ⇒ 즉흥(큰 행동) → mixed → 대가:blade_closer → b06_swing |
| b02_people.free.improv_bold.mixed.lines[1] → b05_why.free.plead.miss.lines[1] (ep01_desert.yaml:779) | 나레이션: 남자는 지루하다는 듯 칼자루를 고쳐 쥐었다. 목소리가 떨릴수록 그의 눈빛은 차가워졌다. / 나레이션: 남자의 손이 칼자루를 고쳐 쥐었다. 그러나 붉은 눈은 나에게서 떨어지지 않았다. | 같은 말 "칼자루를고쳐쥐었다" (같은 글이 5곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥(큰 행동) → mixed → 대가:sun → b03_ask → b04_blade → b05_why ⇒ plead(단추) → miss → 대가:bag_taken → b06_swing |
| b02_people.free.improv_bold.mixed.lines[0] → b05_why.free.improv.mixed.lines[0] (ep01_desert.yaml:162) | 남자: …무슨 속셈이지? / 남자: 무슨 속셈이지? | 같은 줄 (같은 글이 19곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥(큰 행동) → mixed → 대가:sun → b03_ask → b04_blade → b05_why ⇒ 즉흥 → mixed → 대가:blade_closer → b06_swing |
| b02_people.free.improv_bold.mixed.lines[0] → b05_why.free.improv_bold.mixed.lines[0] (ep01_desert.yaml:185) | 남자: …무슨 속셈이지? / 남자: …무슨 속셈이지? | 같은 줄 (같은 글이 14곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥(큰 행동) → mixed → 대가:sun → b03_ask → b04_blade → b05_why ⇒ 즉흥(큰 행동) → mixed → 대가:blade_closer → b06_swing |
| b02_people.free.improv_bold.mixed.lines[1] → b05_why.free.improv_bold.mixed.lines[1] (ep01_desert.yaml:187) | 나레이션: 남자의 손이 칼자루를 고쳐 쥐었다. 그러나 붉은 눈은 나에게서 떨어지지 않았다. / 나레이션: 남자의 손이 칼자루를 고쳐 쥐었다. 그러나 붉은 눈은 나에게서 떨어지지 않았다. | 같은 줄 (같은 글이 14곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥(큰 행동) → mixed → 대가:sun → b03_ask → b04_blade → b05_why ⇒ 즉흥(큰 행동) → mixed → 대가:blade_closer → b06_swing |
| b02_people.free.improv_bold.miss.lines[0] → b05_why.free.improv_bold.miss.lines[0] (ep01_desert.yaml:192) | 나레이션: 남자가 내 손목을 붙잡아 멈춰 세웠다. 붉은 눈이 얼음처럼 식었다. / 나레이션: 남자가 내 손목을 붙잡아 멈춰 세웠다. 붉은 눈이 얼음처럼 식었다. | 같은 줄 (같은 글이 14곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥(큰 행동) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ 즉흥(큰 행동) → miss → 대가:bag_taken → x_spy_cut |
| b02_people.free.improv_bold.miss.lines[1] → b05_why.free.improv_bold.miss.lines[1] (ep01_desert.yaml:193) | 남자: 죽기 직전인 주제에 겁이 없군. / 남자: 죽기 직전인 주제에 겁이 없군. | 같은 줄 (같은 글이 14곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥(큰 행동) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ 즉흥(큰 행동) → miss → 대가:bag_taken → x_spy_cut |
| b02_people.twist.altered.closer[0] → r3_dusk.free.shelter.miss.lines[0] (ep01_desert.yaml:1604) | 나레이션: 바람이 방향을 바꾸더니 모래를 한가득 퍼부었다. / 나레이션: 바람이 방향을 바꿨다. 세 사람의 말소리가 끊어질 듯 이어져 들렸다. 생각보다 가까웠다. | 같은 말 "바람이방향을바" | 시작 → b00_open → b01_sand → b02_people → 장면검사:closer ⇒ avoid(단추) → hit → r3_slip → r3_dusk ⇒ shelter(단추) → miss → 대가:map_lost → r3_night → e_road |
| engine:설명_귀찌 → b06_swing.free.dodge.mixed.lines[0] (ep01_desert.yaml:1003) | 나레이션: 간신히 피했지만 모래 위로 나동그라졌다. 후드가 벗겨지고, 귀찌가 뜨겁게 달아올랐다. / 나레이션: 귀찌가 뜨겁게 달아올랐다. 변장이 버틸 시간이 줄고 있다. | 같은 문장 "귀찌가뜨겁게달아올랐다" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ run(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ beauty(단추) → mixed → 대가:blade_closer → b06_swing ⇒ dodge(단추) → mixed → 대가:cloak_cut → b07_rule → b08_gaze |
| b05_why.free.improv.mixed.lines[0] → b06_swing.free.improv.mixed.lines[0] (ep01_desert.yaml:162) | 남자: 무슨 속셈이지? / 남자: 무슨 속셈이지? | 같은 줄 (같은 글이 6곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ run(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ 즉흥 → mixed → 대가:blade_closer → b06_swing ⇒ 즉흥 → mixed → 대가:cloak_cut → b07_rule → b08_gaze |
| b05_why.free.improv.mixed.lines[1] → b06_swing.free.improv.mixed.lines[1] (ep01_desert.yaml:164) | 나레이션: 비웃음 섞인 목소리였지만, 붉은 눈은 나를 놓치지 않았다. / 나레이션: 비웃음 섞인 목소리였지만, 붉은 눈은 나를 놓치지 않았다. | 같은 줄 (같은 글이 6곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ run(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ 즉흥 → mixed → 대가:blade_closer → b06_swing ⇒ 즉흥 → mixed → 대가:cloak_cut → b07_rule → b08_gaze |
| b03_ask.lines[0] → b06_swing.free.flee.miss.lines[0] (ep01_desert.yaml:1079) | 나레이션: 그때 등 뒤에서 모래 밟는 소리가 났다. 호위 하나가 내 팔을 붙잡아 세 사람 앞으로 끌어냈다. / 나레이션: 등을 돌리는 순간 호위 하나가 내 팔을 붙들어 모래 위로 넘어뜨렸다. | 같은 말 "호위하나가내팔을붙" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(말) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ beauty(단추) → mixed → 대가:blade_closer → b06_swing ⇒ flee(단추) → miss → 대가:blade_graze → x_spy_cut |
| b03_ask.lines[0] → r4_prove.free.prices.guard_grab (ep01_desert.yaml:1654) | 나레이션: 그때 등 뒤에서 모래 밟는 소리가 났다. 호위 하나가 내 팔을 붙잡아 세 사람 앞으로 끌어냈다. / 나레이션: 호위가 아시나의 팔을 붙들어 앞으로 끌어냈다. | 같은 말 "앞으로끌어냈다" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(말) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ bluff(단추) → mixed → 대가:blade_closer → r4_prove ⇒ guide(단추) → miss → 대가:guard_grab → x_spy_cut |
| b05_why.free.neutral.mixed[0] → r4_prove.free.neutral.mixed[0] (ep01_desert.yaml:138) | 나레이션: 남자는 대꾸 없이 나를 재는 듯 내려다보았다. / 나레이션: 남자는 대꾸 없이 나를 재는 듯 내려다보았다. | 같은 줄 | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ bluff(말) → mixed → 대가:blade_closer → r4_prove ⇒ guide(말) → mixed → 대가:guard_scoff → x_spy_cut |
| b05_why.free.noble.mixed.lines[2] → r5_claim.free.improv.mixed.lines[1] (ep01_desert.yaml:164) | 나레이션: 비웃음 섞인 목소리였지만, 그는 내 말투를 곱씹는 듯했다. / 나레이션: 비웃음 섞인 목소리였지만, 붉은 눈은 나를 놓치지 않았다. | 같은 말 "비웃음섞인목소리였지만" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ noble(단추) → mixed → 대가:blade_closer → r5_claim ⇒ 즉흥 → mixed → 대가:blade_press → x_spy_cut |
| b05_why.free.plead.hit.lines[1] → b07_rule.lines[8] (ep01_desert.yaml:1111) | 나레이션: 남자는 한참 동안 내 눈을 들여다보았다. 목에 닿아 있던 칼끝이 손가락 한 마디만큼 물러났다. / 나레이션: 터벅, 터벅. 남자가 천천히 다가오더니 몸을 숙여 내 얼굴을 들여다보았다. | 같은 말 "을들여다보았다" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ plead(단추) → hit → b06_swing ⇒ dodge(단추) → hit → b07_rule → b08_gaze |
| b05_why.free.bluff.hit.lines[1] → r4_prove.free.wits.hit.lines[1] (ep01_desert.yaml:1713) | 남자: 하. 혀는 잘 돌아가는군. / 남자: 혀는 정말 잘 돌아가는군. | 같은 말 "잘돌아가는군" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:sand_fall → b03_ask → b04_blade → b05_why ⇒ bluff(단추) → hit → r4_prove ⇒ wits(단추) → hit → r4_walk → e_deal |
| b05_why.free.noble.hit.lines[0] → r5_claim.free.manners.hit.lines[0] (ep01_desert.yaml:1824) | 나레이션: 나는 모래투성이 옷자락을 쥐고, 궁정에서 배운 그대로 고개를 숙였다. / 나레이션: 나는 칼끝 앞에서도 허리를 곧게 펴고, 몸에 밴 예법대로 고개를 숙였다. | 같은 말 "대로고개를숙였다" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:sand_fall → b03_ask → b04_blade → b05_why ⇒ noble(단추) → hit → r5_claim ⇒ manners(단추) → hit → r5_price → e_value |
| b05_why.free.resist.miss.lines[0] → b06_swing.free.flee.miss.lines[0] (ep01_desert.yaml:1079) | 나레이션: 등을 돌리는 순간 호위 하나가 내 팔을 붙들어 모래 위로 넘어뜨렸다. / 나레이션: 움직이기도 전에 호위 하나가 내 팔을 붙들었다. | 같은 말 "호위하나가내팔을붙들" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:sand_fall → b03_ask → b04_blade → b05_why ⇒ resist(단추) → miss → 대가:guard_grip → b06_swing ⇒ flee(단추) → miss → 대가:blade_graze → x_spy_cut |
| b05_why.free.improv.hit.lines[0] → b06_swing.free.improv.hit.lines[0] (ep01_desert.yaml:155) | 나레이션: 어이가 없었는지 남자의 눈썹이 아주 조금 올라갔다. / 나레이션: 어이가 없었는지 남자의 눈썹이 아주 조금 올라갔다. | 같은 줄 (같은 글이 6곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:sand_fall → b03_ask → b04_blade → b05_why ⇒ 즉흥 → hit → b06_swing ⇒ 즉흥 → hit → b07_rule → b08_gaze |
| b05_why.free.improv.hit.lines[1] → b06_swing.free.improv.hit.lines[1] (ep01_desert.yaml:156) | 남자: 하. 별짓을 다 하는군. / 남자: 하. 별짓을 다 하는군. | 같은 줄 (같은 글이 6곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:sand_fall → b03_ask → b04_blade → b05_why ⇒ 즉흥 → hit → b06_swing ⇒ 즉흥 → hit → b07_rule → b08_gaze |
| b05_why.free.improv.miss.lines[0] → b06_swing.free.improv.miss.lines[0] (ep01_desert.yaml:169) | 나레이션: 호위 하나가 말없이 칼자루에 손을 얹었다. / 나레이션: 호위 하나가 말없이 칼자루에 손을 얹었다. | 같은 줄 (같은 글이 6곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:sand_fall → b03_ask → b04_blade → b05_why ⇒ 즉흥 → miss → 대가:bag_taken → b06_swing ⇒ 즉흥 → miss → 대가:blade_graze → b07_rule → b08_gaze |
| b02_people.free.improv.mixed.lines[0] → r3_dusk.free.improv.mixed.lines[0] (ep01_desert.yaml:1513) | 나레이션: 잠깐 기분은 나아졌지만, 그만큼 해가 기울고 목이 말랐다. / 나레이션: 잠깐 기분은 나아졌지만, 그만큼 해가 기울고 목이 말랐다. | 같은 줄 | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥 → mixed → 대가:map_wind → b03_ask → b04_blade → b05_why ⇒ resist(단추) → mixed → 대가:blade_closer → r3_flee → r3_dusk ⇒ 즉흥 → mixed → 대가:wind_cold → r3_night → e_road |
| b02_people.free.prices.sun → r5_claim.free.prices.sun_set (ep01_desert.yaml:1792) | 나레이션: 해가 지평선에 걸렸다. 귀찌가 미지근하다. / 나레이션: 해가 한 뼘 더 기울었다. 귀찌가 미지근해진다. | 같은 말 "다귀찌가미지근" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → mixed → 대가:sun → b03_ask → b04_blade → b05_why ⇒ noble(단추) → mixed → 대가:blade_closer → r5_claim ⇒ manners(단추) → mixed → 대가:sun_set → r5_price → e_value |
| b02_people.free.improv.miss.lines[0] → r3_dusk.free.improv.miss.lines[0] (ep01_desert.yaml:1518) | 나레이션: 아무 소용도 없었다. 나는 뜨거운 모래 위에 그대로 주저앉았다. / 나레이션: 아무 소용도 없었다. 나는 뜨거운 모래 위에 그대로 주저앉았다. | 같은 줄 | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥 → miss → 대가:sand_fall → b03_ask → b04_blade → b05_why ⇒ resist(단추) → mixed → 대가:blade_closer → r3_flee → r3_dusk ⇒ 즉흥 → miss → 대가:map_lost → r3_night → e_road |
| b02_people.free.improv.miss.lines[1] → r3_dusk.free.improv.miss.lines[1] (ep01_desert.yaml:1519) | 속마음: 내가 지금 뭘 하는 거야… / 속마음: 내가 지금 뭘 하는 거야… | 같은 줄 | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥 → miss → 대가:sand_fall → b03_ask → b04_blade → b05_why ⇒ resist(단추) → mixed → 대가:blade_closer → r3_flee → r3_dusk ⇒ 즉흥 → miss → 대가:map_lost → r3_night → e_road |
| b02_people.free.improv_bold.mixed.lines[1] → r4_prove.free.nudge[0] (ep01_desert.yaml:1646) | 나레이션: 남자의 손이 칼자루를 고쳐 쥐었다. 그러나 붉은 눈은 나에게서 떨어지지 않았다. / 나레이션: 호위 하나가 칼자루를 고쳐 쥐었다. | 같은 말 "칼자루를고쳐쥐었다" (같은 글이 2곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥(큰 행동) → mixed → 대가:foe_look → b03_ask → b04_blade → b05_why ⇒ bluff(단추) → mixed → 대가:hood_slip → r4_prove ⇒ 머뭇:threat |
| b05_why.free.prices.hood_slip → b08_gaze.free.prices.earring_warm (ep01_desert.yaml:1134) | 나레이션: 귀찌가 뜨거워져 귓불이 따끔했다. / 나레이션: 후드가 어깨 뒤로 흘러내렸다. 귀찌가 뜨거워진다. | 같은 말 "귀찌가뜨거워" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ bag(단추) → mixed → 대가:hood_slip → b06_swing ⇒ dodge(단추) → mixed → 대가:man_amused → b07_rule → b08_gaze ⇒ stare_back(단추) → mixed → 대가:earring_warm → b09_verdict → r2_bind |
| b05_why.free.prices.hood_slip → b08_gaze.free.hide_earring.miss.lines[0] (ep01_desert.yaml:1244) | 나레이션: 남자가 내 손목을 붙잡아 내렸다. 귀찌가 햇빛에 반짝였다. / 나레이션: 후드가 어깨 뒤로 흘러내렸다. 귀찌가 뜨거워진다. | 같은 말 "내렸다귀찌가" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ bag(단추) → mixed → 대가:hood_slip → b06_swing ⇒ dodge(단추) → mixed → 대가:man_amused → b07_rule → b08_gaze ⇒ hide_earring(단추) → miss → 대가:guard_whisper → x_spy_cut |
| b07_rule.lines[4] → e_survivor.lines[1] (ep01_desert.yaml:2010) | 나레이션: 살아남는 자와 죽는 자. 적어도 오늘, 나는 살아남는 쪽이었다. / 남자: 남는 것은 살아남는 자와 죽는 자. | 같은 말 "살아남는자와죽는자" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:sand_fall → b03_ask → b04_blade → b05_why ⇒ beauty(단추) → hit → b06_swing ⇒ dodge(단추) → mixed → 대가:cloak_cut → b07_rule → b08_gaze ⇒ stare_back(단추) → mixed → 대가:breath_held → b09_verdict → e_survivor |
| b06_swing.free.improv_bold.miss.lines[0] → b08_gaze.free.hide_earring.miss.lines[0] (ep01_desert.yaml:1244) | 나레이션: 남자가 내 손목을 붙잡아 내렸다. 귀찌가 햇빛에 반짝였다. / 나레이션: 남자가 내 손목을 붙잡아 멈춰 세웠다. 붉은 눈이 얼음처럼 식었다. | 같은 말 "남자가내손목을붙잡아" (같은 글이 4곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:sand_fall → b03_ask → b04_blade → b05_why ⇒ beauty(단추) → hit → b06_swing ⇒ 즉흥(큰 행동) → miss → 대가:blade_graze → b07_rule → b08_gaze ⇒ hide_earring(단추) → miss → 대가:guard_whisper → x_spy_cut |
| b08_gaze.free.improv.mixed.lines[1] → x_unmasked.lines[1] (ep01_desert.yaml:2024) | 나레이션: 붉은 눈이 그 은빛을 놓치지 않았다. 뒷말은 듣지 못했다. / 나레이션: 비웃음 섞인 목소리였지만, 붉은 눈은 나를 놓치지 않았다. | 같은 말 "놓치지않았다" (같은 글이 5곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:sand_fall → b03_ask → b04_blade → b05_why ⇒ plead(단추) → mixed → 대가:hood_slip → b06_swing ⇒ dodge(단추) → mixed → 대가:cloak_cut → b07_rule → b08_gaze ⇒ 즉흥 → mixed → 대가:breath_held → b09_verdict → x_unmasked |
| b02_people.free.improv.hit.lines[0] → r3_dusk.free.improv.hit.lines[0] (ep01_desert.yaml:1507) | 나레이션: 어이없는 짓이었지만, 이상하게도 기운이 조금 돌아왔다. / 나레이션: 어이없는 짓이었지만, 이상하게도 기운이 조금 돌아왔다. | 같은 줄 | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥 → hit → b03_ask → b04_blade → b05_why ⇒ beauty(단추) → hit → b06_swing ⇒ flee(단추) → hit → r3_flee → r3_dusk ⇒ 즉흥 → hit → r3_night → e_road |
| b02_people.free.improv.hit.lines[1] → r3_dusk.free.improv.hit.lines[1] (ep01_desert.yaml:1508) | 속마음: 좋아, 아직 이럴 힘은 남았네. / 속마음: 좋아, 아직 이럴 힘은 남았네. | 같은 줄 | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ 즉흥 → hit → b03_ask → b04_blade → b05_why ⇒ beauty(단추) → hit → b06_swing ⇒ flee(단추) → hit → r3_flee → r3_dusk ⇒ 즉흥 → hit → r3_night → e_road |
| b05_why.free.beauty.miss.lines[2] → r2_bind.free.deny.miss.lines[1] (ep01_desert.yaml:1355) | 나레이션: 말이 꼬일수록 붉은 눈은 더 차가워졌다. / 나레이션: 싸늘한 침묵. 남자의 눈빛이 한층 더 차가워졌다. | 같은 말 "더차가워졌다" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:sand_fall → b03_ask → b04_blade → b05_why ⇒ beauty(단추) → miss → 대가:bag_taken → b06_swing ⇒ dodge(단추) → mixed → 대가:cloak_cut → b07_rule → b08_gaze ⇒ stare_back(단추) → mixed → 대가:breath_held → b09_verdict → r2_bind ⇒ deny(단추) → miss → 대가:word_slip → e_spy |
| b05_why.free.beauty.miss.lines[2] → r2_bind.free.prices.word_slip (ep01_desert.yaml:1314) | 나레이션: 말끝이 떨렸다. 남자의 눈빛이 굳었다. / 나레이션: 싸늘한 침묵. 남자의 눈빛이 한층 더 차가워졌다. | 같은 말 "남자의눈빛이" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:sand_fall → b03_ask → b04_blade → b05_why ⇒ beauty(단추) → miss → 대가:bag_taken → b06_swing ⇒ dodge(단추) → mixed → 대가:cloak_cut → b07_rule → b08_gaze ⇒ stare_back(단추) → mixed → 대가:breath_held → b09_verdict → r2_bind ⇒ deny(단추) → miss → 대가:word_slip → e_spy |
| b06_swing.lines[3] → b06_swing.free.press[0] (ep01_desert.yaml:146) | 남자: 그것뿐인가? / 남자: 할 말은 그것뿐인가? | 거의 같은 줄 (같은 글이 2곳 짝) | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ run(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ beauty(말) → mixed → 대가:blade_closer → b06_swing ⇒ 머뭇:threat ⇒ 머뭇:press |
| b09_verdict.lines[3] → r2_bind.free.deny.hit.lines[1] (ep01_desert.yaml:1342) | 남자: 끝까지 눈을 피하지 않는군. / 남자: 눈은 피하지 않는군. | 같은 말 "피하지않는군" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ plead(단추) → hit → b06_swing ⇒ dodge(단추) → mixed → 대가:cloak_cut → b07_rule → b08_gaze ⇒ stare_back(단추) → hit → b09_verdict → r2_bind ⇒ deny(단추) → hit → e_spy |
| b05_why.free.plead.mixed.lines[0] → r2_bind.free.deny.hit.lines[0] (ep01_desert.yaml:1341) | 아시나: 아무도 안 보냈어요! 전 그냥 길 잃은 여행자라고요! / 아시나: 제발요, 전 그냥 길 잃은 여행자예요! | 같은 말 "요전그냥길잃은여행자" | 시작 → b00_open → b01_sand → b02_people ⇒ watch(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ plead(단추) → mixed → 대가:blade_closer → b06_swing ⇒ dodge(단추) → hit → b07_rule → b08_gaze ⇒ stare_back(단추) → hit → b09_verdict → r2_bind ⇒ deny(단추) → hit → e_spy |
| b08_gaze.free.stare_back.miss.lines[1] → r2_bind.free.silent.miss.lines[0] (ep01_desert.yaml:1407) | 나레이션: 먼저 풀린 건 다리였다. 남자는 시시하다는 듯 등을 돌렸다. / 나레이션: 허둥대는 나를 보며 남자가 시시하다는 듯 눈을 가늘게 떴다. | 같은 말 "시시하다는듯" | 시작 → b00_open → b01_sand → b02_people ⇒ watch(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ plead(단추) → hit → b06_swing ⇒ dodge(단추) → hit → b07_rule → b08_gaze ⇒ stare_back(단추) → miss → 대가:guard_whisper → b09_verdict → r2_bind ⇒ silent(단추) → miss → 대가:bag_search → e_spy |
| b02_people.free.prices.sun → engine:CLOCK_FALLBACK (ep01_desert.yaml:437) | 나레이션: 해가 한 뼘 더 기울었다. 귀찌가 미지근해진다. / 나레이션: 해가 한 뼘 더 기울었다. 귀찌가 미지근해진다. | 같은 줄 | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ watch(단추) → mixed → 대가:sun → b03_ask → b04_blade → b05_why ⇒ beauty(단추) → hit → b06_swing ⇒ 머뭇:threat ⇒ 머뭇:press ⇒ 머뭇:clock → x_collapse |
| b08_gaze.free.press[0] → b08_gaze.free.prices.man_closer (ep01_desert.yaml:1136) | 나레이션: 남자가 턱을 들어 얼굴을 더 가까이 들여다본다. / 나레이션: 남자는 대답 대신 얼굴을 더 가까이 들이밀었다. | 같은 말 "얼굴을더가까이들" | 시작 → b00_open → b01_sand → b02_people → 장면검사:sandstorm ⇒ run(단추) → miss → 대가:foe_approach → b03_ask → b04_blade → b05_why ⇒ beauty(단추) → miss → 대가:bag_taken → b06_swing ⇒ dodge(단추) → mixed → 대가:man_amused → b07_rule → b08_gaze ⇒ 머뭇:threat ⇒ 머뭇:press ⇒ stare_back(단추) → mixed → 대가:man_closer → b09_verdict → r2_bind |

짧은 줄 말버릇(한 갈래에서 3번 이상):

| 줄 | 횟수 |
| --- | --- |
| 남자: 지루하군. | 한 갈래에서 최대 4번 |
| 남자: 하. | 한 갈래에서 최대 3번 |

### 8. 앞에서 안 나온 말이 처음 나오는 자리
고른 낱말(TERMS)이 어떤 갈래에서 처음 화면에 나오는 줄. 처음 나온 자리가 갈래마다 다르거나, 앞말을 가리키는 꼴이면 전제 후보다. 판단은 위 "사람 판단" 표에 적는다.

| 어디 | 글 | 내용 |
| --- | --- | --- |
| b02_people.free.offer[0] (ep01_desert.yaml:433) | 나레이션: 셋 중 하나가 물주머니를 허리에서 풀어 흔들어 보였다. 다가가면 받을 수 있을 것 같았다. 그만큼 가까이 가야 했다. | "물주머니" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: r3_night |
| b02_people.free.prices.foe_approach (ep01_desert.yaml:441) | 나레이션: 세 사람이 먼저 이쪽으로 방향을 틀었다. 거리는 이제 그들이 정한다. | "세 사람" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b02_people, b03_ask, r3_slip |
| b02_people.free.run.miss.lines[0] (ep01_desert.yaml:525) | 나레이션: 몇 걸음 못 가 모래에 고꾸라졌다. 고개를 드니 세 남자가 나를 내려다보고 있었다. | "세 남자" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b02_people |
| b02_people.free.watch.hit.lines[0] (ep01_desert.yaml:543) | 나레이션: 세 사람. 가운데 남자의 터번에는 붉은 보석이 박혀 있고, 양옆의 둘은 그를 지키듯 서 있었다. | "터번" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b05_why, b02_people, r3_slip |
| b02_people.free.watch.hit.lines[1] (ep01_desert.yaml:544) | 속마음: 보통 신분은 아니야. 호위가 둘… 한 사람은 복면까지 썼어. | "호위" 이 이 길에서 처음 나온다(thought, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b05_why, b03_ask, r3_slip · "복면"(가리키는 꼴, 다른 길 첫 자리: b06_swing, r4_walk, r4_prove) |
| b02_people.free.watch.mixed.lines[0] (ep01_desert.yaml:552) | 나레이션: 가운데 남자의 터번에서 붉은 보석이 번쩍였다. 붉은 눈이 이쪽을 스쳤다 — 숨은 건 들켰지만, 노려보는 눈은 아니었다. | "터번" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b05_why, b02_people, r3_slip |
| b02_people.twist.interrupt.sandstorm[0] (ep01_desert.yaml:412) | 나레이션: 모래바람이 덮쳤다. 후드를 움켜쥐고 바위 뒤에 웅크린 채 한참을 버텼다. | "후드" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b05_why, b06_swing |
| b03_ask.lines[0] (ep01_desert.yaml:611) | 나레이션: 그때 등 뒤에서 모래 밟는 소리가 났다. 호위 하나가 내 팔을 붙잡아 세 사람 앞으로 끌어냈다. | "호위" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b05_why, b02_people, r3_slip |
| b05_why.free.bag.mixed.lines[1] (ep01_desert.yaml:906) | 남자: 마법 가방이라. 떠돌이치고는 귀한 걸 지녔군. | "마법 가방" 이 이 길에서 처음 나온다(speech, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b02_people, b05_why, b06_swing, e_spy |
| b05_why.free.beauty.hit.lines[1] (ep01_desert.yaml:720) | 아시나: 대륙에서 하나뿐인, 미소녀니까요. | "미소녀" 이 이 길에서 처음 나온다(speech). 다른 길의 첫 자리: b05_why |
| b05_why.free.beauty.miss.lines[0] (ep01_desert.yaml:745) | 아시나: 저, 저는… 대륙에서 하나뿐인 미소녀라서요! | "미소녀" 이 이 길에서 처음 나온다(speech). 다른 길의 첫 자리: b05_why |
| b05_why.free.beauty.mixed.lines[0] (ep01_desert.yaml:733) | 아시나: 왜냐하면 저는… 대륙에서 하나뿐인, 미소녀니까요. | "미소녀" 이 이 길에서 처음 나온다(speech). 다른 길의 첫 자리: b05_why |
| b05_why.free.bluff.hit.lines[0] (ep01_desert.yaml:793) | 아시나: 저를 살려 두면 분명 쓸모가 있을 거예요. 장담해요! | "쓸모" 이 이 길에서 처음 나온다(speech, 앞말을 가리키는 꼴). 다른 길의 첫 자리: r4_prove, r5_price |
| b05_why.free.bluff.miss.lines[1] (ep01_desert.yaml:812) | 남자: 첩자다운 말이군. | "첩자" 이 이 길에서 처음 나온다(speech). 다른 길의 첫 자리: b05_why, x_spy_cut, e_spy, r2_bind |
| b05_why.free.bluff.mixed.lines[0] (ep01_desert.yaml:801) | 아시나: 저는 크라차 상단 사람이에요. 저를 해치면 곤란해지실걸요? | "상단" 이 이 길에서 처음 나온다(speech, 앞말을 가리키는 꼴). 다른 길의 첫 자리: 없음 |
| b05_why.free.bluff.mixed.lines[1] (ep01_desert.yaml:802) | 남자: 상단 사람이 짐도 낙타도 없이 사막을 헤맨다? | "낙타" 이 이 길에서 처음 나온다(speech, 앞말을 가리키는 꼴). 다른 길의 첫 자리: r4_prove |
| b05_why.free.noble.miss.lines[1] (ep01_desert.yaml:848) | 남자: 북쪽 말씨로군. 첩자의 변명치고는 서툴다. | "첩자" 이 이 길에서 처음 나온다(speech). 다른 길의 첫 자리: b05_why, x_spy_cut, e_spy, r2_bind · "북쪽"(다른 길 첫 자리: r5_claim, r4_walk, r2_bind) · "말씨"(다른 길 첫 자리: r5_claim, r2_bind) |
| b05_why.free.plead.mixed.lines[1] (ep01_desert.yaml:771) | 남자: 애원은 첩자도 할 줄 알지. | "첩자" 이 이 길에서 처음 나온다(speech, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b05_why, x_spy_cut, e_spy, r2_bind |
| b05_why.free.prices.bag_taken (ep01_desert.yaml:681) | 나레이션: 호위가 마법 가방을 낚아채 갔다. | "마법 가방" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b02_people, b05_why, b06_swing, e_spy |
| b05_why.free.prices.hood_slip (ep01_desert.yaml:679) | 나레이션: 후드가 어깨 뒤로 흘러내렸다. 귀찌가 뜨거워진다. | "후드" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b02_people, b06_swing |
| b06_swing.free.block.mixed.lines[1] (ep01_desert.yaml:1043) | 속마음: 마법 가방인 거 들켰으려나… | "마법 가방" 이 이 길에서 처음 나온다(thought). 다른 길의 첫 자리: b02_people, b05_why, e_spy |
| b06_swing.free.dodge.mixed.lines[0] (ep01_desert.yaml:1003) | 나레이션: 간신히 피했지만 모래 위로 나동그라졌다. 후드가 벗겨지고, 귀찌가 뜨겁게 달아올랐다. | "후드" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b02_people, b05_why, b06_swing |
| b06_swing.free.flee.mixed.lines[0] (ep01_desert.yaml:1073) | 나레이션: 몇 걸음 못 가 복면을 쓴 호위가 앞을 막아섰다. | "복면" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b02_people, r4_walk, r4_prove |
| b06_swing.free.neutral.mixed[1] (ep01_desert.yaml:973) | 나레이션: 그 바람에 후드가 벗겨졌다. | "후드" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b02_people, b05_why, b06_swing |
| e_quit.ending.next_hook (ep01_desert.yaml:1931) | 결말: 새로 시작하면 다시 지르다에서 이어진다. | "지르다" 이 이 길에서 처음 나온다(결말, 앞말을 가리키는 꼴). 다른 길의 첫 자리: 없음 |
| e_spy.ending.summary (ep01_desert.yaml:1989) | 결말: 목숨은 건졌지만 그 남자는 아시나를 첩자로 굳게 의심한다. 마법 가방을 빼앗긴 채 끌려간다. | "첩자" 이 이 길에서 처음 나온다(결말). 다른 길의 첫 자리: b05_why, x_spy_cut, r2_bind |
| e_spy.lines[1] (ep01_desert.yaml:1985) | 나레이션: 거친 밧줄이 손목을 파고들었다. 마법 가방까지 빼앗기는 걸 보면서, 나는 정신을 잃었다. | "마법 가방" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b02_people, b05_why, b06_swing |
| identity.omen[0] (ep01_desert.yaml:295) | 속마음: 웰든이란 이름이 목까지 올라왔다. 여긴 적국이다. | "웰든" 이 이 길에서 처음 나온다(thought, 앞말을 가리키는 꼴). 다른 길의 첫 자리: 없음 |
| r2_bind.free.deny.mixed.lines[1] (ep01_desert.yaml:1349) | 남자: 첩자도 그렇게 말하지. | "첩자" 이 이 길에서 처음 나온다(speech, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b05_why, x_spy_cut, e_spy |
| r2_bind.lines[0] (ep01_desert.yaml:1299) | 나레이션: 마른 풀 냄새가 나는 밧줄이 눈에 들어왔다. 호위의 칼, 남자의 등, 어깨의 가방. | "밧줄" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: r4_walk |
| r2_bind.lines[2] (ep01_desert.yaml:1301) | 남자: 말씨는 북쪽이다. 혼자 사막을 건너는 여자도 드물지. | "북쪽" 이 이 길에서 처음 나온다(speech, 앞말을 가리키는 꼴). 다른 길의 첫 자리: r5_claim, b05_why, r4_walk · "말씨"(가리키는 꼴, 다른 길 첫 자리: r5_claim, b05_why) |
| r3_night.lines[6] (ep01_desert.yaml:1627) | 나레이션: 남자는 품에서 물주머니를 꺼내 내 발치에 던졌다. | "물주머니" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b02_people |
| r3_slip.lines[0] (ep01_desert.yaml:1428) | 나레이션: 나는 세 사람에게서 멀어졌다. | "세 사람" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b02_people, b03_ask |
| r3_slip.lines[1] (ep01_desert.yaml:1429) | 속마음: 터번에 호위까지… 저런 사람들한테 길을 물었다간 무슨 꼴을 당할지 몰라. | "터번" 이 이 길에서 처음 나온다(thought, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b05_why, b02_people · "호위"(가리키는 꼴, 다른 길 첫 자리: b05_why, b02_people, b03_ask) |
| r4_prove.lines[1] (ep01_desert.yaml:1639) | 남자: 쓸모가 있다고 했나. | "쓸모" 이 이 길에서 처음 나온다(speech, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b05_why, r5_price |
| r4_walk.lines[3] (ep01_desert.yaml:1769) | 나레이션: 밧줄은 없었다. 복면을 쓴 호위 하나가 내 곁에 말없이 붙었을 뿐이다. | "복면" 이 이 길에서 처음 나온다(narration, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b02_people, b06_swing, r4_prove · "밧줄"(가리키는 꼴, 다른 길 첫 자리: r2_bind) |
| r4_walk.lines[4] (ep01_desert.yaml:1770) | 속마음: …잠깐. 해가 왼쪽에 있는데, 왜 우리는 북쪽으로 걷는 거야? | "북쪽" 이 이 길에서 처음 나온다(thought). 다른 길의 첫 자리: r5_claim, b05_why, r2_bind |
| r5_claim.lines[3] (ep01_desert.yaml:1783) | 남자: 말씨는 북쪽이군. 증명해 봐라, 여자. | "북쪽" 이 이 길에서 처음 나온다(speech, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b05_why, r4_walk, r2_bind · "말씨"(가리키는 꼴, 다른 길 첫 자리: b05_why, r2_bind) |
| r5_price.lines[0] (ep01_desert.yaml:1905) | 남자: 진짜라면 쓸모가 있다. 가짜라면 그때 베면 된다. | "쓸모" 이 이 길에서 처음 나온다(speech, 앞말을 가리키는 꼴). 다른 길의 첫 자리: b05_why, r4_prove |

### 모형의 한계
- 행운(실패를 대가 있는 성공으로 바꿈)은 대가 있는 성공 갈래로 대신한다. 행운 수치 자체는 따지지 않는다.
- 말로 입력한 판은 LLM 이 없을 때(--no-llm)의 대체 줄(typedFallbackLines·neutral)로 본다. LLM 이 쓰는 글은 점검하지 않는다.
- 플레이어 낱말로만 서는 되받음(상인·여행자·고양이)과 GM 서술 판정(state_check)은 상태 탐색에 넣지 않는다.
- 끼어들기(대사 도중 입력), 여러 번 말하기의 참을성 줄, 질문 모드는 넣지 않는다. 말한 적이 있는지(말함)만 갈래로 둔다.
- 상태를 합칠 때는 그 비트 뒤에서 조건으로 읽힐 수 있는 수치·플래그만 본다(읽히지 않는 것은 갈래를 바꾸지 못한다). 그래서 6번 표의 어긋남은 합쳐진 상태 하나로 본 것이라, 같은 줄이 다른 상태에서도 어긋날 수 있다.
- 7번 '같은 말'(6글자 이상 겹침)은 후보다. "남자의 눈빛이" 같은 흔한 말이 걸린 것은 사람 판단 표에서 뺐다.

<!-- audit:end -->
