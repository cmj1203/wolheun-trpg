# 10화 왕 별칭 CG 계약 교정

2026-11-09. 안정화 대상은 `app/content/ep10_internal.yaml`의 `ep10_왕`, `ep10_왕속마음` 두 별칭이다.

## 변경과 원인

두 별칭의 `lore: 베히다트`와 speech/thought 구분을 유지하고 `presentation: cg`, `faces: [dumbfounded, intrigued, wary, sneer, neutral, menacing]`를 선언했다. 왕의 기존 `sprite: ep10_king` 연결은 CG 전용 계약에 따라 제거했다. 사막 입식이나 새 그림은 연결하지 않았다.

승인 사례 `docs/continuation/build/ep05/cg-alias-fix.md`, 실제 `scenario.ts`의 `faceProblem`·`cgLineProblem`·CG 배우 구조 검증, `lore.ts`의 `withNotes`를 읽었다. 실제 베히다트 반응은 8줄이지만 요구 표정은 위 여섯 종류다. `withNotes`가 thought를 포함한 모든 동일 로어 별칭에 반응 표정을 검사하므로 기존 neutral 전용 선언은 이 계약을 만족하지 못했다.

실제 대사의 face나 감정은 새로 지정하지 않았다. 공유 반응표·검증기는 변경하지 않았다.

CG 전용 배우는 각 줄에 명시적 유효 CG가 필요하다. 기존에 바로 앞 줄의 `ep10_c016` 화면을 이어 쓰던 아래 세 줄에도 같은 CG를 명시했다.

| 비트·경로 | 왕 대사 | 명시한 CG |
|---|---|---|
| ep10_c052 · ep10_title_king 선택 | 그리 부르고 싶다면. | ep10_c016 |
| ep10_distance_question | 말했잖아, 반했다고. | ep10_c016 |
| ep10_distance_question 최종 줄 | 변한 네 눈 색도 모르는 척해주는 거 아니겠어. | ep10_c016 |

거리 경로에 입맞춤 CG를 추가하지 않았다. 마지막 눈색 공개 줄의 effects.flags는 그대로다.

## 실제 집중 검사

수정 전 실제 `loadScenario(ep10_internal.yaml)`와 `loadLore(lore_wolheun.yaml)`를 `withNotes`로 연결했다. 독립 10화에는 기존 수첩의 1화 after 참조가 없어 별도 참조 오류가 있었다. 이를 숨기거나 삭제하지 않고 실제 `ep01_desert.yaml`의 비트만 메모리에서 보충했다. 10화 cast는 그대로 유지했다. 그 결과 두 별칭의 반응 표정 오류 12건만 남는 것을 확인했다.

새 소유 테스트는 `app/tests/ep10_cg_alias.test.ts`다. 동일한 실제 1화 비트 보충으로 기존 수첩 참조를 충족하고, 실제 전체 로어를 `withNotes`로 연결한다. 전체 캠페인 연결이나 다른 화 cast의 통합 성공을 주장하지 않는다.

실행 위치 `app/`:

```sh
bun test ./tests/ep10_cg_alias.test.ts --timeout 10000
tsc --ignoreConfig --noEmit --target ESNext --module Preserve --moduleResolution bundler --strict --noUncheckedIndexedAccess --noImplicitOverride --noFallthroughCasesInSwitch --verbatimModuleSyntax --allowImportingTsExtensions --types bun ./tests/ep10_cg_alias.test.ts
```

결과: 3개 통과·0개 실패·82개 단언, 15ms, 테스트 종료 코드 0. 새 테스트 파일의 엄격 타입 검사도 진단 없이 종료 코드 0.

| 검사 | 결과 |
|---|---|
| 실제 로어 전체 withNotes 연결 | 성공 |
| 실제 베히다트 반응 8줄 × 두 별칭 | 16건 통과 |
| 왕 실제 대사·선택 줄 CG | 28줄 통과 |
| 왕 속마음 실제 줄 CG | 8줄 통과 |
| CG 없는 neutral 줄 | 두 별칭 모두 거절 |
| 존재하지 않는 CG | 두 별칭 모두 거절 |
| 유효 CG에 미승인 smile·surprised·scared | 두 별칭 모두 거절 |
| 입식·대체 입식 미연결 | 두 별칭 모두 확인 |

CG 유효성을 생략하거나 미승인 표정을 허용하지 않았다.

## 보존 확인과 경계

수정 직전 전체 YAML을 메모리에 보관했다. 그 값에 두 별칭의 표시·표정·왕 입식 연결 제거와 위 CG 세 곳만 적용한 뒤 현재 YAML과 `Bun.YAML.parse`·`Bun.deepEquals`로 비교해 true를 확인했다. 마지막 줄 공개 효과, c070 미확정 침묵, 손목 비판정·거리 확보, 라 쿤 호칭 분기, 관객 시점 분할·지도와 나머지 모든 선언은 그대로다.

기존 7개 검사나 광범위 테스트는 반복하지 않았다. 이 증거는 CG 별칭·실제 로어 반응 계약에 한정한다. 관객 줄의 runtime recent/spoken 제외와 표시 확인, 모델 출력·브라우저 검증은 이 작업 결과가 아니다. 모델·서버·포트·다른 YAML·공유 코드·사용자 접촉·커밋·코드레빗은 실행하거나 변경하지 않았다.
