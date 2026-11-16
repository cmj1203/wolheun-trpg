# 2화 자산 연결

2026-11-09. READY 전 단계다.

- `assets/ep02/gen/mapping.json`의 0기준 인덱스와 현재 대본의 화자·본문 앵커 118개를 대조했다. 불일치 0개였다.
- 원래 인덱스로 발화 CG를 지정한 뒤 무대사 8줄을 삽입했다. 123줄에서 131줄로 바뀌었다.
- CG 정의 66개를 제작본 88개로 교체했다. 자유 입력 배경 `ep02_question_stage`도 제작된 재회 그림으로 연결했다.
- 목표·효과·공개 플래그·기존 발화 원문은 연결 전후 객체 대조에서 같았다. 원작 긴 캔버스 직접 참조와 누락 자산은 각각 0개다.
- 실제 `loadScenario` 및 전체 캠페인·lore 로드가 통과했다.
- 보석 원작·보정 전·보정 후 확대를 직접 대조했다. 보정본은 청색 비중을 줄인 자수정 보라이며 기존 금테 형태를 유지한다. 비교 그림은 `assets/ep02/gen/gem_source_before_after.png`다.

검사 기록:

| 범위 | 결과 | 증거 |
|---|---|---|
| 전체 저장소 시험 | 938 통과, 64 실패, 오류 1건 | `work/continuation/ep02/run/full-tests-after-assets.log` |
| 위 실행의 후속 전용 5개 파일 | 64 통과, 실패 0 | 같은 로그 |
| 자산 연결 후 타입 검사 | exit 0 | `work/continuation/ep02/run/typecheck-after-assets.log` |

전체 오류 1건은 별도 화의 `ep05_boundary.ending.next_hook` 빈 문자열이다. 실패는 공유 GM·입력·분기 등의 시험에서 발생했다. 전체 통과로 보고하지 않는다.

공유 QA 모델은 원본 `gemma-4-26B-A4B-it-UD-IQ4_XS.gguf`, `127.0.0.1:18196`, PID 91281, PGID 91276이다. `heavy`로 기동했고 컨텍스트 8192·병렬 슬롯 1·GPU 층 99·reasoning off·offline 설정을 사용한다. `/health`와 `/v1/models` HTTP 200 및 모델 ID를 확인했다. 상태는 `work/continuation/ep02/run/model-18196-status.json`, 로그는 같은 폴더의 `llama-server-18196.log`와 `model-18196-session.log`다. 사용자 서버 PID 28435·28449·28472는 유지했다.

앱은 분리 포트 18221을 사용한다. 저장·지도 파일·로그·피드백 경로는 전부 `work/continuation/ep02/run/` 안이다. 실제 화면 검수와 실제 GM 전 경로·대사 검수는 진행 중이다.

독립 감사에서 무행동의 `free.rolls` 소비와 비공개 궁정 대사의 `recent`·`spoken` 유입을 재현했다. 공유 엔진 담당의 수정 계약을 리드에게 요청했다. 감옥·국가·위치·호칭 플래그의 조기 개방은 재현되지 않았다. 이 두 결함의 수정과 실제 화면·모델 검증을 마치기 전에는 완성으로 보고하지 않는다.
