# 6화 최종 감사 교정 · 2026-11-09

이 교정서와 `audit-result-20261109.json`이 현재 구현 근거다. 기존 `integration.md`, `source-map.md`, `source-corrections.md`, `verification.md`, `load-evidence.json`, `tests.log`는 교정 전 기록이며 현재 대사·복장·장 연결의 기준이 아니다. 이번 권한은 새 근거 문서뿐이므로 이전 기록을 수정하지 않았다. 부모가 보관 표시하거나 교체해야 한다.

관점 선언 추가 후 최종 데이터는 79비트다. 정확한 독자 시점 11개와 분리 비트 6개는 `audit-perspective-20261109.md`를 따른다. 현재 파서는 이 관점 선언 11개를 보존하지 않으며 실제 recent/spoken에 사적 판단이 들어가는 것을 확인했다. 127개 전용 검사와 엄격 타입검사 통과는 관점 런타임 격리 완료가 아니다. 이동 인계의 시작점은 `handoff-20261109.md`다.

최종 `docs/continuation/source03-10-audit.md`와 최신 6화 `transcription-audit.md`, `script.md`, `scenes.json`, `continuation.md`를 대조했다. 원작 준비 범위는 131장·531컷·73장면·8경계·복장 감사이며 게임·그림·모델 검사 완료가 아니다.

## 29컷 교정 → 실제 코드 → 행동 근거

새 정본 회귀를 교정 전 실제 YAML에 실행해 27개 실패·3개 통과와 종료 코드 1을 확인했다. 이전 67개 통과는 새 원작 검증 근거로 쓰지 않았다. 아래 회귀는 실제 Engine이 내보낸 발화·화자·종류를 컷별로 비교한다. 기대값은 원작 정본에서 고정했으며 YAML에서 기대값을 역산하지 않는다.

정본 열은 `docs/continuation/ep06/script.md`, 회귀 열은 `app/tests/ep06_audit_lines.test.ts`의 줄 번호다. c008·c046의 답변은 같은 cut을 가진 `_reply` 비트다.

| 컷 | 정본 | 실제 코드 | 교정 의미 | 실행 회귀 |
|---|---|---|---|---|
| ep06_c001 | script.md:11 | app/content/ep06_library.yaml:641 | 인사 띄어쓰기와 실제 선행 발화 조건 | ep06_audit_lines.test.ts:11 |
| ep06_c007 | script.md:72 | app/content/ep06_library.yaml:796 | 귀족 추측 회상 말풍선 다섯 줄 | ep06_audit_lines.test.ts:12 |
| ep06_c008 | script.md:85 | app/content/ep06_library.yaml:831 | 크라차 지명과 위협 말풍선 분리 | ep06_audit_lines.test.ts:13 |
| ep06_c011 | script.md:123 | app/content/ep06_library.yaml:955 | 크라차산 지명과 내면 구별 | ep06_audit_lines.test.ts:14 |
| ep06_c024 | script.md:258 | app/content/ep06_library.yaml:1219 | 이름 문답과 실제 속마음 | ep06_audit_lines.test.ts:15 |
| ep06_c025 | script.md:270 | app/content/ep06_library.yaml:1245 | 갈아입으시니 표기와 뒤 여백 한 풍선 두 문장 | ep06_audit_lines.test.ts:16 |
| ep06_c026 | script.md:282 | app/content/ep06_library.yaml:1270 | 미소녀 자칭과 미확정 회색 풍선 | ep06_audit_lines.test.ts:17 |
| ep06_c027 | script.md:293 | app/content/ep06_library.yaml:1292 | 개인 화자 미확정 한숨·속마음과 라의 지시 | ep06_audit_lines.test.ts:18 |
| ep06_c029 | script.md:314 | app/content/ep06_library.yaml:1335 | 라·나시르 시선·끄덕임; 아시나 화면 밖. 인식 주체만으로 관점 추론하지 않음 | ep06_audit_lines.test.ts:19 |
| ep06_c032 | script.md:346 | app/content/ep06_library.yaml:1395 | 라의 실제 겁박 발화와 비공개 명령 | ep06_audit_lines.test.ts:20 |
| ep06_c046 | script.md:500 | app/content/ep06_library.yaml:1794 | 현재 적대와 기존 건국 지식 구별 | ep06_audit_lines.test.ts:21 |
| ep06_c047 | script.md:513 | app/content/ep06_library.yaml:1869 | 최근 마찰·분위기; 기간 특정 없음 | ep06_audit_lines.test.ts:22 |
| ep06_c048 | script.md:524 | app/content/ep06_library.yaml:1895 | 북의 기록 지연은 아시나 발언 | ep06_audit_lines.test.ts:23 |
| ep06_c049 | script.md:533 | app/content/ep06_library.yaml:1913 | 무언 전환; 새 독백 없음 | ep06_audit_lines.test.ts:24 |
| ep06_c051 | script.md:551 | app/content/ep06_library.yaml:1947 | 죄인 취급 이해는 아시나 실제 발화 | ep06_audit_lines.test.ts:25 |
| ep06_c052 | script.md:561 | app/content/ep06_library.yaml:1969 | 길 질문·탈옥은 아시나 비공개 회상 | ep06_audit_lines.test.ts:26 |
| ep06_c053 | script.md:575 | app/content/ep06_library.yaml:1999 | 감옥 처우를 재평가하는 속마음 | ep06_audit_lines.test.ts:27 |
| ep06_c054 | script.md:584 | app/content/ep06_library.yaml:2017 | 나시르의 질문 허락 요청과 아시나 동의 | ep06_audit_lines.test.ts:28 |
| ep06_c055 | script.md:595 | app/content/ep06_library.yaml:2042 | 안내인의 우회 권유와 아시나 거절 | ep06_audit_lines.test.ts:29 |
| ep06_c056 | script.md:607 | app/content/ep06_library.yaml:2073 | 위험 감수 이유 질문과 비공개 진위 시험 | ep06_audit_lines.test.ts:30 |
| ep06_c057 | script.md:619 | app/content/ep06_library.yaml:2161 | 숨긴 것을 보려는 나시르 속마음 | ep06_audit_lines.test.ts:31 |
| ep06_c058 | script.md:629 | app/content/ep06_library.yaml:2184 | 북대륙 계절·산·들판 설명 | ep06_audit_lines.test.ts:32 |
| ep06_c059 | script.md:641 | app/content/ep06_library.yaml:2214 | 북대륙에 모래 바다가 없다는 대비 | ep06_audit_lines.test.ts:33 |
| ep06_c060 | script.md:650 | app/content/ep06_library.yaml:2232 | 광경을 보고 싶었던 동기와 나시르 지역 성장 | ep06_audit_lines.test.ts:34 |
| ep06_c061 | script.md:661 | app/content/ep06_library.yaml:2273 | 나시르 감정 비교와 사막 소감 질문 | ep06_audit_lines.test.ts:35 |
| ep06_c062 | script.md:672 | app/content/ep06_library.yaml:2313 | 예쁜 사막 감상과 발화/독백 미확정 마지막 문장 | ep06_audit_lines.test.ts:36 |
| ep06_c063 | script.md:683 | app/content/ep06_library.yaml:2339 | 이름에 놀랐다는 아시나 발화 | ep06_audit_lines.test.ts:37 |
| ep06_c064 | script.md:693 | app/content/ep06_library.yaml:2361 | 나시르의 비공개 진실 판단과 실제 답 | ep06_audit_lines.test.ts:38 |
| ep06_c065 | script.md:705 | app/content/ep06_library.yaml:2402 | 아시나 눈 CG 위 나시르 인정 독백 | ep06_audit_lines.test.ts:39 |

c014 앞 「말도 안 되는 소리.」와 c025 뒤 「아주 어여쁘시네요. 라 쿤께서는 좋으시겠습니다.」를 제 위치에 유지했다. c025 뒤 두 문장은 원래 한 말풍선이다. 같은 컷에서 나눈 대사는 같은 CG를 쓴다. 무언 c029·c049·c050·c030은 새 독백을 만들지 않는다.

## 발화·공개·기억

공개 효과는 해당 줄의 sets로 적용한다. `독자_` 플래그는 facts에 넣지 않는다. 기존의 애첩 선언·최근 1년·북대륙 전달 추정·자르다 필수 통과·멋진 분 칭찬·사막 밖 경험 부재를 대사와 사실 목록에서 제거했다. 최근 악화 플래그는 최근 마찰과 나쁜 분위기만 뜻한다.

| 구분 | 실제 계약 |
|---|---|
| c007·c031~c032·c044~c045 | 귀족 추측·밀명·시험 의도는 비공개다. 앞 화에서 이미 아는 통치자·호칭은 초기화하지 않는다. |
| c036~c037 | 시그렌은 온 곳의 진술이다. 혈통·출생국을 확정하지 않고 실제 경유 속내는 아시나만 안다. |
| c047~c048 | 최근 마찰은 나시르 설명, 북의 기록 지연은 아시나 발언이다. 기간·전달 체계를 추가 확정하지 않는다. |
| c051~c053 | 죄인 취급 이해만 상대에게 한 발언이다. 길 질문·탈옥·처우 재평가는 아시나 내면으로 남긴다. |
| c055 | 우회로가 존재하며 안내인의 권유를 아시나가 거절했다고 실제 답한다. 강제 사막 통과가 아니다. |
| c056~c061 | 나시르의 진위 시험·감정 비교는 비공개다. 실제 답은 북대륙과 모래 바다의 대비다. 사막 밖 경험 유무는 확정하지 않는다. |
| c062~c065 | 예쁜 사막 감상과 이름에 대한 놀람은 실제 발화다. 나시르의 진실 판단은 사막 감상에 관한 내면이며 정체 조사 종료가 아니다. |

## 최종 감사의 미확정 표

아래는 최종 전사 감사의 「미확정 근거」 표를 그대로 보존한 것이다.

| 컷·대상 | 원본 근거 | 처리 |
|---|---|---|
| c017 보고자 | ep06_005.png [10349,19404), 인물은 화면 밖 | 문장은 보존, 개인 신원 미확정 |
| c026 회색 말풍선 | ep06_008.png [209,6236), 인물 연결·발화 꼬리가 불명확 | 문장 보존, 개인 화자와 발화/속마음 구분 미확정 |
| c027 한숨·이동 속마음 | ep06_008.png [6975,11733), 라·아시나 그림과 독립 말풍선 | 두 문장 보존, 개인 화자 미확정 |
| c062 마지막 원형 말풍선 | ep06_016.png [235,12462), 사막 삽입 아래 아시나의 감상 | 아시나 문장 보존, 발화/독백 구분 미확정. 나시르가 들었다고 확정하지 않음 |

c026은 개인 lore가 없는 중립 전사, c027은 개인 lore가 없는 한숨·속마음 화자로 재생한다. c062 마지막 문장은 알려진 아시나와 같은 lore로 묶되 발화/독백을 단정하지 않는 중립 전사다. 문장을 생략하지 않고 현장 사실 플래그를 붙이지 않는다. `spoken`은 중립 화자 키로 구별하며 아시나의 확정 발화나 상대가 들은 사실로 승격하지 않는다. 공유 대화 통합에서도 이 불확실성을 유지해야 한다.

c017의 화자 ID `ep06_보고자`는 유지하되 lore는 공유 배우 계약의 정확한 키 `ep06_도착보고자`로 연결했다. 나시르나 다른 시종과 동일인으로 취급하지 않는다. `shared-lore-ep05-10-contract.md`의 배우 표와 전용 실제 보고 발화 회귀로 검사한다. 공유 lore 파일은 담당 레인이 통합한다.

## 그림과 상태

기존 원작 정리 입력 `assets/ep06/cuts/full_res/clean/ep06_cNNN.png` 65개를 참조한다. Astra 완성 그림이 아니다. 출연 슬롯은 모두 null이며 다른 화 사막 입식을 대신 쓰지 않는다. c029는 라·나시르 시선과 끄덕임, c031은 등·어깨·팔을 덮은 적갈색 겉옷, c052는 베이지 여행복 아시나 회상, c058은 북대륙 자연, c062는 현재 가림천과 여행복 사막 삽입, c063은 아시나 정면·나시르 뒷모습, c065는 아시나 눈이다. 보이지 않는 의복은 정본의 미확정을 따른다. 이전 build의 반대 복장 설명을 그림 제작 요구로 쓰지 않는다.

시트 소지품 정의는 2화 정규 목록과 같다. 실제 소유·손상·수치·기억은 선행 상태를 보존하며 gain/lose·수치 변화·판정은 없다. 여섯 비판정 태도 선택은 초기 내부 구현이다. c061 소감 질문은 정본 답을 자동 재생하고 임의 입력 통합 때 부모가 실제 문답 자리로 다룬다.

## 정확한 5→6 진입과 지도

현재 5화 시작은 `ep05_entry`이며 `ep04_distance_kept`이면 c010으로 간다. 이 진입이나 5화 파일을 변경하지 않았다. 두 인사 플래그가 없다는 사실만으로 표준 인사를 선택했다고 추측하지 않는다.

| 진입 | 실제 승계 상태 | 6화의 실제 재생 | 첫 입력 |
|---|---|---|---|
| 단독 | 5화 시선 답변·두 인사 플래그 없음 | c001 인사 두 줄 → c002 제안 → c003 | 하렘 체류 거절 |
| 표준 답변 완료 | 실제 c055가 만든 `ep05_시선답변`, `ep05_지난밤답변`, `ep05_지난밤되물음` 모두 참 | c001 발화 없음 → c002 제안 → c003. c002로 직접 진입해도 동일 | 하렘 체류 거절 |
| 짧은 답변 완료 | 실제 ep05_reply_short의 `ep05_시선답변`만 참 | c001 발화 없음 → c005 접근 → c008. c002·c003·c004·거절 분기 전체 생략. c005로 직접 진입해도 동일 | 크라차행 목적 답변 |
| 부분 인사 영수증 | 두 인사 중 한 줄만 실제 완료 | 이미 한 줄은 건너뛰고 선택된 표준 문답의 나머지 줄만 재생 → c002 | 하렘 체류 거절 |

짧은 경로를 인사 미완료로 보지 않는다. 실제 `ep05_시선답변 && !ep05_지난밤답변 && !ep05_지난밤되물음` 조건으로 c005에 합류한다. c005는 라가 계단에서 다가오며 지난밤을 평가하는 NPC 발화다. 감사·하렘 만족·거절 등 플레이어의 새 말이나 선택을 대신 만들지 않는다. 이 짧은 경로는 게임의 응답별 적응이며 원작에 별도 대사가 있다고 주장하지 않는다.

지도는 21노드·27간선이다. 원래 첫 노드는 c001만 갖는다. 새 `ep06_offer_choice`는 c002·c003, 새 `ep06_decline_reply`는 c004를 갖는다. 접근 노드 `ep06_s01_2`는 c005~c008을 갖는다. c001→접근 간선과 원작 제안→거절→접근 간선을 분리해 짧은 경로에서 제안·거절을 방문한 것처럼 표시하지 않는다. 자동 판정으로 만든 노드는 없다.

부모의 최소 패치는 `ep05_boundary`(ending.id도 ep05_boundary)를 `continue_ep06` 선택으로 6화 start `ep06_c001`에 연결하고 기존 상태·세 실제 발화 플래그를 보존하는 것이다. 공유 BOUNDARIES 등록·전체 로더 결합·장 지도 간선은 부모 소유다. 새 장 newGame으로 상태를 초기화하지 않는다. 5화와 6화 원문 인사는 양쪽 모두 남긴다. 전용 검사는 실제 5화 Engine의 표준/짧은 줄이 만든 플래그로 진입한다.

이전 저장에 플래그가 없다면 화 번호나 방문 비트만 보고 표준 인사를 강제하지 않는다. 부모가 실제 발화 영수증 또는 `spoken.ep05_아시나`의 문장으로 경로를 복원해야 한다. 짧은 답변과 표준 인사를 구분할 수 없는 기존 저장의 이행은 공유 소유 범위라 미구현이다.

6화 최종 비트는 `ep06_c065`, 내부 종료는 `ep06_internal_end`다. 다음은 같은 도서실의 7화 c001 조사 문답이다. 짐 일부 제시·반환 범위는 7화 c002~c003, 오늘 조사 종료는 c005다. 6화에서 석방·출궁 허가·짐 전부 반환·새 호위를 만들지 않는다.

## 검사와 남은 범위

새 결과 파일과 로그에 실제 파서·전용 검사·엄격 타입검사 결과를 남긴다. 전체 테스트·서버·모델·브라우저·커밋·푸시·crq는 실행하지 않는다. 임의 대사·행동과 goals/price 통합, 전체 캠페인 lore·저장·렌더·완성 그림·실제 모델 검사는 부모 소유다. 공유 엔진·검증을 바꾸거나 약화하지 않았다.
