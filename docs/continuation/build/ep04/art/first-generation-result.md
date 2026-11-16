# 4화 첫 native 후보 실제 완료

2026-11-09. c001 native 자식 `1443` / PGID `1443`이 종료 코드 **0**으로 끝났고 실제 PNG가 저장됐다. 미술 PASS나 게임 연결 승인이 아니다.

| 항목 | 실제 증거 |
|---|---|
| 후보 PNG | `/Users/choeminju/월흔_trpg/assets/ep04/gen/ep04_c001.png` |
| 크기 | **1672×941**, 2,373,449바이트 |
| 후보 SHA-256 | `94f72e439d4be306fcc49aa1bc0eea431bc9399e8ddec86dc5370a213cf3f9e1` |
| 실제 `-i` 입력 | `/Users/choeminju/월흔_trpg/assets/ep04/gen/source/ep04_c001.png` · 2000×3346 |
| 입력 SHA-256 | `a76dd2d1b88248e7ae117560c37676450cc3f0abe89c123290c7beda86ee5aa8` |
| 입력 원작 | `work/ep04/merged/ep04_001.png`의 `[0,654,2000,4000)` |
| native 로그 | `/Users/choeminju/월흔_trpg/docs/continuation/build/ep04/art/generation/ep04_c001-native.log` |
| 시작/종료 영수증 | `generation/ep04_c001-start.json`, `generation/ep04_c001-result.json` |
| 원본·후보 비교판 | `/Users/choeminju/월흔_trpg/docs/continuation/build/ep04/art/comparisons/ep04_c001.png` |
| 종료 시각 | `2026-11-09T05:04:15.407121+00:00` |
| 실제 원격 도구 | native Codex의 내장 `image_gen` 1회 |

원격 생성 원본은 `/Users/choeminju/.codex/generated_images/01a1beb0-2c85-7c03-b32a-bc186411c2c7/exec-c42eb5e8-03a0-4345-9bd3-340fc2709227.png`다. native 로그에서 이 실제 파일을 덮어쓰기 없는 복사로 후보 경로에 저장한 것을 확인했다.

## 해상도 차이

요청은 1920×1080의 정확한 16:9였으나 원격 결과는 **1672×941**이다. 약 16:9지만 요청한 픽셀 해상도와 같지 않다. 실제 native PNG를 그대로 보존했으며 조용히 늘이거나 찌그러뜨리거나 재생성하지 않았다. 이 차이는 최종 후보 명세에도 그대로 기록한다.

## 확인한 범위

실제 입력과 실제 후보를 직접 열었다. 인물 없는 기울어진 밤 회랑, 아치·천장 문양·꽃무늬 기둥·별과 구름·식물을 같은 장면의 가로 배경으로 확장한 후보가 보인다. 국소 왜곡·추가 구조·세부 고증은 독립 원작 대조 전이며 자가 PASS를 선언하지 않는다. 비교판은 원작 창과 후보를 각각 비율 유지 축소해 나란히 놓았고, PNG·native 로그·비교판 경로를 `ls -l`로 확인했다.

Claude 계정은 요청 전 거절 상태이므로 호출·재시도하지 않았다. 상태는 **실제 생성 완료·독립 Claude 미술 검수 대기**다. YAML·엔진·원작·다른 자산을 수정하지 않았다.

다음 호출은 실제 전역 native 활성 수가 3 미만일 때만 시작한다. 정상 02·03·머리 작업은 보존하며, 부모가 알려 준 `2808`·`3281`·`4016` 작업 때문에 c001을 중복 호출하거나 이들을 취소하지 않는다.
