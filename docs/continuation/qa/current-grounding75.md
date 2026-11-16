# 현재 장면과 생성 문장 교열

실제 검수 70의 생성 네 줄을 읽고 두 문제를 확인했다.

| 장면 | 문제 |
| --- | --- |
| `ep02_unlock`, 성공 | 소리 없이 잠금쇠가 풀린 결과에 `달칵, 소리 없이`라는 모순을 넣음 |
| `ep02_question`, 일반 대답 | 팔을 붙잡힌 재회 장면을 칼날을 들이댄 상황으로 바꿈 |

기존 교열 요청을 같은 모델에 재현해도 두 문장을 그대로 승인했다. 문맥 대조 문장만 추가한 실험은 소리 모순을 찾기도 했지만 칼날 전제는 찾지 못했다. 별도 정합성 판정 실험도 팔을 붙잡고 위압적인 상황이면 칼날 위협이 맥락상 일치한다고 승인했다. 해당 실험 응답에는 중복 문장 번호도 있었으므로 실행 코드에 적용하지 않았다.

원작 `ep02_c035`는 남자가 한 손으로 손목을 잡고 다른 손으로 허리를 붙든 구도다. 실제 합본 `work/ep02/merged/ep02_010.png`의 `[18724,26391)` 영역을 추출해 직접 확인했다. 칼을 들이대지 않는다. 칼이 어디 보관돼 있는지는 이 컷만으로 단정하지 않았다.

추궁 장면의 기존 GM 문맥에는 팔을 붙잡혔다는 정보만 있고 양손의 상태가 빠져 있었다. 원작에서 확인한 양손 상태와 칼 위협 장면이 아니라는 사실을 이 문맥에 추가했다. 교열 지시에는 절별 긍정·부정 대조와 현재 신체·도구·물건 상태의 근거 확인을 앞에 명시했다. 기존 교열 응답 계약과 재생성 경로를 유지했다. 교정문을 화면에 직접 치환하지 않는다.

실제 모델 실험 75의 결과:

| 입력 | 결과 |
| --- | --- |
| 원래 소리 모순 문장 | 모순을 찾아 교정 차이를 반환 |
| 원래 칼날 전제 문장과 원작 상태 문맥 | 근거 없는 칼날 부분을 찾아 교정 차이를 반환 |
| 소리 모순을 제거한 대조 문장 | 원문 유지 |
| 현재 장면에서 가능한 표정·시선 반응 | 원문 유지 |

반복 진단한 두 오류와 정상 대조 두 건의 결과다. 다른 문장이나 모든 장면에 대한 독립 평가를 뜻하지 않는다.

직접 회귀는 교열 문맥 전달, 전체 문장 재생성, 짧은 반응, 의도적 단편, 교열 실패 차단을 포함해 8 통과, 0 실패, 단언 28개였다. 전체 캠페인 준비 파싱은 `prepared=true`, 모델 호출 0건이었다. 타입검사는 종료 코드 0, 진단 없음이었다. YAML 언어 서버는 설치돼 있지 않으며 기존 시나리오 로더로 파싱을 검증했다.

실제 검수 75는 검수 70의 `canonical_resume_4` 저장에서 재개 중이다. `ep02_question`, 루트 세션 `qa-canonical_first-1794244329776`, seed 913, 저장 SHA-256 `ed6d3a14f6581a827a7bfbacd6612f8f1c7b7ac0bec185b47aa9f355879b290d`이다. 파일 해시와 실제 newGame 출발 계보를 검사하며 상태를 주입하지 않는다.

추궁 장면의 원래 세 입력은 그대로 남겼다. 화면에 공개된 예시처럼 탈옥 수단을 감추려는 의도를 명시하는 네 번째 입력을 추가했다. 원래 세 입력의 거절을 통과로 바꾸지 않는다. 실제 재개 결과와 이후 대사 검수는 미완이다.

증거:

- `work/continuation/qa/grounding71-probe.log`
- `work/continuation/qa/grounding72-probe.log`
- `work/continuation/qa/grounding73-probe.log`
- `work/continuation/qa/consistency74-probe.log`
- `work/continuation/qa/grounding75-probe.log`
- `work/continuation/qa/source-ep02-c035.png`
- `work/continuation/qa/grounding75-regression.log`
- `work/continuation/qa/grounding75-prepared.json`
- `work/continuation/qa/grounding75-strict.log`
- `work/continuation/qa/representative-resume75.log`

CodeRabbit은 기존 파일 수 상한 거절로 미검토 상태다.
