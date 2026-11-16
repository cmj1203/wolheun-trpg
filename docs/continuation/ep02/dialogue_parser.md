# 선택 대화 파서 인계

2026-11-09. `PARSER_READY`.

리드가 승인한 `docs/continuation/build/shared-dialogue.patch`의 `scenario.ts` 구간만 현재 파일에 최소 적용했다. 타입 준비 신호 뒤 적용했으며 임시 타입 단언이나 오류 억제를 추가하지 않았다.

- `ConversationSpec` 파싱, 필수 후속 경로와 CG, 응답자 목록을 읽는다.
- 조건과 판정이 없는 기본 선택지를 요구하고 `free`·`ending` 동시 선언을 거절한다.
- 현재 무대의 같은 lore 응답자·속마음·나레이션을 검사한다. GM과 주인공의 새 발화는 거절한다.
- `conversation.next`를 그래프 간선과 참조 검사에 포함한다. 대화의 고정 응답 줄도 대본 검사에 포함한다.
- `presentation: cg`는 입식 없는 speech/thought에만 허용한다. 허용 표정 검사를 먼저 유지하고 명시된 CG 배우의 입식 조회만 생략한다.
- `cgLineProblem`은 CG의 파일 선언과 허용 표정을 검사한다. lead 줄도 정적 대사 검사에 포함한다.
- 기존 `GoalSpec`, `price: []`, 인라인 비용, chapter 검증은 보존했다.

| 검사 | 결과 | 파일 |
|---|---|---|
| 수정 전 새 파서 회귀 | 2 통과·24 실패, exit 1 | `work/continuation/ep02/run/dialogue-parser-red.log` |
| 적용 후 파서 회귀 28개와 기존 후속 회귀 64개 | 92 통과·0 실패, exit 0 | `work/continuation/ep02/run/dialogue-parser-green.log` |
| 전체 타입 검사 | exit 0 | `work/continuation/ep02/run/typecheck-dialogue-parser.log` |
| 실제 캠페인 합성 및 `withNotes(loadLore)` | 124비트·164CG·3개 장, exit 0 | `work/continuation/ep02/run/campaign-parser-with-notes.log` |

전용 시험은 `app/tests/continuation_dialogue_parser.test.ts`다. 선택 대화의 경로·응답자·기본 선택지·자유 입력/결말 충돌과 CG/표정 경계를 검사한다. CG 표시가 없는 일반 배우의 입식 검사도 계속 실패해야 하는 회귀를 포함했다.

이 신호는 파서 인계다. 엔진의 선택 대화 실행은 기존 담당, 3화 conversation·CG 표시·custom 꼬리 YAML은 episodes 담당이 반영한다. 화면 공개 이전의 미래 flags와 관객 전용 궁정 대사의 recent 유입은 별도 미해결 계약이며 이 파서 변경의 검증으로 완료 처리하지 않는다. 실제 18196 모델 검증도 화면 담당의 사용 종료 신호 뒤 순서대로 실행한다.
