# 평범한 질문의 설득 판정 차단

상태: INPUT_FIDELITY_SOURCE_READY. 공유 GM과 엔진 person 자동진행 경계 수리 완료.
실제 모델의 새 분류 품질은 미검증이다.

## 기준과 원인

A18 원문은 `(또렷하게 상대를 바라본다) 무슨 근거로 그런 말을 하는 거죠?`다.
상대에게 혐의 근거를 묻는 방향은 원문에 맞는다. 이를 아시나의 해명을 상대가 듣는
목표로 고쳐 쓰면 입력을 바꾸는 오류다. A17의 해명·항의는 해당 목표와 양립한다.
두 실제 재생의 JSON 완결성 통과는 의미 품질과 구분한다. 원시 QA는 수정하지 않았다.

기존 보조 CHANGE 검수에는 일차 해석이 고른 goal.text가 들어갔다.
입력에 없는 설득 목표를 먼저 고르면, 그 목표가 다시 시도 유무 판단의 문맥으로
유입되는 구조였다. 또한 일차 action만 특정 문장 꼴에서 검사했으므로
person에 잘못 남은 접근법도 판정으로 소비될 수 있었다.
최종 관문은 목표 ID·조건·범위·deed 안전성만 보았고 실제 역할·성취의 일치를 보지 않았다.

## 수정

- `app/src/gm/gm.ts`: action 및 접근법이 남은 person은 후보 목표 없이
  원문·현재 상황으로 실제 시도를 확인한다. 관찰·인사·발화이면 접근법·목표를 버리고
  원문을 보존한 person으로 받는다. 물음표나 말하는 문장 꼴만으로 실제 시도를 지우지 않는다.
- 실제 시도가 있으면 별도 ATTEMPT_CHECK 검수에서 원문과 후보 reason/deed,
  실제 소비할 접근법과 목표의 행동자·대상·성취를 대조한다.
  후보 해석은 근거가 아닌 검증 대상이다. 불일치·불완전 응답·검수 실패는
  목표를 강제하거나 규칙 fallback으로 판정하지 않고 무소비 clarify로 돌린다.
- scope=clarify는 이미 확정 전 범위 재질문이므로 기존 제안·질문 계약을 보존한다.
  세계 밖·딴짓의 기존 비판정 경로도 보존한다.
- `app/src/gm/prompt.ts`: 분류 지시에서 입력의 역할·성취를 먼저 읽고
  그에 맞는 후보만 고르게 한다. 특정 문구·의문사 목록·목표 ID 분기는 없다.
  보조 시도 검사와 새 정합성 검사는 짧은 문맥과 reserveContext를 사용한다.
- `app/tests/input_fidelity64.test.ts`: 실제 LocalGm HTTP 경계와 Engine에서 회귀한다.
  일차 오판을 고정하고 후보 goal 데이터가 보조 요청에 유입되면 같은 오판을 되풀이하는
  wire fixture로 정보 경계 회귀를 재현했다. 프롬프트 문구 자체를 고정하지 않는다.
- `app/tests/mixed_attempt64.test.ts`: 기존 위험·설득 양성 fixture가 새 supported 응답을
  제공하도록 보완했다. 기존 기대 결과·입력·판정 기준은 바꾸지 않았다.
- `app/src/engine/engine.ts`: 실제 person 발화를 idle.threat의 무시도 진행과 분리한다.
  상대가 입력을 받아 응답한 뒤 worldMove로 가격·기본 판정·자동 줄거리 진행을 만들지 않는다.
  발화 기록·원문 동작·최근 대화·반복 tone은 보존한다. idle, 혼잣말, shown 감정 반응의
  기존 자연진행과 위험 입력 관문은 그대로 둔다. 새로운 입력 종류나 임시 플래그는 만들지 않았다.

Inquiry, 주 분류 context 예산 예약, 이름 경계, 생성 교열, 인물 말투·표정,
goal 효과 및 knowledge 잠금 로직은 바꾸지 않았다.
주 분류 지시가 추가됐으므로 과거 실측 5135/5238토큰을 현재 입력의 실측값이라고 말하지 않는다.

## 집중 검사

| 로그 | 결과 |
|---|---|
| `work/demo-slice/lane64/input-fidelity-red.log` | 변경 전 새 경계 4 pass / 6 fail. 관찰·질문·인사 오판 3건, 역할/목적 불일치 2건, 엔진 판정 소비 1건 재현 |
| `work/demo-slice/lane64/input-fidelity-green.log` | 새 10건 통과. 기존 혼합 4건 통과·2건 실패는 새 audit에 응답하지 않는 기존 wire fixture 누락 |
| `work/demo-slice/lane64/input-fidelity-additions.log` | 위 기존 양성 2건과 새 person 잔여 접근법·불완전 audit 차단·실제 성공 goal 효과 3건, 합계 5 pass / 0 fail |
| `work/demo-slice/lane64/input-fidelity-clarify.log` | 기존 범위 재질문 4 pass / 0 fail |
| `work/demo-slice/lane64/input-fidelity-tsc.log` | 공유 GM 수리 시점 `bunx tsc --noEmit` exit 0 |
| `work/demo-slice/lane64/input-fidelity-tsc-final.log` | 추가 엔진 red 회귀까지 포함한 타입 검사 exit 0. 런타임 red와 타입 통과를 구분 |
| `work/demo-slice/lane64/input-fidelity-engine-green.log` | 아래 엔진 red 1건, 명시적 무시도/울기 2건, 연속 후속 질문 1건, 성공 goal 보존 1건, 합계 5 pass / 0 fail |
| `work/demo-slice/lane64/input-fidelity-engine-tsc.log` | 최종 엔진 수정·추가 회귀까지 포함한 `bunx tsc --noEmit` exit 0 |

중복 없이 27건 통과했다. A18/문서 밖 질문, 질문형 실제 설득, A17,
관찰·인사, 위험 행동의 통과 검사는 다시 돌리지 않았다.
엔진을 수정한 뒤에는 그 경계에서 성공 goal 효과가 보존되는지도 다시 확인했으며 중복 가산하지 않았다.
HTTP fixture의 supported 값은 라우팅·거절 경계의 입력이며 실제 모델의 의미 판단 능력을
검증한 것이 아니다. 후속 배정 창에서 실제 분류 품질을 확인해야 한다.

## 엔진 자동진행 red와 수리

실제 earned A18은 이전 대화가 이미 1회 있었다. 이를 반영해 같은 장면에서 talks=1로
실행하면, 분류가 talk로 교정돼도 기존 engine.ts의 위협 장면 분기가 letSceneFlow로
넘긴다. `ep04_i02_accusation`에서 `ep04_i03_origin`으로 자동 진행했다.

`work/demo-slice/lane64/input-fidelity-engine-red.log`: 새 마지막 테스트 0 pass / 1 fail.
기대는 기존 비트 보존, 실제는 위 다음 비트다. 테스트를 약화하거나 삭제하지 않았다.
일반 person 후 worldMove가 가격이나 기본 판정을 만들 수 있는 기존 경로도 리드에게 보고했다.
리드가 engine.ts 900/913 주변 소유권을 재확인한 뒤 위 talk 분기를 직접 수리했다.
동일 red 테스트는 원래 비트에 남아 질문 응답을 받고 가격·판정·RNG·성공 플래그를
소비하지 않는 green으로 바뀌었다. 서로 다른 후속 질문 3회도 각 입력이 그대로
상대 응답 경로에 전달되고 재작성 안내나 자동 진행 없이 유지됐다.
원시 earned 상태 자체를 수정하지 않았으며 talks=1은 분리한 Engine 회귀의 fixture다.
무시도·울기는 기존 다음 비트로 자연 진행했다. 이는 대화 응답의 실제 모델 품질이나 전체 게임 QA 승인이 아니다.

18196 추론·예열·토큰 측정, 전체 suite, fumble, UI 검사는 실행하지 않았다.
`crq add`는 이번 요청에서 한 번 실행했으나 변경 1374개가 150개 한도를 넘어 exit 1로
미등록됐다. 코드 커밋·푸시·다른 작업 숨김은 하지 않았다.
