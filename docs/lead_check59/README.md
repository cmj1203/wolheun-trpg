# 59차 표정 조사 인계

원작에서 확인한 아시나 5종·베히다트 5종의 표정 근거와 엔진용 규칙 초안이다. 그림 생성 재시도는 리드 지시에 따라 중단했다.

| 파일 | 내용 |
|---|---|
| `docs/lead_check59/faces_survey.md` | 전체 조사 범위, 표정별 원작 컷·상황, 제외 근거 |
| `docs/lead_check59/faces_rules.md` | 화자별 허용 목록 제안, 상황별 선택, 기존 `neutral`과 조사 ID `cold`의 대응 |
| `docs/lead_check59/orig_faces_asina.jpg` | 아시나 5종 × 2컷 |
| `docs/lead_check59/orig_faces_behidat.jpg` | 베히다트 5종 × 2컷 |
| `work/demo-slice/lane59/face_references.json` | 원본 20컷의 경로와 얼굴 크롭 정수 좌표 |
| `work/demo-slice/lane59/reference_crops/` | 원본 픽셀을 그대로 자른 PNG 20개. 개별 이름은 위 JSON의 `crop` |
| `work/demo-slice/lane59/survey_inventory.json` | 1~10화 전체 685개 컷 ID |
| `work/demo-slice/lane59/preview_coordinates.json` | 최종 확정 전 후보 51개의 확대 영역. 확정 목록과 혼동하지 말 것 |
| `work/demo-slice/lane59/prepare_survey.py` | 후보 확대 시트 제작 |
| `work/demo-slice/lane59/assemble_faces.py` | 최종 원작 크롭·얼굴 모음 조립 |
| `docs/lead_check59/astra_failure.md` | 범위 변경 전에 발생한 이미지 도구 실행 실패 기록 |

## 방법과 판단

화별 전체 모음 10장을 훑은 뒤 후보를 확대했다. 원작의 실제 눈썹·눈꺼풀·입을 기준으로 분류하고 대사는 보조로 썼다. 최종 얼굴 모음 두 장을 직접 열어 확인했다.

아시나 `teary`와 `pouty`는 이번 조사에서 확정하지 못해 제외했다. 실제로 확인한 항의 표정은 `indignant`로 분리했다. 베히다트 `cold`는 기존 `neutral`과 같은 시각 의미이므로 런타임에 중복 ID를 만들지 않는 안을 규칙 문서에 적었다.

PNG 크롭은 원본 해상도·색·픽셀을 유지한다. `bbox`는 원본 이미지 기준 `[left, top, right, bottom]`이며 오른쪽·아래쪽 끝은 포함하지 않는다. 모음 JPEG만 종횡비를 유지해 축소했다. 베히다트의 크롭 좌표는 41차 조사 좌표를 재사용하고 이번 모음에서 얼굴을 다시 확인했다.

입식 기본 파일은 이번 변경 범위에서 선택하거나 편집하지 않았다. 얼굴 패치·페더 마스크·입식 후보가 없으므로 얼굴 밖 차이 0, 알파 일치, D/E 0.9~1.1을 검증했다고 말할 수 없다. 원작 크롭 좌표는 입식에 붙일 마스크 좌표가 아니다.

후속 작화에서는 각 참조의 감정만 가져온다. 원작 후반의 머리 장식·목걸이·복장·구도를 기본 입식에 옮기지 않는다. 아시나는 54·55차 최신 귀찌·가방 결과를, 베히다트는 50·55차 눈·장신구 결과를 기준으로 별도 작업자가 기본 입식을 고른 뒤 얼굴 마스크를 정해야 한다.

`readmeai`·`readme-ai` 실행 파일은 이 환경의 PATH에서 찾지 못해 README 자동 생성 도구는 사용하지 못했다. 이 파일은 수동으로 쓴 조사 인계 기록이다.

## 재현

```sh
uv run --with pillow --with numpy python work/demo-slice/lane59/prepare_survey.py
uv run --with pillow --with numpy python work/demo-slice/lane59/assemble_faces.py
```

두 스크립트 모두 41차 임시 좌표 파일 `/tmp/lane41/survey_rows.json`에 의존한다. 최종 크롭 좌표는 별도로 `face_references.json`에 모두 보존했으므로 임시 파일이 사라져도 최종 근거는 읽을 수 있다.

편집기 진단은 기본 인터프리터에서 `PIL`·`numpy`를 찾지 못했다고 표시했다. 위 `uv run --with` 환경에서 실행은 종료 코드 0으로 완료했다. 별도 타입 검사는 실행하지 않았다. `assets/`·`app/` 수정, 커밋, 코드레빗 요청은 하지 않았다.

## 최종 확인

- 원본에서 같은 좌표를 다시 잘라 비교한 결과, 크롭 20/20개의 크기·채널·픽셀이 완전히 같았다. 다른 픽셀 수 0.
- 원작 모음 두 장은 각각 1120×2200이며 직접 열어 검수했다.
- 제작·검사 명령은 모두 종료 코드 0으로 끝났다. 최초 준비 실행의 한글 경로 정규화 오류는 원본 경로를 현재 작업 루트에서 구성하도록 고쳐 해결했다.
- 주요 전달 파일 6개와 원본·개별 크롭·보조 파일 45개, 합계 51개 경로를 `ls -l`로 확인했다. 두 확인 명령 모두 종료 코드 0.
- 게임 실행·모델 호출·화면 표정 전환은 이번 조사 범위에 포함하지 않았고 검증하지 않았다.
