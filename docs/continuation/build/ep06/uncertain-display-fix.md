# 6화 제작용 미확정 이름표 노출 수정

2026-11-09. P2 데이터 수정이다. `ep06_library.yaml`의 네 cast.display만 빈 문자열로 바꿨다. 새 화자·이름·이야기를 추가하지 않았다.

## 실제 근거와 원인

다음 보고서를 전부 읽고 원시 기록 네 행을 직접 읽었다.

- `docs/continuation/qa/normal-first-20261109.md`
- `docs/continuation/qa/normal-first-fixed-late-review.md`
- `work/continuation/qa/real-1794206518713/canonical_first.jsonl`의 1728·1729·1731·1948행

| 실제 행 | 비트·내부 화자 | 이전 display | 이후 display |
|---|---|---|---|
| 1728 | c026 / ep06_미확정풍선 | 화자·발화 종류 미확정 | 빈 문자열 |
| 1729 | c027 / ep06_한숨미확정 | 화자 미확정 | 빈 문자열 |
| 1731 | c027 / ep06_독백미확정 | 화자 미확정 | 빈 문자열 |
| 1948 | c062 / ep06_아시나미확정 | 아시나(발화·독백 미확정) | 빈 문자열 |

원인은 제작용 판독 메모를 플레이어용 cast.display에 넣은 데이터다. Engine.lineEvent는 이 값을 그대로 전달했다. 빈 문자열은 파서에서 허용되고 엔진의 `cast?.display ?? line.speaker`에서도 내부 ID로 치환되지 않는다. 현재 화면 코드도 빈 이름표를 숨기는 계약이다. 화면 코드는 읽기만 했으며 실제 브라우저를 실행해 확인한 결과는 아니다.

`script.md:285-303,676-678,714-716`과 실제 원문을 대조했다. c026 회색 풍선은 개인·발화 종류 미확정, c027 한숨과 속마음은 개인 연결 미확정이다. c062는 아시나의 문장이지만 발화/독백 구분이 미확정이다. 이 불확실성을 확정된 화자 이름으로 덮지 않았다. 첫 세 내부 배우의 lore 없음과 마지막 배우의 `lore: 아시나`, 기존 style·식별자·표정 계약은 모두 유지했다.

## 정확한 데이터 차이

다음 네 경로의 값만 이전 메모에서 `""`로 바뀌었다.

```text
/cast/ep06_미확정풍선/display
/cast/ep06_한숨미확정/display
/cast/ep06_독백미확정/display
/cast/ep06_아시나미확정/display
```

원본 데이터에 위 네 값 변경만 적용한 예상값과 실제 YAML 전체를 깊이 비교해 일치했다. 비트·줄·순서·효과·facts·지식·CG·표정·로어 및 다른 cast 내용은 변경하지 않았다.

## 원문과 승인 그림 앵커 보존

승인된 `docs/continuation/build/ep06/art/mapping.json`의 실제 포인터와 대조했다.

| 원작 포인터 | 그대로 유지한 문장 | CG | 승인 후보 |
|---|---|---|---|
| /beats/ep06_c026/lines/1 | 이 상황에서도 입은 살아있군. | ep06_cg_026 | ep06_c026 |
| /beats/ep06_c027/lines/0 | 하아… | ep06_cg_027 | ep06_c027 |
| /beats/ep06_c027/lines/2 | 왜 날 자꾸 어디론가 보내는 거야?! | ep06_cg_027 | ep06_c027 |
| /beats/ep06_c062/lines/2 | 타는듯한 더위에 녹아 사라져도 좋을 만큼. | ep06_cg_062 | ep06_c062_desert |

네 대상 앵커의 원문·CG 불일치 0개다. 전체 literal 앵커 157개가 가리키는 줄 객체도 전후 변경 0개다. 원작 scenes의 미확정 5항목은 전후 동일하다. 문장·순서 변경이 없어 의미 재매핑을 하지 않았으며 승인 그림 매핑이나 자산 파일도 수정하지 않았다.

## 재현과 집중 검사

`app/tests/ep06_uncertain_display.test.ts`는 실제 Engine과 FakeGm으로 독립 6화의 원래 여섯 선택을 지나 전달된 line.display를 검사한다. 고정 기대값은 위 실제 원시 기록 네 행의 문장·내부 화자·종류·CG다.

수정 전에는 이름표 네 검사만 실패하고 원문·내부 정체성·다른 확정 이름표·독립 종료 검사는 통과했다. 수정 후에는 이름표가 비어 있고 네 원문·화자·종류·CG·순서와 기존 이름표가 보존되는 것을 확인했다. 모델 호출·판정은 0회다.

| 검사 | 결과 |
|---|---|
| 수정 전 실제 Engine 재현 | 4 통과·4 실패, 종료 코드 1 |
| 수정 후 집중 회귀 | 8 통과·0 실패, 종료 코드 0 |
| 전용 엄격 타입검사 | 진단 0, 종료 코드 0 |
| 직접 시나리오 적재·정합성 | 오류 0개 |
| 네 display 외 데이터 차이 | 없음 |
| 원문·CG·효과 앵커 변경 | 157개 중 0개 |

```sh
bun test ./app/tests/ep06_uncertain_display.test.ts --timeout 15000
/Users/choeminju/.bun/bin/tsc --project docs/continuation/build/ep06/uncertain-display-tsconfig.json --noEmit --pretty false
```

근거:

- `docs/continuation/build/ep06/uncertain-display-evidence.json`
- `docs/continuation/build/ep06/uncertain-display-before.log`
- `docs/continuation/build/ep06/uncertain-display-tests.log`
- `docs/continuation/build/ep06/uncertain-display-types.log`
- `docs/continuation/build/ep06/uncertain-display-tsconfig.json`

## 생산 범위와 남은 검증

조사 시작 뒤 YAML에 다른 작성자의 변경이 없음을 편집 직전에 확인했다. 공유 엔진·GM·로어·서버·UI·타입·다른 화·원작 문서는 수정하지 않았다. producer 4/5/6/8/root의 제어·시작·종료·재시작을 하지 않았고 생성·자산·제작 프로세스 파일을 변경하지 않았다. 생산자의 상태를 새로 검사했다고 주장하지 않는다.

이전 127개나 전체 검사를 다시 실행하지 않았고 실제 모델·브라우저·서버를 호출하지 않았다. 원래 실제 모델 기록도 수정하지 않았다. 변경 데이터의 실행 서버 반영과 실제 화면·백로그 표시, 필요시 부모가 배정하는 실제 모델 검증은 남아 있다. 커밋·crq는 실행하지 않았으며 부모 리드가 후속 반영과 검토 대기열을 맡는다.
