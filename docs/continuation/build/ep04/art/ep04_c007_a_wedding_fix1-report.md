# 혼례 fix1 실제 결과

실제 native 호출 PID/PGID `70416/70416`, 종료 코드 0. 원격 원본과 같은 SHA의 `ep04_c007_a_wedding_revision01.png`를 `assets/ep04/gen/ep04_c007_a_wedding_fix1.png`에도 그대로 보존했다. 두 경로는 같은 이미지의 별칭이며 추가 생성이 아니다.

- 실제 크기: 1672×941, 3,053,375바이트. 요청 1920×1080과 다르며 늘이지 않았다.
- SHA-256: `f09eab15e597808be093337c196a649bab34df2e20a70daf347322d8e92e6b35`
- 원작 대조판: `comparisons/ep04_c007_a_wedding_fix1-source-comparison.png`
- 실제 변경 마스크: `comparisons/ep04_c007_a_wedding_fix1-actual-change-mask.png`
- 손 부근 진단 마스크: `comparisons/ep04_c007_a_wedding_fix1-local-diagnostic-mask.png`
- 전체 측정 영수증: `generation/ep04_c007_a_wedding_fix1-evidence.json`

실제 원작 선택 창과 fix1을 나란히 열어 확인했다. 새 손은 보이지 않고 손·줄기 아래가 화면 밖이다. 옷을 추가해 손을 덮는 방식은 쓰지 않았다. 이는 흉상 프레이밍 교정이며 원작의 물리적 옷 가림을 복구했다고 주장하지 않는다.

기존 후보와 같은 1672×941 좌표계에서 변경 픽셀은 1,563,445/1,573,352개이고 변경 경계는 `[0,0,1672,941)`다. 손 부근 진단 영역 `[790,800,1000,915)` 밖에서도 **1,539,295개 픽셀**이 달라졌다. 진단 마스크는 실제 native 호출에 전달한 편집 마스크가 아니다.

따라서 국소 수리 영역 밖 픽셀 보존 요건은 **미충족**이다. 원작에서 확인할 수 없는 옷·덮개를 추정해 국소 합성하지 않았다. 국소 보존 성공이나 독립 미술 PASS로 보고하지 않으며 보류를 유지했다.

원본 후보·원본 native 로그·SHA는 생산 명세의 history에 보존했다. 실제 native PNG 버전은 8개, 그림이 있는 계획 슬롯은 7/65개다. fix1과 revision01은 같은 SHA여서 별도 native 버전으로 중복 집계하지 않는다. 독립 승인과 게임 설치는 각각 0이다.
