# 7화 내부 구현 검증

검증일: 2026-11-09.

| 범위 | 실행과 결과 |
|---|---|
| 독립 파싱 | 실제 `loadScenario('app/content/ep07_harem.yaml')`: `ep07_harem`, 시작 c001, 63비트, `checkScenario` 오류 0 |
| 원문 대조 | 17장·63컷·10장면. 컷별 전사의 발화·독백·작은 글 118개와 구현 대사를 대조해 누락 0. 표제·크레디트와 무언·효과음 컷도 구현 |
| 행동 테스트 | `bun test ./app/tests/ep07_internal.test.ts --timeout 10000`: 최종 8 통과, 0 실패, 단언 830개, 47ms, 종료 코드 0 |
| 회귀 검출 | c003의 `ep03_짐_수중없음=false`를 의도적으로 true로 바꾸면 c004 직전 검증이 예상 false/실제 true로 실패. 원본 복원 후 위 전체 테스트 통과 |
| 타입 진단 | `app/tests/ep07_internal.test.ts`의 LSP 전체 진단 0. 저장소 전체 타입 검사는 실행하지 않음 |
| 자산 경계 | 실제 엔진의 모든 대사 이벤트가 첫 줄부터 해당 컷 CG를 유지. 참조된 63파일 모두 assets 안 실제 경로·PNG 서명 확인 |
| 사전·단독 로더 | `loadCampaignScenario`가 2화를 덧붙이지 않음. 기존 시트·items·sprites·공유 기본 화자 정의와 일치 |
| 상태 보존 | 이전 재고를 귀찌 하나로 둔 시험판에서도 반환품을 추가하지 않음. 기존 수치·난수·입력 기억 보존. 청록복과 미반환 묶음 사실은 지정 시점에 종료 |
| 지도 | 실제 10장면과 9연결의 방문 경로 기록. 가짜 갈림길·6→7·7→8 연결 없음 |

판정할 불확실한 행동이 없으므로 goals·성공/대가 성공 분기를 만들지 않았다. 독백과 단순 산책은 입력 없이 진행한다. 실제 GM 모델은 호출하지 않았으며 판정이나 모델 응답의 품질을 검증한 결과가 아니다.

독자 전용 면담·타인 독백은 아시나의 입력 기억이나 새 수첩 정보에 추가되지 않는다. 현재 엔진의 화면 이력 `recent`·`spoken`에는 남는다. 실제 모델이 이 이력을 아시나의 경험으로 오해하지 않는지는 부모 QA 범위다.

증거:

- `app/content/ep07_harem.yaml`
- `app/tests/ep07_internal.test.ts`
- `docs/continuation/build/ep07/tests.log`
- `docs/continuation/build/ep07/mutation.log` — 의도적 회귀 실패 기록
- `docs/continuation/build/ep07/source-coverage.json`
- `docs/continuation/build/ep07/bridge.md`
- `docs/continuation/build/ep07/art-dependencies.md`

미완료 의존성: 6화 전체 대조와 재고·이름 공개 경계 확정, 8화 첫 컷 경계 확정, Astra 생성 그림·원작 대조, PC 브라우저와 실제 모델 전 구간 QA. 기존 원작 확인용 컷은 완성 생성 CG가 아니다. YAML 언어 서버가 설치되어 있지 않아 편집기 YAML 진단은 실행하지 못했으며 실제 엔진 파서로 검증했다. 사용자·모델 포트, 공유 엔진·UI·lore, 다른 화, 커밋·푸시·코드레빗 대기열은 변경하거나 실행하지 않았다.
