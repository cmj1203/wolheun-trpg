# ep02 CG 연결 뒤 실제 화면 시각 QA

2026-11-09 · PC 1440×900(DPR 1) · 앱 http://127.0.0.1:18221(격리 실행) · 실제 GM http://127.0.0.1:18196(gemma-4-26b-a4b) · Ego 에이전트 작업 공간 "월흔 ep02 시각 QA"

판정: **READY 아님. 결함이 있다.** 이번 검수에서 YAML·자산·코드는 고치지 않았다. 증거 경로는 따로 적지 않으면 `work/continuation/ep02/run/visual-qa/` 기준이다.

## 1. 진행 방법과 실제 입력

- 세이브: `work/continuation/ep02/run/saves/qa_legacy_capture.json`. 사막 e_curious 결말이며, 지도 찢김·가방 끈 끊김·체력 3·정신력 3·귀찌 4·기억 '모래를 맛봄' 상태다.
- 불러오기: 타이틀의 '이어하기' 창에는 slot1~3만 보인다. 그래서 페이지 안 `fetch`에서 slot1 요청의 칸 이름만 `qa_legacy_capture`로 바꿨고, 나머지는 실제 `loadFrom → /api/load → resumeCampaign` 흐름 그대로다. 세이브 파일은 바꾸지 않았다(3879B, 11:41 그대로). 진행 중에 앱이 `saves/auto_fork.json`을 만들었다.
- 타자 속도와 연출은 기본값이다(`?fast=1` 쓰지 않음).
- 줄마다 시작 직후 화면(`shots/NNN_a.png`)과, 타자가 끝나고 650ms 뒤 화면(`shots/NNN_b.png`)을 찍었다.
- 페이지 기록기는 줄이 시작되는 순간의 DOM(CG 주소·켜짐, 배경, 이름표, 슬롯 그림)과 CG·배경이 바뀐 시각, 서버 응답 스트림을 남겼다(`page_state.json`, `run_log.jsonl`).

실제로 보낸 `/api/act` 요청은 6건이다.

| # | 위치 | 입력 | 결과 |
|---|---|---|---|
| 1 | ep02_prison_wake 첫 줄(공개 전) | GM 질문 '여기가 어느 나라야?' | '여긴 두 대륙 사이의 죽음의 사막 지르다야. 생명이 살지 않는 모래사막이고 낮에는 태양이 살을 태울 듯 뜨겁지.' |
| 2 | ep02_prison_country 4번째 줄(페시안·위치 공개 뒤) | 같은 질문 | 같은 사막 답('…뜨거워.') |
| 3 | ep02_unlock 자유 입력 | (핀을 살살 넣어 걸리는 곳을 찾는다) | 걸림쇠를 천천히 더듬는다 · 손재주 6+3+1=10/10 성공, 정신력 +1 |
| 4 | ep02_question 자유 입력 | (시선을 내리깔며) 자물쇠가 원래 고장 나 있었어요. 밀었더니 그냥 열렸어요. | 그럴듯한 경위로 탈옥 수단을 감춘다 · 재치 1+2+1=4/10 실패 |
| 5 | 행운 선택 | '그대로 간다'(행운 3 쓰기 대신) | GM 결과 3줄 뒤 ep02_call로 이어짐 |
| 6 | ep02_court_boundary | '1 계속'(choose `continue_ep03`) | 엔딩 카드 없이 ep03 '궁 안으로'로 넘어감 |

ep03는 대본 20줄('목욕실' 12번째 줄, seq 156)까지만 표시하고 멈췄다. ep03 구간에서는 모델 요청이 없었다.

## 2. 줄별 CG 대조 결과

- **표시 범위**: ep02 대본 131줄(무음 삽입 8줄 포함) 가운데 130줄이 화면에 나왔다. 나오지 않은 줄은 `ep02_city_escape[0]`(도주 결말) 하나다. 대조표는 `line_cg_audit.json`, 기대표는 `expected_cg_table.json`이다.
- **CG 바뀌는 시점**: 130줄 모두 CG 주소가 줄 시작과 같은 작업 안에서 바뀌었다. 줄 중간에 CG가 바뀐 경우는 0건이다. 줄이 시작될 때 CG가 꺼져 있던 줄도 없다(GM 줄은 제외, 결함 2).
- **매핑 앵커 일치**: 126줄은 `mapping.json`의 assignments·silent_inserts와 같은 파일이다. 나머지 4줄은 매핑에 앵커가 없다(결함 4·11).
- **도달하지 않은 자산**: 88장 CG가 모두 본선에서 표시됐으므로 없다. `ep02_city_escape`가 다시 쓰는 `ep02_city.png`(c013)도 도시 장면에서 확인했다.
- **무음 삽입 8줄**: 모두 대사창이 투명한 무대사 줄로 지정 위치에 나왔다.
  - falling_skewer→shock: '(이럴 수가.)' 앞, seq 87·88
  - glance→approach→turn: '(…설마.)' 앞, seq 98·99·100
  - panic→caught: '꺄악!' 앞, seq 103·104
  - turning_man: '먼저 돌아가 보겠다.' 앞, seq 116
- **`ep02_남자` 별칭**: 10줄(seq 106·107·108·112·117·118·119·127·129·134) 모두 이름표가 '붉은 눈의 남자'였다. 슬롯에 남자 입식이 뜬 적은 0건이다(사막 입식 없음).
- **비트 경계**: 대본 비트가 바뀔 때 CG가 꺼졌다 켜지는 간격은 4~48ms로, 0.4초 페이드 안이라 깜빡임으로 보이지 않는다. CG가 길게 꺼진 구간은 두 곳뿐이다. 자물쇠 GM 결과 줄(약 4.9초)과 질문 GM 결과 줄(약 6.2초)인데, 둘 다 장면 배경이 보여서 검은 화면은 아니다.
- **자유 입력 배경**:
  - 자물쇠 프롬프트에는 lockpick CG가 떠 있고, GM 결과 줄에서는 `ep02_lock_stage`(같은 그림을 화면 가득)가 보인다(`shots/stop_046_free.png`, `046_b.png`).
  - 질문 프롬프트에는 c037 CG가 떠 있고, GM 결과 줄에서는 `ep02_question_stage`(남자 초상)와 왼쪽 아시나 입식이 보인다(`shots/stop_111_free.png`, `112_b.png`).
- **원본 대조**: GPT 보정 12장과 효과 2장은 원본과 나란히 놓고 비교했다(`sheets/pairs_1~4.png`, `pairs/`). 인물 얼굴·머리색·복장(후드 여행복·리본·녹색 베일·남자 터번과 보석)은 유지됐다. 결함은 5·6번 두 장이다.
- **가독성**: 대사, 이름표, GM 상자, 판정 패널(`shots/046_dice_74314.png`, `111_dice_10046.png`), 선택지가 모두 읽힌다. 글자와 그림이 겹치는 화면은 없었다.

## 3. 결함

1. **CG가 바뀌는 순간 검은 화면이 보인다.**
   - 새 CG로 바뀌는 줄을 시작 직후(줄 시작 후 52~109ms 안)에 찍은 36장이 모두 검은 화면이었다. 같은 줄의 정착 화면에는 그림이 있다(`start_frame_luma.json`, `line_cg_audit.json`의 `blackAtStart`). 예: `shots/088_a.png`와 `088_b.png`, `sheets/silent_inserts_start.png`.
   - 원인: `paint()`가 새 주소를 바로 넣어서 이전 그림이 먼저 사라지고, 새 PNG(2~5.6MB)가 디코드될 때까지 `.cg`의 어두운 바탕이 보인다.
   - 페이지 안에서 캐시 없이 잰 로드+디코드 시간은 12장에서 21~103ms였다. c086은 크기 계산이 줄 시작 151ms 뒤에 끝났다.
   - 무음 연속 컷(shock, glance→approach→turn, panic→caught)에서 가장 잘 보인다. 화면을 찍는 지연 때문에 검은 구간의 정확한 길이는 재지 못했다.
2. **GM 질문에 답하는 동안 화면이 검게 된다.** GM 줄에는 CG가 없어서 CG가 꺼지고, 감옥 비트의 배경이 `blackout.svg`라서 GM 상자만 남는다. 두 번 모두 재현됐다(`shots/001_b.png` ep02_prison_wake, `shots/024_b.png` ep02_prison_country). 부모 지시에 따라 미해결로 기록한다.
3. **GM 질문 답이 공개 전과 뒤 모두 사막 오답이다.** 페시안·감옥은 새지 않았다. 하지만 감방 장면에서 '두 대륙 사이의 죽음의 사막'이라고 답했고, 페시안·위치를 공개한 뒤에도 같은 답이 나왔다(`ask_before_reveal.json`, `ask_after_reveal.json`). 부모 지시에 따라 미해결로 기록한다.
4. **`ep02_city` 5~6줄에 회상 그림이 남는다.** '(이런 식으로 강제 연행되어 올 줄은 꿈에도 몰랐지만.)'와 '(아무튼.)' 줄에 몽환 궁전 회상 그림 `ep02_c015_dream_palace.png`가 계속 떠 있다(seq 64·65, `shots/064_b.png`, `065_b.png`). 매핑 메모("5행부터는 현재 시점으로 돌아오므로 회상 이미지를 유지하지 않는다")와 `docs/continuation/ep02/assets.md` 197행의 "5행부터 현재 도시로 복귀"와 맞지 않는다.
5. **c090 연기 효과가 세로 직선으로 잘린다.** `production/ep01_c090_smoke.png`의 붉은 연기가 x≈1412 지점에서 세로 직선으로 끝난다. 게임 화면에도 그대로 보인다(seq 26 '(그리고…)', `shots/026_b.png`, `sheets/zoom_seams.png` 왼쪽). 매핑 상태는 '검수 통과'로 되어 있다.
6. **c002 어머니 컷에 세로 이음매가 있다.** `production/ep02_c002_mother.png`에서 가운데 인물 띠의 좌우 경계가 세로선으로 드러나고, 오른쪽에서 소녀의 옷과 부채가 끊겨 있다(seq 39·40, `shots/039_b.png`, `040_b.png`, `sheets/zoom_seams.png` 오른쪽).
7. **화 표시 칩이 '1화 · 사막 조우'로 고정돼 있다.** 감옥부터 궁정까지 ep02 전체와 ep03 첫 20줄에서 칩이 한 번도 바뀌지 않았다(예: `shots/136_b.png`, `140_b.png` 왼쪽 위).
8. **경계에서 2화 정보가 화면에 나오지 않는다.** YAML 엔딩의 제목('2화 · 궁정의 제안'), 요약, 다음 화 연결 문구가 어디에도 표시되지 않는다. '1 계속' 선택지 하나만 나온 뒤 바로 ep03로 넘어간다(`shots/stop_137_choices.png`, `137_b.png`). 가짜 최종 엔딩을 피한 의도일 수 있지만, 화 칩도 바뀌지 않아서 화가 바뀐 것을 화면으로 알 수 없다. 의도인지 확인이 필요하다.
9. **소지품 계승과 그림이 맞지 않는다.**
   - 이번 판은 가방 끈이 끊긴 상태다. HUD 가방 툴팁도 '보기보다 훨씬 많이 들어가는 마법 가방. 여행 짐과 낡은 지도가 들어 있다. 끈이 끊어져 손으로 쥐고 다닌다.'로 나온다.
   - 그런데 CG 28장은 끈을 어깨에 맨 모습이고, 그중 7장은 허리에 가방까지 보인다(`bag_strap_audit.json`).
   - 질문 GM 결과 줄(seq 111~113)의 아시나 입식(`asina_scared`, 후드를 내린 모습)도 끈을 매고 있다(`sheets/zoom_112_sprite_over_bg.png`).
   - 지도 찢김 플래그가 있는데도 툴팁은 '낡은 지도가 들어 있다'라고 말한다.
   - HUD에는 마법 가방과 마법 귀찌만 보이고 핀은 보이지 않는다(state.items에는 pin이 있다, `sheets/hud_items_046.png`).
   - 기존 문구는 고치지 않았다.
10. **크롭 컷에 원작의 흰 칸 여백이 남아 있다(경미).** 게임 화면에서 CG 가장자리에 흰 띠나 사선이 보인다(`sheets/blank_flagged_15.png`).
    - c083_resolve: 왼쪽 사선, seq 12~14
    - c096_hidden_pin: 왼쪽 띠, seq 36
    - c004_lock: 왼쪽, seq 44
    - c008_boots: 오른쪽, seq 52
    - c033_glance: 오른쪽, seq 98
    - c034_panic: 오른쪽, seq 103
    - c039_retinue: 왼쪽, seq 115
    - c039_turning_man: 위·오른쪽, seq 116
    - c091_blood(seq 27): 왼쪽 아래에 원작 페이지의 흰 그라데이션이 대사창 아래까지 비친다.
11. **c085 창문 그림이 앵커보다 2줄 먼저 나온다(판단 필요).** `ep02_prison_window` 0~1줄 '(정신을 차리니까 알겠어.)'와 '(여기가 어디고, 내가 무슨 상황인지.)'에 `ep01_c085_window.png`가 뜬다. 매핑 앵커는 2번째 줄(무대사)이다(seq 15·16). 원작 c084가 그림 없는 흰 여백 해설 칸이라 빈칸을 메운 선택으로 보이지만, 매핑 표에는 근거가 없다.

## 4. 아시나 가방·끈이 보이는 CG

부모에게 따로 전달했다. 판정은 88장 전체를 원본 해상도로 확대해서 했다(`sheets/bag_01~08.png`, `bagzoom_01~06.png`, `bag_crops.png`).

- 가방과 끈이 함께 보이는 7장: c009_walking, c011_bag, c014_wonder, c021_joy, c043_escort, c032_leave, c032_raise_veil
- 끈만 보이는 21장: c077_floor, c078_rise, c080_water, c082_bowed, c085_window, c092_complaint, c096_hidden_pin, ep02_prison_late(c094), ep02_pin(c097), ep02_lockpick(c001, unlock 자유 입력 배경 포함), c005_confidence, c010_citizens, c012_veil, c017_delight, c023_cautious, c027_meal, c034_shoulder, c034_wrist, c035_held_pair, c040_return, c050_noble
- 판정이 애매한 4장: c022_noticed, c019_hands, c033_touch, c034_caught

판정과 각 컷이 쓰인 줄은 `bag_strap_audit.json`에 있다.

## 5. 검증하지 않은 것

- 도주 접근과 `ep02_city_escape` 결말 화면
- 질문의 bargain 접근, conceal 성공(hit/mixed), '행운 3 쓰기' 경로
- 자물쇠 listen 접근, miss·mixed 결과와 재시도 루프, 무입력 idle 대사
- 궁정(아시나가 없는 장면)에서의 GM 질문이나 입력. 이번 경로에서는 그런 조작이 없어서 recent 누출과 idle.rolls 소모는 재현을 시도하지 못했다.
- 가방 없는 판(bag_taken) 같은 다른 계승 조합의 실제 화면. 부모가 FakeGm으로 따로 재현했다.
- 2화 도중 저장·불러오기·다시 시작, 분기 맵·수첩·기록 창
- 모바일 폭(지시로 제외)과 소리
- ep03 21번째 줄 이후
- seq 3~10의 정착 화면(b) 일부는 타자 도중에 찍혔다(seq 10은 확인됨). 이 줄들의 CG 판정은 줄 시작 시점의 DOM 기록으로 했다.

## 6. 증거

- `evidence_manifest.json`: 78개 항목. 경로·설명·크기를 적었고 모두 존재함을 확인했다.
- `shots/`: 333장(줄별 a/b 314장, 판정·정지·입력 화면 포함)
- `sheets/`: 접촉 시트와 확대 53장
- 그 밖의 원자료: `run_log.jsonl`, `page_state.json`, `line_cg_audit.json`, `expected_cg_table.json`, `start_frame_luma.json`, `ask_before_reveal.json`, `ask_after_reveal.json`, `bag_strap_audit.json`, `frame_blank_stats.json`, `frames_index.json`, `scripts/`(Ego 실행 스크립트)
- 18221 서버는 재시작하지 않았다. 게임 세션(ef91bc7d-867f-4d0a-a2a5-c57b9aa41f46)과 세이브도 지우지 않았다.
