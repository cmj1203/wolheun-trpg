# ep02 가방 제거 v5 독립 QA (CG 2장 + 입식 9종)

2026-11-09. 읽기 전용 독립 검수. 제작 쪽 매니페스트·화소 수치는 근거로 쓰지 않고, 원본(`assets/ep02/gen/production/…`, `assets/ep01/gen/asina/…`)과 v5(`assets/ep02/gen/no_bag/…_v5.png`)를 장마다 전체 장면과 확대 ROI로 나란히 열어 봤다. 마스크 밖 변경 0은 직접 다시 계산했지만 그것만으로 승인하지 않았다. 증거는 전부 `work/continuation/ep02/bag-variants/lead-v5-qa/`에 있다. 이미지 생성·원본·후보·앱·부모 문서는 건드리지 않았다.

## 결론

| # | 파일 | 판정 |
|---|---|---|
| 1 | `ep02_c010_citizens_v5.png` | **PASS** (경미한 잔흔 2건, 선택 수정) |
| 2 | `ep02_c011_bag_v5.png` | **FAIL** |
| 3 | `asina_neutral_v5.png` | **FAIL** (경미, 2화소 수정) |
| 4 | `asina_flustered_v5.png` | **FAIL** (3번과 같은 몸통) |
| 5 | `asina_scared_v5.png` | **FAIL** (3번과 같은 몸통) |
| 6 | `asina_indignant_v5.png` | **FAIL** (3번과 같은 몸통) |
| 7 | `asina_smug_v5.png` | **FAIL** (3번과 같은 몸통) |
| 8 | `asina_tired_v5.png` | **FAIL** (3번과 같은 몸통) |
| 9 | `asina_smile_v5.png` | **PASS** |
| 10 | `asina_surprised_v5.png` | **PASS** |
| 11 | `asina_wary_v5.png` | **PASS** |

**집계: 11건 중 PASS 4 / FAIL 7.** PASS = c010, smile, surprised, wary(4). FAIL = c011, neutral, flustered, scared, indignant, smug, tired(7). (이전 채팅 요약의 "5장 PASS"는 틀린 숫자였고 이 표가 정확하다. 판정은 바뀐 것 없음.)

`initial_manifest.json`의 `assets` 11건과 1:1 대조:

| 매니페스트 `assets[i].name` | 매니페스트 키 | 판정 |
|---|---|---|
| `ep02_c010_citizens` | `cgs.ep02_prod_ep02_c010_citizens` | PASS |
| `ep02_c011_bag` | `cgs.ep02_prod_ep02_c011_bag` | FAIL |
| `asina_neutral` | `sprites.asina_neutral` | FAIL |
| `asina_smile` | `sprites.asina_smile` | PASS |
| `asina_surprised` | `sprites.asina_surprised` | PASS |
| `asina_wary` | `sprites.asina_wary` | PASS |
| `asina_flustered` | `sprites.asina_flustered` | FAIL |
| `asina_scared` | `sprites.asina_scared` | FAIL |
| `asina_indignant` | `sprites.asina_indignant` | FAIL |
| `asina_smug` | `sprites.asina_smug` | FAIL |
| `asina_tired` | `sprites.asina_tired` | FAIL |

매니페스트는 `assets` 11건, `cgs` 2건, `sprites` 9건이고 위 표에 빠진 항목도 덧붙은 항목도 없다.

수정 대상은 c011과 `neutral` 계열 6장이다. `neutral` 계열은 몸통 ROI 화소가 원본·결과 모두 6장에서 완전히 같아서(직접 비교 확인) 한 번 고치면 6장이 같이 고쳐진다.

## 수치로 확인한 것 (직접 재계산, `lead_v5_numeric_check.json`)

| 파일군 | 바뀐 화소 | 마스크 밖 | ROI 밖 | 알파 | 비고 |
|---|---:|---:|---:|---|---|
| c010 | 2,418 | 0 | 0 | RGB | 원본 SHA 일치 |
| c011 | 148,457 | 0 | 0 | RGB | 원본 SHA 일치 |
| neutral 계열 6장 | 41,897 | 0 | 0 | 알파 완전 동일 | 완전 투명 화소의 RGB만 33개 다름(보이지 않음) |
| smile | 41,738 | 0 | 0 | 알파 완전 동일 | 투명 RGB 25개 |
| surprised | 41,788 | 0 | 0 | 알파 완전 동일 | 투명 RGB 48개 |
| wary | 41,909 | 0 | 0 | 알파 완전 동일 | 투명 RGB 14개 |

입식 9종 모두 얼굴·머리·후드 영역(y < 512)의 변경은 0이다. 원본의 베이지 외투와 칼라(후드 모양 포함)는 그대로다. 이 9종은 원래 후드를 쓰지 않은 입식이다. 앞 목 리본 매듭·고리는 그대로이고(고리 하단 왼쪽 겉선 몇 화소만 마스크 경계가 스침) 다시 그려지지 않았다.

## 1. c010 — PASS

- **전체 장면.** `ep02_c010_citizens_full.png` 왼쪽 원본, 오른쪽 v5. 아시나의 등 뒤 대각 가방끈이 없어졌고, 인물 비율·망토·머리카락 흐름·배경 인물이 그대로다.
- **앞쪽 갈색 선은 유지됨.** 인접 원작 c009에서 증명된 망토 목 리본과 앞쪽 대각 선·코트 경계는 원본 그대로다. 앞 의상 보호 사각형 `[630,620,690,755]`의 변경 화소 0을 직접 확인했고, 바뀐 범위 `[533,641,606,792]`는 이 사각형과 겹치지 않는다. `ep02_c010_front_ribbon_zoom5x.png` 가운데 열(v5)에서 앞 리본의 겉선·접힘이 원본과 같고 빨간 변경 표시가 그 위에 없다.
- **등 뒤 끈만 제거.** 어깨에서 허리로 내려가던 끈은 사라지고 그 자리는 머리카락 색 띠와 코트 천으로 이어진다.
- **경미한 잔흔(선택 수정).** 2배(`ep02_c010_seam_native2x.png`) 이상에서만 보이고 CG 표시 크기(약 0.5배)에서는 거의 안 보인다.
  1. 옛 끈 가장자리를 따라 희미한 점선 같은 얇은 선: 대략 `x 584–600, y 647–705`.
  2. 크림색 바닥 위에 옅은 회백색 줄무늬와 점 두 개: 줄무늬 `x 562–572, y 707–745`, 점 `(592,668)`과 `(562,711)`.
  끈 색에 가까운 화소는 마스크 안에서 848 → 326개로 줄었고 나머지는 머리카락 색과 겹친다.

## 2. c011 — FAIL

가방과 끈은 사라졌고 앞 손 피부는 거의 그대로이며 뒤 손의 가려졌던 손가락은 장갑처럼 뭉개지지 않고 말려 쥔 손으로 그려졌다. 목 리본 고리도 같은 모양이다. 그러나 아래 결함이 있다. 좌표는 원본 캔버스 기준 `(x,y)`다.

1. **소매 아래 번진 얼룩(흙탕).** `x 770–808, y 1296–1349`. 소매 안쪽 접힘이 부채꼴로 흐릿하게 번져 칼 같은 셀 윤곽 그림과 어울리지 않는다. 원본(`…_lower_zoom4x.png`, `…_sleeve_smear_zoom6x.png`)에는 이 자리에 가방 아래 모서리가 있었다.
2. **끊긴 소매 밑선.** `x 767–808, y 1277–1279`. 원본에서는 이어진 굵은 소매 밑선이 v5에서는 짧은 점선처럼 끊겨 있고 소매 모서리 옆에 작은 잔선 한 토막(`≈ x 818–826, y 1260`)이 남아 있다.
3. **벽돌 색 불일치.** 가방이 가렸던 자리의 벽돌이 `x 960–1090, y 1100–1290`에서 주위보다 밝고 주황이다. 평균 RGB (190,154,115), 채도 0.393. 같은 줄의 원본 벽돌은 (160,133,108)·채도 0.328, 아래쪽 벽(`x 900–1000, y 1330–1380`)은 원본·v5 모두 (181,153,121)·0.329다. 전체 화면(`ep02_c011_bag_full.png`)에서 손 오른쪽에 주황 후광처럼 보인다. 아래 마스크 경계(`y ≈ 1295–1310`)에서 색이 갑자기 바뀌는 가로 띠도 있다.
4. **원래 보이던 손 피부 변경.** 뒤 손 왼쪽 위 모서리 `(947,989)–(998,1027)`에서 원본의 옅은 피부 화소가 바뀌었다. 엄격한 옅은 피부 기준(R>235,G>225,B>215)으로 총 **87**화소(이 중 가장 큰 연결 성분이 86화소, 이전 요약의 "86"은 이 연결 성분 값)이고, 제작 쪽 피부 기준(R≥220,G≥145,B≥130)으로는 **92**화소다. 예: `(947,989)` 원본 (255,252,247) → v5 (200,176,143). 모서리의 흰 피부가 소매·천 색으로 덮인 것이다. 제작 쪽 "13,627화소 변경 0"과의 관계는 아래 "c011 피부 수치 차이" 절에 정리했다.
5. **참고(비차단).** 가슴·어깨의 새 천(`x 482–900, y 706–1000`)은 접힘이 부드러운 에어브러시 느낌이고 원본의 또렷한 셀 음영과 결이 다르다. 리본 고리와 꼬리는 원본과 같은 모양이라 어긋남은 보이지 않았다.

## 3~8. neutral 계열 6장 — FAIL (경미, 같은 원인)

해당: `neutral`, `flustered`, `scared`, `indignant`, `smug`, `tired`.

- **통과 항목.** 가방 몸체와 끈 제거 완료(가방색 화소 13,795 → 605, 남은 조각은 모두 머리카락·리본 매듭 등 보호 영역 또는 ROI 가장자리). 원본 알파 완전 동일, 얼굴·머리·후드 변경 0, 손(손톱·손가락) 그대로, 외투 주름이 자연스럽게 이어지고 흰·어두운 배경 둘 다에서 후광·번짐 없음.
- **결함 1.** 순수 빨강 (255,0,0) 불투명 화소 2개: `(616,922)`, `(617,922)`. 원본에서는 갈색 (142,79,60), (144,79,63)였다. 가방 모서리가 손 옆에 닿던 자리의 합성 잔재다. 주변에 검은 화소와 흰 화소가 섞인 약 5×6 화소의 잔점이 있다: `x 615–620, y 919–925`. 8배 확대에서 선명한 빨강·검정·흰 점으로 보이고 1배에서도 작은 점으로 보인다.
- **결함 2(보이지 않음).** 알파 1인 순수 초록 화소 `(617,927)`. 지금은 안 보이지만 같은 잔재이므로 같이 정리한다.
- **수정 방법.** 위 잔점 영역을 원본 소매·손 윤곽의 이웃색으로 고르게 메우면 된다. 나머지는 손대지 않는다.
- **참고(비차단).** 몸통 아래 `y ≈ 958`(`x 585–615`)에 옷 음영이 가로로 살짝 바뀌는 희미한 경계가 있다(마스크 끝). 리본 꼬리 아래쪽 `x 516–526, y 676–727` 가장자리가 2화소 정도 계단져 있다.

## 9~11. smile / surprised / wary — PASS

각각 몸통이 neutral 계열과 달라 따로 검수했다(`*_full_roi.png`, `*_roi_dark.png`, `*_hand_zoom8x.png`).

- 가방과 끈이 사라지고 외투·소매·리본이 자연스럽게 이어진다. 원본의 후드(칼라 후드)·얼굴·머리·손·알파가 그대로다.
- 손(`x 585–660, y 880–990`) 8배 확대에서 손톱·손가락 윤곽이 원본과 같고 잔점이 없다. 순수 원색 새 화소 0(`surprised`, `smile`), `wary`는 알파 2인 보이지 않는 노랑 1개 `(619,928)`뿐이다.
- 흰색·어두운색 배경에서 가장자리 번짐 없음.
- **참고(비차단).** `y ≈ 958` 부근의 희미한 가로 음영 경계가 세 장에도 있다.

## c011 피부 수치 차이 정리 (제작 13,627·변경 0 대 검수 87~92 변경)

**두 수치는 서로 다른 화소 집합을 센 것이라 모순이 아니다. 제작 쪽 "변경 0"은 두 보호 다각형 안에서만 참이고, 문서 문장 "원작의 두 손에서 실제 보이던 피부 13,627화소의 변경은 0"은 손 피부 전체로 읽히게 쓰여 있어 과장이다.** 판정(FAIL)은 바꾸지 않는다.

**경로·크기(직접 확인)**
- 원본 `assets/ep02/gen/production/ep02_c011_bag.png`: 1691×1964 RGB, SHA-256이 매니페스트 `source_sha256`(`2b876fd9…ffabcea`)과 일치.
- 후보 `assets/ep02/gen/no_bag/ep02_c011_bag_v5.png`: 1691×1964 RGB.
- 마스크 `work/continuation/ep02/bag-variants/ep02_c011_bag/mask_full_v5.png`: 1691×1964 L.
- 원작 클린 `assets/ep02/cuts/full_res/clean/ep02_c011.png`: 2000×3723 RGB. 매니페스트 `source_box [153,1100,1844,3064]`, `source_crop_pixel_exact: true`.

**좌표 변환**
- 위 좌표는 모두 1691×1964 원본·후보 캔버스 기준 `(x,y)`다.
- ROI(`roi [460,680,1120,1380]`) 국소 좌표 = 캔버스 − (460,680). 변경 범위는 국소 `(487,309)–(538,347)`.
- 원작 클린 좌표 = 캔버스 + (153,1100). 같은 범위는 클린 원본에서 `(1100,2089)–(1151,2127)`.

**제작 수치의 정의**(`work/continuation/ep02/bag-variants/finalize.py` 약 58–70행, 그대로 재현함)
1. ROI 크롭에서 피부 = R≥220, G≥145, B≥130.
2. `boundary` = `mask_polygons.exclude`의 **앞 두 다각형만**(`[:2]`) 채운 영역. ROI 국소 외접 상자는 `(469,307)–(571,402)`와 `(386,356)–(521,486)`이다. 세 번째 제외 다각형은 쓰지 않는다.
3. `visible_skin = 피부 ∧ boundary`, 그중 바뀐 것을 센다.

**재현 결과**(`lead-v5-qa/c011_skin_reconcile.json`)
- 위 정의 그대로: visible_skin **13,627**, 변경 **0** (제작 수치 재현됨).
- 같은 ROI의 같은 피부 기준 전체: **13,719**화소. 보호 다각형 밖은 13,719 − 13,627 = **92**화소이고, 그 **92개가 전부 바뀌었다**.
- 그 92개(엄격 기준 87개)는 최종 마스크 `mask_full_v5.png` 안에 들어 있다. 즉 편집 허용 영역이 이 모서리를 포함했고 제작의 보호 다각형은 포함하지 않았다.
- 다각형 외접 상자 `(469,307)–(571,402)`는 이 모서리를 상자로는 덮지만, 다각형 모양은 가는 띠라서 이 화소들을 포함하지 않는다.

**결론.** 제작 지표는 "보호 다각형 안 피부"만 세므로 이 모서리를 놓쳤다. 원본 손 피부 가운데 92화소(약 0.7%)가 보호 밖에서 바뀌었고, 원본 `(255,252,247)`가 `(200,176,143)` 같은 천 색으로 바뀐 것이 눈에 보이는 변화다. 마스크 밖 변경 0, 보호 다각형 안 변경 0은 둘 다 사실이지만, "원래 보이던 손 피부 유지" 요구에는 충분한 증거가 아니다. 수정 방법: 이 모서리를 보호 다각형에 포함해 원본 피부 화소를 복원한 뒤 지표의 `boundary`를 손 전체(세 번째 제외 다각형 포함 또는 피부 기준 전체)로 넓혀 다시 센다.

## c022 — 별도 UNVERIFIED (완료 11장에 포함하지 않음)

`ambiguous_audit.json`에 따르면 `c022_noticed`는 초록 천 뒤 대각 띠와 손 아래 넓은 띠가 가방끈 후보(중간 신뢰)이고 아직 차분을 만들지 않았다. 이번 검수에서는 새로 만든 파일이 없어 판정할 수 없다.
- 필요한 증거: c022 가방끈 차분 후보 PNG와 그 마스크, 원작 앞뒤 컷에서 그 띠가 가방끈임을 보이는 근거 컷.
- c019 왼쪽 넓은 띠는 같은 이유로 미확정이다(이번 범위 밖).

## 한계

- 원본과 v5의 대조는 화소 비교와 육안 확대로 했다. 실제 게임 화면 합성(1440 스테이지)에서의 보임은 확인하지 않았다.
- c010의 가는 점선·줄무늬, 입식의 y≈958 음영 경계는 표시 배율에서는 거의 안 보일 수 있어 비차단으로 두었다.
- 서버·브라우저·모델은 쓰지 않았다.

## 증거 경로 (모두 `work/continuation/ep02/bag-variants/lead-v5-qa/`)

**수치·스크립트**
- `c011_skin_reconcile.json`(피부 수치 재현), `lead_v5_numeric_check.json`, `sprite_bag_residue_check.json`, `analyze.py`, `evidence.py`, `zoom.py`

**c010**
- `ep02_c010_citizens_full.png`, `ep02_c010_citizens_roi.png`, `ep02_c010_citizens_diff_overlay_roi.png`
- `ep02_c010_seam_zoom5x.png`, `ep02_c010_front_ribbon_zoom5x.png`, `ep02_c010_seam_native2x.png`

**c011**
- `ep02_c011_bag_full.png`, `ep02_c011_bag_roi.png`, `ep02_c011_bag_diff_overlay_roi.png`
- `ep02_c011_hands_zoom4x.png`, `ep02_c011_lower_zoom4x.png`, `ep02_c011_chest_zoom3x.png`, `ep02_c011_sleeve_smear_zoom6x.png`

**입식 9종**(이름마다 `_full_roi.png`, `_roi_dark.png`, `_diff_overlay_roi.png`)
- `asina_neutral_*`, `asina_flustered_*`, `asina_scared_*`, `asina_indignant_*`, `asina_smug_*`, `asina_tired_*`, `asina_smile_*`, `asina_surprised_*`, `asina_wary_*`
- 확대: `asina_neutral_hand_zoom8x.png`, `asina_smile_hand_zoom8x.png`, `asina_surprised_hand_zoom8x.png`, `asina_wary_hand_zoom8x.png`, `asina_neutral_ribbon_zoom4x.png`

**비교한 원본·후보·마스크(읽기만 함)**
- 원본: `assets/ep02/gen/production/ep02_c010_citizens.png`, `assets/ep02/gen/production/ep02_c011_bag.png`, `assets/ep01/gen/asina/asina_{neutral,smile,surprised,wary,flustered,scared,indignant,smug,tired}.png`
- 후보: `assets/ep02/gen/no_bag/ep02_c010_citizens_v5.png`, `assets/ep02/gen/no_bag/ep02_c011_bag_v5.png`, `assets/ep02/gen/no_bag/asina_{…}_v5.png`
- 마스크: `work/continuation/ep02/bag-variants/<이름>/mask_full_v5.png`
- 매니페스트: `work/continuation/ep02/bag-variants/initial_manifest.json`, 근거 문서 `docs/continuation/ep02/bag_variants.md`, 모호 판정 `work/continuation/ep02/bag-variants/ambiguous_audit.json`
