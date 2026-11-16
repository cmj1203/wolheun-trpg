# 가방 손실 차분: 초기 CG 2장과 입식 9종

2026-11-09, 작업 `st_01a1be54`.

선택 버전은 전부 `v5`다. 자체 시각 검수와 화소 검사는 끝났다. **v5의 Claude 독립 재검수와 실제 앱 연결은 아직 하지 않았다. 전체 READY가 아니다.**

안정 매니페스트: `work/continuation/ep02/bag-variants/initial_manifest.json`.

## 연결 계약

- `state.items`에 `magic_bag`가 없을 때 선택한다. `bag_taken` 같은 특정 사건 플래그에 의존하지 않는다.
- 매니페스트의 `cgs`는 기존 CG 키 → 새 PNG, `sprites`는 기존 아시나 표정 이름 → 새 PNG다.
- 가방과 연결 끈만 없앤 계열이다. 이미 얻은 초록 천이나 다른 소지품의 색을 바꾸지 않는다.
- `*_collar` 차분은 포함하지 않는다. 초록 천 소지 여부와 옷깃 사용 분기는 부모가 별도로 연결한다.
- 추가 CG 26개는 부모가 `group_a`·`group_b` 트랙에 배정했다. 이 문서와 매니페스트의 완료 수에는 포함하지 않는다.

## 선택 파일과 화소 수

모든 출력은 `assets/ep02/gen/no_bag/` 아래에 있다.

| 기존 키/입식 | 선택 PNG | 바뀐 화소 | 마스크 밖 변경 |
|---|---|---:|---:|
| `ep02_prod_ep02_c010_citizens` | `ep02_c010_citizens_v5.png` | 2,418 | 0 |
| `ep02_prod_ep02_c011_bag` | `ep02_c011_bag_v5.png` | 148,457 | 0 |
| `asina_neutral` | `asina_neutral_v5.png` | 41,897 | 0 |
| `asina_smile` | `asina_smile_v5.png` | 41,738 | 0 |
| `asina_surprised` | `asina_surprised_v5.png` | 41,788 | 0 |
| `asina_wary` | `asina_wary_v5.png` | 41,909 | 0 |
| `asina_flustered` | `asina_flustered_v5.png` | 41,897 | 0 |
| `asina_scared` | `asina_scared_v5.png` | 41,897 | 0 |
| `asina_indignant` | `asina_indignant_v5.png` | 41,897 | 0 |
| `asina_smug` | `asina_smug_v5.png` | 41,897 | 0 |
| `asina_tired` | `asina_tired_v5.png` | 41,897 | 0 |

CG는 원본과 같은 RGB, 입식은 원본과 같은 RGBA다. 캔버스 크기와 모든 알파 화소를 유지했다. 각 원본 PNG와 매핑의 원작 프레임 SHA256도 초기값과 같다.

## 마스크와 복원 판단

좌표는 원본 기준 `[x0,y0,x1,y1]`, 오른쪽·아래쪽은 제외한다.

| 대상 | 생성 ROI | 최종 마스크 |
|---|---|---|
| c010 | `[450,540,740,880]` | 등 뒤의 실제 가방끈만. 최종 허용 영역 2,694화소 |
| c011 | `[460,680,1120,1380]` | 가방·끈, 그 아래 가려진 천·벽, 손가락 연결. 최종 허용 영역 157,093화소 |
| 입식 9종 | `[390,490,660,990]` | 대각 가방끈과 가방 몸체. 원작 목 리본과 인체 외곽은 보호 |

각 `work/continuation/ep02/bag-variants/<이름>/`에 다음 파일이 있다.

- `mask_v5.png`: ROI 좌표의 실제 합성 마스크.
- `mask_full_v5.png`: 원본 캔버스 좌표의 실제 합성 마스크.
- `verification_v5.json`: 원본·원작 프레임·출력 해시, ROI, 다각형, 경계 확장과 페더 값, 화소 수.
- `comparison_v5.png`: 왼쪽 원본 ROI, 가운데 GPT 출력, 오른쪽 최종 합성.
- `overview_v5.jpg`: 원본과 최종 전체 그림.

`initial_manifest.json`은 위 근거와 추가 보호 영역 검사를 함께 묶는다. 마스크 밖 화소는 원본에서 그대로 복사했다. 천·손의 새 그림은 native GPT 출력만 사용했고 Python은 크롭·마스크·합성·측정만 수행했다.

### c010: 의상 리본을 가방끈으로 잘못 지운 부분 복구

v3에서 목 매듭 아래의 가는 띠를 가방끈으로 오인했다. 인접 원작 `assets/ep02/gen/production/ep02_c009_walking.png`에는 넓은 가방끈과 목 리본 꼬리가 따로 그려져 있다. 따라서 c010 앞쪽의 대각 리본과 코트 경계는 원본으로 돌려놓고, 등 뒤 어깨에서 허리로 내려오는 실제 가방끈만 제거했다.

앞쪽 의상 보호 사각형 `[630,620,690,755]`의 변경 화소는 0이다. 등 뒤는 확인된 끈 다각형 안에서 끈의 색을 분리하고, 원작 머리카락 색 영역과 가장자리를 보호해 마스크를 좁혔다. 단순히 갈색이라는 이유로 다른 의상 선을 지우지 않았다.

### c011: 가방 아래 천과 손 연결

첫 합성의 가슴 주름 접합부, 떠 있는 소매 선, 손 주변 가방 조각을 분리해서 수리했다. 뒤손은 가방에 가려졌던 손가락 연결만 GPT로 복원했다. 기존 손 전체를 교체하지 않았다.

원작의 두 손에서 실제 보이던 피부 13,627화소의 변경은 0이다. 손가락의 새 연결은 원래 가방이 가리던 영역에만 들어간다. 소매·몸통 접합부는 가방끈 아래 천을 가장 가까운 기존 접힘까지 복원했다.

### 입식 9종: 원본이 같은 몸통만 재사용

`neutral/flustered/scared/indignant/smug/tired` 6종의 원본 ROI RGBA 화소 SHA256이 정확히 같았다. 이 6종만 neutral의 GPT 몸통 복원을 재사용했다. 완성 ROI의 화소 SHA256도 서로 같다.

`smile/surprised/wary`는 원본 몸통 화소가 달라 별도 GPT 편집을 했다. 얼굴을 옮기거나 표정을 합성하지 않았다. 9종 모두 ROI 위쪽인 `y < 490`의 변경 화소는 0이다.

v3의 리본 양옆에 남았던 가방색은 실제 리본 외곽보다 넓었던 보호 마스크 때문에 생겼다. 원작 리본의 좁은 외곽과 끝을 다시 따라 보호해 가방색 조각과 직선 절단 모양을 없앴다.

## 원본 해시

두 초기 CG의 파일 SHA256:

- c010: `265151b36e6b8cf567fd151d28e23c68e47f6bc5f9e03272da73dbf7a1eab98d`
- c011: `2b876fd9a947ff6f13cc215ff298682f12d25856bc5e51f249104bf97ffabcea`

11개 원본, 각 원작 프레임, 11개 최종 출력의 전체 해시는 `initial_manifest.json`의 `assets`에 있다. 원본 9종의 ROI 동일성 근거는 `sprite_sources.json`에도 보관했다.

## 애매했던 네 CG

상세 판정과 원작 좌표: `work/continuation/ep02/bag-variants/ambiguous_audit.json`.

| CG | 판정 | 남은 일 |
|---|---|---|
| `c019_hands` | 중앙 고리는 망토 리본이므로 유지. 왼쪽 머리 사이 넓은 띠는 가방 연결 끝이 안 보여 미확정 | 왼쪽 띠 추가 판정 |
| `c022_noticed` | 초록 천 뒤 대각 띠와 손 아래 넓은 띠는 장발과 분리되어 있어 가방끈 후보로 판정(중간 신뢰) | 별도 가방끈 차분 후보 추가. 이 트랙의 최종 범위는 네 컷 판정이어서 편집하지 않음 |
| `c033_touch` | 현재 크롭 안의 세로선은 목 리본. 넓은 가방끈은 원작 문맥에서 크롭 아래쪽에만 보임 | 현재 CG 가방 편집 불필요 |
| `c034_caught` | 확실히 보이는 머리카락·목깃은 유지. 가려진 부위의 연결은 미확정 | 색만으로 삭제하지 않음 |

c022·c033·c034에는 초록 얼굴가림 천이 보인다. 가방 부재만으로 이를 베이지색으로 바꾸면 안 된다.

원작 문맥 비교는 `work/continuation/ep02/bag-variants/<CG이름>_source_context.jpg`에 있다. 왼쪽은 매핑 프레임 위아래 문맥을 포함한 원작, 오른쪽은 실제 CG 크롭이다.

## 실행과 검수 기록

- native GPT 이미지 호출: 총 8회. 초기 CG 2회, 서로 다른 입식 몸통 4회, c011 결함 수리 2회.
- 각 실행의 `command.json`, `process.json`, `done.json`, `generation.log`를 보존했다. 모든 Codex 자식은 `stdin=DEVNULL`, 독립 세션으로 시작했고 완료 파일을 감시했다.
- 초기 c010 PID/PGID `53471`, c011 `53472`; 입식 neutral `55594`, smile `55595`, surprised `55592`, wary `58219`; c011 접합부 수리 `70191`, 손 연결 수리 `86385`. 모두 종료했다.
- 실패한 system `image_gen`을 다시 호출하지 않았다. 로컬 SD, 눈·얼굴 이식, 정상 원본 덮어쓰기를 하지 않았다.
- v1/v2 경계 합성 실험, 독립 검수에서 반려된 v3, 중간 v4는 삭제하거나 덮어쓰지 않았다. 최종 연결에는 v5만 선택한다.
- v3 독립 검수 기록은 `independent_review/initial_v3_review/report.md`에 있다. v5는 그 지적을 고친 뒤 자체 검수했다. **독립 재검수 통과를 뜻하지 않는다.**
- 7개 보조 Python 스크립트 구문 검사와 실제 합성·검증 실행이 성공했다. 편집기 기본 Python에서는 PIL/numpy/cv2를 찾지 못하지만, 실제 실행에 쓴 `tools/.venv/bin/python`에는 설치되어 있다.
- 커밋·푸시·CRQ·원본 매핑·YAML·앱 코드는 건드리지 않았다.

입식 비교표:

- `work/continuation/ep02/bag-variants/sprites_comparison_v5.jpg`
- `work/continuation/ep02/bag-variants/sprite_four_bodies_v5.jpg`

v5 독립 재검수, c019/c022 추가 판정·차분, 다른 26 CG, collar 파생, 실제 앱 연결은 부모의 남은 작업이다.
