# 음용 CG 두상 보정 후보

상태: 보정 후보와 자체 QA 증거 준비 완료. Claude 독립 검수 대기. 승인된 그림이 아니며 사용자 불만은 완료 처리하지 않았다. 앱에 설치하지 않았다.

작업 폴더: `work/continuation/drink-head-repair/`

## 확인한 원인과 범위

현재 `assets/ep01/gen/cg/cg_drink.png`의 SHA256은 `94090b18b1831f386b41d0fc1f0ea1a243cdf630959011d90241f09307341f0b`다. `docs/lead_check49/README.md`의 최종 방식은 뒤 윤곽을 수평 변위장으로 밀어낸 liquify다. 이번 후보는 그 결과를 반복하지 않고, 정수리와 두정부에서 뒤통수로 이어지는 전체 부피를 네이티브 이미지 편집으로 보정한다.

직접 확인한 원작은 `assets/ep01/cuts/full_res/clean/ep01_c031.png`와 `work/demo-slice/lane49/reference_c031_head.png`다. 후드는 착용 상태이고 뾰족한 끝을 보존해야 한다. 원작 뒤통수는 패널 밖이므로 보이지 않는 두개골의 정확한 모양은 확정할 수 없다.

## 입력과 보호

- `before.png`: 현재 CG의 무손실 복사.
- `input_crop.png`: 원본 좌표 `(160, 40, 1140, 880)`, 980×840.
- `source_head.png`: 원작 참조 크롭.
- `mask.png`, `mask_crop.png`: 흰색이 수정 가능 영역인 제한 마스크.
- `mask_guide.png`: 네이티브 도구에 전달하는 분홍색 범위 안내.
- `inputs.json`: 입력 SHA256, 수정 bbox, 보호 사각형.

얼굴·표정, 손·물주머니, 후드 꼭짓점, 귀찌가 보일 수 있는 귀 주변은 마스크에서 제외했다. 마지막 항목은 새 귀찌를 그리라는 의미가 아니며, 가려진 장신구를 드러내지 않는다.

## 생성과 검증

`generate.py`는 실제 전역 `codex exec` 프로세스를 다시 세어 3개 미만일 때 한 개만 시작한다. 최초 `heavy` 실행은 다른 두 작업 때문에 30분 동안 대기하다 감시 deadline으로 종료됐다. 생성 로그·PID 파일·결과가 없어 네이티브 호출은 0회였다. 로컬 대용량 모델을 사용하지 않는 원격 네이티브 편집이므로 이후 직접 실행했다. 네이티브 실행은 `start_new_session=True`로 별도 프로세스 그룹을 만든다. 입력·명령·로그·원본 네이티브 결과·해시를 보존한다. 기존 다른 생성과 서버는 건드리지 않는다.

`prepare.py <native.png>`는 네이티브 출력만 제한 마스크로 합성하고 `audit.json`, `diff_x4.png`, `compare_head.png`, `compare_full.png`를 만든다. 마스크 밖 픽셀 차이 0과 보호 영역 차이 0을 실제 계산한다. 원작 비교는 후드 꼭짓점과 얼굴 윤곽의 보이는 기준점에 맞춘 고정 0.46배이며, 패널 밖은 회색으로 표시한다. 후보와 이전 CG는 같은 좌표와 배율이다.

편집기 전역 환경에는 NumPy·Pillow import 미해결 진단이 있다. 설치 없이 기존 `tools/sprites/.venv/bin/python`으로 준비·합성·픽셀 검사를 실행했고 각각 종료 코드 0이었다. 코드·이미지·증거는 허용 폴더에만 썼고 git, 설치, 앱·원본 덮어쓰기는 하지 않았다.

## 실제 생성 결과

네이티브 생성은 총 1회다. 2026-11-09 17:02:46 KST 시작, 85.59초, 종료 코드 0. PID **8883**, PGID **8883**, 감독 PID 8877 / PGID 8875로 생성 프로세스 그룹이 분리돼 있었다. 시작 전 실제 전역 exec는 ep06 1개였으며 이번 실행을 더해 2개였다. 다른 작업을 종료하거나 재시작하지 않았다.

`native_run.json`의 네이티브 출력 SHA256과 `native.png`의 SHA256은 모두 `3b91d50594519f6c5d9dceaa919afc640f78ce4821ae95cd3bec534472adc9b5`다. 원본 네이티브 PNG는 변경 없이 보존했다. 도구 출력은 1355×1160이었고 최종 합성 때 입력 크롭 980×840으로 축소했다. 두 종횡비 차이는 약 0.12%이며 구도 재정렬·liquify·수작업 재드로잉은 하지 않았다.

| 산출물 | 경로 |
|---|---|
| 후보 1920×1080 | `work/continuation/drink-head-repair/candidate.png` |
| 이전·원작·이후 동일 배율 두상 비교 | `work/continuation/drink-head-repair/compare_head.png` |
| 이전·이후 전체 CG 비교 | `work/continuation/drink-head-repair/compare_full.png` |
| 제한 마스크 1920×1080 | `work/continuation/drink-head-repair/mask.png` |
| 픽셀 차이 4배 표시 | `work/continuation/drink-head-repair/diff_x4.png` |
| 수치 감사 | `work/continuation/drink-head-repair/audit.json` |
| 입력 해시·보호 좌표 | `work/continuation/drink-head-repair/inputs.json` |
| 네이티브 원본 출력 | `work/continuation/drink-head-repair/native.png` |
| 네이티브 명령·프로세스·출력 해시 | `work/continuation/drink-head-repair/native_command.json`, `work/continuation/drink-head-repair/native_run.json` |
| 네이티브 실제 로그 | `work/continuation/drink-head-repair/native.log` |

후보 SHA256: `7ea427f4d2f5ed629f247009785a718f54abfeae3cc25fc7c52cd4769e7e5b60`

| 실제 검사 | 결과 |
|---|---|
| 변경 픽셀 | 286,493 |
| 마스크 0 초과 픽셀 | 302,326 |
| 마스크 밖 변경 픽셀 | **0** |
| 마스크 밖 최대 채널 차이 | **0** |
| 얼굴·표정 보호 사각형 | 변경 0, 최대 차이 0 |
| 손·물주머니 보호 사각형 | 변경 0, 최대 차이 0 |
| 후드 뾰족한 끝 보호 사각형 | 변경 0, 최대 차이 0 |
| 귀 주변·귀찌 보호 사각형 | 변경 0, 최대 차이 0 |
| 실제 원작·현재 앱 CG·참조 크롭 입력 해시 | 전부 유지 |
| 네이티브 참조 입력 해시 | 전부 유지 |

## 직접 본 결과와 남은 판단

`compare_head.png`, `compare_full.png`, `candidate.png`를 직접 읽어 확인했다. 이전 CG는 후드 꼭짓점 뒤에서 뒤통수로 가는 선이 길고 비스듬해 상부 두상이 눌려 보였다. 후보에서는 그 구간이 위로 차오르는 곡면이 되고 두정부에서 후두부로 이어지는 폭과 명암이 함께 바뀌어 둥근 부피로 읽힌다. 뒤 외곽만 가로로 민 보정과 달리 후드 윗면의 곡률과 접힌 면의 명암도 함께 바뀌었다.

후드는 계속 착용 상태다. 꼭짓점은 그대로고 얼굴 옆선·표정·손·물주머니·전체 구도도 유지됐다. 직접 본 배율에서는 하늘과 새 외곽 사이 이중선이나 두드러진 합성 경계가 보이지 않았다. 변경 부위의 후드 주름과 명암은 네이티브 도구가 다시 정리했으므로 기존 주름과 픽셀 단위로 같지는 않다.

원작의 후두부 전체는 패널 밖이다. 따라서 새 곡률은 보이는 얼굴·후드·원작 선과 채색을 조건으로 만든 자연스러운 후보이며, 보이지 않는 원작 해부 형태를 정확히 복원했다고 주장하지 않는다. 두상 부피가 사용자의 기대에 충분한지, 새 후드 면 처리와 주름이 원작 스타일에 맞는지는 Claude 독립 검수가 남아 있다. 귀찌는 가려진 상태를 유지했고 새로 드러내거나 추가하지 않았다.
