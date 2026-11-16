# 표시 시점 타입 인계

2026-11-09. `viewpoint-contract.md`의 타입 선행 단계다. 관측·확인·저장 런타임이 구현됐다는 보고가 아니다.

## 현재 types.ts

- `BeatSpec.perspective?: 'audience'`. 미선언 장면은 기존 주인공 시점이다.
- scene/line `GameEvent.frame?: string`. 클라이언트에는 불투명 식별자만 전달한다.
- 질문 Action은 기존 `scene`과 `frame?: string`을 보낸다. 서버는 frame이 지정한 scene을 사용하고 client flags/state를 받지 않는다.
- `ViewpointObservation`: 원래 scene/line 이벤트, log를 뺀 읽기 전용 상태 복사본, logLength, 해당 prefix 복사본을 만드는 readLog 함수. 서버 내부 관측 전용이며 DTO에 직렬화하지 않는다.
- `ConfirmedViewpoint`: 서버 확인을 마친 scene·전체 질문 시점 state·현재 표시 line. 서버에서만 만든다.
- `ViewpointOptions`: observer와 question. 엔진 공개 동작에 연결할 내부 옵션이다.

readLog는 고정 prefix 길이와 당시 append-only 로그 배열을 캡처하고 반환할 때 복사한다. 매 line마다 전체 log를 복제하지 않는다. 나머지 상태는 관측 시 structuredClone해 권위 state와 가변 배열·객체를 공유하지 않는다. 저장은 함수가 아니라 서버가 묶은 로그 prefix와 투영 데이터를 보존한다.

## 이어서 연결할 함수와 프로토콜

아래 함수 인자는 다음 엔진 통합 단계에서 구현한다. 타입 선언 완료를 관측 동작 완료로 오해하지 않는다.

- `newGame(seed, session, observer?)`
- `act(state, action, onEvent?, viewpointOptions?)`
- `resume(state, observer?)`
- continuation 담당의 `resumeCampaign(engine, saved, observer?)`: 내부 resume·실제 신규 진입 act 모두 같은 observer를 전달한다.
- `POST /api/viewpoint/confirm`의 본문은 `{ session, frame }`. 서버 송신 큐의 다음 식별자만 확인하고, 다른 판·이전 세대·미래 건너뛰기를 거절한다.
- 질문은 `/api/act`의 `{ type: 'ask', text, scene, frame }`. 서버 마지막 확인 frame과 일치해야 하며 question 옵션은 서버가 따로 구성한다.

관측은 scene 진입 효과와 이야기 line의 sets/effects·기억 처리가 확정된 후, 실제 송신 직전에 한다. line→change 순서는 보존한다. 관객 줄과 GM 메타를 주인공 기억으로 넣지 않는다. GM 메타는 새로운 이야기 frame을 만들지 않는다.

새 저장의 현재 확인 frame과 남은 frame 증거는 서버 데이터다. client가 준 projection으로 덮지 않는다. 구형 증거 없는 대사 중간 저장은 정확한 과거로 위장하지 않고, 동적 지식 답변을 다음 증명 가능한 경계까지 잠근다.

## 소유권

parent는 types/engine/GM/server와 내부 frame 저장을 맡는다. continuation은 perspective 파서·2화 관객 데이터·resumeCampaign 훅, episodes는3~10화 관객 데이터, branch-map은 실제 표시 확인과 질문 UI를 맡는다. 동일 파일 동시 편집은 하지 않는다.
