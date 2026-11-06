# 48차 게임 화면 검증

2026-11-06. 고정 시드와 실제 화면 클릭으로 촬영했다. 코드·콘텐츠·그림은 수정하지 않았고 커밋하지 않았다.

뷰포트는 1440×900, 390×844다. Bun.WebView를 `headless: true`로 실행했고 DPR 2이므로 PNG의 실제 픽셀 크기는 각각 2880×1800, 780×1688이다. 그림 로딩과 유한 CSS 애니메이션이 끝난 뒤 촬영했다. 아래 최종 사진을 모두 직접 열어 기준 그림과 비교했다.

| 파일 | 시드 | 경로(입력) | 비트/줄 | 확인 결과 |
|---|---:|---|---|---|
| `b01_drink_1440.png` | 4 | A, 첫 행동 전 | b01_sand / 심지어 물도 다 떨어져 가고… | 통과. CG 아시나 후드 착용. 복원 백업 그림과 동일. 입식은 CG 뒤로 숨음. |
| `b01_drink_390.png` | 4 | A, 첫 행동 전 | b01_sand / 같은 줄 | 통과. 후드 착용, 복원 백업과 동일. 가로 넘침·대사 잘림 없음. |
| `b06_A_cg_1440.png` | 4 | A | b06_swing / 미친―! 피해야 돼!! | 통과. 새 cg_swing, 아시나 머리 노출·후드 미착용. 진입 전 입식은 후드 착용. |
| `b06_A_cg_390.png` | 4 | A | b06_swing / 같은 줄 | 후드·CG 통과. 가로 넘침·대사 잘림 없음. 폰 세로 배치는 별도 작업. |
| `b06_A_sprite_1440.png` | 4 | A → 몸을 던져 칼날을 피한다 | b06_swing / 칼날이 아슬아슬하게 비껴갔다. | 통과. CG가 내려간 첫 입식 줄. 머리 노출, 후드 미착용. |
| `b06_A_sprite_390.png` | 4 | A → 같은 회피 입력 | b06_swing / 같은 줄 | 통과. 후드 미착용. 가로 넘침·대사 잘림 없음. |
| `b06_B_cg_1440.png` | 2 | B | b06_swing / 미친―! 피해야 돼!! | 통과. 미인계에서 이미 후드를 벗음. 새 CG에서도 후드 미착용. |
| `b06_B_cg_390.png` | 2 | B | b06_swing / 같은 줄 | 후드·CG 통과. 가로 넘침·대사 잘림 없음. 폰 세로 배치는 별도 작업. |
| `b06_B_sprite_1440.png` | 2 | B → 몸을 던져 칼날을 피한다 | b06_swing / 칼날이 아슬아슬하게 비껴갔다. | 통과. CG가 내려간 첫 입식 줄도 후드 미착용. |
| `b06_B_sprite_390.png` | 2 | B → 같은 회피 입력 | b06_swing / 같은 줄 | 통과. 후드 미착용. 가로 넘침·대사 잘림 없음. |
| `changes_390.png` | 4 | A, b05 입력 전 | b05_why / 의심 +3 | 크기 관계 통과. 변화 5.07px < 대사 6.045px. 잘림 없음. 폰 세로 배치는 별도 작업. |
| `../../lead_check43b/changes_390.png` | 4 | 위와 동일 | 위와 동일 | 동일 PNG를 43b 지정 경로에도 저장. |

A 입력은 순서대로 `모래 언덕 뒤에 숨어서 지켜본다` → `저는 귀한 집안 사람이에요. 함부로 대하면 후회하실 거예요`다. b06 CG 직전까지 `/media/ep01/gen/hood/asina_hood_*.png` 입식을 확인했다.

B 입력은 `달려가서 길을 묻는다` → `후드를 벗고 생긋 웃으며 말한다. 대륙에서 하나뿐인 미소녀를 죽이면 대륙의 손해라고요!`다. b06 CG 진입 전부터 `/media/ep01/gen/asina/asina_*.png`였다. 두 경로에서 행운 선택지가 나오면 사용하지 않았다.

CG 줄 다음 클릭은 자유 입력 단계이며 CG가 유지된다. 이어서 회피를 입력하고 판정을 넘기면 CG가 내려간 첫 이야기 줄이 나온다. `*_sprite_*`는 그 실제 입식 화면이다. 두 경로 모두 `/media/ep01/gen/asina/asina_neutral.png`를 사용했다.

물 CG는 리드 정정에 따라 **후드 착용이 정상**이다. `new2/cg_drink.png`는 비교 기준에서 제외했다. 설치 파일과 `work/demo-slice/lane48/backup_before_install/cg_drink.png`가 바이트 단위로 같다. 칼날 CG는 설치 파일과 `work/demo-slice/lane48/new2/cg_swing.png`가 바이트 단위로 같다.

| 그림 | 설치 파일 SHA-256 |
|---|---|
| cg_drink.png | `22ca5a0d9fddea13e3435aaf6a8492dc2c37fb3c651711769d858bd2f721e100` |
| cg_swing.png | `abf7199eb2f26a508857aea85002cfa74ac29b9d0a5f64b671235c38189c76b1` |

390폭의 모든 대상 화면에서 `document.documentElement.scrollWidth === innerWidth === 390`이었다. CG는 기존 16:9 무대 안에 표시되고 세로 화면에는 검은 여백이 남는다. 선택한 대사·수치 변화 줄의 잘림은 없었다. 측정값은 대사 6.045px(약 6.0px), 변화 줄 5.07px(약 5.1px)다.

390 세로는 무대 전체가 작아 대사·변화 줄 모두 읽기 어려움 — 폰 세로 배치는 별도 작업(리드 판단). .changes 는 대사의 0.85배(1.3cqw) 그대로.

실행 명령은 저장소 루트에서 다음과 같다.

```sh
cd app
WOLHEUN_PORT=18191 \
WOLHEUN_NO_LLM=1 \
WOLHEUN_SAVES=/tmp/lane48shots/saves \
WOLHEUN_ATLAS=/tmp/lane48shots/atlas/atlas.json \
WOLHEUN_LOGS=/tmp/lane48shots/logs \
WOLHEUN_FEEDBACK=/tmp/lane48shots/feedback/feedback.jsonl \
bun src/server/main.ts
```

사용 포트는 앱 18191 하나다. LLM 서버는 실행하지 않았으며 18192·18193은 사용하지 않았다. 18080·18081과 `app/saves`, `app/logs`, `app/feedback`에는 접근하거나 쓰지 않았다.

첫 시작은 동시 편집 중인 `scenario.ts:323`의 `ReferenceError: bool is not defined`로 실패했다. 15초 간격 재시도 감시를 건 뒤 다른 작업자의 수정으로 시작에 성공했다. 재시도 명령 출력은 `/tmp/lane48shots/server.log`에 남겼다. 서버를 포함한 감시 프로세스는 촬영 후 감시 제한 시간에 종료됐으며 WebView도 닫았다.

종료 확인 명령 `lsof -nP -iTCP:18191-18193 -sTCP:LISTEN`은 **출력 없음, 종료 코드 1**이었다. 세 포트 모두 리스너가 없다.

`readmeai`·`readme-ai` 실행 파일은 설치되어 있지 않아 README 생성 도구는 실행하지 못했다. 이 촬영 증거 문서는 직접 작성했다.
