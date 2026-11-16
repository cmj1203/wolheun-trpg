# 9화 황제 CG 별칭 수정

2026-11-09. `ep09_황제`, `ep09_황제독백` 두 별칭만 CG 전용 배우로 전환했다.

## 수정

두 별칭의 `lore: 베히다트`는 유지했다. `sprite: ep09_c035` 대신 `presentation: cg`를 선언하고 실제 공유 로어 반응이 요구하는 여섯 표정만 허용했다.

`dumbfounded`, `intrigued`, `wary`, `sneer`, `neutral`, `menacing`

8개 표정을 일괄 허용하지 않았다. `surprised`는 미승인 표정 거절 검사에 사용했다. 기존 두 별칭의 고정 대사 10줄은 이미 유효한 CG를 선언하고 있어 대사·CG 연결을 바꿀 필요가 없었다. 각 대상 줄의 CG 선언과 파일 실재를 검사했다.

기준 계약은 `docs/continuation/build/shared-dialogue-contract.md`의 CG 전용 배우 절이다. `speech`와 `thought` 모두 선언 표정을 검사하고 실제 출력에는 유효 CG를 요구한다. 이 표정 선언은 대사 톤 계약이며 원작 CG의 얼굴을 새 표정으로 바꾸지 않는다. 2·3·4화의 현재 베히다트 별칭도 읽었으며 해당 화나 공유 코드는 변경하지 않았다.

YAML을 파싱한 뒤 두 대상 cast만 이전 값으로 되돌려 비교했을 때 전체 데이터가 수정 전과 같았다. 9화의 정체성·소지품·관객 선언과 모든 대사·효과·연결을 보존했다. 7화 파일은 수정 전후 문자열이 같았다.

## 검증

새 전용 회귀: `app/tests/ep09_cg_alias.test.ts`.

- 수정 전: 9개 실패. 공유 반응의 표정 불일치와 CG 없는 출력·없는 CG·미승인 표정을 실제 엔진이 통과시키던 상태를 재현했다.
- 수정 후: 9개 통과, 실패 0개, 147개 단언, 종료 코드 0.
- 두 별칭의 실제 로어 반응 전체와 대상 고정 줄 전체의 CG·표정 조합을 검사했다. 선언된 여섯 표정만 허용하며, CG 없음·없는 CG·`surprised`는 실제 Engine 진입에서 거절했다.
- `loadScenario`와 `checkScenario`는 9화에서 오류 0개였다.
- 독립 `withNotes`의 오류는 기존 28개에서 16개로 줄었다. 사라진 12개는 두 별칭의 베히다트 반응 표정 오류다. 남은 16개는 독립 화에 없는 기존 1화 지식 참조이며 이번 수정과 무관하다.
- 실제 1화 비트만 추가해 기존 지식 참조를 충족하고 9화 cast를 그대로 둔 `withNotes`는 통과했다. 실제 공유 로어의 지식 29개가 연결됐다.

`tsc --noEmit`은 종료 코드 2였다. 이번 소유 파일의 진단은 없으며, 다른 담당의 동시 작업 파일인 `app/tests/continuation_perspective.test.ts:55:63`, `:57:41`에서 `TS2339: Property 'beats' does not exist on type 'object'` 두 건을 기록했다. 해당 파일은 수정하지 않았다. 이 결과를 전체 타입 검사 통과로 보고하지 않는다.

전체 테스트·실제 모델·서버·브라우저는 실행하지 않았다.

## 증거

- `docs/continuation/build/ep09/cg-alias-before.log`
- `docs/continuation/build/ep09/cg-alias-after.log`
- `docs/continuation/build/ep09/cg-alias-typecheck.log`
- `docs/continuation/build/ep09/cg-alias-validation.log`

```sh
bun test --timeout 30000 ./app/tests/ep09_cg_alias.test.ts
cd app && tsc --noEmit
```
