# 63차 목표 보존 구현 기록

2026-11-09. 실제 GM·브라우저·전체 통합 QA는 이 레인의 범위가 아니다. 서버·사용자 포트·커밋·CodeRabbit·자산을 변경하지 않았다.

## 파서 연결 계약

`work/demo-slice/lane63/improv-parser.patch`는 scenario.ts 소유자가 적용할 최소 패치다. 이 레인은 scenario.ts를 수정하지 않는다.

- `FreeSpec.goals?: Record<string, GoalSpec>`.
- `GoalSpec`: `text: string`, `next: Next`, `price: string[]`, `effects?: Effects`, `if?: string`.
- `ApproachSpec.goal?: string`. 해당 비트 목표만 참조한다.
- `local`, `none`은 목표 표에 등록하지 않는 예약값이다.
- 성공 시 목표 effects를 한 번 적용하고 next를 비용 전에 확정한다. hit/mixed/crit가 같은 성취를 공유한다.
- 목표가 있는 고정 접근의 성공 outcomes는 목표 플래그나 next를 중복 소유하지 않는다.
- 목표 price는 해당 비트의 soft 비용 ID 목록이다. 빈 목록은 추첨 없음이며 실제 인라인 비용을 한 번 적용한다. 추첨과 인라인 비용의 중복 또는 실효 비용이 없는 새 판정은 굴리기 전에 안내한다.
- 파서 적용 확인 전에는 YAML에 새 필드를 추가하지 않는다.

인물 존재 연결은 승인된 `character-presence.patch`대로 engine.ts와 gm.ts에 적용했다. 문법 검증 로직은 유지한다.

파서 담당의 `docs/continuation/ep02/goal_contract.md`가 최종 파서 계약이다. 최초 패치의 빈 목록 일괄 거부는 잘못된 축소였고 제거했다. 엔진도 빈 목록이면 기법의 mixed 인라인 비용을 검사·보존하며, 별도 추첨과 중복되면 판정 전에 거절하도록 교정했다.

## 적용한 계약

- 현실 즉흥 판정은 `target`과 안전한 `deed`를 해석 경계에서 확정한다. target 누락·미지 ID·빈 deed를 local로 보정하지 않는다. 규칙의 소지품 낱말 점수만으로 고정 행동을 확정하던 빠른 반환도 제거했다.
- `scope=clarify`는 기존 intent 카드를 사용한다. 대기·거절은 pending 외 전체 상태를 그대로 돌려준다. 위험 처리·발화 기억·정체 효과보다 먼저 확인한다. 승인한 stat/difficulty/bold/risk/target/deed를 저장하고 재해석·중복 확인 없이 실행한다.
- 끼어들기 때 남은 대사 번호도 카드에 저장한다. 승인 전에는 지우지 않고 승인할 때만 기존 revise 이벤트로 지운다.
- hit/mixed/crit는 같은 목표 효과를 한 번 적용한다. 그 상태에서 실제 next를 고정한 다음 비용을 내므로 비용이 조건 수치를 바꿔도 성공 경로를 재계산하지 않는다.
- 별도 비용은 명시 허용 목록 안에서만 고른다. 빈 목록은 원래 기법의 인라인 비용을 그대로 한 번 적용한다. 바닥·상한·잠긴 수치·이미 없는 물건으로 실제 비용이 없어지는 경우는 판정 전에 안내한다.
- 목표를 얻으려고 기존 접근법의 item/before/said/mods를 복사하지 않는다. 큰 현장 행동은 local로 완료 기록에 남고 성공한 deed만 이후 GM 기억에 들어간다. 실패한 deed는 완료로 서술하거나 preempt하지 않는다.
- 세계 밖 행동은 자연스러운 인물 반응과 입력 기록만 남긴다. 판정·목표 효과·머뭇 진행·생성 결과의 상태 효과를 발생시키지 않는다. 일반 odd의 기존 진행은 유지한다.
- 문법 담당의 검증·재생성 경로를 유지했다. 인물 존재 검사와 공개 lore 연결도 유지했다.

## 데이터와 소유권

사막의 자유 입력 8개 비트에 목표 31개를 선언했다. 회피·도주·관찰·협상·신분 뒷받침·지도 제시·칼 대응·시선 유지·귀찌 은폐·물·쉼터·방향·쓸모 증명이다. b08/r2/r4/r5의 도주도 현재 위치의 r3_flee로 연결한다. 구속 뒤 도주는 포박·붙잡힘·퇴로 차단 상태를 풀지만 잃은 물건을 만들어 주지 않는다.

고정 접근의 공통 목표 추출은 b02 watch/avoid와 b05 resist에 적용했다. 나머지 고정 접근은 부모가 수정한 결과를 유지하고, 다른 기법으로 같은 성취를 요청할 때 사용할 목표 표를 별도로 선언했다. 고정 접근의 소지품·발화·선행 조건을 즉흥에 복사하는 대신 성취 효과와 경로만 공유하는 최소 변경이다.

부모의 b04 데이터, 모든 기존 examples, atlas 선언은 패치 입력 전후 구조 비교에서 동일했다. watch의 b02_observed 경로와 avoid/resist/flee의 정신력 -1 비용을 유지했다. YAML은 메모리에서 최신 parseScenario/checkScenario를 통과한 다음 한 번에 적용했다. YAML LSP는 설치되어 있지 않아 실행하지 않았고 실제 로더로 검사했다.

`scenario.ts`, ep02 YAML, atlas.ts, web, server/main.ts, lore, 기존 테스트는 수정하지 않았다. 추가 승인된 `app/eval/run_kinds.ts`에서는 clarify를 독립 분류로 기록하고 reason을 detail에 남긴다.

## Fixture 이행

현실 즉흥 FakeGm 응답은 실제 성공 범위에 맞는 `target`과 `deed`를 넣어야 한다.

```ts
{
  kind: 'improv', stat: '손재주', difficulty: 0,
  label: '모래로 도주', absurd: false, bold: false,
  target: 'resist', deed: '모래를 튀겨 시야를 가린 사이 달아났다',
  source: 'llm', meta: META
}
```

목표를 모르면 local을 기본값으로 넣지 않는다. 지속 무장 해제·소유권 변경 등 미구현 상태는 clarify로, 실제 현장 접촉처럼 후속 지속 상태가 필요 없는 완료 사건만 local로 만든다. 실제 LocalGm JSON fixture에는 `target`과 `scope`도 필요하다. 비판정은 둘 다 `none`, 그대로 가능한 목표는 `ready`, 대안 동의가 필요한 경우는 `clarify`다. 큰 행동 카드는 `confirm`으로 승인해야 판정한다.

## 저장 경계

새 pendingIntent/pendingLuck와 check.improv는 기존 저장 직렬화에 보존된다. 목표 필드가 없던 일반 저장은 계속 읽는다. 이미 굴린 옛 즉흥 pendingLuck에는 목표를 지어내지 않는다. 행운 업그레이드는 설명 있는 오류로 거절하고, 행운을 쓰지 않으면 기존 실패를 마무리한다. 목표 없는 옛 의도 카드는 취소하고 새로 입력해야 한다. 실제로 없는 판정 전 저장 복원 버튼은 제공하지 않는다.

## 실행 증거

작업 디렉터리: `/Users/choeminju/월흔_trpg/app`.

| 검사 | 실제 명령 | 결과 |
|---|---|---|
| 초기 새 시험 | `bun test --timeout 30000 ./tests/improv_goal63.test.ts` | 7 pass / 11 fail, exit 1. YAML 목표 등록 전의 연결 실패 |
| 초기 타입 검사 | `bunx tsc --noEmit` | exit 2. run_kinds.ts의 clarify 미처리 1건. 소유권 확대 뒤 수정 |
| 사막 로더 | `bun -e 'import {loadScenario} from "./src/engine/scenario.ts"; const s=await loadScenario("./content/ep01_desert.yaml"); console.log("DESERT_LOADER_OK",Object.keys(s.beats).length);'` | 32비트, exit 0 |
| 캠페인 로더 | `bun -e 'import {loadCampaignScenario} from "./src/engine/continuation.ts"; const s=await loadCampaignScenario("./content/ep01_desert.yaml"); console.log("CAMPAIGN_LOADER_OK",Object.keys(s.beats).length);'` | 63비트, exit 0 |
| YAML 연결 후 새 시험 | `bun test --timeout 30000 ./tests/improv_goal63.test.ts` | 22 pass / 0 fail, exit 0 |
| 최종 보강 시험 | `bun test --timeout 30000 ./tests/improv_goal63.test.ts` | **29 pass / 0 fail, 103 expect, 113ms, exit 0** |
| 최종 타입 검사 | `bunx tsc --noEmit` | **exit 0**, 진단 없음 |

증거 폴더: `work/demo-slice/lane63/`. `improv-loaders.log`, `improv-tests-initial.log`, `improv-tests.log`, `improv-tests-final.log`, `improv-types-initial.log`, `improv-types-final.log`의 실제 존재를 `ls -l`로 확인했다. 마지막 타입 로그는 진단이 없어서 0바이트이고 감시 종료 코드는 0이었다.

최종 29개 시험은 도주 hit/mixed/crit, 일곱 도주 위치, 체력 1의 안전 비용, 기법별 물건·선행 효과·발화 비복사, 비용 전 경로 고정, 빈 목록과 인라인 비용, 바닥·잠금·중복 비용 거절, 범위 대기·거절·승인·끼어들기, 일반 옛 저장, 새 pending의 저장 및 행운, 목표 없는 옛 pendingLuck의 명시적 한계, 큰 local 행동의 실제 fallback, 해석 경계 오류, 반복 absurd의 무판정·무상태 효과를 확인했다. 고정 표현을 정규식으로 판정하는 새 분류기는 추가하지 않았다.

## 부모 통합에 남기는 검증

실제 모델이 문서 밖 표현을 올바른 target/local/clarify로 나누는지, 승인한 계획과 비용을 자연스러운 한국어로 유지하는지, 전 경로의 모든 후속 대사와 CG가 성취를 취소하지 않는지는 미실행이다. 모델 없는 테스트를 실제 GM 검증으로 표시하지 않는다. 부모가 전체 11개 묶음·기존 fixture 이행·실제 GM·PC 브라우저 QA를 맡는다. 18192는 종료 상태이며 재점유하지 않았다.

이 레인의 구현·집중 검증을 막는 잔여 타입/로더/새 시험 실패는 없다. 임의의 지속 세계 상태는 구현했다고 주장하지 않으며, 등록 목표나 현장 완료 사건으로 받을 수 없는 요청은 사전 범위 확인이 제품 계약이다.
