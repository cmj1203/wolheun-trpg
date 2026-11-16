# A18 전체 해석 표적 검증

2026-11-09. 기존에 완료한 A17/A18 주 분류만의 재생을 반복하지 않았다. 원래 획득한 A18 한 사례를 현재 `LocalGm.interpret` 전체 경로에 한 번 넣었다.

## 원점과 보존

입력은 `(또렷하게 상대를 바라본다) 무슨 근거로 그런 말을 하는 거죠?`다. 원본은 `work/continuation/qa/context-replay64/A18.bundle.json`이며 원래 비트는 `ep04_i02_accusation`이다. A17 직후의 실제 상태·대화 이력이 들어 있다.

원래 state·text·input은 보존했다. scenario·beat·free만 같은 ID의 현재 시나리오로 연결했다. 현재 fullLore를 생성자에 주고 `DEFAULT_GM_OPTIONS`와 추적 콜백을 사용했다. 입력 파싱과 저장 검증 뒤 원본 동등성을 확인했다.

검증 스크립트는 `work/continuation/qa/a18-full-interpret64/run.ts`다. 기본 모드의 준비 HTTP는 0이며 strict 검사는 종료 코드 0이다. 첫 타입 검사 명령은 TS5112로 시작하지 못했으며, 작업 파일을 직접 검사하는 명령에 `--ignoreConfig`와 기존 프로젝트의 Bun 타입·strict 설정을 명시해 바로잡았다. 제품의 통과한 타입 검사나 전체 시험은 반복하지 않았다.

## 실제 결과

최종 반환은 다음과 같다.

```json
{
  "kind": "talk",
  "to": "person",
  "source": "llm",
  "meta": {
    "attempts": 1,
    "violations": [],
    "fallback": false,
    "ms": 14424,
    "model": "gemma-4-26b-a4b"
  }
}
```

주 분류는 여전히 action·`ep04_heard`를 골랐고 입력에 없는 “해명을 들을 기회 확보”를 목적이라고 해석했다. 이후 후보 목표를 주입하지 않는 CHANGE 검수는 `눈앞의 상황을 확인함`을 반환했다. 이 검수 결과로 실제 시도·설득 목표가 제거되고 최종 해석이 상대에게 건넨 말로 정정됐다. 주 분류 자체가 오판하지 않게 됐다는 증거로 사용하지 않는다.

| 실제 요청 | 입력 토큰 | 출력 예약 | 실제 출력 토큰 |
|---|---:|---:|---:|
| 주 분류 | 5289 | 320 | 171 |
| CHANGE | 752 | 40 | 22 |

서버 props의 문맥 용량은 8192다. 두 요청 모두 출력 용량을 사전 예약했고 예산 이내다. 실제 completion은 2회이며 `meta.attempts=1`과 구분한다. 별도 예약 API는 props·apply-template·tokenize 각각 2회로 합계 6회, 전체 HTTP는 8회 모두 200이다. 예열·health·추가 질문은 없다.

실제 전송 직전 상한은 8회다. 초과 시도가 fallback으로 흡수돼도 외부 위반 기록으로 실패 처리하도록 했다. 이번에는 위반 0개, 상태·소스 해시 불변 모두 true, 실행 종료 코드 0이다. 전체 logical 요청·결과와 HTTP 본문·원시 응답, GmTrace와 최종 Interpretation을 함께 보존했다. GmTrace의 raw가 CHANGE로 바뀌는 구조이므로 주 분류 원문은 logical·wire 기록에서 확인한다.

18196 창은 기존 반환 상태와 연결 부재를 확인한 뒤 리드가 이 단일 사례에 새로 배정했다. 완료 뒤 GM·지도 담당에게 반환을 알렸다. 서비스 문맥 크기·출력 상한·재시도 설정은 변경하지 않았다.

## 인정 범위

기존 `docs/lead_check63/input_fidelity64.md`의 27개 집중 회귀는 원문 역할·실제 시도 검수와 person 발화의 엔진 경계를 다룬다. 그 안의 최종 엔진 5개 회귀는 대화 후 같은 비트 유지, 가격·주사위·RNG 무소비, 실제 성공 효과 보존과 연속 질문 처리를 확인했다. 이번에는 그 시험을 재실행하지 않았다.

이번 실제 결과는 원래 A18에서 최종 해석이 설득 판정으로 넘어가지 않게 정정된다는 증거다. Engine.act·인물 답변 생성·주사위·가격·UI는 실행하지 않았다. 이후 인물 대사의 문법·행동 반영, 모든 자유 입력과 전체 이야기 품질 PASS로 확대하지 않는다.

증거: `work/continuation/qa/a18-full-interpret64/`의 `prepared.json`, `prepare.log`, `strict.log`, `live.log`, `result.json`. 입력·상태·시나리오와 감사 스크립트의 해시가 prepared와 result에 들어 있다. 사용자 서버 18080/18081은 변경하지 않았다.
