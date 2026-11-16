# 10화 공개 선언 줄 효과 교정

2026-11-09. 수정 범위는 `app/content/ep10_internal.yaml`의 효과 두 건과 새 `app/tests/ep10_disclosure.test.ts`다. 기존 손목 회피 수정과 테스트는 손대지 않았다.

## 근거와 원인

현재 `docs/continuation/ep10/script.md`의 c048~c054 및 c070, `shared-lore-ep05-10-contract.md`의 배우·공개 조건 표와 두 플래그 이전 지시를 확인했다.

| 플래그 | 실제 최종 발화 | 이동 |
|---|---|---|
| ep10_시하드뜻_앎 | c049 왕: 신의 이름이니, '나의 신이시여'라는 의미다. | 비트 효과 → 해당 줄의 effects.flags |
| ep10_베히님 | c053 왕: 듣기 좋군. | 비트 효과 → 해당 줄의 effects.flags |

`scenario.ts`의 `parseLine`은 `effects.flags`를 줄 효과로 파싱한다. `Engine.enter`는 비트 효과를 대사 루프 전에 적용하며, `Engine.say`는 줄 이벤트와 발화 기록을 만든 뒤 그 줄 효과를 적용한다. 기존 두 선언은 전자에 있어 발화를 소비하지 않아도 플래그가 켜졌다.

두 컷은 각각 발화 한 줄이다. 새 회귀는 실제로 파싱한 비트의 효과를 유지한 채 줄 접두 구간과 정지용 빈 choices만 구성하여 Engine 공개 API로 실행한다. 0줄에서는 플래그가 없어야 하고 최종 줄을 소비한 뒤에만 true여야 한다. 원본 줄 이벤트도 접두 구간과 일치하는지 확인한다. 별도 실제 라 쿤 선택 경로는 c053을 방문하지 않고 베히님 플래그가 없는 상태로 c058에 도달한다.

기존 테스트는 종료 상태를 검사하므로 비트 진입과 줄 소비의 차이를 잡지 못했다. 새 회귀에는 별도 엔진 API나 테스트용 프로덕션 변경을 추가하지 않았다.

## 실패와 통과 증거

실행 위치는 `app/`, 런타임은 Bun 1.4.2다.

수정 전:

```sh
bun test ./tests/ep10_disclosure.test.ts --timeout 10000
```

두 공개 테스트 모두 0줄 접두 구간에서 34행 단언이 실패했다. 기대값 `undefined`, 실제값 `true`. 라 쿤 분기는 통과했다. 결과는 1개 통과·2개 실패·10개 단언, 42ms, 종료 코드 1이다. 원인인 비트 진입 효과를 그대로 둔 상태에서 실패를 먼저 확인했다.

수정 후:

```sh
bun test ./tests/ep10_internal.test.ts ./tests/ep10_disclosure.test.ts --timeout 10000
tsc --ignoreConfig --noEmit --target ESNext --module Preserve --moduleResolution bundler --strict --noUncheckedIndexedAccess --noImplicitOverride --noFallthroughCasesInSwitch --verbatimModuleSyntax --allowImportingTsExtensions --types bun ./tests/ep10_internal.test.ts ./tests/ep10_disclosure.test.ts
```

결과는 7개 통과·0개 실패·720개 단언, 57ms, 테스트 종료 코드 0이다. 엄격 타입 검사는 진단 없이 종료 코드 0이다. 기존 원문·78컷 순서, 64개 선택 조합, 손목 회피의 비판정·비용 없음·거리 확보·난수/트랙/아이템 보존, c070 화자 미확정 침묵 검사도 그대로 통과했다.

추가로 수정 직전 전체 YAML을 메모리에 보관한 값에 정확히 위 두 이동만 적용한 뒤 현재 전체 YAML과 `Bun.YAML.parse` 및 `Bun.deepEquals`로 비교했다. 결과는 true다. 따라서 다른 발화·CG·next·효과, 손목 회피 분기, c070 침묵 선언은 모두 보존됐다. GoalSpec·price·face·chapter 등 공유 검증 로직이나 기존 테스트는 수정하지 않았다.

## 검증 경계

이 결과는 네이티브 선언 효과의 Engine 줄 소비 시점만 검증한다. Engine 자동 진행은 여러 줄을 한 번에 소비하므로 화면에 실제 표시된 줄 기준 GM 가시성 누출을 고쳤다는 증거가 아니다. 그 계약은 부모 소유다.

YAML 언어 서버는 설치되어 있지 않다. 별도 설치 없이 실제 `loadScenario` 파싱과 Engine 실행, 엄격 타입 검사로 확인했다. 모델·서버·포트·브라우저·커밋·코드레빗은 실행하지 않았다. 부모 전용 18196에는 접근하지 않았다.
