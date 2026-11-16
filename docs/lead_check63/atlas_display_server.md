# 지도 표시 서버 통합

2026-11-09. `display-integration.md`에 따라 부모 소유 `app/src/server/main.ts`를 수정했다. 지도 담당의 웹·공유 지도 파일은 수정하지 않았다.

## 연결

- 새 판은 반환할 scene 이벤트로 playback을 생성한다.
- 행동 시작에 begin을 한 번, 실제 이벤트 송신 콜백에서 enqueue를 한 번 호출한다. 완료 뒤 step.events를 다시 등록하지 않는다.
- 모든 새 엔진 로그 수집 전에 prepareAtlasDisplay를 호출한다.
- `/api/atlas/view`는 실제 송신 큐의 첫 장면과 key/version/visit를 검증한다. 세션 busy만으로 표시 확인을 거절하지 않는다.
- 수동 저장의 실제 화면 및 지도 체크포인트 화면은 packAtlasView로 검증하고 서버 atlas 표식으로 덮는다.
- load/restart는 적용할 실제 view와 step.events로 playback을 복원한다. restart에서 engine.resume은 한 번만 호출한다.

## 직접 검사

- 새 `branch-map-display.test.ts` 5 pass, 0 fail.
- 변경한 `atlas_http63.test.ts` 최종 6 pass, 0 fail, 101 expect, 82ms, exit 0.
- `tsc --noEmit` exit 0.
- 기존 지도 시험의 옛 10건을 새 표시 계약 증거로 사용하지 않았다. 이번 숫자는 표시 모듈 5건과 실제 서버 HTTP 6건의 별도 실행 결과다.

HTTP 회귀는 송신 큐 순서·미래 장면 거부·키/버전/방문 거부·한 번 확인한 토큰 거부, busy 중 표시 확인, 수동 저장 표식 위조 덮기, 중간 화면/큐 복원, 서로 다른 판의 체크포인트, 재시작 때 tracks/items/flags/log/RNG/time 보존을 검사했다. busy 검사는 실제 세션의 busy 플래그를 설정한 제어 시험이며 실모델 스트리밍 시험은 아니다. 실제 행동 스트림의 scene을 한 번씩 확인하면 토큰이 null이 되는 시험으로 완료 뒤 중복 등록이 없음을 검사했다.

## 실제 noLLM 화면

사용자 파일과 분리한 시험 서버 18195, Ego 전용 공간 13에서 실제 버튼·Space로 진행했다. 상태·DOM을 우회 변경하지 않았다. 경로는 길 묻기 → 결백 호소 → 가방 방패 → 시선 유지 → 계속이다.

| 지점 | 실제 관찰 | 캡처 |
|---|---|---|
| 감옥 첫 scene, 대사 큐 중간 | `낯선 돌바닥`이 1화 지도 현재 위치. 엔진 마지막 비트는 이미 ep02_unlock이지만 display 마지막은 ep02_prison_wake | map-prison-mid-ep01.png |
| 같은 시점의 2화 | 장면 이름과 현재 위치 미공개, 아직 방문한 장면 없음 | map-prison-mid-ep02-locked.png |
| 같은 큐를 실제로 읽은 뒤 | `자물쇠의 걸림쇠`가 표시된 뒤에만 2화 `창살의 자물쇠`가 현재 위치로 공개. 다음 노드는 미발견 | map-lock-visible-ep02.png |

캡처 경로는 이 문서와 같은 폴더다. 세 파일은 ls로 존재 확인했다. 별도 Claude 시각 검수 st_01a1be35는 세 장 모두 PASS로 확인했다. 시각 검수는 그림만 확인했고, 실제 버튼·대사 진행은 부모가 직접 수행했다. 검수자가 집계 숫자와 노드 수의 차이를 지적했으며 현재 도달 숫자는 노드 방문 수가 아닌 arrivals 집계다. 화면의 임시 배경은 기존 후속 자산 상태이며 이번 서버 변경에서 고치지 않았다.

검증 완료 후 Ego 공간13을 finish하고 소유 noLLM 서버 bash_77/18195를 종료했다. 코드레빗은 crq add 한 번을 시도했으나 기준8ed0dbf9부터271파일이150한도를 넘어 등록되지 않았다. 커밋·기준 변경은 하지 않았다.

## 별도 공유 모듈 검토 요청

부모가 읽은 atlas.ts에는 아래 엔진 이력 참조가 남아 있어 지도 담당과 리드에게 정확한 위치를 전달했다. 새 공유 코드 패치는 리드 재검토 전 적용하지 않았다.

- buildAtlas의 세션 없는 currentRun: display.runs가 비었을 때 record.last로 fallback.
- 추가 pairs 생성: display.paths 대신 record.paths 참조.
- nextHint: display.beats 대신 record.beats로 이미 방문했는지 판단.

따라서 위 실제 세션 화면과 서버 프로토콜 검사 통과를 공유 지도 모듈의 모든 미래 정보 차단 완료로 확대하지 않는다. 실모델·전체 스토리 QA도 실행하지 않았다. 모델18192와 사용자18080/18081은 건드리지 않았다.
