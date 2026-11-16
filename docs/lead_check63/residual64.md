# 잔여 시험의 현재 개별 기록

2026-11-09. 전체 suite는 실행하지 않았다. 아래는 기존 실패였던 GM8·prices4·engine9의 21개를 대상으로 한 분차 검증이다. 통과한 항목은 같은 소스에서 반복 실행하지 않았다. 전체 프로젝트의 현재 실패 수가 아니며 옛 938pass64fail·778pass25fail과 합산하지 않는다.

## 확인 결과

| 범위 | 최신 개별 기록 | 근거 |
|---|---|---|
| 기존 GM8 | 8개 모두 교정 후 통과 | `residual-gm-prices64-after1.log`의 6개, `residual-gm64-contract-after.log`의 관찰 1개, `residual-map64-after.log`의 지도 1개 |
| 기존 prices4 | 3개 통과, 개수 상한 1개 실패 유지 | `residual-gm-prices64-after1.log` |
| 기존 engine9 | 메타 2개와 지도 갈림길 1개 통과, 6개 실패 유지 | `residual-engine64-meta-after.log`, `residual-engine64-after2.log` |
| 타입 | `tsc --noEmit` exit 0 | 마지막 공유 입력·frame 수정 및 시험 이행 검사 |

로그 경로의 공통 앞부분은 `work/demo-slice/lane64/`다. 21개 중 개별 통과 기록은 14개, 현재 미해결은 7개다. 하나의 전체 실행 결과로 표현하지 않는다.

GM fixture에는 scope/target/deed/label을 실제 목표 계약에 맞게 채웠다. 큰 신체 행동·위험·아이템 단언은 유지했다. 낱말이 겹쳐도 NO_CHANGE인 몸짓을 beauty로 강제하던 단언은 현재 관찰 계약으로 이행했다. 지도 혼합은 명시 괄호 입력의 몸짓·발화를 모두 모델 요청에 보존하고, bag 접근·magic_bag 소지품을 확인한다. 키워드 fastpath는 추가하지 않았다.

가격표 삭제 시험은 이제 참조 중인 mixed·goals 대가를 모두 parser에서 거절하는 강한 경계다. 성공 플래그 충돌은 실제 goals의 성취 효과 충돌 오류를 검사한다. 연속 대가 시험은 명시한 네 후보 목록 안에서 미사용 우선·소진 후 재사용·hard 우선 조건을 그대로 검사한다.

엔진은 모델이 판별한 talk.to=self를 person으로 덮어쓰지 않으며 GM shown 입력은 세계 대화가 아닌 질문 모드 안내로 보낸다. 지도 갈림길 기대에는 승인된 b08_gaze를 추가했으며 기존 b09_verdict·나쁜 결말 도달/숨김 단언을 유지했다.

## 미해결 7개

1. `prices.test.ts`: 표의 후보를 4~6개로 제한하는 상한. 현재 r4_prove는 7개다. 초기 커밋 `0d66f8d`에는 guard_scoff/man_wait/sand_edge/half_heard/map_shown/guard_grab의 6개였고, 현재는 기존 6개를 유지한 채 승인된 목표 비용 mind_strain이 추가됐다. `git log -S`상 이 비용은 해당 초기 커밋의 원본 YAML에 없었다. 파서에는 표 개수 상한이 없다. 숫자를 7로 바꾸거나 후보를 삭제하지 않았다. 작성 개수 상한과 새 목표 비용 계약의 관계를 리드가 확정할 수 있도록 근거를 전달한다.
2. `engine.test.ts`: 끼어든 질문의 자리·비긍정 주장 기억 보존.
3. `engine.test.ts`: 길 물음 뒤 남은 줄에서 해당 줄만 제거.
4. `engine.test.ts`: 일반 대화 3회 뒤 nudge.
5. `engine.test.ts`: nudge 1회와 비공개 귀찌 보존.
6. `engine.test.ts`: spoken unmask 위협의 무판정·무경고·무비용.
7. `engine.test.ts`: 구형 암묵 질문/행동 분해와 질문 안내 1회.

2~5는 b02의 person 발화를 `free.addressed: run`으로 바꾸는 현재 작성 계약과 기존 정지 기대가 충돌한다. 자기말을 보존한 교정과 별개다. 6은 바깥 말을 실제 귀찌 제거 시도로 다뤘던 옛 기대와 명시 행동 문법의 충돌이다. 7은 엔진이 전체 명시 입력을 보존하는 새 경계와 액션 부분만 넘기던 옛 기대의 충돌이다. 질문을 행동으로 둔갑시키거나 목표·비용 단언을 삭제해 초록으로 만들지 않았다.

이 입력 의미 문제는 별도 실제 b08 사회적 시도 진단과 함께 다뤄야 한다. `natural_run64_diagnosis.md`에 원시 근거와 승인 뒤 classifier/YAML 소스 교정·집중 검증을 남겼다. 해당 교정을 이 7개 기존 실패의 해결이나 실모델 통과로 계산하지 않는다.

## 우선 처리한 frame 결함

non-ask 요청이 메타·rewrite만 반환해도 `begin()`이 현재/남은 frame을 지우던 결함을 고쳤다. 첫 실제 fresh 세계 관측 때만 frame 세대와 Atlas 토큰을 교체한다. 신규 HTTP는 수정 전1pass4fail → 수정 후5pass70expect, 관련 모듈5pass42expect, 타입 exit 0이다. 실제 UI 검수는 branch-map 소유이며 root와 해당 세션에 직접 인계했다.

18196 호출은 없다. 최신 grounding 출처 직접 지지 소스는 여전히 실모델 미검증이다. mentionedItem의 이미 고쳐진 회귀와 기존 통과 묶음·전체 suite는 재실행하지 않았다.

추가 서버 경계는 오류와 그만두기 확인 대기·취소의 상태 변경을 실제 HTTP로 검증했다. 새 세계 관측 없는 두 경로에서도 현재 질문·남은 ACK·Atlas 토큰·busy 해제를 확인했다. 2pass/25expect, tsc exit 0, `meta-frame-gap-extra.log`.
