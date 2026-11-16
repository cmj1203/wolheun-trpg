# 공용 lore 적용 기록

2026-11-09. 리드가 검토한 `docs/continuation/build/shared-lore.patch`만 공용 lore에 적용했다. 적용 전 SHA256은 계약의 `e4406fb4787f2f8b5cb11f07a63f4adb0e74cec84c270a0e3c663135ce112918`과 같았고, 적용 후 파일은 그 패치의 메모리 적용 결과와 정확히 같았다.

- 페시안·감옥·시하드 호칭과 기존 지식·기존 인물은 보존했다.
- 하렘만 정적 spoilers에서 제거하고 `ep03_하렘_앎`으로 숨긴다.
- 본명·통치자·라 쿤은 각각 `ep04_name_known`·`ep04_ruler_known`·`ep04_title_known`으로 연다. 옛 단일 정체 플래그는 세 정보를 열지 않는다.
- 안내 시녀·목욕 시녀·잘릴·청록 터번 보고자·알림 시종 정의를 추가했다. 관객 궁정 대화를 아시나 지식으로 추가하지 않았다.

## 직접 실행 결과

| 검사 | 결과 |
|---|---|
| 수정한 공개 경계 시험, lore 적용 전 | 9 pass / 6 fail. 새 공개 플래그로 열리지 않고 옛 단일 플래그로 열리는 기존 동작을 재현 |
| `bun test ./tests/continuation_knowledge63.test.ts --timeout 10000` | 15 pass / 0 fail / 46 expect, exit 0 |
| `tsc --noEmit` | exit 0 |
| 공용 lore 파싱 | 통과 |
| 실제 `loadCampaignScenario(ep01_desert.yaml)`와 공용 lore `withNotes` | ep01+ep02+ep03, 124비트 통과 |
| ep01/02/03/04 독립 시나리오 파싱 | 각각 통과 |
| ep01 단독 withNotes | 통과 |
| ep02/03/04 단독 withNotes | 각각 기존 after 참조 16건 실패. 참조 항목 삭제·여과 없음 |
| 실제 캠페인에 ep04까지 메모리 합성한 withNotes | 통과. ep04의 실제 캠페인 전이 연결을 검증한 것은 아님 |
| 공개 전·하렘 후·본명 후·통치자 후·칭호 후 | spoilersFor/forbiddenIn 경계 통과 |
| 개별 플래그·옛 단일 플래그·관객 접견/소문 플래그 | 실제 LocalGm.screen의 독립 공개 경계 통과 |
| 네 최종 공개 줄의 sets와 궁정 접견 비공개 | 통과 |
| 잘릴 faces만 추가한 현행 CG 배우 입식 제약 | 입식 없음 실패 재현. 별도 presentation 패치 미적용 |

메모리 검증은 검토한 shared-lore-contract.md의 JavaScript를 사용했다. 기준본은 적용 전 문자열, 마지막 파일 검사는 원본 불변 대신 검토 패치 적용 결과와의 정확한 일치로 바꿨다. 메모리 합성 검사와 별도로 실제 3화 캠페인의 withNotes를 실행했다.

## 한계

직접 서버·모델·화면 QA는 실행하지 않았다. 18192와 사용자 서버는 건드리지 않았다. 원작 복장 재감사, 배우 lore 연결, CG presentation 지원은 별도 담당 범위다. YAML 언어 서버가 설치되지 않아 해당 LSP 검사는 못 했으며 실제 파서 검사로 확인했다. 새로운 공유 엔진 패치는 적용하지 않았다.
