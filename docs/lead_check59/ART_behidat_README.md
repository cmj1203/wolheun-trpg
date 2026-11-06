# 베히다트 표정 후보 재검증

2026-11-06. 최신 테두리 정리 기본 파일에 네 표정을 다시 합성했다. 네 후보 모두 이번 수치 기준과 3배 확대 검수를 통과했다. 설치는 레인이 한다.

## 후보와 증거

후보 폴더는 `work/demo-slice/lane59/behidat/`다.

| 파일 | 표정 판정 |
|---|---|
| `behidat_sneer.png` | 반쯤 내린 눈꺼풀과 한쪽 입꼬리의 비웃음. 통과 |
| `behidat_dumbfounded.png` | 세로로 조금 열린 눈과 작게 벌어진 입의 어이없음. 통과 |
| `behidat_menacing.png` | 내려누르는 눈썹과 굳은 입의 위협. 통과 |
| `behidat_intrigued.png` | 가늘어진 눈·한쪽 올라간 눈썹의 호기심. 입은 원본 그대로. 통과 |

- 8종 모음: `docs/lead_check59/faces_sheet_behidat.jpg`
- 정확히 3배 최근접 확대: `docs/lead_check59/faces_zoom_behidat.jpg`
- 전체 수치: `docs/lead_check59/ART_behidat_verification.json`
- 실제 프롬프트·명령·로그: 후보 폴더의 `prompt_*.txt`, `run_*.json`, `codex_*.log`
- 정렬 입력 좌표·마스크 다각형: `registration_landmarks.json`
- 합성 마스크: `mask_<표정>.png`, `mask_<표정>_{eyes,brows,mouth}.png`
- 정렬한 얼굴: `aligned_*.png`
- 육안 판정: `visual_judgements.json`
- 전달 파일별 `ls -l`: `ls_manifest.txt`

기존 neutral·smile·surprised·wary와 새 네 표정을 같은 순서·크기로 비교했다. 원작은 `docs/lead_check59/orig_faces_behidat.jpg`와 표정별 두 원본 크롭을 대조했다.

## 기준 파일

`assets/sprites/pilot/behidat_neutral.png`, 1024×1536 RGBA.

55A 얼굴은 같고 깃털·터번·머리 가장자리의 올리브 테두리가 정리된 최신 파일이다. 최종 합성에 사용한 SHA-256:

```text
ab3e48739aaad6f94126ff09fa962648ce48bad46b98a09b067ec01256655048
```

얼굴 크롭은 `[440,198,578,310]`이고 생성 입력은 6배인 828×672다. 참조 컷은 `face_references.json`의 표정별 두 컷, 그림체는 `work/style/sheets/behidat_style_sheet.png`다. `cold`는 별도로 만들지 않았다.

## 정렬과 마스크

55A 검증과 같은 가시 눈 개구부의 x좌표 `480,502,526,549`를 쓴다. 날개 아이라인 끝이나 앞머리에 가려진 선의 추정 끝을 쓰지 않는다. 크롭 6배 좌표의 네 점은 `[240,210],[372,234],[516,234],[654,198]`다.

생성본 네 대응점을 기록하고 네 점 가중 최소제곱으로 닮음 변환을 구했다. 바깥 두 점 가중치는 1, 안쪽 두 점은 16이다. 네 점을 사용하면서 안쪽 끝의 ±1픽셀 계약을 우선한다. 눈별 독립 축소·비균일 변환·머리카락 밑 피부 보간은 최종 경로에서 쓰지 않는다. 확대 상태의 정렬은 bicubic, 원본 해상도로 내릴 때는 Lanczos다.

닮음 변환 자체는 D/E를 바꾸지 않는다. 따라서 최종 마스크에서는 네 기준 눈꼬리 반경 2픽셀을 원본으로 보존해 실제 끝점이 이동하지 않게 했다. 정렬 잔차와 최종 끝점 이동량은 별도로 기록했다. 아래 D/E는 보존된 기준 끝점으로 계산하며 자동 얼굴 검출 수치가 아니다.

눈꺼풀·눈동자를 포함한 눈 개구부, 눈썹, 입에 각각 독립적인 좁은 다각형 마스크를 썼다. 중심은 불투명하게 두고 바깥쪽 최대 3픽셀만 페더 처리했다. 원본의 위쪽에 연결된 앞머리와 선 가장자리는 마스크에서 제외했다. 앞머리 위로 생성 머리카락을 얹지 않는다. 흥미 표정의 입 마스크는 비어 있어 입 픽셀은 완전히 같다.

## 수치

| 표정 | D/E | 정렬 후 안쪽 끝 최대 잔차 | 최종 끝점 이동 | 중립 대비 선명도 좌/우 | 양쪽 눈 선명도 비 |
|---|---:|---:|---:|---|---:|
| sneer | 1.0667 | 0.670px | 0px | 86.6% / 226.4% | 92.6% |
| dumbfounded | 1.0667 | 0.625px | 0px | 110.3% / 221.6% | 71.1% |
| menacing | 1.0667 | 0.950px | 0px | 86.1% / 254.7% | 95.5% |
| intrigued | 1.0667 | 0.632px | 0px | 107.3% / 224.4% | 74.1% |

D=24px, E=22.5px다. 콧대 축은 기존 기준 513.5px이고 안쪽 끝까지의 좌우 거리는 11.5px·12.5px로 차이 1px다. 원래 기준의 비대칭 허용 범위를 유지한다.

선명도는 동일한 고정 ROI에서 4방향 이산 라플라시안 분산을 계산했다. 좌 `[478,228,504,244]`, 우 `[524,228,551,244]`다. 각 눈을 neutral의 같은 ROI와 비교하고, 두 눈 중 작은 분산/큰 분산도 확인했다. 모두 70% 이상이다. 앞머리 가림이 있는 ROI의 수치이므로 눈의 미학적 품질 전체를 증명하는 지표로 쓰지 않았고 확대판도 직접 확인했다.

네 후보 모두 마스크 밖 차이 0, 보존 앞머리 차이 0, 기준 끝점 보호 영역 차이 0, 알파 동일, 캔버스 동일이다. 몸·옷·장신구·최신 정리 가장자리는 기준 파일 그대로다.

## 생성과 재현

원격 생성은 Codex CLI만 사용했다. 기본 얼굴·원작 두 컷·그림체 시트를 첨부하고 눈·눈썹·입만 바꾸도록 지시했다. 네 기준 x좌표, 좌우 눈의 선 굵기, 원본 앞머리 보존도 명시했다. 냉소는 반쯤 내린 눈과 한쪽 입꼬리, 흥미는 한쪽 눈썹과 거의 무표정인 입으로 분리했다.

```sh
uv run --with pillow --with numpy python work/demo-slice/lane59/behidat/prepare.py
uv run --with pillow --with numpy python work/demo-slice/lane59/behidat/prepare.py intrigued
uv run --with pillow --with numpy python work/demo-slice/lane59/behidat/align_compose.py
uv run --with pillow --with numpy python work/demo-slice/lane59/behidat/measure.py
uv run --with pillow --with numpy python work/demo-slice/lane59/behidat/verify.py
```

CLI 형식은 `codex exec --skip-git-repo-check -s workspace-write -C <후보폴더> -i <기본얼굴> -i <원작1> -i <원작2> -i <그림체> -- "<프롬프트>"`다. stdin `DEVNULL`, 장당 240초 제한이며 네 표정은 병렬로 생성했다.

이번 요청에서 sneer·dumbfounded·menacing은 각 1회, intrigued는 2회 생성했다. 흥미 첫 후보의 양쪽 눈 선명도 비가 69.1%여서 한 번 더 생성해 74.1%로 올렸다. 이전 요청까지 합치면 각각 2·2·2·3회다. 이번 합성은 동일 가중 정렬, 안쪽 끝 가중 정렬, 최신 기본 파일 및 흥미 재생성 반영의 3회다.

`compose.py`는 이전 반려 방식의 기록이며 최종 경로가 아니다. 최종은 `align_compose.py`다. 현재 `generated_*.png`와 프롬프트·로그는 최종 선택한 생성본을 가리킨다.

## 검증 범위

원격 생성·합성·눈금 제작·최종 검증·Python 구문 검사는 종료 코드 0이다. 기본 편집기 환경의 `PIL`·`numpy` import 진단은 남지만 실행은 지정된 `uv run --with` 환경에서 했다. 별도 정적 타입 검사는 하지 않았다.

게임 런타임 설치·표정 전환은 레인 범위다. 여기서는 후보 PNG와 증거만 갱신했다. `assets/` 수정, 커밋, crq, 로컬 모델·서버 실행은 하지 않았다.
