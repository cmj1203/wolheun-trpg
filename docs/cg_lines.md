# 웹툰 컷 CG 대체 목록

웹툰 컷 CG 20개가 대사 23곳에 붙어 있었다. 모두 빼고 배경, 입식, 연출로 바꿨다. 대사는 바꾸지 않았다. 새로 넣은 효과음은 원작 대본(`assets/ep01/ep01_script.md`)에 있는 것만 썼다.

그림 레인(`assets/ep01/gen/cg/`)의 새 CG 를 받으면 `app/content/ep01_desert.yaml` 의 `cgs` 에 등록하고 해당 줄에 `cg:` 를 다시 붙인다.

> 그림 레인 파일 연결 뒤(11-03): `cg_drink`, `cg_now`, `cg_last`, `cg_beauty`(3곳), `cg_swing`, `cg_lean` 만 새 CG 로 다시 붙였다. 나머지는 아래 표대로 CG 없이 연출한다.

| 비트 | 대사 | 뺀 CG | 원작 컷 | 지금 연출(*는 새로 넣음) |
|---|---|---|---|---|
| b01_sand | 속마음: 심지어 물도 다 떨어져 가고… | cg_drink | c031 | sfx: 꿀꺽, *face: wary |
| b02_people | 아시나: 응? | cg_notice | c032 | face: surprised, sfx: 흠칫 |
| b02_people | 아시나: 이봐요! 저기요! | cg_run | c034 | face: smile, sfx: 탓 |
| b03_ask | 남자: …… | cg_meet | c036 | *face: wary |
| b03_ask | 아시나: 혹시 크라차까지 가는 길을 아시나요? | cg_ask | c039 | *face: smile |
| b04_blade | 나레이션: 그리고 현재. | cg_now | c040 | sfx: 스릉, fx: flash |
| b04_blade | 남자: 마지막으로 할 말은 있나? | cg_last | c041 | face: wary, fx: shake |
| b04_blade | 남자: 없다면, 잘 가라. | cg_raise | c043 | sfx: 화악, *face: wary, *fx: shake |
| b04_blade | 남자: ……왜지? | cg_why | c046 | face: wary |
| b05_why | 아시나: 대륙에서 하나뿐인, 미소녀니까요. | cg_beauty | c049 | face: smile, *fx: flash |
| b05_why | 남자: …뭐? | cg_what | c050 | face: surprised |
| b05_why | 아시나: 왜냐하면 저는… 대륙에서 하나뿐인, 미소녀니까요. | cg_beauty | c049 | face: smile, *fx: flash |
| b05_why | 남자: …뭐? | cg_what | c050 | face: surprised |
| b05_why | 아시나: 저, 저는… 대륙에서 하나뿐인 미소녀라서요! | cg_beauty | c049 | *face: surprised |
| b06_swing | 남자: 웃기는 여자군. | cg_laugh | c054 | face: smile |
| b06_swing | 속마음: 미친―! 피해야 돼!! | cg_swing | c057 | *face: surprised, *fx: shake, *sfx: 부웅 |
| b07_rule | 아시나: 반칙이지!!! | cg_foul | c059 | *face: surprised, *fx: shake, *sfx: 버럭 |
| b07_rule | 남자: 반칙? | cg_rule | c060 | face: smile |
| b07_rule | 속마음: 마치… 한여름의 태양 같아. | cg_sun | c063 | sfx: 오싹, *face: surprised, *fx: flash |
| b07_rule | 나레이션: 터벅, 터벅. 남자가 천천히 다가오더니 몸을 숙여 내 얼굴을 들여다보았다. | cg_lean | c067 | *sfx: 터벅 |
| b09_verdict | 남자: 하. | cg_stare | c070 | sfx: 빠안, *face: neutral |
| b09_verdict | 아시나: 뭬야?! | cg_angry | c071 | face: surprised, sfx: 빠직 |
| b09_verdict | 남자: 여자. | cg_point | c075 | *face: smile |
