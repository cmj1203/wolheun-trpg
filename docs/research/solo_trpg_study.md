# 솔로 TRPG 공부 노트 (2026-11-04)

이 문서는 원문 자료를 읽고 정리한 지식 노트다. 우리 게임에 무엇을 넣을지는 정하지 않는다(리드가 정한다). 모든 원문은 `docs/research/sources/` 에 받아 둔 텍스트 파일에서 읽었고, 각 항목에 파일 이름과 SOURCE 주소를 적었다. 영어 규칙 문장은 그대로 옮기고 아래에 한국어 풀이를 붙였다. 파일에 없는 내용은 "자료에 없음"이라고 적었다.

출처 약칭

| 약칭 | 파일 | SOURCE |
|---|---|---|
| 보드라이프 | boardlife_solo_trpg_2025.txt | https://boardlife.co.kr/bbs_detail.php?tb=board_community&bbs_num=66229 |
| DW | dw_gm.txt | https://www.dungeonworldsrd.com/gamemastering/ |
| Ironsworn | ironsworn_moves.txt | https://elstiko.github.io/ironsworn/ |
| Blades 판정 | bitd_action_roll.txt | https://bladesinthedark.com/action-roll |
| Blades 결과 | bitd_consequences.txt | https://bladesinthedark.com/consequences-harm |
| Blades 시계 | bitd_clocks.txt | https://bladesinthedark.com/progress-clocks |
| Fate 결과 | fate_four_outcomes.txt | https://fate-srd.com/fate-core/four-outcomes |
| Fate 강제 | fate_compels.txt | https://fate-srd.com/fate-core/invoking-compelling-aspects |
| Mythic | mythic_chaos.txt | https://oldhobsgameroom.blogspot.com/2025/04/mythic-rpg-project-chapter-7b-chaos.h(파일 첫 줄에서 주소가 잘려 있음) |
| 페이싱 | alex_pacing.txt | https://thealexandrian.net/wordpress/4411/roleplaying-games/the-art-of-pacing |
| 플롯 | alex_dont_prep_plots.txt | https://thealexandrian.net/wordpress/4147/roleplaying-games/dont-prep-plots |
| 세 단서 | alex_three_clue.txt | https://thealexandrian.net/wordpress/1118/roleplaying-games/three-clue-rule |
| Short | emshort_beyond_branching.txt | https://emshort.blog/2016/04/12/beyond-branching-quality-based-and-salience-based- (주소 잘림) |
| Ashwell | ashwell_patterns.txt | https://heterogenoustasks.wordpress.com/2015/01/26/standard-patterns-in-choice-bas (주소 잘림) |
| 솔로GM 논문 | arxiv_solo_gm.txt | https://arxiv.org/html/2502.19519v1 |
| 아첨 논문 | arxiv_sycophancy.txt | https://arxiv.org/abs/2310.13548 |
| CriticaLLM | arxiv_criticallm.txt | https://arxiv.org/abs/2610.21525 |

---

## 1. 솔로 TRPG란 무엇인가

### 1-1. GM 없이 하는 TRPG

보드라이프 글쓴이는 솔로 TRPG를 이렇게 소개한다.

> "DM(던전 마스터) 없이 TRPG를? 가능하다고는 하는데 막상 해보려니 쉽지가 않더라고요. 방법이 어렵다기 보다 익숙해지기가 쉽지 않았습니다. 특별한 기술이 필요하다기 보다 요령이 필요한 케이스라서 경험이 쌓일수록 재밌게 놀 수 있다고 보시면 될 것 같습니다." (보드라이프, 69행)

글쓴이는 OSE(Old-School Essentials)를 규칙으로, Mythic GME를 오라클로 쓴다. Ironsworn 같은 솔로 전용 규칙도 있다고 언급한다(100행). 솔로 플레이에서 무엇이 어려운지도 짚는다.

> "문제는 몬스터나 보물이 어디있는지?, 어떻게 얻는지? 모든 정보를 알고 있으면 재미가 없겠죠. 그래서 DM이 필요하니까요. 솔로 게임에서 이것들을 어떻게 처리하느냐? 이게 솔로 TRPG의 관건이겠죠." (215행)

### 1-2. GM 자리를 무엇이 대신하나

**오라클.** 보드라이프는 "오라클은 말 그대로 신탁입니다. 신? 당연히 주사위 신이죠."라고 쓴다(231행). 아이언스원과 스칼렛 히어로즈는 자체 오라클 표를 갖고 있고, 글쓴이는 "그들의 어머니라고 할 수 있는 Mythic gme"를 쓴다(235행). Ironsworn의 오라클 무브는 이렇다.

```
Ask the Oracle
When you seek to resolve questions, discover details in the world, determine how other characters respond, or trigger encounters or events, you may…
Draw a conclusion: Decide the answer based on the most interesting and obvious result.
Ask a yes/no question: Decide the odds of a 'yes', and roll on the table below to check the answer.
Pick two: Envision two options. Rate one as 'likely', and roll on the table below to see if it is true. If not, it is the other.
Spark an idea: Brainstorm or use a random prompt.
```

풀이: 세계의 세부, 다른 인물의 반응, 사건 발생 여부가 궁금하면 네 가지 중 하나를 고른다. 가장 재미있고 뻔한 답으로 정하기, 확률을 정해 예/아니오 굴리기, 두 후보 중 하나를 '그럴 법함'으로 두고 굴리기, 아이디어 표로 영감 얻기.

**카오스 팩터.** 보드라이프는 이것을 글의 핵심이라고 한다.

> "카오스 팩터가 3정도 수준에서 유지된다면 계획한 대로 차분한 탐정이야기처럼 진행되지만, 7정도 수준이 되면 여기저기 빵빵 터지는 액션 영화처럼 진행이 되죠. 이는 서사적인 리듬을 만들어 주는, 솔로 게임에서 매우 중요한 요소가 됩니다. 사실 이 글의 핵심이죠." (279행)
>
> "결국 오라클과 카오스 팩터가 핵심이고, 그 외에는 창작을 하거나 모듈의 힘을 빌려야 합니다." (393행)

**기록(저널).** 보드라이프 파일에서 '저널', '일지', '기록'을 찾았지만 나오지 않았다. 저널링에 대한 직접 근거는 이번 자료에 없다. Mythic 파일은 "Lists"(인물·사건 목록)를 "a valuable memory aid"(기억 보조)라고 부른다(Mythic, 7행 부근).

### 1-3. GM 없이도 살아 있다고 느끼게 하는 세 가지

1. **불확실성.** 보드라이프 215행처럼 플레이어가 모든 것을 알면 재미가 없다. DW는 GM 의제에 "Play to find out what happens"(무슨 일이 일어날지 알아내려고 플레이하라)를 넣고, "You're most certainly not here to tell everyone a planned-out story"(짜 놓은 이야기를 들려주러 온 게 아니다)라고 쓴다(DW).
2. **결과.** DW는 "You'll honestly portray the repercussions of that action"(그 행동의 여파를 정직하게 보여 준다)라고 쓴다. 행동이 세계를 바꿔야 세계가 살아 있다고 느낀다.
3. **플레이어가 세운 목표.** Blades 판정 절차 1단계는 "The Player States Their Goal"이다. 페이싱 글은 GM이 스스로에게 묻는 두 질문을 "What is the current intention of the PCs? And does anything interrupt that intention?"(지금 PC의 의도는 무엇인가, 그 의도를 막는 것이 있는가)로 정리한다(페이싱, 46행).

---

## 2. 판정과 결과

### 2-1. Ironsworn: 강한 성공, 약한 성공, 실패

Face Danger 카드 원문(Ironsworn, 50~62행).

```
When you attempt something risky or react to an imminent threat, envision your action and roll. If you act...
With speed, agility, or precision: Roll +edge.
With charm, loyalty, or courage: Roll +heart.
With aggressive action, forceful defense, strength, or endurance: Roll +iron.
With deception, stealth, or trickery: Roll +shadow.
With expertise, insight, or observation: Roll +wits.
On a strong hit, you are successful. Take +1 momentum.
On a weak hit, you succeed, but face a troublesome cost. Choose one.
  You are delayed, lose advantage, or face a new danger: Suffer -1 momentum.
  You are tired or hurt: Endure Harm (1 harm).
  You are dispirited or afraid: Endure Stress (1 stress).
  You sacrifice resources: Suffer -1 supply.
On a miss, you fail, or your progress is undermined by a dramatic and costly turn of events. Pay the Price.
```

풀이: 위험한 일을 할 때는 *어떻게* 하는지에 따라 능력치가 정해진다(빠르게, 매력으로, 힘으로, 속임수로, 지식으로). 강한 성공은 그냥 성공에 기세 +1, 약한 성공은 성공하되 귀찮은 대가 하나, 실패는 극적이고 값비싼 반전이 온다.

Pay the Price 카드 원문(Ironsworn, 349행 부근).

```
Pay the Price
When you suffer the outcome of a move, choose one.
Make the most obvious negative outcome happen.
Envision two negative outcomes. Rate one as 'likely', and Ask the Oracle using the yes/no table. On a 'yes', make that outcome happen. Otherwise, make it the other.
Roll on the following table. If you have difficulty interpreting the result to fit the current situation, roll again.
1-2 Roll again and apply that result but make it worse. ...
3-5 A person or community you trusted loses faith in you, or acts against you.
6-9 A person or community you care about is exposed to danger.
10-16 You are separated from something or someone.
```

풀이: 실패하면 가장 뻔한 나쁜 결과를 내거나, 두 후보 중 오라클로 고르거나, 표를 굴린다. 표 항목은 신뢰하던 사람의 배신, 아끼는 사람의 위험, 무언가와의 분리 같은 이야기 사건이다. 표는 17행 이후도 이어지지만 이번에 읽은 구간은 10-16까지다.

푸는 문제: 실패가 "아무 일도 없음"이 되지 않게 한다. 실패도 이야기를 앞으로 민다. 강한/약한 성공의 정확한 주사위 수치는 이번에 읽은 카드 구간에 나오지 않았다.

### 2-2. Dungeon World: GM 의제, 원칙, 무브

의제 원문(DW).

```
Portray a fantastic world
Fill the characters' lives with adventure
Play to find out what happens
```

풀이: 환상적인 세계를 보여 준다, 인물의 삶을 모험으로 채운다, 무슨 일이 일어나는지 알아내려고 플레이한다. DW는 이 셋 말고는 목표가 아니라고 못 박는다. 플레이어를 이기려는 것도, 공들인 설정을 구경시키려는 것도 아니다.

원칙 전체 원문(DW).

```
Draw maps, leave blanks
Address the characters, not the players
Embrace the fantastic
Make a move that follows
Never speak the name of your move
Give every monster life
Name every person
Ask questions and use the answers
Be a fan of the characters
Think dangerous
Begin and end with the fiction
Think offscreen, too
```

풀이: 지도를 그리되 빈칸을 남겨라 / 플레이어가 아닌 인물에게 말하라 / 환상을 받아들여라 / 흐름에 맞는 무브를 하라 / 무브 이름을 입 밖에 내지 마라 / 모든 괴물에 생명을 / 모든 사람에 이름을 / 묻고 답을 써라 / 인물들의 팬이 되어라 / 위험하게 생각하라 / 이야기로 시작해 이야기로 끝내라 / 화면 밖도 생각하라.

GM 무브 원문(DW).

```
Use a monster, danger, or location move
Reveal an unwelcome truth
Show signs of an approaching threat
Deal damage
Use up their resources
Turn their move back on them
Separate them
Give an opportunity that fits a class' abilities
Show a downside to their class, race, or equipment
Offer an opportunity, with or without cost
Put someone in a spot
Tell them the requirements or consequences and ask
```

풀이: 괴물·위험·장소의 무브 쓰기, 반갑지 않은 진실 드러내기, 다가오는 위협의 징조 보이기, 피해 주기, 자원 소모시키기, 행동을 되돌려 치기, 떼어 놓기, 직업에 맞는 기회 주기, 직업·종족·장비의 약점 보이기, 대가가 있거나 없는 기회 내밀기, 누군가를 곤경에 몰기, 조건이나 결과를 알려 주고 묻기.

무브를 언제 하는지, 약한 무브와 강한 무브(DW).

```
You make a move:
When everyone looks to you to find out what happens
When the players give you a golden opportunity
When they roll a 6-
Generally when the players are just looking at you to find out what happens you make a soft move, otherwise you make a hard move.
A soft move is one without immediate, irrevocable consequences.
Hard moves, on the other hand, have immediate consequences.
```

> "No matter what move you make, always follow up with "What do you do?""

풀이: 다들 GM을 쳐다볼 때, 플레이어가 좋은 빌미를 줄 때, 6 이하가 나올 때 무브를 한다. 그냥 쳐다볼 때는 약한 무브(즉시 되돌릴 수 없는 결과가 없는 것), 그 밖에는 강한 무브(즉시 결과가 있는 것). 무브 뒤에는 늘 "어떻게 할래?"를 붙인다.

10+ / 7-9 구간 설명은 이 GM 장 파일에 없다. 파일에 나오는 것은 "When they roll a 6-" 한 줄이다. 2d6 세 구간 규칙 자체는 DW의 플레이어 무브 장에 있을 텐데 이번에 받은 자료가 아니라 인용하지 않았다.

푸는 문제: GM이 무엇을 해야 하는지 막막할 때 고를 수 있는 목록을 준다. 원칙은 이야기가 규칙 용어로 변하지 않게 막는다("Never speak the name of your move").

### 2-3. Blades in the Dark: 위치와 효과, 결과 종류

판정 순서(Blades 판정). 플레이어가 목표를 말하고, 행동 능력치를 고르고, GM이 위치(position)와 효과(effect)를 정하고, 굴린다.

> "By default, an action roll is risky. You wouldn't be rolling if there was no risk involved. If the situation seems more dangerous, make it desperate. If it seems less dangerous, make it controlled."

풀이: 기본은 '위험'. 더 위험하면 '절박', 덜하면 '통제'.

```
Controlled —You act on your terms. You exploit a dominant advantage.
  4/5: You hesitate. Withdraw and try a different approach, or else do it with a minor consequence ...
  1-3: You falter. Press on by seizing a risky opportunity, or withdraw and try a different approach.
Risky —You go head to head. You act under fire. You take a chance.
  4/5: You do it, but there's a consequence: you suffer harm, a complication occurs, you have reduced effect, you end up in a desperate position.
  1-3: Things go badly. You suffer harm, a complication occurs, you end up in a desperate position, you lose this opportunity.
Desperate —You overreach your capabilities. You're in serious trouble.
  4/5: You do it, but there's a consequence: you suffer severe harm, a serious complication occurs, you have reduced effect.
  1-3: It's the worst outcome. ...
```

풀이: 같은 주사위라도 처음 위치에 따라 결과 무게가 다르다. 통제 상황의 실패는 "물러나 다른 방법을 써라" 수준이고, 절박 상황의 실패는 최악의 결과다.

결과 종류. 의뢰에는 여섯 가지라고 되어 있었지만 원문은 **다섯 가지**라고 쓴다.

> "Enemy actions, bad circumstances, or the outcome of a roll can inflict consequences on a PC. There are five types (at right)." (Blades 결과)

| 종류 | 원문 요지 | 풀이 |
|---|---|---|
| Reduced Effect | "The PC's action isn't as effective as they'd anticipated." | 생각보다 덜 먹힌다 |
| Complication | "trouble, mounting danger, or a new threat" | 새 문제가 생기거나 시계 칸이 찬다 |
| Lost Opportunity | "You had an opportunity to achieve your goal with this action, but it slips away. To try again, you need a new approach" | 같은 방법은 다시 못 쓴다 |
| Worse Position | "the action carries you into a more dangerous position" | 다음 판정 위치가 나빠진다 |
| Harm | "a long-lasting debility (or death)" | 오래가는 부상 |

눈여겨볼 문장.

> "Don't inflict a complication that negates a successful roll."

풀이: 성공한 판정을 뒤집는 복잡한 일을 내지 마라. 4/5로 적을 몰아넣었으면 적은 몰린 것이다.

> "On a 6, the PC wins and has their effect. On a 4/5, it's a mix—both the PC and the NPC have their effect. On a 1-3, the NPC wins and has their effect as a consequence on the PC."

풀이: NPC는 굴리지 않는다. PC 한 번의 판정이 양쪽 행동을 함께 정한다.

푸는 문제: "위험해 보이는 정도"와 "얼마나 해낼 수 있나"를 판정 전에 분리해 보여 줘서, 결과가 갑자기 가혹하게 느껴지지 않게 한다.

### 2-4. Fate: 네 결과

> "When you roll the dice, either you're going to fail, tie, succeed, or succeed with style." (Fate 결과)

```
Fail: you don't get what you want, you get what you want at a serious cost, or you suffer some negative mechanical consequence.
Tie: you get what you want, but at a minor cost, or you get a lesser version of what you wanted.
Succeed: you get what you want at no cost.
Succeed with Style: you get what you want, but you also get an added benefit on top of that.
```

풀이: 실패도 "원하는 걸 얻되 큰 대가"가 될 수 있다. 비기면 작은 대가나 덜한 성과, 성공은 대가 없음, 크게 성공하면 덤까지.

'Succeed at a cost'라는 문구는 이 파일에 그대로 나오지 않는다. 같은 생각은 "get what you want at a serious cost"로 들어 있다. 큰 대가와 작은 대가의 기준은 이렇다.

> "A serious cost should make the current situation worse somehow, either by creating a new problem or exacerbating an existing one." / "A minor cost should add a story detail that's problematic or bad for the [PC], but doesn't necessarily endanger progress."

Fate의 강제(compel)는 판정과 다른 장치다. 인물이나 장면의 특성(aspect) 때문에 일이 꼬일 때 GM이 꼬임을 제안하고, 플레이어는 받아들여 포인트를 얻거나 포인트를 내고 막는다(Fate 강제).

> "Accept the complication and receive a fate point / Pay a fate point to prevent the complication from happening"

푸는 문제: 실패가 이야기를 멈추지 않게 하고, 인물의 약점이 이야기를 굴리게 하되 플레이어가 그 대가로 보상을 받게 한다.

---

## 3. 긴장과 리듬

### 3-1. Mythic: 카오스 팩터와 장면 검사

Mythic 파일은 책 요약 블로그다. 규칙 본문은 쪽수가 붙은 인용으로 들어 있다.

```
"You've got your scene setup, but don't jump into the scene just yet. After a scene setup has been floated, it's time to see if that idea is modified. Roll 1D10. If you roll chaos factor or less then the scene is modified. If you roll higher, then the scene begins just as expected." pg. 72
"If you rolled an odd value number (1,3,5,7,9) then the scene setup is modified into an altered scene. If you rolled an even number (2,4,6,8) then it's an interrupt scene." pg. 73
```

풀이: 다음 장면을 예상해 두고 d10을 굴린다. 카오스 팩터 이하면 장면이 바뀐다. 홀수면 '변형 장면'(일부가 달라짐), 짝수면 '끼어드는 장면'(전혀 다른 일).

카오스 팩터 자체(Mythic, 블로그 요약). 1~9, 처음 5. 장면이 혼란스러웠으면 +1, 통제됐으면 -1. 장면 도중에는 바뀌지 않는다. 예/아니오 질문의 '예' 확률도 카오스가 높을수록 올라간다. 책 인용은 이렇다.

> "Chaos in an adventure has a way of building like a snowball. ... as the scenes roll on, the chaos factor will likely jump, which will encourage more chaotic scenes, increasing the factor higher and so on until the adventure comes to its climactic end." pg. 71

풀이: 혼돈은 눈덩이처럼 커져 절정으로 간다. 변형 장면의 예로 블로그는 범죄를 목격하고 경찰과 이야기할 줄 알았는데 건물 경비가 먼저 오는 경우를 든다. 핵심("범죄에 대해 이야기")은 같고 누가 오는지만 바뀐다.

보드라이프 설명도 같다. "결과값이 카오스 팩터보다 높다면 일이 잘 풀리는 겁니다. 즉, 우리가 처음 설계했던 대로 이야기가 흘러갑니다." 낮으면 "예상대로 흘러가긴 하지만 무언가 달라지거나 (Altered), 완전히 다른 일이 벌어집니다 (Interrupt)." (265~271행). 보드라이프는 목표 달성 시 -1, 실패 시 +1로 설명한다(261행). 블로그 요약의 "통제감" 기준과 표현이 조금 다르다.

푸는 문제: 플레이어가 장면을 예상하더라도 놀람이 끼어든다. 혼자 하는 사람은 자기 예상을 스스로 깨야 하는데, 주사위가 그 일을 맡는다. 동시에 놀람의 빈도가 지금까지의 진행에 따라 오르내린다.

### 3-2. Blades: 진행 시계

> "A progress clock is a circle divided into segments. Draw a progress clock when you need to track ongoing effort against an obstacle or the approach of impending trouble." (Blades 시계)

> "A complex obstacle is a 4-segment clock. A more complicated obstacle is a 6-clock. A daunting obstacle is an 8-segment clock."

> "When you create a clock, make it about the obstacle, not the method."

> "A clock is like a speedometer in a car. It shows the speed of the vehicle—it doesn't determine the speed."

풀이: 시계는 칸으로 나눈 원이다. 장애물에 대한 노력이나 다가오는 위험을 잰다. 복잡하면 4칸, 더 복잡하면 6칸, 벅차면 8칸. 시계 이름은 방법("경비 몰래 지나가기")이 아니라 장애물("안쪽 순찰")로 짓는다. 시계는 이야기 상황을 보여 주는 계기판이지 상황을 정하는 장치가 아니다. Blades 결과 문서는 부분 성공에 1~2칸, 심각한 복잡한 일에 3칸을 채운다고 쓴다.

푸는 문제: 쌓이는 위험을 눈에 보이게 해서, 나쁜 일이 갑자기 터진 게 아니라 다가오고 있었다고 느끼게 한다.

### 3-3. Alexandrian: 페이싱

RPG의 기본 대화(페이싱, 16~18행).

```
GM: What do you want to do?
Player: I want to do X.
GM: When you try to do that, this happens. What do you want to do?
```

> "the GM's ability to control pacing sits specifically at the moment of his response ("when you try to do that, this happens")."

풀이: 페이싱은 GM이 "그러자 이런 일이 생긴다"라고 답하는 순간에 있다.

빈 시간 건너뛰기.

> "The GM must identify and then eliminate, conflate, or (in advanced techniques) manipulate what I'm going to refer to as empty time" / "moving the players efficiently to the next moment in which they can make an interesting and meaningful choice"

요약 세 줄(50~52행).

```
Identify the intention
Choose obstacles
Skip to the next meaningful choice
```

풀이: 의도를 파악하고, 장애물을 고르고, 다음 의미 있는 선택으로 건너뛴다. 결론은 이 문장이다.

> ""skip the boring stuff and get to the next meaningful choice" is all you really need to know about pacing in an RPG."

장면을 세게 끊을수록 생기는 위험도 적혀 있다.

> "The risk, of course, is that you skip past a decision that is important to someone at the table."

풀이: 너무 많이 건너뛰면 누군가 하고 싶던 선택을 지나친다. 글은 Smallville의 처방(건너뛴 사람에게 포인트를 줘 장면 중간에 준비했던 일을 드러내게 함)을 든다.

'bang'과 GM 의제는 이 글 본문에서 다뤄지지 않는다. 'bang'은 끝의 추가 읽을거리 목록("The Art of Pacing: Prepping Bangs" 등)에만 제목으로 나온다. 'agenda'는 "creative agenda" 한 번이다. 'bang'의 정의는 이번 자료에 없다.

### 3-4. 입력 없는 서술 장면이 정당한 이유

위 자료에서 바로 나오는 근거는 세 가지다.

- 페이싱 글은 대화의 핵심이 "의미 있는 선택"이고, 그 사이의 빈 시간은 없애거나 합쳐도 된다고 한다. 선택이 없는 자리에서 "어떻게 할래?"를 묻는 것은 빈 시간을 늘리는 일이다.
- 같은 글은 질문이 자주 생략된다고도 쓴다. "the GM's question is often implied".
- DW는 다들 GM을 쳐다볼 때 GM이 무브를 한다고 쓰고, 무브 목록에 "Show signs of an approaching threat", "Reveal an unwelcome truth"처럼 플레이어 입력 없이 GM이 보여 주는 일이 들어 있다. 다만 DW는 무브 뒤에 늘 "What do you do?"를 붙이라고 한다. 서술 장면이 정당하다는 근거는 되지만, 그 끝은 선택으로 이어져야 한다는 뜻이기도 하다.

---

## 4. 선택 설계

### 4-1. Ashwell의 선택형 게임 패턴

Ashwell은 이것이 딱 나뉘는 분류가 아니고 여러 패턴이 섞인다고 먼저 밝힌다.

| 패턴 | 한 줄 정의(원문 요지) |
|---|---|
| Time Cave | 마구 갈라지고 거의 합쳐지지 않는다. 상태 추적이 필요 없고 엔딩이 아주 많다. "broad rather than long" |
| Gauntlet | 거의 일직선. 곁가지는 죽음, 되돌아가기, 빠른 합류로 잘린다. 치명형과 친절형이 있다 |
| Branch and Bottleneck | 갈라졌다가 모든 판에 공통인 사건에서 다시 합쳐진다. 지난 선택이 사라지지 않게 "heavy use of state-tracking"에 기댄다 |
| Quest | 갈래가 모듈처럼 나뉘고 적은 수의 승리 엔딩으로 모인다. 시간보다 지리로 짜인다 |
| Open Map | 주요 지점 사이를 오갈 수 있다. 느리고 덜 이끌린다 |
| Sorting Hat | 초반에 많이 갈라지고 합쳐지며 어느 큰 갈래로 갈지 정한다. 후반은 그 갈래 안에서 일직선에 가깝다 |
| Floating Modules | 줄기 없이 조각 콘텐츠가 떠 있다. 컴퓨터로만 가능 |
| Loop and Grow | 같은 지점으로 계속 돌아오지만 상태 추적으로 매번 새 선택이 열린다. 변형으로 Spoke and Hub |

10장면에 엔딩 7개짜리 짧은 데모에 맞는 것은 원문 정의로 보면 **Branch and Bottleneck**과 **Sorting Hat**이다. 장면 수가 적어 Time Cave처럼 매 선택마다 갈라지면 장면이 모자라고, 엔딩 7개는 Gauntlet이나 Quest의 "적은 승리 엔딩"보다 많다. Branch and Bottleneck은 공통 사건에서 합쳐지면서 수치로 지난 선택을 기억하므로 적은 장면으로 여러 엔딩을 낼 수 있다. Ashwell은 이 구조가 "heavily governed by the passage of time, while still allowing the player fairly strong grasp"라고 쓴다. Choice of Games가 이 원리를 쓰고 Dan Fabulich는 "delayed branching"이라고 부른다는 것도 적혀 있다. Sorting Hat은 초반 선택으로 큰 갈래를 정하는 형태다. Ashwell은 이 경우 후반이 일직선이라는 걸 플레이어가 알아채기 쉬우니 갈래의 성격을 알려 주는 게 중요하다고 쓴다. 이 판단은 패턴 정의에서 나온 지식이고, 우리 데모에 무엇을 쓸지는 정하지 않는다.

### 4-2. Emily Short: 품질 기반, 주목도 기반

> "Quality-based narrative is the term invented by Failbetter Games to refer to interactive narratives structured around storylets unlocked by qualities. A storylet is typically a paragraph or two of text followed by a choice for the user ... Qualities are numerical variables that can go up or down during play" (Short, 23행)

풀이: 수치(quality)가 조건을 채우면 열리는 짧은 이야기 조각(storylet)으로 짠다. 장점으로 짧은 이야기들이 서로 맞물리고, 앞의 내용을 짧게 되받는 장면을 넣기 쉽다는 점을 든다("small, special callbacks to earlier content"). 약점으로 조각 수가 적을 때는 재미가 없고 아주 많으면 고를 목록이 넘친다고 쓴다.

> "Salience-based narrative is a term I just made up to refer to interactive narratives that pick a bit of content out of a large pool depending on which content element is judged to be most applicable at the moment." (55행)
>
> "Where QBN lets the player choose the best element to see next out of all the elements that are currently legal, the salience-based approach makes that decision itself." (56행)

풀이: 주목도 기반은 지금 상황에 가장 들어맞는 조각을 시스템이 고른다. 예시는 부엌 대사 셋이다. 조건이 더 많이 맞는 대사가 더 '주목도가 높고', 똑같으면 무작위로 고른다.

### 4-3. Alexandrian: 플롯이 아니라 상황을 준비하라

```
Don't prep plots, prep situations.
A plot is a sequence of events: A happens, then B happens, then C happens.
A situation, on the other hand, is merely a set of circumstances. The events that happen as a result of that situation will depend on the actions the PCs take.
```

> "Your gaming session is not a story — it is a happening." (플롯, 10행, 원문에서는 HTML 기호로 된 대시)

풀이: 플롯은 A, B, C가 차례로 일어나는 사건의 줄이다. 갈래가 있는 책 형태라도 원리는 같다고 쓴다. 상황은 그냥 조건의 묶음이고, 무슨 일이 일어날지는 PC의 행동에 달렸다. 게임 판은 이야기가 아니라 일어나는 일이다.

### 4-4. 세 단서 규칙

```
For any conclusion you want the PCs to make, include at least three clues.
```

> "if you think of each clue as a plan (the PCs will find A, conclude B, and go to C), then when you have three clues you've not only got a plan — you've also got two backup plans. And when you realize that your plans never survive contact with the players, the need for those backup plans becomes clear." (세 단서, 34~36행)

풀이: 플레이어가 꼭 알아야 할 결론마다 단서를 셋 이상 둔다. 하나는 계획, 둘은 예비 계획이다. 계획은 플레이어를 만나면 늘 깨진다.

---

## 5. AI GM의 알려진 문제

### 5-1. 솔로 GM 논문(정적 v1 vs 에이전트 v2)

초록 원문.

> "While v1 of our system uses simplified prompt engineering, v2 leverages a multi-agent architecture and the ReAct framework to include reasoning and action. A comparative evaluation demonstrates that v2 as an agentic system maintains play while significantly improving modularity and game experience, including immersion and curiosity."

발견한 것.

- 참가자는 12명(N=12)이고 긴 플레이로 두 판을 비교했다(85행). "Overall, we found that our agentic v2 GM was preferred by the participants, achieving higher ratings in perceived intelligence, flow, and immersion"(86행).
- v1의 주된 불만은 전투였다. "unless they meticulously described their actions, v1 often resulted in non-sensical outcomes, such as characters stumbling or self-injuring when the system failed to identify an appropriate target"(358행). 참가자 P1은 v1이 "just gives me a large description of the things I did"라고 했다.
- v2는 의도를 더 잘 읽었다. 해적 동료를 배신해 보물을 독차지하려는 P6의 계획을 예로 든다(360행).
- 일부 참가자는 v1을 더 좋아했다. "particularly those favoring less interactive engagement ... appreciating its detailed environmental descriptions and a narrative style that supported passive consumption of content"(365행).
- 행위 주체성(agency)을 깎은 원인으로 콘텐츠 필터를 든다. "the current filters inadvertently restrict the player's actions or responses, leading to interruptions in the gameplay flow and a diminished sense of agency"(382행).
- 전투 도구(Battle tool)를 알맞은 횟수만큼 부르게 하는 것이 어려웠고, 프롬프트와 도구 설명에 몇 가지 예시(few-shot)를 넣어 나아졌다고 쓴다(369행).

이 자료가 시사하는 대응: 판정·전투 같은 규칙 처리를 별도 도구로 떼어 내고 서술 담당이 그 도구를 부르게 한 v2가 더 좋은 평가를 받았다. 즉 **판정은 코드(도구)가, 서술은 LLM이**라는 나눔. 플레이어가 긴 설명을 쓰지 않아도 의도를 잡아야 한다는 것, 그리고 "내가 한 일을 길게 다시 묘사"하는 답은 불만이 된다는 것.

### 5-2. 아첨(sycophancy) 논문

> "human feedback may also encourage model responses that match user beliefs over truthful ones, a behaviour known as sycophancy. ... five state-of-the-art AI assistants consistently exhibit sycophancy across four varied free-form text-generation tasks. ... when a response matches a user's views, it is more likely to be preferred. Moreover, both humans and preference models (PMs) prefer convincingly-written sycophantic responses over correct ones a non-negligible fraction of the time."

풀이: 사람 피드백으로 다듬은 모델은 사실보다 사용자 생각에 맞춘 답을 내는 경향이 있고, 사람도 그런 답을 꽤 자주 더 좋게 평가한다. 파일은 초록뿐이라 게임 얘기는 없다. GM에 옮기면 플레이어가 원하는 쪽으로 판정과 결과를 기울이는 경향이 예상된다(이건 우리 추론이다). 시사하는 대응: 성공/실패를 모델이 정하지 않고 주사위와 코드가 먼저 정한 뒤 모델에 알려 준다.

### 5-3. CriticaLLM

> "these games include many complex components, from crafting interesting stories to adhering to rules, while allowing some freedom in players' actions. ... we introduce our framework, CriticaLLM, a fully automated Game Master that can run entire TTRPG games, from creating diverse and interesting stories to managing exploration and combat phases. We evaluate our framework with actual TTRPG players and examine the diversity of generated plots and antagonists across four LLMs of varying sizes."

풀이: 이야기 만들기, 규칙 지키기, 플레이어의 자유를 함께 다뤄야 하는 게 어렵다고 짚는다. 파일은 초록뿐이라 구체 수치나 구조는 자료에 없다. 탐험과 전투를 '단계'로 나눠 관리한다는 점만 확인된다.

### 5-4. 보드라이프 댓글: 문서를 안 지키는 ChatGPT

> "저는 종종 쳇gpt를 gm으로 세워서 유사trpg솔플?을 해보고 있네요 아직 조정해야될게 많지만 나름대로 돌려볼만 하더라고요" (이동규_1, 681행)
>
> "저도 최근에 시도를 좀 해봤는데, 이 녀석이 자신의 창작 의지를 꺾지 않네요. 문서의 내용만 적용하라 해도 그게 얘 입장에서는 쉽지가 않나봐요. 지금은 창작/설정 단계에서 많이 도움을 받고 있지만 뭐 조만간 gm이 가능하겠다는 생각이 들어요." (694행, 작성자는 '그 미플'로 보임)

시사하는 대응: 문서를 통째로 주고 지키라고 하는 방식은 흔들린다. 시나리오 뼈대(지금 장면, 갈 수 있는 곳)를 코드가 쥐고, 매 응답마다 지금 상태(수치, 플래그, 장면 목표)를 넣어 주는 편이 위 자료들과 맞는다.

### 5-5. 정리

| 문제 | 근거 | 대응 |
|---|---|---|
| 결과가 플레이어 쪽으로 기운다 | 아첨 논문 | 판정은 코드가, 모델은 결과를 서술만 |
| 문서·설정에서 벗어난다 | 보드라이프 댓글, CriticaLLM | 시나리오 뼈대를 코드가 쥔다 |
| 이상한 결과, 대상 못 찾음 | 솔로GM 논문 358행 | 규칙 처리를 도구로 분리, 예시 넣기 |
| 내가 한 일을 길게 되풀이 | 솔로GM 논문 P1 | 결과와 새 상황 중심 서술 |
| 행동 제한으로 주체성 감소 | 솔로GM 논문 382행 | 막을 때 이유를 알려 줌(논문은 자체 호스팅 모델을 제안) |
| 수치·상태를 잊는다 | 위 자료 공통 | 매 턴 상태 주입 |

---

## 6. 솔로 TRPG 체크리스트

각 질문에 "예"여야 한다.

1. 판정 결과가 성공·대가 있는 성공·실패처럼 셋 이상으로 갈리고, 중간 결과가 "되긴 했는데 대가"인가? (Ironsworn weak hit, Fate tie, Blades 4/5)
2. 실패가 "아무 일도 없음"이 아니라 이야기를 앞으로 미는가? (Ironsworn Pay the Price, Fate "at a serious cost")
3. 성공한 판정이 뒤따르는 복잡한 일로 뒤집히지 않는가? (Blades "Don't inflict a complication that negates a successful roll")
4. 플레이어가 *어떻게* 하느냐에 따라 쓰는 능력치가 달라지는가? (Ironsworn Face Danger, Blades 행동 능력치)
5. 판정 전에 위험 정도를 알 수 있는가? (Blades 위치, DW "Tell them the requirements or consequences and ask")
6. 플레이어가 결과를 미리 다 알 수 없도록 불확실성이 있는가? (보드라이프 215행, DW "Play to find out")
7. 예상대로 흘러가던 장면이 가끔 바뀌거나 끼어드는 일이 있는가? (Mythic 변형·끼어드는 장면)
8. 쌓이는 위험이 눈에 보이거나 미리 신호가 오는가? (Blades 시계, DW "Show signs of an approaching threat")
9. 입력을 묻는 자리가 실제로 의미 있는 선택이 있는 자리인가? 빈 시간은 건너뛰는가? (페이싱)
10. 서술 장면 끝이 선택으로 이어지는가? (DW "always follow up with "What do you do?"")
11. 이야기가 사건 줄이 아니라 상황으로 준비되어, 플레이어 행동에 따라 결과가 달라지는가? (플롯)
12. 꼭 알아야 할 정보마다 얻을 길이 셋 이상인가? (세 단서 규칙)
13. 앞 선택을 수치·플래그로 기억하고 나중에 되받는가? (Ashwell Branch and Bottleneck의 상태 추적, Short의 callback)
14. 성공·실패를 언어 모델이 아니라 코드가 정하는가? (아첨 논문, 솔로GM 논문의 도구 분리)
15. 모델이 매 턴 지금 장면과 상태를 받아, 문서 밖으로 새지 않는가? (보드라이프 댓글, CriticaLLM)
