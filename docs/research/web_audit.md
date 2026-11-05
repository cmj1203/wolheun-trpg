# app/web 접근성·폰 화면 감사 (2026-11-05)

대상: `app/web/index.html`, `app/web/main.ts`, `app/web/style.css` (브랜치 `cloud/snapshot-1105` 기준).
범위: 키보드만으로 전 과정 진행, 포커스 표시, 스크린리더 이름, 대비, 터치 크기, 작은 화면 글 넘침.

## 어떻게 쟀나

- 서버: `WOLHEUN_NO_LLM=1 bun src/server/main.ts` (= `run.sh --no-llm` 과 같은 앱 서버, LLM 없음).
  그림(assets)이 저장소에 없어 배경·입식은 `web/img/*.svg` 임시 그림으로 보였다. **대비 수치 중 그림 위 글자는 임시 그림 기준이다.**
- 브라우저: 미리 깔린 Chromium + Playwright. 화면 크기 1280×720(데스크톱), 844×390(폰 가로), 390×844(폰 세로).
- 키보드: Tab·Enter·Space 를 실제로 눌러 결과(`window.__wolheun.phase`, 대화창 `open`)를 읽었다.
- 스크린리더 이름: Playwright `ariaSnapshot()`(Chromium 접근성 트리). 실제 VoiceOver·NVDA 로 듣지는 않았다.
- 대비: WCAG 2.x 상대 휘도 공식. 그림 위 글자는 글자를 투명하게 한 스크린샷에서 글자 상자 안 가장 밝은 점을 배경으로 잡았다.

심각도: **치명** = 그 사용자는 진행 불가 · **높음** = 크게 불편하거나 WCAG AA 위반이 뚜렷 · **중간** = AA 경계·일부 상황 · **낮음** = 다듬기.
상태: **고침** = 이 PR 에서 aria·포커스만 고침(동작·보이는 글·레이아웃 그대로) · **제안** = 동작이나 레이아웃이 바뀌므로 승인 뒤에 고칠 것.

## 치명

| ID | 문제 | 위치 | 측정·근거 | WCAG | 상태 |
|---|---|---|---|---|---|
| K-1 | **키보드로 게임을 시작할 수 없다.** 문서 전체 keydown 이 Enter·Space 를 무조건 `preventDefault()` 하고 `advance()` 로 보내서, 포커스된 단추의 Enter·Space 가 단추를 누르지 않는다. | `main.ts` 끝 `document.addEventListener('keydown', …)` | `#btn-new` 에 포커스 → Enter → phase 그대로 `title`, Space 도 같음. 같은 이유로 위쪽 메뉴(수첩·기록·저장·불러오기), 결과 화면 단추 전부(다시 하기·타이틀로·이야기 지도·피드백), 접근법 단추가 키보드로 안 눌린다. (선택지는 숫자 1~9 로, 대사·주사위·결말은 Space 로는 된다.) | 2.1.1 | 제안 (아래 「K-1 고치는 법」) |
| K-2 | **피드백 창에서 띄어쓰기·줄바꿈을 칠 수 없고 키보드로 보내거나 닫을 수 없다.** 같은 keydown 이 피드백 창(`#feedback`)과 그만두기 확인 창(`#confirm`)이 열렸을 때 빠지지 않는다. | 같은 곳 | 피드백 칸에 `a b⏎c` 입력 → 값 `"abc"`. `닫기` 에 포커스 후 Enter → 창 그대로 열림. 확인 창은 Esc(=계속한다)로만 닫혀 `끝낸다` 를 키보드로 못 고른다. | 2.1.1 | 제안 (K-1 과 함께) |
| K-3 | **폰 세로 화면에서 글이 3~6px 로 읽을 수 없다.** 무대가 16:9 고정이고 글자 크기가 전부 `cqw`(무대 폭 비례)라, 폭 390px 이면 무대가 390×219 가 되고 글자도 그만큼 준다. 입력줄만 700px 이하에서 16px 로 따로 커진다. | `style.css` `.stage`·모든 `font-size: …cqw` | 390×844: 대사 6.0px, 위쪽 메뉴 3.7px, 진행 수치 제목 3.1px, 선택지 5.1px, 접근법 단추 3.3px, 결과 화면 돌아보기 3.9px, 저장 칸 4.1px. 844×390(가로)도 대사 10.7px, 메뉴 6.6px. | 1.4.4, 1.4.10 | 제안 (레이아웃 변경 필요) |

## 높음

| ID | 문제 | 위치 | 측정·근거 | WCAG | 상태 |
|---|---|---|---|---|---|
| H-1 | 브라우저 확대(Ctrl/⌘ +)로 글이 커지지 않는다. 확대하면 CSS 화면 폭이 줄고 무대와 `cqw` 글자가 같이 줄어 실제 크기가 그대로다. | `style.css` `.stage` | 1280×720 을 200% 로 키운 것과 같은 640×360 에서 대사 9.9px(CSS) × 2 = 19.8 실픽셀로 100% 때와 같다. | 1.4.4 | 제안 |
| H-2 | 폰에서 누를 곳이 너무 작다. | 위쪽 메뉴, 접근법·선택지·결과·저장 창 단추, GM 단추 | 390×844: 메뉴 단추 16×9px, 접근법 51×8px, 선택지 172×21px, 결과 `다시 하기` 30×13px, 저장 칸 146×17px, 닫기 높이 13px. 844×390: GM 단추 17×17px. (WCAG 2.2 AA 최소 24×24, 권장 44×44) | 2.5.8 | 제안 |
| H-3 | 대사창이 `aria-live` 인데 글자를 26ms 마다 한 자씩 바꿔, 스크린리더가 조각을 잇달아 읽거나 줄을 놓친다. GM 말상자도 같다. | `index.html` `#dialog`·`#gm-box`, `main.ts` `typeText` | 첫 줄 하나에 `#text` 변경 48번. | 4.1.3 | **고침**: 두 칸의 `aria-live` 를 빼고, 화면에 안 보이는 읽기 칸 `#sr-line` 에 줄 전체를 한 번에 넣는다(바꾼 뒤 같은 줄에서 변경 1번). |
| H-4 | 알림(토스트)·판정 결과·대가·장면 검사·결말이 스크린리더에 알려지지 않는다. (대사창의 `aria-live` 를 뺀 뒤에는 자유 입력 안내 한 줄도 여기로 옮겨 알린다.) 토스트는 2.8초 뒤 사라진다. | `#toast`, `showRoll`, `showPrice`, `showTwist`, `showEnding` | 토스트 칸에 role/live 없음. 결과 화면 이전 판정 결과는 그림·글만 바뀐다. | 4.1.3 | **고침**: `#sr-note`(role=status)·`#sr-line` 에 같은 글을 넣는다. 토스트 표시 시간은 그대로(→ 제안 L-6). |
| H-5 | 폰 세로에서 이야기 지도 칸 이름이 겹치고 잘린다(`white-space: nowrap`, 칸 최소 폭 112px). | `.atlas-node`, `.atlas-map` | 390×844: 지도 `scrollWidth` 334 > `clientWidth` 309, 「사람…」「마지막으로…」「마음이 비…」 칸이 서로 덮인다. 아래 단추 글은 약 5px. | 1.4.10 | 제안 |
| H-6 | 타이틀 화면 글 대비가 모자라다(임시 그림 기준). | `.title-kicker`, `.credit`, `#title-status` | 2.30:1, 3.13:1, 2.34:1 (AA 4.5:1). `#title-sub` 4.01:1. | 1.4.3 | 제안 (진짜 그림으로 다시 재야 함) |

## 중간

| ID | 문제 | 위치 | 측정·근거 | WCAG | 상태 |
|---|---|---|---|---|---|
| M-1 | 타이틀·결과 화면에서 Tab 첫 4번이 가려진 위쪽 메뉴 단추(수첩·기록·저장·불러오기)에 멈춘다. 포커스가 안 보인다. | `.topbar` | 고치기 전 Tab 순서: 수첩 › 기록 › 저장 › 불러오기 › 처음부터 …. `elementFromPoint` 로 메뉴 자리는 `#title`/`.result-inner` 가 덮고 있다. | 2.4.3, 2.4.7 | **고침**: 타이틀·결과 단계에서 `.topbar` 에 `inert`. 이제 처음부터 › 이어하기 › 이야기 지도 › 기록 지우기. |
| M-2 | 이야기 지도의 「???」 칸 힌트를 마우스로만 열 수 있다(`div` + click). | `openAtlas` | Tab 이 칸에 가지 않음. | 2.1.1 | **고침**: 안 가 본 칸에 `tabindex=0`·`role=button`, Enter·Space 로 같은 힌트. 키보드 포커스 테두리 추가. |
| M-3 | 선택지 포커스가 `outline: none` 에 1px 테두리 색만 바뀐다(gold-soft→gold 3.33:1, 1px). | `.choice:focus-visible` | 겨우 3:1, 얇다. | 2.4.7, 2.4.11 | **고침**: 키보드 포커스일 때만 2px 금색 테두리선(outline). 마우스 hover 모양은 그대로. |
| M-4 | 이야기 입력칸·피드백 칸 포커스는 1px 테두리 색만 바뀐다(3.83:1). | `.say input:focus`, `.feedback-text:focus` | 입력칸은 늘 `:focus-visible` 이라 테두리를 두껍게 하면 마우스 플레이 화면도 바뀐다. | 2.4.7 | 제안 |
| M-5 | 선택지·접근법 단추의 스크린리더 이름이 붙어 읽힌다(예: 「달려가서 길을 묻는다체력 +0」). | `renderChoices`, `renderFree` | ariaSnapshot. | 2.5.3 근처, 1.3.1 | **고침**: `aria-label` 을 보이는 글 그대로 쉼표로 나눠 붙임(「달려가서 길을 묻는다, 체력 +0」). |
| M-6 | 대화창(저장 칸·수첩·기록·이야기 지도·확인)에 이름이 없다. | `<dialog>` | `aria-labelledby` 없음(피드백 창만 있음). | 4.1.2 | **고침**: 이미 있는 제목(`h2`·확인 글)을 `aria-labelledby` 로 연결. |
| M-7 | 위쪽 칩 글(화수·시각·긴장, 금색)이 밝은 모래 그림 위에서 대비가 모자랄 수 있다. | `.chip` | 밝은 모래(#d6a064) 위 2.38:1, 하늘 쪽 5.77:1. 임시 그림 기준. | 1.4.3 | 제안 (진짜 그림으로 다시 재야 함) |
| M-8 | 이야기 지도의 안 가 본 칸 글 「???」 대비 4.14:1(14px). 안 가 본 선 #3f3a34 는 1.65:1. | `.atlas-node.unseen`, `.atlas-lines path` | AA 4.5:1 / 비글자 3:1 미달. 일부러 흐리게 한 것이면 예외 판단 필요. | 1.4.3, 1.4.11 | 제안 |

## 낮음

| ID | 문제 | 위치 | 측정·근거 | WCAG | 상태 |
|---|---|---|---|---|---|
| L-1 | 「15」 등급 표시가 숫자만 읽힌다. | `.rating` | ariaSnapshot `text: "15"`. | 1.1.1 | **고침**: `role=img`, 이름은 manifest 의 `rating`(「15세 이용가」). |
| L-2 | 장식이 읽힌다: 넘기기 표시 ▼, 주사위 눈 9칸×2, 진행 수치 아이콘·조각 시계 SVG, 지도 선 SVG. | `#more`, `#gm-more`, `.dice-row`, `trackRow`, `clockFace`, `.atlas-lines` | ariaSnapshot 에 빈 `img` 가 남음. 주사위 숫자는 식(`#dice-formula`)에 다 있다. | 1.1.1 | **고침**: `aria-hidden="true"`. |
| L-3 | 빈 입식 자리 `figure` 3개가 이름 없이 트리에 남는다. | `.sprites figure` | ariaSnapshot `- figure`. | 1.3.1 | 제안 (입식이 있을 때 img alt 는 쓸모 있어 그대로 둠) |
| L-4 | 이야기 화면에 `h1` 이 없다(타이틀의 `h1` 은 숨겨짐). | `index.html` | | 2.4.6 | 제안 |
| L-5 | 무대 전체 `user-select: none` 이라 대사를 골라 복사·사전 찾기가 안 된다. | `.stage` | | — | 제안 |
| L-6 | 토스트가 2.8초 뒤 사라진다. 이제 읽기 칸으로도 알리지만, 화면으로 읽는 사람에게는 짧을 수 있다. | `toast()` | | 2.2.1 | 제안 |
| L-7 | `prefers-reduced-motion: reduce` 에서도 글자 찍기 연출(26ms/자)은 그대로다. 흰 번쩍임(`.flash`)은 1회라 3회/초 기준은 넘지 않는다. | `typeText`, `.flash` | | 2.3.3(AAA) | 제안 |
| L-8 | 입력칸 이름이 질문 모드에서도 「말하거나 행동하기」다(안내 글만 「🦊 GM에게 묻기」로 바뀜). GM 단추의 `aria-pressed` 로는 알 수 있다. | `#free-input` | | 2.5.3 | 제안 |

## 잘 되어 있는 것

- `<html lang="ko">`, 페이지 제목, `viewport` 에 확대 막기 없음.
- 기본 단추(타이틀·메뉴·대화창 단추)는 브라우저 기본 포커스 링(2색)이 보인다. GM 단추·결과 아래 화살표·시트 단추는 금색 포커스선이 따로 있다.
- 네이티브 `<dialog>` 라 Esc 로 닫히고 닫으면 포커스가 연 단추로 돌아간다.
- GM 단추 `aria-pressed`, 결과 화면 ▼ 단추 `aria-label`, 입력칸 `aria-label` 있음.
- 선택지 숫자키 1~9, 대사·주사위·결말 Space/Enter 넘기기.
- `prefers-reduced-motion` 에서 애니메이션·전환을 끈다.
- 단추 위 흰 글/진홍(#9e2638) 6.65:1, 금색 판정 표 위 검은 글 9.03:1, 대사창 흐린 글 6.5~8.2:1 로 충분.

## K-1·K-2 고치는 법 (제안, 승인 필요)

동작이 바뀌므로 이 PR 에는 넣지 않았다. 가장 작은 변경:

```ts
document.addEventListener('keydown', (event) => {
  if (ui.slotsDialog.open || ui.logDialog.open || ui.notesDialog.open || ui.atlasDialog.open
      || ui.feedback.open || ui.confirm.open            // K-2: 모달이 열려 있으면 손대지 않는다
      || event.target === ui.freeInput) return;
  // K-1: 키보드로 고른 단추·글칸에서는 Enter·Space 를 그 요소에 맡긴다
  const target = event.target as HTMLElement;
  if ((event.key === 'Enter' || event.key === ' ') && target !== document.body
      && target.matches(':focus-visible') && target.closest('button, a[href], textarea, [role="button"]')) return;
  …(나머지 그대로)
});
```

바뀌는 동작: 마우스로 단추를 누른 뒤에는 Chromium 이 그 단추에 포커스를 남긴다. `:focus-visible` 조건 없이 고치면 마우스로 「수첩」을 열고 닫은 뒤 Space 가 대사를 넘기지 않고 수첩을 다시 연다. 위 조건(`:focus-visible`)이면 마우스 사용자는 지금과 같고, Tab 으로 온 사용자만 단추가 눌린다. 브라우저마다 `:focus-visible` 판정이 조금 달라 Safari 에서 확인이 필요하다.

## K-3·H-1·H-2 방향 (제안, 레이아웃 변경)

- 폭이 좁으면(예: `max-width: 700px` 또는 세로 방향) 무대를 16:9 그림 칸으로만 쓰고, 대사창·선택지·진행 수치·메뉴를 무대 아래 일반 흐름으로 꺼내 `rem` 글자(최소 16px)로 둔다. 지금 입력줄만 그렇게 꺼내져 있다.
- 글자 크기를 `max(…cqw, …rem)` 처럼 바닥을 두면 확대(H-1)와 작은 화면(K-3)이 같이 나아진다. 다만 대사창 높이가 바뀌어 입식·CG 자리와 겹치는지 다시 봐야 한다.
- 폰에서는 단추를 `min-height: 44px` 로.
