# 59e 확인

## 1) 되짚기 줄 머리: 말이면 '▶ 아시나의 말'
- 엔진이 입력 해석 뒤 `heard` 사건을 낸다(`app/src/engine/types.ts:577`, `app/src/engine/engine.ts:707` `heard()`). 분류는 기존 `acted()` 를 그대로 쓴다. 가만히 있기(idle)는 행동이다. 질문 모드(GM 단추)로 물은 말은 말이다(`engine.ts:830`).
- 화면은 `echo` 를 받으면 머리 없이 '▶ 아시나' 로 띄우고, `heard` 가 오면 `data-as` 로 '아시나의 말'/'아시나의 행동' 을 붙인다(`app/web/main.ts:1196`, `app/web/style.css:748·752`).
- 회귀 시험: `app/tests/engine.test.ts:2186` 묶음(건넨 말 → speech, 행동 문장 → action, heard 가 roll 보다 앞). 스트리밍 시험 기대값은 `['echo', 'heard', 'roll']`(`engine.test.ts:753`).

## 2) 판정 없는 턴의 아시나 기본 표정
- 규칙(`engine.ts:707`): 이 비트의 직전 판정이 실패면 scared(상대 있음)/flustered(혼자), 대가 있는 성공이면 wary. 아니면 상대가 앞에 있고 긴장 2 이상(`WARY_TENSION`, `engine.ts:219`)이면 wary, 그 밖은 neutral. 낱말표 없음.
- 판정이 있으면 `roll` 의 hero 가 뒤에서 덮는다.
- 화면: 자유 입력 시작 때 표정 초기화에서 주인공은 빼서, 해석을 기다리는 동안 칼 앞에서 웃는 얼굴로 돌아가지 않는다(`main.ts:638`, `setHeroFace` `main.ts:614`).
- 원작 근거: `docs/lead_check59/faces_survey.md:39`(wary 행, `ep01_c047`), `:44` 이하 "1화 칼 장면 기본 표정 (59e)". 얼굴 비교표 `orig_blade_faces.jpg`.

## 화면
- `face_wary_09.png`: 9번 "칼 좀 내려 주실래요? 목이 따끔해서요." (26B 시험 포트 18191, slot2 저장본, 긴장 2). 되짚기 줄 '▶ 아시나의 말', 아시나 `asina_wary`, 남자 `behidat_intrigued` "따끔한 정도인가? 이방인, 배짱이 좋군." 화면 기록: 입력 뒤 4.0초에 asina_neutral → asina_wary.
- `calm_b02_neutral.png`: 혼자인 사막 장면 '사람?!'(모델 없는 시험 포트 18193, 긴장 3) 혼잣말 "살았다… 드디어 사람이야." 되짚기 줄 '▶ 아시나의 말', 아시나 `asina_hood_neutral`.
- 시험 서버 env: `WOLHEUN_SAVES`·`WOLHEUN_LOGS`·`WOLHEUN_ATLAS`(파일)·`WOLHEUN_FEEDBACK` 모두 `work/demo-slice/lane59e/run/` 아래. 18080·18081 은 건드리지 않았다.

## 3)~5) 코드레빗 1차 minor
- 3) 나라 이름 제거: `app/src/gm/prompt.ts:279`, `app/content/lore_wolheun.yaml:152` → '이름·나라·왕이라는 신분'. 회귀 시험 `app/tests/gm.test.ts:1051`(b05·b06 의 interpret·talk·narrate 요청문에 flag 없이 `페샨|페시안` 없음). 고치기 전 문구로 되돌리면 이 시험이 실패하는 것을 확인했다. `tests/kracha51.test.ts:55` 는 그대로.
- 4) 깨진 말: `lore_wolheun.yaml:157` '마지못 말'→'마지막 말', '베풀로'→'베풂으로', `:159` '븤히'→'빤히'. 파일을 훑어 같은 깨짐 하나 더: `:162` 원작 인용 '마지못으로 할 말은 있나?'→'마지막으로 할 말은 있나?'. 그 밖의 드문 음절(텨·멨·쩔·칫·콰·뗐·챠 등)은 정상 낱말이었다.
- 5) `docs/lead_check59d/model_table.md:49`: `model_sequential.json` 7번 traces 대조 결과 코드레빗 말이 맞았다. 1회차 위반 두 가지('-군' 3연속, 호칭 '여자' 반복), 2회차는 '-군' 위반이 남아 최종은 1회차 줄. 문장을 그대로 고쳤다.

## 시험
- `tests.log`: bun test 716 pass, 0 fail.
- `tsc.log`: tsc exit 0.
