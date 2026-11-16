# 2화 청취 단정 문구 삭제 반영

사용자의 `[디스코드] ㅇㅇ 삭제해` 승인에 따라 뒤 문장만 삭제했다. 앞 문장과 다른 시나리오 내용은 보존했다.

대상은 `app/content/ep02_captivity.yaml:1614`, `ep02_court_boundary.ending.summary` 한 곳이다.

- 전: 궁정에서 크롬웰의 정보를 캐내자는 제안이 나왔다. 아시나는 이 대화를 듣지 못했다.
- 반영 후: 궁정에서 크롬웰의 정보를 캐내자는 제안이 나왔다.

`docs/lead_check80/audience_connection_review.md`와 `work/continuation/audience80/source-product-bindings.json`에서 아시나의 청취 여부는 긍정·부정 모두 확정하지 못했다. 따라서 확인되지 않은 청취 단정만 제거했다.

원작 대응 근거는 보존한다. 이 반영을 전체 스토리 QA·미술 승인이나 실행 중 서버 갱신으로 확대하지 않는다.

검증은 수정 전후 전체 문자열 대조로 승인된 삭제 외 제품 변경이 없음을 확인했고, 기존 `loadScenario`로 반영된 요약을 읽었다. `continuation_perspective.test.ts`는 12 PASS / 0 FAIL / 30 assertions, exit0이었다. YAML LSP는 기존 미설치 상태라 실제 로더와 집중 시험으로 검증했다.
