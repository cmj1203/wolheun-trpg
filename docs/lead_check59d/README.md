# 59d 확인 자료

## 원인
- ① b06 에서 대화 한 번 뒤의 말은 `silentReaction` 으로 가는데, 이 경로가 말을 "지금 보이는 몸 반응"으로 감싸 비웃으라는 지시만 주었다. 출력 JSON 은 `text` 다음에 `face` 라서, 모델이 차가운 대사를 먼저 쓰고 그 말투에 맞춰 sneer 를 골랐다(59c 7/8). 말 반응 검사(`reaction_response`)도 몸 반응 질문이라, 제대로 받은 말 줄을 거절해 대체 줄로 떨어뜨렸다(1차 11번).
- ② 판정 결과에는 아시나 줄이 없어 아시나 표정을 정하는 곳이 없었다. `asina_neutral.png` 자체가 옅게 웃는 그림이라 칼 앞에서도 웃는 얼굴로 보였다.

## 고친 것(커밋 없음)
- `app/src/engine/engine.ts`: 건넨 말이면 반응 경로에 `spoken` 을 넘긴다. 판정 이벤트에 상황 규칙 표정(`hero`)을 싣는다: (대)성공 smug, 대가 있는 성공 wary, 실패 scared(혼자면 flustered).
- `app/src/engine/types.ts`: roll 이벤트에 `hero` 칸.
- `app/src/gm/prompt.ts`: 말이면 "칼끝 앞에서 그에게 한 말"로 받고 `SPOKEN_READ`(애원·아첨인지 태연한 용건인지 먼저 가림)를 붙인다(b04~b06 대화 경로에도). `FACE_RULE` 에 face 는 말투가 아니라 속 반응이라는 것과 아첨 sneer 우선을 넣었다. 출력 스키마에서 `face` 를 `text` 앞에 둔다.
- `app/src/gm/gm.ts`: 말이면 `reaction_response`·`reaction_style` 검사 질문을 말에 맞게 바꾼다.
- `app/web/main.ts`: roll 이벤트의 `hero` 표정으로 입식을 바꾼다.
- 테스트: `app/tests/faces59d.test.ts`(새 파일), `app/tests/validate.test.ts`(스키마 순서).

## 파일
- `model_table.md`: 1~5차 표정 대조, 5차 시간과 59c 비교.
- `run1_*` ~ `run5_*`: 회차별 로그·상태·요청 원문. `model_run.log`·`model_sequential.json`·`model_requests.jsonl` 은 5차와 같다.
- `hero_wary_07.png`, `hero_wary_07_next.png`: 7번 판정(대가 있는 성공) 뒤 아시나 wary(모델 없는 시험 포트 18193).
- `face_intrigued_09.png`: 9번 "칼 좀 내려 주실래요? 목이 따끔해서요." 에 남자 intrigued(26B 시험 포트 18191, 실제 콘텐츠).
- `tests.log`, `tsc.log`: bun test 711 pass·0 fail, tsc 오류 0.
- 시험 스크립트: `app/scripts/lead_check59d_model.ts`.
