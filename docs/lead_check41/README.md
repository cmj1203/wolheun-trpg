# 41차: 베히다트 입식의 가린 눈

| 항목 | 내용 |
|---|---|
| 대상 | `assets/sprites/pilot/behidat_{neutral,smile,surprised,wary}.png` (원본 백업 `assets/sprites/pilot/old_1106b/`) |
| 원작 대조 | 1~10화에서 정면·3/4 얼굴 73컷: 그 눈이 다 보임 19, 앞머리 사이로 일부 보임 44, 다 가림 10(음영 연출·사선 구도). 기본 입식은 '앞머리가 눈썹·윗눈꺼풀 일부를 덮고 가닥 사이로 눈이 보임'으로 정함. 표·근거: `behi_eye_survey.md`, 얼굴 모음 `orig/orig_faces_01~05.jpg`, 참고 `orig/ref_*.png` |
| 고친 법 | 얼굴(256px)만 4배로 키워 아스트라로 편집(같은 장의 다른 눈과 짝, 가는 선, 같은 표정). 줄여서 원본 입식 위에 그 눈 둘레 타원(중심 490,237, 34×22)만 얹음. 터번·옷·몸 비율·크기·위치·다른 눈·입은 원본 픽셀 그대로 |
| 전후 | `faces_before_top_after_bottom.jpg`(위 전, 아래 후), 원작 참고와 함께 `orig_before_after_faces.jpg` |
| 게임 화면 | 시험 서버 18191, 1440: `game/game_behidat_neutral_1440.png`, `game/game_behidat_smile_1440.png` (surprised·wary 는 이 시드 경로에서 나오지 않아 입식 파일 `sprites_after/` 로 확인) |
