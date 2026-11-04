import { activeFacts, type GmContext, type NarrateContext, type TalkTone } from '../engine/engine.ts';
import { ABILITIES, TIER_LABEL, TRACKS, TRACK_INFO, type FreeSpec, type NoteTier, type Scenario } from '../engine/types.ts';
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
  const { scenario, free } = ctx;
  return free.speakers
    .map((key) => {
      const cast = scenario.cast[key];
      if (!cast) return '';
      if (cast.style === 'narration') return `### ${key}\n${bullets(lore.narration.voice)}`;
      const character = cast.lore ? lore.characters[cast.lore] : undefined;
      if (cast.style === 'thought') {
        const samples = character?.samples.thought ?? [];
        return [`### ${key} (${cast.display}의 속생각, 소리 내지 않는 독백)`, bullets(lore.thought.voice), samples.length ? `- 원작 속마음 예: ${samples.map(quote).join(' / ')}` : '']
          .filter(Boolean)
          .join('\n');
      }
      if (!character) return `### ${key}`;
      const endings = character.register.forbid_endings;
      return [
        `### ${key} (화면 이름: ${cast.display || key})`,
        `- 겉모습: ${character.look}`,
        `- 성격: ${character.personality}`,
        character.secret ? `- 숨은 설정: ${character.secret}` : '',
        bullets(character.voice.map((v) => `말투: ${v}`)),
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
    bullets([`상황: ${free.situation}`, `장면 목표: ${free.goal}`, `쓸 수 있는 화자: ${free.speakers.join(', ')}`]),
    '### 금지 전개',
    bullets(free.must_not),
    '## 지금 상태',
    bullets([
      ...TRACKS.map((t) => `${TRACK_INFO[t].label} ${state.tracks[t]}/${TRACK_INFO[t].max}(${level(state.tracks[t], TRACK_INFO[t].max)}): ${TRACK_INFO[t].desc}`),
      `아시나의 소지품: ${itemNames(scenario, state.items).join(', ') || '없음'}`,
      ...activeFacts(scenario, state).map((f) => `이미 일어난 일: ${f.text}`),
      ...(state.said?.length ? [`플레이어가 이미 한 말과 행동(인물은 이를 기억하고, 어울리면 비꼬듯 되받는다): ${state.said.join(' / ')}`] : []),
    ]),
    '## 직전까지의 대사',
    recent.length ? bullets(recent) : '- (없음)',
  ].join('\n\n');
}

export function buildInterpretUser(ctx: GmContext): string {
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
  return [
    '## 할 일: 플레이어 입력 해석',
    `플레이어 입력: ${quote(text)}`,
    '이 입력이 아래 항목 중 무엇에 가장 가까운지 하나만 고른다.',
    '- talk: 몸을 움직이는 행동 없이 말만 하는 경우. 질문, 혼잣말, 농담, 불평, 감탄, 뜻 모를 말("배고파", "너 몇 살이야")은 여기에 넣는다. 살려 달라거나 설득하는 내용이 없으면 talk 이다.',
    ...options,
    '- improv: 위 항목에 맞지 않는 몸짓이나 행동("춤을 춘다", "모래성을 쌓는다"). 이 세계에 없는 물건이나 갑작스러운 초능력을 쓰려는 시도도 여기에 넣고 absurd 를 true 로 한다.',
    '- ask: 인물에게 하는 말이 아니라 이야기 배경을 묻는 질문("크롬웰이 뭐야?", "저 남자 누구야?", "여기가 어디야?"). 상대를 "너", "당신"으로 부르며 묻는 말은 talk 이다.',
    '- deflect: 15세 이용가에 맞지 않는 행동이나 심한 욕, 금지 전개를 곧장 일으키려는 행동.',
    'improv 일 때만 stat 과 difficulty 를 정한다. stat: 재치(머리, 눈치), 손재주(손놀림), 매력(태도, 표정), 체력(몸 쓰기), 교양(지식, 예법). difficulty: 지금 상황에서 쉬움, 보통, 어려움. improv 가 아니면 stat 은 재치, difficulty 는 보통, absurd 는 false 로 둔다.',
    '소지품을 꺼내 보이거나 쓰는 행동이 들어 있으면, 억울함이나 사정을 말하는 내용이 함께 있어도 그 소지품이 필요한 항목을 고른다.',
    `소지품을 꺼내 쓰는 행동이면 item 에 소지품 id 를 넣고, 아니면 빈 문자열을 넣는다. 소지품: ${items || '없음'}`,
    '형식: {"reason":"20자 안팎의 근거","approach":"행동 id","item":"","stat":"재치","difficulty":"보통","absurd":false}',
  ].join('\n');
}

const TONE: Record<TalkTone, string> = {
  plain: '이번 입력은 판정이 없다. 말로 주고받는 데서 그친다.',
  repeat: '플레이어가 같은 말을 되풀이했다. 인물은 그걸 알아채고 짜증을 내며 재촉한다.',
  deflect: '이 입력은 15세 이용가에 맞지 않거나 금지 전개다. 일어나지 않은 일로 두고, 그 내용을 입에 담지 않은 채 인물이 비웃거나 잘라 내며 돌려 말한다.',
};

export function buildTalkUser(ctx: GmContext, feedback: string, maxLines: number, maxChars: number): string {
  return [
    '## 할 일: 판정 없는 대화',
    `플레이어 입력: ${quote(ctx.text)}`,
    ctx.interject
      ? bullets([
          '플레이어가 이야기 도중에 끼어들었다. 답한 뒤 곧바로 아래의 줄이 이어지니, 그 줄을 먼저 쓰거나 그 줄과 어긋나게 쓰지 않는다.',
          ...ctx.interject.upcoming.slice(0, 6).map((u) => `곧 나올 줄: ${u}`),
          ctx.interject.action ? '입력은 행동이다. 나레이션으로 그 시도가 어떻게 되는지 1~2줄로 그린다. 시도는 반드시 "~하려 했지만"처럼 이뤄지지 못하고 끝난다. 곧 나올 줄이 그대로 사실이 되어야 한다. 결과는 인물의 반응이나 상황으로 보여 준다.' : '',
          '지금 장면에 없는 인물은 답하지 않는다. 상대가 없으면 혼잣말이나 속마음으로 받는다.',
          '인물이 말하던 중이면 그 인물이 자기 말투로 끊긴 것을 짧게 받고 답한다. 답한 뒤 그 인물이 하던 말이 이어진다.',
        ].filter(Boolean))
      : '',
    bullets([
      `1~${maxLines}줄. 입력이 엉뚱하거나 뜻 모를 말이어도 막지 않는다. 인물이 그 말을 실제로 듣고 자기 말투대로 반응한다. 무슨 말인지 짚어서 답하고, 뻔한 말로 넘기지 않는다.`,
      ctx.interject ? '답한 뒤 이야기가 이어지니 다음에 뭘 할지 말하지 않는다.' : `반응 끝에 장면 목표로 다시 끌고 온다: ${ctx.free.goal}`,
      TONE[ctx.tone ?? 'plain'],
      '정체를 밝히는 답은 하지 않는다. 플레이어 입력을 되풀이하지 않는다.',
      '이 세계에 없는 말은 인물이 뜻을 모른다. 그 낱말을 쓰지 말고 "이상한 소리" 같은 말로 받는다.',
      '대사 줄에는 그 인물이 소리 내어 하는 말만 쓴다. 행동과 표정은 나레이션 줄로 쓴다.',
      '지금의 긴장(칼끝, 시선)은 그대로 둔다. 다음 사건으로 넘어가지 않는다.',
      `화자는 ${ctx.free.speakers.join(', ')} 중에서만 고른다. 대사 한 줄은 ${maxChars}자 이내.`,
    ]),
    feedback ? `## 직전 답의 문제(반드시 고칠 것)\n${feedback}` : '',
    '형식: {"lines":[{"speaker":"화자","text":"대사"}]}',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildNarrateUser(ctx: NarrateContext, feedback: string, maxLines: number, maxChars: number): string {
  const { text, approach, roll, outcome, free } = ctx;
  return [
    '## 할 일: 판정 결과 연출',
    `플레이어 입력: ${quote(text)}`,
    `행동 해석: ${approach.label}`,
    ctx.improv ? '이 행동은 정해 둔 전개에 없는 즉흥 행동이다. 플레이어가 한 행동을 먼저 장면으로 보여 주고, 인물이 거기에 반응한 뒤, 장면 목표로 끌고 온다.' : '',
    ctx.improv?.absurd ? '이 세계에 없는 물건이나 힘을 쓰려 했다. 그런 것은 일어나지 않는다. 그 낱말을 쓰지 말고, 아시나가 실제로 한 동작을 이 세계의 말로 구체적으로 그린다(예: 허공에 손바닥을 내밀었다, 빈 손을 귀에 대었다). "이상한 몸짓"이라는 말은 쓰지 않는다. 상대 인물이 있으면 그 인물이 어이없어하며 한마디 한다.' : '',
    `결과: ${TIER_LABEL[roll.tier]} (반드시 이 결과대로)`,
    `반드시 일어날 일: ${outcome.gist ?? ''}`,
    '막아야 할 일은 "안 된다"고 쓰지 않고 이야기 속 이유로 보여 준다.',
    '아시나의 대사는 플레이어가 입력한 말의 뜻을 넘지 않는다. 새 사실, 주장, 신분 설명을 덧붙이지 않는다. 입력이 말이 아닌 행동이면 아시나는 짧은 감탄(앗, 흡) 정도만 말한다.',
    '플레이어가 입력한 행동만 보여 준다. 입력에 없는 이동(달려가기, 오래 걷기, 거리 벌리기), 입력에 없는 말(길 묻기, 인사), 플레이어 대신 내리는 결정, 지금 상태에 없는 일(붙잡혀 있음, 칼이 목에 있음)은 쓰지 않는다. 대가는 입력한 행동이 그 자리에서 어긋나는 모습으로 보여 준다.',
    outcome.forbid?.length ? `이 결과에서 쓰면 안 되는 표현: ${outcome.forbid.join(', ')}` : '',
    approach.presume?.length && !approach.presume.some((w) => text.replace(/\s+/g, '').includes(w.replace(/\s+/g, '')))
      ? `플레이어는 "${approach.label}"과 같은 행동을 하지 않았다. 원작 대사에 나오는 그 행동(${approach.presume.slice(0, 3).join(', ')} 등)을 쓰지 말고, 플레이어가 실제로 한 행동을 그대로 보여 준다.`
      : '',
    outcome.lines.length
      ? `원작 대사(뜻과 말투의 기준일 뿐이다. 플레이어가 실제로 한 말·행동에 맞게 다시 쓴다): ${outcome.lines.map((l) => `${l.speaker}: ${l.text}`).join(' / ')}`
      : '',
    '## 쓰기 규칙',
    bullets([
      `2~${maxLines}줄. 플레이어 입력은 이미 화면에 나왔다. 그대로 베끼지 말고 아시나의 대사나 행동으로 다듬어 잇고, 상대의 반응과 결과를 보여 준다.`,
      '"반드시 일어날 일"의 문장을 그대로 옮기지 말고 장면으로 보여 준다.',
      '플레이어가 하지 않은 말·주장·몸짓을 아시나가 했다고 쓰지 않는다. 상대의 반응도 플레이어가 실제로 한 말·행동에 대한 반응이어야 한다. 원작 대사가 입력과 맞지 않으면 뜻만 살리고 낱말은 버린다.',
      '아시나의 대사는 플레이어 입력을 다듬은 말만 쓴다. 입력에 없는 새 주장, 자기 자랑, 인사, 질문을 보태지 않는다.',
      '나레이션에서 아시나의 몸짓은 입력에 있는 동작과 그 결과(넘어짐, 들킴, 다침)만 쓴다. 입력에 없는 손짓이나 다음 행동(걸어 나가기 등)을 지어내지 않는다.',
      '대사 줄에는 그 인물이 소리 내어 하는 말만 쓴다. 행동, 표정, 칼의 움직임은 나레이션 줄로 쓴다. "~며 말했다" 같은 지문을 대사 줄에 넣지 않는다.',
      '"이미 일어난 일"과 어긋나는 장면(이미 벗은 후드를 또 벗기, 없는 소지품 꺼내기)을 쓰지 않는다.',
      `화자는 ${free.speakers.join(', ')} 중에서만 고른다. 대사 한 줄은 ${maxChars}자 이내.`,
      '인물마다 정해진 말투를 지킨다.',
    ]),
    feedback ? `## 직전 답의 문제(반드시 고칠 것)\n${feedback}` : '',
    '형식: {"lines":[{"speaker":"화자","text":"대사"}]}',
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
      '화자는 GM 하나뿐이다.',
    ]),
    feedback ? `## 직전 답의 문제(반드시 고칠 것)\n${feedback}` : '',
    '형식: {"lines":[{"speaker":"GM","text":"한마디"}]}',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildExplainUser(ctx: GmContext, unseen: readonly string[], feedback: string, maxLines: number, maxChars: number): string {
  return [
    '## 할 일: 배경 설명',
    `플레이어 질문: ${quote(ctx.text)}`,
    bullets([
      '이번에는 인물이 아니라 진행자(GM)로서 플레이어에게 짧게 알려 준다. 화자는 GM 하나뿐이다.',
      ctx.interject?.upcoming.length ? `곧 나올 줄의 내용은 먼저 말하지 않는다: ${ctx.interject.upcoming.slice(0, 4).join(' / ')}` : '',
      ctx.permission ? '플레이어는 그것이 있는지, 해도 되는지 묻고 있다. 가방 뒤지기, 둘러보기처럼 실패해도 재미없는 일은 그렇다고 답하고 그 모습을 짧게 보여 준다. 칼을 빼앗기처럼 위험한 일은 "해 볼 수는 있어. 어떻게 할 건데?"로 답한다.' : '',
      `1~${maxLines}줄. "누구나 아는 것"과 "아시나가 아는 것" 안에서만 답한다. "아시나는 알고 있다."처럼 아시나가 아는 범위를 밝힌다.`,
      '"숨길 것"이나 위 목록에 없는 것을 물으면 지어내지 말고 "그건 아시나도 모른다"고 답한다. 남자의 이름과 진짜 신분은 말하지 않는다.',
      unseen.length ? `아시나가 아직 만나지 않은 사람: ${unseen.join(', ')}. 이 사람들을 물으면 "아직 본 적이 없다"고 답한다.` : '지금 장면에 나온 사람은 아시나가 본 모습대로 말한다.',
      ctx.interject ? '답한 뒤 이야기가 이어지니 다음에 뭘 할지 말하지 않는다.' : `마지막 문장은 지금 장면으로 돌아온다(지금 아시나가 바라는 것: ${ctx.free.aim ?? ctx.free.goal}).`,
      '설명은 현재형 평서문("~다.")으로 쓴다. 다음 장면의 사건을 미리 말하지 않는다.',
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
export function linesSchema(speakers: readonly string[], maxLines: number, maxChars: number, lead?: { first: string; rest: readonly string[] }): object {
  const line = (who: readonly string[]) => ({
    type: 'object',
    additionalProperties: false,
    required: ['speaker', 'text'],
    properties: {
      speaker: { type: 'string', enum: [...who] },
      text: { type: 'string', minLength: 1, maxLength: maxChars * 2 },
    },
  });
  const lines = lead
    ? { type: 'array', prefixItems: [line([lead.first]), ...Array.from({ length: Math.max(0, maxLines - 1) }, () => line(lead.rest))] }
    : { type: 'array', minItems: 1, maxItems: maxLines, items: line(speakers) };
  return { type: 'object', additionalProperties: false, required: ['lines'], properties: { lines } };
}

export function interpretSchema(free: FreeSpec, items: readonly string[]): object {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['reason', 'approach', 'item', 'stat', 'difficulty', 'absurd'],
    properties: {
      reason: { type: 'string', maxLength: 40 },
      approach: { type: 'string', enum: [...free.approaches.map((a) => a.id), 'talk', 'ask', 'improv', 'deflect'] },
      item: { type: 'string', enum: ['', ...items] },
      stat: { type: 'string', enum: [...ABILITIES] },
      difficulty: { type: 'string', enum: ['쉬움', '보통', '어려움'] },
      absurd: { type: 'boolean' },
    },
  };
}
