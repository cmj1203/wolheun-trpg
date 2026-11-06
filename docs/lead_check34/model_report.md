# 입력 분류 평가 (실제 모델 경로, LLM 18097)

자료: docs/research/input_corpus.jsonl · 입력 268개

## 저장소 글에 이미 있는 입력 63개

| id | 입력 | 나온 곳 |
|---|---|---|
| act-a03 | 후드를 깊이 눌러쓰고 천천히 걸어간다 | docs/lead_check30/idle_model.md |
| act-a14 | 그늘에 쪼그려 앉아 저들이 지나가길 기다린다 | docs/lead_check30/idle_model.md |
| act-f01 | 고개를 천천히 뒤로 젖혀 칼끝에서 목을 뗀다 | docs/lead_check30/idle_model.md |
| act-f11 | 숨을 길게 내쉬고 떨리는 손을 꽉 쥔다 | docs/lead_check30/idle_model.md |
| act-f12 | 그대로 뒤로 털썩 주저앉는다 | docs/lead_check34/input_kinds.md |
| act-f13 | 눈물을 뚝뚝 흘린다 | docs/lead_check34/input_kinds.md |
| act-f22 | 입술을 깨물고 남자를 노려본다 | docs/lead_check30/idle_model.md |
| per-a03 | 실례합니다, 길 좀 여쭤도 될까요? | app/tests/input_kind.test.ts |
| per-a05 | 물 좀 나눠 주실 수 있나요? | app/tests/input_kind.test.ts |
| per-a07 | 거기 멈춰! 누구냐! | app/tests/input_kind.test.ts |
| per-f01 | 칼부터 좀 내려 주시면 안 될까요 | app/tests/input_kind.test.ts |
| per-f21 | 됐고, 물이나 좀 줘 | app/tests/input_kind.test.ts |
| per-f25 | 저 아세요? 처음 보는 사이잖아요 | app/tests/input_kind.test.ts |
| per-f29 | 제가 무기라도 든 것처럼 보여요? | app/tests/input_kind.test.ts |
| per-f32 | 웃기지 마 | app/tests/input_kind.test.ts |
| self-a02 | 다리 아파… | app/tests/input_kind.test.ts |
| self-a07 | 집에 가고 싶어… | app/eval/results/kinds-gemma-4-26b-a4b.json |
| self-a08 | 괜찮아, 할 수 있어 | app/tests/input_kind.test.ts |
| self-a10 | 발바닥 다 익겠다 | app/tests/input_kind.test.ts |
| self-a17 | 배에서 꼬르륵 소리 나 | app/tests/gm.test.ts |
| self-a19 | 후, 정신 차려 아시나 | app/tests/input_kind.test.ts |
| self-f01 | 망했다 망했어 | app/tests/input_kind.test.ts |
| self-f04 | 손이 왜 이렇게 떨리지 | app/tests/input_kind.test.ts |
| self-f09 | 하필 이런 데서 걸리냐 | app/tests/input_kind.test.ts |
| self-f11 | 신이시여, 한 번만 살려 주세요 | app/tests/input_kind.test.ts |
| self-f19 | 울면 안 돼, 울면 안 돼 | app/tests/input_kind.test.ts |
| game-a15 | 선택지 없이 그냥 써도 돼? | app/tests/input_kind.test.ts |
| game-a16 | 판정 목표 숫자가 몇이었지? | app/tests/input_kind.test.ts |
| game-a20 | 불러오기 하면 지금까지 한 거 사라져? | docs/lead_check30/idle_model.md |
| game-f08 | 이 남자랑 싸우면 이길 확률 있어? | app/tests/input_kind.test.ts |
| game-f19 | 이 게임 AI가 쓰는 거야? | app/tests/input_kind.test.ts |
| per-fq01 | 너 여기서 뭐 하는 놈이야? | app/tests/input_kind.test.ts |
| per-fq02 | 그 칼 진짜로 쓸 거야? | app/tests/input_kind.test.ts |
| per-fq04 | 내가 뭘 잘못했는데? | app/tests/input_kind.test.ts |
| game-q01 | 저장은 어디서 하나요? | app/tests/input_kind.test.ts |
| game-q04 | 판정은 어떻게 정해지나요? | app/tests/input_kind.test.ts |
| self-fq01 | 이러다 진짜 죽는 거 아니야? | app/tests/input_kind.test.ts |
| out-a04 | ㅋㅋ 개웃기네 이거 | app/tests/input_kind.test.ts |
| out-a08 | 친구가 이거 해 보라고 해서 왔어 | app/tests/input_kind.test.ts |
| out-f03 | 나 지금 수업 시간에 몰래 하는 중 | app/tests/input_kind.test.ts |
| mod-a01 | 휴대폰 꺼내서 지도 앱을 켠다 | app/tests/input_kind.test.ts |
| mod-f03 | 총을 꺼내 남자를 겨눈다 | app/eval/cases.yaml |
| idle-a01 | 가만히 있는다 | docs/lead_check30/idle_model.md |
| idle-a02 | 그냥 서 있다 | docs/lead_check30/idle_model.md |
| idle-a04 | 아무것도 안 한다 | docs/lead_check8/B_joke.txt |
| idle-a06 | 눈만 감는다 | docs/lead_check30/idle_model.md |
| idle-a07 | 포기한다 | docs/lead_check30/idle_model.md |
| idle-a09 | 숨만 쉰다 | docs/lead_check30/idle_model.md |
| idle-f01 | 가만히 있는다 | docs/lead_check30/idle_model.md |
| idle-f02 | 그냥 서 있다 | docs/lead_check30/idle_model.md |
| idle-f03 | 눈만 감는다 | docs/lead_check30/idle_model.md |
| idle-f04 | 멍하니 본다 | docs/lead_check30/idle_model.md |
| idle-f05 | 포기한다 | docs/lead_check30/idle_model.md |
| idle-f06 | 아무 말도 안 한다 | docs/lead_check30/idle_model.md |
| idle-f07 | 칼을 안 피한다 | app/tests/gm.test.ts |
| idle-f08 | 피하지 않는다 | docs/screenshots/always/dry/interject20.json |
| act-near01 | 가만히 다가간다 | app/tests/gm.test.ts |
| act-near02 | 그냥 도망친다 | app/tests/gm.test.ts |
| act-near05 | 포기하지 않고 버틴다 | docs/lead_check34/input_kinds.md |
| idle-h04 | 그대로 굳어 버린다 | docs/lead_check34/input_kinds.md |
| idle-h06 | 체념하고 고개를 떨군다 | docs/lead_check34/input_kinds.md |
| idle-h10 | 손을 내려놓고 칼을 받아들인다 | docs/lead_check34/input_kinds.md |
| idle-h12 | 살길을 찾지 않고 죽음을 기다린다 | docs/lead_check34/input_kinds.md |

## 종류별

| 종류 | 장면 | 입력 | 맞음 | 틀림 | 맞은 비율 |
|---|---|---|---|---|---|
| 행동 | alone | 30 | 30 | 0 | 100% |
| 행동 | facing | 28 | 27 | 1 | 96% |
| 시도없음 | alone | 18 | 18 | 0 | 100% |
| 시도없음 | facing | 20 | 20 | 0 | 100% |
| 건넨말 | alone | 10 | 10 | 0 | 100% |
| 건넨말 | facing | 40 | 40 | 0 | 100% |
| 혼잣말 | alone | 21 | 20 | 1 | 95% |
| 혼잣말 | facing | 21 | 18 | 3 | 86% |
| 게임질문 | alone | 20 | 20 | 0 | 100% |
| 게임질문 | facing | 25 | 25 | 0 | 100% |
| 세계밖 | alone | 17 | 11 | 6 | 65% |
| 세계밖 | facing | 18 | 9 | 9 | 50% |
| 전체 | | 268 | 248 | 20 | 93% |

## 종류 × 실제 처리

| 종류 | 판정 | 흘러감 | 확인카드 | 대꾸 | 혼잣말 | 질문안내 | 세계밖 | 거절 | 되돌림 | 그만확인 | 정체 | 오류 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 행동 | 55 | 1 | 2 |  |  |  |  |  |  |  |  |  |
| 시도없음 |  | 36 |  | 2 |  |  |  |  |  |  |  |  |
| 건넨말 | 20 |  |  | 30 |  |  |  |  |  |  |  |  |
| 혼잣말 | 1 |  |  | 1 | 38 | 2 |  |  |  |  |  |  |
| 게임질문 |  |  |  |  |  | 45 |  |  |  |  |  |  |
| 세계밖 |  |  |  | 6 | 8 | 9 | 12 |  |  |  |  |  |

## 틀린 입력

| id | 종류 | 장면 | 입력 | 기대 | 실제 | 규칙 해석 | GM 해석 | 맞음 |
|---|---|---|---|---|---|---|---|---|
| act-f11 | 행동 | facing | 숨을 길게 내쉬고 떨리는 손을 꽉 쥔다 | 판정 | 흘러감 | improv | idle | X |
| self-f08 | 혼잣말 | facing | 끝났다 이제 | 혼잣말 | 질문안내 | talk | ask game=other | X |
| self-f11 | 혼잣말 | facing | 신이시여, 한 번만 살려 주세요 | 혼잣말 | 판정 | approach plead(1) | approach plead | X |
| self-q01 | 혼잣말 | alone | 나 오늘 운세 최악이었나? | 혼잣말 | 질문안내 | talk | ask about=asina | X |
| self-fq01 | 혼잣말 | facing | 이러다 진짜 죽는 거 아니야? | 혼잣말 | 대꾸 | talk | talk person | X |
| out-a01 | 세계밖 | alone | 잠깐만 화장실 좀 다녀올게 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-a02 | 세계밖 | alone | 아 내일 출근하기 싫다 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-a03 | 세계밖 | alone | 이 그림 누가 그렸지 진짜 잘 그렸네 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-a04 | 세계밖 | alone | ㅋㅋ 개웃기네 이거 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-a05 | 세계밖 | alone | 오늘 저녁 뭐 먹지 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-a08 | 세계밖 | alone | 친구가 이거 해 보라고 해서 왔어 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-f01 | 세계밖 | facing | 와 이 남자 작화 미쳤다 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-f02 | 세계밖 | facing | 잠깐 전화 왔어 | 질문안내 | 대꾸 | talk | talk person | X |
| out-f05 | 세계밖 | facing | 엄마가 밥 먹으래 잠깐만 | 질문안내 | 대꾸 | talk | talk person | X |
| out-f06 | 세계밖 | facing | 지금 새벽 세 시인데 잠이 안 와 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-f07 | 세계밖 | facing | 이거 스트리밍 중인데 시청자들이 인사하래 | 질문안내 | 대꾸 | approach noble(1) | talk person | X |
| out-f10 | 세계밖 | facing | 아 이거 유튜브에서 본 거다 | 질문안내 | 대꾸 | talk | talk person | X |
| mod-f02 | 세계밖 | facing | 112에 신고할게요 | 세계밖 | 대꾸 | talk | talk person | X |
| mod-f05 | 세계밖 | facing | 와이파이 잡히는 데 없어요? | 세계밖 | 질문안내 | talk | ask game=other | X |
| mod-f06 | 세계밖 | facing | 이거 비트코인으로 드릴게요 | 세계밖 | 대꾸 | talk | talk person | X |
