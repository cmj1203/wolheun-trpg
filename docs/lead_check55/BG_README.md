# 55차 배경·지도 후보 검증

2026-11-06. Codex CLI 원격 편집으로 후보 3장을 저장했다. 이전 네이티브 도구 실패 결론은 이번 결과로 대체한다. `assets/` 설치, 서버 실행, 커밋, 코드레빗 요청은 하지 않았다.

| 후보: `work/demo-slice/lane55/bg/` | 규격 | 판정 |
|---|---|---|
| `desert_near.png` | 1920×1080 RGB PNG | 오른쪽 붉은 절벽, 왼쪽 층진 바위, 마른 나무와 선인장 복원. 사람 없음 |
| `desert_wide.png` | 1920×1080 RGB PNG | 작은 관목 3개와 돌, 오른쪽 아래 희미한 모래 결만 국소 합성 |
| `item_map.png` | 512×512 RGBA PNG | 왼쪽 큰 수역, 좌우 중단 산맥, 중앙 열린 통로 및 도시·점선 길 복원 |

## 입력과 원작 대조

지시 `work/demo-slice/lane55/INSTRUCTION55.md` 5·6항, `docs/audit_1106/art_audit.md`, `docs/audit_1106/art/bg_near.png`, 기준 문서 `work/art/gpt/round6/bible/full_audit.md`의 관련 내용을 확인했다. 원작 685컷을 다시 전수 검수한 작업은 아니다.

- 원작: `assets/ep01/cuts/full_res/clean/ep01_c029.png`, `ep01_c028.png`, `ep01_c030.png`.
- 현재: `assets/ep01/gen/bg/desert_near.png`, `desert_wide.png`, `assets/ep01/gen/items/item_map.png`.
- 화풍: `work/style/sheets/asina_style_sheet.png`. 배경에는 시트의 인물을 넣지 않았다.
- 지도 확대 참조: c030의 `(0,2550,2000,4350)`을 800×720으로 축소한 `work/demo-slice/lane55/bg/map_original_detail.png`. 원작 지도 전체의 지형을 읽기 위한 확대이며 손도 남아 있는 입력이다. 후보에서는 손을 제외했다.

근경은 원작의 지형 종류와 좌우 배치를 되살렸다. 세로 원작 컷을 그대로 늘인 그림은 아니며, 중앙을 입식 자리로 열어 둔 가로 배경이다. 원경과 같은 밝은 청색 하늘·연한 황금색 모래·주황빛 바위여서 낮 장면 연결에 적합하다. 원작의 흰 효과선·모래 오버레이는 복제하지 않았다.

원경은 기존 구름·하늘·수평선·사구를 보존한다. 관목과 돌은 작게 읽히며 모래바람은 매우 약한 결 수준이다. 원작의 강한 모래 폭풍 재현으로 판정하지 않는다.

지도는 북쪽에 몰렸던 산맥을 양옆 중단으로 옮기고 원작의 중앙 통로를 복원했다. 해안선·도시·길의 세부 선을 픽셀 단위로 추적한 결과는 아니다. 종이 가장자리와 알파는 기존 파일 그대로다.

## 명령과 프롬프트

`work/demo-slice/CODEX_IMAGE_HOWTO.md` 방식으로 실행했다. 로컬 모델·서버는 쓰지 않았다. 셸에 `timeout` 실행 파일이 없어 각 셸 명령을 Python `subprocess.run(..., shell=True, timeout=240, check=True)`로 감쌌다. 표준 입력은 반드시 `/dev/null`이었다.

```sh
codex exec --skip-git-repo-check -s workspace-write \
  -C /Users/choeminju/월흔_trpg/work/demo-slice/lane55/bg \
  -i <원작> -i <화풍시트> -i <현재그림> -- "<프롬프트>" < /dev/null
```

이 CLI의 `-i <FILE>...`가 마지막 프롬프트까지 먹어 첫 근경·원경 요청은 `No prompt provided via stdin`으로 실패했다. `--`로 이미지 목록과 프롬프트를 분리한 뒤 세 요청 모두 종료 코드 0과 실제 PNG를 받았다. CLI가 `~/.codex/generated_images/<session>/`에서 지정 폴더로 복사·리사이즈한 기록은 아래 로그에 남아 있다.

- `work/demo-slice/lane55/bg/near_codex.log`
- `work/demo-slice/lane55/bg/wide_codex.log`
- `work/demo-slice/lane55/bg/map_codex.log`

핵심 프롬프트:

```text
NEAR: Edit image 3, the current empty desert background, using image 1 ep01_c029
for exact environment identity and composition, and image 2 only for fine Korean
webtoon drawing style. Output a 16:9 background, 1920x1080. Preserve current pale
gold sand, clear blue daylight sky and delicate lines, matching adjacent desert
backgrounds. Add distinctive tall red-orange sandstone cliff pillars on the right,
layered red rock piles in the left midground, a few skeletal dead trees and cacti.
Keep central foreground sand open for two character sprites. No people, animals,
letters, speech bubbles, panel borders or white comic overlays.

WIDE: Make an extremely small localized edit to image 3, current desert_wide.
Preserve all sky, dunes, horizon, lighting and composition exactly. Add only three
small dry twig shrubs and a few pebbles in far lower left around x=200,y=840 and
far lower right around x=1730,y=880, plus one subtle short wisp of blowing sand near
lower right. Tiny additions. No people, text, borders or fog over whole image.

MAP: Edit only cartography inside parchment map in image 3. Image 1 is full
ep01_c030, image 2 its readable detail, image 4 drawing style only. Keep parchment
outline, folds, lighting, orientation, transparent background, 512x512 canvas.
Large dark green sea upper-left quarter and left edge with nested angular coastlines
and islands; mountain range middle-left descending southwest, separate middle-right
range; open sandy north-south inland corridor; fortified cities upper-center,
lower-center, west and east; forests and dashed trails. Remove current concentration
of mountains across far north. No hands, people, letters or extra ornaments.
```

각 요청은 지정 폴더의 `desert_near_raw.png`, `desert_wide_raw.png`, `item_map_raw.png`에 저장하도록 끝맺었다.

## 합성 및 수치 검증

```sh
uv run --with pillow --with numpy python work/demo-slice/lane55/bg/finish_backgrounds.py
uv run --with pillow --with numpy python work/demo-slice/lane55/bg/finish_map.py
uv run --with pillow --with numpy python work/demo-slice/lane55/bg/make_evidence.py
```

- 근경은 전체 지형 수정이 필요한 요청으로 원격 편집 결과 전체를 사용했다. 출력은 1920×1080으로 맞췄다.
- 원경은 생성 결과에서 관목·돌 주변 세 타원과 얇은 모래 결 곡선만 3px 블러 마스크로 합성했다. `desert_wide_mask.png`의 0 영역은 원본 픽셀을 그대로 사용한다.
- 원경 마스크 면적 24,396픽셀(전체의 약 1.18%), 실제 변경 17,728픽셀. **마스크 바깥 변경 0픽셀**.
- 지도는 알파 220 초과 영역의 경계로 생성 그림을 기존 종이에 정렬했다. 생성 경계 `(15,81,497,436)` → 기존 경계 `(30,97,480,417)`.
- 종이 내부 마스크를 17px 최소 필터와 2px 블러로 줄이고 지형만 합성한 뒤 원본 알파를 그대로 다시 붙였다. `item_map_mask.png` 바깥 변경 **0픽셀**, 원본과 알파 차이 **0픽셀**.
- 최초 지도 합성은 알파가 255인 픽셀만 찾다가 원본 종이 내부의 253 등 반투명 값 때문에 마스크가 비었다. 실제 비교에서 발견해 220 초과 영역으로 고쳤고, 10,000픽셀 이상 실제 RGB 변화도 검증 조건에 넣었다.
- 스크립트 3개를 실제 의존성이 있는 uv 환경에서 `basedpyright --pythonpath <그 환경의 Python>`으로 검사했다. **0 errors, 0 warnings, 0 notes**, 종료 코드 0. 편집기 기본 환경에는 Pillow·NumPy가 없어 import 진단이 나타나지만 실행 환경 검사는 통과했다.

## 시각 증거와 한계

- `docs/lead_check55/BG_compare.jpg`: 원작 | 전 | 후, 한국어 표기, 세 파일.
- `docs/lead_check55/BG_mockup.jpg`: 1440×810, 지정된 후드 아시나와 베히다트 중립 입식을 근사 게임 위치에 합성.
- 목업에서 검은 옷의 베히다트는 밝은 바위와 분리되고, 회갈색 아시나는 같은 따뜻한 색 배경 위에서도 외곽선과 얼굴이 읽힌다. 새 바위가 인물을 가리지 않는다.
- 목업은 서버 화면 캡처가 아니다. 실제 대사창·화면 전환·게임 CSS 위치는 검증하지 않았다.
- 원작 세부 선의 완전 일치, 강한 모래바람 재현으로 주장하지 않는다. 후보 설치 전 리드가 실제 장면에서 확인할 자료다.
