# 55차 A: 이미지 편집 도구 실행 실패

2026-11-06. 목걸이·터번 보석 및 추가 지시 50b 눈 재작화 후보를 만들지 못했다.
`assets/`는 쓰지 않았고, 커밋·crq·로컬 모델·서버 실행은 하지 않았다.

## 노출된 이미지 생성·편집 도구

이 세션에 실제 선언된 네이티브 이미지 생성·편집 도구 목록:

```text
namespace image_gen
imagegen(args: { prompt?: string | null }) => any
target channel: commentary
```

도구는 목록에 있었으므로 참조와 확대 입력을 준비했다. 실제 호출은 아래 오류로 두 번 모두 실패했다.
이미지 바이트·첨부·출력 파일 경로는 반환되지 않았다. 생성이 되는 세션이라고 보고할 수 없다.

## 정확한 오류

두 호출 모두 같은 오류:

```text
Image generation failed: <class 'caas.internal.errors.UserError'>
```

첫 호출은 원작 확대·스타일 시트·중립 가슴 확대 입력을 읽은 뒤, 원작 장신구 구조와 보존 범위를 상세히 지정했다.
두 번째는 `functions.read`로 가슴 입력 한 장을 직접 다시 첨부하고 프롬프트를 짧게 바꿨다.
두 번째도 같은 오류가 나와 중단했다. 실패 원인이 파일 첨부인지 서비스 상태인지 식별할 추가 진단은 반환되지 않았다.

첫 호출 프롬프트:

```text
Edit the attached enlarged sprite chest crop input_chest_6x.png (834x1320) ONLY, using the attached original webtoon chest reference crops ref_c064_chest.png and ref_c007_chest.png plus behidat_style_sheet.png as shape/style guidance. Return a single edited chest crop with the EXACT same framing and crop boundaries, same skin, red scarf, garment geometry and original warm anime painted shading. This is a surgical jewelry correction, NOT a new character or a sheet. Keep the necklace route and pendant center position unchanged. Replace the short necklace's spherical golden beads with a strand of thin flat oval gold plates alternating with hollow oval rings, following the clear original c064 design. Replace the long thin twisted chain with elongated gold cylindrical tubes alternating with groups of small round beads, as seen clearly in c007. The large hanging red pendant must be a faceted cut red gemstone with visibly angular internal facets and a detailed gold filigree oval setting, NOT a smooth cabochon. Put a small red teardrop gem immediately ABOVE the large pendant between chain and pendant, as in original c007. Maintain the size and position of the large pendant and original upper short strand. Do not enlarge the jewelry beyond the existing routes more than necessary. Match the target sprite line thickness, warm colors and shaded illustration style; no blinding sparkles, no text, no labels, no comparison layout. Output only the edited chest image. If a filesystem output location can be chosen, save in /Users/choeminju/월흔_trpg/work/demo-slice/lane55/A/generated_chest.png.
```

두 번째 호출 프롬프트:

```text
Edit this attached chest crop. Preserve exactly the same composition and painting style. Change only jewelry: short necklace = thin flat oval gold plates alternating with hollow rings; long necklace = long gold tubes alternating with small beads; pendant = a faceted red cut gemstone in ornate gold filigree with a small red teardrop just above it. Keep necklace positions and all skin and clothes unchanged. Return one edited image, no text.
```

## 재개에 사용할 준비 자료

아래는 편집 결과가 아니라 입력과 측정 자료다. 경로는 `work/demo-slice/lane55/A/` 기준이다.

| 파일 | 내용 |
|---|---|
| `input_chest_6x.png` | 중립 가슴 `(445,310,584,530)`, 6배 확대 |
| `input_turban_6x.png` | 중립 터번 `(460,132,543,205)`, 6배 확대 |
| `ref_c007_chest.png` | 원작 긴 관·구슬·세공 펜던트·작은 물방울 보석 |
| `ref_c047_chest.png` | 원작 목걸이 보조 참조 |
| `ref_c064_chest.png` | 원작 짧은 타원판·고리 연결 |
| `ref_c007_turban.png` | 원작 팔각 보석·장식 금틀 |
| `original_overview.jpg` | 원작 세 컷 위치 확인용 |
| `source_faces.jpg` | 네 표정의 가슴·터번 원본 비교 |
| `source_diff.json` | 중립 대비 원본 영역 RGBA 차이 |
| `source_registration.json` | ±4px 범위 정렬 탐색 |
| `prepare.py` | 위 자료 준비 코드 |

원작에서 작은 붉은 물방울 보석은 큰 펜던트 바로 **위**, 목걸이 줄과 큰 펜던트 사이에 있다.
허리 벨트·금색 커프스는 보존 대상임을 지시문과 기준 문서에서 확인했다.

네 표정의 가슴·터번은 픽셀 단위로 동일하지 않다. 같은 좌표의 영역에서 중립 대비 최대 차이는 다음과 같다.

| 표정 | 가슴 최대 채널 차이 | 터번 최대 채널 차이 |
|---|---:|---:|
| smile | 104 | 128 |
| surprised | 113 | 255 |
| wary | 128 | 134 |

±4px 탐색에서는 모든 표정·두 영역 모두 `(dx,dy)=(0,0)`이 최소 평균제곱차였다.
육안으로도 배치는 일치한다. 단, 색·미세 픽셀 차이가 있으므로 가슴 또는 터번 사각형 전체를 덮어쓰면 각 표정 원본의 주변 픽셀이 바뀐다.
재개 시 장신구를 좁게 따는 마스크로 각 표정의 원래 피부·천·알파를 보존해야 한다.

## 미완료 항목

- 목걸이·터번 보석의 실제 이미지 편집과 네 표정 합성.
- 50b의 표정별 왼쪽 눈 재작화, 앞머리 연결, 선명도와 윗눈꺼풀 이중선 보정.
- 수정 후 D/E 재측정. 리드 전달 전값은 neutral 1.067, smile 1.000, surprised 0.906, wary 0.980이며 이번 세션에서 재측정한 수치가 아니다.
- 완성 후보, `A_compare.jpg`, `A_eyes_zoom.jpg`, 최종 마스크 밖 0·알파·캔버스 검증 JSON.

새 후보가 없으므로 위 증거를 원본 복사본으로 대신 만들거나 통과했다고 기록하지 않았다.
준비 코드는 `uv run --with pillow --with numpy python work/demo-slice/lane55/A/prepare.py`로 정상 실행됐다.
편집기 기본 Python 환경은 Pillow·NumPy를 찾지 못하지만, uv 실행 환경에는 두 패키지가 있다.
