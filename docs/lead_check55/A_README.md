# 55차 A 후보

2026-11-06. 베히다트 네 표정의 목걸이·터번 보석·화면 왼쪽 눈 보정 후보다.
설치하지 않았다. `assets/` 쓰기, 커밋, crq, 로컬 모델·서버 실행은 하지 않았다.

## 후보와 비교

후보 폴더: `work/demo-slice/lane55/A/out/`

| 표정 | 파일 |
|---|---|
| 중립 | `work/demo-slice/lane55/A/out/behidat_neutral.png` |
| 미소 | `work/demo-slice/lane55/A/out/behidat_smile.png` |
| 놀람 | `work/demo-slice/lane55/A/out/behidat_surprised.png` |
| 경계 | `work/demo-slice/lane55/A/out/behidat_wary.png` |

- `docs/lead_check55/A_compare.jpg`: 원작 / 전 / 후, 중립 가슴 3배와 터번 5배.
- `docs/lead_check55/A_eyes_zoom.jpg`: 네 표정의 전 / 후, 실제 픽셀 3배 최근접 확대.
- `docs/lead_check55/A_eyes_landmarks.jpg`: 최종 눈구석 좌표와 8배 확대.
- `work/demo-slice/lane55/A/out/all_jewelry_review.jpg`: 네 표정 장신구 전체 검수.
- `docs/lead_check55/A_verification.json`: 후보 SHA-256, 보존 검사, 정렬, D/E.

## 실행

작업 폴더 기준:

```sh
uv run --with pillow --with numpy python work/demo-slice/lane55/A/prepare_codex.py
uv run --with pillow --with numpy python work/demo-slice/lane55/A/generate_codex.py
uv run --with pillow --with numpy python work/demo-slice/lane55/A/composite_codex.py
uv run --with pillow --with numpy python work/demo-slice/lane55/A/repair_hair_codex.py
uv run --with pillow --with numpy python work/demo-slice/lane55/A/composite_codex.py
uv run --with pillow --with numpy python work/demo-slice/lane55/A/evidence_codex.py
uv run --with pillow --with numpy python work/demo-slice/lane55/A/verify_codex.py
```

`repair_hair_codex.py`는 첫 합성에서 은발 연결부의 꺾임을 발견해 중립·미소만 두 번째로 생성한 단계다.
가슴·터번·놀람 눈·경계 눈은 각 1회, 중립 눈·미소 눈은 각 2회 생성했다.
14건 모두 지정 파일 저장에 성공했다. 홈 생성 폴더에서 가져오는 대체 경로는 사용하지 않았다.

실제 이미지 명령 형식:

```sh
codex exec --skip-git-repo-check -s workspace-write -C <절대출력폴더> \
  -i <원작참조> -i <그림체시트> -i <현재확대입력> -- \
  "<편집지시>. Save the result as <절대출력경로>.png and reply with the saved path." < /dev/null
```

장당 `subprocess.run(..., timeout=240)`으로 제한했다.
문서 그대로 `-i <현재입력> "<지시>"`로 처음 실행했을 때, 이 버전의 가변 길이 `-i` 인수가 지시문까지 가져가
12건 모두 `Reading prompt from stdin... No prompt provided via stdin.`으로 즉시 끝났다.
프롬프트 앞에 인수 종료 표시 `--`를 넣어 해결했다. 이 최초 호출에서는 이미지 생성이 시작되지 않았다.
실패 로그는 `out/generated_*_r1_argument_failure.log`, 실제 성공 명령은
`out/generated_*_r1_command.txt`, 두 번째 눈 명령은 `out/generated_eye_{neutral,smile}_r2_command.txt`에 있다.
각 성공 로그와 실행 시간은 같은 이름의 `.log`, `_run.json`에 있다.

## 참조와 프롬프트

기존 `A/`의 원작 확대를 재사용했다.
짧은 줄 구조는 `ref_c064_chest.png`, 긴 관과 펜던트는 `ref_c007_chest.png`,
터번은 `ref_c007_turban.png`, 보조 목걸이는 `ref_c047_chest.png`와 대조했다.
가슴 생성에는 c064를 첫 참조로 넣고, 생성 뒤 c007의 물방울 위치와 세공 구조를 추가 대조했다.
모든 생성의 두 번째 참조는 `work/style/sheets/behidat_style_sheet.png`다.

가슴 핵심 지시:

```text
Keep everything else exactly, same framing, same art style, line weight and colors.
Short necklace: flat oval gold plates alternating with hollow oval rings, NOT round beads.
Long necklace: distinct long cylindrical gold tubes alternating with small beads, NOT a twisted chain.
The big red pendant must be an elongated FACETED cut gemstone with visible angular planes,
an ornate gold filigree setting, and a small red teardrop gem directly ABOVE the large pendant.
Keep both necklace paths and pendant center positions.
```

터번 핵심 지시:

```text
Replace the smooth round red jewel with a LARGE OCTAGONAL-CUT red gemstone:
eight straight outer edges, angular cut facets clearly visible, in an ornate gold filigree frame.
Keep jewel position and size. Preserve turban cloth, two white feathers and their direction,
hair and background exactly.
```

눈 첫 지시:

```text
Redraw its linework cleanly to match the SCREEN-RIGHT eye's sharpness, single dark upper lid,
lash weight, red iris details and rendering. Remove the phantom doubled lid and horizontal
pale cut-paste seam. Restore the silver hair strands crossing over that eye as continuous
smooth strands. Do NOT move, enlarge, shrink, widen or change the expression of either eye.
```

눈 두 번째 지시:

```text
The LAST image already has the CORRECT eye size, width, position and expression:
KEEP BOTH EYES EXACTLY AS THEY ARE, including every inner/outer corner, iris size and eyelid geometry.
Repair ONLY the silver bangs crossing the SCREEN-LEFT eye: remove kinked, doubled
or abruptly bent silver strands around the eyebrow and upper eyelid;
make them flow as smooth continuous narrow strands, like the first reference.
```

전문과 정확한 입력 경로는 앞서 적은 `_command.txt`에 보존했다.

## 정렬·마스크

원본 1024×1536 RGBA에서 가슴 `(445,310,584,530)`, 터번 `(460,132,543,205)`,
양눈 참조 영역 `(455,204,563,267)`을 잘라 8배 확대해 생성했다.
눈은 표정마다 따로 그렸다.

중립과 나머지 표정의 가슴 최대 채널 차이는 104·113·128,
터번은 128·255·134라 공통 그림을 통째로 재사용하지 않고 12개 영역을 각각 생성했다.
원본 사본은 `out/before_{표정}.png`, 비교값은 `out/inputs.json`이다.

장신구는 원래 크기로 줄인 뒤 마스크 밖 피부·천을 기준으로
크기 0.97~1.03, 이동 ±4픽셀을 탐색했다. 최적값은 모든 가슴·터번에서 크기 1.0, 이동 0,0이었다.
눈은 생성 과정에서 넓어진 눈 개구부를 수동 눈구석 좌표에 맞춰 국소 가로 정렬했다.
머리카락 경계가 꺾이지 않도록 변형량은 눈 주변에서만 유지하고 위·아래로 점차 0까지 줄였다.
정렬 코드와 최종 원본·대상 눈구석은 `composite_codex.py`, `A_verification.json`에 있다.

마스크는 다음 파일에 있다.

- `out/mask_chest_{표정}.png`: 타원판 줄, 긴 관 줄, 펜던트만 포함.
- `out/mask_turban_{표정}.png`: 보석과 금틀만 포함, 깃털 제외.
- `out/mask_eye_{표정}.png`: 화면 왼쪽 눈과 그 위를 지나는 은발 연결부.
- `out/mask_full_{표정}.png`: 1024×1536 검증용 합집합.

마스크를 4배 크기로 그려 0.65픽셀 상당의 가장자리 흐림을 적용했다.
축소 뒤 값 3 미만은 0으로 잘라 마스크 지지를 유한하게 유지했다.
첫 합성에서는 긴 관 줄이 마스크 가장자리에서 잘려 기존 사슬 일부가 남았다.
줄 마스크 폭을 9→17픽셀로 늘려 기존 사슬과 새 관을 모두 포함한 뒤 다시 확인했다.
가슴 사각형 전체나 얼굴 사각형 전체를 붙이지 않았다. 알파는 각 표정 원본 것을 그대로 사용했다.

## 최종 검사

수동 눈구석은 아이라인 날개가 아니라 눈 개구부의 수평 투영으로 잡았다.
`A_eyes_landmarks.jpg`에서 최종 후보를 다시 확인했으며 약 ±1픽셀 판독 오차가 있다.
자동 얼굴 검출 수치가 아니다.

| 표정 | 왼쪽 눈구석 x | 오른쪽 눈구석 x | D | E | 전 D/E | 후 D/E |
|---|---|---|---:|---:|---:|---:|
| 중립 | 480–502 | 526–549 | 24 | 22.5 | 1.067 | 1.067 |
| 미소 | 477–501 | 525–549 | 24 | 24.0 | 1.000 | 1.000 |
| 놀람 | 474–501 | 525–551 | 24 | 26.5 | 0.906 | 0.906 |
| 경계 | 475–501 | 526–551 | 25 | 25.5 | 0.980 | 0.980 |

| 검사 | 결과 |
|---|---|
| 캔버스·모드 | 4장 모두 1024×1536 RGBA |
| 알파 | 4장 모두 원본과 완전 동일 |
| 마스크 밖 최대 채널 차이 | 4장 모두 0 |
| 화면 오른쪽 눈·입 영역 최대 차이 | 4장 모두 0 |
| 원본 assets 변경 | 4장 모두 없음 |
| 변경 픽셀 | 중립 10,118 / 미소 10,170 / 놀람 10,191 / 경계 10,122 |
| D/E 0.9~1.1 | 수동 좌표 기준 4장 통과 |
| 스크립트 실행·문법 | uv 실행 성공, `python -m compileall -q` 종료 0 |

편집기 LSP는 공유 Python 환경에 없는 PIL·numpy를 미해결 import로 표시했다.
지정된 `uv run --with pillow --with numpy` 환경에서는 실제로 불러와 모든 이미지 처리·검사를 실행했다.
별도 정적 타입 검사는 실행하지 않았다.

## 판정과 남은 점

후보 검수 통과로 판단한다. 짧은 줄의 판·고리, 긴 줄의 관·구슬, 큰 절단면 보석과 위쪽 작은 물방울,
터번의 팔각 절단면·장식 금틀이 보인다. 깃털 방향과 외부 복장은 보존됐다.
네 표정을 3배에서 직접 보고, 중립·미소의 복제된 검은 윗눈꺼풀과 수평 잘라 붙인 흔적,
눈을 통과하던 은발의 끊김이 개선된 것을 확인했다. 중립·미소 재생성 뒤에는 경계의 급한 꺾임도 줄었다.
놀람은 열린 눈, 경계는 찡그린 눈, 중립·미소의 시선과 입 표정은 유지됐다.

원래 눈 폭이 22~27픽셀이라 최근접 3배 확대에서는 픽셀 계단이 남는다.
표정별 독립 생성이므로 금틀의 극세선·반사광에는 소폭 차이가 있다.
이는 동일 장신구 구조의 재작화 후보이며 원작 세공의 픽셀 복제본은 아니다.
비교 그림 가장자리의 녹색 잔상은 전후 동일한 기존 픽셀이며 이번 마스크 밖이다.
게임 설치와 1440 화면 검수는 이 작업에서 실행하지 않았다. 후보 설치는 레인이 담당한다.
