# VN 오프닝 사례 조사 노트 (월흔 TRPG 데모 오프닝 분석용)

## 0. 먼저 밝혀 둘 한계 (중요)

- 이 세션에서는 WebFetch(페이지 본문 열람)가 전부 막혔다. en.wikipedia.org, aceattorney.fandom.com, disco-elysium.fandom.com, pcgamer.com, hardcoregaming101.net 모두 DNS 단계에서 차단됐다(세션 네트워크 허용 목록 밖).
- WebSearch만 됐다. 검색 도구가 결과 페이지를 요약해서 돌려준다. 그래서 아래 출처는 "실제로 본문을 연 것"이 아니다. "검색 결과에 뜬 URL과, 검색 도구가 그 페이지에서 뽑은 요약"이다.
- 표기 규칙:
  - **[검색요약]** = 검색 결과 요약에서 확인. 본문은 직접 읽지 않음. 요청한 "fetched-source"보다 한 단계 약하다.
  - **[기억·미검증]** = 내 기억. 출처로 확인 못 함.
- 대사는 직접 인용하지 않았다. 원문 대사를 확인할 수단이 없었다.
- 본문 열람이 필요하면 세션 네트워크 설정에서 위 도메인(특히 en.wikipedia.org, *.fandom.com, gamedeveloper.com)을 허용해야 한다.

---

## 1. 사례 (8개 + 반례 1개)

### 1) Phoenix Wright: Ace Attorney — 1화 "The First Turnabout"

- **처음 5분**
  - 범인이 피해자를 죽이는 장면을 먼저 보여 준다. 범인 얼굴도 다 보인다. [검색요약: 작가 회고 블로그, GDC 2010 자료]
  - 범인(목격자 Frank Sahwit)은 오프닝에서 누구에게 죄를 씌울지 궁리한다. [검색요약: GDC 2010 Amy Li 자료]
  - 이어서 법정 대기실. 신참 변호사 나루호도(Phoenix)가 첫 재판 앞에서 긴장한다. 피고는 친구 Larry Butz. 선배 Mia가 옆에서 조언한다. [Larry·Mia 구도는 검색요약 / 긴장한 속마음 묘사는 기억·미검증]
- **성격을 보여 주는 기법**
  - 괄호 속마음. 겉으로는 버티지만 속으로는 "망했다" 쪽의 독백을 한다. 이 차이에서 코미디와 호감이 나온다. [기억·미검증]
  - 과장된 친구(Larry)와 차분한 멘토(Mia) 사이에 주인공을 끼운다. 주인공 성격이 대비로 드러난다. [검색요약: Larry는 과장되고 우스꽝스럽고, Mia는 단계마다 안내하는 역]
- **상황·이해관계를 보여 주는 법**
  - 관객은 범인을 이미 안다. 그래서 "어떻게 밝힐까"로 긴장이 바로 생긴다. 설명이 필요 없다. (극적 아이러니, 『형사 콜롬보』식 도치 서사)
  - 1화를 짧은 튜토리얼로 설계했다. 프로토타입이 "따라가기 어렵다"는 비판을 받아서다. 오프닝은 재판이 시작되기까지의 길이를 맞추려고 여러 번 고쳤다고 한다. [검색요약: 작가 블로그 2016]
- **약점**
  - 사건이 하루짜리라 단순하다. [검색요약]
  - 콜드 오픈의 범인 공개는 "누가"라는 미스터리를 버린다. 대신 "어떻게"에 집중하는 것이다.
- **출처 (검색요약, 본문 미열람)**
  - https://gyakutensaibanlibrary.blogspot.com/2016/08/gyakuten-saiban-blog-entry-18-first.html (원작 작가 블로그 번역으로 추정)
  - https://media.gdcvault.com/gdc2010/GNR/Amy%20Li_2010.pdf (GDC 2010 Game Narrative Review)
  - https://wrightwednesday.blogspot.com/2018/12/wright-wednesday-first-turnabout.html

### 2) Steins;Gate — 오카베 첫 장면

- **처음 5분**
  - 아키하바라. 오카베가 소꿉친구 마유리와 함께 과학 강연(라디오회관)에 간다. 휴대폰을 귀에 대고 "기관"과 통화하는 척 혼잣말을 한다. 스스로 "광기의 매드 사이언티스트 호오인 쿄마"라고 칭한다. [기억·미검증]
  - 마유리는 그를 "오카린"이라고 부른다. 그는 건성으로 대답한다. [검색요약: 팬 분석 블로그]
  - 크리스가 그의 "혼자 휴대폰에 대고 떠드는" 모습을 비웃는다. 페르소나가 바로 꺾인다. [검색요약: 같은 블로그]
- **성격을 보여 주는 기법**
  - 자칭 페르소나와 주변 반응의 대비. 본인은 대단하다고 믿는다. 주변은 귀엽거나 한심하게 본다. 우리 주인공의 "대륙 유일의 미소녀" 자칭과 구조가 거의 같다.
  - 페르소나는 불안을 가리는 방어막이기도 하다. 진지한 순간에 본모습이 나온다. [검색요약: GDC 2023 DigiPen 자료, 위키 요약]
- **상황·이해관계**
  - 첫 장면에서는 이해관계가 거의 없다. 일상 코미디로 시작한다. 큰 사건(시신 목격 → 메일)은 그 뒤에 온다. [기억·미검증]
- **약점**
  - 초반이 느리다는 평이 흔하다. 페르소나 개그가 "오글거린다"는 반응도 있다. [기억·미검증. 검색으로 확인 못 함]
- **출처 (검색요약)**
  - https://blog.spacehey.com/entry?id=1885203 (팬 블로그. 해석 성격)
  - https://media.gdcvault.com/gdc2023/GNR/RunyonConnor_DigiPenInstituteofTechnology_GNR2023.pdf
  - https://en.wikipedia.org/wiki/Rintaro_Okabe (검색 결과에만 뜸. 열람 차단)

### 3) 999: Nine Hours, Nine Persons, Nine Doors — 침수되는 선실

- **처음 5분**
  - 준페이가 여객선 선실에서 깨어난다. 손목에 "5"가 뜬 팔찌가 있다. [검색요약: 리뷰 여러 개]
  - 곧 둥근 창(또는 창문)이 깨지고 물이 들어온다. 나가지 못하면 익사한다. [검색요약: GameSpot 유저 리뷰는 "porthole", Nintendo Life는 "창문"으로 서로 다름]
  - 첫 방은 탈출 퍼즐(3등 선실)이다. 벽의 카드 리더를 발견하며 퍼즐이 시작된다. [검색요약]
- **성격을 보여 주는 기법**
  - 1인칭 서술의 말투. 준페이는 위기 속에서도 투덜대고 비꼬는 속마음을 한다. 공포와 농담의 대비로 "어떤 녀석인지"가 드러난다. [기억·미검증]
  - 행동(조사) 하나하나에 붙는 짧은 코멘트가 성격을 만든다.
- **상황·이해관계**
  - 시간 제한(물)이 설명 없이 이해관계를 만든다. 플레이어는 이유를 몰라도 "빨리 나가야 한다"는 것만은 안다.
  - 왜 여기 있는지는 나중으로 미룬다. 질문(누가, 왜)이 동력이 된다.
- **약점**
  - 첫 방에서는 주인공 혼자라서, 관계를 통한 성격 묘사가 없다.
- **출처 (검색요약)**
  - https://www.gamespot.com/nine-hours-nine-persons-nine-doors/user-reviews/2200-137079/
  - https://www.nintendolife.com/games/ds/999_nine_hours_nine_persons_nine_doors/review
  - https://www.nettosgameroom.com/2013/02/9-hours-9-persons-9-doors-review.html

### 4) Disco Elysium — 어둠 속 "속마음" 대화 (우리 '속마음' 시스템과 가장 가까움)

- **처음 5분**
  - 화면이 검다. 주인공 머릿속의 목소리 Ancient Reptilian Brain과 대화한다. 깨어날지, 이대로 술에 취한 잠 속에서 죽을지를 놓고 다툰다. [검색요약: 여러 리뷰]
  - 또 다른 내부 목소리 Limbic System이 끼어든다. 하나는 포기를 권하고 하나는 반대로 민다. [검색요약]
  - 깨어나면 엉망인 호스텔 방. 넥타이는 천장 선풍기에 걸려 있다. 바지는 샤워실에 있다. 창문은 깨졌고 수도꼭지에선 뜨거운 물이 계속 흐른다. [검색요약: 리뷰 2개]
  - 동료 Kim Kitsuragi는 첫 방 안에 없다. [검색요약: 팬 위키. 만나는 시점은 기억상 방을 나온 직후 아래층]
- **성격을 보여 주는 기법**
  - 내면 목소리가 여러 개다. 각 스킬이 저마다 성격을 가진 목소리로 끼어든다. [검색요약: PC Gamer 등]
  - 방의 소품이 지난밤과 주인공의 상태를 말해 준다. 서술자가 "그는 알코올 중독자다"라고 말하지 않는다. (환경 스토리텔링)
  - 넥타이를 집으려는 첫 판정부터 실패할 수 있다. 첫 행동이 곧 그 인물이 어떤 상태인지를 보여 준다. [기억·미검증]
- **상황·이해관계**
  - 기억상실. 플레이어와 주인공이 똑같이 아무것도 모른다. 그래서 설명이 자연스러운 "발견"이 된다.
- **약점**
  - 목소리가 많아 처음엔 정신없다. 글 양이 많다. 우리 데모처럼 5분 안에 끝내야 하는 경우엔 목소리 수를 줄여야 한다.
  - 기억상실은 "정보 격차"를 쉽게 없애지만, 우리 주인공은 자기가 누구인지 안다. 그대로 가져오면 안 된다.
- **출처 (검색요약)**
  - https://post45.org/?p=23201 ("Reading Disco Elysium". 이중의 시작, 신경학적 각성으로 읽음)
  - https://www.pcgamer.com/disco-elysium-puts-a-full-party-of-npc-companions-in-your-head
  - https://theweathervane.org/review/beyond-the-pale-a-review-of-disco-elysium
  - https://gamebanshee.com/3wkrx (Robert Kurvitz 인터뷰. 내용 미확인)

### 5) Ghost Trick: Phantom Detective — 고철장의 유령

- **처음 5분**
  - 기억을 잃은 영혼 Sissel이 고철장에서 의식을 찾는다. [검색요약]
  - 눈앞에 자기 시체가 있다. 붉은 머리 여형사 Lynne가 총구 앞에 있다. Sissel은 그녀를 첫 번째로 구한다. [Lynne가 처음 만나고 처음 구하는 인물이라는 점은 검색요약 / 총잡이 장면 디테일은 기억·미검증]
  - 제한 시간은 새벽까지. 그때까지 자기 죽음의 진상을 밝혀야 한다. [검색요약: Giant Bomb]
- **성격을 보여 주는 기법**
  - 문제에 대한 반응. 죽었다는 사실 앞에서 주인공은 의외로 담담하고 빈정댄다. 이 반응이 성격을 만든다. [기억·미검증]
  - 첫 장면에서 바로 "남을 구하는" 선택을 한다. 가치관이 행동으로 보인다.
- **상황·이해관계**
  - 시체, 총구, 새벽이라는 마감. 세 가지가 한 화면에서 이해관계를 다 말한다.
  - 리뷰 하나는 "게임이 고철장 오프닝에서 거의 모든 패를 깐다"고 했다. [검색요약]
- **약점**
  - 오프닝이 다소 느리고 단순하다는 평도 있다. [검색요약]
- **출처 (검색요약)**
  - https://giantbomb.com/wiki/Games/Ghost_Trick_Phantom_Detective
  - https://media.gdcvault.com/gdc2012/GNR/Mike%20Gabaldon%20-%20Ghost%20Trick%20Game%20Narrative%20Review%20-%20Mike%20Gabaldon%20.pdf
  - https://cinemablend.com/games/Interview-Ghost-Trick-Director-Shu-Takumi-Producer-Hironobu-Takeshita-26090.html (내용 미확인)

### 6) Danganronpa: Trigger Happy Havoc — 프롤로그

- **처음 5분**
  - 나에기 마코토가 엘리트 학교 희망봉 학원 앞에 선다. 그는 재능 없는 평범한 학생이다. 추첨으로 입학했다. [검색요약]
  - 학교에 들어서자마자 의식을 잃는다. 깨어나 보니 학교 안에 갇혀 있다. [검색요약]
  - 창문엔 철판이 박혀 있다. 다른 "초고교급" 학생들을 차례로 만난다. [기억·미검증]
- **성격을 보여 주는 기법**
  - 1인칭 독백에서 "나는 평범하다"를 스스로 말한다. 이 자기 인식이 주변의 괴짜들과 대비된다. [기억·미검증]
  - 다른 인물 소개가 길다. 그 반응을 통해 주인공의 무던함과 낙관이 드러난다.
- **상황·이해관계**
  - 감금이라는 상황 자체가 질문을 만든다. 설명보다 "이상한 것"(철판 창문)을 먼저 보여 준다.
- **약점**
  - 15명 넘는 인물 소개가 초반을 길게 만든다. "평범한 주인공" 자칭은 우리 주인공처럼 개성 강한 인물에는 맞지 않는다.
- **출처 (검색요약)**
  - https://twinfinite.net/pc/what-is-danganronpa-trigger-happy-havoc-everything-you-need-to-know/2/
  - https://www.pushsquare.com/reviews/psvita/danganronpa_trigger_happy_havoc

### 7) Katawa Shoujo — 눈 속의 고백, 그리고 심장 발작

- **처음 5분**
  - 프롤로그. 눈 오는 날, 히사오가 고백을 받는 순간 심장 발작으로 쓰러진다. [검색요약]
  - 그는 만성 부정맥과 선천성 심근 결함 진단을 받는다. 곧바로 Act 1 "Life Expectancy"로 넘어간다. [검색요약]
  - 병원 생활과 장애인 학교 전학이 이어진다. [기억·미검증]
- **성격을 보여 주는 기법**
  - 행복의 정점에서 사건이 터진다. 감정 낙차로 몰입을 만든다.
  - 그 뒤 독백이 냉소적이고 우울하다. 사건에 대한 반응으로 성격을 보여 준다. [기억·미검증]
- **상황·이해관계**
  - 몸이 곧 이해관계다. "언제 또 쓰러질지 모른다"는 위협이 설명 없이 깔린다.
- **약점**
  - Act 1에서 주인공이 특정 인물과 어울리는 이유가 억지스럽다는 평이 있다. [검색요약: The Fandom Post 리뷰]
- **출처 (검색요약)**
  - https://www.fandompost.com/2012/01/23/katawa-shoujo-game-review/
  - https://www.allspark.com/home/threads/all-aboard-the-feels-train-a-katawa-shoujo-playthrough-and-analysis.2474
  - https://renai.us/game/katawashoujoact1

### 8) VA-11 Hall-A — 바텐더의 첫 밤

- **처음 5분**
  - 질(Jill)이 바에서 손님에게 술을 만들어 주고 이야기를 듣는다. 이야기 분기는 선택지가 아니라 만드는 술로 바뀐다. [검색요약]
  - 손님들은 두 문장 만에 질에게 자기 삶을 털어놓는다. [검색요약: 리뷰. 비판적 뉘앙스]
  - 퇴근 후 집에서 고양이, 뉴스, 쇼핑이 짧게 나온다. [기억·미검증]
- **성격을 보여 주는 기법**
  - 말 선택지가 없다. 그래서 질의 말은 전부 작가가 쓴 "그녀의 말"이 된다. 성격이 더 단단해진다. [검색요약: Game Informer 리뷰 요지]
  - 질은 주로 듣고 가끔만 조언한다. 반응하는 방식으로 성격이 드러난다. [검색요약]
- **상황·이해관계**
  - 이해관계는 작다(월세, 일상). 세계관은 손님 수다로 조금씩 흘러나온다.
- **약점**
  - 큰 위기가 없다. 5분 안에 "긴장"을 원하는 우리 데모와는 맞지 않는다. 다만 "주인공이 말하는 방식으로 성격 보여 주기"에는 참고가 된다.
- **출처 (검색요약)**
  - https://gameinformer.com/games/va-11_hall-a/b/pc/archive/2016/07/02/va11-halla-review-game-informer
  - https://www.pocketgamer.co.uk/va-11-hall-a/va-11-hall-a-switch-review-a-gorgeous-enthralling-visual-novel/

### (반례) Doki Doki Literature Club

- 일부러 뻔한 연애 VN처럼 시작한다. 특징 없는 이름 입력형 주인공. 늦잠 자는 소꿉친구 사요리. [검색요약: SoraNews24, RPGFan]
- 주인공은 비어 있는 그릇이다. 첫 5분에 주인공 성격을 보여 주려는 우리 목표와 정반대다. "장르 관습을 일부러 쓰면 플레이어가 무엇을 예상하는지"를 볼 때만 참고하라.
- 출처 (검색요약): https://www.rpgfan.com/review/doki-doki-literature-club/ , https://soranews24.com/2017/10/27/doki-doki-literature-club-is-the-best-horror-game-disguised-as-dating-sim-that-you-need-to-play/?noamp=mobile

### 확인 못 한 후보

- Fate/stay night, Tsukihime, Clannad, Coffee Talk, Kentucky Route Zero: 시간 안에 검색하지 못했다. 기억으로만 쓰는 건 피했다.

---

## 2. 작법 자료 (검색요약, 본문 미열람)

1. **K.M. Weiland, "7 Tips for Opening Your Story In Medias Res"**
   https://www.helpingwritersbecomeauthors.com/7-tips-for-opening-your-story-in-medias-res/
   - 요지: 프롤로그로 감정을 투자시킨 뒤 1장에서 다시 투자하게 만들지 마라. 플롯을 움직이지 않는 배경 설명은 쓸 가치가 없다. (Weiland 발췌로 검색요약에 뜸. 같은 글인지는 확실하지 않음)
2. **Writing Codidact Q&A, in medias res / 플래시포워드 사례**
   https://writing.codidact.com/q/4937
   - 요지: 플래시포워드는 의미가 바로 분명하지 않으면 엉뚱하게 느껴지고 금방 잊힌다.
3. **Aftermath, "Death to beginning the story in media res"**
   https://aftermath.site/death-to-beginning-the-story-in-media-res.md
   - 요지(검색 결과 제목만 확인. 내용 미확인): 한가운데서 시작하는 기법 자체에 대한 반대론. 비슷한 지적으로 "독자를 속여서 이야기에 끌어들인다"는 불만이 검색요약에 있었다.
4. **Game Developer, "The Significance of Introductions in Games"**
   https://www.gamedeveloper.com/design/the-significance-of-introductions-in-games
   - 요지: 좋은 오프닝은 목표, 테마, 배경, 가능성, 그리고 훅을 전해야 한다. 그래서 첫 5분의 부담이 크다.
5. **Bugnet, "The first five minutes of your game"**
   https://bugnet.io/blog/the-first-five-minutes-of-your-game
   - 요지: 1분 안에 조작을 주고, 5분 안에 핵심 훅을 "약속"이 아니라 플레이어가 직접 "해 보게" 하라. (실무자 블로그. 근거 약함)
6. **David Jerz, "Exposition in Interactive Fiction"**
   https://jerz.setonhill.edu/if/online/exposition.html
   - 요지: 많은 IF 오프닝이 첫 문단에 설명을 너무 퍼붓는다. 긴 묘사 대신 상호작용할 수 있는 사물로 주인공을 세워라.
7. **Emily Short, "A Speculation"**
   https://emshort.blog/2007/12/09/a-speculation/
   - 요지: 방금 만난 인물에 대해서는 서술자가 그 사람의 과거나 성격을 일반화할 수 없다. 그래서 직접 설명이 막힌다. 대신 계속 끼어드는 존재감과 상호작용이 성격을 만든다. → 붉은 눈의 남자는 첫 만남이므로 설명보다 행동으로 보여 줘야 한다는 근거.
8. **Lemmasoft 포럼, "Balancing narration and speech in visual novels"**
   https://lemmasoft.renai.us/forums/viewtopic.php?p=23340
   - 요지(VN 실무 토론): 서술과 대사의 비율 문제. 배경·스프라이트가 묘사를 대신하니 서술 중복을 줄여라. (같은 맥락의 itch.io 글에서도 언급)

- 속마음(내면 독백) 자체를 다룬 신뢰할 만한 작법 글은 찾지 못했다. 검색에 뜬 건 대부분 SEO성 블로그였다. Disco Elysium 관련 글(위 4번 사례의 post45, PC Gamer)이 사실상 가장 나은 참고다. Kurvitz가 직접 설계 의도를 말한 인터뷰(GameSpot Audio Logs)는 존재만 확인했고 내용은 못 봤다.

---

## 3. 우리 오프닝에 바로 쓸 수 있는 정리 (분석 의견. 출처 아님)

1. **자칭과 현실의 대비 (Steins;Gate형).** "대륙 유일의 미소녀" 자칭을 서술자가 소개하지 말고, 주인공이 직접 말하거나 속마음으로 말하게 하라. 그리고 현실(사막에서 일주일 헤맴, 물 부족, 꾀죄죄한 몰골)과 바로 부딪히게 하라. 웃음과 상황 설명이 동시에 된다.
2. **물 = 시간 제한 (999·Ghost Trick형).** 남은 물의 양을 소품이나 행동(물통 흔들기, 마지막 한 모금 아끼기)으로 보여 주면 이해관계가 설명 없이 선다.
3. **겉말과 속마음의 차이 (Ace Attorney·Disco Elysium형).** 칼이 목에 닿았을 때 겉으로는 당당하고 속으로는 떨게 하라. 또는 그 반대로, 겉으로는 놀라고 속으로는 "잘생겼다"고 생각하게 하라. 이 낙차가 5분 안에 성격을 가장 빨리 전한다. 속마음 목소리는 하나로 유지하라. Disco처럼 여러 개면 5분 안에 감당이 안 된다.
4. **변장·적국 설정은 대사 한두 줄의 "위험"으로.** 신분이 들키면 안 된다는 사실을, 칼 든 남자의 질문("어디서 왔지?")에 주인공이 거짓말하는 장면으로 보여 줘라. 서술로 설명하지 마라.
5. **칼을 목에 대는 장면을 맨 앞에 콜드 오픈으로 쓸 때의 위험.** 작법 자료(위 1, 2, 3번)가 공통으로 지적한다. 플레이어가 아직 주인공에게 정이 없으면 긴박함이 안 먹힌다. 의미가 불분명한 플래시포워드는 잊힌다. 콜드 오픈을 쓴다면 아주 짧게 하라. 그리고 바로 "일주일 전"이 아니라 "한 시간 전" 정도로 짧게 되감아, 사막 헤매기 코미디를 1~2분 안에 끝내고 다시 그 장면으로 돌아오라. 아니면 순서대로 가되 사막 파트를 짧게 줄이는 쪽이 더 안전하다.
6. **붉은 눈의 남자는 설명하지 말고 행동으로 (Emily Short 근거).** 첫 만남이므로 주인공은 그를 모른다. 서술자가 그를 설명하면 시점이 깨진다.
