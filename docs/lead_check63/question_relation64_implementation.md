# 질문 관계 정합성 소스 인계

2026-11-09. 리드가 승인한 `question_relation64_diagnosis.md`의 원인을 interpret → explain → 최종 fallback 경계에서 수정했다. 실제 모델 품질 통과 보고가 아니다.

## 구현 계약

- 기존 ask 해석과 GmContext에 선택형 `Inquiry`만 추가했다. 원문 question, subject, relation, answerType와 공개 source/quote를 함께 전달한다. about는 후보이며 원문 질문을 대신하지 않는다. UI·frame 계약은 바꾸지 않았다.
- 질문 모드의 lore 해석 뒤 한 번 관계 근거를 검수한다. 후보와 무관하게 원문 질문을 읽고, 실제 공개 note·확인된 현재 시점·표시 줄·현장 배치에서 직접 답할 근거를 고른다. 근거 source 실존과 정확한 quote를 코드가 재검사한다. 없는 출처·위조 인용은 거절한다. 모르면 none/빈 근거로 답할 수 있으며 이를 게임 질문으로 강제 재분류하지 않는다.
- 질문 관계 검수의 실패는 `inquiry=null`로 전달해 explain에서 같은 호출을 다시 하지 않는다. 직접 explain을 호출하는 기존 경계에서만 아직 수행하지 않은 관계 검수를 한 번 한다. 재시도 횟수는 늘리지 않았다.
- 설명 생성에는 원문 질문 관계와 채택 근거를 전달한다. 선택 note는 “근거 후보”로만 남긴다. 후보 note 이름을 답에 강제하던 explain의 mustMention을 제거했다.
- 생성된 모든 설명 후보도 원문 관계와 공개 근거의 직접 지지 여부를 기존 의미 판정 함수로 확인한다. 현재 위치/목적지, 국가/도시, 화면 대화/주인공 청취의 바꿔치기를 허용하지 않는다. 실패하면 기존 재생성 경로로 보내며, 모든 후보가 반려되면 “그건 아직 몰라.”만 낸다. 후보 note.say/text를 무검증 대체 답으로 사용하지 않는다.
- 현재 beat.perspective의 실제 값과 화면 배치를 명시한다. 관객 화면의 인물 목록을 아시나 앞의 인물이라고 안내하지 않는다. 표시 줄은 확인된 한 줄만, 인물은 공개 display로 제공하며 내부 cast id를 지식 근거로 내지 않는다. 전체 beat.lines·뒤 정보는 제공하지 않는다.
- 질문으로 관객 정보를 recent/spoken/flags에 추가하지 않는다. 기존 질문 시점 private 투영과 상태 불변 계약을 유지한다. 지식 이름·잠금 조건·나라/관객 낱말 목록·생성 길이·retry 설정은 바꾸지 않았다.

관계 검수가 불가능한 NO_LLM 설명은 공개 note도 임의로 읽어 주지 않고 모른다고 답한다. 정적 게임 규칙 안내는 기존 경로다. 새 실제 모델 호출 수는 lore 질문당 관계 근거 검수 1회와 각 생성 후보의 관계 검수 1회가 추가된다. 이것을 단순 스크립트 응답이나 모델 재시도 증가로 보고하지 않는다.

## 집중 검증

공통 로그 폴더: `work/demo-slice/lane64/`.

- `question-relation-before.log`: 잘못 고른 공개 note의 무검증 fallback 2fail 재현.
- `question-relation-after1.log`: 위 경계 2pass/tsc0.
- `question-relation-matrix.log`: 미공개 국가·공개 후·목적지·같은 지명의 다른 관계·관객 뜻/청취·없는 근거·없는 source/위조 quote·모든 후보 반려·실제 ask 엔진 상태 불변 11pass/tsc0. 문서 밖 표현을 포함한다.
- `question-relation-compat.log`: 기존 GM 설명·unknown·NO_LLM 계약 이행, 영구 hidden, 공개 모국의 긍정 관계 등 7pass. 공개 note raw text를 그대로 출력하던 옛 시험 5개는 새 생성 검수에서 말투와 다른 독립 잠금에 반려됐다.
- 위 5개는 검수·잠금을 풀지 않고 공개된 내용만 자연스러운 반말로 답하는 wire fixture로 고쳤다. 독립 공개 조건을 추가로 열지 않았다. `question-relation-compat-final.log`는 이 5개와 검수 무재시도 경계 6pass/tsc0이다.
- `question-relation-projection-final.log`: 실제 audience/현장 배치/공개 display/표시 줄, 내부 id 제외와 spoken 불변 1pass/tsc0.
- `question-relation-opened-final.log`는 기본 생성 글자 제한을 유지한 6개 공개 gate 긍정 설명 회귀다. 최종 타입 원문은 `question-relation-tsc-final.log`다.

질문 전용 16개 사례는 분차별 통과 기록이며 하나의 전체 suite 결과로 합산하지 않는다. LLM fixture는 의미 판정 응답을 공급하므로 이 검증은 검수·상태·공개 경계와 실패 시 표시의 증거다. 실제 Gemma가 올바른 subject/relation/evidence를 고르고 답하는 품질은 배정된 창에서 별도로 검증해야 한다.

## 잔여와 소유권

원시 실제 3질문은 `work/continuation/map/run/frame-gemma/`에 그대로 있다. 공개 전 국가 FAIL·공개 후 국가 PASS·관객 청취 FAIL의 과거 결과를 새 소스 통과로 승격하지 않는다. 실제 QA 서버가 새 소스를 읽은 뒤 같은 원문과 새 표현으로 확인해야 한다.

실제 모델 호출·18196 사용·서버 재시작·사용자 18080/18081 조작·푸시·코드 커밋은 하지 않았다. 통과한 전용 fumble 시험을 재실행하지 않았다. root의 PC fumble QA와 branch-map의 복원 큐 작업을 건드리지 않았다.

이번 요청의 crq add는 exit 1이다. 기준 `8ed0dbf9`부터 변경 1171개가 150개 한도를 넘어 미등록이다. 공유 WIP를 커밋하거나 숨겨 우회하지 않았다.

후속 A17/A18 컨텍스트 경계도 같은 소유로 수리했다. 분류용 system 분리·실제 토큰 예약 경계·53개 통합 회귀와 잔여 소유의 정본은 `interpret_context64.md`다. 서비스 ctx와 추론 출력 상한은 올리지 않았다.
