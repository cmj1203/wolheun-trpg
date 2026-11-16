# 10화 전체 CG 배우·정식 인물 계약 감사

2026-11-09. 수정 파일은 10화 YAML과 새 `app/tests/ep10_cg_composition.test.ts`다. 공유 검증기·다른 화·자산은 수정하지 않았다.

## 원인과 실제 계약

왕 두 별칭만 검사한 이전 집중 검증은 전체 배우 합성의 증거가 아니었다. `withNotes`는 실제 reactions가 있는 인물의 반응 표정은 검사하지만, 아시나처럼 반응표가 없는 인물의 모든 정식 표정까지 자동으로 보장하지 않는다.

`faceProblem`은 CG 전용 선언이 없는 배우를 검사할 때 같은 lore의 모든 sprite를 수집한다. source-CG 배우에 임시 sprite를 남기면 정식 인물의 표정 검사까지 `ep10_asina_smile` 같은 존재하지 않는 자산을 요구하게 된다. 더구나 10화의 기존 `cast.아시나`는 정식 배우와 동일 키지만 다른 정의여서 실제 합성의 덮어쓰기 금지 계약에도 어긋났다. 단순히 faces만 늘려서는 이 원인을 없애지 못한다.

별칭 이름으로 인물을 추정하지 않고 10화 모든 cast의 lore를 읽었다. 실제 1화·다른 화의 동일 인물 cast와 현재 공유 로어를 대조했다.

| 10화 최종 배우 | 실제 lore | 정확한 표정 계약 | 출력 줄 수 |
|---|---|---|---|
| ep10_아시나 | 아시나 | neutral, smile, surprised, wary, flustered, scared, indignant, smug, tired | 46 |
| ep10_아시나속마음 | 아시나 | 위와 같은 정식 아시나 9표정 | 21 |
| ep10_왕 | 베히다트 | dumbfounded, intrigued, wary, sneer, neutral, menacing | 28 |
| ep10_왕속마음 | 베히다트 | 위와 같은 실제 반응 필수 6표정 | 8 |
| ep10_누르 | 누르 | neutral, smile, surprised | 2 |

아시나의 정확한 9표정은 실제 `ep01_desert.yaml`의 정식 cast.faces와 공유 로어의 인물 지침을 따른다. 베히다트의 6표정은 실제 reactions 8줄의 표정 집합이다. 누르의 3표정은 실제 공유 로어의 인사·보필·놀람 지침이다. 왕에게 아시나 표정이나 정식 남자의 8표정을 복사하지 않았다. 나레이션은 인물 표정 배우가 아니며 그대로 남겼다.

## 교정

- 기존 10화 `아시나` 배우를 `ep10_아시나`로 분리했다. 해당 발화 키 46개와 무대 left 참조 69개를 새 키로 바꿨다. cast 키까지 총 116개 참조 교정이다. display·lore·시트 이름과 발화 내용은 그대로다. 실제 정식 `아시나` 배우와 입식은 캠페인이 원래 정의를 유지한다.
- 아시나 speech/thought와 누르를 `presentation: cg`로 선언하고 위 정확한 표정만 허용했다. 아시나·누르의 임시 sprite 연결만 제거했다. 기존 자산 정의나 그림 파일은 지우거나 변경하지 않았다.
- 이미 올바른 왕 두 별칭의 CG·6표정 계약은 유지했다. 고정 대사에 새로운 감정이나 face를 넣지 않았다.
- CG가 생략돼 앞 화면을 이어 쓰던 선택 응답 세 줄에 같은 기존 그림을 명시했다: c026 머리 이야기 유보 → c026 CG, c029 가족 이야기 유보 → c029 CG, c034 이름만 확인 → c034 CG.

모든 5개 source-CG 인물의 105줄이 유효한 CG 선언을 가진다. 입식으로 원작 컷을 대체하지 않았다.

## 수정 전 회귀 증거

실제 1화와 10화의 cast·sprites·cgs·beats를 읽은 좁은 충돌 fixture를 사용했다. 이는 처음에는 지원되지 않던 1~10화 실제 연결과 구분한다.

새 회귀 실행:

```sh
cd app
bun test ./tests/ep10_cg_composition.test.ts --timeout 10000
```

수정 전 결과: 0개 통과·3개 실패·5개 단언, 49ms, 종료 코드 1.

1. 정식 배우 보존 검사에서 10화 `아시나`가 1화 배우를 덮어 비교가 실패했다. 별도 직접 검사에서도 정식 smile·surprised·wary·flustered·scared·indignant·smug·tired 8표정이 neutral 전용 계약 때문에 거절됐다.
2. 전체 source-CG 배우 검사에서 `presentation` 기대 cg, 실제 undefined로 실패했다.
3. CG 없는 출력 거절 검사에서 CG 전용 선언이 없는 배우가 null을 반환해 실패했다.

테스트는 실제 정식 배우를 모두 보존하고 해당 배우의 원래 faces 전체를 검사한다. 실제 전체 로어의 withNotes도 실행한다. 정식 아시나의 실제 smile 입식 파일 선언을 fixture에서 제거하면 여전히 실패하는지도 검사한다. CG 전용 계약을 이유로 정식 입식의 실재 검증을 완화하지 않았다.

## 수정 후 집중 검사와 엄격 타입

같은 새 회귀만 실행한 결과: 3개 통과·0개 실패·206개 단언, 15ms, 종료 코드 0.

```sh
tsc --ignoreConfig --noEmit --target ESNext --module Preserve --moduleResolution bundler --strict --noUncheckedIndexedAccess --noImplicitOverride --noFallthroughCasesInSwitch --verbatimModuleSyntax --allowImportingTsExtensions --types bun ./tests/ep10_cg_composition.test.ts
```

엄격 타입 결과: 진단 없음, 종료 코드 0. 기존 7개 통과 검사나 전체 테스트는 반복하지 않았다. 새 검사는 전체 10화 source-CG 인물별 표정·105줄의 CG, CG 없는 줄과 미승인 표정 거절, 원래 정식 배우·입식 검사 보존에 한정한다.

수정 직전 YAML 전체를 보관해 배우 키 분리·세 배우의 표시/표정 계약·누락 CG 세 곳만 적용한 기대 선언과 수정 후 전체 YAML을 `Bun.YAML.parse` 및 `Bun.deepEquals`로 대조했다. true였다. 따라서 나머지 발화·CG·효과·분기·공개 시점·c070 미확정 침묵·손목 비판정·호칭 분기·관객 시점 분할·지도는 그대로다.

## 실제 1~10화 합성과 현재 로어

감사 시작 시점에는 continuation이 9화까지만 로드했고 9화 아시나 별칭의 임시 sprite로 인한 실제 정식 표정 오류가 발생했다. 독립 fixture 통과를 실제 1~10화 통과로 바꾸어 보고하지 않았다.

집중 검사 후 continuation 담당의 변경으로 10화 로드와 `ep09_c084 → continue_ep10` 연결이 준비된 것을 직접 확인했다. 최신 continuation 모듈을 새로 불러와 다음 실제 경로를 실행했다.

```ts
const full = await loadCampaignScenario(root + '/app/content/ep01_desert.yaml');
const liveLore = await loadLore(root + '/app/content/lore_wolheun.yaml');
const attached = withNotes(full, liveLore);
checkScenario(attached);
```

실제 결과:

- atlas.chapters 10개, 실제 `ep10_c001`·`ep10_end` 포함.
- 현재 로어 지식 29개 연결 성공.
- 엄격 `checkScenario` 오류 0개.
- 10화 `ep10_아시나.presentation`은 cg, 정식 `아시나.sprite`는 원래 `asina_hood`로 보존.

이 실제 합성 성공 직후 문서 작성보다 먼저 DORI `report wolheun-episodes03-10`으로 10화 선언 차단 해제와 검증 범위를 보고했다. 결과는 `REPORTED wolheun-episodes03-10`, 종료 코드 0이었다. 화면·모델 QA 완료 신호가 아님을 명시했다.

모델·서버·포트·브라우저·공유 파일·다른 YAML·정상 그림 소유 영역·커밋·코드레빗에는 손대지 않았다. YAML 언어 서버는 미설치 상태이며 실제 로더·집중 회귀·엄격 타입·실제 합성으로 확인했다.
