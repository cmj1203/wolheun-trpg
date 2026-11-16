# 61차 아시나 머리 진단 — 대표 편집 차단

2026-11-09. **진단과 편집 전 증거만 완료했다. 일반·후드 편집 대표는 0/2장이며 READY가 아니다.** 생성 도구가 파일을 반환하지 않아 편집 후 얼굴 비교와 1440 검수를 할 수 없다. 나머지 16표정 전파, 운영 자산 교체, 커밋, 코드레빗 요청은 하지 않았다.

작업 산출물 접두어는 `work/demo-slice/lane61/asina-hair/`다. 아래 짧은 증거 파일명은 모두 이 폴더를 기준으로 한다.

## 실제 파일과 첨부 식별

`app/content/ep01_desert.yaml:47,60-77`은 일반 9표정과 후드 9표정을 등록한다. `app/src/server/main.ts:17-19,178-188`에서 프로젝트 루트의 `assets/`를 `MEDIA`로 삼고, 그 아래 상대 경로에 `/media/`를 붙인다.

| 상태 | 파일 | 앱 URL |
|---|---|---|
| 일반 무표정 | `assets/ep01/gen/asina/asina_neutral.png` | `/media/ep01/gen/asina/asina_neutral.png` |
| 후드 무표정 | `assets/ep01/gen/hood/asina_hood_neutral.png` | `/media/ep01/gen/hood/asina_hood_neutral.png` |
| 사용자 첨부의 표정 | `assets/ep01/gen/asina/asina_surprised.png` | `/media/ep01/gen/asina/asina_surprised.png` |

첨부 원본 `/Users/choeminju/omo-discord/attachments/1569161382677581848-2026-11-09_10.26.47.png`를 `attachment_original.png`에 바이트 그대로 보관했다. 입식 18장의 얼굴 영역 `(420,320)-(590,445)`을 0.95~2.30배로 확대해 RGB 정규화 상관으로 대조했다.

- 일반 surprised: **0.984137**, 배율 1.42, 확대 얼굴 안의 위치 `(27,66)`.
- 후드 scared: 0.892277.
- 후드 surprised: 0.880910.
- 일반 scared: 0.848004.

현재 파일 중 일반 surprised가 명확히 가장 가까우며, 앞머리와 양 눈의 배치도 일치한다. 캡처 과정의 리샘플링 차이가 있으므로 동일 PNG 바이트라는 뜻은 아니다. 전체 순위는 `attachment_match.json`, 좌우 비교는 `attachment_match_compare.png`다.

## 원작 근거와 유지할 형태

읽은 프로젝트 기준은 `docs/gpt_art_plan.md`, `work/style/style_rules.md`, `docs/lead_check54/README.md`, `docs/lead_check54b/verification.json`, `docs/lead_check59/faces_survey.md`, `docs/lead_check59/ART_asina_README.md`다. 오래된 입식 브리프의 로컬 생성 지시는 이번 GPT 전용 지시를 따르지 않는 과거 기록으로 취급했다.

1~10화 조사는 기존 54차·59차의 **685컷 조사 기록**을 읽었다. 이번 작업에서 685컷을 새로 전수 열람했다고 주장하지 않는다. 이번에 직접 확대한 원작은 아래 세 컷이다. 좌표는 원본 픽셀의 `(왼쪽,위,오른쪽,아래)`다.

| 원작 파일 | 확대 영역 | 확인한 것 |
|---|---|---|
| `assets/ep01/cuts/full_res/clean/ep01_c049.png` | `(400,3000,1600,4700)` | 정면 가르마, 이마 중앙의 큰 앞머리 묶음, 눈 옆 머리, 귓불 귀찌 |
| 같은 c049 | `(150,3000,1850,7100)` | 어깨에서 몸통 아래로 이어지는 긴 머리의 주 흐름과 큰 웨이브 |
| `assets/ep01/cuts/full_res/clean/ep01_c047.png` | `(0,1100,1000,2800)` | 후드 아래 비대칭 앞머리, 눈 위·관자·볼 옆에서 이어지는 선, 후드와 머리의 겹침 |
| `assets/ep01/cuts/full_res/clean/ep01_c031.png` | `(390,700,1690,2800)` | 옆얼굴의 앞머리 길이, 눈 바깥과 볼 옆을 지나는 머리, 후드 아래 흐름 |

`source_hair_board.jpg`에 모았다. 개별 원작 확대는 `source_ep01_c049_0.png`, `source_ep01_c049_3.png`, `source_ep01_c047_1.png`, `source_ep01_c031_2.png`다.

원작에도 뾰족한 끝과 가는 가닥은 있다. 전부 잘라 매끈한 덩어리로 만드는 것은 잘못이다. **기존 길이·가르마·중앙 앞머리 방향과 큰 묶음의 끝은 유지하고, 같은 곡선을 따라 겹친 잔선과 불필요하게 반복되는 가는 웨이브만 통합**해야 한다. 후드 머리를 일반 머리의 축소판으로 대체하지 않는다.

## 분리한 두 문제

| 항목 | 진단 | 수정 범위와 통과 조건 | 현재 |
|---|---|---|---|
| H1 전체 머리가 지저분함 | 일반 입식 양옆에서 같은 폭의 가는 S자 물결과 따로 도는 외곽 가닥이 반복된다. 원작 c049는 큰 묶음의 방향이 먼저 읽히고 잔선이 그 안에 따른다. 후드는 외곽이 천으로 가려져 일반과 같은 방식으로 실루엣을 고칠 수 없다. | 긴 기장과 주요 끝을 보존하고 큰 묶음으로 연결. 머리끝을 깎는 알파 침식으로 해결하지 않는다. 손·옷·후드 모양 보존. | 진단 완료 / 편집 미완료 |
| H2 얼굴 쪽 머리카락이 이상함 | 일반·후드 중앙 앞머리 끝이 짧은 여러 갈래로 겹치고, 눈썹 위 얇은 머리선·관자에서 귀찌로 이어지는 선이 잘라 붙인 경계처럼 보인다. 사용자 첨부는 일반 surprised에서 이 부위를 보여 준다. | 이마·눈 옆·볼 옆의 **머리와 피부가 맞닿는 최소 영역도 편집에 포함**. 원작처럼 시작부터 끝까지 이어지는 묶음으로 그린다. 눈·눈썹·코·입·표정·인상은 보존. 별도 눈 마스크 합성·블러 금지. | 진단 완료 / 편집 미완료 |

얼굴 원작·현재 확대 비교는 `asina_source_before_face.jpg`, `asina_hood_source_before_face.jpg`다. `asina_face_before_4x.png`와 `asina_hood_face_before_4x.png`는 현재 얼굴을 최근접 방식으로 4배 확대한 것이므로 픽셀 계단을 새 결함으로 세지 않는다.

59차 제작 기록은 눈·입 영역을 별도 편집하고 머리와 귀찌 주변을 보호했다고 명시한다. 따라서 기존 머리 문제는 표정만 바꾸는 과정에서 해결되지 않고 이어질 수 있다. 다만 이번 자료만으로 현재 접합부의 모든 선이 어느 생성 회차에서 생겼는지 확정할 수는 없다. `assets/ep01/gen/asina/manifest.json`과 해당 폴더 README는 오래된 생성 시드·눈높이를 담고 있어 현재 PNG의 정확한 제작 이력으로 쓰지 않았다.

귀찌는 54b 기록의 작은 기존 알·위치를 유지한다. 머리 또는 후드가 귓불을 가로지르는 부분은 **귀찌 위에 머리/후드가 놓여야** 한다. 귀찌를 머리 위로 꺼내거나 크기를 키워 해결하지 않는다.

## 알파와 RGB 분리 측정

전부 1024×1536 RGBA다. `metrics_before.json`에 18장 각각의 SHA-256과 측정값을 저장했다.

- 알파: `0 < A < 255` 개수와 `A > 0`의 8방향 연결 성분에서 가장 큰 성분을 제외한 개수를 센다. 작은 성분은 머리 가닥·안티앨리어싱일 수도 있으므로 자동 삭제 대상이 아니다.
- RGB 후보: `R > G+20`, `B > G+10`, `R > 60`. 전경 `(A>0)`에서 5×5 정사각 침식 결과를 뺀 경계대와 교차한다. 이 조건은 분홍·자주 **의심 색의 검출식**이며 귀찌나 정상 보라 명암까지 모두 오염이라고 단정하지 않는다.
- 영향: 후보의 알파 중앙값, `A>128` 후보 수, `Σ(A/255)`를 함께 센다. 완전 투명 픽셀의 RGB와 실제 보이는 잔흔을 구분한다.

| 파일 | 반투명 픽셀 | 작은 알파 성분 | 경계 RGB 후보 | 그중 A>128 | 알파 가중 면적 |
|---|---:|---:|---:|---:|---:|
| asina_flustered.png | 22825 | 54 | 6360 | 241 | 600.38 |
| asina_indignant.png | 22825 | 54 | 6360 | 241 | 600.38 |
| asina_neutral.png | 22825 | 54 | 6360 | 241 | 600.38 |
| asina_scared.png | 22825 | 54 | 6360 | 241 | 600.38 |
| asina_smile.png | 22454 | 46 | 6386 | 304 | 647.93 |
| asina_smug.png | 22825 | 54 | 6360 | 241 | 600.38 |
| asina_surprised.png | 22500 | 49 | 6391 | 262 | 607.36 |
| asina_tired.png | 22825 | 54 | 6360 | 241 | 600.38 |
| asina_wary.png | 22545 | 46 | 6387 | 257 | 618.12 |
| asina_hood_flustered.png | 185545 | 50 | 1468 | 73 | 159.80 |
| asina_hood_indignant.png | 185545 | 50 | 1468 | 73 | 159.80 |
| asina_hood_neutral.png | 185545 | 50 | 1468 | 73 | 159.80 |
| asina_hood_scared.png | 185545 | 50 | 1468 | 73 | 159.80 |
| asina_hood_smile.png | 186898 | 49 | 1445 | 53 | 151.33 |
| asina_hood_smug.png | 185545 | 50 | 1468 | 73 | 159.80 |
| asina_hood_surprised.png | 188563 | 31 | 1457 | 63 | 159.76 |
| asina_hood_tired.png | 185545 | 50 | 1468 | 73 | 159.80 |
| asina_hood_wary.png | 185817 | 50 | 1470 | 67 | 162.89 |

일반 neutral의 분홍 경계 후보 알파 중앙값은 **4/255**, 후드는 **5/255**다. 따라서 원시 RGB를 불투명하게 보여 주는 확대만 보고 수천 픽셀이 모두 선명하게 보인다고 해석하면 과장된다. 그래도 일반 241개, 후드 73개는 A>128이므로 전부 보이지 않는 RGB도 아니다.

일반 neutral의 머리 영역 `(290,250)-(710,900)`에는 경계 후보 4214개, 알파 가중 면적 368.67px가 있다. 같은 후드 영역은 해당 분홍 검출식으로 **0개**다. 후드 전체의 1468개는 주로 옷 밑단과 손 쪽이다. 이 값으로 후드의 황색·적색 잔흔까지 없다고 판정하지 않는다. 머리 그림 자체의 복잡함과 분홍 RGB 문제는 별도다.

후드의 반투명 수가 큰 이유 중 하나는 A=253인 픽셀이 137593개이기 때문이다. A=253은 약 99.2% 불투명이므로 185545개를 전부 배경이 비치는 구멍이라고 세지 않는다. A>128에서 후드 neutral의 분리 성분은 0개다.

이 문제는 실제 PNG의 RGB·알파에서 측정된다. 앱의 `/media/` 접두어나 CSS가 새 분홍색을 만든다는 근거는 없다. 머리 모양을 개선하려면 그림의 선과 묶음을 편집해야 하고, RGB 잔흔을 지우려고 머리 알파를 깎아서는 안 된다.

## 편집 전 검수 증거

| 증거 | 상태 |
|---|---|
| `expressions_face_sheet.jpg` | 실제 18표정 얼굴 비교 |
| `asina_neutral_before.png`, `asina_hood_neutral_before.png` | 실제 무표정 PNG 복사, 투명도 보존 |
| `asina_neutral_before_backgrounds.jpg`, `asina_hood_neutral_before_backgrounds.jpg` | 흰색·어두운색·체커 배경 합성 |
| `asina_neutral_hair_before.png`, `asina_hood_neutral_hair_before.png` | 머리 확대 |
| `asina_tips_hands_clothes_before.jpg`, `asina_hood_tips_hands_clothes_before.jpg` | 머리끝·손·옷을 흰색과 어두운색에서 비교 |
| `asina_game1440_before_composite.png`, `asina_hood_game1440_before_composite.png` | 1440×900 게임 크기 정적 합성, 편집 전만 존재 |

1440 합성은 `app/web/style.css:53-59,83-121`의 16:9 무대, 입식 높이 130%, bottom -36.3%, left 슬롯 7%·폭 34%를 사용했다. 1440×900에서 무대는 1440×810, 위아래 45px이며 입식 배율은 `810×1.3/1536 = 0.685546875`다. 실제 사막 배경 위에 합성했으며 대사창·그림자·비네트는 넣지 않았다. **실행 중인 게임 화면 캡처가 아니고, 편집 후 시각 통과 증거도 아니다.** 두 파일을 직접 열어 원본 머리 실루엣과 얼굴 크기를 확인했다.

## 생성 도구 차단과 재개 조건

현재 세션의 파일 참조 도구 `generate_image`에 일반 neutral 원본, 실제 c049 얼굴 확대, 아시나 스타일 시트를 전달했다. 결과는 다음과 같다.

```json
{
  "reason": "provider_native_bypass",
  "source": "none",
  "paths": [],
  "generated": 0,
  "error": "Image generation is handled by the provider's native server-side tool for the current model. Call the native image_generation tool instead of generate_image."
}
```

네이티브 `image_gen` 호출도 이 작업 폴더에서 검수할 수 있는 편집 파일을 남기지 않았다. 앞선 중간 보고에 적은 `UserError`라는 이름은 보존된 구조화 도구 결과로 확인되지 않으므로 최종 오류명으로 쓰지 않는다. 확인 가능한 실패는 위 `provider_native_bypass`와 생성 파일 0개다.

`generation_attempt.json`에 파일 참조 요청과 반환 세부를 보관했다. 생성되지 않은 결과를 채우기 위해 로컬 SD, 손그림, 머리 침식, 눈판 합성을 하지 않았다. `*_generated.png`나 `*_after.png`를 만들지 않았다.

재개할 때는 참조 이미지 편집 결과를 실제 파일로 반환하는 GPT/Astra 경로가 필요하다. 그 뒤 일반·후드 **neutral 2장만** 생성하고 다음 항목을 모두 확인해야 한다.

1. H1과 H2를 따로 대조한다. 얼굴과 맞닿은 머리를 편집 범위에서 빼지 않는다.
2. 눈·눈썹·코·입·표정·인상, 신체 비율, 복장·후드, 귀찌 크기·위치를 보존한다. 귀찌는 머리/후드 아래에 둔다.
3. 각 대표의 원작/전/후 얼굴 확대, 전체 머리 흐름, 흰색/어두운색/투명 배경과 머리끝·손·옷 검수를 남긴다.
4. 같은 1440 크기의 전/후 합성을 확인한다. 현재 파일은 전 자료일 뿐이다.
5. 두 대표에 대한 리드 승인이 부모에게 전달되기 전까지 다른 16표정 생성과 설치를 하지 않는다.

`verification.json`에는 첨부 복사 일치, 18개 운영 파일의 시작·종료 SHA-256 일치, 후보 파일 부재를 기록한다. `ls_verification.txt`는 산출물 실제 경로의 `ls -l` 결과다. 이 보고는 **생성 차단 인계**이며 완성 그림 승인 요청이 아니다.
