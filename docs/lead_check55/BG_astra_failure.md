# 55차 배경·지도 네이티브 생성 실패

2026-11-06, 이미지 편집 하위 작업의 실제 호출 결과.

## 사용 가능한 이미지 도구와 결과

| 도구 | 노출된 입력 | 이번 결과 |
|---|---|---|
| `image_gen.imagegen` | `prompt` | 근경 편집 요청 2회 모두 빈 반환. 이미지·파일 경로·오류 본문을 받지 못함 |
| `functions.generate_image` (`tool.generate_image`) | `prompt`, `model`, `size`, `quality`, `reference_image_paths`, `mask_image_path`, `background`, `output_format`, `output_compression`, `moderation`, `n`, `output_path` | 네이티브 도구로 보내라는 응답. `generated=0`, `paths=[]`, `reason=provider_native_bypass` |

`generate_image`의 정확한 반환 문구:

> Image generation is handled by the provider's native server-side tool for the current model. Call the native image_generation tool instead of generate_image.

추가 필드: `source="none"`, `images=[]`, `hasError=false`. 따라서 `hasError=false`를 생성 성공으로 해석하면 안 된다.

네이티브 도구가 없었던 것은 아니다. 도구가 노출되어 실제 호출했지만 사용할 수 있는 결과가 없었다. 중간 보고의 `UserError` 표기는 잘못된 표현이며, 실제 네이티브 반환에는 그 오류 문자열도 없었다.

## 입력과 시도

- 현재 `desert_near.png`, 원작 `ep01_c029.png`, `asina_style_sheet.png`를 이미지 첨부로 열고 네이티브 편집을 요청했다.
- 네이티브 1차: 현재 배경을 기준으로 오른쪽 붉은 바위 절벽, 왼쪽 바위 더미, 마른 나무·선인장을 추가하고 사람을 제외하는 편집.
- 네이티브 2차: 같은 참조를 바탕으로 텍스트를 줄인 근경 배경 편집.
- 파일 경로 인자를 지원하는 `generate_image`에도 현재·원작·시트의 절대 경로 3개를 전달했다. 출력 예정 경로는 `work/demo-slice/lane55/bg/desert_near_native.png`였으나 파일은 생성되지 않았다.
- 이 마지막 호출은 도구의 16 배수 제한에 맞춰 `1920x1088`로 요청했다. 성공했다면 원래 `1920x1080`으로 맞춘 뒤 검증할 계획이었으며, 실제 크기 변환은 수행하지 않았다.

마지막 호출 프롬프트:

```text
Edit the current near desert background toward the original ep01_c029 terrain: red sandstone pillars at right, layered low rock piles at left, sparse dead trees and cacti. No people, text, or borders. Preserve current pale gold sand, blue sky and fine webtoon lines. Use the third image as style reference only. Return one PNG candidate.
```

## 판정

위 네이티브 도구 시도는 실패했으나, 2026-11-06 후속 Codex CLI 원격 편집으로 이 결론을 대체한다. `work/demo-slice/lane55/bg/`에 `desert_near.png`, `desert_wide.png`, `item_map.png` 후보 3개가 생성되었다.

원경 1920×1080 RGB, 마스크 바깥 변경 0픽셀. 지도 512×512 RGBA, 기존 알파와 차이 0픽셀, 마스크 바깥 변경 0픽셀. 근경은 원작의 붉은 절벽·바위 더미·마른 나무·선인장을 복원한 1920×1080 RGB 후보다.

`BG_compare.jpg` 후 열은 실제 후보로 교체했다. `BG_mockup.jpg`는 지정 입식을 합성한 1440 폭 가독성 목업이며 실제 서버 캡처는 아니다. 명령·프롬프트·한계와 검증 수치는 `BG_README.md`에 기록했다. 자산 설치, 로컬 모델·서버 실행, 커밋, 코드레빗 요청은 하지 않았다.
