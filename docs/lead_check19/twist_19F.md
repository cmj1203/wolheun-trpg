# 19-F 긴장값과 끼어드는 사건 — 대조표

원안: `docs/research/solo_trpg_apply_plan.md` ⑨(Mythic 카오스 팩터를 d6으로). 사용자 답: 남자를 만나기 전 사막 장면 2곳만, 원작 대면 장면은 그대로.

## 1. 규칙

| 항목 | 정한 값 | 코드·콘텐츠 |
|---|---|---|
| 자리 | `b02_people`, `r3_dusk` 2곳(둘 다 출연이 아시나 혼자) | `ep01_desert.yaml` 비트의 `twist:` |
| 긴장값 | 1~6, 시작 3 | `sheet.tension`, `flags.긴장`, `Hud.tension` |
| 긴장 변화 | 판정 hit -1, miss +1, mixed 그대로 | `engine.ts` `bumpTension` |
| 장면 검사 | 장면 시작 때 d6 > 긴장이면 그대로. 이하이고 홀수면 달라진 결, 짝수면 끼어드는 일 | `engine.ts` `sceneCheck` |
| 줄 순서 | 끼어드는 일은 장면 줄 앞, 달라진 결은 장면 줄 뒤 | `engine.ts` `enter` |
| 무게 | 사건 8개 모두 그 장면 접근법의 보정(mods)이나 귀찌로 되돌아온다. 표는 `docs/script_changes.md` 19-F 절 | `ep01_desert.yaml` |
| GM | 사건 플래그마다 facts 한 줄. GM이 그 판에 일어난 일을 안다 | `ep01_desert.yaml` `facts` |
| 시드 | d6은 `state.rng ^ seedFrom(beat.id)`로 뽑고 `state.rng`를 소비하지 않는다. 표를 넣어도 판정 눈이 그대로다(테스트 있음) | `engine.ts` |

원안과 다른 점 두 가지:
- 원안의 "장면 목표 성공 -1, 실패 +1"을 **판정 한 번마다**로 옮겼다. 이 앱에는 장면 목표 달성을 따로 판단하는 값이 없고, 판정 결과가 가장 가까운 값이다.
- 원안의 d10·1~9 대신 d6·1~6이다(`apply_plan` ⑨ 그대로).

## 2. 화면

| 사진 | 시드 | 장면 | 확인한 값(DOM) |
|---|---|---|---|
| `docs/screenshots/twist19f/twist_altered_b02_closer.png` | 3 | 사람?! | 긴장 3 · 주사위 3 → 달라진 결, 귀찌 7 |
| `docs/screenshots/twist19f/twist_interrupt_b02_sandstorm.png` | 1 | 사람?! | 긴장 3 · 주사위 2 → 끼어드는 일 |
| `docs/screenshots/twist19f/twist_altered_r3_clouds.png` | 8 | 해가 지는 모래 | 긴장 3 · 주사위 1 → 달라진 결, 귀찌 4 |
| `docs/screenshots/twist19f/twist_interrupt_r3_howl.png` | 13 | 해가 지는 모래 | 긴장 4 · 주사위 4 → 끼어드는 일 |

위쪽에 `긴장 N` 칩, 대사 상자 아래에 `장면 검사 긴장 N · 주사위 M → 결과` 한 줄이 나온다. 줄은 다음 장면이나 판정 때 사라진다. 여우는 말하지 않는다. DOM 값 전체는 `docs/screenshots/twist19f/shots.json`, 스크립트는 `work/demo-slice/shoot_twist19f.ts`(18192, LLM 없음, 저장은 `app/saves-lane`)다. 눈으로 본 사진은 closer·sandstorm·clouds 3장이고, howl은 DOM 값만 대조했다.

## 3. 분포 — 300시드(`work/demo-slice/twist_seeds19f.txt`)

| 장면 | 그대로 | 달라진 결 | 끼어드는 일 |
|---|---|---|---|
| b02_people(긴장 항상 3) | 157 | closer 39, glare 53 | sandstorm 26, strap 25 |
| r3_dusk(달려감→칼 밀어냄 길, 173판) | 82 | clouds 40, warm_rock 16 | footprints 16, howl 19 |

사건 8개 모두 닿는다. r3_dusk에 닿은 판의 긴장 분포는 1:10, 2:42, 3:75, 4:46이라 앞 판정 결과가 다음 장면 검사 확률을 실제로 바꾼다.

## 4. 작은 끝과 귀찌 경제 — 300시드(`work/demo-slice/search_fates19f.txt`)

사건 2개(sandstorm·howl)가 귀찌를 -1 하므로 19-G 수용 기준을 다시 쟀다.

| 정책 | 19-G 끝 | 19-F 뒤 |
|---|---|---|
| unmasked: 혼잣말 2회 + 귀찌 손실 | 115(경고 거침 107, 없이 8) | 125(경고 거침 **120 = 40%**, 없이 5) |
| unmasked: 귀찌 손실만 | 21(경고 없이 12) | 23(경고 없이 12) |
| spy_cut: 의심 최대 | 109 | 110 |
| collapse: 같은 자리 혼잣말만 | 300 | 300(행동을 안 하는 정책 탓, 19-G 판단 그대로) |
| 보통(기본 접근) | unmasked 8, collapse 0 | unmasked 9, collapse 0 |
| 무작위 | unmasked 2, collapse 0 | unmasked 3, collapse 0 |

기준(경고 거친 unmasked 5% 이상)은 계속 넘는다. 보통 플레이의 끝 분포는 거의 그대로다.

## 5. 진짜 26B GM 대조(`docs/lead_check19/twist19f/gm_runs.json`)

공용 18097(gemma-4-26b)로 사건이 일어난 판 5개에 자유 입력을 넣었다. 스크립트 `work/demo-slice/play_twist19f.ts`, 서버 18193.

| 사건 | 입력 | GM이 쓴 줄(앞부분) | 사건과 맞나 |
|---|---|---|---|
| closer | 귀를 기울여 저 사람들이 뭐라고 하는지 들어 본다 | 낮게 깔리는 대화 내용이 귓가를 스쳤다. 무엇을 말하는지 정확히 알 수는 없었지만 | 맞음 |
| sandstorm | 발자국이 다 지워졌네. 왔던 길도 모르겠어. | 길도 잃어버렸는데 하필 이 타이밍에 사람이라니! | 어긋남 없음(사건을 직접 받지는 않음) |
| strap | 끊어진 가방 끈을 손으로 묶어 본다 | 끊어진 끈을 어떻게든 묶어보려 했지만 | 맞음 |
| howl | 저 소리, 점점 가까워지는 것 같아. | 두 번째 울음소리는 아까보다 훨씬 선명하게 고막을 울렸다 | 맞음 |
| footprints | 이 발자국을 따라 조금 걸어 본다 | 발자국을 쫓아 몇 걸음 내디뎌 보았지만 | 맞음. 다만 해 질 녘인데 "뜨거운 모래"라고 썼다 |

"뜨거운 모래"는 GM이 장면의 시간대를 놓친 것으로, 이번 변경과 무관한 작은 어긋남이라 고치지 않았다. 판 5개라 표본이 작고, 규칙 줄이 사건 서술을 보장하는 것은 아니다.

## 6. 테스트

- `docs/lead_check19/test_output19f.txt`: bun test 248 pass / 0 fail. 새 테스트 6개(표는 2곳에만, 결과별 줄 순서·효과, 보정 읽힘, 주사위 흐름 불변, 긴장 증감과 범위, 표 검사). 시드 1의 로그 순서가 달라져 기존 테스트 1개의 기댓값을 고쳤고, 클록 테스트는 사건 없는 시드 2로 옮겼다.
- `docs/lead_check19/e2e_output19f.txt`: e2e 갈래 1~5(18191, --no-llm) 통과 46, 실패 0. 결말은 갈래별 기댓값 그대로다. 피드백 e2e도 통과했다(저장은 e2e 전용 파일).
- `bunx tsc --noEmit` 0.

## 7. 같이 묶은 것: 귀찌 설명 문구(리드 지시, 사용자 OK)

`TRACK_INFO` 귀찌 desc를 지시한 문장 그대로 바꿨다. 전→후는 `docs/script_changes.md`에 있다. 살아 있는 복사본은 없었다: 옛 문구는 지난 판 기록(`app/e2e/out-*`, `docs/lead_check19/absurd/*.json`, `docs/screenshots/always/dry/interject20.json`)에만 남아 있고 이것들은 기록이라 두었다. `lore_wolheun.yaml` earring_power는 이미 새 뜻과 맞는다.

그대로 둔 줄 하나: `ep01_desert.yaml` 975행 gist "변장은 풀리지 않는다"는 칼을 피한 그 순간의 서술 지침이라 desc 복사본이 아니다. 귀찌 0 규칙과 같은 판에서 부딪히지는 않는다고 봤지만 실제 플레이로 확인하지는 않았다.

## 8. 사용자 OK가 필요한 후보(리드가 묶어 물어 주세요)

1. 새 글 8건(`docs/script_changes.md` 19-F 절). 원작에 없는 사건이고, 사용자 답은 "사막 2곳에 넣는다"까지였다. 글 자체는 아직 확인받지 않았다.
2. `긴장 N` 칩과 `장면 검사 …` 줄을 플레이어에게 보여 줄지. 추천은 보여 주는 쪽이다(주사위를 보이는 것과 같은 이유). 다만 "위험 카드는 안 보여 준다"는 답과 결이 비슷하다고 느낄 수 있다. 위험 카드는 굴리기 전 예고고 이 줄은 일어난 뒤의 표시라 다르다고 판단해 넣었다. 숨기려면 화면 두 군데만 끄면 되고 엔진은 그대로다.


11-04 리드 판단: 화면 글의 `d6` 를 `주사위`로 바꾸고 위 사진 4장을 다시 찍었다(칩 툴팁 글은 `shots.json` 의 `tip`).
