# 입력 분류 평가 (규칙 경로, --no-llm)

자료: docs/research/input_corpus.jsonl · 입력 268개

## 저장소 글에 이미 있는 입력 78개

| id | 입력 | 나온 곳 |
|---|---|---|
| act-a03 | 후드를 깊이 눌러쓰고 천천히 걸어간다 | docs/lead_check30/idle_model.md |
| act-a14 | 그늘에 쪼그려 앉아 저들이 지나가길 기다린다 | docs/lead_check30/idle_model.md |
| act-f01 | 고개를 천천히 뒤로 젖혀 칼끝에서 목을 뗀다 | docs/lead_check30/idle_model.md |
| act-f11 | 숨을 길게 내쉬고 떨리는 손을 꽉 쥔다 | docs/lead_check30/idle_model.md |
| act-f12 | 그대로 뒤로 털썩 주저앉는다 | docs/lead_check34/model_report.md |
| act-f13 | 눈물을 뚝뚝 흘린다 | docs/lead_check34/model_report.md |
| act-f22 | 입술을 깨물고 남자를 노려본다 | docs/lead_check30/idle_model.md |
| per-a03 | 실례합니다, 길 좀 여쭤도 될까요? | docs/lead_check34/model_report.md |
| per-a05 | 물 좀 나눠 주실 수 있나요? | docs/lead_check34/model_report.md |
| per-a07 | 거기 멈춰! 누구냐! | docs/lead_check34/model_report.md |
| per-f01 | 칼부터 좀 내려 주시면 안 될까요 | docs/lead_check34/model_report.md |
| per-f21 | 됐고, 물이나 좀 줘 | docs/lead_check34/model_report.md |
| per-f25 | 저 아세요? 처음 보는 사이잖아요 | docs/lead_check34/model_report.md |
| per-f29 | 제가 무기라도 든 것처럼 보여요? | docs/lead_check34/model_report.md |
| per-f32 | 웃기지 마 | docs/lead_check34/model_report.md |
| self-a02 | 다리 아파… | docs/lead_check34/model_report.md |
| self-a07 | 집에 가고 싶어… | docs/lead_check34/model_report.md |
| self-a08 | 괜찮아, 할 수 있어 | docs/lead_check34/model_report.md |
| self-a10 | 발바닥 다 익겠다 | docs/lead_check34/model_report.md |
| self-a17 | 배에서 꼬르륵 소리 나 | docs/lead_check34/model_report.md |
| self-a19 | 후, 정신 차려 아시나 | docs/lead_check34/model_report.md |
| self-f01 | 망했다 망했어 | docs/lead_check34/model_report.md |
| self-f04 | 손이 왜 이렇게 떨리지 | docs/lead_check34/model_report.md |
| self-f08 | 끝났다 이제 | docs/lead_check34/model_report.md |
| self-f09 | 하필 이런 데서 걸리냐 | docs/lead_check34/model_report.md |
| self-f11 | 신이시여, 한 번만 살려 주세요 | docs/lead_check34/model_report.md |
| self-f19 | 울면 안 돼, 울면 안 돼 | docs/lead_check34/model_report.md |
| game-a15 | 선택지 없이 그냥 써도 돼? | docs/lead_check34/model_report.md |
| game-a16 | 판정 목표 숫자가 몇이었지? | docs/lead_check34/model_report.md |
| game-a20 | 불러오기 하면 지금까지 한 거 사라져? | docs/lead_check30/idle_model.md |
| game-f08 | 이 남자랑 싸우면 이길 확률 있어? | docs/lead_check34/model_report.md |
| game-f19 | 이 게임 AI가 쓰는 거야? | docs/lead_check34/model_report.md |
| per-fq01 | 너 여기서 뭐 하는 놈이야? | docs/lead_check34/model_report.md |
| per-fq02 | 그 칼 진짜로 쓸 거야? | docs/lead_check34/model_report.md |
| per-fq04 | 내가 뭘 잘못했는데? | docs/lead_check34/model_report.md |
| game-q01 | 저장은 어디서 하나요? | docs/lead_check34/model_report.md |
| game-q04 | 판정은 어떻게 정해지나요? | docs/lead_check34/model_report.md |
| self-q01 | 나 오늘 운세 최악이었나? | docs/lead_check34/model_report.md |
| self-fq01 | 이러다 진짜 죽는 거 아니야? | docs/lead_check34/model_report.md |
| out-a01 | 잠깐만 화장실 좀 다녀올게 | docs/lead_check34/model_report.md |
| out-a02 | 아 내일 출근하기 싫다 | docs/lead_check34/model_report.md |
| out-a03 | 이 그림 누가 그렸지 진짜 잘 그렸네 | docs/lead_check34/model_report.md |
| out-a04 | ㅋㅋ 개웃기네 이거 | docs/lead_check34/model_report.md |
| out-a05 | 오늘 저녁 뭐 먹지 | docs/lead_check34/model_report.md |
| out-a08 | 친구가 이거 해 보라고 해서 왔어 | docs/lead_check34/model_report.md |
| out-f01 | 와 이 남자 작화 미쳤다 | docs/lead_check34/model_report.md |
| out-f02 | 잠깐 전화 왔어 | docs/lead_check34/model_report.md |
| out-f03 | 나 지금 수업 시간에 몰래 하는 중 | docs/lead_check34/model_report.md |
| out-f05 | 엄마가 밥 먹으래 잠깐만 | docs/lead_check34/model_report.md |
| out-f06 | 지금 새벽 세 시인데 잠이 안 와 | docs/lead_check34/model_report.md |
| out-f07 | 이거 스트리밍 중인데 시청자들이 인사하래 | docs/lead_check34/model_report.md |
| out-f10 | 아 이거 유튜브에서 본 거다 | docs/lead_check34/model_report.md |
| mod-a01 | 휴대폰 꺼내서 지도 앱을 켠다 | docs/lead_check34/model_report.md |
| mod-f02 | 112에 신고할게요 | docs/lead_check34/model_report.md |
| mod-f03 | 총을 꺼내 남자를 겨눈다 | docs/lead_check34/model_report.md |
| mod-f05 | 와이파이 잡히는 데 없어요? | docs/lead_check34/model_report.md |
| mod-f06 | 이거 비트코인으로 드릴게요 | docs/lead_check34/model_report.md |
| idle-a01 | 가만히 있는다 | docs/lead_check30/idle_model.md |
| idle-a02 | 그냥 서 있다 | docs/lead_check30/idle_model.md |
| idle-a04 | 아무것도 안 한다 | docs/lead_check34/model_report.md |
| idle-a06 | 눈만 감는다 | docs/lead_check30/idle_model.md |
| idle-a07 | 포기한다 | docs/lead_check30/idle_model.md |
| idle-a09 | 숨만 쉰다 | docs/lead_check30/idle_model.md |
| idle-f01 | 가만히 있는다 | docs/lead_check30/idle_model.md |
| idle-f02 | 그냥 서 있다 | docs/lead_check30/idle_model.md |
| idle-f03 | 눈만 감는다 | docs/lead_check30/idle_model.md |
| idle-f04 | 멍하니 본다 | docs/lead_check30/idle_model.md |
| idle-f05 | 포기한다 | docs/lead_check30/idle_model.md |
| idle-f06 | 아무 말도 안 한다 | docs/lead_check30/idle_model.md |
| idle-f07 | 칼을 안 피한다 | docs/lead_check34/model_report.md |
| idle-f08 | 피하지 않는다 | docs/screenshots/always/dry/interject20.json |
| act-near01 | 가만히 다가간다 | docs/lead_check34/model_report.md |
| act-near02 | 그냥 도망친다 | docs/lead_check34/model_report.md |
| act-near05 | 포기하지 않고 버틴다 | docs/lead_check34/model_report.md |
| idle-h04 | 그대로 굳어 버린다 | docs/lead_check34/model_report.md |
| idle-h06 | 체념하고 고개를 떨군다 | docs/lead_check34/model_report.md |
| idle-h10 | 손을 내려놓고 칼을 받아들인다 | docs/lead_check34/model_report.md |
| idle-h12 | 살길을 찾지 않고 죽음을 기다린다 | docs/lead_check34/model_report.md |

## 종류별

| 종류 | 장면 | 입력 | 맞음 | 틀림 | 맞은 비율 |
|---|---|---|---|---|---|
| 행동 | alone | 30 | 30 | 0 | 100% |
| 행동 | facing | 28 | 28 | 0 | 100% |
| 시도없음 | alone | 18 | 14 | 4 | 78% |
| 시도없음 | facing | 20 | 14 | 6 | 70% |
| 건넨말 | alone | 10 | 10 | 0 | 100% |
| 건넨말 | facing | 40 | 37 | 3 | 93% |
| 혼잣말 | alone | 21 | 20 | 1 | 95% |
| 혼잣말 | facing | 21 | 18 | 3 | 86% |
| 게임질문 | alone | 20 | 19 | 1 | 95% |
| 게임질문 | facing | 25 | 25 | 0 | 100% |
| 세계밖 | alone | 17 | 3 | 14 | 18% |
| 세계밖 | facing | 18 | 3 | 15 | 17% |
| 전체 | | 268 | 221 | 47 | 82% |

## 종류 × 실제 처리

| 종류 | 판정 | 흘러감 | 확인카드 | 대꾸 | 혼잣말 | 질문안내 | 세계밖 | 거절 | 되돌림 | 그만확인 | 정체 | 오류 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 행동 | 58 |  |  |  |  |  |  |  |  |  |  |  |
| 시도없음 | 10 | 28 |  |  |  |  |  |  |  |  |  |  |
| 건넨말 | 11 |  |  | 36 | 2 | 1 |  |  |  |  |  |  |
| 혼잣말 | 1 |  |  | 2 | 38 | 1 |  |  |  |  |  |  |
| 게임질문 |  |  |  |  | 1 | 44 |  |  |  |  |  |  |
| 세계밖 | 8 |  |  | 4 | 16 | 2 | 5 |  |  |  |  |  |

## 틀린 입력

| id | 종류 | 장면 | 입력 | 기대 | 실제 | 규칙 해석 | GM 해석 | 맞음 |
|---|---|---|---|---|---|---|---|---|
| act-f12 | 시도없음 | facing | 그대로 뒤로 털썩 주저앉는다 | 대꾸 | 판정 | improv | improv plain | X |
| act-f13 | 시도없음 | facing | 눈물을 뚝뚝 흘린다 | 대꾸 | 판정 | improv | improv plain | X |
| per-f11 | 건넨말 | facing | 하, 겁주려는 거면 실패야 | 대꾸/판정 | 혼잣말 | talk | talk self | X |
| per-f22 | 건넨말 | facing | 무슨 오해가 있는 것 같은데요 | 대꾸/판정 | 질문안내 | talk | ask 대상없음 | X |
| per-f23 | 건넨말 | facing | 말로 하자, 말로 | 대꾸/판정 | 혼잣말 | talk | talk self | X |
| self-f02 | 혼잣말 | facing | 진짜 죽는 거 아냐 이거 | 혼잣말 | 대꾸 | talk | talk 대상없음 | X |
| self-f11 | 혼잣말 | facing | 신이시여, 한 번만 살려 주세요 | 혼잣말 | 판정 | approach plead(1) | approach plead | X |
| self-f14 | 혼잣말 | facing | 정신 똑바로 차리자 | 혼잣말 | 대꾸 | talk | talk 대상없음 | X |
| game-a11 | 게임질문 | alone | 여기서 뭘 쳐야 되는지 모르겠어 | 질문안내 | 혼잣말 | talk | talk self | X |
| self-q01 | 혼잣말 | alone | 나 오늘 운세 최악이었나? | 혼잣말 | 질문안내 | talk | ask 대상없음 | X |
| out-a01 | 세계밖 | alone | 잠깐만 화장실 좀 다녀올게 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-a02 | 세계밖 | alone | 아 내일 출근하기 싫다 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-a03 | 세계밖 | alone | 이 그림 누가 그렸지 진짜 잘 그렸네 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-a04 | 세계밖 | alone | ㅋㅋ 개웃기네 이거 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-a05 | 세계밖 | alone | 오늘 저녁 뭐 먹지 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-a06 | 세계밖 | alone | 이 웹툰 다음 화 언제 나와 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-a07 | 세계밖 | alone | 배터리 10퍼 남았네 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-a08 | 세계밖 | alone | 친구가 이거 해 보라고 해서 왔어 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-a09 | 세계밖 | alone | 브금 좋다 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-a10 | 세계밖 | alone | ㅎㅎ 재밌네 이 게임 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-f01 | 세계밖 | facing | 와 이 남자 작화 미쳤다 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-f02 | 세계밖 | facing | 잠깐 전화 왔어 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-f03 | 세계밖 | facing | 나 지금 수업 시간에 몰래 하는 중 | 질문안내 | 대꾸 | talk | talk 대상없음 | X |
| out-f04 | 세계밖 | facing | 이 남자 최애 될 듯 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-f05 | 세계밖 | facing | 엄마가 밥 먹으래 잠깐만 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-f06 | 세계밖 | facing | 지금 새벽 세 시인데 잠이 안 와 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-f07 | 세계밖 | facing | 이거 스트리밍 중인데 시청자들이 인사하래 | 질문안내 | 판정 | approach noble(1) | approach noble | X |
| out-f08 | 세계밖 | facing | 키보드 자판이 끈적거려 | 질문안내 | 혼잣말 | talk | talk self | X |
| out-f10 | 세계밖 | facing | 아 이거 유튜브에서 본 거다 | 질문안내 | 대꾸 | talk | talk 대상없음 | X |
| mod-a03 | 세계밖 | alone | 드론을 날려서 저 사람들을 찍는다 | 세계밖 | 판정 | improv | improv plain | X |
| mod-a04 | 세계밖 | alone | 선글라스를 낀다 | 세계밖 | 판정 | improv | improv plain | X |
| mod-a05 | 세계밖 | alone | GPS로 내 위치를 확인한다 | 세계밖 | 판정 | improv | improv plain | X |
| mod-a07 | 세계밖 | alone | 오토바이를 타고 저쪽으로 달린다 | 세계밖 | 판정 | improv | improv plain | X |
| mod-f01 | 세계밖 | facing | 노트북을 열어서 남자한테 보여 준다 | 세계밖 | 판정 | approach bag(1) | approach bag | X |
| mod-f02 | 세계밖 | facing | 112에 신고할게요 | 세계밖 | 대꾸 | talk | talk person | X |
| mod-f05 | 세계밖 | facing | 와이파이 잡히는 데 없어요? | 세계밖 | 질문안내 | talk | ask 대상없음 | X |
| mod-f06 | 세계밖 | facing | 이거 비트코인으로 드릴게요 | 세계밖 | 대꾸 | talk | talk person | X |
| mod-f07 | 세계밖 | facing | 라이터를 켜서 칼날에 갖다 댄다 | 세계밖 | 판정 | improv | improv plain | X |
| mod-f08 | 세계밖 | facing | 블루투스 이어폰을 귀에 꽂는다 | 세계밖 | 판정 | improv | improv plain | X |
| idle-a09 | 시도없음 | alone | 숨만 쉰다 | 흘러감 | 판정 | improv | improv plain | X |
| idle-h01 | 시도없음 | alone | 모래 위에 털썩 앉아만 있는다 | 흘러감 | 판정 | improv | improv plain | X |
| idle-h04 | 시도없음 | alone | 그대로 굳어 버린다 | 흘러감 | 판정 | improv | improv plain | X |
| idle-h06 | 시도없음 | alone | 체념하고 고개를 떨군다 | 흘러감 | 판정 | improv | improv plain | X |
| idle-h07 | 시도없음 | facing | 그냥 당한다 | 흘러감 | 판정 | improv | improv plain | X |
| idle-h08 | 시도없음 | facing | 눈도 깜빡 않는다 | 흘러감 | 판정 | improv | improv plain | X |
| idle-h10 | 시도없음 | facing | 손을 내려놓고 칼을 받아들인다 | 흘러감 | 판정 | improv | improv plain | X |
| idle-h12 | 시도없음 | facing | 살길을 찾지 않고 죽음을 기다린다 | 흘러감 | 판정 | improv | improv plain | X |
