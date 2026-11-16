# 대실패 핵심 통합

2026-11-09. `docs/continuation/fumble-contract.md`와 리드의 포화·고보정 행운 확정 계약을 적용했다. 실제 모델·PC UI 검수 완료 보고가 아니다.

## 구현

- `Tier`에 fumble, `Tiered`에 선택형 fumble, 표시 이름 대실패를 추가했다. 필수 hit/mixed/miss와 대성공의 기존 +1 계산을 유지한다. 자연 6·6은 crit, 자연 1·1은 fumble이며 나머지는 기존 합계 판정이다. RNG 두 주사위 소비는 바꾸지 않았다.
- 명시 fumble이 없으면 miss의 내용·경로·비용을 사용한다. 기존 위험 실패 피해와 부상 중복 제거를 먼저 계산하고, 그 효과·선택 비용을 동일 순서로 투영한 뒤 추가 한 칸을 고른다. 선언된 불리한 수치 중 가용한 하나, 없으면 정신력, 다음 체력을 사용한다. 잠긴 수치·바닥·상한은 제외한다.
- 모든 후보가 포화되고 정신력·체력도 0이면 추가 효과를 만들지 않는다. 0 체력을 다시 깎아 포획을 위조하지 않는다. 기존 실패의 종료·전이만 유지한다.
- 명시 fumble은 자체 결과를 사용하며 기본 추가 한 칸과 위험 실패의 기본 증폭을 중복하지 않는다. 비용은 한 번 선택·적용한다. 추가 수치 변화는 `NarrateContext.fumble: TrackChange`와 실제 tracks/change 기록에 같은 값으로 전달한다.
- fumble에서 목표 성공 효과·성공 경로 덮어쓰기·성취 기억·preempt를 적용하지 않는다. GM fallback·등급 검수·현재 성취 투영도 실패로 처리한다. 실제 GM 모델 품질은 검증하지 않았다.
- 새 자연 대실패의 긴장 변화와 approach.before는 행운 결정 뒤에 적용한다. 대기 중 수치와 플래그 전체가 원상태다. 사용하면 mixed만, 거절하면 fumble만 적용한다. 정상 miss의 기존 행운 동작은 바꾸지 않았다.
- 구제 필요량은 `max(1, 7-originalTotal)`, 구제 합계는 `max(7, originalTotal)`이다. 최종 check에는 `rescuedFrom: 'fumble'`을 보존한다. UI 담당은 이 필드로 높은 합계의 일반 성공과 자연 대실패 구제를 구분한다.
- 파서는 선택형 fumble의 줄·효과·경로·대가 참조를 검사한다. 기존 GoalSpec/mixed 비용 검사를 유지하고 fumble의 성공 목표 플래그 적용을 거절한다. enum이 늘어 타입 오류가 난 GM 검수 표와 `eval/run_eval.ts`의 고정 주사위 표도 추가했다. eval 실행이나 모델 호출은 하지 않았다.
- ep01의 luck/check/target/outcome/play 규칙 안내를 갱신했다. 기존 “아슬아슬한 성공” 문구를 보존했다. 옛 문장 끝 낱말에 고정된 시험은 실제 질문 응답 전체가 작성된 안내와 같은지 검사하도록 이행했다.
- save.ts와 continuation.ts는 기존 직렬화·계승이 등급을 손실 없이 보존하므로 수정하지 않았다. 실제 저장 API·비공개 표시 투영·종료 저장의 다음 화 계승으로 검증했다. 과거 자연 1·1 miss 기록은 소급 변경하지 않는다.

## 검증 기록

공통 로그 경로: `work/demo-slice/lane64/`. 전체 suite를 실행하지 않았으며 분차 기록을 하나의 전체 실행 수로 합산하지 않는다.

- 수정 전 `fumble-dice-before.log`: 자연 1·1 계약과 다섯 등급 표적 2fail. 수정 후 `fumble-core-after1.log`의 주사위 두 시험은 2pass이며 36조합×큰 음/0/양 보정과 RNG 소비를 검사했다. 이 실행의 별도 엔진 5fail은 잘못된 fixture tag/빈 작성 대사 때문이었다. 이를 엔진 동작 결함의 수정 전 증거로 세지 않는다.
- 유효 fixture의 최초 엔진 `fumble-engine-after3.log`: 5pass/50expect. 고정·즉흥 실패 비용, 행운 사용/거절의 저장·질문·재개, 명시 결과를 검사했다.
- `fumble-boundaries.log`: 추가 경계 12pass/1fail. 정신력 0에서 성공 목표의 mixed 비용 사전 검증이 판정을 거절한 반례였다. 사전 검증을 완화하지 않고 기존 고정 접근법의 포화 실패 fixture로 바꾸고 실제 fumble check 발생도 단언했다.
- `fumble-boundaries-final.log`: 포화·잠금·정신력 다음 체력·명시 결과·선택지·종료 상태 8pass/37expect.
- `fumble-preservation.log`: 기존 대성공·성공·mixed·정상 행운·저장·ep01 파싱·규칙 질문 14pass/46expect.
- `fumble-view-final.log`: 고정·즉흥, 포화, 기존 실패 종료와 표시 투영·비공개 저장·재개 5pass/38expect.
- `fumble-chapter-after.log`: 실제 connectContinuation/readSave/resumeCampaign으로 옛 종료 저장의 다음 화 계승 1pass. 판정·비용·tracks 기록과 RNG가 다시 적용되지 않았다. 실제 제작 화 전체 스토리 QA라는 뜻은 아니다.
- 최종 결정 전 효과 검사 `fumble-decision-final.log`: 7pass/0fail. 타입 원문 `fumble-tsc-final.log`는 진단 없음, tsc exit 0이다. 대실패 전용 21개 사례는 위 분차 실행에서 각각 통과 기록이 있으며 21개를 한 번에 실행한 결과로 표현하지 않는다.

## 인계와 잔여

리드는 web/introduction과 실제 PC 결과 화면을 소유한다. main.ts의 frame 작업은 branch-map 소유이며 이번 작업에서 수정하지 않았다. b08의 기존 5pass와 원시 판은 이 대실패 증거에 합산하지 않는다. 질문 품질 FAIL·UI 재저장 400은 별도 결함이며 이 작업으로 해결됐다고 주장하지 않는다.

모델 호출·18196 사용·18231 재시작·사용자 18080/18081 조작·커밋·푸시는 하지 않았다.

이번 요청의 `crq add`는 exit 1로 등록되지 않았다. 기준 `8ed0dbf9`부터 변경 파일 994개가 150개 한도를 넘었다. 공유 변경을 나누어 커밋하거나 무관한 파일을 숨겨 우회하지 않았다. 검토 미등록 상태로 인계한다.

## 구제 확인 표시 후속

answerLuck은 새 roll 사건을 보내지 않으므로 주사위 카드만으로는 이번 구제가 즉시 보이지 않는다. 리드 요청대로 자연 fumble을 행운으로 구제할 때만 기존 change 사건과 change log에 `대실패 → 아슬아슬한 성공`, 사용한 행운과 최종 합계를 함께 남긴다. 정상 miss와 구제 거절에는 이 표시를 넣지 않는다. 새 roll·재굴림·애니메이션 사건은 만들지 않았다.

표시 누락은 `fumble-rescue-display-before.log`의 1pass/2fail로 재현했다. 수정 뒤 `fumble-rescue-display-after.log`는 3pass/0fail, `fumble-rescue-display-tsc.log`는 진단 없음, tsc exit 0이다. 행운 사용/거절, 원합계 22의 최소 행운 1점·합계 22 보존과 새 roll 없음·RNG 단일 적용을 확인했다. 실제 PC 화면은 리드 소유이며 이 핵심 회귀를 화면 검수 완료로 세지 않는다.
