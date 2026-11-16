# 현재 화간 연결 사실표

2026-11-09 공유 작업 파일을 읽은 조사 결과다. 아래의 **관측**은 실제 YAML·코드에 있고, **제안**은 아직 구현하지 않은 연결 동작이다. 원작 근거는 기존 전사 감사 문서를 읽어 인용했으며 이 조사에서 원본 그림을 재검수하지 않았다. 파일을 순차로 읽었으므로 원자적인 최종 스냅샷이 아니다. 특히 `ep06_library.yaml`은 `st_01a1be16` 수정 중이며 최종본으로 승인하지 않는다.

근거 JSON: `docs/continuation/build/bridge-facts/current-snapshot.json`. 파일별 SHA-256, 실제 종료·시작 비트 전문, 지도 좌표, 4화 거리 목표와 5화 답변 변형, 문서 해시를 담았다.

병행 담당 `st_01a1be63`이 4~5화의 거리·거절 일관 경로를 구현 중이므로 시작·경계가 달라질 수 있다. 아래 “대체 도입 없음”은 JSON 해시로 고정한 관측본에 대한 설명이며 그 담당의 이후 결과를 부정하지 않는다. `st_01a1be16`의 6화 최종 정정과 함께 부모가 최종 변경분을 대조해야 한다. 부모는 새 Bun 프로세스로 3→4 행을 독립 확인했다. 오래 살아 있는 프로세스의 예전 파서 실패를 현재 파일 결함으로 해석하지 않았으며 이 조사에서도 그런 파서 실패를 결함 근거로 사용하지 않았다.

## 일곱 경계

`시작`은 각 독립 시나리오의 실제 `start`다. 지도 표기는 `chapter / node / col / row`다. 모든 출발 말단의 현재 `choices`와 `next`는 **ABSENT**이며 현재 캠페인의 화간 연결선도 없다. 표의 계속 ID는 모두 **미구현 제안**이고 관측한 3~10화의 선택 ID 및 현재 도우미의 선택 ID와 충돌하지 않는다.

| 경계 | 출발 파일 · scenario.id · 시작 | 실제 말단 beat → ending.id · 변형 | 도착 파일 · scenario.id · 시작 | 현재 지도 출발 → 도착 | 계속 선택 ID 제안 · 정당한 진입 조건 |
|---|---|---|---|---|---|
| 3→4 | `app/content/ep03_palace.yaml` · `ep03_palace` · `ep03_c001` | `ep03_c061` → `ep03_boundary`. 마지막 발화의 `sets=ep03_완료`. 말단 변형 없음. | `app/content/ep04_night.yaml` · `ep04_night` · `ep04_c001` | `ep03 / ep03_s12 / 31 / 3` → `ep04 / ep04_plan / 32 / 3`. 출발 노드의 원문 `ending:false`. | `continue_ep04`. 이 실제 경계에 도달한 판만. 하렘 통보·청록 실내복·갈색 변장·귀찌·짐 미회수를 계승한다. 3화 c052~c061 접견의 관객 정보는 아시나의 기억으로 넣지 않는다. |
| 4→5 | `app/content/ep04_night.yaml` · `ep04_night` · `ep04_c001` | 근접: `ep04_c063` → **말단** `ep04_boundary` → ending `ep04_boundary`. 거리 성공: `ep04_distance_c063` → **말단** `ep04_distance_boundary` → ending `ep04_distance_boundary`. 두 종료를 합치지 않는다. | `app/content/ep05_audience.yaml` · `ep05_audience` · `ep05_c001` | 근접 `ep04 / ep04_end / 44 / 2`, 거리 `ep04 / ep04_end_apart / 44 / 4` → 현재 도착 `ep05 / ep05_s01 / 0 / 0`. 두 출발 노드 `ending:true`. | 근접 `continue_ep05`; 거리 별도 예약 제안 `continue_ep05_distance`는 **next 미확정**. `ep05_c001`은 이미 입맞춤 중이므로 거리 성공·거절을 이곳으로 강제 연결할 수 없다. 거리 경로의 의미와 후속 도입은 미해결이다. |
| 5→6 | `app/content/ep05_audience.yaml` · `ep05_audience` · `ep05_c001` | `ep05_c055` 또는 `ep05_reply_short` → **말단** `ep05_boundary` → ending `ep05_boundary`. 종료는 하나지만 실제 인사·되물음의 유무가 다르다. | `app/content/ep06_library.yaml` · `ep06_library` · `ep06_c001` | `ep05 / ep05_boundary / 16 / 0` → `ep06 / ep06_s01_0 / 0 / 2`. 출발 `ending:true`. 제안된 중복 생략 시 `ep06_c002`도 같은 도착 노드에 속한다. | `continue_ep06`. 실제 `ep05_지난밤답변`·`ep05_지난밤되물음`이 모두 참인 판은 인사 재생 없이 c002 반응으로 잇는 방식을 제안한다. 짧은 답변 경로는 c001 대리 발화·c002 원인 없는 반응 모두 피할 별도 응답 계약이 필요하다. **최신 6화 29컷 감사 전체 반영 선행.** |
| 6→7 | `app/content/ep06_library.yaml` · `ep06_library` · `ep06_c001` | 관측 말단 `ep06_c065` → `ep06_internal_end`. 현재 말단의 마지막 줄 `sets=ep06_독자_잠정이해`. 수정 중이므로 이 본문·종료 형태를 최종으로 확정하지 않는다. | `app/content/ep07_harem.yaml` · `ep07_harem` · `ep07_c001` | 관측 `ep06 / ep06_s07_18 / 18 / 2` → `ep07 / ep07_s01 / 60 / 3`. 출발 `ending:true`. | `continue_ep07`. 6화 도서실 문답 완료 뒤 같은 조사로 연결한다. 7화 c002~c003의 일부 짐 설명, c005의 오늘 조사 종료를 앞당기지 않는다. 전량 반환·석방·출궁 허가를 만들지 않는다. **최신 6화 29컷 감사 전체 반영 선행.** |
| 7→8 | `app/content/ep07_harem.yaml` · `ep07_harem` · `ep07_c001` | `ep07_c063` → `ep07_internal_end`. `effects.flags.ep07_근접_종료=true`. 머리·뺨 옆을 감싼 가까운 상태이며 질문의 답은 미완결이다. | `app/content/ep08_harem.yaml` · `ep08_harem` · `ep08_c001` | `ep07 / ep07_s10 / 69 / 3` → `ep08 / ep08_s01_0 / 0 / 8`. 출발 `ending:true`. | `continue_ep08`. 실제 가까운 종료 상태에서 이어지는 항의로 진입한다. 카림의 배정·통성명·밖 대기 인식, 일부 짐 압수, 갈색 변장을 유지한다. 이미 질문에 답했다고 처리하지 않는다. 복장 차이로 중간 환복 사건을 창작하지 않는다. |
| 8→9 | `app/content/ep08_harem.yaml` · `ep08_harem` · `ep08_c001` | `ep08_c062` → `ep08_boundary`. “당신은 하렘 밖에 있어야 하잖아요?” 뒤 `sets=ep08_r23`. 대답은 아직 없다. | `app/content/ep09_palace.yaml` · `ep09_palace` · `ep09_c001` | `ep08 / ep08_s10_2 / 12 / 8` → `ep09 / ep09_s01_0 / 0 / 2`. 출발 원문 `ending:false`. | `continue_ep09`. 낮 하렘 산책 중 카림 대면에서 같은 대화로 잇는다. 9화에도 출입 이유의 직접 답은 없다. 감시는 아시나의 추측으로 남기며 명령·이동 경로를 만들지 않는다. 일부 반환·일부 압수 상태를 유지한다. |
| 9→10 | `app/content/ep09_palace.yaml` · `ep09_palace` · `ep09_c001` | `ep09_c084` → `ep09_internal_end`. 실제 마지막 발화 “소동물인 것 같네요.”. 공격·투척·포획 결과가 없다. | `app/content/ep10_internal.yaml` · `ep10_internal` · `ep10_c001` | `ep09 / ep09_s08_1 / 13 / 2` → `ep10 / ep10_s01 / 0 / 1`. 출발 노드 `ending` 필드 ABSENT. | `continue_ep10`. 원작의 장면 생략으로 궁정 목욕 장면에 전환하는 제안만 가능하다. 공격·포획·강제 귀환·탈출 성공을 쓰지 않는다. 높은 곳에서 느낀 시선과 욕실 회고를 계승하되 독자만 본 칼·대족장 호칭은 아시나의 지식으로 옮기지 않는다. 욕조 밖 가방의 존재가 전량 반환·치부책 회수 증거는 아니다. |

10화 자체의 관측 종료는 `ep10_end` → ending `ep10_boundary`, 지도 `ep10 / ep10_end_node / 18 / 3`, `ending:true`다. 이 조사에는 10→11 연결이 없다.

## 4→5의 미해결 의미

관측한 4화 선택 `ep04_i04_distance.choices`는 `retort → ep04_c056`, `distance → ep04_distance_free`다. `free.goals.ep04_keep_distance`는 `effects.flags.ep04_distance_kept=true`, `next=ep04_distance_c056`이며 hit와 mixed 모두 거리 확보 성공이다. mixed의 가격 `ep04_distance_free_strain`은 `정신력 > 0`일 때 정신력 -1인 별도 비용이다. miss는 `ep04_c056` 근접 경로로 간다. 거리 요구를 선택했다는 사실만으로 성공을 추정하지 않고 실제 결과·로그·종료를 본다.

성공 경로는 `ep04_distance_c056`~`ep04_distance_c063`을 거쳐 `ep04_distance_boundary`에 이르며 마지막 눈동자 칭찬까지 손이 닿지 않는 거리를 유지한다. 두 경로 모두 실제 칭찬 뒤 `ep04_eye_praise`를 설정한다. 현재 근접 종료와 거리 종료는 배경·대사·요약·next_hook도 다르다.

현재 5화 c001은 “은발 남성이 아시나에게 몸을 숙여 입을 맞추고 있다.”이고 c003은 두 입술이 맞닿아 있다는 서술이다. 최신 경계 감사의 4→5 원작 근접 설명은 원작 경로의 근거이며 모든 플레이 결과의 공통 결말이 아니다. 거리 성공이나 실제 거절을 `ep04_boundary`로 재분류하거나 `ep04_distance_kept`를 지우고 이 도입을 재생하면 선행 성공을 취소한다. 거리·거절을 존중하는 도입과 이후 문답의 연속성이 정해지기 전에는 해당 연결을 확정할 수 없다. 현재 YAML에는 그 대체 도입이 없다.

## 5→6 인사와 6화 감사

관측한 5화 c055는 시선 답변 뒤 지난밤 답변·되물음을 각각 발화하고 `ep05_시선답변`, `ep05_지난밤답변`, `ep05_지난밤되물음`을 설정한다. `ep05_reply_short`는 시선 답변만 발화하고 `ep05_시선답변`만 설정한다. 두 경로는 같은 `ep05_boundary`에 도달하므로 ending ID 하나로 실제 대화 내용을 판별할 수 없다.

5화 c055와 6화 c001 원문 전사는 둘 다 보존한다. 이미 발화한 인사는 연속 플레이에서 한 번만 재생한다. 실제 플래그와 `spoken`·로그를 계승하고, 짧은 답변에서 하지 않은 안부를 플레이어 대신 생성하지 않는다. c001을 무조건 재생하거나 무조건 c002로 건너뛰는 단일 규칙은 두 경로를 모두 충족하지 못한다. 표의 c002 진입은 기존 기능이 아니라 조건부 통합 제안이다.

`docs/continuation/ep06/transcription-audit.md`와 `docs/continuation/source03-10-audit.md`는 원본 16/16장·65/65컷 재대조와 29컷 정정을 기록한다. 정정 대상은 c001·c007·c008·c011·c024~c027·c029·c032·c046~c049·c051~c065다. **이 기록의 존재는 현재 YAML이 모두 반영됐다는 증거가 아니다.** 관측한 YAML c001에는 “잘 지냈다 마다요.”·“평안 하셨는지요?”가 남아 있으나 최신 전사는 “잘 지냈다마다요.”·“평안하셨는지요?”다. 현재 수정 담당 `st_01a1be16`의 29컷 전체 반영과 컷 밖 풍선·화자·비공개 정보 경계 검증이 끝나야 6화로 들어가거나 6화에서 나가는 연결을 확정할 수 있다.

## 기존 구현과 저장 계약

관측 `app/src/engine/continuation.ts`의 `BOUNDARIES`는 다음 세 항목뿐이다.

| 실제 beat 키 | 요구 ending | 기존 choice |
|---|---|---|
| `e_survivor` | `survivor` | `continue_chapter` |
| `e_curious` | `curious` | `continue_chapter` |
| `ep02_court_boundary` | `ep02_court_boundary` | `continue_ep03` |

`loadCampaignScenario`는 기본 ID가 `ep01_desert`일 때 2화와 3화를 읽고 3화까지만 합친다. 다른 ID는 그대로 반환한다. 따라서 4~10화 독립 종료 저장을 현재 도우미가 연결한다고 주장할 수 없다. 합성 캠페인은 기본 `id`·`start`·`sheet`를 유지한다. `connectChapter`는 비트 중복, 서로 다른 동일 자산 정의, `sheet.items` 정의의 불일치를 거부한다. `sheet.items`는 실제 플레이 중 회수된 소지품 목록이 아니다.

현재 `connectChapter`는 지정 경계의 ending을 제거하고 `후속_시작=true` 효과, `choices:[{id,text:'계속',next:chapter.start}]`, `next:chapter.start`를 부여한다. `connectAtlas`는 기존 좌표를 옮기지 않고 노드·장·선을 합치며 경계 노드의 `ending:false`와 실제 도착 노드로 향하는 선을 추가한다. 이 동작을 일곱 경계에 확장하는 것은 제안이며 현재 구현은 아니다.

`resumeCampaign`은 저장 beat가 등록 경계이고, 저장 ending이 정확히 일치하고, 현재 합성 beat에 해당 choice가 있을 때만 `structuredClone(saved)`의 `ending=null`, `후속_시작=true`로 바꾼 뒤 `engine.act(... choose ...)`를 한 번 실행한다. 경계의 이미 읽은 줄·효과를 다시 enter하지 않는다. 일반 중간 저장이나 미등록 종료는 `engine.resume(saved)`, `continued:false`로 복원한다. 새 경계가 `BOUNDARIES`와 합성 시나리오 양쪽에 등록되지 않으면 예전 종료 저장의 자동 이어하기는 생기지 않는다.

`app/src/engine/save.ts`의 저장 형식은 `v:1`, `meta`, `state`, 선택적 `view`다. `assertState`는 저장 `scenario`가 로드한 시나리오 ID와 같고 beat가 존재하는지 검사한다. 일반 호환 처리는 없는 행운=0, 옛 능력치 체력→근력, 없는 체력·정신력 트랙의 기본값, 옛 판정 기록 stat 변환, 없는 recent=[]다. 이 처리는 화간 진입 시 소지품·변장·이름·사적인 기억을 초기화할 근거가 아니다. 독립 `ep04_night` 저장을 `ep01_desert` 캠페인으로 읽는 범용 ID 변환도 없다.

`Engine.newGame()`은 시트의 트랙·능력·소지품과 빈 flags·said·로그로 새 판을 만든다. 따라서 이어하기에 사용하면 안 된다. 실제 `items`, tracks의 귀찌 잔여값, flags에 기록된 변장·복장·공개 이름·플레이어 기억, said·spoken·로그·난수·자유 입력 상태를 기존 저장에서 보존하고 실제 후속 비트의 효과만 적용해야 한다. 이름을 알고 있는 판의 기억을 지우거나 관객 전용 `독자_*` 정보를 등장인물의 지식으로 승격시키지 않는다.

현재 실제 진입 효과도 구분해야 한다. 4화 c001은 `magic_bag`·`map`을 lose하며 `ep04_started`·`ep04_active`를 설정한다. 7화 c001은 `후속_시작`·`ep07_시작`, 청록복 false와 분홍녹색복·얼굴가리개 true를 설정한다. 9화 c001은 `magic_bag`·`map`을 lose하고 `후속_시작`·`ep09_시작`을 설정한다. 10화 c001은 `ep10_시작`을 설정한다. 표에 적은 상태 보존은 이 기존 효과가 없다는 뜻이 아니며, 실제 7화 일부 반환 상태와 9화 lose가 정당한지 통합 담당이 확인해야 한다. 원문은 반환품 전체 목록을 확정하지 않는다.

서버 `app/src/server/main.ts`의 `/api/load`는 `readSave` 뒤 `resumeCampaign`을 호출한다. `continued:true`이면 예전 종료 화면 `view`를 반환하지 않고 새 step을 쓰며, 저장 메모는 유지한다. 일반 복원은 저장 view를 유지한다.

읽은 회귀 계약은 `app/tests/continuation.test.ts`, `app/tests/continuation_ep03.test.ts`다. 기존 경계·실패 종료 분리, 기본 시트·ID 유지, 장간 지도 연결선, 예전 종료 저장에서 choice 한 번과 새 장 첫 비트 한 번, 트랙·난수·사적 플래그 보존, 중간 저장의 효과 중복 적용 방지를 검증하는 코드가 있다. 이번 조사에서는 테스트를 실행하지 않았으며 4~10화에 이 검증이 이미 있다는 뜻도 아니다.

## 지도 열과 미해결 조건

독립 파일의 실제 열 범위는 3화 18~31, 4화 32~44, 5화 0~16, 6화 0~18, 7화 60~69, 8화 0~12, 9화 0~13, 10화 0~18이다. 표의 좌표는 보정 전 관측값이다. 현 `connectAtlas`는 열을 재배치하지 않으므로 그대로 합치면 5·6·8·9·10화의 열이 앞쪽으로 되돌아간다. 통합 배치의 오프셋·열 범위는 아직 정하지 않았다. 장 ID는 모두 고유하며 마지막 노드의 `ending` 필드와 실제 beat ending은 별개다. `buildAtlas`는 실제 beat.ending을 보고 화면의 종료 여부를 계산한다.

남은 통합 조건은 다음과 같다.

- 4→5 거리 성공·거절을 취소하지 않는 별도 의미 경로가 필요하다. 원작 근접 경로를 보편 경로로 취급하지 않는다.
- 5→6 실제 인사 유무를 보존하는 두 경로 처리와 6화 최신 29컷 전체 감사 반영이 필요하다. 수정 중인 현재 스냅샷의 완료를 선언하지 않는다.
- 일부 짐 반환·압수와 9화 진입 lose를 실제 저장에 대조해야 한다. 10화의 배경 가방으로 재고를 임의 복구하지 않는다.
- 9→10은 문서로 확인된 장면 생략만 허용하며 사이의 공격·포획·귀환을 발명하지 않는다. 사적인 기억과 독자 정보의 공개 경계를 유지한다.
- 새 경계의 종료 저장 마이그레이션·지도 연결·열 배치는 실제 통합 뒤 확인해야 한다. 현재 도우미의 범위는 3화까지다.

근거 문서: `docs/continuation/source03-10-audit.md`, 각 `docs/continuation/ep03`~`ep10/continuation.md`, `docs/continuation/ep06/transcription-audit.md`, `docs/continuation/build/ep05/bridge.md`. 과거 build 문서에 남은 “원작 경계 미대조” 문구보다 최신 원문 감사의 대조 결과를 우선하되 이를 실행·저장 검증 완료로 바꾸지 않았다.

이 조사에서는 허용된 새 문서와 새 JSON만 작성했다. YAML·엔진·테스트·부모 소유 `campaign-bridges.md`는 수정하지 않았고 서버·모델·브라우저·전체 테스트·커밋·코드레빗은 실행하지 않았다.
