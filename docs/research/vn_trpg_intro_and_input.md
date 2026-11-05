# 도입부 알려 주기 · 자유 입력 나누기 조사 (2026-11-05, 미완성)

**이 문서는 중간에 멈춘 조사다.** 이 세션의 네트워크가 github.com 계열 주소만 허용해서, 1차 자료 원문은 **AI Dungeon 2 실행 기록(gist) 하나만** 직접 읽었다. 나머지는 웹 검색 결과에 나온 요약만 보았고 원문을 열지 못했다. 각 항목에 확인 수준을 적었다.

- **[원문 확인]** 원문 페이지를 직접 읽음
- **[검색 요약만]** 검색 엔진 결과 요약에서만 봄. 원문 미확인. 인용·사실은 다시 확인해야 함

코드는 고치지 않았다. "우리 데모 적용" 줄은 제안일 뿐이고 화면 글을 바꾸자는 것이 아니다.

---

## ① 세계·주인공·목표를 처음 하는 사람에게 알려 주는 방법

### 1-1. AI Dungeon 2 (2019) — 메뉴로 고르고, 두 문장으로 시작 [원문 확인]
- 출처: https://gist.github.com/AdrienLemaire/33663e9100c009b8ec3409c10f1c2a31
- 실제로 한 일: "Pick a setting." (fantasy / mystery / apocalyptic / zombies / custom) → "Pick a character" (noble, knight, squire, wizard, ranger, peasant, rogue) → 이름 입력 → 조작법 두 줄("Enter actions starting with a verb ex. \"go to the tavern\" or \"attack the orc.\"", "To speak enter 'say \"(thing you want to say)\"' or just \"(thing you want to say)\"") → 첫 문단 "You are Dori, a peasant living in the kingdom of Larion. You have a pitchfork and a nothing else. You wake up and begin working in the fields."
- 우리 데모 적용: 첫 입력 직전에 '누구인가 · 가진 것 · 지금 하는 일'을 2인칭 한두 문장으로 묶고, 입력칸 예시를 "행동 예 / 말 예" 두 줄로 나눈다.

### 1-2. 역전재판 「첫 번째 역전」 — 본편 전 짧은 프롤로그 사건 [검색 요약만]
- 출처: https://www.siliconera.com/ace-attorney-series-writer-shu-takumi-on-the-trials-tribulations-of-writing-a-trilogy/ , https://media.gdcvault.com/gdc2010/GNR/Amy%20Li_2010.pdf
- 실제로 한 일(요약 기준): 다쿠미 슈는 「역전 자매」 초고가 너무 급히 전개돼서 「첫 번째 역전」을 프롤로그로 넣었다고 했다는 요약. 첫 사건은 주인공의 첫 재판이다. "범인을 먼저 보여 주는 콜드오픈"이라는 점은 이번에 원문으로 확인하지 못했다.
- 우리 데모 적용: 본 갈등(정체 들킴 위험) 앞에 짧고 작은 위기(물 부족) 한 장면으로 조작을 익히게 하는 지금 구조가 이 방식과 맞는지 원문 확인 뒤 판단한다.

### 1-3. Disco Elysium — 어둠 속 내면의 목소리, 기억 잃은 주인공 [검색 요약만]
- 출처: https://post45.org/2024/04/disco-oriented-hauntology/
- 실제로 한 일(요약 기준): 화면이 어두운 채 '고대 파충류 뇌'·'변연계'와의 대화로 시작한다는 리뷰 요약. 쿠르비츠가 내면 독백으로 마음의 작동을 흉내 내려 했다는 요약. 기억상실 설정에 대한 개발자 원문 인용은 찾지 못했다.
- 우리 데모 적용: 아시나의 괄호 독백 "(하아… 하아…)"처럼 내면 목소리로 처지를 먼저 느끼게 하고, 설명 글은 뒤로 미루는 방식을 검토할 수 있다.

### 1-4. 80 Days — 첫 줄에 장소·연도·관계 [검색 요약만]
- 출처: https://if50.substack.com/p/2014-80-days
- 실제로 한 일(요약 기준): 첫 글이 "London, 1872. I have entered into the service of a new gentleman. It would seem he is a gambling man." 라고 요약됨. 장소·시대·주인공의 자리·사건의 씨앗을 세 문장에 담는다.
- 우리 데모 적용: 여는 글 일곱 줄이 같은 역할을 세 줄 안에 할 수 있는지 줄 수를 비교해 본다(글 변경은 사용자 승인 필요).

### 1-5. 인터랙티브 픽션의 프롤로그 [검색 요약만]
- 출처: https://jerz.setonhill.edu/if/online/exposition.html , https://emshort.blog/2007/06/11/inform-7-for-the-fiction-author/
- 실제로 한 일(요약 기준): Jerz는 프롤로그를 주인공 시작 위치를 둘러싼 상호작용 환경으로 보고, 많은 작품이 첫 문단에 설명을 너무 많이 넣는다고 지적했다는 요약. Emily Short의 Inform 7 안내 목차에 "Exposition — letting the player discover material without info-dumping"이 있다는 요약.
- 우리 데모 적용: 세계 설정(제국·페시안·지르다)을 첫 화면에 몰지 않고, 플레이어가 지도·귀찌를 살펴볼 때 하나씩 드러나게 할지 검토한다.

### 1-6. Façade — 문 앞 도착 [원문 미확인]
- 출처 후보: https://www.gamedeveloper.com/pc/feature-the-designer-s-notebook-you-must-play-i-fa-ade-i-now-
- 확인 못 함: 플레이어가 친구 부부 집 문 앞에 도착해 다툼을 엿듣는다는 시작은 검색 결과에서도 확인되지 않았다.

---

## ② 자유 입력을 행동 · 말 · 혼잣말 · 게임에 대한 질문으로 나누기

### 2-1. AI Dungeon — 플레이어가 직접 모드를 고름 [1-1 gist는 원문 확인, 모드 설명은 검색 요약만]
- 출처: https://gist.github.com/AdrienLemaire/33663e9100c009b8ec3409c10f1c2a31 , https://help.aidungeon.com/the-do-mode , https://help.aidungeon.com/the-story-mode , https://help.aidungeon.io/faq/say-mode
- 실제로 한 일: 초기판은 동사로 시작하면 행동, `say "…"` 또는 따옴표면 말로 받았다(원문 확인). 지금 판은 Do(행동, 앞에 "You" 붙임) / Say(말) / Story(서술을 그대로 이야기에 넣음) / See(그림만 만들고 진행에 영향 없음) 네 모드를 둔다(검색 요약). 게임에 대한 질문용 모드는 요약에 없었다.
- 우리 데모 적용: 따옴표로 감싸면 '말', 괄호로 감싸면 '혼잣말', 나머지는 '행동'으로 보는 표기 규칙을 입력칸 예시에 보여 주는 방안을 검토한다.

### 2-2. Façade — 입력을 약 30가지 담화 행위로 줄임 [검색 요약만]
- 출처: Mateas & Stern, "Natural Language Understanding in Façade: Surface-Text Processing", TIDSE 2004, LNCS 3105 — https://www.cp.eng.chula.ac.th/~vishnu/gameResearch/story_november_2005/MateasSternTIDSE04.pdf ; https://grandtextauto.soe.ucsc.edu/2008/03/18/ep-86-learning-from-facade
- 실제로 한 일(요약 기준): 문법·깊은 의미 대신 "말이 대화에서 무엇을 하는가"(동의, 칭찬, 비판, 인사 등)로 분류하고, 인사 규칙과 인물(트립/그레이스) 지칭 규칙을 따로 엮는다. 저자들이 이해 실패율을 약 30%로 추정했고, 실패를 감수한 것은 의도한 선택이었다는 요약.
- 우리 데모 적용: LLM GM이 입력을 먼저 '행동 / 누구에게 한 말 / 혼잣말 / 게임 질문' 넷 중 하나와 '받는 인물'로 라벨링하게 하고, 실패할 때의 기본 처리(예: 행동으로 본다)를 정해 둔다.

### 2-3. 1001 Nights — 왕에게 이야기를 들려 주고 낱말을 감지 [검색 요약만]
- 출처: https://arxiv.org/abs/2308.12915 (Sun 외, AIIDE 2023)
- 실제로 한 일(요약 기준): 플레이어는 샤흐라자드로서 LLM 왕에게 이야기를 들려 주고, 이야기 속 핵심 낱말이 무기가 되어 전투 단계로 넘어간다. 게임스컴 2023에서 200명 넘게 시험했으나 왕을 '탈옥'시킨 사람이 없었다는 부록 요약.
- 우리 데모 적용: 입력 안의 특정 낱말(예: 소지품 이름)을 엔진 쪽에서 직접 감지해 판정 대상으로 삼는 방식을 검토한다.

### 2-4. Inform 7 — '세계 밖' 행동을 따로 둠 [검색 요약만]
- 출처: https://ganelson.github.io/inform-website/book/WI_12_15.html , https://ganelson.github.io/inform-website/book/RB_11_3.html , https://ganelson.github.io/inform-website/book/RB_6_1.html , https://intfiction.org/t/should-about-credits-help-and-hint-be-meta-commands/59978
- 실제로 한 일(요약 기준): 저장·불러오기·HELP·HINT 같은 명령은 세계 안 규칙을 건너뛰는 특별한 행동 묶음이고, 이야기 세계를 바꾸는 데 쓰면 안 된다. 포럼에서는 이런 명령이 턴을 넘기지 않아야 한다는 의견.
- 우리 데모 적용: '게임에 대한 질문'은 판정·수치·턴을 건드리지 않는 별도 경로로 받고, 답한 뒤 같은 입력 자리로 돌아오게 한다.

### 2-5. Ironsworn 'Ask the Oracle' · Mythic 운명표 — 질문은 예/아니오로 [검색 요약만]
- 출처: https://tedtschopp.github.io/Ironsworn-SRD/Ironsworn%20SRD.html , https://wordmillgames.itch.io/mythic-game-master-emulator-second-edition
- 실제로 한 일(요약 기준): 솔로 플레이어는 세계에 대한 질문, 다른 인물의 반응, 다음 일을 오라클로 정한다. 가장 기본은 예/아니오 질문. GM이 있으면 GM이 오라클이다. Mythic 2판은 확률 단계를 고르고 d100을 굴려 예/아니오/특별한 예·아니오/무작위 사건을 얻는다.
- 우리 데모 적용: "근처에 물이 있을까?" 같은 '세계 안 질문'은 게임 질문이 아니라 GM(여우)이 답하는 오라클 질문으로 나눠 받는다.

### 2-6. TRPG 대화 기록의 IC/OOC 구분 [검색 요약만]
- 출처: https://aclanthology.org/2022.emnlp-main.637.pdf (Callison-Burch 외, EMNLP 2022) , https://ianbicking.org/blog/2024/04/roleplaying-by-llm , https://fictionlab.gitbook.io/fictionlab/detailed-guides/ooc-commands
- 실제로 한 일(요약 기준): 논문은 플레이어 발화를 캐릭터 안(IC)/밖(OOC)으로 나누고 의도 감지를 과제로 꼽는다. Bicking은 입력을 대사·행동 의도·직접 명령으로 나누는 설계를 쓰고, GM에게 캐릭터 밖으로 말을 거는 방법을 열린 문제로 남긴다. AI 롤플레이 도구들은 괄호 등 OOC 표기로 규칙·설정 질문을 받는다.
- 우리 데모 적용: OOC 표기(예: 맨 앞 '?' 또는 '[질문]')를 하나 정해 입력칸 안내에 보여 줄지 검토한다(화면 글 변경은 사용자 승인 필요).

### 2-7. Event[0] — 무엇이든 쳐도 AI 칸젠이 답함 [검색 요약만]
- 출처: https://gdcvault.com/play/1025081/ (GDC 2018 "Chatbot Game Manifesto"), https://www.gamedeveloper.com/design/making-a-chatbot-that-drives-a-narrative-in-sci-fi-exploration-game-i-event-0-i-
- 실제로 한 일(요약 기준): 플레이어는 어떤 질문·명령이든 쳐 넣을 수 있고 칸젠이 답하되, 가끔 잘못 알아듣는다. 강연은 플레이어의 공감을 필요한 기술로 본다.
- 우리 데모 적용: 못 알아들었을 때 시스템 오류 문구 대신 인물(여우)의 말투로 되묻게 하는 방안을 검토한다.

---

## 확인 못 한 것 (다음 세션 할 일)
- 위 [검색 요약만] 항목 전부의 원문 확인. 막힌 주소: arxiv.org, en.wikipedia.org, ganelson.github.io, aclanthology.org, help.aidungeon.com, gamedeveloper.com, siliconera.com, post45.org, fandom.com, gdcvault.com 등 (DNS 단계에서 거부됨).
- 비주얼 노벨 실제 화면(999, Steins;Gate, 역전재판 첫 사건 시작 장면) 확인.
- Façade 담화 행위 전체 목록과 "못 알아들음" 처리 방식 원문.
