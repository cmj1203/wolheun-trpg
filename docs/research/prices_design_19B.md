# 19-B 대가 표 설계 (2026-11-04, 리드 확인용)

근거: `solo_trpg_apply_plan.md` 1절 ⑥·2절 #3, `solo_trpg_study.md` 2-1(Ironsworn 약한 성공·Pay the Price)·2-3(Blades 결과 5종, "Don't inflict a complication that negates a successful roll"), `demo_structure_2026-11-04.md` 1~2절.

## 0. 지금 상태 (app/content/ep01_desert.yaml 전수 조사)

- 자유 입력 비트 8개(b02_people, b05_why, b06_swing, b08_gaze, r2_bind, r3_dusk, r4_prove, r5_claim). b01_sand 는 18차에서 free 가 빠짐.
- 접근 27개 + improv 8개 = 35개. mixed 와 miss 의 effects 가 똑같은 것 8개(b02 improv, r3_dusk improv, 그리고 improv effects 가 아예 없는 비트 6개).
- 나머지 27개도 대가가 전부 수치(의심 +1/+2, 귀찌 -1/-2, 집착 +1)뿐. 소지품·자리·상대 행동·시간이 허구에 남는 대가는 0개. 플래그는 hit 쪽 분기용(도주·거래·신분)이지 대가가 아니다.
- 엔진: `finishResolve`(engine.ts 1197~)가 `approach.outcomes[tier]` 하나를 고르고 `gm.narrate`에 gist 를 넘긴 뒤 `applyEffects(outcome.effects)`. Effects 는 tracks·flags·gain·lose 네 칸이 이미 있고 GameState.items 도 있다 → 새 상태 칸 없이 태그 5종을 다 표현할 수 있다.

## 1. 스키마 (yaml)

비트의 `free:` 아래에 `prices:` 4~6개.

```yaml
prices:
  - id: sun                 # 비트 안에서 고유
    tag: 시간               # 수치 | 소지품 | 자리 | 상대행동 | 시간
    weight: soft            # soft: 7~9 와 6- 모두 가능 / hard: 6- 전용
    text: 해가 한 뼘 더 기울었다. 귀찌가 미지근해진다.   # 허구 사실 한 줄. GM 이 서술에 반드시 녹임
    effects: { tracks: { 귀찌: -1 } }
    if: "item:magic_bag"    # 선택. 상태 조건
    once: true              # 선택. 한 판에 한 번만
```

Outcome 에 `price` 칸 추가 (`types.ts Outcome`):

```yaml
outcomes:
  hit:   { gist: ..., lines: [...], effects: {...} }                       # price 없음
  mixed: { gist: ..., lines: [...], effects: {...}, price: [sun, open_sand] }   # 이 중 1개를 시드 난수로
  miss:  { gist: ..., lines: [...], effects: {...}, price: [foe_approach, sand_fall] }
```

`price` 를 안 적은 접근과 improv 는 비트 `prices` 전체에서 뽑는다(mixed → soft 중 1개, miss → hard 우선 1개, hard 가 없으면 soft 1개 + outcome.effects). improv effects 가 없는 비트 6개가 이걸로 해결된다.

## 2. 뽑기 규칙 (engine.ts, 순수 함수 `drawPrice` 로 분리)

1. 후보 = `outcome.price`(없으면 비트 `prices`) 중 `if` 통과 · weight 맞음(mixed 는 soft 만) · `once` 미사용.
2. 같은 장면에서 이미 뽑힌 id 는 뒤로 민다(`state.free.prices: string[]` 에 기록). 후보가 다 쓰이면 비운다.
3. `state.rng`(시드 고정)로 뽑는다 → 같은 시드면 같은 대가, e2e·테스트 재현 가능.
4. 효과 합산: `outcome.effects` 먼저, 그다음 `price.effects`. 둘 다 `applyEffects` 그대로.
5. GM: `narrate` 입력에 `price: { tag, text }` 를 더하고 gist 끝에 `대가: {text}` 를 붙여 서술에 반드시 들어가게 한다. LLM 폴백(작가 lines)일 때는 lines 뒤에 `나레이션: {text}` 한 줄을 붙인다. validate 에 '대가 text 의 핵심 명사 1개 이상 포함' 검사는 넣지 않는다(과잉 재생성 우려) — gist 강제로 충분한지 26B 대조표에서 확인.
6. 화면: dice 칸 아래 `대가 · {tag} — {text}` 한 줄(hit 은 없음). 여우 말풍선이 아니라 UI 요소(설계안 ⑪). 설계안 2절 #2 의 '결과 뒤 대가 한 줄'이 이것.
7. 기록: GameEvent `price { id, tag, text }` → 저장 로그에 남겨 19-H 리플레이가 쓴다.

## 3. '7~9 대가는 성공을 뒤집지 않는다' (로더가 검사)

soft 대가는

- `next` 가 없다(라우팅은 outcome.next 만).
- flags 를 false 로 만들지 않고, **그 접근의 hit outcome 이 true 로 세우는 플래그(도주·거래·신분·귀찌_숨김 …)를 건드리지 않는다.**
- 탈주 track 을 내리지 않는다.
- 소지품을 잃게 하지 않는다(lose 금지) — 소지품 태그의 soft 는 '찢김·젖음' 플래그로 쓴다.

hard 대가(6- 전용)는 lose·탈주 감소·플래그 되돌림이 가능하다. 위반은 `scenario.ts` 로드 때 실패: `b02_people.prices.sun: soft 대가가 hit 플래그 '도주' 를 건드림`.

## 4. 예시 비트 2개

### b02_people (사막, 멀리 사람 셋) — 6개

| id | tag | weight | text | effects |
|---|---|---|---|---|
| sun | 시간 | soft | 해가 한 뼘 더 기울었다. 귀찌가 미지근해진다. | 귀찌 -1 |
| map_wind | 소지품 | soft | 바람에 지도 한 귀퉁이가 찢겨 날아갔다. | flags 지도_찢김 (r3_dusk read 에 mod -1) |
| open_sand | 자리 | soft | 바위 그늘을 벗어나 트인 모래 위에 서 버렸다. 숨을 데가 없다. | flags 자리_트임 (b06 dodge 에 mod -1) |
| foe_look | 상대행동 | soft | 셋 중 하나가 걸음을 멈추고 이쪽을 똑바로 본다. | 의심 +1 |
| foe_approach | 상대행동 | hard | 세 사람이 먼저 이쪽으로 방향을 틀었다. 거리는 이제 그들이 정한다. | 의심 +2, flags 상대_먼저 |
| sand_fall | 수치 | hard | 모래에 무릎까지 빠져 기운이 빠졌다. | 귀찌 -1, 탈주 -1 |

run(달려가 길을 묻는다): mixed `price: [sun, open_sand]`, miss `price: [foe_approach, sand_fall]`. 기존 effects(mixed 귀찌 -1 / miss 의심 +1)는 유지하고 대가가 허구를 더한다.
watch·avoid·improv 는 price 생략 → 비트 표에서 뽑음.

### b05_why (칼끝이 목에) — 6개

| id | tag | weight | text | effects |
|---|---|---|---|---|
| blade_closer | 자리 | soft | 곡도 끝이 살갗을 눌러 피 한 방울이 맺혔다. 고개도 못 돌린다. | flags 칼_밀착 (b06 resist·dodge 에 mod -1) |
| guard_step | 상대행동 | soft | 호위 하나가 아시나의 뒤로 돌아가 섰다. 퇴로가 막혔다. | flags 퇴로_막힘 (b06 flee 에 mod -1) |
| hood_slip | 소지품 | soft | 후드가 반쯤 흘러내렸다. 귀찌가 뜨거워진다. | 귀찌 -1 |
| sun_dusk | 시간 | soft | 남자가 대답을 미루는 사이 해가 산등성이에 걸렸다. | 귀찌 -1 |
| man_doubt | 수치 | soft | 남자의 눈이 가늘어졌다. | 의심 +1 |
| bag_taken | 소지품 | hard | 호위가 마법 가방을 낚아채 갔다. | lose magic_bag, 의심 +1 (`if: item:magic_bag`) |

bag(가방에서 물건을 꺼낸다): mixed `[hood_slip, man_doubt]`, miss `[bag_taken, guard_step]`. bag_taken 뒤에는 `!item:magic_bag` 조건으로 bag 접근이 사라진다(yaml 80행에 같은 조건이 이미 있음).
beauty·plead·bluff·noble·resist·improv 는 생략 → 비트 표.

새 플래그 5개(지도_찢김·자리_트임·상대_먼저·칼_밀착·퇴로_막힘)는 뒤 접근의 `mods`(if/value/label 이미 있음)로 -1 을 연결해 '대가가 뒤에 되돌아온다'(설계안 ⑫)를 만든다. 나머지 비트 6개의 표는 같은 틀로 레인이 원작 톤에 맞춰 쓴다(새 글이라 '화면·문서 글 규칙'대로 홍보·설명조 없이).

## 5. 테스트 (tests/prices.test.ts, 시드 고정)

1. `자유 입력 비트마다 prices 가 4~6개이고 태그가 세 종류 이상이다`
2. `전수: 모든 접근과 improv 에서 mixed 와 miss 의 최종 효과가 어떤 뽑기 조합에서도 같지 않다` — 접근마다 (outcome.effects + 각 mixed 후보) 서명 집합과 (outcome.effects + 각 miss 후보) 서명 집합의 교집합이 비어야 함. 지금 yaml 로 돌리면 8개가 실패해야 한다(먼저 빨강 확인).
3. `7~9 대가는 성공을 뒤집지 않는다: soft 대가는 next·lose 가 없고 hit 가 세운 플래그와 탈주를 되돌리지 않는다`
4. `같은 시드면 같은 대가가 뽑힌다`
5. `같은 장면에서 후보가 남아 있는 한 같은 대가가 연달아 뽑히지 않는다`
6. `뽑힌 대가의 text 가 서술(폴백 포함)에 들어가고 price 이벤트로 나간다`
7. 로더: `soft 대가가 hit 플래그를 건드리면 시나리오 로드가 실패한다`

기존 `어떤 입력을 되풀이해도 LLM 없이 끝까지 간다`(branches.test.ts) 가 그대로 통과해야 한다.

## 6. 경계·묻는 것

- 19-C 와 경계: hard 대가는 19-C 의 '하드 무브'가 아니다. 위협(threat) 플래그·경고는 19-C 가 맡고, 19-B 는 판정 결과의 대가만.
- prompt 4곳(b02·b06·b08·r5)은 손대지 않는다.
- 질문 1: miss 에서 대가 수 — 추천 1개(outcome.effects 가 이미 mixed 보다 큼). 2개로 하면 6- 가 너무 무거워진다.
- 질문 2: dice 칸 아래 '대가 · tag — text' UI 한 줄(2절 6번)을 19-B 에 넣을지 — 추천 넣음(작고, 19-H 리플레이도 같은 이벤트를 쓴다).
