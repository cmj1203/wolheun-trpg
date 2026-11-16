# 8화 첫 네이티브 생성 시작

실제 프로세스 시작 후 기록했다. 생성 완료·독립 검수 통과 기록이 아니다.

- 후보: `ep08_c001_p01`
- PID: `21825`
- PGID: `21825`
- 시작 시각(UTC): `2026-11-09T05:16:23.714Z`
- 로그: `/Users/choeminju/월흔_trpg/docs/continuation/build/ep08/art/native/ep08_c001_p01.log`
- 원작 입력: `/Users/choeminju/월흔_trpg/assets/ep08/gen/inputs/ep08_c001_p01.png`
- 입력 SHA-256: `94899ab881e75462549eeb8d565db7c15ffc2f8250bb75de23c47a79b3cc3378`
- 요청 출력: `/Users/choeminju/월흔_trpg/assets/ep08/gen/ep08_c001_p01.png`
- 최초 시작 JSON의 집계는 macOS ps comm 필드가 경로를 15자로 줄여 미확정이다. argv 첫 실행 파일 기준으로 즉시 바로잡아 확인한 실제 네이티브는 2개(PID 21825·22283)이며 전역 최대 3개 이내다. 이후 모든 호출 전에는 argv 기준으로 집계한다.
- 이 레인 호출은 1개다. Codex 내장 image_gen 1회만 요청했고 기존 정상 프로세스를 취소하지 않았다.
- 독립 Claude QA: 대기.

