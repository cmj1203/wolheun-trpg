# 33차 readInput 비교

자료: docs/research/input_corpus.jsonl 268개. 원자료: work/demo-slice/raw/readinput.json(readInput 단독), /tmp/lane32/rule.jsonl(합치기 전), /tmp/lane32/rule2.jsonl(연결 뒤).

## 모델 없는 경로

| 입력 종류 | 개수 | 연결 전 규칙 | readInput 단독 | 연결 뒤 규칙 |
|---|---:|---:|---:|---:|
| 행동 | 60 | 60 | 60 | 60 |
| 건넨말 | 50 | 48 | 46 | 47 |
| 혼잣말 | 42 | 19 | 39 | 38 |
| 게임질문 | 45 | 27 | 44 | 44 |
| 세계밖 | 35 | 7 | 12 | 6 |
| 시도없음 | 36 | 27 | 6 | 27 |
| 합계 | 268 | 188 | 207 | 222 |

- 연결 범위: `gm.ts` `byRule` 의 말 방향 판단(question, self, speech)만 readInput 을 쓴다.
- 시도없음은 `isNoAttempt`(27/36)가 readInput(6/36)보다 나아서 그대로 둔다.
- 줄어든 곳: 건넨말 48→47, 세계밖 7→6.

## 모델 경로

연결하지 않았다. 33차 합치기 전 코드의 모델 평가 222개(work/demo-slice/raw/model_a_222.jsonl, 시도없음 없음) 기준으로 readInput 으로 덮어쓰면 맞는 입력이 줄어든다.

| 항목 | 개수 |
|---|---:|
| 모델 틀림 | 25 |
| 그중 readInput 맞음 (얻는 것) | 10 |
| 모델 맞음인데 readInput 틀림 (잃는 것) | 16 |
| 잃는 것 중 세계밖 빼면 | 7 |
