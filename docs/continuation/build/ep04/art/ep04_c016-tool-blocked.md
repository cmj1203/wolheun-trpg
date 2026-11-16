# c016 실제 도구 거절

native PID/PGID `43588/43588`이 내장 image_gen을 한 번 호출했으나 출력이 거절됐다. CLI 종료 코드는 0이지만 실제 PNG는 없다.

- HTTP: `400 Bad Request`
- 코드: `moderation_blocked`
- 단계: `output`
- 분류: `sexual`
- 요청 ID: `5a0e826e-fa0f-45ba-99dc-a33a5b3d0176`
- 로그: `generation/ep04_c016-native.log`
- 영수증: `generation/ep04_c016-result.json`

재시도·프롬프트 변형·다른 계정·SDK/API·로컬 생성·다른 출력 경로로 이 요청을 우회하지 않는다. `assets/ep04/gen/ep04_c016.png`를 만들지 않았고 후보로 집계하지 않았다.

생산 명세에서 이 슬롯은 `tool_blocked`, `retry_allowed: false`로 남긴다. 같은 승인 목록의 독립된 다른 컷은 이어서 처리한다. 독립 승인과 게임 설치는 0이다.
