# 5화 베히다트 별칭 적재 차단 수정

2026-11-09. 최종 안정 파일은 `app/content/ep05_audience.yaml`이다. 변경은 `cast.ep05_남성`과 `cast.ep05_라쿤` 두 곳뿐이다.

## 최종 선언과 근거

두 별칭은 `lore: 베히다트`를 유지하며 다음 필드를 갖는다.

```yaml
presentation: cg
faces: [dumbfounded, intrigued, wary, sneer, neutral, menacing]
```

`lore_wolheun.yaml`의 현재 베히다트 `reactions`를 직접 읽었다. hit의 어이없음·흥미, mixed의 경계·냉소, miss의 무표정·위협이 실제 요구하는 표정은 위 여섯 개다. 승인된 이전 화에는 여덟 표정 목록도 있지만 최신 리드 지시에 따라 이번 두 별칭에는 실제 반응 필수 여섯 개만 사용했다. `smile`, `surprised`를 자동으로 추가하지 않았다.

CG 표현 계약은 기존 선언 및 `scenario.ts`의 `faceProblem`/`cgLineProblem`을 읽어 확인했다. `presentation: cg`는 허용 표정 검사를 통과한 뒤 입식 파일 요구를 생략하는 계약이다. 실제 대사에는 유효한 CG가 여전히 필요하다. 사막 입식이나 새 자산을 연결하지 않았다.

## 실제 집중 검증

수정 전 실제 `loadCampaignScenario(app/content/ep01_desert.yaml)` 결과에 현재 로어를 `withNotes`로 붙여 실패를 재현했다. `withNotes`는 같은 로어를 쓰는 모든 별칭에 반응 표정을 검사하므로 빈 `faces`를 가진 두 별칭에서 총 16개 오류가 발생했다. 공유 반응표·검증기를 수정하지 않았다.

최종 여섯 표정 선언 뒤 같은 실제 캠페인 경로를 다시 적재해 검사했다.

| 항목 | 결과 |
|---|---|
| `loadCampaignScenario` → `loadLore` → `withNotes` | 성공 |
| `checkScenario` 엄격 구조 검사 | 오류 0 |
| 베히다트 실제 반응 8개 × 두 별칭의 `faceProblem` | 16건 통과 |
| 캠페인에 포함된 두 별칭의 실제 대사 `cgLineProblem` | 9줄 통과 |
| CG 없는 `neutral` 대사 | 두 별칭 모두 거절 |
| 허용하지 않은 `smile`, `surprised`, `scared` | 두 별칭 모두 거절 |
| 두 별칭의 `lore`·CG 표현·정확한 필수 표정 집합 | 일치 |
| 두 별칭의 사막 입식 연결 | 없음 |

검사는 상주 JS 커널에서 실제 모듈의 공개 함수를 호출해 실행했다. 실제 호출 경로는 다음과 같다.

```ts
const campaign = await loadCampaignScenario(root + '/app/content/ep01_desert.yaml');
const lore = await loadLore(root + '/app/content/lore_wolheun.yaml');
const scenario = withNotes(campaign, lore);
checkScenario(scenario);
// 실제 lore.characters.베히다트.reactions의 모든 줄을 두 별칭의 faceProblem에 전달했다.
// 실제 linesOfBeat 결과 중 두 별칭의 모든 줄을 cgLineProblem에 전달했다.
```

수정 전 YAML 전체를 메모리에 보관한 뒤, 최종 YAML에서 두 별칭에 추가한 `presentation`과 `faces`만 제거해 깊은 동등 비교를 수행했다. **나머지 전체 데이터가 동일했다.** `ep05_entry`, 거리 성공 경로·기억, 관객 시점, c044 분리, 인사·되물음 플래그, 원문 줄·CG·지도는 변경하지 않았다.

TypeScript·공유 파서·타입을 수정하지 않았으므로 새 전역 타입 검사나 전체 시험을 실행하지 않았다. 이 증거는 실제 엄격 로더·로어·표정/CG 집중 검증이다. 기존 31/5 시험은 재실행하지 않았고, 4→5 전체 재검증은 continuation 소유자가 안정화 신호 뒤 실패 범위만 수행한다. 5→6은 시작하지 않았다.

## 승인된 안정화 보고

집중 검사가 통과한 직후 문서 작성보다 먼저 승인된 명령으로 다음 내용을 보고했다.

```sh
DORI_HOME='/Users/choeminju/.dori' bun '/Users/choeminju/dori-superagent/src/cli.ts' report wolheun-episodes03-10 --text '5화 긴급 차단 수정 안정화: app/content/ep05_audience.yaml의 ep05_남성/ep05_라쿤 두 별칭만 lore 베히다트 유지, presentation cg, 실제 반응 필수6표정 dumbfounded/intrigued/wary/sneer/neutral/menacing으로 수정했습니다. 실제 loadCampaignScenario(ep01_desert)+withNotes 적재 성공, 반응16건/실제 대사CG9줄 통과, checkScenario 오류0, CG 없는 줄과 허용 밖 표정 거절 유지. 두 별칭 외 데이터는 수정 전과 동일하고 ep05_entry/거리/POV/인사 플래그 보존. continuation은 실패했던4→5범위만 재검증해 주세요. 5→6은 시작하지 않았습니다. 신규 증거 문서 docs/continuation/build/ep05/cg-alias-fix.md를 곧 기록하고 종료합니다.'
```

실제 결과: `REPORTED wolheun-episodes03-10`.

보고에는 두 별칭·필수 여섯 표정·실제 적재 성공·반응 16건·CG 9줄·엄격 구조 오류 0·검증기 거절 유지·두 별칭 외 데이터 보존을 명시했다. continuation에 실패한 4→5 범위만 재검증하도록 알렸고 5→6 미시작도 명시했다.

다른 YAML·공유 코드·로어·도우미·UI·모델·서버는 수정하거나 실행하지 않았다. 커밋·crq·사용자 접촉도 하지 않았다.
