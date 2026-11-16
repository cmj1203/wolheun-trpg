# 표시 시점 서버 통합

2026-11-09. 엔진·서버 구현과 집중 회귀 기록이다. 실제 UI·Gemma 질문·전체 스토리 QA 완료 보고가 아니다.

- `newGame(seed,session,observer?)`, `act(state,action,onEvent?,{observer,question}?)`, `resume(state,observer?)`에서 서버 전용 관측을 받는다. continuation의 `resumeCampaign`도 observer를 전달한다.
- 진입 권위 순서는 scene → 실제 lead → onEnter → 본문이다. opening은 onEnter 후 송신한다. lead가 없으면 scene, 있으면 마지막 실제 lead만 진입 완료 투영을 사용한다. 앞 lead에는 뒤의 기억·효과가 없다. 원래 if/CG 선택 시점과 효과 1회 적용을 유지한다.
- 관객 beat와 GM 메타는 주인공 recent/spoken에 넣지 않는다. 관객 이야기 이벤트는 유지한다. GM 메타에는 새 이야기 frame이 없다.
- 서버 `ViewpointPlayback`이 scene/세계 line의 상태 복사와 고정 log prefix를 보관한다. 공개 이벤트에는 opaque `frame`만 추가한다.
- `POST /api/viewpoint/confirm {session,frame}`은 다음 송신 frame만 허용한다. 현재 frame 재확인은 멱등이며 이전·미래·다른 세션 토큰은 거절한다. 확인 API는 busy 중에도 동작한다.
- `ask.frame`은 마지막 확인 frame이어야 한다. client의 scene/flags는 투영 상태의 근거가 아니다. 질문은 현재 free/conversation 또는 현재 장면의 최소 문맥을 사용하며 lastFree를 가져오지 않는다. 현재 표시 줄은 `GmContext.displayed`로 별도 전달한다. 질문 모드만 `about=scene`을 선택할 수 있다.
- 질문 중 권위 상태를 되감지 않는다. 복제한 투영에서 GM을 실행하고 감사 log만 권위 상태에 추가한다. 시간·운명 정산은 하지 않는다. 권위 상태가 결말에 앞서 도달했어도 현재 표시 줄 질문은 가능하다.
- 새 저장은 `SaveFile.viewpoint`에 현재와 남은 투영을 서버가 쓴다. 이 내용은 공개 view/응답에 합치지 않는다. load는 토큰을 회전하고 저장된 공개 큐의 토큰도 함께 바꾼다. 갈림길 체크포인트도 서버 자료에 같은 투영을 보관한다.
- `readSaveSnapshot`은 상태 검증을 유지하며 state/view/viewpoint를 한 번 읽은 JSON에서 반환한다. `/api/load`는 이 하나의 저장 세대만 사용한다. 기존 `readSave`는 같은 검증 결과의 state를 반환한다.
- 투영이 없는 구형 저장에 공개 view가 있으면 과거 frame 표식을 제거하고 다음 실제 행동까지 동적 질문을 잠근다. 공개 view 없이 엔진 resume 큐를 재생하면 마지막 실제 세계 표시 경계만 새 증거로 삼는다. 정밀한 과거 줄 복원이라고 주장하지 않는다.

검증:

- `viewpoint_engine64.test.ts`: lead 0/1/2, if 전체 제외, 무본문 선택지, 같은 줄 sets, b07 후드, 관객/화면 밖 POV, GM 메타, 가변 참조, resume 출처.
- `viewpoint64.test.ts`: 순서·타 세션·이전 토큰, 현재+남은 투영 저장/회전, 관객 질문·앞선 결말과 수치 보존, 같은 beat 공개 전후, 구형 재생 경계.
- `viewpoint_http64.test.ts`: 실제 HTTP 확인/질문, busy, client flags 비신뢰, 공개 DTO, 중간 저장/load, 읽은 직후 슬롯 교체의 세대 일관성.
- 원자 읽기 수정 전 묶음 61 pass / 0 fail / 302 expect, `tsc --noEmit` exit 0. 정상 호칭·soft 예산·교열 기존 GM 표적 회귀 8 pass / 0 fail.
- 원자 읽기 독립 회귀 `save_atomic64.test.ts` 1 pass / 5 expect, 타입 exit 0. 실제 파일 A를 JSON으로 읽은 직후 같은 슬롯을 B로 rename 교체했다. 반환 state/view/private는 모두 A, 다음 파일 읽기는 B였다.
- ep09 제작 연결 중 face 별칭 누락으로 한 차례 HTTP beforeAll이 막혔다. 담당 복구 뒤 실제 `viewpoint_http64.test.ts` 3 pass / 0 fail / 41 expect, 타입 exit 0. 서버 load 중 같은 슬롯 교체·복원 재저장으로 private 세대까지 확인했다.
- root와 새 branch-map 세션에 `SERVER_API_READY`를 전달했다. 이 신호는 엔진/HTTP 구현 완료이며 실제 UI 수용 증거 완료가 아니다.

메타 입력 frame 소실의 후속 수정:

- non-ask의 `begin()`은 교체 예약만 한다. 실제 첫 fresh 세계 관측이 들어올 때 현재·남은 frame과 Atlas 세대를 함께 교체한다. 메타·rewrite·오류는 기존 확인 frame과 남은 송신 순서를 보존한다.
- 상태 변화 자체는 표시 관측이 아니다. 그만두기 확인 대기·취소처럼 pendingRisk가 바뀌어도 새 세계 줄이 없으면 마지막 확인 투영으로 질문한다. 옛 투영을 현재 권위 상태라고 바꾸거나 fallback으로 복사하지 않는다.
- 새 관측이 시작되면 옛 토큰은 거절하고 새 큐의 첫 토큰부터 확인한다. 기존 saveprivate·busy 계약은 유지한다.
- 수정 전 표적 HTTP 1pass/4fail → 수정 후 5pass/70expect. 관련 모듈 5pass/42expect. 추가 오류·확인 대기/취소 HTTP 2pass/25expect, tsc exit 0 (`work/demo-slice/lane64/meta-frame-gap-extra.log`). 이미 통과한 묶음은 반복하지 않았다.

아직 별도 수용 증거가 필요한 항목: 실제 UI의 현재 타이핑만 끝내기, 질문 전후 같은 CG·줄·남은 큐, 실제 Gemma로 같은 공개 줄 전후 질문, 실제 구형 저장 UI, 체크포인트 새 투영 복원의 화면 대조. branch-map 담당과 root에 서버 완료 신호 후 연결한다. 사용자 서버 18080/18081·18192는 건드리지 않았다. 18196 추가 요청은 episodes 반납 뒤에만 한다.

별도 대화 품질 작업: 선택 conversation의 단순 동작은 `acted`에 보존하며 완료할 수 없는 시도를 뜻하는 `interject.action`과 구분했다. 정상 혼합·종료 후 실패 시도 보존·근거 검수17개 회귀가 통과했다. 실제 재반려2건의 구조는 통과했지만 둘째에 근거 없는 장소 일반 규칙을 발견해 전체 내용 PASS로 보고하지 않았다. 미래 보장과 외부 일반 규칙을 현재 관찰·자기 의사와 구분하는 의미 검수는 최신2개 회귀·타입검사 통과, 최신 보강의 실제 둘째 한 건 재검증은 별도 모델 배정을 기다린다.

후속 root 지시에 따라 단순 예/아니오 검수는 문장별 주장·근거 귀속으로 바꿨다. 각 주장은 observation/intention/opinion/world로 분류하며 world는 현재 공개 evidence의 source와 정확한 quote가 필요하다. 시제·단어 목록으로 허용하지 않는다. 검수 누락·근거 없는 외부 주장·없는 출처·불일치 인용은 hard 반려 후 기존 재생성으로 보낸다. 정본 공개 정보와 NPC의 현재 외형·성격·가치관을 근거로 제공하되 숨은 secret을 새 근거로 추가하지 않는다. 원문 외에 문 쪽의 정적과 낮은 목소리를 관찰하는 입력도 회귀에 포함했다. 외부 미래 보장/일반 규칙/의무/인과 주장 반려 및 자기 의사/주관 의견/실제 상황 근거 허용4개 회귀를 실행한다. 둘째 실제 원문만 배정받아 순차 검증 중이며 통과한 첫 혼합은 반복하지 않는다.

둘째 추가 실제 검증은 `work/demo-slice/lane64/ep03-grounded-1794200787165`이다. 구조는 통과했지만 같은 외부 규칙 대사가 남아 내용은 반려했다. 모델이 opinion의 출처 인용을 위조한 것과 world에 무관한 정본 인용을 붙인 것을 직접 읽고 root에 보고했다. 후속 소스는 모든 명시 인용의 원문 실존을 검사하고, 외부 사실의 claim text와 인용 원문 사이 직접 지지 관계를 별도 판정한다. 이 후속 교정의 실제 모델 결과는 아직 없다. 18196은 반환했다.
