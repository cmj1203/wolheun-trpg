# 19-G 의심·귀찌 클록 + 귀찌 경제 — 대조표

리드 결정(apply_plan 4절): 의심·귀찌만 Blades 식 조각 시계, 집착·호감은 막대 그대로. 위험 예고는 19-C 징조 + 이 클록으로만.

## 1. 화면

| 수치 | 모양 | 칸 수 | 켜진 칸 | 위험 표시 |
|---|---|---|---|---|
| 의심 | 차오르는 시계(progress) | 10 | 찬 만큼 | 7칸째부터 테두리 붉음. 값이 7 이상이면 켜진 칸 전체가 위험 색 |
| 귀찌 수명 | 줄어드는 시계(countdown) | 8(시작값과 같음) | 남은 만큼 | 마지막 2칸 테두리 붉음. 값이 2 이하면 켜진 칸이 위험 색 |
| 집착·호감·탈주·행운 | 막대 | - | - | 전과 같음 |

- 위험 문턱의 출처는 시나리오 `fates[].warn.when`(`의심 >= 7`, `귀찌 <= 2`) 하나다. `trackView()`(types.ts)가 읽어 `TrackView.clock.warnAt`으로 화면에 넘긴다. yaml 문턱을 바꾸면 클록도 따라간다.
- 숨김 수치(남자 만나기 전 의심·집착·호감)는 전과 같이 `trackGate`로 가려지고, 열리면 클록으로 나온다.
- 결과 화면의 수치 목록(`summary.ts`)도 같은 `trackView()`를 써 클록으로 나온다.

| 사진 | 장면 | 확인한 값(DOM) |
|---|---|---|
| `docs/screenshots/clock19g/clock_normal.png` | b05_why, 의심 열림 | 의심 4/10(켜짐 4, 위험 아님) · 귀찌 6/8(켜짐 6, 위험 아님) |
| `docs/screenshots/clock19g/clock_suspicion_danger.png` | r4_prove, 의심 7 | 의심 7/10 위험 · 귀찌 7/8 |
| `docs/screenshots/clock19g/clock_earring_danger.png` | r3_dusk, 귀찌 1 | 의심 4/10 · 귀찌 1/8 위험 |
| `docs/screenshots/clock19g/e2e/05_free_input.png` | e2e 갈래 1 첫 자유 입력 | 귀찌 7/8(남자 만나기 전이라 의심 숨김) |

사진 스크립트: `bun work/demo-slice/shoot_clock19g.ts` (18192, LLM 없음, 저장은 `app/saves-lane`).

## 2. 귀찌 경제 — 300시드 탐색(`cd app && bun ../work/demo-slice/search_fates19g.ts 300`)

수용 기준(HANDOFF 578행 판단 4): 혼잣말 2회 + 귀찌 손실 정책에서 x_unmasked 도달 5% 이상(경고 거친 뒤), collapse 100% 미만.

| 정책 | 18차(19-B 전) | 19-G 전(지금 콘텐츠) | 19-G 후(cold_night -1) |
|---|---|---|---|
| unmasked: 혼잣말 2회 + 귀찌 손실 | 0/300 | 119/300(경고 거침 107, 없이 12) | 115/300(경고 거침 **107 = 36%**, 없이 8) |
| unmasked: 귀찌 손실만(머뭇 없음) | - | 32/300(경고 없이 23) | 21/300(경고 없이 12) |
| spy_cut: 의심 최대 | 35/300 | 109/300 | 109/300 |
| collapse: 같은 자리 혼잣말만 | 300/300 | 300/300 | 300/300 |
| 보통(기본 접근, 머뭇 없음) | - | unmasked 8/300, collapse 0 | unmasked 8/300, collapse 0 |
| 무작위(접근·선택지 무작위) | - | unmasked 3/300, collapse 0 | unmasked 2/300, collapse 0 |

판단:
- 18차의 unmasked 0/300은 19-B 대가 표가 들어오기 전 수치다. 대가 표(세계 무브 -1, 시간 대가 -1, hard 대가)가 들어온 뒤로는 같은 정책에서 36%라 기준을 넘는다. 시작값·time 비트는 손대지 않았다.
- 고친 것 하나: r3_dusk hard 대가 `cold_night` 귀찌 -2 → -1(탈주 -1은 그대로). miss(-2)와 겹치면 한 판정에 8칸 중 4칸이 사라져 r3_dusk→r3_night→e_road(반응할 자리 없음) 길에서 경고 없이 끝났다(경고 없는 unmasked 23건이 전부 이 자리). -1로 낮추면 최대 -3이고 경고 없는 끝이 12→8건으로 준다. 남은 8건은 합의대로(반응할 자리가 없는 길에는 징조를 내지 않음) 생략된 것이고, 클록이 남은 칸을 항상 보여 주니 예고 없는 끝은 아니다.
- collapse 300/300은 탐색 정책 탓이다. 그 정책은 행동을 전혀 안 하고 혼잣말만 하니 세계 무브 ①징조→②압박→④시간이 머뭇을 셋 쌓아 반드시 쓰러진다(19-D 설계 그대로, 경고는 300/300 거침). 한 번이라도 행동하는 보통·무작위 정책에서는 collapse 0/300이다. "100% 미만"은 행동 없는 정책에는 뜻이 없어 그대로 두고, 설계는 바꾸지 않았다.

## 3. 테스트·e2e

- `docs/lead_check19/test_output19g.txt`: bun test 242 pass / 0 fail (새 테스트 1: 의심·귀찌만 clock, warnAt 7·2, 귀찌 칸 수 = 시작값).
- `docs/lead_check19/e2e_output19g.txt`: 갈래 1(18191, --no-llm) 통과.
- `bunx tsc --noEmit` 0.

## 4. 사용자 OK가 필요한 후보(리드가 묶어 물어 주세요)

- `app/src/engine/types.ts` TRACK_INFO 귀찌 desc(화면 툴팁·GM 프롬프트에 쓰임): "변장 귀찌의 남은 힘. 낮아져도 변장은 풀리지 않지만 마음이 급해져 판정에 불리해진다" → 0이면 변장이 풀려 은발이 드러난다는 사용자 OK(19-E lore earring_power)와 어긋남. 안 고쳤음.
