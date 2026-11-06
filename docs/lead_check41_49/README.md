# 중단(50차 뒤 다시)

2026-11-06. 리드 지시로 50차(베히다트 입식 미간) 완료 뒤 묶음 확인을 다시 진행한다.

| 항목 | 중단 시점 |
| --- | --- |
| 촬영 | 아직 없음. 브라우저 실행·게임 시작 전 중단. |
| 앱·LLM | 18191 앱과 18192 Gemma 4 26B-A4B 준비 완료 후 종료. 실제 GM 질문·플레이는 미검증. |
| 검사 | 테스트·타입 검사 미실행. |
| 수정 | 코드·콘텐츠·그림 수정과 커밋 없음. |
| 종료 확인 | `lsof -nP -iTCP:18191-18193 -sTCP:LISTEN` 출력 없음. |

실제로 사용한 실행 스크립트는 `app/run.sh`다. 새 묶음 촬영 스크립트는 작성 전이었다. 참고한 기존 재현 스크립트 `work/demo-slice/lane46/capture46.mjs`, `work/demo-slice/lane47/evidence.ts`는 그대로 남겨 두었다. 47차 스크립트는 비교 저장을 만드는 별도 실험이므로 전체 UI 플레이를 대신하지 않는다.

재개할 때 사용할 격리 실행 명령:

```sh
mkdir -p /tmp/lane4149/{saves,atlas,logs,feedback}
WOLHEUN_SAVES=/tmp/lane4149/saves \
WOLHEUN_ATLAS=/tmp/lane4149/atlas/atlas.json \
WOLHEUN_LOGS=/tmp/lane4149/logs \
WOLHEUN_FEEDBACK=/tmp/lane4149/feedback/feedback.jsonl \
heavy -- ./app/run.sh --port 18191 --llm-port 18192 --no-open
```

로그는 `/tmp/lane4149/logs/app-server-18191.log`, `/tmp/lane4149/logs/llama-server-18192.log`에 남아 있다. 사용자 포트 18080·18081과 사용자 저장·로그·피드백에는 접근하지 않았다. 문서 생성 도구 `readme-ai`·`readmeai`가 설치되어 있지 않아 이 중단 기록은 수동으로 작성했다.
