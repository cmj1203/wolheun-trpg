# 피드백 처리 로그

게임 화면 [피드백] 단추로 들어온 글은 `app/feedback/feedback.jsonl`(git 제외)에 한 줄씩 쌓인다. 리드가 새 줄을 보고 판단해 레인에 지시한다. 레인은 jsonl 을 직접 보고 고치지 않는다.

| id | 시각 | 비트 | 사용자가 적은 글 | 리드 판단 | 고친 묶음/커밋 | 상태 |
|---|---|---|---|---|---|---|
| (예시·e2e) 07ec9c0d | 2026-11-04T08:58:17Z | b05_why | 여우가 설명을 너무 길게 해요 | — | — | 예시 |

## 한 줄 형식(예시, e2e --no-llm 가 만든 줄)

```json
{"id":"07ec9c0d-663c-4383-9026-99a243ccb79d","receivedAt":"2026-11-04T08:58:17.467Z","version":"0d66f8d","text":"여우가 설명을 너무 길게 해요","at":"2026-11-04T08:58:17.463Z","session":"8afa1f0a-689c-43c3-8142-a41fb323aedc","beatTitle":"왜지?","recent":[{"speaker":"아시나","text":"(억울해…)"},{"speaker":"붉은 눈의 남자","text":"없다면, 잘 가라."},{"speaker":"아시나","text":"잠깐만요, 잠깐! 제 말 좀 들어 봐요!"},{"speaker":"아시나","text":"그것 좀 치워봐요! 난 죽이면 안 돼요."},{"speaker":"붉은 눈의 남자","text":"……왜지?"},{"speaker":"내레이션","text":"쇠 냄새가 코앞까지 왔다. 목에 닿은 칼끝, 남자의 터번, 뒤에 선 호위 둘."}],"tracks":{"의심":3,"집착":0,"호감":0,"귀찌":7,"탈주":0,"행운":6},"askMode":false,"window":{"width":1440,"height":810},"page":"/?fast=1&seed=2","game":{"seed":2,"beat":"b05_why","beatTitle":"왜지?","lastInput":"저기요, 잠깐만요","tracks":{"의심":3,"집착":0,"호감":0,"귀찌":7,"탈주":0,"행운":6},"flags":{"상대_곁":true,"수첩:stars":true,"짚음_별":true,"설명_귀찌":true,"수첩:strangers":true,"안내_입력":true,"다가감":true,"수첩:man":true,"수첩:guards":true,"짚음_보석":true,"칼끝_만남":true},"ending":null}}
```

- 서버가 붙이는 것: `id`, `receivedAt`, `version`(git short hash, 없으면 null), `game`(세션 상태에서 읽은 `seed`·`beat`·`beatTitle`·`lastInput`·`tracks`·`flags`·`ending`).
- 화면이 붙이는 것: `at`, `session`, `beatTitle`, `recent`(최근 줄 6개, 화자·글), `tracks`(화면 수치), `askMode`, `window`, `page`.
- 받는 조건: POST `/feedback`, 127.0.0.1 만, JSON, 16KB 이하, `text` 가 비어 있지 않을 것. 아니면 403/413/400 과 `{ok:false,error}`.
