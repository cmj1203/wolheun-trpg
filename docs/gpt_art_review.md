# GPT 그림 독립 검수 (11-04, 3차 갱신)

기준: `docs/gpt_art_plan.md` 검수 기준 + 사막에 선인장·식물 없음, 칼은 칼날·날밑·손잡이, 베히다트 웃음은 이 없는 짧은 비웃음, 15세, 글자·말풍선·효과선·칸 테두리 없음(컷인은 효과 가능, 글자 불가).
**현재 29장: PASS 25 / REJECT 4.** 3차 범위 8장은 PASS 4(asina), REJECT 4(behidat)이고, 나머지 21장은 앞선 PASS 그대로다. 그림은 고치지 않았다.
비교 자료: `work/art/gpt/gpt_sheet.jpg`(새 그림 + 원작 컷), `work/art/gpt/review_composite.jpg`(1080p 재현 합성).

## 판정표

| 파일 | 판정 | 이유 / 다시 그릴 것 |
|---|---|---|
| cg/cg_swing.png | PASS (1차) | 칼날·날밑·손잡이·폼멜 연결, 손가락 정상, 글자·식물 없음 |
| cg/cg_swing_hood.png | PASS (2차) | 눈가·뺨 빗금이 사라졌고 편집 경계가 안 보인다. 칼·손·구도 유지 |
| cg/cg_last.png | PASS (1차) | 칼끝이 목에 닿고 피 없음, 칼 세 부분 완전, 후드 유지 |
| cg/cg_drink.png | PASS (1차) | 물주머니에서 입으로 물이 이어짐, 손가락 정상 |
| cg/cg_beauty.png | PASS (2차) | 흰 마름모 코가 작은 음영 틱으로 바뀌었고 1080p와 3배 확대 모두에서 패치 경계가 안 보인다. 코가 다른 CG보다 조금 작을 뿐 어색하지 않다 |
| cg/cg_lean.png | PASS (1차) | 남자가 숙여 얼굴을 들여다봄, c067과 뜻 일치, 후드 벗은 뒤 장면 |
| hood/asina_hood_neutral.png | PASS (1차) | 후드·웨이브·리본·망토 맞음, 가장자리 후광 없음 |
| hood/asina_hood_smile.png | PASS (2차) | 눈 선·홍채가 기본 그대로이고 입과 눈꺼풀만 변한다. 1차의 잡선·얼룩 없음 |
| hood/asina_hood_surprised.png | PASS (2차) | 번짐 없음, 선 굵기 기본과 같음. 눈은 거의 그대로이고 입으로 놀람을 읽는다 |
| hood/asina_hood_wary.png | PASS (2차) | 회백 띠 없음, 기본 선으로 눈꺼풀만 내림 |
| asina/asina_neutral.png | PASS (3차) | 정수리 윤곽이 매끄럽고(알파 급변 0곳, 반투명/경계 7.84, 후드판 1곳·6.03) 접힌 후드 끝이 또렷한 천 끝으로 끝난다. 원본 크기와 게임 크기 모두 얼룩 없음. 얼굴 중심은 2차와 같고(변경 0px), 후드판과 위치 어긋남 (0,0) |
| asina/asina_smile.png | PASS (3차) | 후드판 smile 패치가 적용돼 게임 크기에서 웃음이 보인다(바뀐 픽셀 4866, 후드판과 같은 수). 머리 튐 없음 |
| asina/asina_surprised.png | PASS (3차) | 눈 선 굵기·표정 합격, 경계 수정본 적용. 다만 얼굴은 2차 그대로(얼굴 중심 변경 0px)이고 후드 패치가 재적용되지 않았다. 후드판과 눈 크기·입 크기가 달라(눈·입 구역 5046px 차이) 같은 표정으로 전환하면 표정이 조금 바뀐다. 머리 위치는 안 튐 |
| asina/asina_wary.png | PASS (3차) | 눈 선 굵기·표정 합격, 경계 수정본 적용. surprised와 같이 후드 패치는 재적용되지 않았다(5120px 차이). 머리 위치는 안 튐 |
| behidat/behidat_neutral.png | REJECT | 허리 y≈714에 가로 이음새가 남았다. 양쪽 금장 띠가 여기서 끊겨 옆으로 어긋나고(왼쪽 바깥선 460→456, 오른쪽 바깥선 550→554, 무늬도 끊김), 주름도 수평선에서 잘린다. 원본 크기에서 뚜렷하고 게임 크기에서도 금장 꺾임이 보인다. 그 밖에는 합격: 발 1519로 아시나와 일치, 다리·부츠 정상, 아시나 옆 비율 자연스러움, y<715 머리·몸통·손은 2차 합격본과 같음(변경 0px). **다시 그릴 것: y≈690~740 띠만 마스크 편집해 금장 띠를 위아래로 잇고 주름의 수평선을 없앰.** 다리·머리는 유지 |
| behidat/behidat_smile.png | REJECT | neutral의 허리 이음새를 이어받음. 표정은 합격: 화면 오른쪽 입꼬리가 올라가 게임 크기에서 짧은 비웃음으로 읽히고 이 안 보임, 변경은 3차 마스크 안(밖 0px). **새 neutral 위에 입 패치만 재적용** |
| behidat/behidat_surprised.png | REJECT | neutral의 허리 이음새를 이어받음. 표정은 합격(y<700에서 2차 합격본과 변경 0px). **새 neutral로 재출력** |
| behidat/behidat_wary.png | REJECT | neutral의 허리 이음새를 이어받음. 표정은 합격(y<700에서 2차 합격본과 변경 0px). **새 neutral로 재출력** |
| bg/desert_wide.png | PASS (1차) | 식물·바위 없음, 같은 사막으로 읽힘 |
| bg/desert_meet.png | PASS (1차) | 먼 실루엣 셋, near와 같은 그림 |
| bg/desert_near.png | PASS (1차) | meet와 차이가 실루엣 자리뿐 |
| bg/desert_dusk.png | PASS (2차) | 측정한 능선 11곳 모두 near와 같은 y. 바닥 윤곽 상관 0.999. 구름 배치도 같고 빛만 변했다. 경계 번짐 없음 |
| bg/desert_night.png | PASS (2차) | 능선 11곳 모두 near와 같고 바닥 윤곽 상관 0.996. 하늘은 새로 그려 구름이 다르지만 땅은 같은 곳으로 읽히고 들쭉날쭉한 구름도 사라졌다. 모래가 조금 칙칙한 회보라색(권고 수준) |
| fx/cutin_crit.png | PASS (1차) | 글자 없음, 가운데 비어 장면이 보임 |
| fx/cutin_miss.png | PASS (2차) | 게임 크기에서 깨진 땅과 돌조각으로 읽히고 가지·잎처럼 보이지 않는다. 글자 없음, 가운데 비어 있음, RGBA 알파 최대 182 |
| items/item_magic_bag.png | PASS (1차) | 낡은 가죽 가방, 글자 없음. 끈 색이 입식·CG와 조금 다름(권고 수준) |
| items/item_earring.png | PASS (1차) | 달빛 돌 귀찌, 집게 보임 |
| items/item_map.png | PASS (1차) | c030 같은 낡은 지도, 글자 없음 |
| items/item_pin.png | PASS (1차) | 가는 핀, 글자 없음. 얇아서 작은 칸에서는 안 보일 수 있음 |

## 설치 대응표 (최종 PASS 25장)

대상 경로는 `docs/gpt_art_plan.md` 기준이고, yaml 키는 `app/content/ep01_desert.yaml`의 `file:` 값과 대조해 맞는 것만 적었다. 현재 상태는 대상 파일의 존재 여부다. 계획대로 덮어쓰기 전에 기존 파일을 각 폴더 `sdxl/`로 옮긴다.

| 대상 파일 | 원본 파일 | yaml 키 | 대상 현재 상태 |
|---|---|---|---|
| `assets/ep01/gen/cg/cg_swing.png` | `work/art/gpt/cg/cg_swing.png` | cg_swing | 있음(덮어씀) |
| `assets/ep01/gen/cg/cg_swing_hood.png` | `work/art/gpt/cg/cg_swing_hood.png` | cg_swing_hood | 있음(덮어씀) |
| `assets/ep01/gen/cg/cg_last.png` | `work/art/gpt/cg/cg_last.png` | cg_last, cg_now | 있음(덮어씀) |
| `assets/ep01/gen/cg/cg_drink.png` | `work/art/gpt/cg/cg_drink.png` | cg_drink | 있음(덮어씀) |
| `assets/ep01/gen/cg/cg_beauty.png` | `work/art/gpt/cg/cg_beauty.png` | cg_beauty | 있음(덮어씀) |
| `assets/ep01/gen/cg/cg_lean.png` | `work/art/gpt/cg/cg_lean.png` | cg_lean | 있음(덮어씀) |
| `assets/ep01/gen/hood/asina_hood_neutral.png` | `work/art/gpt/hood/asina_hood_neutral.png` | asina_hood | 있음(덮어씀) |
| `assets/ep01/gen/hood/asina_hood_smile.png` | `work/art/gpt/hood/asina_hood_smile.png` | asina_hood_smile | 있음(덮어씀) |
| `assets/ep01/gen/hood/asina_hood_surprised.png` | `work/art/gpt/hood/asina_hood_surprised.png` | asina_hood_surprised | 있음(덮어씀) |
| `assets/ep01/gen/hood/asina_hood_wary.png` | `work/art/gpt/hood/asina_hood_wary.png` | asina_hood_wary | 있음(덮어씀) |
| `assets/ep01/gen/asina/asina_neutral.png` | `work/art/gpt/asina/asina_neutral.png` | asina | 있음(덮어씀) |
| `assets/ep01/gen/asina/asina_smile.png` | `work/art/gpt/asina/asina_smile.png` | asina_smile | 있음(덮어씀) |
| `assets/ep01/gen/asina/asina_surprised.png` | `work/art/gpt/asina/asina_surprised.png` | asina_surprised | 있음(덮어씀) |
| `assets/ep01/gen/asina/asina_wary.png` | `work/art/gpt/asina/asina_wary.png` | asina_wary | 있음(덮어씀) |
| `assets/ep01/gen/bg/desert_wide.png` | `work/art/gpt/bg/desert_wide.png` | desert_wide | 있음(덮어씀) |
| `assets/ep01/gen/bg/desert_meet.png` | `work/art/gpt/bg/desert_meet.png` | desert_meet | 있음(덮어씀) |
| `assets/ep01/gen/bg/desert_near.png` | `work/art/gpt/bg/desert_near.png` | 없음 | 없음(새로 만듦) |
| `assets/ep01/gen/bg/desert_dusk.png` | `work/art/gpt/bg/desert_dusk.png` | desert_dusk | 있음(덮어씀) |
| `assets/ep01/gen/bg/desert_night.png` | `work/art/gpt/bg/desert_night.png` | desert_night | 있음(덮어씀) |
| `assets/ep01/gen/fx/cutin_crit.png` | `work/art/gpt/fx/cutin_crit.png` | 없음 | 없음(새로 만듦) |
| `assets/ep01/gen/fx/cutin_miss.png` | `work/art/gpt/fx/cutin_miss.png` | 없음 | 없음(새로 만듦) |
| `assets/ep01/gen/items/item_magic_bag.png` | `work/art/gpt/items/item_magic_bag.png` | 없음 (items id: magic_bag) | 없음(새로 만듦) |
| `assets/ep01/gen/items/item_earring.png` | `work/art/gpt/items/item_earring.png` | 없음 (items id: earring) | 없음(새로 만듦) |
| `assets/ep01/gen/items/item_map.png` | `work/art/gpt/items/item_map.png` | 없음 (items id: map) | 없음(새로 만듦) |
| `assets/ep01/gen/items/item_pin.png` | `work/art/gpt/items/item_pin.png` | 없음 (items id: pin) | 없음(새로 만듦) |

REJECT로 아직 설치하면 안 되는 것: `assets/sprites/pilot/behidat_{neutral,smile,surprised,wary}.png`(원본 `work/art/gpt/behidat/`, yaml 키 `man`, `man_smile`, `man_surprised`, `man_wary`).

### 대응이 안 되는 것

| 항목 | 문제 | 필요한 일 |
|---|---|---|
| `desert_near.png` | yaml에 키가 없고 어느 장면도 안 쓴다 | 키를 만들어 연결해야 한다. 파일만 넣으면 화면에 안 나온다 |
| `desert_blade`, `desert_glare` | 두 키 모두 `desert_blade.png`를 가리키고 장면 `bg:`에서 쓰이지 않는다. 계획은 이 배경을 없애기로 했다 | 키 삭제 또는 near로 교체 |
| 장면 배경 흐름 | `bg:` 사용 횟수가 wide 16, meet 2, night 2, dusk 1이다. 계획은 b04~b08을 near로 잡았지만 meet 뒤 603행 등에서 wide로 돌아간다. wide는 meet와 언덕이 달라 장소가 바뀐 것처럼 보일 수 있다 | 데모 레인이 해당 장면의 `bg:`를 near로 바꿀지 판단 |
| `cutin_crit.png`, `cutin_miss.png` | yaml과 앱 코드 어디에도 참조가 없고 `assets/ep01/gen/fx/`도 없다 | 폴더 생성과 표시 코드 연결 |
| `item_*.png` 4장 | yaml `items`에 `file` 칸이 없고 앱 코드 참조도 없으며 `assets/ep01/gen/items/`도 없다. id는 파일 이름과 맞는다(`magic_bag`, `earring`, `map`, `pin`) | 폴더 생성, `file` 칸과 표시 코드 연결 |
| 베히다트 이름 | 파일은 `behidat_*`, yaml 키는 `man*`이고 `sprites/pilot/`은 `gen/` 밖이다. 값은 맞으니 그대로 쓰면 된다 | 없음(주의만) |
| `gm`, `gm_smile`, `gm_thinking`, `gm_surprised` | yaml 키는 있지만 이번 검수 범위 밖이라 표에 없다 | 여우 검수 뒤 추가 |

## 측정

도구: `tools/sprites/.venv/bin/python`(PIL 13.0, numpy 2.5).

| 묶음 | 크기·모드 | 알파 bbox | 좌우 닿음 | 흰 테두리 |
|---|---|---|---|---|
| hood 4장 | 1024x1536 RGBA | (243,223)-(763,1519) | 좌 0·우 0 | 가장자리 12119px 중 179px, 대부분 y 1100~1299 치맛단 흰 프릴. 밝기 81 < 137, 후광 없음, 자홍 0 |
| asina 4장 | 1024x1536 RGBA | (243,260)-(763,1519) | 좌 0·우 0 | 12064px 중 190px, 대부분 치맛단 프릴. 밝기 74 < 130, 후광 없음, 자홍빛 2px |
| behidat 4장 | 1024x1536 RGBA | (300,85)-(722,1519) | 좌 0·우 0 | 16109px 중 233px, 깃털·터번 등 흰 부분. 밝기 86 < 94, 후광 없음, 자홍빛 1px |
| CG 6장 | 1920x1080 RGB | 전체 | 해당 없음 | 해당 없음 |
| 배경 5장 | 1920x1080 RGB | 전체 | 해당 없음 | 해당 없음 |
| 컷인 2장 | 1920x1080 RGBA | 평균 알파 crit 0.211, miss 0.194 | 해당 없음 | 해당 없음 |
| 아이템 4장 | 512x512 RGBA | 가방 (83,43)-(415,469), 귀찌 (155,148)-(349,367), 지도 (29,96)-(481,418), 핀 (109,85)-(433,442) | 네 변 0 | 후광 안 보임 |

표정과 기본의 차이:

| 파일 | 바뀐 픽셀 | bbox | 바뀐 행 | 마스크 밖 | 알파 변화 |
|---|---|---|---|---|---|
| asina_hood_smile | 4866 | (440,378)-(579,469) | 378~425, 434~468 | 0 | 0 |
| asina_hood_surprised | 5360 | (440,378)-(579,469) | 378~426, 436~468 | 0 | 0 |
| asina_hood_wary | 4713 | (440,378)-(579,469) | 378~423, 434~468 | 0 | 0 |
| asina_smile | 4866 | (440,378)-(579,469) | 378~425, 434~468 | 0 | 0 |
| asina_surprised | 5555 | (439,380)-(581,468) | 380~427, 437~467 | 0 | 0 |
| asina_wary | 5674 | (439,380)-(581,469) | 380~428, 436~468 | 0 | 0 |
| behidat_smile | 1071 | (500,367)-(541,401) | 367~400 | 0 (3차 마스크 기준) | 0 |
| behidat_surprised | 4599 | (434,297)-(582,398) | 297~334, 369~397 | 0 | 0 |
| behidat_wary | 4632 | (434,298)-(582,397) | 298~334, 369~396 | 0 | 0 |

위치·비율:

- 얼굴 높이(매니페스트): behidat 169 / hood 156.04 = **1.083**, 기준 1.086과 -0.3% 차이. 눈~턱(베히다트는 매니페스트 턱 419, 아시나는 확대 판독, 오차 약 3px)은 103 / 77 = 약 1.34.
- 눈높이: hood 403.7, asina 403.7(매니페스트 정렬값), behidat 316. 차이 87.7px, 1080p 화면 약 53px로 베히다트가 위.
- 발: hood·asina·behidat 모두 1519. 3차에서 차이가 없어졌다. 눈~발 길이는 behidat 1203, 아시나 1115.
- 후드판과 벗은 판 전환: neutral끼리 얼굴 중심(y 370~480, x 455~570)을 비교하면 밝기가 가장 잘 맞는 위치 어긋남이 (0,0)이고(1px 옮기면 평균 차이 0.76 → 11.5), 바뀐 픽셀은 y 440 아래 턱 옆 머리칼 구역에만 있다. 눈과 코는 같아 머리가 튀지 않는다.

배경 능선(y, near / dusk / night): 앞 능선 x=100·500·900·1300·1700·1880은 587·629·675·708·741·752로, 스카이라인 x=300·700·1000·1460·1800은 461·468·456·428·449로 세 장이 모두 같다.

## 게임 크기 합성

`work/art/gpt/review_composite.jpg`: desert_near 위에 `style.css` 값(칸 높이 86%, bottom -3%, 왼쪽 left 7%, 오른쪽 right 22%, 그림자)을 적용했다. 맨 위는 마스크 78~91% 적용, 다음 칸은 마스크 없음과 표정 조합, 그 아래는 후드판 4장과 벗은 판 4장의 얼굴, 베히다트 표정 4장과 허리다. 실제 게임 화면 캡처가 아니라 같은 수치로 재현한 합성이다.

- 스타일: 셀 입식과 부드러운 배경은 무난하게 어울린다.
- 새 베히다트는 다리가 길어져 아시나 옆에서 키와 비율이 자연스럽고 발도 맞는다. 합성본 맨 아래에 허리 이음새 확대가 있다.

## 그림 밖 전달 사항

- **CSS 마스크(데모 레인).** `.slot img`의 78~91% 마스크는 무릎에서 잘린 옛 입식용이라 전신 입식의 부츠를 지운다. 코드는 건드리지 않았다.
- **아시나 표정 패치.** 3차 지시와 달리 surprised·wary에는 후드 패치가 적용되지 않았다(2차와 얼굴 동일). 같은 표정으로 후드 전환할 때 표정이 조금 바뀐다. 맞추려면 후드 패치를 같은 좌표로 얹으면 된다.
- **의상.** 입식의 금장 로브·스카프가 CG와 맞게 바뀌었다. 입식에는 CG의 긴 붉은 망토가 없고 보석이 타원, 깃털이 1개라 CG와 작은 차이가 남지만 기준 위반은 아니다.
- **CG 해상도:** `review.md`대로 1920x1088 직접 생성이 아니라 늘려 맞췄다. 최종 크기는 맞다.
- **계획 문서 차이:** 계획은 시트를 `assets/ep01/gen/gpt_sheet.jpg`로 적었지만 지시대로 `work/art/gpt/gpt_sheet.jpg`에 두었다.
- 확인 안 한 것: 실제 게임 안 표시와 표정 전환 재생(합성과 정지 그림만 봄). GM 여우는 범위 밖.
