# 선택 대화·CG 통합 및 공개 지식 검증

2026-11-09. 리드 승인 대상은 `docs/continuation/build/shared-dialogue.patch`와 대응 계약이다. 기존 목표/inline 비용/presence/문법 변경은 보존한다.

## 단계

1. 부모가 types.ts의 ConversationSpec, BeatSpec.conversation, CastSpec.presentation을 선행 적용했다. tsc --noEmit 통과 후 TYPE_READY를 전달했다.
2. continuation의 명시 PARSER_READY를 받은 뒤 승인 engine/rules/prompt hunk를 현재 소스에 최소 적용했다. scenario.ts는 부모가 수정하지 않았다. gm.test.ts는 계약대로 contexts의 타입 표기만 satisfies GmContext로 바꿨다.
3. 현재 공유 소스의 conversation64.test.ts는 적용 전 7통과/7실패에서 적용 후 14통과/0실패/68expect가 됐다. tsc --noEmit은 exit0, 실제 loadCampaignScenario+withNotes는124비트/164CG/3장으로 exit0. ENGINE_READY를 리드에게 전달했다. 제작 담당 YAML과 실제 모델 순서는 리드가 조율한다.

선택 대화는 현재 비트/현재 응답자 문맥만 사용한다. 선택지를 누른 원문 경로를 보존하고, 직접 입력일 때만 conversation.next로 진행한다. state.free/lastFree/주사위/가격/worldMove를 만들지 않는다. fallback/빈 응답/무대 밖 화자는 진행 실패로 남긴다. CG 전용 표시는 허용 faces와 실제 CG 선언 검사를 유지한다.

## 승인 패치 검증 준비

격리 proof를 읽고 실제 공유 대본을 fixture로 쓰는 conversation64.test.ts 14개를 작성했다. 실제 시작점은 ep03_c046으로 명시했다. 파서 담당이 이미 소유한 선언 검사와 중복되는 시험은 복사하지 않았다. 제출 담당의 격리본22개와 부모의 공유 소스14개는 서로 다른 실행 결과다.

- 원문 선택지 경로·효과·대사가 보존되고, 직접 입력만 별도 후속으로 간다.
- 현재 scene 불일치/pending 대사/행운 보류 중 대화를 소비하지 않는다.
- 말·세계 질문·감정 반응·즉시 몸짓이 현재 응답자에게 전달되며 판정/비용은 발생하지 않는다.
- 지속 목표/위험/게임 조작 질문/미공개 이름을 해당 경계에서 처리한다.
- 생성 fallback, 빈 응답, 무대 밖 화자로는 다음 비트로 가지 않는다.
- CG 배우의 허용 face/누락 CG/없는 CG/파일 선언 없는 CG를 거절한다. 일반 입식 배우 검사는 보존한다.
- 현재 목표비용 29개 회귀와 문법·presence 회귀를 별도로 실행하고 결과를 구분한다.

## idle·기억·공개 시점 별도 회귀 준비

아래는 자문 계약 이후 구현할 회귀 시나리오다. 아직 추가 시험을 실행하거나 통과한 것이 아니다.

| 경계 | 입력·상태 | 확인할 행동 |
|---|---|---|
| 비위협 감정 반응 | 실제 자유 입력 자리의 `(눈물이 흐른다)`·idle 해석 | 판정 이벤트와 check 로그 없이 장면 자동 진행 유지 |
| 위협 자리의 멈춤 | `(가만히 기다린다)` | 기존 위협·진행 소비 유지, 실제 판정 횟수와 구분 |
| 실제 시도 | 같은 자리에서 고정 접근 선택 | 실제 roll/check가 한 번만 기록되고 진행량과 혼동하지 않음 |
| 혼합 입력 | 말과 괄호 감정 반응, 또는 잘못 해석된 idle | 기존 storyReading의 말/행동 경계와 자동 진행 보존 |
| 관객 궁정 대화 | 아시나 부재 장면의 say 후 다음 일반 free/ask | 관객 전용 recent/spoken이 아시나·응답자의 사적 기억으로 주입되지 않음 |
| 공개 직전 ask | 엔진 flags는 앞서고 실제 표시 줄은 아직 미공개 | 자문이 확정한 현재 표시 시점 계약으로만 답변 |
| 정상 기억 | 현재 판에서 아시나가 실제 듣고 말한 대화 | 필요한 정상 기억을 유지하고 전체 기억 삭제로 누출을 덮지 않음 |
| 저장·재개 | 공개 전 대사 큐 중간 저장/재개 | 권위 state/RNG/비용을 되감거나 재적용하지 않으면서 같은 공개 경계를 유지 |

부모가 읽은 현재 원인: leaveOutcome은 idle 경로에서도 progress.rolls를 증가시킨다. say는 출력 줄을 recent/spoken에 쌓는다. 현재 대화 패치의 ctx.recent=[]는 그 선택 대화에만 한정되며 기존 ask/free 전체 누출을 해결하지 않는다. 실제 판정 횟수의 저장 필드·진행 소비 모델·공개 시점/기억 범위는 root Claude 자문 계약을 기다린다. 단어 금지, 기억 전체 삭제, 권위 state 되감기는 적용하지 않았다.

## 병행 작업

- 최신 atlas.ts 수정의 감옥→잠긴2화→자물쇠 실제 큐 재확인은 st_01a1be3f의 세 상태 PASS. 부모가 보고·캡처 실존과 현재 atlas.ts SHA256 일치를 확인했다. `map_latest_qa.md`에 기록했으며 기존 서버11개 시험을 재실행한 결과가 아니다. 이 UI 검증은 conversation 적용 전 시작한 지도 전용 검증이다.
- 아시나 대표 r1은 귀찌 반려로 미설치이고 root의 artistry가 r2를 진행 중이라는 리드 전달을 받았다. 이전 머리카락 worker를 재시작하지 않는다.
- 새 모델을 띄우지 않는다. 18196 이용도 리드 순서 조율 이후이며18192와 사용자 서버는 접근하지 않는다.

## 공개된 조건 지식의 질문 경계

리드 추가 지시에 따라 gm.ts/lore.ts를 수정했다.

- 같은 ctx.state에서 만든 visibleLore를 규칙 해석·system·user·schema·모델 about 선택 검사에 함께 쓴다.
- 조건이 참인 hidden만 asina로 투영한다. if 없는 영구 hidden은 승격하지 않는다.
- if/after가 닫힌 항목은 본문과 선택 id에서 빠진다. 원본 lore는 변형하지 않는다.
- 모델이 닫힌 항목 id를 직접 반환해도 about=none으로 받고, 직접 explain에 위조한 about도 닫힌 항목을 설명하지 않는다.
- 설명 생성의 대상과 mustMention도 같은 공개 지식에서 선택한다. 미공개 항목을 모르겠다는 기존 안내 문구는 보존했다.

opened_knowledge64.test.ts의 처음22개는 수정 전7통과/15실패였다. 별도 추가한 after 경계2개는 수정 전1통과/1실패였다. 두 실행을 합산 결과로 표기하지 않는다. 수정 뒤 신규24개와 기존 공개 경계15개는 단일 실행39통과/0실패/138expect, tsc exit0이다. 실제 모델 대신 임의 빈 포트의 모의 HTTP LLM으로 요청 본문/선택schema와 위조 응답 검사를 실행했다.

이는 **공개 조건이 참인 질문 시점 state를 사전에 투영하는 경계**의 검증이다. 실제 표시 줄보다 flags가 먼저 선반영되는 문제와 관객 궁정 recent/spoken 유입은 별도 잠금이다. root의 표시 시점 계약을 기다리며 여기서 state를 되감거나 기억을 전부 지우지 않았다. 실제 모델·질문 UI 양쪽 해결 완료가 아니다.

## 기존 실패 분리와 최종 결과

conversation 적용 후 기존5파일181시험은169통과/12실패였다. `work/demo-slice/lane63/conversation-baseline.ts` preload는 승인 engine/rules/prompt hunk만 메모리에서 역적용하며 공유 소스를 쓰지 않는다. 세 파일 override를 확인한 기준 실행도169통과/12실패로 실패 이름12개가 동일했다.

- prices.test.ts 기존4실패: 대가 수/태그 수, 표 없는 mixed·miss 비교, soft 대가의 성공 보존, 연속 대가 선택.
- gm.test.ts 기존8실패: 입력 종류 분기·동작 분류·큰 신체 행동·지도 꺼내기·게임/자기 질문·행동 판정 fixture.

지식 투영 변경 중 미공개 사람의 안내 문구가 달라져 생긴 추가1실패는 코드에서 기존 문구를 보존해 고쳤다. 기존 시험의 기대값을 바꾸지 않았다.

최종 단일 실행은 conversation64/opened_knowledge64/continuation_knowledge63/improv_goal63/prices/gm/faces59d/paren62의 **234개:222통과/12실패/772expect,327ms,test exit1**, 별도 타입 검사 **exit0**다. 새 대화14개·지식24개·기존 공개 경계15개는 모두 통과했고, 남은 실패 이름은 위 기존12개와 같다. 전체 프로젝트 시험을 clean으로 선언하지 않는다.
