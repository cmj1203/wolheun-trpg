# 2026-11-06 사용 그림 원작 대조

## 범위와 집계

`app/content/ep01_desert.yaml`에 선언된 실제 파일 **40개 확인 / 차이 있는 파일 17개**. 차이는 **새 발견 15항목 + 알려진 수정 대상 3항목 = 18행**이다. 하나의 공통 차이가 여러 표정 파일에 걸치므로 행 수와 파일 수는 다르다.

입식 16개(아시나 8, 베히다트 4, GM 4), CG 15개, 배경 5개, 소지품 4개를 확인했다. `blackout`은 그림 파일 없는 암전이라 40개에 넣지 않았다. 사용 선언에는 있지만 이번 경로에서 재생되지 않는 CG도 포함했다.

원작은 `assets/ep01/cuts/full_res/clean/`의 PNG를 입력으로 사용했다. 원작 컷 식별에는 `assets/ep01/cuts.json`, `assets/ep01/gen/art_record.json`, `docs/lead_check48/audit.md`를 교차 확인했다. 베히다트 눈의 화별 작화 차이는 `docs/lead_check41/behi_eye_survey.md`의 1~10화 조사도 참고했다. **이번 감사에서 1~10화 685컷을 새로 전수 열람한 것은 아니다.** 현재 사막 복장의 직접 근거는 1화의 해당 장면이다.

`app/web/main.ts:384` 부근의 도입은 `mascot('smile')`을 사용하므로 별도 도입 일러스트 없이 같은 GM 표정을 쓴다. `app/src/server/main.ts:185`의 `assetRef()`는 실제 파일이 있으면 PNG를 우선한다. 확인한 40개가 모두 존재하므로 `app/web/img/`의 인물·GM SVG는 정상 파일 경로에서 사용되는 추가 원작 그림으로 세지 않았다. `lock.svg`는 UI 기호다.

`app/`, `app_next/`, `assets/`는 수정하지 않았다. 서버 실행·포트 접속·이미지 생성·커밋 없이 파일을 읽고 `docs/audit_1106/`에 문서와 ffmpeg 비교 자료만 만들었다. 실행 화면의 크롭·겹침·분기 재생까지 검증한 보고서는 아니다.

## 증거 읽는 법

`art/`의 쌍 비교는 **왼쪽 원작, 오른쪽 게임 파일**이다. 글자는 ffmpeg에 넣지 않고 아래 표에서 설명한다. 일반 비교는 전체 구성 확인용이며, 복장 판정은 `bag_strap`, `cloak_length`, `asina_skirt`, `asina_boots`, `behi_chest`, `behi_turban`, `behi_sleeves`, `item_bag_detail`의 확대본을 함께 봤다. 이미지를 새로 그리거나 보정하지 않았다.

아래 파일 묶음을 표에서 줄여 적는다.

- **A8**: `assets/ep01/gen/asina/asina_{neutral,smile,surprised,wary}.png` 및 `assets/ep01/gen/hood/asina_hood_{neutral,smile,surprised,wary}.png`.
- **B4**: `assets/sprites/pilot/behidat_{neutral,smile,surprised,wary}.png`.
- **I**: `assets/ep01/gen/items/`.
- **BG**: `assets/ep01/gen/bg/`.

## 발견한 차이

| 어디(file) | 원작 근거(cut id + crop) | 다른 점 | 심각도 | 고치는 법 제안 |
|---|---|---|---|---|
| A8 · 가방 본체 | ep01_c017, c021 / [가방 확대](art/item_bag_detail.png), [착용 끈](art/bag_strap.png) | 원작 여행 짐은 등판의 큰 가죽 배낭과 버클·포켓 구조다. 입식은 앞쪽 골반에 매달린 작은 주머니로 바뀌었다. `cg_hill`의 배낭과도 서로 다른 물건으로 보인다. | 눈에 띈 | c017 배낭을 등 뒤에 두고 원작의 어깨끈 구조로 통일한다. |
| A8 · 가방 끈 | ep01_c021 / [끈 확대](art/bag_strap.png) | 원작 어깨끈의 큰 사각 금속 조절 버클이 없다. 가슴을 가로지르는 매끈한 적갈색 한 줄로 단순화됐다. | 눈에 띈 | c021의 짙은 가죽색·사각 버클·겹친 끈 끝을 복원한다. |
| A8 · 겉옷 하단 | ep01_c017, c036 / [기장 확대](art/cloak_length.png), [앞모습](art/asina_front.png) | 원작은 장화 위로 다리가 읽히는 기장인데 입식은 종아리 아래까지 내려와 실루엣을 가린다. CG와 입식을 전환하면 겉옷 길이가 달라진다. | 눈에 띈 | 원작 c017·c036의 무릎 부근 옷자락과 장화 사이 간격으로 맞춘다. |
| A8 · 속치마 | ep01_c017 / [치마 확대](art/asina_skirt.png), [기장 비교](art/cloak_length.png) | 원작 겉옷 틈의 짙은 남색 속옷 대신 올리브색 치마·밝은 가로 띠·흰 프릴이 보인다. 이 장식은 해당 원작 복장과 다르다. | 눈에 띈 | 원작에서 드러나는 짙은 남색 부분으로 바꾸고 추가 띠·프릴을 없앤다. |
| A8 · 장화 | ep01_c017, c036 / [장화](art/asina_boots.png), [원작 전신 확대](art/cloak_length.png) | 입식은 위가 크게 접힌 갈색 장화다. 원작의 더 짙은 장화와 상단을 두른 좁은 띠 모양이 다르다. | 작음 | 상단 접힘 대신 원작의 좁은 두 줄 구조와 짙은 색을 따른다. |
| B4 · 짧은 목걸이 | ep01_c006 / [목·가슴 확대](art/behi_chest.png) | 원작은 납작한 타원 금속 부품이 연결된 목걸이다. 입식은 둥근 구슬 목걸이로 바뀌었다. | 눈에 띈 | c006의 타원 연결 부품과 빈 연결 고리를 그대로 따른다. |
| B4 · 긴 목걸이 | ep01_c006 / [목·가슴 확대](art/behi_chest.png) | 원작의 긴 막대·작은 구슬이 번갈아 있는 체인과 세공 테두리의 각진 붉은 보석이, 가는 사슬과 매끈한 타원 카보숑으로 단순화됐다. | 눈에 띈 | 체인 구간 패턴과 보석의 각·금테 세공을 함께 복원한다. |
| B4 · 허리 가죽 벨트 | ep01_c006 / [허리 확대](art/behi_chest.png), [허리 다른 시점](art/behi_belt.png) | 원작의 넓은 금색 허리천·사슬 위에 입식은 갈색 가죽 벨트와 큰 사각 버클을 추가했다. 해당 원작 컷에 없는 층이다. | 눈에 띈 | 추가 가죽 벨트를 없애고 금색 천·두 줄 사슬을 기준으로 그린다. |
| B4 · 허리천 층과 색 | ep01_c006 / [가슴부터 허리](art/behi_chest.png) | 원작 금색 허리천 바로 위의 짙은 적갈색 띠가 입식에서는 얇은 붉은 상의 주름처럼 합쳐졌다. 금색 천도 여러 겹으로 뭉쳐 원작의 넓고 평평한 띠와 달라졌다. | 작음 | 적갈색 띠와 금색 띠의 경계를 분리하고 원작 층 순서를 유지한다. |
| B4 · 터번 장식 | ep01_c006 / [머리 장식 확대](art/behi_turban.png) | 붉은 띠·흰 터번·두 깃털이라는 큰 구성은 맞지만 원작의 납작한 타원 연결 장식은 작은 구슬로 바뀌었고, 중앙 보석의 각진 절삭면과 금테 세공이 줄었다. | 작음 | 깃털 수와 방향은 유지하고 연결 장식·보석 세공을 원작 기준으로 바꾼다. |
| B4 · 소맷단 | ep01_c006 / [팔 확대](art/behi_sleeves.png) | 원작 검은 소맷단에 없는 넓은 금색 문양 커프스가 입식 양쪽 손목에 추가됐다. | 눈에 띈 | 금색 커프스를 지우고 원작 검은 소매 끝을 따른다. |
| I/item_magic_bag.png | ep01_c017 / [아이콘과 배낭 확대](art/item_bag_detail.png) | 원작 배낭 대신 한 개 덮개·한 개 잠금쇠의 옆가방이다. 입식의 부드러운 주머니와도 달라 같은 소지품이 세 가지 형태로 존재한다. | 눈에 띈 | 배낭 본체·앞 주머니·양쪽 버클이 식별되는 아이콘으로 통일한다. |
| I/item_map.png | ep01_c030 / [지도 비교](art/item_map.png) | 바랜 종이와 왼쪽 바다는 대응하지만 산맥·강·해안선의 배치가 재해석돼 같은 지도를 그대로 옮긴 그림은 아니다. | 작음 | c030의 지형 배열을 유지한 채 종이 가장자리와 명암만 정리한다. |
| BG/desert_near.png | ep01_c029 / [근경 배경 비교](art/bg_near.png) | 원작의 붉은 바위 절벽·바위 더미·마른 나무·선인장이 전부 사라지고 빈 모래언덕만 남았다. YAML의 ‘모래 언덕 앞’과 바위가 언급되는 장면에서 위치 표지가 사라진다. | 눈에 띈 | c029 지형을 배경으로 옮기고 인물만 제거한다. 모래 원경과 구별되게 바위를 남긴다. |
| BG/desert_wide.png | ep01_c028 / [원경 배경 비교](art/bg_wide.png) | 사막이라는 장소는 맞지만 원작 지면의 선인장·마른 관목·돌과 바람에 날리는 모래가 없어져 깨끗한 사구로 바뀌었다. 주인공을 배경에서 뺀 것은 입식 합성을 위한 것이므로 이 행의 오류로 세지 않았다. | 작음 | 전경 식생·돌·모래바람을 원작 범위에서 복원한다. |

## 이미 알려져 수정 중인 차이

아래 세 행은 새 발견 15항목과 구분했다. 새 후보의 설치 여부나 교정 성패를 이번 감사에서 재검증하지 않았다.

| 어디(file) | 원작 근거(cut id + crop) | 다른 점 | 심각도 | 고치는 법 제안 |
|---|---|---|---|---|
| B4 · 눈 간격 | ep01_c007·c043·c046, `docs/lead_check41/behi_eye_survey.md` / [현재 표정 얼굴](art/behidat_faces.png) | 양 눈 안쪽 간격 문제. 50차 수정 중으로 전달받은 항목이다. `docs/lead_check50/landmarks.json`에는 현재 neutral의 간격/평균 눈너비 1.378, 후보 1.111이라는 기존 측정이 있다. 이번 감사의 새 측정값은 아니다. | 눈에 띈 | 50차 결과를 적용한 뒤 같은 원작 시점과 비교한다. |
| A8 · 귀찌 | ep01_c056 / [원작 귀찌 포함 컷](art/item_earring.png), [현재 얼굴](art/asina_faces.png) | 원작 귓불의 작은 둥근 붉은 알 대신 아래로 늘어지는 장식이다. 54차 수정 중이다. | 눈에 띈 | 귓불에 붙은 작은 붉은 알로 통일하고 매달린 부분을 없앤다. |
| I/item_earring.png | ep01_c056 / [아이콘 비교](art/item_earring.png) | 작은 붉은 알이 아니라 큰 흰색 타원 보석과 금속 클립이다. 54차 수정 중이다. | 눈에 띈 | 귓불에 붙이는 붉은 구슬의 색·크기·형태로 바꾼다. |

## 표정·비율·장면 연속성

- [아시나 얼굴 네 표정](art/asina_faces.png), [후드 얼굴 네 표정](art/asina_hood_faces.png), [베히다트 얼굴 네 표정](art/behidat_faces.png)은 왼쪽부터 neutral, smile, surprised, wary다. 표정 사이에서 머리색·가르마·복장·장식 종류가 새로 바뀌는 추가 차이는 찾지 못했다. 공통 복장 오류가 모든 표정에 반복된다.
- 몸통도 [후드 네 표정](art/hood_bodies.png), [후드 없는 네 표정](art/asina_bodies.png), [베히다트 네 표정](art/behi_bodies.png)으로 확인했다.
- 비율은 캔버스가 아니라 인물 기준이다. 아시나 중립 입식에서 튀어나온 머리 한 가닥을 제외한 정수리 약 y=300, 턱 약 y=451, 발바닥 약 y=1517로 읽으면 `(1517-300)/(451-300) ≈ 8.1`이다. 베히다트는 터번 아래 정수리를 추정해야 하므로 약 y=153, 턱 y=305, 발바닥 y=1480 기준 약 8.7이다. **8머리·9머리 목표와 크게 어긋나는 별도 오류로 세지 않았다.** 수동 좌표와 가려진 두피의 오차가 있으며 정밀 신체 측정 결과는 아니다. [머리 확대](art/heads_measure.png).
- `cg_drink`의 후드는 원작 c031과 일치한다. 후드 제거 대상으로 다시 넣지 않았다.
- `cg_now`·`cg_last`는 후드 착용, `cg_beauty`·`cg_swing`·`cg_lean`은 벗은 상태다. YAML의 미인계 `before: 후드_벗음`, b06의 `cg_swing` 줄 `sets: 후드_벗음`을 확인했다. 정적 선언에서 컷신 뒤 입식이 반대 상태로 남는 문제는 찾지 못했다. 전체 분기를 실행한 결과는 아니다.
- 입식과 CG의 큰 불연속은 후드보다 **가방 종류·끈·하체 복장·목걸이·벨트**에 남아 있다.
- `cg_swing`의 현재 파일은 예전 감사에서 지적한 c055 정면 구도가 아니라 c057의 넘어진 여자·남자·호위 둘·칼 궤적에 대응한다. 과거 지적을 현재 오류로 복사하지 않았다.
- `cg_lean`의 원작은 제작 기록의 c067이 아니라 c068이다. 회전 사용은 승인된 연출이라 오류로 세지 않았다.
- 여행 삼분할의 c023·c024·c025 크롭과 CG의 가로 확장은 허용된 구성으로 판단했다. 원작 지도 바탕·세로 여백을 없앤 것 자체는 차이 행에 넣지 않았다.

## 차이가 있는 17개 파일의 확인 기록

각 줄은 위 공통 차이 표의 적용 범위를 명시한다.

- `assets/ep01/gen/asina/asina_neutral.png` — A8 공통 차이 및 알려진 귀찌.
- `assets/ep01/gen/asina/asina_smile.png` — A8 공통 차이 및 알려진 귀찌.
- `assets/ep01/gen/asina/asina_surprised.png` — A8 공통 차이 및 알려진 귀찌.
- `assets/ep01/gen/asina/asina_wary.png` — A8 공통 차이 및 알려진 귀찌.
- `assets/ep01/gen/hood/asina_hood_neutral.png` — A8 공통 복장 차이, 귀 부위는 후드로 가림.
- `assets/ep01/gen/hood/asina_hood_smile.png` — A8 공통 복장 차이, 귀 부위는 후드로 가림.
- `assets/ep01/gen/hood/asina_hood_surprised.png` — A8 공통 복장 차이, 귀 부위는 후드로 가림.
- `assets/ep01/gen/hood/asina_hood_wary.png` — A8 공통 복장 차이, 귀 부위는 후드로 가림.
- `assets/sprites/pilot/behidat_neutral.png` — B4 공통 차이 및 알려진 눈 간격.
- `assets/sprites/pilot/behidat_smile.png` — B4 공통 차이 및 알려진 눈 간격.
- `assets/sprites/pilot/behidat_surprised.png` — B4 공통 차이 및 알려진 눈 간격.
- `assets/sprites/pilot/behidat_wary.png` — B4 공통 차이 및 알려진 눈 간격.
- `assets/ep01/gen/items/item_magic_bag.png` — 배낭 형태 불일치.
- `assets/ep01/gen/items/item_map.png` — 지형 배열 재해석.
- `assets/ep01/gen/items/item_earring.png` — 알려진 54차 항목.
- `assets/ep01/gen/bg/desert_near.png` — 바위 지형 누락.
- `assets/ep01/gen/bg/desert_wide.png` — 전경 식생·돌·모래바람 누락.

## 추가 원작 차이를 찾지 못한 23개 파일

‘일치’는 허용된 그림체·가로 크롭·회전·배경과 입식 분리를 제외한 내용상 판정이다. GM과 시간대 파생 배경은 대응 원작 컷이 없으므로 별도로 표시한다.

- `assets/ep01/gen/cg/cg_open_c001.png` — c001 태양 대응. [비교](art/cg_open_c001.png).
- `assets/ep01/gen/cg/cg_open_c002.png` — c002 사막·바위 대응. [비교](art/cg_open_c002.png).
- `assets/ep01/gen/cg/cg_open_c003.png` — c003 그림자 연출 대응. [비교](art/cg_open_c003.png).
- `assets/ep01/gen/cg/cg_open_blade.png` — c004 갈색 머리·후드·목 앞 칼날 대응. [비교](art/cg_open_blade.png).
- `assets/ep01/gen/cg/cg_cromwell.png` — c010 성채 대응, 원작 지도·문장 바깥의 성채 크롭. [비교](art/cg_cromwell.png).
- `assets/ep01/gen/cg/cg_manor.png` — c012 저택·정원·분수 대응. [비교](art/cg_manor.png).
- `assets/ep01/gen/cg/cg_hill.png` — c017 후드 벗은 뒷모습·배낭·팔다리·노을 대응. [비교](art/cg_hill.png).
- `assets/ep01/gen/cg/cg_travel.png` — c023 유적·후드·배낭 대응. [비교](art/cg_travel.png).
- `assets/ep01/gen/cg/cg_travel_3cuts.png` — c023 유적, c024 털옷·마을, c025 밤 숲·바위 대응. [유적](art/cg_travel_3cuts.png), [겨울](art/travel_winter.png), [밤](art/travel_night.png).
- `assets/ep01/gen/cg/cg_drink.png` — c031 후드·물주머니·뚜껑·물방울 대응. [비교](art/cg_drink.png), [원작 확대](art/cg_drink_detail.png).
- `assets/ep01/gen/cg/cg_now.png` — c006 후드·남자 복장·칼과 손잡이·배치 대응. [비교](art/cg_now.png).
- `assets/ep01/gen/cg/cg_last.png` — c041 후드·여자의 두 손·남자 등·목 앞 칼 대응. [비교](art/cg_last.png), [원작 확대](art/cg_last_detail.png).
- `assets/ep01/gen/cg/cg_beauty.png` — c049 후드 없음·갈색 머리·손·웃는 표정 대응. [비교](art/cg_beauty.png), [원작 확대](art/cg_beauty_detail.png).
- `assets/ep01/gen/cg/cg_swing.png` — c057 후드 없음·넘어진 여자·호위 둘·칼 궤적 대응. [비교](art/cg_swing.png).
- `assets/ep01/gen/cg/cg_lean.png` — c068 턱 잡는 손·인물 위치·후드 없음 대응, 회전 허용. [비교](art/cg_lean.png), [원작 확대](art/cg_lean_detail.png).
- `assets/ep01/gen/items/item_pin.png` — c097의 벌어진 가는 금속 핀 구조 대응. [비교](art/item_pin.png).
- `assets/ep01/gen/bg/desert_meet.png` — c033 모래언덕 너머 세 사람 유지. 원경으로 더 멀리 잡은 차이는 장면 기능과 모순되지 않는다. [비교](art/bg_meet.png).
- `assets/ep01/gen/bg/desert_dusk.png` — 직접 대응 원작 컷 없는 분기용 시간대 파생 배경. 노을·사구 확인, 원작 일치 판정 대상은 아님. [시간대 비교](art/bg_time.png).
- `assets/ep01/gen/bg/desert_night.png` — 직접 대응 원작 컷 없는 분기용 시간대 파생 배경. 밤·별·사구 확인, 원작 일치 판정 대상은 아님. [시간대 비교](art/bg_time.png).
- `assets/ep01/gen/gm/gm_neutral.png` — 원작 밖 마스코트. 다른 표정과 털색·귀·스카프·보석 구성 일관. [네 표정](art/gm_all.png).
- `assets/ep01/gen/gm/gm_smile.png` — 도입부 포함 공용 마스코트, 외형 일관. [네 표정](art/gm_all.png).
- `assets/ep01/gen/gm/gm_thinking.png` — 마스코트 외형 일관. [네 표정](art/gm_all.png).
- `assets/ep01/gen/gm/gm_surprised.png` — 마스코트 외형 일관. [네 표정](art/gm_all.png).

## 확대 증거의 좌표

좌표는 원본 PNG 기준 `너비:높이:x:y`다. 쌍 비교는 ffmpeg `crop` → `scale` → `pad` → `hstack`을 사용했다. `drawtext`는 사용하지 않았다.

| 비교 파일 | 왼쪽 원작 crop | 오른쪽 게임 crop |
|---|---|---|
| `bag_strap.png` | c021 전체 | asina_neutral `700:900:150:450` |
| `cloak_length.png` | c017 `1200:2100:350:1300` | asina_neutral `600:1000:220:480` |
| `asina_skirt.png` | c017 `1100:1700:400:1700` | asina_neutral `520:700:250:780` |
| `asina_boots.png` | c036 전체 | asina_neutral `600:700:230:810` |
| `behi_chest.png` | c006 `700:1100:1280:1250` | behidat_neutral `600:850:220:300` |
| `behi_turban.png` | c006 `650:650:1250:930` | behidat_neutral `460:470:280:70` |
| `behi_sleeves.png` | c006 `950:1000:750:1400` | behidat_neutral `850:850:80:320` |
| `item_bag_detail.png` | c017 `900:1150:450:1500` | item_magic_bag 전체 |

`asina_faces.png`, `asina_hood_faces.png`, `behidat_faces.png`은 각 원본 파일의 `440:480:300:120` 영역을 잘라 네 표정을 나란히 놓았다. 귀·눈·목걸이를 축소 전신만 보고 판정하지 않았다.

## 먼저 고칠 다섯 가지

1. 아시나 가방을 CG의 배낭·입식의 주머니·아이콘의 옆가방 세 종류에서 원작 배낭으로 통일한다.
2. 아시나의 긴 겉옷과 추가된 올리브색 치마·흰 프릴을 원작 기장과 배색으로 돌린다.
3. 베히다트의 구슬 목걸이·매끈한 타원 보석을 원작 금속 부품·체인·붉은 커팅 보석으로 돌린다.
4. 베히다트의 추가 가죽 벨트·금색 커프스를 없애고 원작 허리천과 소매를 따른다.
5. `desert_near`에 원작 붉은 바위 지형을 돌린다.
