# 정본 접근법과 즉흥 사건 검사

실제 모델 검수 67은 `b08_gaze`에서 준비 입력 세 건을 소진했다. 10개 행동, 모델 추적 13건, 생성 문장 13줄을 기록했으며 완주하지 못했다.

첫 시도는 `(고개를 들고 붉은 눈을 똑바로 마주한다) 길을 잃었을 뿐이에요.`였다. 실제 분류는 `action`, `approach=stare_back`, `target=stare_back`, `scope=ready`, `deed=""`였다. 입력 충실도 검사를 통과했지만, 이후 모든 action에 적용되던 빈 deed 검사가 정본 접근법까지 거절했다. 정본 접근법은 시나리오에 정의된 결과를 실행하며 해당 deed를 쓰지 않는다.

`LocalGm.interpret`의 준비 완료 검사에서 즉흥 사건을 실행하는 경우에만 deed 검사를 적용하도록 수정했다. 목표의 존재·조건, 입력 충실도, scope 검사는 유지했다. 범위 제안에 필요한 deed 검사도 유지했다.

| 검증 | 결과 |
| --- | --- |
| 수정 전 정본 접근법의 빈 deed 엔진 시험 | 판정이 발생하지 않아 실패 |
| 수정 전 빈 deed 즉흥·큰 행동 두 시험 | 거절을 유지해 통과 |
| 수정 후 입력 충실도·혼합 시도 시험 | 26 통과, 0 실패, 단언 94개 |
| 프로젝트 타입검사 | 종료 코드 0, 진단 없음 |

시험은 정본 접근법의 실제 주사위 이벤트·성공 플래그·check 기록을 확인한다. 즉흥 사건과 큰 행동의 빈 deed는 계속 거절한다. 모델을 모사한 경계 회귀이며 실제 모델 진행 통과를 뜻하지 않는다.

실제 검수 68은 검수 67에서 획득한 `canonical_first_7` 저장부터 같은 입력으로 재개했다. 저장은 `b08_gaze`, 루트 seed 913, 루트 세션 `qa-canonical_first-1794244329776`, SHA-256 `a0e41dfa95e774e18198470dcfe412da1f2484d06b04924122c8bff8e7605e62`이다. 재개 도구가 파일 해시와 newGame 출발 계보를 검증했다. 상태나 결말을 주입하지 않았다.

같은 입력은 실제 모델에서도 `stare_back`으로 분류됐고, `[4,3] + 매력 2 + 입력한 말 1 = 10`의 성공 판정 뒤 `b09_verdict`, `e_survivor`로 진행했다. 이 결함의 실제 판정 재현은 통과했다. 생성된 반응은 이전 대사의 반복 검사에 걸려 정본 대사로 처리됐으므로 생성 문장 품질 통과로 확대하지 않는다.

검수 68은 이어서 2화로 진입했으나 `ep02_unlock`의 입력 세 건을 소진해 종료 코드 1로 끝났다. 자물쇠를 여는 기술은 이미 확정돼 있고 화면 질문은 `금속 소리를 내지 않으려면 핀을 어떻게 움직일까?`이다. 기존 입력들은 잠금을 여는 동작을 적었고, 분류기가 여기에 순찰을 피하려는 목적까지 보탠 후보를 충실도 검사가 거절했다. 이 거절을 우회하지 않고 소음을 줄여 들키지 않은 채 밖으로 나간다는 후속 입력 한 건을 기존 세 입력 뒤에 추가했다. 원래 실패 기록은 유지한다.

검수 69는 검수 68에서 실제 획득한 `canonical_resume_2` 저장부터 재개 중이다. 해당 저장은 `ep02_unlock`, SHA-256 `e6affd5bce945a5d9862cdc584203fb4a7388d1186b617cfaf3d01183d3b7f9e`이며 위 루트 세션과 seed를 이어받는다. 준비 검증과 타입검사는 통과했고 실제 진행 결과는 미확인이다.

검수 67의 생성 문장 13줄은 직접 읽었다. 남자 대사의 `길을 잃었다라.`는 부자연스러운 인용 종결로 후속 문법 검수 대상이다. 정본 접근법 수정으로 이 문장 문제까지 해결됐다고 간주하지 않는다.

증거:

- `work/continuation/qa/representative-final67.log`
- `work/continuation/qa/real-1794244329773/canonical_first.jsonl`
- `work/continuation/qa/canonical68-red.log`
- `work/continuation/qa/canonical68-green.log`
- `work/continuation/qa/canonical68-strict.log`
- `work/continuation/qa/representative-resume68.log`
- `work/continuation/qa/real-1794244615665/canonical_resume.jsonl`
- `work/continuation/qa/lock69-strict.log`
- `work/continuation/qa/lock69-prepared.json`
- `work/continuation/qa/representative-resume69.log`

CodeRabbit은 앞서 변경 파일 수 상한으로 요청이 거절된 상태다. 이 수정은 아직 CodeRabbit 검토를 받지 않았다.
