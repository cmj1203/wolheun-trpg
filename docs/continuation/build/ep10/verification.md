# 10화 내부 검증 기록

## 실행한 검증

작업 위치: `app/`

```sh
bun test ./tests/ep10_internal.test.ts --timeout 10000
```

최종 결과: 종료 코드 0, 4개 통과·0개 실패, 704개 단언, 75ms.

- 원작 선택 경로의 실제 엔진 이벤트를 전사 문서와 비교했다. 발화 93줄과 원본 컷 78개의 순서가 모두 일치했다.
- 첫 입력은 c026 질문이다. 그 전 목욕·귀찌 조정·독백에는 입력이 없고 원작 경로에는 주사위도 없다.
- 공개 범위·호칭·접촉 거부 64개 조합을 실제 엔진으로 끝까지 실행했다. 말하지 않은 가족 정보는 해당 공개 플래그에 들어가지 않으며 거부 경로에 입맞춤·왕의 후속 독백 컷이 없다.
- 손목을 빼고 물러서는 선택을 시드 1·7·19에서 실제 실행했다. 추가 입력·주사위·가격 이벤트 없이 종료까지 진행하고, 손목 해제·거리 확보·입맞춤 없음·눈색 대화를 확인했다. 같은 시드의 원작 진행과 난수·트랙·아이템이 같아 비용을 소비하지 않는다.
- 기존 2화 시트와 동일함을 비교했고, 고유 ID·동일 인물 슬롯·화자 미확정 침묵·CG 자산 파일 78개의 실재를 확인했다.

## 손목 판정 결함과 수정

기존 세 판정 결과는 모두 왕이 손을 놓아 접촉을 끝냈다. 혼합 성공의 `ep10_대답지연`은 후속 결과에 사용되지 않는 표시여서 실질 대가가 아니었다. 앞선 706개 단언 통과는 이 의미 결함을 보장하지 못했다.

비판정 행동을 요구하는 회귀로 기존 검사를 바꾼 뒤, 수정 전 YAML에서 3개 통과·1개 실패를 재현했다. 기대 `ep10_end`에 실제 `ep10_withdraw`가 남아 추가 판정을 요구하는 실패였다(종료 코드 1, 82ms).

원작 c058~c070과 기존 분기를 비교해 별도의 불확실한 목표·유의미한 실패 위험이 없음을 확인했다. 새 벌을 만들지 않고 손목 판정·가짜 시간 비용·미사용 표시·실패 비트와 지도선을 제거했다. 손목을 빼며 물러서는 행동에는 왕이 손을 놓는 반응을 내고, 거리 확보 뒤의 대화와 종료로 이어진다.

같은 회귀는 수정 후 4개 통과·0개 실패다. 실제 모델·브라우저 검증이나 기존 9→10 경계 확정의 증거는 아니다.

## 진단 환경

`bun check --no-script --noEmit --target ESNext --module Preserve --moduleResolution bundler --strict --noUncheckedIndexedAccess --noImplicitOverride --verbatimModuleSyntax --allowImportingTsExtensions --types bun ./tests/ep10_internal.test.ts`는 종료 코드 1, `Script not found "check"`였다. 현재 실행 환경에서 해당 명령을 지원하지 않는다.

YAML 언어 서버는 설치되지 않았고 TypeScript 언어 서버의 즉시 진단은 시간 초과였다. 설치나 공유 설정 변경은 하지 않았다. YAML 자체는 실제 `loadScenario`와 엔진 경로 테스트에서 파싱·참조·도달성 검증을 통과했다.

대체 타입 검사의 최초 `tsc --noEmit --target ESNext --module Preserve --moduleResolution bundler --strict --noUncheckedIndexedAccess --noImplicitOverride --verbatimModuleSyntax --allowImportingTsExtensions --types bun ./tests/ep10_internal.test.ts` 실행은 종료 코드 1, TS5112였다. 명시 파일 검사 시 `--ignoreConfig`가 필요한 실행 환경이었다.

```sh
tsc --ignoreConfig --noEmit --target ESNext --module Preserve --moduleResolution bundler --strict --noUncheckedIndexedAccess --noImplicitOverride --verbatimModuleSyntax --allowImportingTsExtensions --types bun ./tests/ep10_internal.test.ts
```

최종 타입 검사 결과: 종료 코드 0, 진단 없음.

## 이 레인에서 하지 않은 검증

실제 브라우저·실제 모델·저장 재개·캠페인 연결·지도 복원은 부모 레인의 통합 QA 대상이다. 9→10 경계, 10화 이후 연결, GPT 편집·확장 그림, 입식·표정 자산은 미완료다. 원본 정제 컷을 생성 완성품으로 보지 않는다. 사용자 서버·모델 접근, 커밋·푸시·crq는 하지 않았다.
