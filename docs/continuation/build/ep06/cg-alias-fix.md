# 6화 라·라독백 CG 표정 계약 수정

2026-11-09. 이번 수정은 `app/content/ep06_library.yaml`의 `ep06_라`, `ep06_라독백` 두 배우에 한정한다. 두 배우 모두 같은 `lore: 베히다트`를 유지하면서 `presentation: cg`와 실제 공유 반응에 필요한 여섯 표정만 선언했다.

`dumbfounded`, `intrigued`, `wary`, `sneer`, `neutral`, `menacing`.

공유 로어의 실제 반응은 8개 줄이며 서로 다른 표정은 위 6개다. `withNotes`는 발화·독백을 구별해 제외하지 않고 같은 lore의 모든 별칭을 검사한다. 두 배우 모두 고쳐야 한다. `smile`, `surprised`를 추가해 8표정으로 늘리지 않았다.

## 원인과 수정 범위

이전 두 배우는 CG로 대사를 내보내지만 표시 방식·허용 표정이 없었다. 공유 반응을 붙이면 두 별칭에 각각 8개 반응 검사가 적용돼 총 16건이 실패했다. 현재 승인된 CG 계약은 허용 표정을 선언하면 입식을 요구하지 않지만 실제 각 줄에 등록된 파일을 가진 CG가 있어야 한다.

소스의 대사·독백·줄별 표정·CG·효과는 변경하지 않았다. 기존 27개 해당 배우 줄이 모두 CG 검사를 통과했다. 사막 입식이나 다른 그림을 추가하지 않았고 공유 로어·반응·엔진·검사기는 수정하지 않았다. 표정 허용 목록은 표현 매체 계약이며 새 감정 연기나 표정 그림을 원작에 추가한 결과가 아니다.

수정 전 데이터에 두 배우의 presentation·faces 변경만 더한 예상값과 실제 YAML 전체를 깊이 비교해 일치했다. 따라서 29컷 교정, 인사 분기, 관점 분리, 79비트·지도 21노드·27간선과 나머지 데이터는 그대로다.

## 실제 검증

| 항목 | 결과 |
|---|---|
| 수정 전 독립 `withNotes` | 32건: 기존 수첩 after 참조 16건 + 두 배우 반응 16건 |
| 수정 후 독립 `withNotes` | 기존 수첩 참조 16건만 남음. 반응 오류 0건 |
| 실제 앞 화 비트로 after 참조를 해소한 `withNotes` | 원래 공유 수첩·반응을 모두 유지한 채 통과 |
| 직접 시나리오 적재·정합성 검사 | 오류 0개 |
| 새 전용 회귀의 수정 전 재현 | 5 통과·7 실패, 종료 코드 1 |
| 새 전용 회귀의 수정 후 실행 | 12 통과·0 실패, 종료 코드 0 |
| 전용 엄격 타입검사 | TypeScript 6.0.3, 진단 0·종료 코드 0 |

수첩 결합 검사는 실제 `ep01_desert.yaml`의 비트와 6화 비트를 참조 자료로 함께 제공했다. 원래 lore의 knowledge나 reactions를 삭제·필터링하지 않았다. 실제 앞 화 비트로 기존 after 참조만 충족한 자료이며 실행 가능한 전체 캠페인 연결이나 전체 게임 QA 증거는 아니다.

수정 후 독립 결합에 남은 16건은 수정 전과 동일한 앞 화 수첩 참조 오류다. 반응 오류와 합쳐 새 실패로 보고하지 않았으며, 삭제해서 통과시키지 않았다. 전체 오류 목록은 `cg-alias-evidence.json`에 있다.

`app/tests/ep06_cg_alias.test.ts`는 두 별칭에 대해 승인 여섯 표정의 허용, CG 누락 거부, 미등록 CG 거부, 미승인 smile/surprised 거부를 기존 검사기로 확인한다. 실제 공유 로어 반응 전체를 두 별칭에 결합하고 모든 해당 원작 줄도 검사한다.

## 실행 명령과 근거

```sh
bun test ./app/tests/ep06_cg_alias.test.ts --timeout 15000
/Users/choeminju/.bun/bin/tsc --project docs/continuation/build/ep06/cg-alias-tsconfig.json --noEmit --pretty false
```

- `app/content/ep06_library.yaml`
- `app/tests/ep06_cg_alias.test.ts`
- `docs/continuation/build/ep06/cg-alias-evidence.json`
- `docs/continuation/build/ep06/cg-alias-before.log`
- `docs/continuation/build/ep06/cg-alias-tests.log`
- `docs/continuation/build/ep06/cg-alias-types.log`
- `docs/continuation/build/ep06/cg-alias-tsconfig.json`

기존 127개 검사는 이번 좁은 수정에서 다시 실행하지 않았다. 전체 테스트·모델·서버·브라우저·공유 코드·다른 화 수정·커밋·푸시·crq는 수행하지 않았다. 관점 런타임·캠페인·실제 그림의 추가 QA를 완료했다고 주장하지 않는다. 이번 CG 별칭 수정 범위는 끝났으며 부모가 후속 통합을 진행한다.
