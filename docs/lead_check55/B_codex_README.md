# 55차 B Codex 재검수

## 현재 판정 · 2차

2026-11-06 레인 재검수 ①②③을 반영했다. **장화 마스크 안의 알파 변경을 허용받아 실제 외곽을 수정했다.** 아래 “1차 역사 기록”은 반려된 이전 결과이며 현재 판정이 아니다.

| 항목 | 3배 확대 직접 검수 | 판정 |
|---|---|---|
| 장화 8장 | 다리와 발목을 따라 가늘어지는 긴 장화, 살짝 뾰족한 앞코, 낮은 블록 굽, 원작에 가까운 짙은 갈색. 줄어든 외곽은 투명하고 이전 넓은 장화의 잔상이 없다. 접힌 윗단과 장화 몸통 연결에 끊어진 선이 없다. | 통과 후보 |
| 주머니 | 위가 닫힌 납작한 적갈색 주머니. 안쪽이 보이지 않고 덮개·잠금쇠가 없다. 가는 긴 끈 하나가 뒤에 놓였다. 원작 3화 c008처럼 바닥에 납작하게 내려놓은 모양이다. | 통과 후보 |
| 귀찌 | 타원형 분홍~붉은색 보석에 보랏빛 각면이 보인다. 얇은 장밋빛 금테 안쪽으로 삼각형 톱니 면이 이어지고 노란 금 발톱이 없다. 짧은 침이 뒤로 조금 보여 작은 귀걸이로 읽힌다. | 통과 후보 |

귀찌의 새 광택과 가죽의 일부 주름은 원작을 재작화한 칠이며 원작과 동일한 픽셀은 아니다. 이미지 후보 범위에서 확인했으며 게임 안에 설치하거나 게임 화면을 검수하지 않았다. 알려진 재검수 미반영 항목은 없다.

### 현재 후보와 이전 후보

기준 폴더 `work/demo-slice/lane55/B_codex/`의 같은 경로를 덮어썼다.

- `item_magic_bag.png`, `item_earring.png`: 512×512 RGBA PNG, 실제 투명 배경.
- `asina/asina_{neutral,smile,surprised,wary}.png`: 1024×1536 RGBA PNG.
- `hood/asina_hood_{neutral,smile,surprised,wary}.png`: 1024×1536 RGBA PNG.

반려된 직전 후보는 `revision1/`에 보관했다. 입식 합성 기준은 기존 `sources/{asina,hood}/`의 55차 원본이다. 배낭·끈 사각 버클·겉옷 길이·속치마 색·귀찌·가방 크기는 그대로다.

### 생성과 정렬

`generate.py`의 프롬프트를 바꿔 Codex CLI로 네 항목을 각각 한 번 더 생성했다. 누적 실제 생성은 항목별 2회다. 로컬 모델·서버, 세션 내 이미지 도구는 사용하지 않았다. 각 호출은 stdin `/dev/null`, `workspace-write`, Python timeout 240초이며 모두 exit 0이다.

| 생성 | 소요 시간 | 원본 |
|---|---:|---|
| 주머니 | 128.91초 | `revision2/bag_raw.png` |
| 귀찌 | 93.49초 | `revision2/earring_raw.png` |
| 후드 없는 장화 | 84.01초 | `revision2/asina_raw.png` |
| 후드 장화 | 89.45초 | `revision2/hood_raw.png` |

정확한 셸 명령과 전체 프롬프트는 `revision2/{bag,earring,asina,hood}_command.txt`, 로그는 `_codex.log`, 종료 상태는 `_run.json`에 있다. 지정 결과 파일을 모두 받았으며 대체 생성 폴더 파일은 사용하지 않았다.

이번 프롬프트는 주머니의 닫힌 윗선·납작한 몸통·가는 긴 끈, 귀찌의 타원형 분홍보라 보석·얇은 장밋빛 톱니 금테·짧은 침, 장화의 외곽 축소·투명화·짙은 갈색을 명시했다. 주머니 생성에는 3화 c008 확대와 4화 c007, 귀찌에는 10화 c013 확대와 1화 c049, 장화에는 기존 발 확대와 2화 c008 원작을 첨부했다. 주머니·귀찌의 칠 기준은 `item_pin.png`, 장화는 `asina_style_sheet.png`다.

입식은 표정별 원본에서 `(400,1230)-(640,1536)`을 잘라 각 발의 종아리 중심과 바닥 높이에 독립 정렬했다. 새 장화 폭은 생성물 형태를 유지하되 이전 발 외곽 폭의 86% 이하로 맞췄다. 두 세트에서 각 한 번 생성한 결과를 쓰되 8장 각각 원본 알파와 중심을 따로 측정했다.

편집 허용 마스크는 원본 좌표 x=405..594, y=1355..1532 안에만 있다. 상단 6픽셀에서만 경계를 점진적으로 연결하고, 그 아래는 새 RGBA로 교체했다. 줄어든 자리에 원본 장화를 남기지 않고 알파 0으로 비웠다. RGB·알파는 미리 곱한 색상으로 혼합해 투명 경계에 검은 테두리가 섞이지 않게 했다. 마스크 파일은 기존 `masks/{asina,hood}/`의 같은 이름을 갱신했다.

### 현재 수치 검증

8장 모두 저장된 PNG를 다시 읽어 검증했다.

- 캔버스 1024×1536, RGBA, PNG 유지.
- **마스크 밖 RGBA 차이 0픽셀**, 마스크 밖 알파 차이 0픽셀.
- 마스크 안의 알파는 변경됐다. 이전 불투명 영역 중 파일당 2,543~3,058픽셀이 완전히 투명해졌다.
- y=1385의 종아리 폭은 좌우·표정별 33~34픽셀에서 27~29픽셀로 줄었다.
- y=1410의 폭은 31~32픽셀에서 23~24픽셀로 줄었다.
- 장화 평균 RGB와 개별 정렬 좌표·폭은 `B_codex_verification.json`에 있다.

### 3배 확대와 증거

최종 PNG를 최근접 보간으로 정확히 3배 확대해 두 아이콘과 8장 모두 직접 열어 확인했다. 확대 파일의 계단은 3배 최근접 표시 자체의 픽셀 경계이며, 원래 512/1024 크기 파일은 안티앨리어싱을 유지한다.

- `revision2/item_magic_bag_3x.png`
- `revision2/item_earring_3x.png`
- `revision2/boots_{neutral,smile,surprised,wary}_3x.png`: 각 파일에 후드 유무 2장씩.
- `docs/lead_check55/B_codex_compare.jpg`: 원작 | 반려 후보 | 수정 후보.
- `docs/lead_check55/B_codex_item_earring.jpg`: 원작 | 반려된 둥근 루비 후보 | 수정된 타원형 후보. 보석 형태 비교를 위해 후보의 투명 여백만 잘라 같은 칸에 확대했다.
- `docs/lead_check55/B_codex_verification.json`: `revision=2`, 8장 수치와 3배 확대 판정.

```sh
uv run --with pillow --with numpy python work/demo-slice/lane55/B_codex/generate.py
uv run --with pillow --with numpy python work/demo-slice/lane55/B_codex/finish.py
uv run --with pillow --with numpy python work/demo-slice/lane55/B_codex/zoom_review.py
uv run --with pillow --with numpy python work/demo-slice/lane55/B_codex/verify_revision2.py
uv run --with pillow --with numpy python work/demo-slice/lane55/B_codex/compare_revision2.py
```

assets 설치·커밋·crq 실행 없음. Python 실행 환경은 uv의 Pillow·numpy이며, 편집기의 기본 환경에 이 패키지가 없다는 진단과 별도 정적 타입 검사 미실행은 이전과 같다.

---

## 1차 역사 기록 · 반려됨

2026-11-06. 원본 assets 설치, 커밋, crq 실행 없음. 로컬 모델·서버 및 세션 내 이미지 도구를 사용하지 않았다.

## 판정

| 대상 | 판정 | 직접 확인한 내용 |
|---|---|---|
| 주머니 | 채택 가능한 후보 | 덮개·잠금쇠·앞 버클이 없는 적갈색의 처지는 열린 주머니. 원작 바닥에 놓인 납작한 모양을 어깨끈에 매단 상태로 재작화했다. 원작보다 주름이 많다. |
| 귀찌 | 채택 가능한 후보 | 원작 컷을 잘라 붙이지 않고 새로 그렸다. 붉은~분홍색 각진 보석, 작은 톱니가 있는 금색 테두리, 둥근 스터드. 기존 확대 컷의 흐림·계단 현상이 줄었다. |
| 부츠 8장 | 부분 개선 후보, 체형 수정 완료 판정은 보류 | 갈색 가죽 면과 앞코 하이라이트를 재작화하고 원작처럼 어둡게 했다. 낮은 블록 굽과 기존 접힌 윗단을 유지했다. 알파를 그대로 보존하므로 실제 바깥 폭·앞코 윤곽은 바뀌지 않았다. 따라서 “실루엣 자체가 더 가늘어졌다”는 판정은 할 수 없다. |

부츠는 알파 배열 완전 동일 조건과 외곽선을 가늘게 바꾸는 요구를 동시에 충족할 수 없다. 이 후보는 명시된 알파 조건을 우선했다. 외곽 폭까지 수정하려면 부츠 마스크 안에서만 알파 변경을 허용하는 별도 판단이 필요하다. 허용받았다고 가정하지 않았다. 기존 윗단과 새 가죽 사이 색상 차이도 남아 있다.

## 후보 경로

기준 폴더: `work/demo-slice/lane55/B_codex/`

- `item_magic_bag.png`
- `item_earring.png`
- `asina/asina_{neutral,smile,surprised,wary}.png`
- `hood/asina_hood_{neutral,smile,surprised,wary}.png`

아이콘 두 장은 각각 512×512 RGBA PNG이며 실제 투명 픽셀이 있다. 아이콘은 새 물체 외형이므로 기존 아이콘 알파 배열 동일을 주장하지 않는다.

입식 여덟 장은 각각 1024×1536 RGBA PNG다. 기준 입력은 `work/demo-slice/lane55/{asina,hood}/`의 55차 파일이며, 실행 시점 스냅샷은 `B_codex/sources/`에 보관했다. 54차 귀찌와 55차 가방 크기 수정은 부츠 외부 픽셀 불변 검증에 포함된다.

## 입력

- 지시: `work/demo-slice/CODEX_IMAGE_HOWTO.md`, `work/demo-slice/lane55/INSTRUCTION55.md` 3·4항.
- 앞선 실패: `docs/lead_check55/B_astra_failure.md`.
- 기준: `work/art/gpt/round6/bible/full_audit.md` 106·108·249·253행.
- 주머니 원작: `assets/ep03/cuts/full_res/clean/ep03_c008.png`, `assets/ep04/cuts/full_res/clean/ep04_c007.png`. 생성에는 3화 c008의 확대본 `B_codex/bag_reference.png`를 첨부했다.
- 부츠 원작: `assets/ep02/cuts/full_res/clean/ep02_c008.png`, `assets/ep02/cuts/full_res/clean/ep02_c021.png`. 생성에는 2화 c008의 확대본 `B_codex/boots_reference.png`를 첨부했다.
- 귀찌: `assets/ep10/cuts/full_res/clean/ep10_c013.png`의 확대본 `B_codex/earring_reference.png`, `assets/ep01/cuts/full_res/clean/ep01_c049.png`.
- 그림체: `work/style/sheets/asina_style_sheet.png`; 귀찌 생성에는 `assets/ep01/gen/items/item_pin.png`를 칠·선 참고로 첨부했다.
- 귀찌 비교의 “지금”: `work/demo-slice/lane54/item_earring.png`.

## 명령과 프롬프트

아래 형태로 Codex CLI를 셸에서 실행했다. stdin은 `/dev/null`, 각 호출 제한은 Python `subprocess.run(timeout=240)`으로 240초다. 네 항목은 독립적으로 병렬 실행했다.

```sh
codex exec --skip-git-repo-check -s workspace-write -C <출력폴더> \
  -i <원작확대.png> -i <그림체또는원작.png> -i <현재그림또는아이콘.png> \
  -- "<편집 프롬프트>. Save the result as <출력경로> and reply with the saved path." < /dev/null
```

처음에는 안내 문서 형태대로 `--` 없이 실행했다가 현재 CLI의 `-i <FILE>...`가 뒤 프롬프트까지 이미지 인자로 받아 네 호출 모두 0.07초 만에 `No prompt provided via stdin`으로 종료했다. 이미지 생성 실패가 아니라 인자 파싱 실패였다. `--`로 프롬프트를 분리한 뒤 네 호출 모두 exit 0으로 생성했다. 각 항목의 실제 이미지 생성은 1회이며 추가 생성은 하지 않았다.

| 항목 | 성공 호출 소요 | 결과 원본 |
|---|---:|---|
| 주머니 | 97.32초 | `bag_raw.png`, 1024×1024 |
| 귀찌 | 82.12초 | `earring_raw.png`, 1024×1024 |
| 후드 없는 부츠 | 125.65초 | `asina_raw.png`, 1111×1416 |
| 후드 부츠 | 101.69초 | `hood_raw.png`, 240×306 |

정확한 첨부 경로와 전체 프롬프트는 `B_codex/{bag,earring,asina,hood}_command.txt`, 원본 로그는 각각 `_codex.log`, 종료 상태는 `_run.json`에 있다. 네 결과 모두 지정 경로에 저장되어 생성 폴더 대체 파일을 사용하지 않았다. `_run.json`의 fallbacks 목록은 같은 시간에 다른 세션이 생성한 이미지도 포함할 수 있으며, 이 목록을 실제 사용 입력으로 해석하면 안 된다.

프롬프트 핵심:

- 주머니: 부드러운 적갈색 반달 주머니, 열린 윗부분, 덮개·잠금쇠·앞 버클 없음, 어깨끈 포함, 투명 배경.
- 귀찌: 새로 그린 하나의 둥근 스터드, 붉은~분홍색 각면 보석, 좁은 금색 톱니 테두리, 손·피부·후광·장식 꼬리 없음.
- 부츠: 첫 이미지의 부츠만 편집, 같은 두 발 위치·크기·자세, 가늘게 다리를 따르는 갈색 장화·살짝 뾰족한 앞코·낮은 블록 굽·접힌 윗단, 옷과 배경 유지.

## 정렬·마스크·검증

1. 원본 8장에서 `(400,1230)-(640,1536)`의 240×306 영역을 잘랐다. 표정별 RGB와 알파가 모두 달라 동일 픽셀로 취급하지 않았다. 차이 수와 입력 SHA256은 `B_codex/source_check.json`.
2. 세트당 생성은 한 번씩 했다. 생성물은 240×306으로 Lanczos 정렬한 뒤 각 표정 원본의 좌우 발 알파 범위에 따로 크기·위치를 맞췄다. 좌우 발의 실제 정렬 사각형은 검증 JSON의 `alignment`에 기록했다.
3. 접힌 윗단과 겉옷을 건드리지 않도록 잘라낸 영역의 y=135, 즉 원본 y=1365 아래만 편집했다. 마스크는 원본의 투명 픽셀을 제외하고 안쪽으로 1픽셀 축소한 뒤 Gaussian 1.2픽셀로 경계를 풀었다. 처음 16행은 0에서 100%로 점진적으로 합성했다. 패치의 투명 부분도 제외했다.
4. 생성물의 RGB만 합성하고 알파는 원본 배열을 그대로 썼다. 마스크 밖 RGB와 투명 픽셀의 숨은 RGB까지 원본 그대로다.
5. 8장 모두 `outside_mask_diff_pixels=0`, `alpha_diff_pixels=0`, `changed_pixels>0`을 assert로 확인했다. 의상·가방·배낭·사각 버클·겉옷 길이·속치마 색·귀찌 등 부츠 밖 부분은 변경하지 않았다.

마스크 8장: `B_codex/masks/{asina,hood}/`의 후보와 같은 파일명. 수치와 후보별 정렬 위치: `docs/lead_check55/B_codex_verification.json`.

재현에 사용한 Python 명령:

```sh
uv run --with pillow --with numpy python work/demo-slice/lane55/B_codex/prepare.py
uv run --with pillow --with numpy python work/demo-slice/lane55/B_codex/source_check.py
uv run --with pillow --with numpy python work/demo-slice/lane55/B_codex/generate.py
uv run --with pillow --with numpy python work/demo-slice/lane55/B_codex/finish.py
uv run --with pillow --with numpy python work/demo-slice/lane55/B_codex/review_sheet.py
```

실행은 정상 종료했다. 편집기 기본 Python 환경에서는 PIL·numpy를 찾지 못한다는 진단이 있었으며, 실제 실행에는 위 uv 임시 환경을 사용했다. 별도 정적 타입 검사는 실행하지 않았다.

## 증거

- `docs/lead_check55/B_codex_compare.jpg`: 주머니 및 후드 유무 부츠의 원작 | 전 | 후.
- `docs/lead_check55/B_codex_item_earring.jpg`: 원작 | 지금 | 새 귀찌.
- `work/demo-slice/lane55/B_codex/all_boots_review.jpg`: 완성 8장의 발 확대. 직접 열어 위치·합성 경계와 발 모양을 확인했다.
- `docs/lead_check55/B_codex_verification.json`: 캔버스·알파·마스크 밖 차이와 생성 상태.

게임 화면 검증은 수행하지 않았다. 이 작업은 assets 설치 권한 없이 후보만 만드는 범위다. 부츠의 실루엣 수정 미달은 위 판정에 남겼다.
