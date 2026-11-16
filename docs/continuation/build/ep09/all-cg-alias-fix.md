# 9화 전체 CG 별칭과 실제 1~9화 합성

2026-11-09. 실제 캠페인 합성을 막던 9화의 원작 CG 입식 별칭을 수정했다.

## 원인

`loadCampaignScenario(ep01_desert.yaml)`는 실제 2~9화 파일을 읽어 각 장을 연결할 때마다 `checkScenario`를 실행한다. 입식 검증은 같은 lore를 가진 배우의 sprite를 모두 수집한다.

9화는 아시나 등의 원작 컷을 `sprite: ep09_c009`처럼 선언했다. 이 때문에 1~8화의 같은 인물이 `smile` 등의 실제 표정을 검사할 때도 `ep09_c009_smile`, `ep09_c075_smile`, `ep09_c068_smile` 같은 존재하지 않는 입식을 요구했다. 황제 두 별칭의 반응만 고쳐서는 이 문제를 해결할 수 없었다.

앞선 황제 전용 검사의 수동 1화 비트 합성은 이번 실제 캠페인 로더 검사로 교체했다. 기존 반응·CG 거절 검사는 유지했다.

## 수정 범위와 인물 계약

`app/content/ep09_palace.yaml`의 speech/thought 별칭 15개가 모두 `presentation: cg`를 사용한다. 이미 고친 황제 두 별칭을 유지하고 남은 13개를 수정했다. 동행자는 입식이 없었지만 같은 실제 CG 출력 계약을 명시했다.

| 실제 lore | 적용 별칭 | 정확한 허용 표정 |
|---|---|---|
| 아시나 | 아시나·독백·밤아시나·밤독백·상상 | neutral, smile, surprised, wary, flustered, scared, indignant, smug, tired |
| 베히다트 | 황제·황제독백 | dumbfounded, intrigued, wary, sneer, neutral, menacing |
| 카림 | 카림 | neutral, wary, flustered |
| 나시르 | 수행자·수행자독백·나시르·나시르독백 | neutral, smile |
| ep09_장발대족장 | 장발·대족장 | neutral, smile |
| ep09_대족장동행 | 동행 | neutral |

표정은 실제 `lore_wolheun.yaml`의 인물별 지침과 반응, 기존 1화 아시나 배우의 정식 표정 목록을 직접 대조했다. 상상은 표시 이름에 나시르가 있어도 실제 lore가 아시나이므로 아시나 계약을 쓴다. 베히다트는 실제 반응에 필요한 여섯 개이며 자동으로 여덟 개를 허용하지 않는다.

두 버전의 YAML을 파싱하고 cast를 제외한 데이터를 비교한 결과가 완전히 같았다. 대사·CG·그림 파일·아이템·효과·관객 선언·정체성·아틀라스·장 연결은 보존했다. 남은 sprites 사전과 자산 파일도 삭제하지 않았다. 1~8화·공유 엔진·continuation·GM·로어는 수정하지 않았다.

## 실제 검증

전용 회귀 파일은 `app/tests/ep09_cg_alias.test.ts`다.

- 수정 전: 24개 중 10개 통과·14개 실패. 실제 9화 연결에서 기존 아시나 배우까지 없는 입식 오류로 실패했다.
- 수정 후: 24개 통과·실패 0개, 522개 단언, 종료 코드 0.
- 실제 `loadCampaignScenario`를 1화 경로로 호출하고 9화 마지막 비트의 존재를 확인했다. 반환값에 실제 `loadLore` 결과를 `withNotes`로 연결한 뒤 `checkScenario`가 오류 0개임을 확인했다. 수동 host 합성이 아니다.
- 15개 별칭 전부에서 실제 인물별 표정, 입식 부재, CG 출력 계약을 검사했다. 존재하는 각 고정 줄의 CG 선언과 파일 실재도 확인했다.
- 황제·황제독백의 실제 공유 반응 표정 조합을 검사했다. CG 없는 줄·존재하지 않는 CG·미승인 표정은 실제 Engine 진입에서 계속 거절한다.
- `cd app && tsc --noEmit` 종료 코드 0. 이번 검사에는 앞선 동시 작업의 타입 오류도 남아 있지 않았다.

일반 입식 검증·미선언 표정 검증·CG 없는 출력 거절을 바꾸지 않았다. 다른 화의 그림 제작과 실제 모델·서버·HTTP QA는 실행하지 않았다.

실제 합성과 타입 검사 통과 직후 `dori send lead`로 차단 해소를 알렸고 `DELIVERED lead`를 확인했다. 전달 전에 두 검사 로그와 타입 검사 로그를 `ls`로 확인했다. continuation·demo 담당이 이후 저장 HTTP QA를 진행할 수 있도록 결과를 전달한 것이며, 해당 QA까지 이 작업이 실행했다는 뜻은 아니다.

## 증거와 재현

- `docs/continuation/build/ep09/all-cg-alias-before.log`
- `docs/continuation/build/ep09/all-cg-alias-after.log`
- `docs/continuation/build/ep09/all-cg-alias-typecheck.log`

```sh
bun test --timeout 30000 ./app/tests/ep09_cg_alias.test.ts
cd app && tsc --noEmit
```
