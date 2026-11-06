# 아시나 표정 후보

59차 아시나 후드·일반 입식의 얼굴 편집 기록. 후보는 `work/demo-slice/lane59/asina/`에 보관한다.

## 기준과 명령

기준은 `assets/ep01/gen/asina/asina_neutral.png`와 `assets/ep01/gen/hood/asina_hood_neutral.png`다. 54차 귀찌·가방과 55차 장화를 포함한 최종 입식이다. 이 파일에 쓰지 않는다.

```sh
uv run --with pillow --with numpy python work/demo-slice/lane59/asina/prepare.py
uv run --with pillow --with numpy python work/demo-slice/lane59/asina/generate.py
uv run --with pillow --with numpy python work/demo-slice/lane59/asina/generate.py --hood
uv run --with pillow --with numpy python work/demo-slice/lane59/asina/compose.py
```

생성은 Codex CLI만 사용했다. 실행 인자는 각 `run_*.json`, 프롬프트 전문은 `prompt_*.txt`, 응답과 세션은 `codex_*.log`에 보존한다. 형태는 아래와 같다. 표정마다 240초 제한, 표정 다섯 개를 병렬 실행하며 stdin은 `/dev/null`이다.

```sh
codex exec --skip-git-repo-check -s workspace-write -C <후보폴더> \
  -i <기준얼굴> -i <원작얼굴1> -i <원작얼굴2> -i <그림체시트> \
  -- "<표정 편집 지시문>" < /dev/null
```

처음 실행은 마지막 `-i`가 프롬프트를 삼켜 `No prompt provided via stdin.`으로 즉시 종료됐다. `codex exec --help`의 `--image <FILE>...`를 확인하고 `--`로 분리한 뒤 로그의 `user` 구간에서 지시문 전달을 확인했다. 실패한 요청은 그림을 생성하지 않았다.

## 원작과 편집

| 표정 | 원작 | 편집 의도 |
|---|---|---|
| flustered | ep01_c073, ep03_c028 | 걱정스럽게 올라간 눈썹, 당황한 시선, 작은 열린 입과 식은땀 |
| scared | ep01_c004, ep01_c056 | 실제 위험 앞의 커진 눈, 긴장한 눈썹, 작게 벌어진 입 |
| indignant | ep05_c048, ep09_c066 | 항의하는 눈썹과 입. 네모 개그 눈·분노 기호는 가져오지 않음 |
| smug | ep01_c049, ep02_c005 | 미인계를 믿는 능청과 자신 있는 미소 |
| tired | ep01_c032, ep01_c078 | 낮아진 눈꺼풀, 힘 빠진 입, 갈증·탈진 |

각 요청에 원작 두 얼굴 크롭과 `work/style/sheets/asina_style_sheet.png`를 첨부했다. 머리·후드·귀찌·얼굴형·선 굵기·색은 그대로 두고 눈·눈썹·입·볼의 표정 표시만 바꾸도록 요청했다. 두 기준의 눈·입 영역은 픽셀이 일치하지 않아 복장별로 따로 생성했다.

## 마스크와 정렬

입식의 `[420,330,580,470]`을 잘라 960×840으로 확대해 입력했다. 출력은 160×140으로 되돌린 뒤 머리카락·콧등·귀찌 부근을 기준으로 0.96~1.04 배율과 ±4픽셀 평행이동을 비교해 정렬한다. 최종 변환은 검증 JSON의 `alignment`에 기록한다.

마스크는 `face_mask_native.png`다. 눈·눈썹 두 쌍과 입·볼을 별도 다각형으로 정하고 가우시안 0.8픽셀로 페더 처리했다. 8/255 미만의 가장자리 값은 0으로 잘라 변경 영역을 유한하게 제한한다. 귀찌 보호 영역은 크롭 좌표 `[33,79,50,97]`·`[117,79,133,97]`이며 페더 뒤에도 값을 0으로 고정했다. 알파는 기준에서 그대로 복사한다.

합성한 전체 입식을 기준과 비교해 마스크가 0인 곳의 RGBA 차이를 세고, 전체 알파·캔버스가 같은지 검사한다. 머리 외곽·가르마·귀찌·몸·옷은 합성 영역 밖에 둔다.

## 검증 상태

수치·시각 검수 결과는 작업 종료 시 아래에 기록한다. 기본 편집기의 `numpy`·`PIL` 미설치 진단과 달리 위 `uv run --with` 명령은 별도 의존성 환경을 사용한다. 앱 실행·설치·표정 전환은 레인의 후속 범위다.

일반 README 재생성 도구는 사용하지 않았다. 이 파일은 요청된 작화 실행 기록이다.

## 최종 판정

일반·후드 10/10장이 마스크 밖 RGBA 차이 0, 귀찌 보호 영역 픽셀 일치, 전체 알파 일치, 1024×1536 캔버스 일치를 통과했다. 최종 합성 명령과 `compileall`은 종료 코드 0이다.

원작 모음과 전체 입식 모음, 3배 확대 모음을 직접 열었다. 가르마·머리 외곽·귀찌·얼굴 크기가 유지됐고, 눈 간격에 눈에 띄는 변화는 없다. 눈 간격은 시각 검수이며 별도 랜드마크 수치를 측정한 결과는 아니다.

| 표정 | 판정 |
|---|---|
| flustered | 통과. 올라간 안쪽 눈썹·식은땀·작게 열린 입으로 당황 표현 |
| scared | 통과. 당황보다 커진 눈·작은 동공·긴장한 입으로 현재 위험 표현 |
| indignant | 통과. 내린 눈썹·항의하는 열린 입. 개그 눈·분노 기호 제외 |
| smug | 통과. 낮은 눈꺼풀·비대칭 미소. 기존 smile과 구분 |
| tired | 통과. 무거운 눈꺼풀·힘 빠진 입·땀. 기존 wary와 구분 |

정상 생성은 각 복장·표정당 1회였다. 최초 CLI 인자 오류 수정 외에 표정 재생성은 하지 않았다. 귀찌 마스크 경계를 한 번 고친 뒤 최종 확대 시트를 다시 확인했다. 발견한 작화 문제는 남아 있지 않다. 게임 설치와 실제 표정 전환은 검증하지 않았다.

`assets/` 변경, 커밋, `crq` 실행은 하지 않았다. 수치의 원문과 후보별 정렬값은 `ART_asina_verification.json`에 있다.
