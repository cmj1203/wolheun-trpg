# PR3 적용 전후 화면 비교(1440x810, 시드 2, 마우스 경로)

같은 시나리오를 패치 전(`cap_before`)과 후(`cap_after2`)에 찍어 화면 글, 그림 해시를 비교했다.

| 장면 | 화면 | 보이는 글 | 그림 해시 |
|---|---|---|---|
| 01_title | title | 같음 | 같음 |
| 02_line1 | line | 같음 | 같음 |
| 03_line4 | line | 같음 | 같음 |
| 04_notes | line | 같음 | 같음 |
| 05_log | line | 같음 | 같음 |
| 06_feedback | line | 같음 | 같음 |
| 07_slots | line | 같음 | 같음 |
| 08_free | free | 같음 | 같음 |
| 09_after_action | dice | 같음 | 같음 |
| 11_free2 | free | 같음 | 같음 |
| 12_confirm | free | 같음 | 같음 |
| 13_result | result | 같음 | 같음 |
| 14_atlas | result | 같음 | 같음 |
| 15_atlas_hint | result | 같음 | 같음 |
| 16_title_again | title | 같음 | 같음 |

첫 후 촬영(`cap_after`)에서는 08_free 의 비틀기 줄 글자 1119픽셀만 달랐다(애니메이션 시점). 다시 찍으니 전과 0픽셀 차이여서 패치 영향이 아니다.
