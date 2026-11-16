# 6화 원본 참조 입력 준비 완료

2026-11-09. 승인 후보 75개의 실제 원작 참조 입력을 준비했다. native 호출과 독립 그림 검수는 시작하지 않았다. 이 결과는 입력 준비 완료이며 완성 그림이나 QA PASS가 아니다.

| 항목 | 결과 |
|---|---|
| 후보 주 입력 | 75개 |
| 원문 유지·컷 밖 발화 보조 입력 | 7개 |
| 실제 입력 파일 | 82개, 경로·파일 해시 모두 고유 |
| 새 PNG | 73개, `assets/ep06/gen/inputs-original-v1/` |
| 재사용 | 기존 원문 크롭 4개 + 원본 RGB 일치 클린 파일 5개 |
| 원본 범위 | 16장·65컷 및 컷 밖 두 발화 범위 |
| 원본 RGB 불일치·픽셀 누락·중복 | 모두 0 |
| 앵커 포인터 | 158개 역참조, undefined·원문 불일치 0 |
| 기존 4개 크롭·승인 문서·원작·YAML 해시 | 모두 보존 |
| native 호출·생성 후보 결과·독립 그림 검수 | 0회·0개·미실시 |

기존 `mapping.md`, `mapping.json`, `candidate-manifest.json`, `pointer-validation.json`, `verification.json`은 수정하지 않았다. 수정된 708개 포인터와 후보 ID·완성품 목표 파일명을 그대로 계승했다.

실제 경로·원본/입력 SHA-256·확정 크롭 좌표·패널 선택·알파 마스크·최초 공개·주/보조 입력 연결은 `input-manifest-v1.json`에 있다. 82개 입력별 픽셀 증거와 67개 원문 범위의 전체 피복 및 ls 증거는 `input-validation-v1.json`에 있다.

대각 패널 6개는 이웃 그림을 입력으로 잘못 읽지 않도록 패널 밖을 알파 0·RGB 백색으로 비웠다. 선택된 영역은 원본 RGB를 그대로 보존했다. 직선·대각 분리의 합집합은 원래 컷 창 전체이며 누락된 원본 픽셀은 없다. 글자 제거·색 변경·리사이즈·새 그림 생성은 하지 않았다. 원래 말풍선이 경계에 걸린 부분은 원본 좌표·승인 전사·보조 입력을 함께 참조한다.

최종 29컷 정정, c031 적갈색 겉옷, c052 베이지 여행복 회상, c055 우회 권유, c062 현재 가림천/사막 여행복 분리 및 미확정 발화 처리를 유지했다. gap014·gap025의 원문 크롭을 그대로 보존해 각각 c013 유지/ c025 유지 앵커에 연결했다. c029 두 번째 무언 패널은 기존 매핑의 파생 단계이며 YAML에 줄을 만들지 않았다.

원본과 RGB가 같은 기존 클린 파일만 재사용했다: c030·c033·c040·c049·c050. 클린 경로라는 이름만으로 정본 입력으로 간주하지 않았다. 입력 세로 PNG를 완성된 16:9 CG로 보고하지 않는다.

다음 native 생성은 부모의 해당 슬롯 GO 이후에만 가능하다. 이 준비 작업은 끝났으며 부모를 기다리는 실행 작업을 남기지 않는다.

## 후보별 실제 주 입력

| 후보 ID | 실제 원작 입력 경로 | 원본 크롭 `[x0,y0,x1,y1)` |
|---|---|---|
| ep06_c001 | `assets/ep06/gen/inputs-original-v1/ep06_c001.png` | [0,0,2000,5695] |
| ep06_c002 | `assets/ep06/gen/inputs-original-v1/ep06_c002.png` | [0,7192,2000,11350] |
| ep06_c003 | `assets/ep06/gen/inputs-original-v1/ep06_c003.png` | [0,12230,2000,15416] |
| ep06_c005 | `assets/ep06/gen/inputs-original-v1/ep06_c005.png` | [0,17529,2000,20492] |
| ep06_c006 | `assets/ep06/gen/inputs-original-v1/ep06_c006.png` | [0,20582,2000,27876] |
| ep06_c007_hand | `assets/ep06/gen/inputs-original-v1/ep06_c007_hand.png` | [0,478,2000,4278] |
| ep06_c007_eye | `assets/ep06/gen/inputs-original-v1/ep06_c007_eye.png` | [0,3398,2000,6975] |
| ep06_c007_memory | `assets/ep06/gen/inputs-original-v1/ep06_c007_memory.png` | [0,6975,2000,13486] |
| ep06_c008_room | `assets/ep06/gen/inputs-original-v1/ep06_c008_room.png` | [0,13929,2000,18200] |
| ep06_c008_pair | `assets/ep06/gen/inputs-original-v1/ep06_c008_pair.png` | [0,18200,2000,22300] |
| ep06_c008_threat | `assets/ep06/gen/inputs-original-v1/ep06_c008_threat.png` | [0,21650,2000,28857] |
| ep06_c009 | `assets/ep06/gen/inputs-original-v1/ep06_c009.png` | [0,360,2000,5468] |
| ep06_c010 | `assets/ep06/gen/inputs-original-v1/ep06_c010.png` | [0,6603,2000,16378] |
| ep06_c011_face | `assets/ep06/gen/inputs-original-v1/ep06_c011_face.png` | [0,16378,2000,19800] |
| ep06_c011_feet | `assets/ep06/gen/inputs-original-v1/ep06_c011_feet.png` | [0,19800,2000,25442] |
| ep06_c012 | `assets/ep06/gen/inputs-original-v1/ep06_c012.png` | [0,271,2000,7689] |
| ep06_c013 | `assets/ep06/gen/inputs-original-v1/ep06_c013.png` | [0,7946,2000,12355] |
| ep06_c014 | `assets/ep06/gen/inputs-original-v1/ep06_c014.png` | [0,15183,2000,21061] |
| ep06_c015 | `assets/ep06/gen/inputs-original-v1/ep06_c015.png` | [0,95,2000,3825] |
| ep06_c016 | `assets/ep06/gen/inputs-original-v1/ep06_c016.png` | [0,3915,2000,8717] |
| ep06_c017_room | `assets/ep06/gen/inputs-original-v1/ep06_c017_room.png` | [0,10349,2000,16000] |
| ep06_c017_turn | `assets/ep06/gen/inputs-original-v1/ep06_c017_turn.png` | [0,16000,2000,19404] |
| ep06_c018 | `assets/ep06/gen/inputs-original-v1/ep06_c018.png` | [0,20612,2000,25231] |
| ep06_c019 | `assets/ep06/gen/inputs-original-v1/ep06_c019.png` | [0,241,2000,3392] |
| ep06_c020 | `assets/ep06/gen/inputs-original-v1/ep06_c020.png` | [0,4769,2000,14246] |
| ep06_c021 | `assets/ep06/gen/inputs-original-v1/ep06_c021.png` | [0,15573,2000,21069] |
| ep06_c022 | `assets/ep06/gen/inputs-original-v1/ep06_c022.png` | [0,1028,2000,6421] |
| ep06_c023 | `assets/ep06/gen/inputs-original-v1/ep06_c023.png` | [0,7215,2000,11582] |
| ep06_c024 | `assets/ep06/gen/source/ep06_c024.png` | [0,12620,2000,18087] |
| ep06_c025 | `assets/ep06/gen/source/ep06_c025.png` | [0,18345,2000,23014] |
| ep06_c026 | `assets/ep06/gen/inputs-original-v1/ep06_c026.png` | [0,209,2000,6236] |
| ep06_c027 | `assets/ep06/gen/inputs-original-v1/ep06_c027.png` | [0,6975,2000,11733] |
| ep06_c028 | `assets/ep06/gen/inputs-original-v1/ep06_c028.png` | [0,12905,2000,16626] |
| ep06_c029_ra | `assets/ep06/gen/inputs-original-v1/ep06_c029_ra.png` | [0,16743,2000,20720] |
| ep06_c029_nod | `assets/ep06/gen/inputs-original-v1/ep06_c029_nod.png` | [0,19560,2000,23923] |
| ep06_c030 | `assets/ep06/cuts/full_res/clean/ep06_c030.png` | [0,24031,2000,25193] |
| ep06_c031 | `assets/ep06/gen/inputs-original-v1/ep06_c031.png` | [0,542,2000,7071] |
| ep06_c032_order | `assets/ep06/gen/inputs-original-v1/ep06_c032_order.png` | [0,7784,2000,13650] |
| ep06_c032_accept | `assets/ep06/gen/inputs-original-v1/ep06_c032_accept.png` | [0,13650,2000,16789] |
| ep06_c033 | `assets/ep06/cuts/full_res/clean/ep06_c033.png` | [0,20852,2000,23029] |
| ep06_c034 | `assets/ep06/gen/inputs-original-v1/ep06_c034.png` | [0,95,2000,3571] |
| ep06_c035 | `assets/ep06/gen/inputs-original-v1/ep06_c035.png` | [0,4851,2000,8212] |
| ep06_c036_map | `assets/ep06/gen/inputs-original-v1/ep06_c036_map.png` | [0,9322,2000,13100] |
| ep06_c036_table | `assets/ep06/gen/inputs-original-v1/ep06_c036_table.png` | [0,13100,2000,15780] |
| ep06_c037 | `assets/ep06/gen/inputs-original-v1/ep06_c037.png` | [0,17013,2000,22917] |
| ep06_c038 | `assets/ep06/gen/inputs-original-v1/ep06_c038.png` | [0,382,2000,3365] |
| ep06_c039 | `assets/ep06/gen/inputs-original-v1/ep06_c039.png` | [0,4301,2000,14684] |
| ep06_c041 | `assets/ep06/gen/inputs-original-v1/ep06_c041.png` | [0,16854,2000,22111] |
| ep06_c042 | `assets/ep06/gen/inputs-original-v1/ep06_c042.png` | [0,22773,2000,24081] |
| ep06_c043 | `assets/ep06/gen/inputs-original-v1/ep06_c043.png` | [0,1436,2000,4780] |
| ep06_c045 | `assets/ep06/gen/inputs-original-v1/ep06_c045.png` | [0,6886,2000,11404] |
| ep06_c046_question | `assets/ep06/gen/inputs-original-v1/ep06_c046_question.png` | [0,11639,2000,16800] |
| ep06_c046_reaction | `assets/ep06/gen/inputs-original-v1/ep06_c046_reaction.png` | [0,16800,2000,23400] |
| ep06_c046_hands | `assets/ep06/gen/inputs-original-v1/ep06_c046_hands.png` | [0,23400,2000,26285] |
| ep06_c047 | `assets/ep06/gen/inputs-original-v1/ep06_c047.png` | [0,387,2000,5721] |
| ep06_c049 | `assets/ep06/cuts/full_res/clean/ep06_c049.png` | [0,7213,2000,7793] |
| ep06_c050 | `assets/ep06/cuts/full_res/clean/ep06_c050.png` | [0,7793,2000,8273] |
| ep06_c051 | `assets/ep06/gen/inputs-original-v1/ep06_c051.png` | [0,8282,2000,12795] |
| ep06_c052_hood | `assets/ep06/gen/inputs-original-v1/ep06_c052_hood.png` | [0,13082,2000,16400] |
| ep06_c052_escape | `assets/ep06/gen/inputs-original-v1/ep06_c052_escape.png` | [0,16400,2000,20640] |
| ep06_c053 | `assets/ep06/gen/inputs-original-v1/ep06_c053.png` | [0,21833,2000,24576] |
| ep06_c054 | `assets/ep06/gen/inputs-original-v1/ep06_c054.png` | [0,336,2000,4640] |
| ep06_c055 | `assets/ep06/gen/inputs-original-v1/ep06_c055.png` | [0,4966,2000,11629] |
| ep06_c056_nasir | `assets/ep06/gen/inputs-original-v1/ep06_c056_nasir.png` | [0,11862,2000,17750] |
| ep06_c056_ashina | `assets/ep06/gen/inputs-original-v1/ep06_c056_ashina.png` | [0,17750,2000,20795] |
| ep06_c057 | `assets/ep06/gen/inputs-original-v1/ep06_c057.png` | [0,20858,2000,28519] |
| ep06_c058 | `assets/ep06/gen/inputs-original-v1/ep06_c058.png` | [0,11,2000,8084] |
| ep06_c059 | `assets/ep06/gen/inputs-original-v1/ep06_c059.png` | [0,8096,2000,11265] |
| ep06_c060_ashina | `assets/ep06/gen/inputs-original-v1/ep06_c060_ashina.png` | [0,11270,2000,15700] |
| ep06_c060_nasir | `assets/ep06/gen/inputs-original-v1/ep06_c060_nasir.png` | [0,15700,2000,20942] |
| ep06_c062_present | `assets/ep06/gen/inputs-original-v1/ep06_c062_present.png` | [0,235,2000,8000] |
| ep06_c062_desert | `assets/ep06/gen/inputs-original-v1/ep06_c062_desert.png` | [0,8000,2000,12462] |
| ep06_c063 | `assets/ep06/gen/inputs-original-v1/ep06_c063.png` | [0,12857,2000,15928] |
| ep06_c064 | `assets/ep06/gen/inputs-original-v1/ep06_c064.png` | [0,15928,2000,22515] |
| ep06_c065 | `assets/ep06/gen/inputs-original-v1/ep06_c065.png` | [0,22517,2000,27652] |
