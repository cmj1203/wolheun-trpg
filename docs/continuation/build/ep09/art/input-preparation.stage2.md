# 9화 2단계 원본 입력 준비

승인된 후보 77개 모두 실제 원본 입력 PNG를 만들었다. 완성 그림 생성은 0건이며 원본 입력을 그림 READY 또는 QA PASS로 세지 않는다.

입력은 assets/ep09/gen/inputs/ 아래 승인된 파일명 77개다. 총 430367645바이트이며, SHA-256도 77개 모두 서로 다르다. 후보별 실제 경로·입력 해시·원본 경로와 해시·절대/국소 크롭 좌표·컷 출처·줄/침묵 앵커·시점·분기·복장·공개 조건은 input-manifest.stage2.json에 있다.

각 후보의 승인 input_sources[0]만 실제 입력으로 크롭했다. 밤 전환의 c069–c072 등 나머지 출처는 연속성 근거로 보존했으며 뒤 패널을 자동으로 추가하지 않았다. 색 변환·축소·확대·텍스트 제거·얼굴/복장 수정은 하지 않았다. 원본 풍선과 효과 글자도 그대로이며, 이 세로 입력은 완성 CG가 아니다.

포함한 별도 입력:
- c021: 작은 나시르 반응 삽화 — assets/ep09/gen/inputs/ep09_c021_source.png
- c024 손의 무언 근접 — assets/ep09/gen/inputs/ep09_c024_b_source.png
- c068 이후 밤하늘 무언 전환 — assets/ep09/gen/inputs/ep09_c068_night_source.png

원본 18장 해시를 승인 기준과 대조했다. 실제 PNG 77개는 승인 절대 크롭과 크기·색 모드·디코딩 픽셀이 모두 일치했고, 입력 명세 해시도 77/77 일치했다. 제작과 검증 명령은 각각 종료 코드 0이었다. 기존 art 문서 5개와 원본 검증 그림 1개는 해시가 그대로다. gen/에는 기존 1개와 새 입력 77개만 있다.

후보 77개·84컷 매핑·132줄·원본 창·시점·의상·소품·분기·공개 시점은 바꾸지 않았다. 대족장의 실명을 잘릴로 추론하지 않는다. 그림에 인물·몸·사건을 추가하지 않았다. YAML과 승인 mapping/manifest는 수정하지 않고 새 단계 문서만 추가했다. 기존 candidate-manifest.json의 planned_native_input.exists=false는 당시 매핑 단계 기록이다. 실제 준비 상태는 새 input-manifest.stage2.json과 input-verification.stage2.json을 기준으로 본다.

네이티브 생성·Claude 검수 요청·GPT 그림 PASS 판정·서비스·브라우저·커밋·푸시·crq는 수행하지 않았다. 별도 공유 슬롯 GO 전에는 네이티브 호출을 시작하지 않는다. 전역 한도 3개에는 루트 머리 수정과 ep02 작업도 포함되며 부모가 슬롯을 관리한다.

증거:
- docs/continuation/build/ep09/art/input-manifest.stage2.json
- docs/continuation/build/ep09/art/input-verification.stage2.json
- docs/continuation/build/ep09/art/input-preparation.stage2.md
