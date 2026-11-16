# 4→5화 거리 성취 계승 계약

2026-11-09. 변경은 `app/content/ep05_audience.yaml`과 새 전용 시험 `app/tests/ep04_ep05_distance.test.ts`에만 적용했다. 4화 YAML은 기존의 실제 성취 계약을 그대로 사용한다. 원작 문서·공유 엔진·다른 화·자산은 수정하지 않았다.

5화 내부의 상태별 진입과 회고는 구현·검증했다. 실제 캠페인 연결과 옛 종료 저장 변환은 공유 `continuation.ts` 소유자의 통합이 필요하다. 아래 시험의 입력 호스트를 배포된 캠페인 연결이라고 보고하지 않는다.

## 원인과 원작 근거

- `source03-10-audit.md`의 4→5 연결은 원작 경로의 눈동자 대면→진행 중인 입맞춤이다. 그 사이 접촉 개시·동의 과정을 창작할 근거는 없다.
- `ep04/continuation.md`·`scenes.json` S07은 실제 확보한 거리를 무시하지 않는 변형 경로를 허용한다. 기존 `ep04_keep_distance`가 그 성취를 구현하고 있었다.
- `ep05/continuation.md`·`scenes.json` S01은 이미 받은 저항 행동을 무시해 접촉을 강제하지 말라고 구분한다. 따라서 원작 S01은 원작 경로에서만 재생한다.
- 5화 `script.md` c010은 실제 아침 외경, c034는 첫 입맞춤 독백, c049~050은 떨어진 좌석과 문 앞의 아시나다. 새 밤의 사건이나 환복·귀환 경위를 채워 넣지 않고 이 아침과 공간을 사용했다.
- 4화 복장은 `ep04/wardrobe-audit.md`, 5화 복장은 `ep05/script.md`의 컷별 직접 확인과 `ep05/continuation.md`를 기준으로 했다. 5화에는 별도의 `wardrobe-audit.md`가 없다.
- `assets/ep05/cuts/full_res/clean/ep05_c032.png`를 직접 열어 확인했다. 남성이 몸을 숙인 밤의 근접 회상이 포함돼 있어 비접촉 경로에 재사용할 수 없다. 이 분기는 같은 방에 혼자 있는 현재 아시나의 c033 그림으로 신원 회고를 표시한다.

원인은 성공 플래그 누락이 아니라 다음 화의 무조건 `ep05_c001` 진입과 무조건 접촉 회고였다. 상태를 버리거나 새 성공 마커를 추가하지 않고 기존 `ep04_distance_kept`를 실제 `Next` 조건에 사용했다.

## 4화의 실제 결과

| 입력·결과 | 실제 성취와 다음 경로 | 종료 비트 / `ending` |
|---|---|---|
| `ep04_keep_distance` hit | `ep04_distance_kept=true`; `ep04_distance_c056`부터 거리 유지 대사와 눈동자 칭찬 | `ep04_distance_boundary` / 같은 값 |
| 같은 목표 mixed | 같은 거리 성취; 독립 soft 대가 `ep04_distance_free_strain`이 정신력에 적용됨 | 위와 같음 |
| 같은 목표 miss | 성취 플래그 없음; `ep04_c056`부터 원작 경로 | `ep04_boundary` / 같은 값 |
| `retort` 원작 선택 | 성취 플래그 없음; 원작 c059의 “…비켜요.”도 이 경로의 대사 | `ep04_boundary` / 같은 값 |
| 목표 확인 카드 거절 `confirm { ok:false }` | pending 의도만 취소. 장면·난수·수치·발화·기억·판정 기록·성취를 새로 만들거나 소비하지 않음 | `ep04_distance_free`, 종료 아님 |

거리 성공 경로는 실제로 “…거기 있어요.”를 말하고 상대가 더 다가오지 않는 결과를 낸다. 이 거절 발화와 성취를 5화가 취소하지 않는다. 별도 `decline` 성공 플래그나 종료는 현 구현에 없다. 확인 카드 거절과 물리 거리 성취를 혼동하지 않는다. 원작 c059의 말만으로 모든 원작 경로를 성공 분기로 바꾸지도 않는다.

현 `GoalSpec`에는 지속/로컬 범위 필드가 없다. `effects`, `next`, `price[]`로 결과를 확정한다. `finishResolve`는 hit/mixed에서 목표 효과와 다음 경로를 적용한 뒤 독립 비용을 처리한다. 따라서 여기서 성취의 지속성은 기존 플래그와 실제 후속 대본의 결합이며, 거리 목표를 무해한 `local` 행동으로 축소하지 않았다.

## 5화 공개 진입과 정확한 경로

`ep05_audience.start = ep05_entry`. 모든 승인된 4→5 연결은 이 비트로 들어가야 한다.

| 조건·위치 | 실제 다음 경로 |
|---|---|
| `ep05_entry`, `flag:ep04_distance_kept` 참 | `ep05_c010` 아침 외경 |
| `ep05_entry`, 그 외 | `ep05_c001` 원작 입맞춤 |
| 거리 경로 `ep05_c031` | `ep05_distance_c032` → `ep05_c033` → `ep05_c037` |
| 거리 경로 신원 회고 | 원래 신원 회고 대사와 `ep05_아시나_라쿤회고`를 유지하되 CG는 `ep05_cg_033` |
| 거리 경로 `ep05_c051` | `ep05_distance_c052` → `ep05_c053` |
| 거리 경로 문답 전 | `ep05_cg_050`; 아시나는 문 앞, 라 쿤은 떨어진 좌석. 그 거리에서 원래 두 질문을 받음 |
| 5화 최종 경계 | `ep05_boundary`, 기존 실제 답·되물음 플래그 유지 |

거리 경로에서는 c001~009 전체, 근접 회상 c032, 첫 입맞춤과 그 직후 악담 c034~036, 접촉을 떠올리는 민망함 c052를 재생하지 않는다. c033의 강압적 처사에 대한 불만은 납치·이동의 실제 경험과 양립하므로 유지했다. 원작 경로의 55컷·대사·CG 순서는 기존 전용 시험으로 그대로 검증됐다.

`ep05_entry`는 `ep04_active=false`만 적용한다. 밤의 현장 사실을 비활성화하면서도 `ep04_distance_kept`, 실명·지위·변장·비밀 출신·물품·수치·기억을 지우지 않는다. 5화의 거리 사실은 이 기존 성취 플래그를 읽는다. 입맞춤하지 않았다는 실제 분기 사실을 GM 문맥에 전달하며, 실제 경로를 바꾸지 않는 문구만의 방어책으로 쓰지 않았다.

거리 경로에서 `ep05_독자_첫입맞춤`과 `ep05_아시나_하렘선언`은 발생하지 않는다. 원작 밤의 선언을 생략했으므로 선언을 들었다는 기억도 주지 않는다. 하렘의 기존 지위와 누르의 아이라 설명은 원래 공개 순서를 유지한다.

## 공유 소유자에게 필요한 최소 통합

현재 `loadCampaignScenario`는 1~3화까지만 합성하고 `BOUNDARIES`에는 4화 경계가 없다. 허용 범위 밖인 해당 파일은 고치지 않았다.

1. 4→5 연결 대상으로 **두 종료**를 모두 등록한다.
   - `ep04_boundary`: 기존 종료 ID `ep04_boundary`, 계속 선택 ID `continue_ep05`.
   - `ep04_distance_boundary`: 기존 종료 ID `ep04_distance_boundary`, 계속 선택 ID `continue_ep05`.
2. 두 경계의 `ending`을 연결형 선택으로 변환하되 기존 줄·효과를 유지한다. 선택의 목적지와 경계 `next`는 모두 `ep05_entry`다. `ep05_c001` 고정 연결은 금지한다. 지도에서는 두 4화 경계 노드에서 `ep05_entry` 노드로 연결하고 종료 표시를 해제한다.
3. 새 화의 `sheet`로 상태를 만들지 않는다. 기존 `connectChapter` 방식으로 정의를 합치고 실제 플레이 상태를 계속 사용한다. 배우의 `lore` 동일성도 유지한다.
4. 옛 종료 저장은 기존 `resumeCampaign` 방식으로만 연다. 저장의 비트와 `ending`이 등록된 경계에 맞고 실제 연결 선택이 존재할 때 상태를 복제하고 `ending=null`, 기존 `후속_시작=true` 처리 뒤 `continue_ep05`를 한 번 실행한다. 이미 읽은 경계의 줄·효과·판정을 다시 실행하지 않는다.
5. 현재 생성되는 거리 성공 종료는 반드시 `ep04_distance_kept=true`를 갖는다. 거리 종료인데 이 플래그가 없는 과거/손상 저장을 원작 입맞춤으로 자동 폴백시키지 않는다. 그 경우의 복구는 실제 저장 버전·목표 판정 기록의 증거에 근거해야 한다. 본 작업은 그런 가상 저장을 정상 저장으로 조작하지 않았다.
6. 기존 `scenario`, 시트 능력·현재 수치·소지품, 모든 다른 플래그, `said`, `heard`, `spoken`, 로그와 난수를 보존한다. 아시나의 비공개 출신·궁정 관객 대화를 NPC/주인공의 공개 기억으로 합치지 않는다.

부모의 `campaign-bridges.md`에는 원작 `ep04_boundary→ep05_entry→ep05_c001`과 성취 `ep04_distance_boundary→ep05_entry→ep05_c010`을 별도로 적어야 한다. 두 경로를 모두 canonical이라고 부르지 않는다.

## 회귀와 증거

새 시험은 실제 4화 시작부터 관찰·해명·거리 입력을 진행해 얻은 종료 상태를 사용한다. 성공 마커를 fixture에 심지 않는다. 5화 입력 호스트는 그 실제 상태를 공개 `start`에 넘기며, 이는 아직 없는 공유 합성기를 검증했다는 뜻이 아니다.

| 검사 | 결과 | 증거 |
|---|---|---|
| 수정 전 새 행동 회귀 | 2통과·2실패, 종료 1. seed 1 mixed·seed 2 hit 모두 거리 종료 뒤 c001 재생으로 실패 | `docs/continuation/build/ep04-05-distance-before.log` |
| 수정 후 두 화 기존 시험 + 새 회귀 | 31통과·0실패·1185단언, 종료 0 | `docs/continuation/build/ep04-05-distance-after.log` |
| 확인 카드 거절 회귀 추가 후 새 파일만 | 5통과·0실패·109단언, 종료 0. 기존 두 화 시험은 재실행하지 않음 | `docs/continuation/build/ep04-05-distance-decline.log` |
| 세 전용 시험과 의존 코드 엄격 타입 검사 | `TYPECHECK_EXIT=0` | `docs/continuation/build/ep04-05-distance-typecheck.log` |

회귀는 실제 발화·CG, 문 앞 거리, 상대 질문, 목표 비용, 종료 상태, 실명/통치자/칭호/비밀 출신, 아이템·수치·능력·난수, 이전 거절 발화와 입력 기억 보존을 검사한다. 비접촉 경로에 입맞춤 그림·첫 입맞춤 대사·관련 플래그/기억이 없는지, 원작·실패 경로에는 원문 입맞춤이 남는지도 검사한다. 비공개 궁정 보고를 주인공의 활성 사실로 바꾸지 않는 기존 경계도 확인한다.

명령은 `app/`에서 실행했다.

```sh
bun test ./tests/ep04_ep05_distance.test.ts ./tests/ep04_night.test.ts ./tests/ep05_audience.test.ts --timeout 20000
bun test ./tests/ep04_ep05_distance.test.ts --timeout 20000
tsc --ignoreConfig --noEmit --target ESNext --module Preserve --moduleResolution bundler --strict --noUncheckedIndexedAccess --noImplicitOverride --noFallthroughCasesInSwitch --verbatimModuleSyntax --allowImportingTsExtensions --types bun ./tests/ep04_ep05_distance.test.ts ./tests/ep04_night.test.ts ./tests/ep05_audience.test.ts
```

신규 시험은 주석·빈 줄 제외 147줄이다. 책임은 4→5 실제 성취 계승 한 가지이며 새 공유 helper·타입 회피·검증 완화는 없다. `yaml-language-server`는 설치되지 않았고 편집기의 TS 진단은 대기 시간 초과였으므로 실제 로더/엄격 시나리오 검사와 `tsc`로 검증했다.

전체 시험·실제 모델·서버·포트·PC 브라우저·옛 저장의 배포 캠페인 로딩은 실행하지 않았다. 공유 연결·저장 변환과 PC 브라우저는 부모/해당 소유자의 통합 범위다. 커밋·푸시·crq는 실행하지 않았다.
