# 41~59차 통합 UI 검증

2026-11-06. **PASS 19 / FAIL 0 / 모델 필요 3**, 합계 22행. PASS는 아래 행에 적힌 이번 완주 화면과 기존 차수 증거의 확인 범위다. 다른 갈래나 모델 출력을 이번 완주에서 다시 실행했다는 뜻은 아니다.

`WOLHEUN_NO_LLM=1`, `./app/run.sh --port 18191 --no-llm --no-open`으로 실행했다. 저장·atlas·로그·피드백은 모두 `/tmp/bundle4159/` 아래다. 18080·18081과 사용자 저장·로그를 사용하지 않았고, LLM을 시작하지 않았다. 코드·콘텐츠·assets 변경, 커밋, crq 실행은 없다.

헤드리스 `Bun.WebView`, 1440×1000 CSS 픽셀, 실제 PNG는 Retina 2880×2000이다. 56·58·58b차 드라이버를 바탕으로 작성한 [capture.mjs](capture.mjs)는 실제 새 게임·안내·대사·접근 단추·입력창·주사위·행운 단추를 사용한다. 엔진 상태 주입이나 저장본 재생으로 완주를 대신하지 않았다. 최초 촬영에서 전환 중인 그림이 보여 1초 뒤 찍도록 보완하고 같은 경로를 다시 촬영했다. 아래 사진은 보완 촬영본이다.

경로는 `seed=1` → 처음부터 → 시작 안내 여섯 줄 → 여는 글 → b01 → b02 `달려가서 길을 묻는다` → b03 크라차 질문 → b04 칼 → b05 미모 → b06 피한다 → b07 → b08 입력창에 `가만히 있는다` → 한 줄 반응 뒤 다시 열린 입력에서 `stare_back` 단추 → b09 → `살아남은 자` 결말이다. `가만히 있는다` 직후에는 주사위가 없으며, 그 뒤 주사위는 별도로 누른 `stare_back`의 판정이다. [screen_checks.json](screen_checks.json)의 `actions`와 순서별 `states`를 함께 보면 구별할 수 있다.

## 차수별 표

| 차수 | 확인할 것 | 이번 사진 / 기존 증거 | 판정 | 확인 범위와 메모 |
|---|---|---|---|---|
| 41 | 앞머리 가닥 사이로 남자 눈이 보임 | [크라차 질문](028_line_7.png), [기존 조사](../lead_check41/README.md) | PASS | 현재 화면에서 눈이 검은 덩어리로 완전히 닫히지 않는다. 원작 전체 조사는 기존 문서 근거다. |
| 42 | 원작 순서의 태양·낯선 땅·죽음·글 없는 칼 CG | [첫 줄](008_line_1.png), [낯선 땅](011_line_2.png), [죽음](012_line_3.png), [글 없는 칼](066_cg_empty_cg_open_blade.png), [기존 컷 순서](../lead_check42/README.md) | PASS | 세 줄 순서와 이어지는 글 없는 칼 CG를 완주 기록으로 확인. |
| 43 | 페시안·적국 설명 선행 공개 없음 | [수첩](038_notes.png), [기존 공개 조건](../lead_check43/README.md) | PASS | 이번 화면과 수첩에 페시안 노출 없음. 숨김 flag 자체는 기존 차수 증거다. |
| 44 | 실제 변화가 원인 줄에 표시됨 | [모래 부상](024_change_사람.png), [b04 변화](033_change_cause.png), [기존 물건 대가](../lead_check44/cases.json) | PASS | 최신 58차의 원인 줄 한정 표시를 확인. 지도·가방의 모든 대가 분기는 기존 증거 참조. |
| 45 | 체력·정신력 패널과 근력 판정 | [안내](006_intro_5.png), [판정](023_dice_b02_people.png), [기존 저상태 검사](../lead_check45/README.md) | PASS | 이번 경로에서 시작 상태·손상·근력 이름 확인. 회복·붕괴 모든 갈래를 재생하지 않음. |
| 46 | 안내 여섯 줄, 귀찌 수명 없음 | [1](002_intro_1.png) · [2](003_intro_2.png) · [3](004_intro_3.png) · [4](005_intro_4.png) · [5](006_intro_5.png) · [6](007_intro_6.png) | PASS | 안내를 건너뛰지 않고 여섯 번 진행. 5번은 체력·정신력으로 58차 변경이 반영됨. |
| 47 | 6·6 대성공과 효과 확대 | [이번 판정](039_dice_b05_why.png), [기존 6·6 사진](../lead_check47/crit_1440.png), [기존 수치](../lead_check47/rolls.json) | PASS | 이번 시드는 대성공이 아니다. 기존 실제 6·6·합계14·호감+2 기록과 사진으로 해당 항목 확인. |
| 48 | 칼·기댐 CG와 상단 가독성 | [칼](051_cg_cg_swing.png), [기댐](057_cg_cg_lean.png), [기존 화면](../lead_check48b/README.md) | PASS | 기존 폴더명은 48b. 이번 PC 화면에서 두 CG와 상단 메뉴 확인. |
| 49 | 물 마시는 CG의 후드·뒤통수 | [물 CG](019_cg_cg_drink.png), [최종 보정 근거](../lead_check49/README.md) | PASS | 후드 끝과 물주머니가 유지되고 뒷머리 윤곽이 이어짐. 원작의 프레임 밖 부분까지 같다고 판단하지 않음. |
| 50 | 베히다트 눈 간격 | [남자](028_line_7.png), [기존 측정](../lead_check50/verification.json) | PASS | 현재 게임 화면의 눈·코 배치 확인. 숫자 기준은 기존 측정값을 참조. |
| 50b | 눈 보정의 게임 크기 확인 | [남자 냉소](048_line_16.png), [게임 검수 기록](../lead_check50/game_README.md) | PASS | 별도 50b README는 없음. 50차의 후속 게임 검수 문서를 연결했다. |
| 51 | 칼 전에 크라차 질문, 이어지는 회상 | [정말이지 난](027_line_6.png), [크라차 질문](028_line_7.png), [회상](029_line_8.png), [기존 갈래](../lead_check51/paths.json) | PASS | 이번 경로의 질문 순서 확인. 모델의 질문 대응은 모델 필요 — 각 차수 증거로 확인: [51차 기록](../lead_check51/README.md). |
| 52 | b06 남자 화자와 무발화 갈래 반응 | [하.](047_line_15.png), [웃기는 여자군.](048_line_16.png), [그게…](049_line_17.png), [마지막 말](050_line_18.png), [기존 무발화 화면](../lead_check52/02-silence-b06.png) | 모델 필요 — 각 차수 증거로 확인 | 이번 미모 발화 갈래에서 네 줄은 모두 남자다. 울음·침묵에 대한 모델 반응은 [52차 기록](../lead_check52/README.md)을 참조하며 재실행하지 않음. |
| 53 | 감정·무행동은 주사위 없이 반응 | [입력 전](059_free_b08_gaze.png), [이번 순서 기록](screen_checks.json), [기존 22건](../lead_check53/qa_summary.json) | 모델 필요 — 각 차수 증거로 확인 | 이번 `가만히 있는다` 입력 직후 무판정 확인. 감정 표현 22건의 모델 해석은 [53차 기록](../lead_check53/README.md)으로 확인. |
| 54 | 귓불에 붙은 작은 붉은 귀찌 | [아시나](035_line_10.png), [기존 고증](../lead_check54/README.md) | PASS | 이번 화면에서 길게 매달린 장식 없음. 작은 알 형태는 기존 확대 근거와 대조. |
| 54b | 작은 알이 머리카락 아래층에 있음 | [아시나](035_line_10.png), [기존 확대](../lead_check54b/game_ear_zoom.jpg), [비율](../lead_check54b/ratio.md) | PASS | 현재 일반·후드 화면에서 작은 귀찌 확인. 원본 픽셀의 가림 순서·4×4 알 측정은 기존 증거 범위. |
| 55 | 목걸이·터번·장화·가방·배경·지도·아이콘 | [입식과 배경](037_free_b05_why.png), [소지품](038_notes.png), [기존 복장 확대](../lead_check55/B_game_README.md), [기존 배경](../lead_check55/BG_game_README.md) | PASS | 이번 화면에서 목걸이·터번·가방·소지품 아이콘·배경 확인. 일반 게임 구도에 가려지는 장화 끝은 기존 전체 입식 촬영 근거로 확인. |
| 56 | 원작 화자·대사와 억울해… | [저건…](021_line_5.png), [억울해…](035_line_10.png), [미인계](044_line_14.png), [원작 복원표](../lead_check56/README.md) | PASS | 이번 완주에서 주요 복원 줄과 남자 b06 화자를 확인. |
| 57 | 질문부터 후드 벗김·칼·기댐·결말까지 흐름 | [칼 직전](050_line_18.png), [칼](051_cg_cg_swing.png), [반칙](055_beat_반칙.png), [결말](065_ending.png), [기존 분기 재현](../lead_check57/replay.json) | PASS | 정상 경로 완주. 첫 물 장면에서 입력을 강제하지 않음. 소지품 상실·밤·포박 등 미선택 갈래는 기존 재현 근거다. |
| 58 | 비밀 6종 0건, 원인 줄만 변화, delta와 숫자 분리, 인물 GM 배지 숨김 | [안내](006_intro_5.png), [수첩](038_notes.png), [원인](033_change_cause.png), [다음 줄](035_line_10.png), [delta](025_delta.png), [검색 결과](audit_summary.json) | PASS | 이번 수집 화면에서 비밀·겹침·누적 변화 없음. 실제 모델 줄의 배지는 모델 필요 — 각 차수 증거로 확인: [58차 사진](../lead_check58/character_badge_after.png). |
| 58b | 감정 반응 10건과 수치판 안 delta | [원인](033_change_cause.png), [억울해…](035_line_10.png), [기존 모델 10건](../lead_check58b/model_emotions.json) | 모델 필요 — 각 차수 증거로 확인 | 이번 화면의 delta는 판 안·숫자 겹침 없음. 26B 감정 반응 10/10은 [58b 기록](../lead_check58b/README.md)으로 확인하고 재실행하지 않음. |
| 59 | 인물별 표정, 억울해… = indignant | [억울해…](035_line_10.png), [냉소](048_line_16.png), [고정 표정표](../lead_check59/engine_fixed_changes.md) | PASS | 이번 `faces`에서 아시나 indignant·남자 menacing, 이후 남자 sneer 확인. 모델의 인물별 선택 12건은 모델 필요 — 각 차수 증거로 확인: [엔진 기록](../lead_check59/engine_README.md). |

## 화면 검사와 명령 결과

- [contact_sheet.png](contact_sheet.png): 번호를 붙인 완주 사진 66장 모음. [screen_checks.json](screen_checks.json)의 `photos`가 원본 사진 목록이다. 보완한 066번은 실제 진행 순서상 012번 뒤에 배치했다.
- [visible_text.txt](visible_text.txt): 타이틀·여섯 안내·각 진행 화면·수첩의 실제 `document.body.innerText`. 화면에 표시되는 글을 수집하며 숨긴 DOM textContent나 내부 flag·파일명은 검색 대상에 넣지 않았다.
- 검색식 `귀찌 수명|변장|은발|첩자|웰든|공녀`: **0건**. 페시안도 0건.
- b04 `그리고 현재.`에서 `정신력 -1 · 의심 +2`, `억울해…`에서는 변화 줄 빈칸이다. 다음 대사에 같은 변화가 쌓이지 않았다. delta는 수집된 모든 프레임에서 HUD 안쪽이고 숫자 문자 사각형과 겹치지 않았다.
- 보이는 src 이미지의 로드 실패 0건. 새 게임 시작 전 등록한 error·unhandledrejection·console.error 수집에서 오류 0건. 최초 페이지 탐색 이전의 콘솔은 수집 범위 밖이다.
- [tests.log](tests.log): `cd app && bun test` **679 통과 / 0 실패 / 22파일**, 종료 코드 0. 기준 679/0과 같음. 전체 실행은 한 번이다.
- [tsc.log](tsc.log): `bunx tsc --noEmit -p .` **진단 0**, 종료 코드 0. 전체 실행은 한 번이다. 빈 로그가 정상 결과다.
- 촬영 드라이버의 편집기 진단은 fresh diagnostics 대기 시간 초과였다. 실제 Bun 실행의 종료 코드와 완주 결과는 [capture.log](capture.log)에 남겼다.
- `readmeai`·`readme-ai`가 PATH에 없어 이 검증 기록은 수동 작성했다.
- [server_stopped.txt](server_stopped.txt): 촬영 뒤 서버를 종료하고 18191 LISTEN이 비었는지 확인한 기록.
- [evidence_ls.txt](evidence_ls.txt): 이 문서가 연결하는 로컬 증거와 원본 사진 각각을 `ls -l`로 확인한 결과.

모델이 필요한 세 행은 미실행 항목으로 남겼으며 FAIL로 바꾸거나 이번 실행의 통과 수에 넣지 않았다. 이번 단일 경로에 나오지 않는 대성공·소지품 분기·밤·포박·모든 표정은 표에 연결한 기존 차수 증거의 범위다.
