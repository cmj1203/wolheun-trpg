# wolheun-episodes03-10 재개

2026-11-09. 봇이 32만 토큰 레인을 새 세션으로 옮기라고 지시했다. 새 단계는 시작하지 않고 현재 상태를 남긴다. 완료/READY 보고가 아니다.

## 이동 직전 추가 도착 — 아래의 이전 상태보다 우선

- 리드 독립 Claude 최종41후보 검수: `docs/continuation/build/ep03/art/independent-final-qa.md`, 39PASS/2FAIL. **045와036_exact는 수정·재검수 전 연결 승인 아님.**
- `ep03_c045.png`: 원작 없는 왼쪽 흰 소매/회색 옷 인물 조각, 오른쪽 붉은 금장 침대가 생김. 왼쪽 원작 파란 커튼/문과 같은 방040/048/050의 파란 침대에 맞춰 해당 후보만 최소 교정해야 한다. 현재 부모 YAML은045를 아직 최종 후보에 연결하지 않아 source045를 사용한다.
- `ep03_c036_exact.png`: 가운데 그림 상단에 첫 그림 머리 조각이 크롭에 딸려 남음. 해당 조각 아래로 크롭 상단 경계를 옮겨 원본을 보존한16:9로 수정한다.
- 050은 부모2차 검수 FIX와 독립 검수 PASS가 충돌한다. 정확한 최종 파일·수정 이력·이전 지적·원본을 대조해 남은 차이가 없는지 설명해야 한다. 무조건 PASS로 덮지 않는다.
- 040/055는 그림 PASS와 실제 대사 전환 시점 검증을 별개로 유지한다.
- 설치는 007_r2/012_exact/033_exact/036_exact 중 최신 재검수 승인 파일을 명시한다. 옛 반려007/012/033/036을 glob으로 자동 선택하지 않는다. 이미 승인된 동일 파일 전체를 재검수/재생성하지 않고 변경 대상만 보낸다. 후보만 고쳐 설치/매핑 차분을 보고한다.
- 5화 담당 완료 도착: `app/content/ep05_audience.yaml`, `ep05_c001`→`ep05_c055` 또는 짧은 답 분기→`ep05_boundary`. next_hook은 “알현실에서 라 쿤의 다음 말을 기다린다.”로 실제 종료 의미를 담아 고쳤다. 단독 적재/검사 오류0, 전용15통과/524단언, 이후 YAML 수정 없음. `ep05/evidence.md`를 부모가 읽었다. 리드에게 안정화 신호를 보낸 뒤 전역 시험 재개는 리드가 조율한다.
- 신규5~10 lore 담당 완료 도착: `shared-lore-ep05-10.patch`, `shared-lore-ep05-10-contract.md`. 로어 파싱/공개 경계/기존 설정 보존 통과. 기존 withNotes 오류·alias 충돌·CG 의존·원문 미확정은 계약서에 남았다. 기준 스냅샷에는 이미3~4 분리 gate와8인물 정의가 반영되어 있으므로 실제 live 적용 기준을 다시 확인한다. 부모가 계약 첫부분을 읽었다. 이 패치는 새 지식10개·인물8개 추가이며 source6 재교정과 모델 QA는 여전히 남는다.
- 마지막으로 진행 중이던5화/lore 하위 작업도 위 완료 응답을 보냈다. 추가 범위 없이 종료했다.

## 먼저 읽을 것

- 브리프 `/Users/choeminju/.dori/briefs/wolheun-episodes03-10.md`.
- `~/.claude/CLAUDE.md`.
- 이 문서와 현재 todo. 새 세션에서 실제 작업 목표를 다시 걸고 이어 간다.
- 리드에게 보고: `DORI_HOME='/Users/choeminju/.dori' bun '/Users/choeminju/dori-superagent/src/cli.ts' report wolheun-episodes03-10 --text '...'`.
- 커밋·푸시·crq는 리드 담당. 사용자에게 직접 질문하거나 테스트를 넘기지 않는다.
- 공유 엔진/types/GM/UI/원작 정리 문서는 읽기 전용. 정확한 통합 패치는 `docs/continuation/build/`에 낸다.

## 현재 우선순위

1. 5화 작성 담당이 `ep05_boundary.ending.next_hook` 빈값을 실제 5→6 종료 의미로 고치고 단독 파서/전용 시험 결과를 보내면 리드에게 즉시 전달한다. 리드의 전역 시험 재개가 이 신호를 기다린다. 가짜 글로 검사만 맞추지 않는다.
2. 리드/공유 owner의 `shared-dialogue.patch` 적용 신호를 받아 3화 선택적 자유 대화 선언·CG 배우 마커·custom 후속 비트·지도·회귀를 반영한다. 패치 자체는 이미 리드에게 제출했다.
3. 3→4 실제 렌더 검증을 우선한다. 현재 3화 72줄까지 실제 화면 기록을 만들었다. 끝까지 진행·실제 입력·저장 렌더는 아직 미완료다.
4. 6화는 source 재교정 확정 뒤 대사·기억·공개·조건을 동기화한다. 기존 67개 시험 통과는 원문 정확성 증거가 아니다.
5. 모델 18196은 continuation 담당이 heavy 하나로 준비 중이며 아직 READY가 오지 않았다. 추가 모델 시작 금지. 18192 재점유와 사용자 18080/18081 접근 금지.

## 독립 산출물

| 화 | 실제 파일 | 확인한 내부 검사 | 남은 것 |
|---|---|---|---|
| 3 | `app/content/ep03_palace.yaml` | 61비트, 고정 비판정 선택 2곳. `ep03_palace.test.ts` 10통과/0실패. 이후 부모가 CG 경로·지도 열·새 lore alias를 바꿨으므로 최종 선언 변경 후 재검증 필요 | 선택적 직접 대화, 나머지 최종 CG 연결, 전편 화면·모델·저장 |
| 4 | `app/content/ep04_night.yaml` | 84비트, 63컷+보충 풍선. 전용 시험 12통과/0실패/559단언. 지도 32~44열. 즉시 타입 진단은 시간 초과 | 공유 lore/대화 통합, 그림, 캠페인·화면·모델 |
| 5 | `app/content/ep05_audience.yaml` | 이동 직전 종료 빈값 수정, 단독 오류0·전용15통과/524단언 | 리드 안정화 신호, 연결·그림·화면·모델 |
| 6 | `app/content/ep06_library.yaml` | 65컷/73비트, 6개 비판정 선택, 34개 줄 공개. 전용 67통과/0실패 | source 교정 중. 원본 전수 대사 검독·전체 타입 검사 미완료 |
| 7 | `app/content/ep07_harem.yaml` | 63컷/118발화, 행동8검사 통과 | 연결·자유 대화·완성 그림·화면·모델 |
| 8 | `app/content/ep08_harem.yaml` | 62컷/103발화. 빈 sheet 문제를 canonical ep02 sheet 전체 일치로 고친 뒤 4검사 통과 | 연결·자유 대화·완성 그림·화면·모델 |
| 9 | `app/content/ep09_palace.yaml` | 84컷/70비트, 행동6검사 통과 | c042 발화 방식 미확정, 연결·그림·화면·모델 |
| 10 | `app/content/ep10_internal.yaml` | 현재 88비트. 부모가 가짜 손목 판정을 제거한 뒤 4통과/0실패/704단언, 엄격 tsc 종료0 | 9→10 공백, 그림·화면·모델 |

각 화 `docs/continuation/build/epNN/`의 실제 문서·시험 출력을 읽어 인수한다. 다시 돌릴 필요가 없는 통과 검사는 반복하지 않는다.

## 10화에서 직접 고친 의미 결함

기존 손목 hit/mixed/miss는 모두 왕이 손을 놓아 목표 결과가 같았다. mixed의 `ep10_breath`는 미사용 `ep10_대답지연` 표시뿐이었다. 리드 지적에 따라 부모가 원작 c058~c070·실제 분기를 읽고 판정을 제거했다.

- `ep10_withdraw`: 실제 손목을 빼며 물러서는 서술 → `ep10_distance_success` → 거리 유지 대화 → 종료.
- 가짜 시간 비용·미사용 표시·실패 비트와 지도선을 삭제. 새 해악을 만들지 않음.
- 새 회귀를 수정 전 실행: 기대 `ep10_end`, 실제 `ep10_withdraw`, 3통과/1실패, 종료1.
- 수정 후 같은 시험 4통과/0실패/704단언, 75ms. 시드 1·7·19에서 roll/price 없음, 난수·수치·아이템 보존, 입맞춤 없음, 거리와 눈색 대화 유지.
- `tsc --ignoreConfig --noEmit --target ESNext --module Preserve --moduleResolution bundler --strict --noUncheckedIndexedAccess --noImplicitOverride --verbatimModuleSyntax --allowImportingTsExtensions --types bun ./tests/ep10_internal.test.ts` 종료0.
- 관련 integration/decision_atlas/verification 문서도 갱신했다. 더 고치거나 검사를 반복할 이유가 없으면 이 부분은 끝났다.

## 공유 패치

- `shared-lore.patch`, `shared-lore-contract.md`: 리드 제출 완료. 하렘 `ep03_하렘_앎`, 4화 본명 `ep04_name_known`, 통치자 `ep04_ruler_known`, 칭호 `ep04_title_known`. 기존 시하드 호칭·나라·감옥 잠금 보존. 안내 시녀와 누르를 동일시하지 않는다.
- 신규 3화 lore에 맞춰 부모가 `ep03_시녀→안내 시녀`, `ep03_목욕시녀→목욕 시녀`, `ep03_보고자→청록 터번 보고자`, `ep03_시종→알림 시종`을 이미 연결했다.
- `shared-dialogue.patch`, `shared-dialogue-contract.md`: 정확한 패치 완성·리드 제출. 공유 live는 수정하지 않았다. 격리 행동22검사·타입·패치 적용 검사 통과. 실제 UI/모델 미검증.
- 선언은 `beat.conversation`과 `cast.presentation: cg`. 기존 choices는 유지하고 free를 추가하지 않는다. 현재 장면의 직접 말/즉각적 괄호 몸짓은 전용 대화 문맥으로 받는다. 주사위·가격·이전 free·세계 무브로 보내지 않는다. custom 후속은 미선택 항의/질문을 재생하지 않는다. 빈 응답/fallback은 성공 대화가 아니다.
- 완전한 YAML 예·두 custom 후속·atlas 변경·부모 시험 타입 한 줄 수정은 계약서에 있다. 기존 parser는 새 CG faces를 지원하지 않으므로 공유 owner 적용 신호 전에 3화 live YAML을 반쯤 바꿔 전체 파싱을 깨뜨리지 않는다.
- `shared-lore-ep05-10.patch`와 계약서는 별도 담당이 작성 중. 기존 3~4 패치를 수정하지 말라고 전달했다.

## 원작 상태

원문 3~10화 8/8 문서는 도착했지만 고증/인접화 QA 전체 완료는 아니다.

- 최신 3화 `docs/continuation/ep03/wardrobe-audit.md`는 원본146크롭 재감사다. c020 남색·무터번, c053 흰 터번·크림복을 분리했다. 신발은 청록·회청 바탕+금테다. 이미 원작에 맞는 후보를 다시 그리지 않는다.
- c033 비한글 치부책 문양과 c054 흘림풍선2개는 원본·이웃 컷·PSD 문자/픽셀 레이어까지 재확인했지만 뜻/화자 미확정. `ep03/art/원문감사.md`, `글자레이어.json` 근거.
- 6화 부모 제작 담당이 c024/c025 오독과 “라 쿤께서는 좋으시겠습니다.” 누락을 실제 원본에서 발견해 구현에 반영했다. `ep06/source-corrections.md`. source가 추가 c026/c052/c054~065 불일치를 발견해 교정 중이다. 교정 완료 신호 뒤 동기화하고 이 구간 새 CG를 확정하지 않는다.
- 5화 c004 화자·누르하 뜻 미확정. 피부를 흰 옷으로 오독한 부분은 최신 source에 교정됐다.
- 7화 짐 일부 반환은 전체/치부책 반환이 아니다. ep07은 c003에서 기존 미반환 fact, c001에서 청록복 fact를 종료했다.
- 8화 c012 무언 풍선 화자 미확정, 아슈마에/이슈마에 표기 차이 보존.
- 9→10 밤 탈출·칼→목욕 사이에 새 공격/포획/귀환을 창작하지 않는다. c042의 불확실한 발화는 청자 지식에 넣지 않는다.

## 3화 그림

원작 검증 입력 61컷: `assets/ep03/gen/source/ep03_cNNN.png`. 최종 Astra 편집 자산과 혼동하지 않는다. `work/` 원본 경로는 서버가 제공하지 않아 부모가 assets 경로로 교체했다.

생성 결과와 매핑: `docs/continuation/build/ep03/art/매핑.md`, `재개인계.md`.

- 1차 Claude 실제 대조: `claude-review-01.md`, 9 PASS/2 FIX. 부모 YAML은 이때 PASS한 001,002,003,005,008,010,014,016,017만 최종 후보에 연결했다. 3→4는003, 5→6은005, 10→11은010, 14→15는014, 17→18은017을 유지한다.
- 2차 Claude: 하위 작업의 마지막 응답은 오류였지만 완성 보고서 `claude-review-02.md`와 비교 그림이 있다. 보고서 기준 31 PASS/3 FIX. 007_r2·012_exact·033_exact·036_exact는 PASS. 033/036 원 후보는 FIX이고 exact 대체를 제시했다. 050은 장면 순서 반전·쿠션을 책으로 바꿔 FIX. 040/055는 아래 전환 시점 조건부 PASS.
- exact 파일의 실제 제작 경로는 검토 필요하다. 보고서는 원본 픽셀 배치/흐림 확장을 설명한다. Astra 완성 자산이라는 출처를 근거 없이 단정하지 않는다.
- 046 후보는 아직 없다. `c046-생성3.log` 마지막에 invalid_image_file 뒤 입력 sexual 안전 필터 차단이 기록되어 있다. 같은 차단 입력을 재시도하거나 우회하지 않는다. 아직 대본은 원작 검증 컷이다. 원작 장면을 유지하는 허용 가능한 CG 연출을 판단해야 한다.
- 040: “여기로.”부터 불안 독백은039 회랑을 유지하고 “자,” 뒤 침실 실제 공개 때040을 보여야 한다.
- 055: 하렘·소문 발화는054의 온전한 석류를 유지하고 소문 발화 뒤 파열055를 보여야 한다.
- 위 내부 전환 두 곳은 아직 부모 YAML에 적용하지 않았다. 부모 기존 구성은 같은 컷 전체 CG를 유지하므로 미래 하위 그림이 일찍 보일 수 있다.
- 아직 연결하지 않은 PASS 후보를 전부 다시 그리거나 첫 검수를 반복하지 않는다. 알려진 FIX·조건부 전환만 고친다.

## 실제 서버와 에고

- 앱 포트18241, 모델 없음, canonical `app/content/ep01_desert.yaml`로 기존+2+3 자동 합성을 사용한다.
- 마지막 확인 PID63766. 감시 `mon_5FF6TVEWCMWM1HBD`, 터미널 `bash_18`, `persistent:true`.
- 처음 `persistent` 없는 감시는 기본 기한에 서버를 종료했다. 기한 없는 감시로 고친 상태다. 새 세션은 포트/health를 먼저 확인하고 중복 서버를 띄우지 않는다.
- 모든 런타임 저장/지도/로그/피드백: `work/continuation/episodes/run/` 아래.
- 에고 전용 공간 ID11, 이름 `월흔 3화 레인 PC 검증`, 페이지 `p1`. 사용자 공간은 접근하지 않았다. 재개할 때 기존 공간을 사용하고 성공 종료 때 `finish({keep:[]})`.
- 일반 속도: 실제 불러오기 → 2화 끝 계속 → 3화 진입 → c002의 “아가씨.” / “따라오세요.”를 조작·촬영했다. 첫 CG는 부모가 직접 그림으로 확인했다.
- 저장 fixture `qa_ep03_boundary`와 `slot1`은 전체 canonical 엔진/저장 API로 만든 명시적 2→3 경계 QA 상태다. 선행1~2를 실제 입력으로 끝까지 진행한 판이라는 뜻이 아니다.
- UI는 slot1/slot2/slot3만 보여 준다. 제목 화면은 topbar 불러오기가 inert이므로 `이어하기`로 연다. 불러오기 dialog가 닫힌 뒤 API/대사 렌더는 아직 진행 중일 수 있어 실제 대사 표시를 기다린 후 Space를 누른다.
- 빠른 표시 URL `http://127.0.0.1:18241/?fast=1`. 정상 속도 사진은 따로 남겼다.
- 마지막 실제 화면은 c044의 “남자가 여자를 단체로 집어넣고 자기 맘대로 갖고 논다는 그곳?” 다음 줄 직전이다. 빠른 모드 24줄씩 3묶음, 총72개 표시 기록. 현재까지 `cg.on=true`와 실제 backgroundImage가 모두 있으며 빈CG0.
- `work/continuation/episodes/run/ep03-render-fast.jsonl`: 실제 DOM 화자/대사/CG/장면/phase 기록. 괄호 독백은 화면이 붙이는 괄호를 포함한다.
- 실제 CG는 컨테이너 `#cg`가 아니라 `#cg-art.style.backgroundImage`를 기록해야 한다. #cg 클래스 동일성만으로 같은 이미지라고 증명하지 않는다.
- DOM `#stage.dataset.phase`, `#beat-title`, `#name`, `#text`, `#more`, `#choices`를 사용했다. fast 모드 Space마다 텍스트/화자/장면/CG 변경과 다음표시를 기다리면 실제 대사 24개씩 진행할 수 있다.
- 에고 각 호출이 새 프로세스이므로 JS 변수는 없다. 설치된 `ego-browser skill` 안내를 읽고 `ego-browser nodejs -e '...'`로 같은 공간11을 재개한다.
- `Emulation.setDeviceMetricsOverride` 뒤 DOM innerWidth1440/innerHeight900을 확인했다. 에고 저장 사진 실제 픽셀은1508폭이므로 CSS 폭과 파일 픽셀을 구별해 적는다.
- 실제 발견 결함: 3화인데 상단 칩은 `1화 · 사막 조우`로 남는다. 리드에게 scene의 atlas.chapter 기준 표시를 UI owner에 요청했다. 임의로 UI를 고치지 않았다.

사진은 실재 확인했다:

- `work/continuation/episodes/run/ep03-entry.png`
- `work/continuation/episodes/run/ep03-c002-line1.png`
- `work/continuation/episodes/run/ep03-c002-line2.png`

여러 사진을 부모가 연속으로 읽지 말고 Claude 검수에 맡긴다. 아직 위 두 c002 사진의 시각적 동일 CG 대조 보고서는 없다. 실제 두 번째 줄의 CSS 주소는 `/media/ep03/gen/ep03_c002.png`를 확인했다.

## 하위 작업

다른 세션에서 조율할 때 `task_send`의 `all_scope:true`가 필요할 수 있다. 기존 세션 자식의 task_output은 새 세션에서 안 보일 수 있으므로 산출 문서를 먼저 읽는다.

| ID | 담당 | 마지막 상태 |
|---|---|---|
| st_01a1be23 | 5화 YAML/시험/bridge | 이동 직전 완료, next_hook 의미 수정·단독0오류·전용15통과 |
| st_01a1be0f | lore 패치 | 기존3~4 및 신규5~10 별도 패치 완료. live/기존patch 미수정 |
| st_01a1be13 | 선택적 대화/CG 배우 패치 | 완료, 정확한 patch·계약·격리22검사 제출 |
| st_01a1be04 | 4화 | 완료, 12검사 통과, 타입 즉시진단 시간 초과 |
| st_01a1be16 | 6화 | 내부 완료 보고. source 전수 문장 정확성은 미완료 |
| st_01a1be0c | 7화 | 완료, 8검사 통과 |
| st_01a1be0e | 8화 | 시트 전체 일치 수정까지 완료, 4검사 통과 |
| st_01a1be0d | 9화 | 완료, 6검사 통과 |
| st_01a1be06 | 10화 | 초안 완료. 이후 부모가 의미 결함을 직접 고쳤으므로 최신 파일/verification이 우선 |
| st_01a1be0b | 3화 시험 | 초안 구조 10검사 통과. 부모의 후속 선언 변경 뒤 재검증 필요 |
| st_01a1be05 | 3화 그림 | 최종 응답 오류. 출력/비교 자료 존재. 생성 프로세스가 남았는지 확인 전 중복 실행 금지 |
| st_01a1be15 | Claude 그림 검수 | 1차 완료, 재개 2차 최종 응답 오류. 2차 완성 보고서와 비교 그림은 존재 |

## 완료 기준

독립 파싱/고정 선택 내부 시험을 전체 게임 READY로 세지 않는다. 실제 자유 입력·원작 전수 대사/복장·캠페인 연결·CG 동시 표시·관객 지식 격리·실제 모델·저장/지도 복원까지 확인해야 한다. 공유 코드 통합은 소유 레인/리드에게 요청하고 끝까지 증거를 남긴다.
