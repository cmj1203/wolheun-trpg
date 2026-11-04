# 월흔 데모 구조 파악 (2026-11-04, explore 하위 작업 보고 정리)

읽은 범위: engine.ts 약 1300줄 중 600~720줄, ep01_desert.yaml 약 2000줄 중 1~460줄 직접, 나머지는 grep. HANDOFF.md 15~18차 본문은 안 읽음.

## 1. 엔진에 이미 있는 TRPG 장치

- 판정: 2d6 + 능력치, 시드 고정(dice.ts). 10+ 성공(hit) / 7~9 대가 있는 성공(mixed) / 6- 실패(miss). 대가는 Outcome.effects.
  - 능력치 재치·손재주·매력·체력·교양, 초기 1,1,2,0,1 (yaml 11행). `mods`(if/value/label), 귀찌 3 이하면 -1 (engine 1250).
- 수치 6개(0~10): 의심·집착·호감(남자를 만나기 전엔 숨김), 귀찌(초기 8), 탈주(0), 행운(6). 플래그: 도주·거래·신분·방향_놓침·보석_놓침·머뭇·위험_실패·큰_행동 등.
- 행운: 실패하면 askLuck(engine 1135~1149) "행운 N 써서 성공으로 바꿀까? 대가는 붙어" → total 10, tier mixed.
- 난수는 판정 주사위뿐. 랜덤 인카운터·확률표 없음. 결과는 outcomes 3칸 고정 텍스트+효과. GM(LLM)이 gist를 풀어 쓰고 실패하면 작가 lines로 대체.
- 비트 종류: 대사만(next) / choices(타입만 있고 yaml에 0개) / free(자유 입력, 판정) / ending.
- 자유 입력 해석: LLM(Gemma 26B) + 규칙 폴백. 7종(prompt.ts 353): how·game·lore·person·self·action·bad. 처리 4갈래(engine 600~700): ask / game(gameHelp) / talk(판정 없음, talks 카운트) / approach·improv(판정). 접근 = stat·keywords·examples·3결과.
- 압박: patience → press 줄 → bumpHesitation(머뭇 +)·default_approach 강제 판정(engine 635~650). 막히면 movesLine 힌트(HINT_AFTER=2), 그다음 nudge 사건(NUDGE_AFTER=1, engine 926~934). 머뭇 3이면 x_collapse.
- fates(작은 끝) 4개(yaml 211~227, engine 397~460): 귀찌<=0 x_unmasked / 의심>=10 x_spy_cut / 위험_실패 x_reckless / 머뭇>=3 x_collapse. 각각 warn 1회(14차: 경고 없이 끝나는 길 없음).
- notes(수첩) = 정보 도감(사람·장소·세계·소지품, hidden은 if 조건 뒤). 복선(yaml 155~164): 별(b01→r3_dusk +1), 보석(b03→뒤 5곳). 화면엔 안 나오고 플래그만.
- callbacks(yaml 255~280): 남자가 앞 입력을 되받음(방향_놓침·보석_놓침·말_상인·말_여행자·말_고양이·아무말 "아까 '{said}'라고 했지").
- aim: 자유 입력 칸 위 장면 목표 문장(18차에서 여우 말풍선은 삭제 지시).
- 엔딩: next 라우팅. b09_verdict(yaml 1263~1266): 의심>=6 r2_bind / 집착>=4 e_curious / 그 외 e_survivor. fates가 먼저 끼어듦.
- face 4종(neutral·smile·surprised·wary), 줄마다 face(15차).

## 2. 비트 표

| 비트 | 종류 | 접근(stat) | 영향 |
|---|---|---|---|
| b00_open | 대사만(GM 7줄) | - | 없음 |
| b01_sand | free | map(교양) water(체력) earring(손재주) | 방향·물·귀찌 플래그, 귀찌 -1, 복선 별. 줄거리 갈림 없음 |
| b02_people | free | run(체력) watch(재치) avoid(재치) | run→도주 플래그→r3_slip, 아니면 b03 |
| b03_ask | 대사만 | - | 복선 보석 |
| b04_blade | 대사만 | - | 칼끝 |
| b05_why | free | beauty plead bluff noble(교양) resist(체력) bag(손재주) | 거래/신분/도주 → r4_prove / r5_claim / r3_flee / b06 |
| b06_swing | free | dodge(체력) block(손재주) flee(체력) | flee→도주 |
| b07_rule | 대사만 | - | |
| b08_gaze | free | stare_back(매력) retort(재치) hide_earring(손재주) | 집착·의심 |
| b09_verdict | 조건 라우팅 | - | r2_bind / e_curious / e_survivor |
| r2_bind | free | deny(매력) cover(재치) silent(체력) | → e_spy |
| r3_flee·r3_slip | 대사만 | - | → r3_dusk |
| r3_dusk | free | read(교양) drink(체력) shelter(재치) | 별 보정 → r3_night → e_road |
| r4_prove | free | guide(교양) wits charm | → r4_walk → e_deal |
| r5_claim | free | manners(교양) knowledge bluster | 신분_고집 → r5_price → e_value |
| 엔딩 7 | e_quit e_road e_deal e_value e_spy e_curious e_survivor | | |
| 작은 끝 4 | x_unmasked x_spy_cut x_reckless x_collapse | | bad:true, "마지막 갈림길에서 다시" |

자유 입력 비트 11개, 접근 약 30개. 진짜 갈림길 4곳(b02 도주, b05 거래/신분/도주, b06 도주, b08~b09 의심/집착). b01은 장식(판정은 있으나 줄거리 갈림 없음). 버튼 선택지 0개.

## 3. GM(여우)

- prompt.ts: buildSystem(76) 인물 설명+지식 3칸. buildInterpretUser(113), buildTalkUser(189), buildNarrateUser(226), buildQuipUser(276), buildExplainUser(293). JSON 스키마(linesSchema 327, interpretSchema 356).
- 규칙 상수(167~181): PLAYER_VOICE_RULE(아시나 대사 안 씀), UNKNOWN_NAME_RULE(황당 입력 무시 금지), CHARACTER_RULE(성격·가치관·말투 안에서만, 13차), THOUGHT_RULE, ITEM_RULE.
- 제약: 판정은 코드. must_not·state_guard·echo_only·presume·stage(미등장 인물 낱말 차단)·숨긴 이름 차단. validate.ts 검증 실패 시 재생성→작가 줄 폴백.
- 여우가 말하는 때: 도입 7줄, 배경 질문(explain), 규칙 답(gameHelp), 막힘 힌트(movesLine), 칼 앞 경고(danger.warn), 되돌릴 수 없는 입력 확인(risky), 귀찌 3 이하 알림, 행운 묻기, fates 경고, 정체 노출 거부(refuse.identity).
- 제거된 메타 말(fox_meta_lines.md): 복선 귀띔, 실패 응원. 규칙: 묻지 않은 힌트·응원은 화면에 안 냄.
- 모델: Gemma 26B llama-server(18097/18080/18081). 응답 2~12초, 폴백 가끔.

## 4. 문서

spec.md(2d6, 15~25분, 범위), 오답노트_도입부.md(배경 미제공 8문제), branches.md(갈래 5개·엉뚱 입력), beat_format.md, bad_endings.md(작은 끝 4), fox_meta_lines.md, trpg_ref_notes.md, orpg_ref_notes.md(68행: 빠진 것은 '오라클 주사위'), script_changes.md 등, lead_check*/, gm_model_eval.md.
spec.md 9~24행 목표: "혼합형 GM / 선택에 따라 이야기가 달라진다 / 실패는 의심·집착을 키우고 다음 장면을 바꾼다 / 탈주가 뼈대, 베히다트 장면이 보상". "TRPG 같은 느낌"의 정의 문장은 없음.
보류: lore earring_power("힘이 바닥나도 풀리지 않는다")와 14차 은발 끝 모순, branches.md 5행, spec.md 33행 — 사용자 OK 후보.

## 5. 코드에서 본 '진짜 TRPG에 없는 것'

1. 위험 예고가 약함: 판정 전 난이도·위험 알림 없음(칼 앞 danger 1건, risky뿐). 접근의 stat은 있으나 선택 전에 결과를 모름.
2. 판정 결과 폭이 좁음: 3단계가 모든 판정에 똑같고 대가는 거의 귀찌 -1·의심 +1.
3. 선택은 수치·플래그만 움직임: 장소·물건·관계가 바뀌는 지속 결과 거의 없음. 소지품은 장식.
4. 버튼 선택지 0개: 모든 결정이 자유 입력. 막히면 힌트·nudge.
5. b01이 장식.
6. 오라클·확률표 없음: 주사위는 판정 전용. 우연 사건 없음(orpg_ref_notes.md 68행 동일 결론).
7. 상대 쪽 판정·반격 없음: 남자는 게이지로만 표현. 대립 판정·시간 클록 없음.
8. 플레이어 계획성 약함: 준비→보너스가 아니라 입력 낱말 매칭(복선은 모르는 사이 켜지는 보정).
9. 실패 되돌리기 1종(행운)뿐.
10. GM 판단이 숨겨짐: improv·improv_bold·odd 분류 이유를 플레이어가 못 봄.
