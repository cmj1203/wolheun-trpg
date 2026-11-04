# 19-C 징조 QA — 26B(18097) 레인 서버 18082 대조표

- 서버: `bun app/src/server/main.ts`(PID 12626, PGID 12626, 셀 PGID 3549와 다름, QA 끝에 kill 로 끔), 환경 `WOLHEUN_PORT=18082 WOLHEUN_LLM_URL=http://127.0.0.1:18097 WOLHEUN_SAVES=app/saves-lane WOLHEUN_ATLAS=app/logs/atlas-lane.json`, 로그 `work/demo-slice/server19c.log`
- `/api/health`: `llm.ok=true, model=gemma-4-26b-a4b`
- 판 기록(JSON, 턴마다 이벤트 전부): `docs/lead_check19/omens/<경로>_seed<N>.json`, 요약 `summary.json`, 실행 출력 `runs_api.txt`, 화면 재생 출력 `shots_ui.txt`·`shots_ui2.txt`
- 저장 슬롯(`app/saves-lane/`, 징조가 나온 턴이 끝난 뒤 저장): slot1 spy7, slot2 earring2, slot3 barehand(결말까지 간 상태), slot4 identity_man, slot5 identity_alone
- 사진은 API 판과 같은 시드·같은 행동을 웹 화면(`?fast=1&seed=N`, headless `Bun.WebView` 1440×810)에 다시 넣어, 대사 상자 글이 징조 줄과 같을 때 찍었다. 다섯 경로 모두 화면 판이 API 판과 같은 비트·같은 징조 줄로 갔다. 찍을 때 `#gm-box`(여우 말풍선)는 모두 hidden 이었다(ask_mode 만 보임).

## 대조표

| 경로 | 시드·세션 | 턴 | 입력 | 화면 줄(화자: 본문) | 수치 변화 | 사진 경로 |
|---|---|---|---|---|---|---|
| (a) 의심 7 → spy_cut 징조 | 6 · API 0a13baa9 / 화면 6d30c3af | 3 (b05_why) | 1 b02 "모래 언덕 뒤에서 먼저 살핀다" → 2 행운 안 씀 → 3 "저는 귀한 집안 사람이에요. 함부로 대하면 후회하실 거예요" | 판정 신분과 교양을 내세운다 대가 있는 성공(합 7) → 내레이션: 비웃음 섞인 목소리였지만… → 대가(후드가 반쯤 흘러내렸다) → **내레이션: 남자의 손이 칼자루로 내려갔다. 눈은 아시나에게서 떨어지지 않았다.** → 붉은 눈의 남자: 귀한 몸이 호위도 없이 사막을 헤맸다? … 증명해 봐라, 여자. | 의심 5→7, 귀찌 6→5 | `docs/screenshots/lead_check19/omen_spy7.png` |
| (b) 귀찌 2 → unmasked 징조 | 48 · API 10efa5ac / 화면 f68426c9 | 4 (b05_why) | 1 b02 "하늘이 너무 파랗네…" → 2 "엄마… 보고 싶다." → 3 단추 run → 4 단추 resist | 판정 칼을 밀어내고 몸을 뺀다 대가 있는 성공(합 7) → 도주 서술 … 아시나(속마음): 뭐야, 왜 안 쫓아와…? → **내레이션: 귀찌가 귓불에서 차갑게 식어 갔다.** → **아시나(속마음): …오래 못 버티겠어.** → 해 질 녘 장면 | 의심 3→4, 귀찌 5→4→3→2 | `docs/screenshots/lead_check19/omen_earring2.png`, `docs/screenshots/lead_check19/omen_earring2_next.png`(속마음 줄) |
| (c) 남자에게 맨손 공격 | 201 · API 0d82ad44 / 화면 66950fbb | 4 (b08_gaze) | 1 단추 run → 2 plead → 3 dodge → 4 "칼을 맨손으로 빼앗는다" | echo → **아시나(속마음): 맨손이다. 저 칼은 진짜다.** → 곧바로 판정 칼을 맨손으로 빼앗는다 대가 있는 성공(손재주 +1, 어려운 행동 -1, 3+6=합 9). 이벤트 순서: 징조 줄 1번, 판정 2번. confirm 이벤트·여우 줄 없음 → 붉은 눈의 남자: …하, 미친 여자군. → b09_verdict → e_survivor 결말 | 의심 3→5, 집착 1→3, 귀찌 3→2→1, 호감 1→2 | `docs/screenshots/lead_check19/omen_barehand.png` |
| (d) 남자 앞에서 정체 밝힘 | 201 · API b4260bd5 / 화면 3e5bba48 | 4 (b08_gaze) | 1 run → 2 plead → 3 dodge → 4 "나는 웰든 공녀다" | echo → **아시나(속마음): 웰든이란 이름이 목까지 올라왔다. 여긴 적국이다.** → tracks 이벤트 → 붉은 눈의 남자: 공녀라니. → 내레이션: 남자가 짧게 비웃음을 흘렸다… | **의심 3→6(+3)**, 판정 없음 | `docs/screenshots/lead_check19/omen_identity_man.png` |
| (d') 남자 없이 정체 밝힘 | 201 · API 32d77a67 / 화면 e57c3f87 | 1 (b02_people, 무대에 아시나만 있음) | "나는 웰든 공녀다" | echo → **아시나(속마음): 웰든이란 이름이 목까지 올라왔다. 여긴 적국이다.** → 아시나(속마음): 미쳤어, 미쳤어! 지금 이 상황에서 그 이름을 입 밖으로 꺼내다니! → 아시나(속마음): 제정신이야, 아시나? 여긴 크롬웰이 아니라 페시안 땅이라고! | 없음(tracks 이벤트 없음, 의심 0→0) | `docs/screenshots/lead_check19/omen_identity_alone.png` |
| 그만두기 확인 창 | 7 · 화면만 | b02 첫 입력 | "그만할래" | `dialog#confirm`: "여기서 그만두면 이 데모는 끝나. 정말 끝낼 거야, 아니면 더 해 볼래?" [계속한다] [끝낸다]. 여우 말풍선 없음 | 없음 | `docs/screenshots/lead_check19/confirm_quit.png` |
| 🦊 GM 질문 모드 | 7 · 화면만 | b02 | 🦊 GM 단추 → "행운이 뭐야?" | 여우 말풍선(GM): 행운은 판정에 실패했을 때 모자란 만큼 메우는 점수야. 쓰면 대가 있는 성공으로 바뀌어. 지금은 6이야. | 없음 | `docs/screenshots/lead_check19/ask_mode.png` |

## 불변식 감사(이야기 중 여우 줄)

`bun work/demo-slice/audit_gm19c.ts`(출력은 `docs/lead_check19/omens/audit_gm.txt`)로 API 판 기록 7개를 셌다. 시작 이벤트와 턴 16개, 줄 이벤트 267개가 대상이다.

- 여우 줄(`style: gm` 또는 화자 `GM`) 전체 42개는 모두 b00_open 여는 글에서 나왔다(판 7개 × 6줄).
- **b00, 끝 비트(x_·e_), ask 행동 밖에서 나온 여우 줄은 0개다.**
- 이름 되묻기 예외("아직 … 몰라 … 다시 적어 봐")도 0개다. 이번 입력에는 모르는 이름이 없어서 그 길을 타지 않았다.
- 화면 재생 판은 서버 로그(`app/logs/<세션>.jsonl`)에 줄 이벤트가 남지 않아 줄 단위로 세지 못했다. 사진을 찍은 순간마다 `#gm-box` hidden 인 것만 확인했다.

## 실행한 명령

```
# 서버(Bun.spawn detached, stdout/stderr → work/demo-slice/server19c.log)
cd /Users/choeminju/월흔_trpg && WOLHEUN_PORT=18082 WOLHEUN_LLM_URL=http://127.0.0.1:18097 WOLHEUN_SAVES=app/saves-lane WOLHEUN_ATLAS=app/logs/atlas-lane.json bun app/src/server/main.ts
curl http://127.0.0.1:18082/api/health
# API 판
bun work/demo-slice/play_omens19c.ts identity_alone
bun work/demo-slice/play_omens19c.ts barehand identity_man spy7 earring2 > docs/lead_check19/omens/runs_api.txt
# 화면 사진
bun work/demo-slice/shoot_omens19c.ts omen docs/lead_check19/omens/identity_alone_seed201.json "웰든이란 이름이 목까지 올라왔다. 여긴 적국이다." docs/screenshots/lead_check19/omen_identity_alone.png
bun work/demo-slice/shoot_omens19c.ts omen docs/lead_check19/omens/barehand_seed201.json "맨손이다. 저 칼은 진짜다." docs/screenshots/lead_check19/omen_barehand.png
bun work/demo-slice/shoot_omens19c.ts omen docs/lead_check19/omens/identity_man_seed201.json "웰든이란 이름이 목까지 올라왔다. 여긴 적국이다." docs/screenshots/lead_check19/omen_identity_man.png
bun work/demo-slice/shoot_omens19c.ts omen docs/lead_check19/omens/spy7_seed6.json "남자의 손이 칼자루로 내려갔다. 눈은 아시나에게서 떨어지지 않았다." docs/screenshots/lead_check19/omen_spy7.png
OMEN_NEXT=1 bun work/demo-slice/shoot_omens19c.ts omen docs/lead_check19/omens/earring2_seed48.json "귀찌가 귓불에서 차갑게 식어 갔다." docs/screenshots/lead_check19/omen_earring2.png
bun work/demo-slice/shoot_omens19c.ts quit docs/screenshots/lead_check19/confirm_quit.png
bun work/demo-slice/shoot_omens19c.ts ask docs/screenshots/lead_check19/ask_mode.png
# 감사
bun work/demo-slice/audit_gm19c.ts
```

## 본 것·문제(리드 판단 거리)

1. **b01 에 자유 입력이 없어졌다.** 첫 자유 입력은 b02_people 이다. 그래서 check11 9절의 "b01 혼잣말" 경로는 그대로 못 쓰고, earring2 는 b02 혼잣말 2번으로, identity_alone 은 b02(남자가 무대에 없음)로 옮겼다. 첫 시도(b01 기다림)는 0턴으로 끝났다(`identity_alone_seed6.json`, 행동 없음).
2. **맨손 공격 한 턴 안에서 일이 몰린다.** (c) 4턴에 징조 줄, 판정, 귀찌 징조(3→2)가 다 나오고, b09_verdict 를 거쳐 e_survivor 결말까지 갔다. 징조 자체는 맞게 나온다. 다만 귀찌 징조 직후 바로 결말이라, 그 징조는 다음 결과를 고를 틈 없이 지나간다.
3. **(a) 의심 7 징조가 대가 줄 바로 뒤에 붙는다.** 화면에서는 징조 줄 아래에 "대가 · 소지품 — 후드가 반쯤 흘러내렸다. 귀찌가 뜨거워진다." 줄이 함께 보인다. 둘 다 화면에 남아 읽는 데는 문제없다.
4. **(d') 남자 없는 정체 밝히기에서 26B 가 속마음 두 줄을 더 썼다.** "미쳤어…", "제정신이야, 아시나?"는 혼잣말로 흐른다는 의도에 맞고 수치 변화도 없다.
5. **그만두기 확인 창 글은 여우 말투 그대로다**("정말 끝낼 거야, 아니면 더 해 볼래?", content `risky[0].warn`). 이제 말풍선이 아니라 창에 나오니, 중립 문장으로 바꿀지는 리드·사용자가 정한다. 기존 글이라 손대지 않았다.
6. LLM 해석 흔들림은 이번에는 없었다. 자유 입력 7개(살핀다·귀한 집안·혼잣말 2·맨손·웰든 2)가 모두 의도한 쪽으로 읽혀, 시드를 바꿔 다시 할 필요가 없었다. 26B 자유 입력 한 턴은 6.3~27.6초 걸렸다(순서대로 6347·20392·27624·24842·21720·14311·9767ms).
7. `shoot_omens19c.ts` 는 처음에 행동을 보낸 직후의 'free' 단계를 결과로 잘못 읽었고, 질문 모드에서 "GM이 장면을 쓰는 중" 자리표시를 답으로 찍었다. 둘 다 스크립트에서 고쳐 다시 찍었다(엔진 문제 아님).
