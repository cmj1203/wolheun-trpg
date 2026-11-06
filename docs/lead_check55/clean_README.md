# 픽셀 정리 검증

- 원본 파일은 수정하지 않았다. 후보와 마스크는 work/demo-slice/cleanup/ 아래에 있다.
- 베히다트: 반투명 테두리와 가장자리의 불투명 녹색 오염만 선택했다. 알파는 그대로 두고, 1픽셀 안쪽까지 완전히 불투명한 내부에서 가장 가까운 RGB를 가져왔다.
- 장화: y=1352와 y=1362의 정상 윤곽 사이에서 접힘 아래 9행의 바깥 잔선만 제거했다. 경계에는 1픽셀 안티앨리어싱을 남겼다. 표정마다 좌우 끝점을 새로 측정했다.
- 마스크 밖 차이는 저장된 PNG를 다시 읽어 원본 RGBA와 비교했다. 마스크 PNG의 흰색이 허용 수정 영역이다. bbox는 오른쪽·아래 끝을 포함하지 않는다.
- 재실행: `uv run --with pillow --with numpy python work/demo-slice/cleanup/clean.py`
- 새 베히다트 파일은 명령 뒤에 PNG 경로를 추가한다. lane59의 4종은 존재하면 자동 처리한다.

| 파일 | 마스크 bbox | 마스크/변경 픽셀 | 마스크 밖 차이 | 미해결 색 픽셀 | 장화 기준과 동일 |
|---|---|---|---|---|---|
| assets/sprites/pilot/behidat_neutral.png | [290, 83, 731, 1522] | 16563/16562 | 0 | 0 | None |
| assets/sprites/pilot/behidat_smile.png | [289, 83, 731, 1522] | 16754/16754 | 0 | 0 | None |
| assets/sprites/pilot/behidat_surprised.png | [35, 77, 731, 1522] | 16746/16743 | 0 | 0 | None |
| assets/sprites/pilot/behidat_wary.png | [35, 77, 731, 1522] | 16634/16631 | 0 | 0 | None |
| work/demo-slice/lane59/behidat/behidat_sneer.png | [290, 83, 731, 1522] | 16563/16562 | 0 | 0 | None |
| work/demo-slice/lane59/behidat/behidat_dumbfounded.png | [290, 83, 731, 1522] | 16563/16562 | 0 | 0 | None |
| work/demo-slice/lane59/behidat/behidat_menacing.png | [290, 83, 731, 1522] | 16563/16562 | 0 | 0 | None |
| work/demo-slice/lane59/behidat/behidat_intrigued.png | [290, 83, 731, 1522] | 16563/16562 | 0 | 0 | None |
| assets/ep01/gen/asina/asina_neutral.png | [430, 1353, 557, 1362] | 103/103 | 0 | 0 | True |
| assets/ep01/gen/asina/asina_smile.png | [431, 1353, 558, 1362] | 104/104 | 0 | 0 | False |
| assets/ep01/gen/asina/asina_surprised.png | [431, 1353, 556, 1362] | 107/107 | 0 | 0 | False |
| assets/ep01/gen/asina/asina_wary.png | [431, 1353, 558, 1362] | 105/105 | 0 | 0 | False |
| assets/ep01/gen/asina/asina_flustered.png | [430, 1353, 557, 1362] | 103/103 | 0 | 0 | True |
| assets/ep01/gen/asina/asina_scared.png | [430, 1353, 557, 1362] | 103/103 | 0 | 0 | True |
| assets/ep01/gen/asina/asina_indignant.png | [430, 1353, 557, 1362] | 103/103 | 0 | 0 | True |
| assets/ep01/gen/asina/asina_smug.png | [430, 1353, 557, 1362] | 103/103 | 0 | 0 | True |
| assets/ep01/gen/asina/asina_tired.png | [430, 1353, 557, 1362] | 103/103 | 0 | 0 | True |
| assets/ep01/gen/hood/asina_hood_neutral.png | [430, 1353, 557, 1362] | 104/104 | 0 | 0 | True |
| assets/ep01/gen/hood/asina_hood_smile.png | [431, 1353, 558, 1362] | 105/105 | 0 | 0 | False |
| assets/ep01/gen/hood/asina_hood_surprised.png | [431, 1353, 558, 1362] | 110/110 | 0 | 0 | False |
| assets/ep01/gen/hood/asina_hood_wary.png | [431, 1353, 558, 1362] | 108/108 | 0 | 0 | False |
| assets/ep01/gen/hood/asina_hood_flustered.png | [430, 1353, 557, 1362] | 104/104 | 0 | 0 | True |
| assets/ep01/gen/hood/asina_hood_scared.png | [430, 1353, 557, 1362] | 104/104 | 0 | 0 | True |
| assets/ep01/gen/hood/asina_hood_indignant.png | [430, 1353, 557, 1362] | 104/104 | 0 | 0 | True |
| assets/ep01/gen/hood/asina_hood_smug.png | [430, 1353, 557, 1362] | 104/104 | 0 | 0 | True |
| assets/ep01/gen/hood/asina_hood_tired.png | [430, 1353, 557, 1362] | 104/104 | 0 | 0 | True |

## 남은 확인

- 밝은 하늘·모래·어두운 배경의 3배 비교표는 clean_behidat.jpg, 장화 18종 전후는 clean_boots.jpg에 있다.
- 베히다트 알파를 보존했으므로 원래 알파의 작은 돌기와 투명도 자체는 남는다. 색 번짐은 내부 RGB로 바꿨다. 불투명 내부의 본래 올리브·금색은 보존했다.
- 장화·그 밖의 부위에 있던 별도 색 테두리는 이번 장화 잔선 마스크 밖이므로 보존했다.
