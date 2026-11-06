import { ABOUT_UNKNOWN, activeFacts, type GmContext, type NarrateContext, type TalkTone } from '../engine/engine.ts';
import { ABILITIES, TIER_LABEL, TRACKS, TRACK_INFO, type CastSpec, type FreeSpec, type NoteEntry, type NoteTier, type Scenario, type Tier } from '../engine/types.ts';
import type { Lore } from './lore.ts';

const quote = (s: string) => `"${s}"`;
const bullets = (xs: readonly string[]) => xs.map((x) => `- ${x}`).join('\n');

function level(value: number, max: number): string {
  const ratio = value / max;
  if (ratio >= 0.85) return '매우 높음';
  if (ratio >= 0.55) return '높음';
  if (ratio >= 0.25) return '보통';
  return '낮음';
}

function itemNames(scenario: Scenario, ids: readonly string[]): string[] {
  return ids.flatMap((id) => {
    const item = scenario.sheet.items.find((i) => i.id === id);
    return item && !item.hidden ? [`${item.name}(${item.desc})`] : [];
  });
}

function castSection(ctx: GmContext, lore: Lore): string {
  const { scenario, beat, free } = ctx;
  // 줄을 쓸 때만 빠지는 화자가 있어도 인물 절은 장면마다 같게 둔다. 프롬프트 앞부분이 달라지면 LLM 캐시가 깨져 호출마다 2초씩 더 든다.
  return (beat.free?.speakers ?? free.speakers)
    .map((key) => {
      const cast = scenario.cast[key];
      if (!cast) return '';
      if (cast.style === 'narration') return `### ${key}\n${bullets(lore.narration.voice)}`;
      const character = cast.lore ? lore.characters[cast.lore] : undefined;
      if (cast.style === 'thought') {
        const samples = character?.samples.thought ?? [];
        return [
          `### ${key} (${cast.display}의 속생각, 소리 내지 않는 독백)`,
          `허용 표정: ${(cast.faces ?? []).join(', ')}`,
          bullets(lore.thought.voice),
          samples.length ? `- 원작 속마음 예: ${samples.map(quote).join(' / ')}` : '',
          bullets((character?.faces ?? []).map((f) => `표정(face): ${f}`)),
        ]
          .filter(Boolean)
          .join('\n');
      }
      if (!character) return `### ${key}`;
      const endings = character.register.forbid_endings;
      return [
        `### ${key} (화면 이름: ${cast.display || key})`,
        `허용 표정: ${(cast.faces ?? []).join(', ')}`,
        `- 겉모습: ${character.look}`,
        `- 성격: ${character.personality}`,
        bullets(character.values.map((v) => `가치관: ${v}`)),
        character.secret ? `- 숨은 설정: ${character.secret}` : '',
        bullets(character.voice.map((v) => `말투: ${v}`)),
        bullets(character.faces.map((f) => `표정(face): ${f}`)),
        endings.length ? `- 대사를 ${endings.map(quote).join(', ')}로 끝내지 않는다.` : '',
        character.samples.speech.length ? `- 원작 대사 예: ${character.samples.speech.map(quote).join(' / ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

const tier = (lore: Lore, t: NoteTier) => lore.knowledge.filter((n) => n.tier === t);

/** 지식 세 칸. 숨길 것은 내용 없이 이름만 적어 아시나도 모른다고 받게 한다. */
function knowledgeSections(lore: Lore): string[] {
  return [
    '## 누구나 아는 것',
    bullets(tier(lore, 'common').map((n) => `${n.name}: ${n.text}`)),
    '## 아시나가 아는 것',
    bullets(tier(lore, 'asina').map((n) => `${n.name}: ${n.text}`)),
    '## 숨길 것(아시나도 모른다. 누구도 입에 담지 않는다)',
    bullets(tier(lore, 'hidden').map((n) => n.name)),
  ];
}

export function buildSystem(ctx: GmContext, lore: Lore): string {
  const { scenario, beat, free, state } = ctx;
  if (ctx.reaction) {
    return [
      '너는 사막에서 칼을 겨눈 인물의 대사 한 줄을 쓴다. 플레이어는 아시나다. 한국어 JSON으로만 답한다.',
      ...free.speakers.flatMap(key => {
        const cast = scenario.cast[key];
        const character = cast?.lore ? lore.characters[cast.lore] : undefined;
        return cast?.style === 'speech' && cast.lore !== scenario.sheet.name && character
          ? [`화자: ${key}. 성격: ${character.personality}`, `허용 표정: ${(cast.faces ?? []).join(', ')}`, ...character.voice, ...character.faces.map(f => `표정: ${f}`)]
          : [];
      }),
      '상대가 보이는 감정과 몸의 반응을 받아 짧게 질문하거나 명령하거나 비웃는다. 입력을 보고 지금 관찰할 수 있는 모습만 받는다. 감탄만 하거나 이유 없는 질문으로 넘기지 않는다.',
      '아시나가 말을 하지 않았다면 말을 했다고 전제하지 않는다. 모르는 이름·신분·미래 사건은 밝히지 않는다. 현재 칼과 복장 상태를 바꾸거나 다음 사건을 만들지 않는다.',
    ].join('\n');
  }
  const facing = free.speakers.some((s) => scenario.cast[s]?.style === 'speech' && scenario.cast[s]?.lore !== scenario.sheet.name);
  const remembered = facing ? (state.heard ?? []).map((h) => (h.action ? `(행동) ${h.text}` : quote(h.text))) : (state.said ?? []);
  const recent = state.recent.slice(-6).map((l) => `${scenario.cast[l.speaker]?.display || '내레이션'}: ${l.text}`);
  return [
    `너는 웹툰 「${lore.work}」(${lore.credit})을 바탕으로 한 1인용 비주얼 노벨 TRPG의 진행자다. 플레이어는 주인공 아시나를 연기한다. 너는 정해진 장면 안에서 인물의 대사와 내레이션을 쓰고, 플레이어가 배경을 물을 때만 GM 으로 짧게 설명한다.`,
    '## 원칙',
    bullets([
      '이 장면의 목표와 금지 전개를 벗어나지 않는다. 다음 장면의 사건을 미리 쓰지 않는다.',
      '판정 결과와 줄거리 요지는 이미 정해져 있다. 결과를 뒤집거나 더 좋게, 더 나쁘게 바꾸지 않는다.',
      `${lore.rating}: 노골적인 성적 묘사, 잔혹한 묘사, 심한 욕설을 쓰지 않는다. 긴장과 위협은 살리되 상처는 가볍게 다룬다.`,
      '한국어만 쓴다. 한자, 영어, 이모지를 쓰지 않는다.',
      '게임, 주사위, 판정, 인공지능 같은 바깥 이야기를 하지 않는다.',
      '원작 대사 예는 말투를 익히는 참고용이다. 그대로 옮겨 쓰지 않고 새 대사를 쓴다.',
      '내레이션은 과거형으로 쓴다(예: 칼끝이 흔들렸다).',
      '반드시 지정된 JSON 형식으로만 답한다.',
    ]),
    ...knowledgeSections(lore),
    '## 인물과 말투',
    castSection(ctx, lore),
    `## 이번 장면: ${beat.title}`,
    bullets([`상황: ${free.situation}`, `장면 목표: ${free.goal}`, ...(facing ? [] : ['아시나 곁에 아무도 없다. 다른 인물을 등장시키거나 그 반응을 쓰지 않는다.'])]),
    '### 금지 전개',
    bullets(free.must_not),
    '## 지금 상태',
    bullets([
      ...TRACKS.map((t) => `${TRACK_INFO[t].label} ${state.tracks[t]}/${TRACK_INFO[t].max}(${level(state.tracks[t], TRACK_INFO[t].max)}): ${TRACK_INFO[t].desc}`),
      `아시나의 소지품: ${itemNames(scenario, state.items).join(', ') || '없음'}`,
      ...activeFacts(scenario, state).map((f) => `이미 일어난 일: ${f.text}`),
      ...(remembered.length ? [`플레이어가 이미 한 말과 행동(인물은 이를 기억하고, 어울리면 비꼬듯 되받는다. "(행동)"은 말이 아니니 말처럼 인용하지 않는다): ${remembered.join(' / ')}`] : []),
    ]),
    '## 직전까지의 대사',
    recent.length ? bullets(recent) : '- (없음)',
  ].join('\n\n');
}

export function buildInterpretUser(ctx: GmContext, lore: Lore, only?: readonly InputKind[]): string {
  const { free, scenario, state, text } = ctx;
  const options = free.approaches.map((a) => {
    const item = a.item ? scenario.sheet.items.find((i) => i.id === a.item)?.name : undefined;
    const examples = a.examples.length ? ` 예: ${a.examples.map(quote).join(', ')}` : '';
    return `- ${a.id}: ${a.label}. ${a.hint}${examples}${item ? ` (소지품 ${item} 필요)` : ''}`;
  });
  const items = state.items
    .map((id) => scenario.sheet.items.find((i) => i.id === id))
    .filter((i) => i && !i.hidden)
    .map((i) => `${i?.id}=${i?.name}`)
    .join(', ');
  const notes = lore.knowledge.filter((n) => n.tier !== 'hidden').map((n) => `${n.id}=${n.name}(${n.keys.join(', ')})`).join(', ');
  return [
    '## 할 일: 플레이어 입력 해석',
    `플레이어 입력: ${quote(text)}`,
    '먼저 kind 로 입력의 종류를 하나 고른다. 낱말이 아니라 누구에게 무엇을 하려는 입력인지로 고른다. 상대에게 건넨 말·인용·말하는 행위는 person 이고, 아시나가 무언가를 해내려고 시도하는 몸 동작은 action 이다. 감정이나 몸 상태 때문에 저절로 나온 반응은 idle 이다. 장면의 목표에서 거꾸로 추측해 입력에 없는 회피·설득·유인 목적을 붙이지 않는다. 상대를 평하거나 욕하거나 놀리는 문장은 그대로 입에 올리는 말이니 "~한다"로 끝나지 않아도 person 이다.',
    free.speakers.some((k) => scenario.cast[k]?.style === 'speech' && scenario.cast[k]?.lore !== scenario.sheet.name) ? '지금 아시나 앞에 사람이 있다. "너", "넌"이라고 부르는 말은 그 사람에게 건넨 말이다.' : '지금 아시나 곁에 아무도 없다.',
    only?.includes('self')
      ? `이 입력이 아시나가 이야기 속에서 하는 혼잣말인지, 플레이어가 게임에 건넨 말인지 다시 가린다. 답이 사실로 정해져 있는 물음(누구인지, 이름, 출신, 어디인지, 그게 맞는지 확인하는 말)은 자기 자신에 대한 말이어도 알려고 묻는 말이니 self 가 아니다. 정보나 할 일을 알려고 묻는 말도 self 가 아니다. 물음 꼴이어도 답을 바라지 않는 탄식, 자책, 신세 한탄(왜 이러고 있는지, 어쩌다 이렇게 됐는지 되뇌는 말)만 self 다. kind 는 ${only.join(', ')} 중에서 고른다.`
      : only?.length === 2 && only.includes('lore') && only.includes('game')
      ? `이 물음이 이야기 속 세계를 묻는지, 이 게임 자체를 묻는지 다시 가린다. "성공하면", "실패하면" 꼴로 판정 결과가 가져오는 일(무엇을 얻는지, 죽는지, 끝나는지)을 묻는 말은 이야기의 앞일이 아니라 규칙을 묻는 것이니 game 이다. 화면의 단추나 창(수첩, 기록, 저장)을 어디서 보거나 누르는지 묻는 말도 세계가 아니라 화면을 묻는 것이니 game 이다. 이야기 속 세계의 것도 아닌 말(현실의 일, 게임 바깥 잡담)도 game 으로 둔다. kind 는 ${only.join(', ')} 중에서 고른다.`
      : only?.length === 2 && only.includes('lore') && only.includes('person')
      ? '이 존댓말 물음이 눈앞의 인물에게 건넨 말인지, 세계나 자기 처지를 진행자에게 묻는 말인지 다시 가린다. 상대의 행선지, 사정, 정체, 도움을 묻는 말은 그 인물에게 건넨 말이니 person 이다. 장소, 나라, 물건, 아시나 자신을 묻는 말은 lore 다. kind 는 lore, person 중에서 고른다.'
      : only?.length === 1 && only[0] === 'game'
      ? '이 말은 이 게임 자체를 묻는 말이다. 어느 게임 항목을 묻는지 다시 고른다. 다른 말로 물어도 그 항목이 다루는 일이면 그 항목이다. 묻는 것이 어느 항목이 다루는 일도 아닐 때만 about 을 none 으로 두고, kind 는 game 으로 둔다.'
      : only?.includes('idle') && only.includes('person')
      ? '이 입력에 상대에게 실제로 건넨 말이 있는지, 결과를 얻으려는 시도가 있는지 다시 가린다. 건넨 말이 있으면 person, 시도가 있으면 action, 둘 다 없이 감정·몸 반응만 있으면 idle 이다.'
      : only?.includes('idle')
      ? '이 입력이 무언가를 시도하는 행동인지, 아무것도 시도하지 않고 그대로 있는 것인지 다시 가린다. 몸을 움직여 상황을 바꾸려는 내용이나 결과가 불확실한 일이 없으면 idle 이다. 앉거나 누운 채 그대로 있기, 얘어붙기, 막지 않고 칼을 맞기, 그저 기다리기도 idle 이다. kind 는 action, idle 중에서 고른다.'
      : only ? `이 입력은 답을 구하는 물음이다. kind 는 ${only.join(', ')} 중에서 고른다. 앞 인물에게 직접 따지는 말이 아니면 person 을 고르지 않는다.` : '',
    bullets([
      'how: 지금 무엇을 입력하면 되는지, 무엇부터 하면 되는지를 묻는 말. 이야기 속 고민이 아니다. "게임"이라는 낱말이 들어 있어도 어떻게 진행하라는 건지 모르겠다는 말이면 how 다(예: "여기 뭐 치면 되는 건데?", "규칙 좀 알려 줘", "이거 나보고 뭘 하라는 건데"). 그러나 규칙의 한 요소를 집어 그것이 어떻게 돌아가는지 묻는 말은 how 가 아니라 game 이다.',
      'game: 게임 자체에 대한 말. 화면에 보이는 규칙 용어의 뜻, 그 규칙이 어떻게 돌아가는지, 수치가 줄거나 늘면 어떻게 되는지, 판정 결과가 무엇을 바꾸는지(행운, 귀찌 수명, 판정과 주사위, 대가, 판정의 목표 숫자 10, 성공·대가·실패의 결과, 의심, 집착, 호감, 탈주 준비도), 화면의 단추와 조작 위치, 저장과 불러오기, 게임을 끝내겠다는 말, 진행자가 누구인지, 게임을 누가 만들었는지 묻는 말이 여기에 든다. 곁에 아무도 없는데 "너", "넌"이라고 부르는 말은 진행자에게 건넨 말이다(예: "대가가 뭔데?", "불러오기는 어디 있어?", "이쯤에서 접을까 봐", "너 진짜 여우야?").',
      'lore: 세계, 장소, 인물, 물건, 아시나의 처지를 진행자에게 묻는 말. 답을 구하는 물음이면 곁에 아무도 없어도 lore 다. 플레이어가 "나", "내"라고 하면 아시나를 묻는 것이다. 아시나가 이루려는 일을 묻는 말도 lore 다. 자기 자신이나 세계를 묻는 물음은 앞에 사람이 있어도 lore 다. 어디 있는지 묻는 말도 물음이지 행동이 아니다(예: "내 이름이 뭐였지?", "크롬웰이 어떤 나라야?", "저 호위들 왜 저래?"). "성공하면", "실패하면" 꼴로 판정 결과가 가져오는 일(무엇을 얻는지, 죽는지, 끝나는지)을 묻는 말은 세계가 아니라 규칙을 묻는 것이니 lore 가 아니라 game 이다. 화면의 단추나 창(수첩, 기록, 저장)을 어디서 보거나 누르는지 묻는 말도 lore 가 아니라 game 이다.',
      'person: 등장인물에게 소리 내어 건넨 말. 그대로 입에 올릴 수 있는 문장(호칭, 인사, 부탁, 따짐, 설득, 놀림, 거친 말), 따옴표로 인용한 말, "~라고 말한다", "소리를 지른다"처럼 말하는 행위를 적은 글이 여기에 든다. 앞에 있는 사람이든 멀리 보이는 사람이든 같다. "저 사람", "저 남자"처럼 3인칭으로 가리키며 묻는 말은 건넨 말이 아니라 lore 다. "성공하면", "실패하면" 꼴로 판정 결과를 조건으로 묻는 말은 이야기 속 인물이 알 수 없는 것이니 앞에 사람이 있어도 person 이 아니라 game 이다(예: "이봐요, 거기 잠깐만요!", "칼 좀 치워 주실래요").',
      'self: 아무에게도 건네지 않고 답도 바라지 않는 혼잣말, 불평, 감탄, 몸 상태(예: "덥다 더워", "아 진짜 짜증 나", "졸려"). 답을 구하는 물음은 self 가 아니다. 자기 이름이나 정체처럼 사실로 답이 정해진 것을 확인하는 물음도 답을 구하는 물음이다. 이야기 속 일을 콕 집어 말하지 않고 그만하고 싶다, 더 하기 싫다고만 하는 말은 아시나의 푸념처럼 들려도 플레이를 그만두려는 말이니 self 가 아니라 game 이다. 그만 걷고 싶다처럼 이야기 속 일을 집어 말하면 self 다. 끝내지 않겠다는 말도 self 다.',
      'action: 아시나가 무언가를 해내려고 스스로 시도하는 일을 서술한 문장. 물건을 쓰거나 상대에게 신호하거나 상황을 바꾸려는 동작은 엉뚱해도 action 이다(딴짓은 odd 로 따로 표시한다). "~한다" 어미, 몸의 움직임, 위치·자세의 변화만으로 action 을 고르지 않는다. 태도·감정·몸 상태가 저절로 드러났을 뿐이면 idle 이다. 상대에게 직접 말하는 투(~요, ~세요, ~줘)로 쓴 글과 물음은 action 이 아니다.',
      'idle: 상대에게 건네는 말도, 무언가를 해내려는 시도도 없는 입력. 그대로 있기뿐 아니라 감정 때문에 몸에 드러난 반응도 idle 이다. 울음·얼어붙음·떨림·주저앉음 자체는 소리를 내거나 움직였어도 person 이나 action 이 아니다. 상대가 보고 반응할 수 있다는 이유로 person 을 고르지 않는다. 말을 섞어 살려 달라거나 설득하면 그 건넨 말을 기준으로 person 및 해당 접근법을 고른다. 상황을 바꿀 목적으로 움직이거나 기다렸다가 하겠다는 입력은 action 이다. 아래 접근법과 몸짓 낱말이 겹친다는 이유만으로 시도로 바꾸지 않는다.',
      'bad: 15세 이용가에 맞지 않는 행동이나 심한 욕, 금지 전개를 곧장 일으키려는 입력.',
    ]),
    'approach: kind 가 action 이나 person 일 때 아래 항목 중 맞는 것의 id. 맞는 것이 없으면 none. 살려 달라거나 설득하는 내용이 없는 대사는 none 이다. 다른 kind 면 none.',
    ...options,
    'about: kind 가 lore 일 때 묻는 대상의 id. 아는 것의 글에 답이 없는 질문, 인물의 속마음이나 이유, 앞으로 일어날 일을 묻는 질문이면 none. kind 가 game 이면 아래 게임 항목 중 묻는 일을 다루는 항목의 id. 다른 말로 물어도 그 항목이 다루는 일이면 그 항목이다. 어느 항목이 다루는 일도 아닐 때만 none. 다른 kind 면 none.',
    `대상 id: ${notes}`,
    `게임 항목 id: ${(scenario.gameHelp ?? []).map((h) => `${h.id}=${h.name}`).join(', ')}`,
    'risk: 이 입력이 실제로 하려는 위험한 일. attack=칼 든 상대를 때리거나 걷어차거나 들이받거나 무기를 빼앗으며 몸으로 덤빈다. unmask=귀찌나 변장을 풀어 본모습을 드러내려 한다. identity=자기가 공녀이거나 웰든 가문이라고 밝힌다. 피하기, 달아나기, 말로 따지기, 물건 보여 주기, 공녀가 아니라고 잡아떼기, 물음은 none.',
    'odd: kind 가 action 이고 지금 상황과 동떨어진 딴짓이면 true. 살아남거나 벗어나려는 뜻이 없이 기분 내키는 대로 하는 몸짓(춤, 노래, 모래성 쌓기, 하늘에 소리치기, 제자리에서 돌기, 모래 먹기)이 딴짓이다. 살아남으려고 하는 평범한 행동(둘러보기, 물 마시기, 숨기, 피하기, 도망치기)과 지금 상황에 느낀 겁·서러움·억울함을 몸으로 드러내는 행동(울기, 무릎 꿇기, 주저앉기, 고개 숙이기)은 false.',
    'absurd: 이 세계에 없는 물건이나 갑작스러운 초능력을 쓰려는 시도면 true. 칼과 낙타로 사막을 건너는 시대다. 전기·엔진·전자기기와 공장에서 찍어 내는 현대 공산품은 없다. 가진 소지품 칸에 없는 그런 물건을 꺼내 쓰는 행동이 여기 든다.',
    'bold: kind 가 action 이고 상대가 그냥 지나칠 수 없는 큰 행동이면 true. 상대의 몸에 닿는 일(입을 맞추기, 끌어안기, 때리기, 밀치기, 손을 잡기), 상대를 겨누거나 무기를 빼앗는 일, 상대 앞에서 자기 몸을 크게 내던지는 일이 큰 행동이다. 혼자 하는 딴짓·둘러보기·멀리 서 있기·울기는 false. 곁에 사람이 없으면 false.',
    'deed: kind 가 action 이면 아시나가 실제로 한 행동을 과거형 한 문장으로 요약한다(20자 안팎, 주어 없이, 예: "남자의 입에 입을 맞췄다", "남자를 갑자기 끌어안았다", "모래를 한 줌 집어 입에 넣었다"). 입력의 줄임말·속어는 일어난 일을 그린 보통 말로 바꾼다("뽀뽀" → "입을 맞췄다"). 입력에 없는 것은 넣지 않는다. 다른 kind 면 빈 문자열.',
    'approach 가 none 인 action 일 때만 stat 과 difficulty 를 정한다. stat: 재치(머리, 눈치), 손재주(손놀림), 매력(태도, 표정), 근력(몸 쓰기), 교양(지식, 예법). difficulty: 지금 상황에서 쉬움, 보통, 어려움. 그 밖에는 stat 은 재치, difficulty 는 보통으로 둔다.',
    '소지품을 꺼내 보이거나 쓰는 행동이 들어 있으면, 억울함이나 사정을 말하는 내용이 함께 있어도 그 소지품이 필요한 항목을 고른다.',
    `소지품을 꺼내 쓰는 행동이면 item 에 소지품 id 를 넣고, 아니면 빈 문자열을 넣는다. 소지품: ${items || '없음'}`,
    '형식: {"reason":"20자 안팎의 근거","kind":"action","about":"none","risk":"none","approach":"none","item":"","odd":false,"absurd":false,"bold":false,"deed":"","stat":"재치","difficulty":"보통"}',
  ]
    .filter(Boolean)
    .join('\n');
}

/** 등급마다 입력한 행동이 어떻게 됐는지. */
const TIER_MEANING: Record<Tier, string> = {
  crit: '입력한 행동이 뜻대로 이뤄지고 좋은 수치 효과가 커진다. 성공 결과의 서술을 따른다.',
  hit: '입력한 행동이 뜻대로 이뤄진다. 헛손질, 빗나감, 넘어짐으로 쓰지 않는다.',
  mixed: '입력한 행동은 이뤄지고 거기에 대가가 따른다. 헛손질이나 빗나감으로 끝내지 않는다.',
  miss: '입력한 행동은 이뤄지지 않는다. 이뤄진 것처럼 쓰지 않는다.',
};

/** 플레이어가 친 말은 이미 아시나의 줄로 화면에 그대로 있다. GM 은 그 말을 고치거나 다듬어 다시 쓰지 않고, 아시나 대사 줄을 새로 만들지 않는다. */
const PLAYER_VOICE_RULE = '아시나의 대사 줄은 쓰지 않는다. 플레이어가 친 말은 이미 아시나의 줄로 화면에 글자 그대로 있다. 그 말을 고쳐 쓰거나 다듬어 다시 쓰지 않고, 상대 인물의 반응·내레이션·결과만 쓴다. 상대의 반응은 플레이어가 실제로 한 그 말·행동의 뜻에 맞아야 한다.';
/** 아직 안 나온 이름이나 사실을 플레이어가 꺼내도 다른 말로 바꾸지 않고, 들은 인물이 이야기 안에서 반응한다. */
const UNKNOWN_NAME_RULE = '거친 말, 놀림, 헛소리, 황당한 행동은 그대로 일어난 일이다. 조용히 다른 말로 바꾸거나 없던 일로 하지 않고, 그 말을 들은 인물이 그 뜻에 맞게 반응한다. 반응의 종류와 세기는 그 인물의 성격·가치관에서 끌어낸다. 인물이 플레이어가 쓴 낱말을 되받아 말해도 된다.';
/** 상대 인물은 원작 그대로여야 한다. 플레이어의 말이 어떻든 인물이 성격을 벗어나 반응하지 않는다. */
const CHARACTER_RULE = '상대 인물의 대사와 그 인물을 그리는 내레이션(표정, 눈빛, 몸짓)은 위 인물 설명의 성격·가치관·말투 안에서만 쓴다. 플레이어의 말이 거칠거나 황당하거나 뜻 모를 말이어도, 그 인물이 그 말을 들었다면 어떻게 할지를 성격·가치관에서 끌어내 쓴다. 인물 설명에 없는 반응(당황해 말을 더듬기, 놀라 되묻기, 사과, 변명, 친절, 장난, 흥분)으로 바꾸지 않는다. 원작 대사 예의 결을 따른다.';

const THOUGHT_RULE = '입력은 아시나 자신의 말이나 행동이다. 속마음이 입력을 남의 말처럼 듣거나 되묻거나 인용하지 않는다("무슨 소리야", "~라고 하면" 같은 식 금지). 입력에 쓴 문구를 다시 쓰지 말고 몸 상태와 주변 상황으로 잇는다.';
const ITEM_RULE = '소지품은 아시나 손을 떠나지 않는다. 던진다는 입력이어도 끈을 쥔 채 휘두르거나 곧바로 되찾는 모습으로 쓴다.';

const TONE: Record<TalkTone, string> = {
  plain: '이번 입력은 판정이 없다. 말로 주고받는 데서 그친다.',
  repeat: '플레이어가 같은 말을 되풀이했다. 인물은 그걸 알아채고 짜증을 내며 재촉한다.',
  deflect: '이 입력은 15세 이용가에 맞지 않거나 금지 전개다. 일어나지 않은 일로 두고, 그 내용을 입에 담지 않은 채 인물이 비웃거나 잘라 내며 돌려 말한다.',
};

/** 이번 판에 이미 나온 줄. 검증(repeat_play)은 나레이션·속마음도 화자마다 막으니 프롬프트도 그 줄들을 알려 처음부터 피하게 한다. */
function spokenRule(ctx: GmContext): string[] {
  const said = ctx.free.speakers.flatMap((s) => (ctx.scenario.cast[s]?.style !== 'gm' ? (ctx.state.spoken?.[s] ?? []).slice(-6) : []));
  return said.length ? [`이번 판에 이미 한 말이라 다시 쓰지 않는다: ${said.map(quote).join(' / ')}`] : [];
}

/** 이 장면에서 모델이 먼저 쓰면 안 되는 것. ahead: 다음 장면에 그대로 나올 고정 줄, unsaid: 플레이어가 아직 말하지 않은 낱말. */
export interface WriteLimits {
  ahead: readonly string[];
  unsaid: readonly string[];
}

const NO_LIMITS: WriteLimits = { ahead: [], unsaid: [] };

function limitRules({ ahead, unsaid }: WriteLimits): string[] {
  return [
    ...(ahead.length ? [`다음 장면에 그대로 나올 대사라 지금은 쓰지 않는다(위의 원작 대사 예에 있어도 마찬가지다): ${ahead.map(quote).join(' / ')}`] : []),
    ...(unsaid.length ? [`플레이어가 아직 말하지 않은 낱말이라 어떤 줄에도 쓰지 않는다: ${unsaid.join(', ')}`] : []),
  ];
}

export function buildTalkUser(ctx: GmContext, feedback: string, maxLines: number, maxChars: number, limits: WriteLimits = NO_LIMITS): string {
  if (ctx.reaction) {
    return [
      `아시나에게 지금 보이는 반응: ${quote(ctx.text)}`,
      '이 모습을 본 상대의 대사 한 줄, 40자 이내. 그 반응의 구체적인 부분을 짚어서 받아라. 아시나의 말을 대신 쓰거나 단순 감탄·침묵으로 넘기지 않는다.',
      '앞 장면의 대사를 되묻지 않는다. 원작의 어미와 성격을 지키면서 이 반응에 맞는 새 말을 쓴다. 설명 독백·상황 해설은 쓰지 않는다.',
      FACE_RULE,
      ...limitRules(limits),
      feedback,
      LINES_FORMAT,
    ].filter(Boolean).join('\n');
  }
  return [
    '## 할 일: 판정 없는 대화',
    `플레이어 입력: ${quote(ctx.text)}`,
    ctx.interject
      ? bullets([
          '플레이어가 이야기 도중에 끼어들었다. 답한 뒤 곧바로 아래의 줄이 이어지니, 그 줄을 먼저 쓰거나 그 줄과 어긋나게 쓰지 않는다.',
          ...ctx.interject.upcoming.slice(0, 6).map((u) => `곧 나올 줄: ${u}`),
          ctx.interject.action ? '입력은 행동이다. 나레이션으로 그 시도가 어떻게 되는지 1~2줄로 그린다. 시도는 반드시 "~하려 했지만"처럼 이뤄지지 못하고 끝난다. 곧 나올 줄은 네 답 바로 뒤에 앱이 그대로 내보내니 답에 넣지 않는다. 결과는 인물의 반응이나 상황으로 보여 준다.' : '',
          '지금 장면에 없는 인물은 답하지 않는다. 상대가 없으면 혼잣말이나 속마음으로 받는다.',
          '인물이 말하던 중이면 그 인물이 자기 말투로 끊긴 것을 짧게 받고 답한다. 답한 뒤 그 인물이 하던 말이 이어진다.',
        ].filter(Boolean))
      : '',
    bullets([
      `1~${maxLines}줄. 입력이 엉뚱하거나 뜻 모를 말이어도 막지 않는다. 인물이 그 말을 실제로 듣고 자기 말투대로 반응한다. 무슨 말인지 짚어서 답하고, 뻔한 말로 넘기지 않는다.`,
      PLAYER_VOICE_RULE,
      CHARACTER_RULE,
      ctx.interject || ctx.reaction ? '답한 뒤 이야기가 이어지니 다음에 뭘 할지 말하지 않는다.' : `반응 끝에 장면 목표로 다시 끌고 온다: ${ctx.free.goal}`,
      TONE[ctx.tone ?? 'plain'],
      ctx.shown ? '이 입력은 말이 아니라 아시나의 몸이 먼저 드러난 모습이다. 아시나가 말한 것처럼 받지 않는다. 먼저 내레이션 한 줄로 그 모습을 그리고, 상대 인물이 그것을 보고 성격과 말투대로 반응한다.' : '',
      ctx.self ? '이 입력은 아시나의 혼잣말이다. 앞에 사람이 있어도 듣고 대꾸하지 않는다. 속마음과 내레이션으로만 받고, 몸 상태와 주변만 그린다. 입력에 없는 행동(가방 뒤지기 등)이나 없는 소지품을 쓰지 않는다.' : '',
      ctx.absurd
        ? [
            '플레이어가 이 세계에 없는 물건이나 힘을 쓰려 했다. 그런 것은 일어나지 않는다. 그 낱말을 쓰지 말고, 먼저 내레이션 한 줄로 아시나가 실제로 한 동작을 이 세계의 말로 그린다(예: 품을 더듬었지만 잡히는 것이 없었다, 빈 손을 귀에 대었다, 허공에 손을 흔들었다). "이상한 몸짓"이라는 말은 쓰지 않는다.',
            ctx.self ? '그 뒤 속마음 한 줄로 받는다.' : '그 뒤 상대 인물이 그 동작을 보고 성격·말투대로 짧게 한마디 한다(비꼬거나 어이없어한다). 설명하거나 묻지 않는다.',
            '수치·상황은 바뀐 게 없다. 다음 사건으로 넘어가지 않는다.',
          ].join(' ')
        : '',
      '정체를 밝히는 답은 하지 않는다. 플레이어 입력을 되풀이하지 않는다.',
      ...(['b04_blade', 'b05_why', 'b06_swing'].includes(ctx.beat.id)
        ? ['칼을 겨눈 이유나 자기 잘못을 따지는 말에는 남자가 "왜지?", "…뭐?" 같은 원작 1화의 짧고 차가운 반응으로 받는다. 숨은 첩자 의심은 나레이션이나 여우가 설명하지 않는다. 남자도 첩자라는 말을 입 밖에 내지 않는다. 이름·페샨·왕이라는 신분도 밝히지 않는다. 같은 판에서 이미 한 줄은 다시 쓰지 않는다.']
        : []),
      THOUGHT_RULE,
      ITEM_RULE,
      '이 세계에 없는 말(현대 물건, 게임 바깥 낱말)은 인물이 뜻을 모른다. 그 낱말을 쓰지 말고 "이상한 소리" 같은 말로 받는다.',
      UNKNOWN_NAME_RULE,
      '대사 줄에는 그 인물이 소리 내어 하는 말만 쓴다. 행동과 표정은 나레이션 줄로 쓴다.',
      '지금의 긴장(칼끝, 시선)은 그대로 둔다. 다음 사건으로 넘어가지 않는다.',
      `화자는 ${ctx.free.speakers.join(', ')} 중에서만 고른다. 대사 한 줄은 ${maxChars}자 이내.`,
      ...spokenRule(ctx),
      ...limitRules(limits),
      FACE_RULE,
    ]),
    feedback ? `## 직전 답의 문제(반드시 고칠 것)\n${feedback}` : '',
    LINES_FORMAT,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildNarrateUser(ctx: NarrateContext, feedback: string, maxLines: number, maxChars: number, limits: WriteLimits = NO_LIMITS): string {
  const { text, approach, roll, outcome, free, scenario } = ctx;
  const facing = free.speakers.some((s) => scenario.cast[s]?.style === 'speech' && scenario.cast[s]?.lore !== scenario.sheet.name);
  return [
    '## 할 일: 판정 결과 연출',
    `플레이어 입력: ${quote(text)}`,
    `행동 해석: ${approach.label}`,
    ctx.improv ? '이 행동은 정해 둔 전개에 없는 즉흥 행동이다. 플레이어가 한 행동을 먼저 장면으로 보여 주고, 인물이 거기에 반응한 뒤, 장면 목표로 끌고 온다.' : '',
    ctx.improv?.deed ? `플레이어가 실제로 한 일: ${ctx.improv.deed} — 이미 일어난 일이다. 그대로 보여 주고, 막거나 없던 일로 하지 않는다.` : '',
    ctx.improv?.bold
      ? '상대가 그냥 지나칠 수 없는 큰 행동이다. 상대 인물의 반응을 실제 말 내용이 있는 대사 한 줄 이상과 몸짓·눈빛 내레이션으로 합쳐 2~3줄 쓴다. 반응의 방향은 그 인물의 성격·가치관에서 고른다. 표정은 실제 결과에 따른다. 몸이나 무기를 직접 붙잡아 저지하는 행동은 그에게 가한 위협이다. 이를 받거나 되막는 남자의 대사는 menacing이며, 단순한 놀람·관찰·흥미로 넘기지 않는다. 말솜씨나 위협이 아닌 뜻밖의 대담함에 관심을 느끼는 경우의 intrigued와 구별한다. 한 줄로 넘기지 않는다.'
      : '',
    ctx.improv?.absurd ? '이 세계에 없는 물건이나 힘을 쓰려 했다. 그런 것은 일어나지 않는다. 그 낱말을 쓰지 말고, 아시나가 실제로 한 동작을 이 세계의 말로 구체적으로 그린다(예: 허공에 손바닥을 내밀었다, 빈 손을 귀에 대었다). "이상한 몸짓"이라는 말은 쓰지 않는다. 상대 인물이 있으면 그 인물이 어이없어하며 한마디 한다.' : '',
    `결과: ${TIER_LABEL[roll.tier]} (반드시 이 결과대로). ${TIER_MEANING[roll.tier]}`,
    facing ? '앞 인물을 쓰러뜨리거나 칼을 빼앗아 장면을 끝내지 않는다. 몸으로 덤벼 성공했으면 상대가 허를 찔려 움찔하거나 칼날이 아슬아슬하게 비껴가는 모습으로 쓴다.' : '',
    `반드시 일어날 일: ${outcome.gist ?? ''}`,
    ctx.price ? `대가(반드시 장면에 보인다. 성공한 행동 자체를 없던 일로 만들지 않는다): ${ctx.price.text}` : '',
    '막아야 할 일은 "안 된다"고 쓰지 않고 이야기 속 이유로 보여 준다.',
    PLAYER_VOICE_RULE,
    CHARACTER_RULE,
    UNKNOWN_NAME_RULE,
    '플레이어가 입력한 행동만 보여 준다. 입력에 없는 이동(달려가기, 오래 걷기, 거리 벌리기), 입력에 없는 말(길 묻기, 인사), 플레이어 대신 내리는 결정, 지금 상태에 없는 일(붙잡혀 있음, 칼이 목에 있음)은 쓰지 않는다. 대가는 입력한 행동이 그 자리에서 어긋나는 모습으로 보여 준다.',
    outcome.state_guard?.length ? `이 결과에서 쓰면 안 되는 표현: ${outcome.state_guard.join(', ')}` : '',
    approach.presume?.length && !approach.presume.some((w) => text.replace(/\s+/g, '').includes(w.replace(/\s+/g, '')))
      ? `플레이어는 "${approach.label}"과 같은 행동을 하지 않았다. 원작 대사에 나오는 그 행동(${approach.presume.join(', ')})을 아시나가 했다고 쓰지 말고, 플레이어가 실제로 한 행동을 그대로 보여 준다. '반드시 일어날 일'에 그 행동이 적혀 있어도 결과만 따르고, 그 뒤에 일어나는 일은 상대나 사물을 주어로 쓴다.`
      : '',
    outcome.lines.length
      ? `원작 대사(뜻과 말투의 기준일 뿐이다. 아시나의 줄은 참고만 하고 쓰지 않으며, 상대의 줄은 플레이어가 실제로 한 말·행동에 맞게 다시 쓴다): ${outcome.lines.map((l) => `${l.speaker}: ${l.text}`).join(' / ')}`
      : '',
    '## 쓰기 규칙',
    bullets([
      `2~${maxLines}줄. 플레이어 입력은 이미 아시나의 줄로 화면에 그대로 나왔다. 그 말·행동이 어떻게 되는지를 내레이션으로 보여 주고, 상대의 반응과 결과를 쓴다.`,
      '"반드시 일어날 일"의 문장을 그대로 옮기지 말고 장면으로 보여 준다.',
      ...(ctx.price ? ['"대가"는 내레이션 한 줄로 장면에 남긴다. 수치·규칙·대가라는 낱말은 쓰지 않고 일어난 일만 보여 준다.'] : []),
      '플레이어가 하지 않은 말·주장·몸짓을 아시나가 했다고 쓰지 않는다. 상대의 반응도 플레이어가 실제로 한 말·행동에 대한 반응이어야 한다. 원작 대사가 입력과 맞지 않으면 뜻만 살리고 낱말은 버린다.',
      '아시나 쪽은 내레이션(입력에 있는 말·동작과 그 결과)과 속마음으로만 쓴다. 입력에 없는 새 주장, 자기 자랑, 인사, 질문을 아시나가 했다고 쓰지 않는다.',
      '나레이션에서 아시나의 몸짓은 입력에 있는 동작과 그 결과(넘어짐, 들킴, 다침)만 쓴다. 입력에 없는 손짓이나 다음 행동(걸어 나가기 등)을 지어내지 않는다.',
      '대사 줄에는 그 인물이 소리 내어 하는 말만 쓴다. 행동, 표정, 칼의 움직임은 나레이션 줄로 쓴다. "~며 말했다" 같은 지문을 대사 줄에 넣지 않는다.',
      '"이미 일어난 일"과 어긋나는 장면(이미 벗은 후드를 또 벗기, 없는 소지품 꺼내기)을 쓰지 않는다. 후드를 쓰고 있으면 결과나 대가에 적혀 있지 않은 한 서술로 벗기지 않는다.',
      `화자는 ${free.speakers.join(', ')} 중에서만 고른다. 대사 한 줄은 ${maxChars}자 이내.`,
      ...spokenRule(ctx),
      ...limitRules(limits),
      '인물마다 정해진 말투를 지킨다.',
      THOUGHT_RULE,
      FACE_RULE,
      ...(outcome.effects?.lose?.length ? [] : [ITEM_RULE]),
    ]),
    feedback ? `## 직전 답의 문제(반드시 고칠 것)\n${feedback}` : '',
    LINES_FORMAT,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildQuipUser(ctx: GmContext, feedback: string): string {
  return [
    '## 할 일: 진행자 한마디',
    `플레이어 입력: ${quote(ctx.text)}`,
    bullets([
      '진행자 사막여우가 옆에서 보다가 뜻밖의 행동에 한 줄로 맞장구치거나 태클한다. 짧은 반말에 장난스러운 말투. 인물이 아니니 이야기 속 인물처럼 말하지 않는다. 플레이어를 비웃지 않고 같이 웃는다.',
      '25자 이내. 설명하지 않는다. 결과나 앞일을 미리 말하지 않는다. 남자의 이름과 신분을 말하지 않는다.',
      '플레이어가 입력에 쓴 말만 받아서 태클한다. 입력에 없는 말(미소녀, 공녀, 은발 등)을 꺼내지 않는다.',
      '화자는 GM 하나뿐이다.',
    ]),
    feedback ? `## 직전 답의 문제(반드시 고칠 것)\n${feedback}` : '',
    '형식: {"lines":[{"speaker":"GM","text":"한마디"}]}',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildExplainUser(ctx: GmContext, unseen: readonly string[], feedback: string, maxLines: number, maxChars: number, note?: NoteEntry): string {
  return [
    '## 할 일: 배경 설명',
    `플레이어 질문: ${quote(ctx.text)}`,
    note ? `이 질문의 대상: ${note.name}. 아는 내용: ${note.text}` : '',
    bullets([
      note ? '이 대상에 대해 묻는 것만 답하고 다른 주제를 꺼내지 않는다. 플레이어가 "나"라고 하면 "넌 ~야"처럼 아시나를 가리켜 답한다.' : '',
      '아는 내용에 없는 이유, 속마음, 앞일은 지어내지 않는다. 그런 것을 물으면 "그건 아직 몰라."라고만 답한다.',
      '이번에는 인물이 아니라 진행자 사막여우(GM)로서 플레이어에게 짧게 알려 준다. 화자는 GM 하나뿐이다.',
      '플레이어에게 직접 말하는 반말로 쓴다(예: "여긴 죽음의 사막 지르다야."). "~다."로 끝나는 설명체와 "아시나는 ~을 알고 있다" 같은 말을 쓰지 않는다.',
      ctx.interject?.upcoming.length ? `곧 나올 줄의 내용은 먼저 말하지 않는다: ${ctx.interject.upcoming.slice(0, 4).join(' / ')}` : '',
      ctx.permission ? '플레이어는 그것이 있는지, 해도 되는지 묻고 있다. 가방 뒤지기, 둘러보기처럼 실패해도 재미없는 일은 그렇다고 답하고 그 모습을 짧게 보여 준다. 칼을 빼앗기처럼 위험한 일은 "해 볼 수는 있어. 어떻게 할 건데?"로 답한다.' : '',
      `1~${maxLines}줄. "누구나 아는 것"과 "아시나가 아는 것" 안에서만 답한다.`,
      '"숨길 것"이나 위 목록에 없는 것을 물으면 지어내지 말고 "그건 아시나도 몰라"라고 답한다. 남자의 이름과 진짜 신분은 말하지 않는다.',
      '위 목록에 없는 사실(땅 주인, 나라, 지리, 인물 내력)은 단정하지 않는다. "두 대륙 사이"처럼 위치만 적혀 있으면 어느 나라 땅인지, 주인이 있는지는 모르는 것이다. "어느 나라에도 속하지 않는다", "주인이 없다"도 단정이다. 그런 것을 물으면 "그건 아시나도 몰라"고 답한다.',
      unseen.length ? `아시나가 아직 만나지 않은 사람: ${unseen.join(', ')}. 이 사람들을 물으면 "아직 본 적이 없어"라고 답한다.` : '지금 장면에 나온 사람은 아시나가 본 모습대로 말한다.',
      '물은 것만 답하고 끝낸다. 다음에 뭘 할지 말하거나 재촉하지 않고, 지금 장면의 목표도 다시 말하지 않는다.',
      '다음 장면의 사건을 미리 말하지 않는다.',
      `한 줄은 ${maxChars}자 이내.`,
    ]),
    feedback ? `## 직전 답의 문제(반드시 고칠 것)\n${feedback}` : '',
    '형식: {"lines":[{"speaker":"GM","text":"설명"}]}',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * GM 대사 JSON 스키마. lead 가 있으면 첫 줄은 lead.first 가 말하고 나머지 maxLines-1 줄은 lead.rest 중에서 고른다.
 * llama.cpp 문법 변환은 prefixItems 를 길이가 정해진 묶음으로 만들므로 줄 수는 maxLines 로 고정된다.
 */
/** 인물 줄의 표정 규칙. 화면 입식은 이 값으로 바뀝다. */
export const FACE_RULE = '인물의 대사·속마음 줄에는 그 화자의 허용 목록에서 그 순간의 표정을 face에 적는다. 입력 낱말이 아니라 실제 사건과 화자의 의도·말투로 고른다. 남자에게 몸으로 덤비거나 그의 무기·몸을 직접 저지해 위협하는 상황은 menacing, 칼 앞에서도 예상 밖의 대담한 말·말솜씨를 보여 관심을 끄는 상황은 intrigued, 세계 밖의 뜻 모를 말·행동에는 dumbfounded, 울음·겁·기력 저하를 보고 깔보는 반응은 sneer 또는 neutral이다. 비웃는 말투라고 모든 상황을 sneer로 덮지 않는다. 놀람·위협·관심은 그 상황에서 인물이 실제로 보이는 반응으로 구별한다. 상대 감정을 화자에게 복사하지 않는다. 아시나의 teary·pouty와 남자의 cold는 허용 ID가 아니다. 미래 사건이나 모르는 관계를 표정에 반영하지 않는다. 나레이션과 GM 줄에는 face를 쓰지 않는다.';
export const LINES_FORMAT = '형식: {"lines":[{"speaker":"나레이션","text":"서술"},{"speaker":"인물","text":"대사","face":"neutral"}]}';

export function linesSchema(speakers: readonly string[], maxLines: number, maxChars: number, lead?: { first: string; second?: string; rest: readonly string[] }, cast: Readonly<Record<string, CastSpec>> = {}): object {
  // 입식이 있는 화자의 줄은 face 가 필수, 나레이션·GM 줄에는 face 칸이 없다. 둘이 섞이면 anyOf 로 갈림다.
  const shape = (who: readonly string[], faces?: readonly string[]) => ({
    type: 'object',
    additionalProperties: false,
    required: faces ? ['speaker', 'text', 'face'] : ['speaker', 'text'],
    properties: {
      speaker: { type: 'string', enum: [...who] },
      // 큰따옴표·역슬래시·줄바꿈을 못 쓰게 해 글 안에 JSON 조각이나 끝없는 줄바꿈을 쓰며 토큰 상한까지 가는 일을 막는다.
      text: { type: 'string', pattern: `^[^"\\\\\\n\\r]{1,${maxChars * 2}}$` },
      ...(faces ? { face: { type: 'string', enum: [...faces] } } : {}),
    },
  });
  const line = (who: readonly string[]) => {
    const withFace = who.filter(w => cast[w]?.style === 'speech' || cast[w]?.style === 'thought');
    const plain = who.filter(w => !withFace.includes(w));
    const choices = withFace.map(w => shape([w], cast[w]?.faces ?? []));
    if (plain.length) choices.push(shape(plain));
    return choices.length === 1 ? choices[0] : { anyOf: choices };
  };
  const lines = lead
    ? { type: 'array', prefixItems: [line([lead.first]), ...(lead.second && maxLines >= 2 ? [line([lead.second])] : []), ...Array.from({ length: Math.max(0, maxLines - (lead.second ? 2 : 1)) }, () => line(lead.rest))] }
    : { type: 'array', minItems: 1, maxItems: maxLines, items: line(speakers) };
  return { type: 'object', additionalProperties: false, required: ['lines'], properties: { lines } };
}

/** 행동으로 읽은 입력에 의도한 시도가 있는지 가린다. 저절로 생긴 변화와 나눈다. */
export const NO_CHANGE = '자기 몸에서 끝남';
export const LOOK_CHANGE = '무언가를 살피거나 알아냄';
export const SHOWN_CHANGE = '저절로 드러난 몸 상태';
export const YIELD_CHANGE = '닥친 일을 받아들임';
const CHANGE_RULES: Record<string, string> = {
  '자리가 바뀜': '무언가를 하려고 스스로 몸의 자리나 자세를 옮긴다. 몸 상태 때문에 저절로 자리가 달라진 경우는 아니다.',
  '물건을 잡거나 씀': '무엇을 쥐거나 줍거나 입거나 벗거나 휘두른다.',
  '상대나 주변에 닿거나 신호함': '사람이나 땅, 모래를 건드리거나 손을 흔들거나 쏘아본다.',
  [LOOK_CHANGE]: '무엇이 어떤지 알아내려고 살핀다.',
  '남에게 보이려는 몸짓': '상대가 보고 달라지기를 바라며 빌기, 절하기, 척하기, 버티기를 일부러 한다.',
  [YIELD_CHANGE]: '칼이든 죽음이든 처분이든 막지 않고 당하는 대로 둔다. 체념이고 항복이다.',
  [SHOWN_CHANGE]: '감정이나 몸 상태 때문에 저절로 나온 반응이다. 눈에 띄거나 소리를 내거나 위치·자세가 달라져도, 무언가를 해내려는 시도가 없으면 이 항목이다.',
  [NO_CHANGE]: '위 어디에도 안 든다. 그대로 있기, 기다리기, 포기하기, 손이나 힘을 놓고 그만두기, 숨, 표정, 입술, 고개, 멍한 시선처럼 아무것도 달라지지 않는다.',
};

/** 장면 글을 넣으면 평범한 행동도 그 장면에선 소용없다고 읽어 시도를 놓친다. 문장만 보게 짧게 준다. */
export const CHANGE_SYSTEM = '너는 입력의 의도와 시도를 분류한다. 입력에 적히지 않은 목적은 지어내지 않는다. 감정이나 몸 상태가 원인인 저절로 나온 변화와, 무언가를 해내려고 스스로 하는 시도를 구분한다. 물리적인 변화가 있다는 사실만으로 시도로 분류하지 않는다.';

export function buildChangeUser(text: string): string {
  return [`입력: ${text}`, '무언가를 해내려는 시도가 있는지 먼저 가린 뒤 항목을 고른다. 적히지 않은 회피·설득 목적을 붙이지 않는다.', ...Object.entries(CHANGE_RULES).map(([name, rule]) => `${name}: ${rule}`)].join('\n');
}

export function changeSchema() {
  return { type: 'object', additionalProperties: false, properties: { change: { type: 'string', enum: Object.keys(CHANGE_RULES) } }, required: ['change'] };
}

/** 이어 적은 문장은 통째로 물으면 시도를 놓치고 하나만 물으면 포기를 시도로 읽는다. 동작마다 고르게 한다. */
export function buildChangesUser(clauses: readonly string[]): string {
  return [`입력 전체: ${clauses.join(' ')}`, '한 입력을 동작별로 나눴다. 각 동작에 의도한 시도가 있는지 고른다. 앞의 몸 상태 때문에 뒤 동작이 저절로 나온 것이면 뒤도 몸 상태다. 뒤에 별도로 시도하는 일이 적혀 있으면 그 동작만 시도로 고른다. 적히지 않은 회피·설득 목적을 붙이지 않는다.', ...clauses.map((c, i) => `${i + 1}. ${c}`), ...Object.entries(CHANGE_RULES).map(([name, rule]) => `${name}: ${rule}`)].join('\n');
}

export function changesSchema(count: number) {
  return { type: 'object', additionalProperties: false, required: ['changes'], properties: { changes: { type: 'array', minItems: count, maxItems: count, items: { type: 'string', enum: Object.keys(CHANGE_RULES) } } } };
}

/** 물음표로 끝난 글은 장면을 넣으면 그 장면의 접근법에 끌려 게임 질문도 행동으로 읽는다. 장면 없이 문장만 보고 가린다. */
export const OWN_MOVE = '주인공이 지금 할 행동을 스스로 제안함';
const ASK_RULES: Record<string, string> = {
  [OWN_MOVE]: '도망칠까, 숨어 볼까처럼 지금 장면에서 몸으로 할 일을 정하려는 혼잣말이다.',
  '게임 조작이나 규칙을 물음': '저장, 불러오기, 주사위, 다시 하기, 끝, 조작처럼 게임 밖의 일을 묻는다.',
  '그 밖의 물음': '사람이나 이 세계에 대해 묻거나 상대에게 건네는 물음이다.',
};
export const ASK_SYSTEM = '너는 게임 입력을 분류한다. 입력은 플레이어가 물음표로 끝낸 한 문장이다.';

export function buildAskUser(text: string): string {
  return [`입력: ${text}`, '어느 쪽인지 고른다.', ...Object.entries(ASK_RULES).map(([name, rule]) => `${name}: ${rule}`)].join('\n');
}

export function askSchema() {
  return { type: 'object', additionalProperties: false, properties: { ask: { type: 'string', enum: Object.keys(ASK_RULES) } }, required: ['ask'] };
}

/** 입력의 종류. 이 종류에 따라 답하는 쪽과 판정 여부가 갈린다. */
export const INPUT_KINDS = ['how', 'game', 'lore', 'person', 'self', 'action', 'idle', 'bad'] as const;
export type InputKind = (typeof INPUT_KINDS)[number];

export function interpretSchema(free: FreeSpec, items: readonly string[], lore: Lore, help: readonly string[], kinds: readonly InputKind[] = INPUT_KINDS): object {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['reason', 'kind', 'about', 'risk', 'approach', 'item', 'odd', 'absurd', 'bold', 'deed', 'stat', 'difficulty'],
    properties: {
      reason: { type: 'string', maxLength: 40 },
      kind: { type: 'string', enum: [...kinds] },
      about: { type: 'string', enum: kinds.length === 1 && kinds[0] === 'game' ? [...help, ABOUT_UNKNOWN] : [...new Set([...lore.knowledge.filter((n) => n.tier !== 'hidden').map((n) => n.id), ...help, ABOUT_UNKNOWN])] },
      risk: { type: 'string', enum: ['none', 'attack', 'unmask', 'identity'] },
      approach: { type: 'string', enum: [...free.approaches.map((a) => a.id), 'none'] },
      item: { type: 'string', enum: ['', ...items] },
      odd: { type: 'boolean' },
      absurd: { type: 'boolean' },
      bold: { type: 'boolean' },
      deed: { type: 'string', maxLength: 60 },
      stat: { type: 'string', enum: [...ABILITIES] },
      difficulty: { type: 'string', enum: ['쉬움', '보통', '어려움'] },
    },
  };
}
