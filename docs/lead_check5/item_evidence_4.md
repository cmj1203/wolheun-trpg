# 리드 4차 반려 항목별 증거

코드는 `app/`. 26B 화면 플레이는 `work/demo-slice/lead_play5.mjs`. 대사 전문은 같은 폴더의 `*.txt`, 사진은 `*.png` 와 `ui/`.

## 1~12번 (26B 화면 플레이 줄)

| # | 입력 | 화면 줄 | 파일 |
|---|---|---|---|
| 1 성공 | `귀찌를 뗀다` → `응` | 나레이션 "변장을 풀려고 귀찌를 잡아당겼다. 귓불에 달라붙은 듯 꿈쩍도 하지 않았다." | E_earring_hit.txt |
| 1 대가 | `귀찌를 뗀다` → `응` | 나레이션 "변장을 풀려고 귀찌를 쥐자 불에 덴 듯 뜨거워졌다. 귀찌는 그대로였고, 빛만 한풀 꺾였다." | E_earring_mixed.txt |
| 1 실패 | `귀찌를 뗀다` → `응` | 나레이션 "억지로 비틀자 귓불이 타는 듯 아팠다. 귀찌는 그대로였고, 빛은 눈에 띄게 줄었다." | E_earring_miss.txt, A_first.txt |
| 1 다른 입력 | `머리를 보여 준다` / `정체를 밝힌다` / `변장을 벗는다` / `붉은 눈을 드러내 보인다` | 귀찌가 안 빠지는 고정 줄 / "말이 목구멍까지 올라왔다가 겨우 멈췄다." / 고정 줄 / 모델 줄에 노출 없음 | F_reveal.txt, I_expose2.txt |
| 2 | `근데 왜 변장했어?` (여우 줄에 끼어듦) | 남자 콜백 없음. 회의: `네가 한 말: "저 그냥 길 잃은 사람이에요. 제발 살려 주세요"` | A_first.txt |
| 3 | `근데 왜 변장했어?` | 여우 "적국 땅이니까. 크롬웰의 공녀라는 게 들키면 무사하지 못해." | A_first.txt |
| 4 | `사막에서 춤을 춘다` | 나레이션 "뜨거운 모래 위에서 팔을 휘저으며 발을 구르듯 몸을 흔들었다. …" 남자 없음 | C_rough.txt |
| 5 | 행운 사용 | `주사위 4 + 수치 0 + 행운 3 = 7 / 목표 10` | A_first.txt, ui/05_result_luck_row.png |
| 6 | `귀찌를 뗀다` → `응`, `남자를 공격한다` → `응`, `남자 눈을 찌른다` | 칭찬·계획 보정 줄 없음. 판정식에 `+1` 보정 없음 | A_first.txt, H_attack.txt |
| 7 | `저 사람들 누구지? 일단 말 걸어본다` | 여우 한 줄 뒤 `[판정] 달려가서 길을 묻는다` | A_first.txt |
| 8 | 첫 입력 뒤 여우 줄 | "터번에 곡도면 페시안 사람이야. 북쪽 말씨를 들키면 곤란해." 9판 전체에서 첫 입력 뒤 `다.`로 끝나는 여우 줄 0건. 전과 후는 `docs/script_changes.md` | 전 판 *.txt |
| 9 | 남자 모델 줄 | "길을 잃었다라." "제법이군." 9판 전체에서 모델 줄 `하.` 시작 0건 (고정 줄 `하.`는 그대로) | 전 판 *.txt |
| 10 | `돌을 주워서 저 사람들한테 던진다` | `[판정] 돌을 주워서 저 사람들한테 던진다 · 손재주 판정` | C_rough.txt |
| 11 | `물병으로 칼을 막는다` | 여우 "물통으로 칼을 막는다고?…" 나레이션 "가방 옆에 매달린 물통을 치켜들었다." | I_expose2.txt |
| 12 | `칼을 빼앗는다` | 여우 "칼 든 사람한테 맨손이야. 크게 다칠 수도 있어. 그래도 할 거야?" | C_rough.txt |

## 13~23번 (사진)

| # | 결과 | 사진 |
|---|---|---|
| 13 | 목록 끝이 흐려지고 ▼ 표시, 끝까지 내려진다 | A_first_result.png, ui/13_result_list.png, ui/13_result_list_end.png |
| 14 | 개발용 줄 없음 | A_first_result.png, C_rough_result.png |
| 15 | 첫 포커스 `닫기`, 금색 테두리 | Z_map_after_restart.png |
| 16 | 칸 안으로 선이 비치지 않고, 점선이 둘째 칸 모서리에 닿지 않는다 | A_first_map.png, Z_map_after_restart.png |
| 17 | `·2` 없음, 힌트 칸 금색 강조 | A_first_hint1.png, ui/17_map_hint.png, ui/17_map_hint_moved.png |
| 18 | `-3` 이 행운 줄 옆 | A_first_luck_used.png, ui/18_luck_delta.png |
| 19 | 세 줄로 나뉜다 | A_first_plan_meeting.png |
| 20 | 선택지 때 ▼ 없음, 문장이 한 덩어리 | A_first_choices_0.png, A_first_choices_1.png |
| 21 | 첫 여우 줄에만 `클릭 · Space 넘기기` | A_first_fox.png, ui/21_first_fox_hint.png, ui/21_second_fox_no_hint.png |
| 22 | 그림 아래 경계 안 보임 | A_first_luck_used.png, ui/22_input_no_rect.png |
| 23 | 이름표와 같은 인물은 밝고, 다른 인물만 어둡다 | ui/23_settled_b01_sand.png, ui/23_settled_b06_swing.png |

### 23번 측정

이름표가 `아시나`인 입력칸에서 그림의 `filter` 값을 시간별로 쟀다.

| 입력칸 | 0ms | 100ms | 900ms |
|---|---|---|---|
| b01_sand | brightness(0.5) | brightness(0.79) | none |
| b02_people | brightness(0.5) | brightness(0.78) | none |

바로 앞 여우 줄의 어둡게 하기가 풀리는 전환 중이다. `lead_play5.mjs` 는 입력칸이 뜨는 순간 찍으므로 `A_first_free_b01_sand.png`, `C_rough_free_r3_dusk.png` 는 어둡게 찍힌다. 이 두 장은 근거로 쓰지 않는다. b06_swing 은 아시나 `speaking`, 남자 `dim` 이고 CG 가 그림을 가린다.

## 지도 힌트 두 단계

`A_first_hint1.png`, `A_first_hint2.png` 가 같은 까닭은 `logs/lead5/atlas.json` 을 앞선 플레이에서 이어 써서 힌트가 이미 마지막 단계였기 때문이다. 기록을 잇지 않았던 앞선 판의 두 단계 문장은 `work/demo-slice/lead5_prev/report.json` 의 `hint` 에 있다. 이번 코드에서 첫 단계부터 다시 찍지는 않았고, 칸이 바뀌는 강조는 `ui/17_map_hint_moved.png` 로 확인했다.
