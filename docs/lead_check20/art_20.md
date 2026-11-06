# 20차 그림 교체 확인

리드 지시 20차와 20차 추가(GM 여우)의 결과다. 커밋·푸시·배포는 하지 않았고, 18080·18081은 쓰지 않았다(시험은 18191~18195).

## 바뀐 것

| 항목 | 결과 |
|---|---|
| 그림 | CG 6, 후드 4, 아시나 4, 베히다트 4, 배경 5, GM 여우 4 설치. 옛 그림은 각 폴더 `sdxl/`로 옮겼다(지우지 않음). 베히다트 4장은 `work/art/gpt/behidat/`와 해시 일치 |
| 입식 마스크 | `web/style.css`의 마스크를 없앴다. 부츠와 머리가 보인다 |
| 입식 위치 | 1440 기준 대사창 위 575, 입식 높이 591. 후드 머리 74·발 573·눈 143, 베히다트 머리 13~21·발 566~573·눈 102~110 |
| 눈높이 | 입식 파일 기준 후드 404, 베히다트 316, 발 1519로 지시값과 같다. 화면 차이는 약 33px(1440 기준) |
| 배경 | `desert_near` 추가, `desert_blade`·`desert_glare` 키 삭제. 배경 label은 화면에 안 나오므로 새 글이 아니다 |
| 컷인 | `showCutin` 800ms, 입력을 막지 않음, 규칙 변화 없음 |
| 소지품 | yaml `items`에 `file` 칸 추가, 소지품 창에 작은 그림 표시 |
| 표정 전환 | 이미 `morphSprite` 150ms로 있어 새로 넣지 않았다 |

## 내가 판단한 것

1. **near 범위를 지시보다 넓혔다.** 지시는 b04~b08이고, 같은 자리에 머무는 b09·r2_bind·r4_prove·r5_claim·r5_price도 near로 했다. 걸어 나가는 r3_flee·r3_slip·r4_walk·e_deal은 wide로 뒀다.
2. **대성공은 총합 12 이상으로 읽었다.** 지시의 "대성공 12" 해석이다. 주사위 6+6이어도 수치 합으로 판단하므로, 6+4+수치 2도 대성공 컷인이 뜬다.
3. **행운을 쓰기 전 판정에도 실패 컷인이 뜬다.** 굴린 직후 실패면 뜨고, 그 뒤 행운으로 결과가 바뀌어도 컷인은 이미 지나간 상태다.

## 빈 사진 원인

| 사진 | 증상 | 원인 | 근거 |
|---|---|---|---|
| 첫 장면 350ms | 입식이 안 보임 | WebKit 헤드리스 사진 찍기가 늦게 반영 | Bun.WebView 연사에서 500ms까지 입식이 없다가 다음 장에 한 번에 나타남. 같은 시점 CSS 불투명도는 410ms에 1.00. Chromium 연사는 0ms 0.69, 140ms 0.94, 268ms 1.00이고 사진에도 반투명 단계가 보임 |
| 대성공 컷인 | 효과가 안 보임 | 같은 문제 | Chromium 1440에서 다시 찍으니 대성공·실패 모두 보임 |

입식 그림은 첫 장면 전에 이미 불러와 있고(`complete`, naturalWidth 1024), 불투명도는 대사 시작과 같은 때 오른다. 게임 쪽 지연이 아니므로 코드는 고치지 않았다. `decoding='sync'`를 시험했으나 WebKit 사진이 그대로여서 되돌렸다. `first_scene_350ms.png`는 오해를 부르므로 지웠다.

## 사진

경로는 모두 `docs/screenshots/art20/` 아래다.

| 사진 | 확인 내용 |
|---|---|
| `sheet.jpg` | 첫 장면, 두 인물, 칼 CG, 컷인 2종, 후드 벗은 뒤, 황혼, 밤을 모은 한 장 |
| `first_scene.png`, `two_people.png` | 부츠와 머리가 보임 |
| `hood_before.png`, `hood_after.png` | 후드 벗는 전환 전후. 머리 위치 튐 없음 |
| `cg_swing.png` | 칼날·날밑·손잡이가 보임 |
| `dusk.png`, `night.png` | 황혼·밤 배경과 입식 |
| `cutin_crit.png`, `cutin_miss.png` | 컷인 2종(Chromium 1440) |
| `items_window.png` | 소지품 창 그림 3종 |
| `fox_neutral.png`, `fox_smile.png`, `fox_thinking.png`, `fox_surprised.png` | 여우 4표정. 칸 137x142px에서 생각 중 표정의 물음표가 안 잘림 |
| `phone_two.png` | 휴대폰 390x844. 두 인물의 머리와 발이 보임 |
| `first_scene_fade_chromium.jpg` | Chromium 연사 6장 |

## 검증 결과

- `test_output20.txt`: tsc 종료 코드 0, `bun test` 251 pass / 0 fail
- `e2e_output20.txt`: `e2e/autoplay.ts` 1~5 모두 통과(외부 연결 0건, LLM 없음), `e2e/feedback.ts` 통과

## 말하지 않는 인물 밝기(리드 추가 지시)

`.slot.dim`의 `brightness`를 0.5에서 0.72로 올렸다. `saturate(0.6)`은 그대로다. 후보 0.5, 0.65, 0.72, 0.8을 같은 장면에서 비교했다. 0.72는 어두운 옷의 베히다트와 후드 아시나의 얼굴·눈이 보이면서 말하는 인물과 구분되고, 0.8은 구분이 약해진다.

- 비교: `docs/screenshots/art20/dim_compare_behidat.jpg`, `dim_compare_hood.jpg`(왼쪽부터 0.5, 0.65, 0.72, 0.8)
- 다시 찍은 사진: `two_people.png`, `hood_after.png`(Chromium 1440, 계산된 필터 `brightness(0.72) saturate(0.6)`). `sheet.jpg`도 다시 모았다.
- 검증: `test_output20b.txt` tsc 종료 코드 0, `bun test` 251 pass / 0 fail

## 고치지 않고 알려 둘 것

- **휴대폰 세로 화면은 무대가 작다.** 390x844에서 무대가 390x219로 위아래가 검게 비어 있다. 이번 교체로 생긴 것이 아니다.
- 실제 로컬 LLM을 켠 판은 이번에 돌리지 않았다. e2e는 모두 `--no-llm`이다.
