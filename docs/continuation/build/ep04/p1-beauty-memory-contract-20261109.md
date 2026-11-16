# P1 외모 회상 수정과 범위 정정

상태: **4화 데이터 수정·집중 검증 완료**. 저장 위조·이식 플래그 음성 사례는 재위임 과정에서 추가된 조건이며 원래 리드 요청이 아니었다. 이를 수용 기준에서 제거했다. 이전 보고의 새 공유 조건 API 필요·수정 차단 결론은 철회한다.

## 원인과 최소 수정

원시 기록은 `work/continuation/qa/real-1794206518713/canonical_first.jsonl`이다. 실제 행동3은 무해함을 호소한 plead 입력이었다. 행동0~7에서 미인계 자기소개·외모 조롱은 전달되지 않았지만, 행동21의 c057·c058과 거리 변형은 원작 회상을 무조건 재생했다. c047의 현재 궁정 발언과 미래 c061은 사막 미인계 이력으로 삼지 않았다.

`app/content/ep04_night.yaml`의 원작·거리 c057 질문을 기존 `flag:미인계 || flag:미소녀`로 제한했다. 현대 beauty 목표의 성취 플래그와 기존 beauty 접근의 발화 플래그를 그대로 사용한다. 낱말 목록·새 플래그·과거 사건·내레이션은 추가하지 않았다.

두 플래그가 모두 없으면 c057에서 c059로, 거리 c057에서 거리 c059로 바로 간다. c058의 텍스트뿐 아니라 scene·bg·CG가 전부 전달되지 않는다. 근거가 있으면 원작 c057 질문과 c058 두 줄은 그대로 재생한다.

`ep04_wet_known`은 회상과 무관한 옷 인식이므로 두 c057의 기존 무조건 발화 `지, 지금 대체 어딜 보는…!` 줄로 sets를 옮겼다. 효과를 없애거나 회상 조건에 종속시키지 않았다. c040·c041·c042 공개, 수치, 다음 장 경계, 거리 성공·대가·종료는 변경하지 않았다.

## 기존 플래그와 실제 플레이 검사

- 기존 beauty는 `b05_why.free.approaches[id=beauty]`다. beat.choices로 취급하지 않았다. 접근 버튼을 실제 실행하여 미인계 발화와 효과를 얻은 판을 검사했다.
- 현대 행동 경로는 실제 Engine.newGame에서 시작해 beauty 목표의 행동 입력을 실행했다. 미인계=true, 미소녀 없음 상태에서도 회상을 유지한다.
- 발화 경로는 실제 b05 입력 `미소녀니까요.` 뒤 plead로 진행했다. 미인계 없음, 미소녀=true인 판도 회상을 유지한다.
- 미인계 없는 실제 행동20 획득 저장에 기록의 행동21 retort를 그대로 재생했다. 원문 회상 질문·c058 장면·배경·CG가 전달되지 않고 젖음 인식·공개 플래그·수치·4화 경계를 보존한다.
- 미인계 없는 거리 목표의 hit와 mixed에서도 회상 없이 거리 성취와 눈동자 칭찬을 유지한다.

양성 경로는 플래그를 테스트에 직접 심지 않고 실제 입력과 접근을 통해 획득했다. 추가했던 위조 저장 요구는 테스트하지 않는다. 검사에 실제 모델은 쓰지 않았다.

## 그림 대응 보충

기존 `art/매핑-초안.md`·manifest·자산은 수정하지 않았다. 그 대응표에 대한 이번 데이터 변경의 보충 계약은 다음과 같다.

| 대상 | 현재 YAML과 그림 통합 계약 |
|---|---|
| 원작 c057 줄0 | 원작 c057 source 그림을 그대로 표시한다. 예정 a_wet 그림은 젖은 옷 인식이다. |
| 원작 c057 줄1 | 항상 표시하고 wet_known을 적용한다. 회상 유무와 무관한 현재 장면이다. 예정 b_approach로 쪼갤 때는 이 무조건 줄을 접근 그림의 시작 대상으로 삼아 실제 접근을 회상 질문에 종속시키지 않는다. |
| 원작 c057 줄2 | 기존 원문 질문·source CG는 유지하되 beauty 근거가 있는 경우만 표시한다. |
| 거리 c057 줄0·1 | c055 얼굴을 그대로 유지하며 줄1에서 wet_known을 적용한다. 가까이 눕히는 그림으로 바꾸지 않는다. |
| 거리 c057 줄2 | 같은 beauty 조건이며 c055 얼굴을 유지한다. |
| 원작·거리 c058 전체 | beauty 근거가 없으면 비트 자체를 건너뛴다. source CG·현재 stage 배경·예정 ep04_c058 회상 그림도 음성 경로에 넣지 않는다. |
| 이후 c059~c063 | 기존 원작·거리 경로별 그림과 원문을 유지한다. |

현재 실행 CG ID·자산 파일은 바꾸지 않았다. 기존 c057 원작 전체 source 그림은 무조건인 앞 두 줄에도 있어 음성 경로에서 현재 장면 그림이 사라지지 않는다. 예정 분할 그림을 연결하는 쪽에서는 위 줄1 대응 보충을 적용해야 한다. 그림 재생성·자산 변경·native 생산자 조작은 하지 않았다.

## 명령과 증거

저장소 루트에서 app으로 이동한 뒤 실행했다.

수정 전:

`bun test ./tests/ep04_beauty_recall.test.ts --timeout 10000`

종료 코드 1, **3 통과·2 실패**. 실제 미인계 없는 획득 저장과 거리 경로가 c058 CG 전달 때문에 실패하고 세 beauty 양성 경로는 통과했다. 원본 출력은 `p1-beauty-before-20261109.txt`다.

수정 후:

`bun test ./tests/ep04_beauty_recall.test.ts ./tests/ep04_night.test.ts --timeout 10000`

종료 코드 0, **17 통과·0 실패·622 검증**, 253ms. 실제 loadScenario 파싱·원문 대응·독립 ID·공개·자산·지도·거리 보존 검사를 포함한다. 원본 출력은 `p1-beauty-after-20261109.txt`다. 전체 저장소 테스트는 실행하지 않았다.

엄격 타입 검사:

`/Users/choeminju/.bun/bin/tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --noImplicitOverride --noFallthroughCasesInSwitch --verbatimModuleSyntax --allowImportingTsExtensions --target ESNext --module Preserve --moduleResolution bundler --lib ESNext,DOM,DOM.Iterable --types bun ./tests/ep04_beauty_recall.test.ts ./tests/ep04_night.test.ts`

TypeScript 6.0.3, 종료 코드 0, 진단 출력 없음. skipLibCheck나 오류 억제는 추가하지 않았다. 출력 파일은 `p1-beauty-typecheck-20261109.txt`이며 정상 무출력으로 비어 있다.

## 변경 파일과 남은 경계

- `app/content/ep04_night.yaml`: 두 질문 조건·두 회상 우회·두 wet_known 위치만 수정.
- `app/tests/ep04_beauty_recall.test.ts`: 이번 P1 집중 회귀 5건 추가.
- 이 새 보고서와 위 실행 출력 3파일.

공유 엔진·ep01·GM·lore·서버·UI·기존 그림 대응표·자산은 변경하지 않았다. 생산자 4/5/6/8/root와 st4f를 재시작하거나 조작하지 않았다. 커밋·crq는 실행하지 않았다. 실제 모델·브라우저의 현재 화면 시점·완성 분할 그림 연결은 이번 엔진 검사의 범위 밖이다.

## 테스트 자료 소유권 보완과 최종 실행

위 17개 검사와 타입 검사 기록은 회상 데이터 수정 직후의 기록이다. 이후 부모 검토에서 회귀 테스트가 Git 무시 대상인 `work/` 원시 로그 전체에 의존하는 결함을 확인했다. 승인된 YAML은 바꾸지 않고 테스트 자료 소유권만 수정했다.

- 새 필수 fixture: `app/tests/fixtures/ep04_beauty_earned_state20_action21.jsonl`
- 원본: `work/continuation/qa/real-1794206518713/canonical_first.jsonl`
- 원본 전체 파일 SHA-256: `533a48fda215d1df1fa1b87e30e36c19cd22914546a145a7e4e406c03ca17baa`
- 추출 기록: 원본 JSON 기록 1228행의 `state/action=20`과 1243행의 `action/action=21`, 두 개뿐이다.
- fixture SHA-256: `cd792bf0357f4519735437daee8b4b09b94d205df18673140fbe3b255bd71329`
- fixture 크기: UTF-8 54,529바이트. 획득 상태 내부 이력·플래그·프롬프트를 잘라내거나 가공하지 않았다.

fixture를 실제로 다시 읽고 원본의 두 기록과 **JSON 의미 동등성 및 추출 행 바이트 동등성을 한 번 검증하여 통과**했다. 전체 원시 로그 3278개 기록을 복사하지 않았다. `GIT_MASTER=1 git check-ignore --no-index -v -- app/tests/fixtures/ep04_beauty_earned_state20_action21.jsonl`은 종료 코드 1·출력 없음으로 Git 무시 대상이 아님을 확인했다.

`app/tests/ep04_beauty_recall.test.ts`의 필수 입력 경로 한 줄만 fixture 경로로 바꾸었다. 다섯 테스트 본문과 assertion은 변경하지 않았다. 원본 `work/` 파일로 돌아가는 대체 경로나 가짜 상태는 없다. 원시 파일은 추출·동등성 검증 때만 읽었으며 테스트 실행의 의존성에서 제거했다.

최종 재실행:

```sh
cd app
bun test ./tests/ep04_beauty_recall.test.ts --timeout 10000
```

종료 코드 0, **5 통과·0 실패·63 검증**, 153ms. 출력: `p1-beauty-portable-test-20261109.txt`.

```sh
/Users/choeminju/.bun/bin/tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess --noImplicitOverride --noFallthroughCasesInSwitch --verbatimModuleSyntax --allowImportingTsExtensions --target ESNext --module Preserve --moduleResolution bundler --lib ESNext,DOM,DOM.Iterable --types bun ./tests/ep04_beauty_recall.test.ts
```

종료 코드 0, 진단 출력 없음. 출력: `p1-beauty-portable-typecheck-20261109.txt`이며 정상 무출력으로 비어 있다.

자료 소유권 수정 이후 기존 `ep04_night.test.ts` 12개나 전체 검사·실제 모델은 재실행하지 않았다. 이번 추가 변경은 테스트 입력 경로 한 줄, fixture 한 파일, 이 보고서와 최종 실행 출력 두 파일이다. 승인된 YAML·서버·생산자·자산·다른 코드에는 손대지 않았다.
