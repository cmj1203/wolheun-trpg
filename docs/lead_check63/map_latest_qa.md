# 분기 맵 최신 atlas.ts 실제 UI QA (noLLM, 데스크톱)

2026-11-09. 범위: display 기반 `currentRun`/`pairs`/`nextHint`가 엔진의 미리 처리된 상태가 아니라 화면에 보인 장면을 따르는지만 확인했다. LLM·이야기 품질·대화 기능 QA는 하지 않았다.

## 판정

**PASS** (요청한 세 상태 모두 관찰). 미확인 항목은 맨 아래에 적었다.

## 대상과 실행

| 항목 | 값 |
|---|---|
| atlas.ts | `app/src/engine/atlas.ts` |
| SHA256 | `5449df3fa1a2f1cfa83a88f285a02f9429f9fcee52d917aa326f23244cea796a` (기록: `work/continuation/map/latest-ui/atlas.sha256`) |
| 서버 | 포트 18195, `bun src/server/main.ts` (run.sh·heavy·모델 사용 안 함, 18080/18081/18192/18196 접근 안 함) |
| 브라우저 | ego-browser, 새 agent 전용 taskSpace 15 `월흔 최신 지도 UI QA 18195`, 뷰포트 1440x1000 데스크톱, 소리 없음 |
| 종료 | `task.finish({ keep: [] })` 완료, 내 서버(PID 20231)만 종료, 18195 닫힘 확인 |

서버 시작 명령(작업 폴더 `/Users/choeminju/월흔_trpg/app`):

```sh
WOLHEUN_PORT=18195 WOLHEUN_NO_LLM=1 \
WOLHEUN_SAVES=/Users/choeminju/월흔_trpg/work/continuation/map/latest-ui/saves \
WOLHEUN_LOGS=/Users/choeminju/월흔_trpg/work/continuation/map/latest-ui/logs \
WOLHEUN_ATLAS=/Users/choeminju/월흔_trpg/work/continuation/map/latest-ui/atlas.json \
WOLHEUN_FEEDBACK=/Users/choeminju/월흔_trpg/work/continuation/map/latest-ui/feedback.jsonl \
bun src/server/main.ts
```

서버 로그 첫 줄: `월흔 데모 서버: http://127.0.0.1:18195 (로컬 GM: 사용 안 함, 작가 대사로 진행)`.

## 실제 경로

주소 `http://127.0.0.1:18195/?fast=1&seed=2` → `#btn-new` → `#intro-skip` → `button[data-id=run]` → `plead` → `dodge` → `stare_back`(대사·판정을 `#dialog`/`#dice` 클릭으로 진행) → `continue_chapter` → 첫 감옥 장면 `낯선 돌바닥`에서 멈춤. 앱 상태·DOM은 건드리지 않았고 실제 버튼 클릭만 썼다. 플레이 중 맵은 `#btn-map-play`로 열었다. `block`은 쓰지 않고 `dodge`로 진행했다.

## 관찰한 세 상태

### 1. 챕터1 — `낯선 돌바닥`에서 멈춤, 1화 탭

화면 장면 제목: `낯선 돌바닥`(이후 대사 진행 전). 맵 열림 시 1화 탭이 선택돼 있다.

- 현재 노드: `낯선 돌바닥` ("현재" 표시, 사이드 `현재 위치 · 낯선 돌바닥`).
- 이번 판 선(금색): 사람?! → 왜지? → 마지막으로 남길 말인가 → 한여름의 태양 → 살아남은 자 → 낯선 돌바닥.
- 도달 카운터 `도달 0/9`, `미발견 9`. 이것은 결말 도달 수이며, 이 시점에 `살아남은 자`를 보았어도 결말 도달 0이다. 노드 수와는 다른 수다.
- 증거: `/Users/choeminju/월흔_trpg/work/continuation/map/latest-ui/01-chapter1-prison-current.png`

### 2. 같은 시점 — 2화 탭, 미방문 이름 숨김

같은 장면(`낯선 돌바닥`, 대사 미진행)에서 2화 탭을 눌렀다.

- 노드 0개. 본문 `아직 방문한 장면이 없습니다.`, 사이드 `미발견`, `도달 0/2`, `미발견 2`.
- 2화 장면 이름(창살의 자물쇠 등)이 어디에도 나오지 않는다. 엔진은 이미 ep02_unlock까지 미리 처리했지만 맵은 이를 따르지 않는다.
- 증거: `/Users/choeminju/월흔_trpg/work/continuation/map/latest-ui/02-chapter2-same-point-hidden.png`

### 3. 대사 큐를 끝까지 읽은 뒤 — `자물쇠의 걸림쇠`

`#dialog`를 눌러 읽은 장면 순서: 낯선 돌바닥 → 물벼락 → 창밖 → 복식과 문장 → 신세한탄은 그만 → 옷섶의 핀 → 창살의 자물쇠 → 어머니의 빗 → 닫힌 창문과 열린 창문 → **자물쇠의 걸림쇠**. 도착 시점에 멈춰 맵을 열었다.

- 맵을 열면 처음부터 2화 탭이 선택된다(현재 챕터를 따른다). 노드 `창살의 자물쇠`가 "현재", 사이드 `현재 위치 · 자물쇠의 걸림쇠`, 방문 기록 `1번째 판`, `여기서 다시 시작`, `도달 0/2`, `미발견 2`. 오른쪽에 `미발견` 칸 1개. 이번 판 선은 이 노드에서 시작한다.
- 같은 맵의 1화 탭: `낯선 돌바닥`·`창밖`·`옷섶의 핀`이 방문 노드로 추가되고 `도달 1/9`(`1화 통과 / 장 통과 / 살아남은 자`), `미발견 8`. 결말 도달은 `살아남은 자` 1건이며, 노드가 4개에서 늘어난 것과는 별개의 수다.
- 증거(2화, 현재): `/Users/choeminju/월흔_trpg/work/continuation/map/latest-ui/04-chapter2-lock-current.png`
- 증거(초기 탭이 2화임): `/Users/choeminju/월흔_trpg/work/continuation/map/latest-ui/03-opened-lock-initial-tab.png`
- 증거(1화 탭 이후): `/Users/choeminju/월흔_trpg/work/continuation/map/latest-ui/05-chapter1-after-lock.png`

## atlas.ts 대조

| 항목 | 코드 | 관찰 |
|---|---|---|
| currentRun | `record.display.runs[state.session]` (세션 없으면 마지막 display run) | 상태 1·2에서 엔진이 ep02까지 가 있어도 현재 노드는 화면의 `낯선 돌바닥`. 상태 3에서 `창살의 자물쇠`로 이동 |
| 노드 발견·라벨 | `record.display?.beats ?? record.beats` | 상태 2에서 2화 이름 숨김, 상태 3에서만 열림 |
| 선(pairs) | `record.display?.paths` | 상태 1의 금색 선이 화면에서 본 순서와 일치 |
| 결말 도달 | display 기준 | 노드 수와 구분되어 `도달 0/9`→`1/9` |
| nextHint | 코드만 대조 | 힌트 UI는 실행하지 않음 |

## 증거 파일

모두 `/Users/choeminju/월흔_trpg/work/continuation/map/latest-ui/` 아래. 스크린샷은 `page.screenshot` 실제 캡처이며 합성이 아니다.

- `01-chapter1-prison-current.png`
- `02-chapter2-same-point-hidden.png`
- `03-opened-lock-initial-tab.png`
- `04-chapter2-lock-current.png`
- `05-chapter1-after-lock.png`
- `atlas.sha256`, `server.log`, `atlas.json`, `saves/`, `logs/`

## 미확인·한계

- `nextHint` 화면 동작(힌트 단계 UI)은 이 시나리오에서 열어 보지 않았다. 소스 대조만 했다.
- 챕터 탭 전환 후 같은 모달에서 다시 현재 챕터로 자동 복귀하는지는 확인하지 않았다(열 때 현재 챕터 탭이 선택되는 것만 관찰).
- 저장·불러오기·재시작·변조 요청(HTTP) 경로는 이번 범위가 아니다.
- 브라우저 전체 접근성·키보드(Tab/Escape)는 확인하지 않았다.
- 대화 기능 및 LLM·이야기 QA 아님.
