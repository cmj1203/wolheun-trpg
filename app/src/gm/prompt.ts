import { ABOUT_UNKNOWN, activeFacts, goalAchieved, noteOpen, type GmContext, type NarrateContext, type TalkTone } from '../engine/engine.ts';
import { ABILITIES, TIER_LABEL, TRACKS, TRACK_INFO, type CastSpec, type FreeSpec, type NoteEntry, type NoteTier, type Scenario, type Tier } from '../engine/types.ts';
import type { Lore } from './lore.ts';
import { parseStoryInput } from '../engine/text.ts';
import { evalCond } from '../engine/conditions.ts';

const quote = (s: string) => `"${s}"`;
const bullets = (xs: readonly string[]) => xs.map((x) => `- ${x}`).join('\n');

/** 확인된 화면과 공개 정본만 사용한다. 장면의 뒤 대사와 비공개 지식은 넣지 않는다. */
export function questionFacts(ctx: GmContext, lore: Lore): Record<string, string> {
  const display = (speaker: string) => ctx.scenario.cast[speaker]?.display || '내레이션';
  return Object.fromEntries([
    ...lore.knowledge.filter(note => note.tier !== 'hidden' && noteOpen(note, ctx.state))
      .map(note => [`note:${note.id}`, JSON.stringify({ name: note.name, kind: note.kind, text: note.text })]),
    ['scene', JSON.stringify({
      title: ctx.beat.title, perspective: ctx.beat.perspective ?? 'hero',
      situation: ctx.free.situation,
      stagedCast: Object.fromEntries(Object.entries(ctx.beat.cast ?? {}).map(([slot, speaker]) => [slot, speaker ? display(speaker) : null])),
      speakers: ctx.free.speakers.map(display),
    })],
    ...(ctx.displayed ? [['displayed', `${ctx.displayed.display || display(ctx.displayed.speaker)}: ${ctx.displayed.text}`]] : []),
    ...activeFacts(ctx.scenario, ctx.state).map((fact, index) => [`fact:${index}`, fact.text]),
  ]);
}

const PROSE_RULE = '각 절의 실제 행동자·행동·대상과 지각자를 구분한다. 사동·허용 표현은 시키거나 허용한 사람과 실제 행동한 사람이 문맥에 맞아야 한다. 말하는 사람과 듣는 사람의 역할을 바꾸지 않는다. 문장 전체와 앞뒤 줄의 시간 순서를 맞춘다. 확정 결과에서 이미 끝난 행동을 아직 할 일이나 새 허락으로 되돌리지 않으며, 현재 생긴 기회와 실제 완료한 사건은 구분한다. 내레이션은 지난 사건의 과거형으로 쓰고 다음 행동을 안내하지 않는다. 인물 대사의 명령·의도·속마음의 현재형은 그 화법에 맞으면 허용한다. 관찰되지 않음과 아무도 관찰하지 않았다는 단정은 다르다. 조용함이나 성공만으로 다른 사람의 지각·기억·미래 반응까지 보장하지 않는다. 시점에서 확인한 모습과 화자의 추측을 구분하고, 새 사실 없이 확인된 범위만 쓴다.';

/** 교열 결과는 화면에 쓰지 않고 원문과 대조해 재생성 피드백으로만 쓴다. */
export const GRAMMAR_SYSTEM = `나레이션과 속마음은 주인공의 1인칭(나·내) 서술이며 그대로 둔다. 시점을 주인공 이름의 3인칭으로 바꾸거나, 주어를 바꾸거나 빼거나, 문장 끝 마침표를 덧붙이는 것은 교정이 아니다. 문장마다 긍정·부정을 절 단위로 대조한다. 같은 사건을 소리·빛·움직임으로 묘사했다가 없었다고 부정하면 모순이다. 도구·신체·물건의 현재 위치와 사용 상태는 situation과 확정 결과에서 확인한다. 다른 장면에 등장했거나 그 인물이 소유할 법하다는 이유로 현재 사용 중이라고 보태지 않는다. 이런 모순도 반드시 교열한다. 너는 한국어 교열자다. context의 현재 상황·행동자·발화자·대상을 근거로 문법·용언 활용·조사·주술 호응을 검수한다. ${PROSE_RULE} 동작의 주체나 대명사의 지시 대상이 뒤바뀜, 신체 부위와 묘사의 뜻이 맞지 않음, 같은 뜻의 부자연스러운 중복도 분명한 문맥 오류로 교정한다. 주인공 시점과 명시 관객 시점을 구분한다. 화자 이름은 문장의 주어가 아니다. context.resolution은 이번 판정에서 확정한 결과와 독립 비용이며 null이면 판정이 없는 대화다. context.goal은 목표일 뿐 완료 사실이 아니다. context.evidence와 situation에서 확인된 범위로 관찰·기억을 제한한다. 생성문 자체와 뒤 장면을 근거로 삼지 않는다. 현재 결과·비용을 보존하면서 모든 줄을 함께 읽어 역할·사동·시제·시간 연결·근거를 검수한다. 오류가 아닌 말투·의미·낱말 선택·문장 길이·의도적 파편과 허용되는 띄어쓰기는 그대로 둔다. 오류만 최소 교정하고 오류가 없으면 한 글자도 바꾸지 않는다. 각 문장의 원문과 교정문을 JSON으로 답한다. 교정문은 표시되지 않고 원문 재생성의 검수 근거로만 쓰인다.`;

/** 판정 뒤 다시 만든 문맥에서도 괄호에 적힌 경계를 그대로 잇는다. */
function inputRule(ctx: GmContext): string {
  const parsed = parseStoryInput(ctx.text);
  const input = ctx.input ?? (parsed.kind === 'valid' && parsed.explicit ? parsed : undefined);
  if (!input || input.kind === 'invalid') return '';
  return `입력 경계는 확정되어 있다. 괄호 안 동작: ${input.action ? quote(input.action) : '없음'}. 소리 내 한 말: ${input.speech ? quote(input.speech) : '없음'}. 괄호는 서술과 발화를 나눈 것이며 판정 지시가 아니다. 동작을 들은 대사로 인용하거나 말을 몸 동작으로 바꾸지 않는다.${input.action ? ' 동작과 발화를 함께 읽는다. 새 불확실한 성취를 시도할 때만 action이다. 관찰·인사·순간 몸짓에 말이 함께 있으면 person, 말 없이 저절로 드러난 반응이면 idle이다. 관찰과 몸짓도 응답에 보존한다.' : ' 괄호가 없으면 기본은 person이다. 다만 서술형 시도로 확신할 때는 action으로 분류해 앱이 다시 적는 법을 안내하게 한다.'}`;
}

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

/** 분류에는 현재 의도·목표·참조만 준다. 생성 문체·원작 예문·전역 성취 장부는 별도다. */
export function buildInterpretSystem(ctx: GmContext, lore: Lore): string {
  const { scenario, free, state } = ctx;
  const actors = free.speakers.flatMap(key => {
    const cast = scenario.cast[key];
    if (!cast || cast.style !== 'speech') return [];
    const character = cast.lore ? lore.characters[cast.lore] : undefined;
    return [{ display: cast.display, personality: character?.personality, values: character?.values }];
  });
  return [
    '플레이어 입력의 의도와 지시 대상을 분류한다. 대사나 사건을 생성하지 않는다. 사용자 지침과 JSON 스키마의 종류·목표·공개 후보만 사용한다.',
    inputRule(ctx),
    `현재 상황: ${free.situation}`,
    `현재 장면 목표: ${free.goal}`,
    `확인된 장면: ${questionFacts(ctx, lore).scene}`,
    ...(ctx.displayed ? [`확인된 표시 줄: ${ctx.displayed.display || '내레이션'}: ${ctx.displayed.text}`] : []),
    '관객 화면의 인물을 주인공 앞의 인물이나 주인공이 들은 대화로 바꾸지 않는다. 원문 질문의 주체·관계·답 종류를 유지한다. about는 공개 근거 후보이며 답할 지식이 없으면 none이다.',
    `현장 인물의 판단 맥락: ${JSON.stringify(actors)}`,
    `현재 수치: ${JSON.stringify(state.tracks)}`,
    `현재 능력: ${JSON.stringify(state.abilities)}`,
    `현재 소지품: ${itemNames(scenario, state.items).join(' / ') || '없음'}`,
    `지금 성립하는 사실: ${JSON.stringify(activeFacts(scenario, state).map(fact => fact.text))}`,
    `현재 금지 전개: ${JSON.stringify(free.must_not)}`,
    `현재 상태 제약: ${JSON.stringify(free.state_guard)}`,
    `직전 대화 참조: ${JSON.stringify(state.recent.slice(-4))}`,
    `직전 플레이어 시도 참조: ${JSON.stringify((state.heard ?? []).slice(-2))}`,
    '괄호 동작과 바깥 발화를 함께 읽되 관찰·호흡·감정과 불확실한 성취 시도를 구분한다. 지속되는 사회적 저항도 입력에 실제 의도가 있을 때만 시도다. 이미 달성한 목표는 다시 판정하지 않는다.',
  ].filter(Boolean).join('\n');
}

export function buildSystem(ctx: GmContext, lore: Lore): string {
  const { scenario, beat, free, state } = ctx;
  if (ctx.reaction) {
    return [
      `현재 장면: ${ctx.beat.title}. 현재 상황: ${free.situation}`,
      '너는 사막에서 칼을 겨눈 인물의 대사 한 줄을 쓴다. 플레이어는 아시나다. 한국어 JSON으로만 답한다.',
      PROSE_RULE,
      ...free.speakers.flatMap(key => {
        const cast = scenario.cast[key];
        const character = cast?.lore ? lore.characters[cast.lore] : undefined;
        return cast?.style === 'speech' && cast.lore !== scenario.sheet.name && character
          ? [`화자: ${key}. 성격: ${character.personality}`, `허용 표정: ${(cast.faces ?? []).join(', ')}`, ...character.voice, ...character.faces.map(f => `표정: ${f}`)]
          : [];
      }),
      ctx.spoken
        ? `아시나가 칼끝 앞에서 그에게 건넨 말을 받는다. ${SPOKEN_READ} 말투는 차갑게 두고 그 말의 구체적인 내용을 짚어 짧게 되묻거나 명령하거나 비웃는다. 감탄만 하거나 이유 없는 질문으로 넘기지 않는다.`
        : ctx.acted
          ? '아시나가 현재 장면에서 한 행동을 받는다. 그 행동(손의 움직임, 꺼낸 물건, 몸짓)을 짚어 경계하거나 명령하거나 비웃는다. 감정을 지어내거나 말을 했다고 전제하지 않는다.'
          : '상대가 보이는 감정과 몸의 반응을 받아 짧게 질문하거나 명령하거나 비웃는다. 입력을 보고 지금 관찰할 수 있는 모습만 받는다. 감탄만 하거나 이유 없는 질문으로 넘기지 않는다.',
      '아시나가 말을 하지 않았다면 말을 했다고 전제하지 않는다. 모르는 이름·신분·미래 사건은 밝히지 않는다. 현재 상황의 물건과 복장 상태를 바꾸거나 다음 사건을 만들지 않는다.',
    ].join('\n');
  }
  const facing = free.speakers.some((s) => scenario.cast[s]?.style === 'speech' && scenario.cast[s]?.lore !== scenario.sheet.name);
  const remembered = facing ? (state.heard ?? []).map((h) => (h.action ? `(행동) ${h.text}` : quote(h.text))) : (state.said ?? []);
  const recent = state.recent.slice(-6).map((l) => `${scenario.cast[l.speaker]?.display || '내레이션'}: ${l.text}`);
  return [
    `너는 웹툰 「${lore.work}」(${lore.credit})을 바탕으로 한 1인용 비주얼 노벨 TRPG의 진행자다. 플레이어는 주인공 아시나를 연기한다. 너는 정해진 장면 안에서 인물의 대사와 내레이션을 쓰고, 플레이어가 배경을 물을 때만 GM 으로 짧게 설명한다.`,
    '## 원칙',
    inputRule(ctx),
    bullets([
      '판정 전에 확정한 플레이어의 성공 목표를 먼저 지킨다. 장면 전개는 그 성취와 양립해야 하며 다음 장면의 사건을 미리 쓰지 않는다.',
      '판정 결과와 줄거리 요지는 이미 정해져 있다. 결과를 뒤집거나 더 좋게, 더 나쁘게 바꾸지 않는다.',
      PROSE_RULE,
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
    ...(ctx.question ? [`확인된 질문 시점의 장면 사실: ${questionFacts(ctx, lore).scene}`, 'stagedCast는 화면 배치이고 speakers는 발화 가능 목록이다. 관객 화면의 인물이 아시나 곁에 있다는 뜻은 아니다. 관객에게 보인 대화는 아시나가 듣거나 배운 기억으로 승격하지 않는다.'] : []),
    ...(ctx.displayed ? [`지금 화면에서 완전히 표시된 줄: ${ctx.displayed.speaker}: ${ctx.displayed.text}`, '이 줄은 화면 설명의 근거다. 관객 시점이면 아시나가 들었거나 배운 기억으로 취급하지 않는다. 현재 줄 뒤의 사건·이름·정보를 추측해서 답하지 않는다.'] : []),
    // 장면 목표(free.goal)는 화면 선택지를 나열한 글이라 생성 입력에 넣지 않는다. 모델이 그대로 되풀이한다(resume90 6차).
    bullets([`상황: ${free.situation}`, ...(beat.perspective === 'audience' ? ['관객에게 보이는 장면이다. 아시나의 현장 참여·청취 여부는 별도 근거 없이는 확정하지 않는다.'] : facing ? [] : ['아시나 곁에 아무도 없다. 다른 인물을 등장시키거나 그 반응을 쓰지 않는다.'])]),
    '### 금지 전개',
    bullets(free.must_not),
    '## 지금 상태',
    bullets([
      ...TRACKS.map((t) => `${TRACK_INFO[t].label} ${state.tracks[t]}/${TRACK_INFO[t].max}(${level(state.tracks[t], TRACK_INFO[t].max)}): ${TRACK_INFO[t].desc}`),
      `아시나의 소지품: ${itemNames(scenario, state.items).join(', ') || '없음'}`,
      ...activeFacts(scenario, state).map((f) => `이미 일어난 일: ${f.text}`),
      ...(remembered.length ? [`플레이어가 입력한 말과 시도("(행동)"은 말이 아니다. 시도만으로 성공했다고 기억하지 않는다): ${remembered.join(' / ')}`] : []),
      ...state.log.flatMap(e => e.kind === 'check' && e.roll.tier !== 'miss' && e.roll.tier !== 'fumble' && e.improv?.deed ? [`실제로 완료한 사건: ${e.improv.deed}`] : []),
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
    '후보 접근법과 목표를 고르기 전에 실제 입력의 행동자·대상·성취를 읽는다. 인물에게 이유나 설명을 묻는 발화 자체에 결백 입증·설득·굴복의 목적을 보태지 않는다. 시선·인사와 함께 건넨 말도 별도의 불확실한 성취를 시도하지 않으면 person이다. 물음 형식이어도 실제 근거·협상·저항으로 상대 결정을 바꾸려는 시도는 action일 수 있다. 그때만 입력의 역할과 성취에 맞는 후보를 고른다. 후보의 성취에 맞추려고 reason/deed의 행동자나 대상을 바꾸지 않는다.',
    ...(ctx.question ? ['about는 질문의 원래 주체·관계·답 종류를 뒷받침할 공개 근거 후보다. 후보를 골랐다는 이유로 현재 위치를 목적지로, 국가를 도시로, 화면의 대화를 주인공이 들은 대화로 바꾸지 않는다. about=scene은 확인된 화면·시점의 사실로 답할 질문이다. 답할 근거가 없으면 none을 고른다.'] : []),
    inputRule(ctx),
    ...(ctx.beat.conversation ? ['이 자리는 판정 없는 선택적 대화다. 말·가만히 있기·감정 반응에는 판정 목표를 붙이지 않는다. 몸짓은 즉각적인 관찰과 상대 반응까지만 local로 받는다. 탈출·물건 획득·부상·신분 공개처럼 지속 상태를 바꾸려는 시도는 scope=clarify로 두고 필요한 범위를 되묻는다. 아직 일어나지 않은 뒤 장면의 정보를 답에 쓰지 않는다.'] : []),
    '먼저 입력이 의도한 성취와 현재 상대의 압박·저항을 함께 읽고 kind를 고른다. 새 성취는 물리적 새 변화만 뜻하지 않는다. 능동적인 압박 아래 의도적으로 태도를 끝까지 유지해 상대 판단에 맞서거나 바꾸려는 도전도 아직 이루지 않은 사회적 성취의 action이다. 같은 자세나 행동이 앞에 나왔다는 이유만으로 이 지속되는 도전을 단순 반응으로 지우지 않는다. 반면 관찰·인사·즉시 할 수 있는 몸짓·단순 부탁은 그 자체로 판정하지 않으며, 건넨 말과 함께 있으면 person으로 받고 동작도 보존한다. 의도된 도전 없이 감정·몸 상태만 드러나거나 호흡을 고르면 idle이다. 장면 목표나 낱말 일치만으로 입력에 없는 설득·회피 의도를 만들지 않는다.',
    ctx.beat.perspective === 'audience' ? '현재는 관객 시점이다. 화면 화자의 존재로 아시나의 동석·청취를 추정하지 않는다.'
      : free.speakers.some((k) => scenario.cast[k]?.style === 'speech' && scenario.cast[k]?.lore !== scenario.sheet.name) ? '지금 아시나 앞에 사람이 있다. "너", "넌"이라고 부르는 말은 그 사람에게 건넨 말이다.' : '지금 아시나 곁에 아무도 없다.',
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
      ? '이 입력이 무언가를 시도하는 행동인지, 아무것도 시도하지 않고 그대로 있는 것인지 다시 가린다. 몸을 움직여 상황을 바꾸려는 내용이나 결과가 불확실한 일이 없으면 idle 이다. 앉거나 누운 채 그대로 있기, 얼어붙기, 막지 않고 칼을 맞기, 그저 기다리기도 idle 이다. kind 는 action, idle 중에서 고른다.'
      : only ? `이 입력은 답을 구하는 물음이다. kind 는 ${only.join(', ')} 중에서 고른다. 앞 인물에게 직접 따지는 말이 아니면 person 을 고르지 않는다.` : '',
    bullets([
      'how: 지금 무엇을 입력하면 되는지, 무엇부터 하면 되는지를 묻는 말. 이야기 속 고민이 아니다. "게임"이라는 낱말이 들어 있어도 어떻게 진행하라는 건지 모르겠다는 말이면 how 다(예: "여기 뭐 치면 되는 건데?", "규칙 좀 알려 줘", "이거 나보고 뭘 하라는 건데"). 그러나 규칙의 한 요소를 집어 그것이 어떻게 돌아가는지 묻는 말은 how 가 아니라 game 이다.',
      'game: 게임 자체에 대한 말. 화면에 보이는 규칙 용어의 뜻, 그 규칙이 어떻게 돌아가는지, 수치가 줄거나 늘면 어떻게 되는지, 판정 결과가 무엇을 바꾸는지(행운, 귀찌 수명, 판정과 주사위, 대가, 판정의 목표 숫자 10, 성공·대가·실패의 결과, 의심, 집착, 호감, 탈주 준비도), 화면의 단추와 조작 위치, 저장과 불러오기, 게임을 끝내겠다는 말, 진행자가 누구인지, 게임을 누가 만들었는지 묻는 말이 여기에 든다. 곁에 아무도 없는데 "너", "넌"이라고 부르는 말은 진행자에게 건넨 말이다(예: "대가가 뭔데?", "불러오기는 어디 있어?", "이쯤에서 접을까 봐", "너 진짜 여우야?").',
      'lore: 세계, 장소, 인물, 물건, 아시나의 처지를 진행자에게 묻는 말. 답을 구하는 물음이면 곁에 아무도 없어도 lore 다. 플레이어가 "나", "내"라고 하면 아시나를 묻는 것이다. 아시나가 이루려는 일을 묻는 말도 lore 다. 자기 자신이나 세계를 묻는 물음은 앞에 사람이 있어도 lore 다. 어디 있는지 묻는 말도 물음이지 행동이 아니다(예: "내 이름이 뭐였지?", "크롬웰이 어떤 나라야?", "저 호위들 왜 저래?"). "성공하면", "실패하면" 꼴로 판정 결과가 가져오는 일(무엇을 얻는지, 죽는지, 끝나는지)을 묻는 말은 세계가 아니라 규칙을 묻는 것이니 lore 가 아니라 game 이다. 화면의 단추나 창(수첩, 기록, 저장)을 어디서 보거나 누르는지 묻는 말도 lore 가 아니라 game 이다.',
      'person: 불확실한 성취에 별도로 도전하지 않고 등장인물에게 소리 내어 건넨 말이다. 호칭·인사·단순 부탁·의견 교환처럼 그대로 입에 올릴 수 있는 문장이나 말하는 행위가 여기에 든다. 발화가 있다는 사실만으로 몸짓과 함께 드러난 사회적 시도를 person으로 덮지 않는다. 앞에 있는 사람이든 멀리 보이는 사람이든 같다. "저 사람", "저 남자"처럼 3인칭으로 가리키며 묻는 말은 건넨 말이 아니라 lore 다. "성공하면", "실패하면" 꼴로 판정 결과를 조건으로 묻는 말은 이야기 속 인물이 알 수 없는 것이니 앞에 사람이 있어도 person 이 아니라 game 이다(예: "이봐요, 거기 잠깐만요!", "칼 좀 치워 주실래요").',
      'self: 아무에게도 건네지 않고 답도 바라지 않는 혼잣말, 불평, 감탄, 몸 상태(예: "덥다 더워", "아 진짜 짜증 나", "졸려"). 답을 구하는 물음은 self 가 아니다. 자기 이름이나 정체처럼 사실로 답이 정해진 것을 확인하는 물음도 답을 구하는 물음이다. 이야기 속 일을 콕 집어 말하지 않고 그만하고 싶다, 더 하기 싫다고만 하는 말은 아시나의 푸념처럼 들려도 플레이를 그만두려는 말이니 self 가 아니라 game 이다. 그만 걷고 싶다처럼 이야기 속 일을 집어 말하면 self 다. 끝내지 않겠다는 말도 self 다.',
      'action: 불확실한 성취를 직접 시도한다. 방해를 뚫는 이동·물건 획득·설득뿐 아니라 능동적 압박에 맞서 태도를 지속해 상대 판단에 영향을 주려는 시도도 포함한다. 단순 관찰·인사·호흡·감정 반응과 구분하며, 장면이 사회적 도전을 요구한다는 이유만으로 모든 몸짓을 시도로 바꾸지 않는다. 이미 달성한 같은 목표는 다시 판정하지 않는다. 괄호·몸 움직임·local 목표만으로 action을 고르지 않는다. 세계 밖 행동과 딴짓은 absurd/odd의 비판정 경로로 구분한다.',
      'idle: 상대에게 건네는 말도, 무언가를 해내려는 시도도 없는 입력. 그대로 있기뿐 아니라 감정 때문에 몸에 드러난 반응도 idle 이다. 울음·얼어붙음·떨림·주저앉음 자체는 소리를 내거나 움직였어도 person 이나 action 이 아니다. 상대가 보고 반응할 수 있다는 이유로 person 을 고르지 않는다. 말을 섞어 살려 달라거나 설득하면 그 건넨 말을 기준으로 person 및 해당 접근법을 고른다. 상황을 바꿀 목적으로 움직이거나 기다렸다가 하겠다는 입력은 action 이다. 아래 접근법과 몸짓 낱말이 겹친다는 이유만으로 시도로 바꾸지 않는다.',
      'bad: 15세 이용가에 맞지 않는 행동이나 심한 욕, 금지 전개를 곧장 일으키려는 입력.',
    ]),
    'approach: 목표뿐 아니라 기법·사용 물건까지 정확히 같은 항목만 고른다. 목표만 같고 기법이 다르면 none으로 두고 target만 고른다. 살려 달라거나 설득하는 내용이 없는 대사와 다른 kind는 none이다.',
    ...options,
    'target: 성공 시 실제로 이룰 목표 ID. 아래 목록의 정확한 성취와 같을 때만 고른다. 단순히 이름이 비슷해서 고르지 않는다.',
    ...Object.entries(free.goals ?? {}).filter(([, g]) => !g.if || evalCond(g.if, state)).map(([id, g]) => `${id}: ${g.text}${goalAchieved(g, state) ? ' (이미 달성함. 같은 목표 재판정 금지)' : ''}`),
    'local은 사건 범위이지 판정 필요성을 뜻하지 않는다. 새 불확실한 성취가 없는 관찰·인사·부탁·순간 몸짓은 person/idle이며 target=none이다. 실제 시도인 경우에만 그 자리에서 완료되고 후속 상태를 바꾸지 않는 사건에 local을 쓴다. 지속 부상·무장 해제·물건 소유·탈출을 local로 숨기지 않는다.',
    'scope: ready는 입력한 목표 전체를 그대로 지원할 때. 물리적으로 불가능하거나 가능한데 후속 상태가 미구현이면 clarify. reason에 원래 목표와 제안 범위의 차이 및 이유를 구별해 적고, deed에는 동의받을 대안의 성취를 적는다. 대안도 없으면 target=none. 여러 목적을 몰래 버리지 않는다. absurd/odd/idle/말/질문 등 비판정은 scope=none,target=none.',
    'clarify에서 실행 가능한 대안을 제시할 때 stat/difficulty/bold/risk도 원래의 더 큰 요구가 아니라 승인받을 대안에 맞춘다. 지은 줄거리나 현재 안내와 다르다는 이유로 탈출 등 플레이어 목표를 불가능하다고 하지 않는다.',
    'reason은 내부 판단 근거다. label은 화면에 표시할 짧은 행동 이름이며 reason을 옮기거나 자르지 않는다.',
    'about: kind 가 lore 일 때 묻는 대상의 id. 아는 것의 글에 답이 없는 질문, 인물의 속마음이나 이유, 앞으로 일어날 일을 묻는 질문이면 none. kind 가 game 이면 아래 게임 항목 중 묻는 일을 다루는 항목의 id. 다른 말로 물어도 그 항목이 다루는 일이면 그 항목이다. 어느 항목이 다루는 일도 아닐 때만 none. 다른 kind 면 none.',
    `대상 id: ${notes}`,
    `게임 항목 id: ${(scenario.gameHelp ?? []).map((h) => `${h.id}=${h.name}`).join(', ')}`,
    'risk: 이 입력이 실제로 하려는 위험한 일. attack=칼 든 상대를 때리거나 걷어차거나 들이받거나 무기를 빼앗으며 몸으로 덤빈다. unmask=귀찌나 변장을 풀어 본모습을 드러내려 한다. identity=자기가 공녀이거나 웰든 가문이라고 밝힌다. 피하기, 달아나기, 말로 따지기, 물건 보여 주기, 공녀가 아니라고 잡아떼기, 물음은 none.',
    'odd: kind 가 action 이고 지금 상황과 동떨어진 딴짓이면 true. 살아남거나 벗어나려는 뜻이 없이 기분 내키는 대로 하는 몸짓(춤, 노래, 모래성 쌓기, 하늘에 소리치기, 제자리에서 돌기, 모래 먹기)이 딴짓이다. 살아남으려고 하는 평범한 행동(둘러보기, 물 마시기, 숨기, 피하기, 도망치기)과 지금 상황에 느낀 겁·서러움·억울함을 몸으로 드러내는 행동(울기, 무릎 꿇기, 주저앉기, 고개 숙이기)은 false.',
    'absurd: 이 세계에 없는 물건이나 갑작스러운 초능력을 쓰려는 시도면 true. 칼과 낙타로 사막을 건너는 시대다. 전기·엔진·전자기기와 공장에서 찍어 내는 현대 공산품은 없다. 가진 소지품 칸에 없는 그런 물건을 꺼내 쓰는 행동이 여기 든다.',
    'bold: kind 가 action 이고 상대가 그냥 지나칠 수 없는 큰 행동이면 true. 상대의 몸에 닿는 일(입을 맞추기, 끌어안기, 때리기, 밀치기, 손을 잡기), 상대를 겨누거나 무기를 빼앗는 일, 상대 앞에서 자기 몸을 크게 내던지는 일이 큰 행동이다. 혼자 하는 딴짓·둘러보기·멀리 서 있기·울기는 false. 곁에 사람이 없으면 false.',
    'deed: 성공하면 확정할 사건을 기법과 목적 모두 보존하여 과거형 한 문장으로 적는다. 판정 전에는 계획이고 실패하면 완료 사실이 아니다. "모래를 뿌려 달아난다"를 "모래를 집었다"로 축소하지 않는다. 60자에 목적 전체를 담지 못하면 clarify로 범위를 묻는다. 입력에 없는 성취를 넣지 않는다.',
    'approach 가 none 인 action 일 때만 stat 과 difficulty 를 정한다. stat: 재치(머리, 눈치), 손재주(손놀림), 매력(태도, 표정), 근력(몸 쓰기), 교양(지식, 예법). difficulty: 지금 상황에서 쉬움, 보통, 어려움. 그 밖에는 stat 은 재치, difficulty 는 보통으로 둔다.',
    '소지품 이름만 같다고 고정 접근법을 고르지 않는다. 가방에서 다른 물건을 꺼내는 행동을 지도 꺼내기로 바꾸지 않는다.',
    `소지품을 꺼내 쓰는 행동이면 item 에 소지품 id 를 넣고, 아니면 빈 문자열을 넣는다. 소지품: ${items || '없음'}`,
    '형식: {"reason":"근거 또는 범위 조정 이유","label":"행동 이름","kind":"action","about":"none","risk":"none","approach":"none","target":"local","scope":"ready","item":"","odd":false,"absurd":false,"bold":false,"deed":"","stat":"재치","difficulty":"보통"}',
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
  fumble: '입력한 행동은 이뤄지지 않는다. 확정된 실패 내용과 실제 추가 불이익만 보여 주며 새로운 사건·강제 포획을 지어내지 않는다.',
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
  plain: '이번 입력은 판정이 없다. 적힌 말·행동에 대한 반응만 쓴다.',
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
      `현재 장면: ${ctx.beat.title}. 현재 상황: ${ctx.free.situation}`,
      ...(ctx.spoken
        ? [`아시나가 지금 상대에게 한 말: ${quote(ctx.text)}`, '이 말을 들은 상대의 대사 한 줄, 40자 이내. 그 말의 구체적인 부분을 짚어서 받아라. 아시나의 말을 대신 쓰거나 단순 감탄·침묵으로 넘기지 않는다.']
        : ctx.acted
          ? [`아시나가 한 행동: ${quote(ctx.text)}`, '이 행동을 본 상대의 대사 한 줄, 40자 이내. 그 행동의 구체적인 부분(무엇을 하거나 꺼내려 하는지)을 짚어서 받아라. 아시나의 말을 대신 쓰거나 단순 감탄·침묵으로 넘기지 않는다.']
          : [`아시나에게 지금 보이는 반응: ${quote(ctx.text)}`, '이 모습을 본 상대의 대사 한 줄, 40자 이내. 그 반응의 구체적인 부분을 짚어서 받아라. 아시나의 말을 대신 쓰거나 단순 감탄·침묵으로 넘기지 않는다.']),
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
    inputRule(ctx),
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
      `1~${maxLines}줄. 입력이 엉뚱해도 막지 않는다. 인물이 괄호 안 행동을 보고 괄호 밖 말만 듣고 자기 말투대로 반응한다. 구체적인 내용을 짚어서 답하고, 뻔한 말로 넘기지 않는다.`,
      '동작과 발화가 섞이면 둘 다 반응에 보존한다. 괄호 안 동작의 주체는 아시나이며 상대가 이미 하던 행동과 바꾸지 않는다. 문장마다 누가 누구에게 무엇을 했는지 분명히 쓰고, 주체가 다른 연속 동작을 모호한 대명사로 묶지 않는다.',
      '상대는 지금 관찰한 모습과 자기 의사·태도로 답한다. 자신의 의향이나 현재 경험을 말할 수 있지만, 아직 일어나지 않은 외부 사건이나 다른 사람의 결정을 확정된 사실처럼 보장하지 않는다. 위로나 안심도 인물이 현재 아는 근거 안에서 표현한다.',
      ...(ctx.beat.perspective !== 'audience' ? ['주인공 시점 나레이션은 나/내가 한 동작과 눈앞 상대의 동작을 구분해 서술한다. 아시나를 밖에서 평가하는 관찰자 시점으로 바꾸지 않는다.'] : []),
      PLAYER_VOICE_RULE,
      CHARACTER_RULE,
      ctx.interject || ctx.reaction ? '답한 뒤 이야기가 이어지니 다음에 뭘 할지 말하지 않는다.' : '반응 끝에 지금 장면의 상황으로 돌아온다. 아시나가 고를 수 있는 행동이나 해야 할 일을 늘어놓지 않는다.',
      ...(ctx.interject || ctx.reaction ? [] : [`판정이 없는 말이라 장면은 지금 순간에 멈춰 있다. 지금 화면의 마지막 장면 줄: ${ctx.state.recent.at(-1) ? `${ctx.state.recent.at(-1)?.speaker}: ${ctx.state.recent.at(-1)?.text}` : '없음'}. 위협·공격·시간이 이 순간보다 앞으로 나아간 것으로 쓰지 않는다(새로 휘두르거나 다가오거나 닿지 않는다).`]),
      TONE[ctx.tone ?? 'plain'],
      ctx.shown ? '이 입력은 말이 아니라 아시나의 몸이 먼저 드러난 모습이다. 아시나가 말한 것처럼 받지 않는다. 먼저 내레이션 한 줄로 그 모습을 그리고, 상대 인물이 그것을 보고 성격과 말투대로 반응한다.' : '',
      ctx.self ? '이 입력은 아시나의 혼잣말이다. 앞에 사람이 있어도 듣고 대꾸하지 않는다. 속마음과 내레이션으로만 받고, 몸 상태와 주변만 그린다. 입력에 없는 행동(가방 뒤지기 등)이나 없는 소지품을 쓰지 않는다.' : '',
      ctx.absurd
        ? [
            '플레이어가 이 세계에 없는 물건이나 힘을 쓰려 했다. 그런 것은 일어나지 않는다. 그 물건·힘이나 그것을 꺼내고 쓰는 동작이 실제로 있었다고 쓰지 않는다. 내레이션 줄은 쓰지 않는다. "이상한 몸짓"이라는 말은 쓰지 않는다.',
            ctx.self ? '속마음 한 줄로만 받는다.' : '상대 인물이 성격·말투대로 짧게 한마디로 받아넘긴다(비꼬거나 어이없어한다). 설명하거나 묻지 않는다.',
            '수치·상황은 바뀐 게 없다. 다음 사건으로 넘어가지 않는다.',
          ].join(' ')
        : '',
      ctx.odd
        ? [
            '플레이어가 지금 상황과 동떨어진 딴짓을 했다. 그 동작은 실제로 일어난다. 먼저 내레이션 한 줄로 아시나가 한 동작을 그대로 그린다.',
            ctx.self ? '그 뒤 아시나가 성격대로 몸이나 속마음으로 반응한다(예: 모래를 먹었으면 모래를 뱉고 투덜거린다).' : '그 뒤 상대 인물이 그 모습을 보고 성격·말투대로 짧게 한마디 한다.',
            '아무것도 시도한 것이 아니다. 그 동작으로 기운이 나거나 상황이 좋아지지 않는다. 수치·상황은 그대로다. 다음 사건으로 넘어가지 않는다.',
          ].join(' ')
        : '',
      '정체를 밝히는 답은 하지 않는다. 플레이어 입력을 되풀이하지 않는다.',
      ...(['b04_blade', 'b05_why', 'b06_swing'].includes(ctx.beat.id)
        ? [...(ctx.self || ctx.shown ? [] : [SPOKEN_READ]), '칼을 겨눈 이유나 자기 잘못을 따지는 말에는 남자가 "왜지?", "…뭐?" 같은 원작 1화의 짧고 차가운 반응으로 받는다. 숨은 첩자 의심은 나레이션이나 여우가 설명하지 않는다. 남자도 첩자라는 말을 입 밖에 내지 않는다. 이름·나라·왕이라는 신분도 밝히지 않는다. 같은 판에서 이미 한 줄은 다시 쓰지 않는다.']
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

/**
 * 접근법이 전제하는 동작(presume)을 서술에서 막을지. 입력 검수가 '원문은 후보의 일부만 했다'고 확인한 판정(deed 로 범위가 좁혀짐)과
 * 어느 접근법도 아닌 즉흥 행동에만 막는다. 원문이 그 접근법 전체를 했다고 확인된 판정(달아나기를 골라 달아난 입력)은 그 동작을 한 것이다.
 */
export function presumeGuard(ctx: NarrateContext): boolean {
  if (!ctx.approach.presume?.length) return false;
  return ctx.approach.id === 'improv' || (!ctx.improv && Boolean(ctx.deed));
}

export function buildNarrateUser(ctx: NarrateContext, feedback: string, maxLines: number, maxChars: number, limits: WriteLimits = NO_LIMITS): string {
  const { text, approach, roll, outcome, free, scenario } = ctx;
  const facing = free.speakers.some((s) => scenario.cast[s]?.style === 'speech' && scenario.cast[s]?.lore !== scenario.sheet.name);
  return [
    '## 할 일: 판정 결과 연출',
    `플레이어 입력: ${quote(text)}`,
    `행동 해석: ${approach.label}`,
    '이미 유지 중인 신체 제약과 이번 결과·대가의 추가 변화를 구분한다. 붙들리거나 묶인 상태라면 그 제약 안에서 입력 동작이 어떻게 시도되는지 잇는다. 이미 붙잡고 있던 인물을 새로 등장시키거나 처음 붙잡는 사건으로 되돌리지 않는다. 이번 비용은 구속의 강화·통증처럼 현재 상태에 이어 보여 주며, 실제 비용이나 판정 결과를 없애지 않는다.',
    ctx.improv ? '이번 판정의 목표와 독립 비용을 먼저 지키고 인물의 성격에 맞는 반응을 쓴다. 원래 장면으로 돌아가려고 성공을 취소하지 않는다.' : '',
    ctx.improv?.deed ? `${roll.tier === 'miss' || roll.tier === 'fumble' ? '시도했으나 이루지 못한 목표' : '실제로 완료한 사건'}: ${ctx.improv.deed}. 범위 확인을 거쳤다면 원래 입력보다 이 승인된 계획을 우선한다.` : '',
    ctx.improv?.bold
      ? '상대가 그냥 지나칠 수 없는 큰 행동이다. 상대 인물의 반응을 실제 말 내용이 있는 대사 한 줄 이상과 몸짓·눈빛 내레이션으로 합쳐 2~3줄 쓴다. 반응의 방향은 그 인물의 성격·가치관에서 고른다. 표정은 실제 결과에 따른다. 몸이나 무기를 직접 붙잡아 저지하는 행동은 그에게 가한 위협이다. 이를 받거나 되막는 남자의 대사는 menacing이며, 단순한 놀람·관찰·흥미로 넘기지 않는다. 말솜씨나 위협이 아닌 뜻밖의 대담함에 관심을 느끼는 경우의 intrigued와 구별한다. 한 줄로 넘기지 않는다.'
      : '',
    ctx.improv?.absurd ? '이 세계에 없는 물건이나 힘을 쓰려 했다. 그런 것은 일어나지 않는다. 그 낱말을 쓰지 말고, 아시나가 실제로 한 동작을 이 세계의 말로 구체적으로 그린다(예: 허공에 손바닥을 내밀었다, 빈 손을 귀에 대었다). "이상한 몸짓"이라는 말은 쓰지 않는다. 상대 인물이 있으면 그 인물이 어이없어하며 한마디 한다.' : '',
    !ctx.improv && ctx.deed ? `플레이어가 실제로 한 범위: ${ctx.deed}. 후보 행동 이름에 있어도 입력하지 않은 부분(묻기·말하기 등)은 아시나가 했다고 쓰지 않는다.` : '',
    `결과: ${TIER_LABEL[roll.tier]} (반드시 이 결과대로). ${TIER_MEANING[roll.tier]}`,
    ctx.bound && roll.tier !== 'miss' && roll.tier !== 'fumble' ? `이번 성공이 확정한 성취의 상한: ${ctx.bound}. 이보다 많은 결과(목숨을 건졌다, 무기가 거둬졌다, 달아났다, 시간이 흘렀다, 정해지지 않은 손실)를 확정하지 않는다.` : '',
    ctx.applied ? `이번 결과로 확정된 수치 변화: ${Object.entries(ctx.applied).map(([k, v]) => `${TRACK_INFO[k as keyof typeof TRACK_INFO].label} ${Number(v) > 0 ? '+' : ''}${v}`).join(', ')}. 서술은 이 변화와 어긋나지 않는다(체력이 줄면 몸이 다친 것이고, 다치지 않았다고 쓰지 않는다).` : '',
    facing ? '상대가 강하다는 이유로 성공을 미수로 바꾸지 않는다. 확정된 목표를 그대로 이루고 그 결과에 인물이 반응한다.' : '',
    `반드시 일어날 일: ${outcome.gist ?? ''}`,
    ctx.price ? `대가(반드시 장면에 보인다. 성공한 행동 자체를 없던 일로 만들지 않는다): ${ctx.price.text}` : '',
    ctx.fumble ? `대실패의 추가 불이익: ${TRACK_INFO[ctx.fumble.key].label} ${ctx.fumble.from} → ${ctx.fumble.to}. 기존 실패와 대가 뒤 이 한 칸만 추가된다. 수치에 맞는 손실을 서술하고 없는 인물·사건을 만들지 않는다.` : '',
    '막아야 할 일은 "안 된다"고 쓰지 않고 이야기 속 이유로 보여 준다.',
    PLAYER_VOICE_RULE,
    CHARACTER_RULE,
    UNKNOWN_NAME_RULE,
    '플레이어가 입력하고 승인한 행동만 보여 준다. 입력에 없는 이동·발화·결정을 추가하지 않는다. 대가는 성공한 행동과 별개의 손실로 보여 주며 성취를 약화시키지 않는다.',
    outcome.state_guard?.length ? `이 결과에서 쓰면 안 되는 표현: ${outcome.state_guard.join(', ')}` : '',
    presumeGuard(ctx) && !approach.presume?.some((w) => text.replace(/\s+/g, '').includes(w.replace(/\s+/g, '')))
      ? `플레이어는 "${approach.label}"과 같은 행동을 하지 않았다. 원작 대사에 나오는 그 행동(${(approach.presume ?? []).join(', ')})을 아시나가 했다고 쓰지 말고, 플레이어가 실제로 한 행동을 그대로 보여 준다. '반드시 일어날 일'에 그 행동이 적혀 있어도 결과만 따르고, 그 뒤에 일어나는 일은 상대나 사물을 주어로 쓴다.`
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
    ...(ctx.question && ctx.about === 'scene' ? [`현재 위치와 화면 상황: ${ctx.beat.title} / ${ctx.free.situation}`, ...(ctx.displayed ? [`현재 완전히 표시된 줄: ${ctx.displayed.speaker}: ${ctx.displayed.text}`] : []), '현재 위치·표시된 말의 뜻만 답한다. 다른 장면의 위치 설명을 가져오거나 이 장면의 아직 표시되지 않은 줄을 말하지 않는다. 관객 화면의 내용은 아시나가 직접 안다는 말로 바꾸지 않는다.'] : []),
    note ? `해석이 제안한 근거 후보: ${note.name}. 후보 내용: ${note.text}. 이 후보가 원래 질문을 바꿀 권한은 없다.` : '',
    ...(ctx.inquiry ? [
      `원문 질문 관계: ${JSON.stringify({ question: ctx.inquiry.question, subject: ctx.inquiry.subject, relation: ctx.inquiry.relation, answerType: ctx.inquiry.answerType })}`,
      `이 관계의 공개 근거: ${JSON.stringify(ctx.inquiry.evidence)}`,
      '원문 질문의 주체·관계·답 종류에만 답한다. 근거가 원문 관계를 뒷받침하지 않으면 모른다고 답한다. 관객에게 보인 말과 주인공이 들은 말은 별개다.',
    ] : []),
    bullets([
      '후보의 이름을 언급하는 것보다 원래 물은 관계에 답하는 것이 우선이다. 플레이어가 "나"라고 하면 아시나를 가리키며, 관객으로서 물은 화면 질문과 구분한다.',
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
/** 칼끝 앞에서 건넨 말을 받기 전에 그 말의 성격부터 가리게 한다. 말투(늘 차갑다)와 속 반응(face)을 나누는 출발점이다. */
export const SPOKEN_READ = '그 말이 겁에 질린 애원·아첨·허풍인지, 겁먹은 기색 없이 태연하거나 당돌하게 자기 용건을 꺼내는 말인지 먼저 가린 뒤 face를 고른다.';
/** 인물 줄의 표정 규칙. 화면 입식은 이 값으로 바뀝다. */
export const FACE_RULE = '인물의 대사·속마음 줄에는 그 화자의 허용 목록에서 그 순간의 표정을 face에 적는다. face는 text보다 먼저 정한다. 입력 낱말이 아니라 실제 사건과 화자의 의도로 고른다. face는 말투가 아니라 그 순간 인물이 속으로 보이는 반응이다. 남자의 말투는 늘 차갑고 깔보지만, 그렇다고 face가 늘 sneer인 것은 아니다. 남자에게 몸으로 덤비거나 그의 무기·몸을 직접 저지해 위협하는 상황은 menacing이다. 칼끝 앞에서도 칭찬·아첨·미인계·허풍으로 환심을 사려는 말은 속셈이 빤히 보여 sneer이고, 겁에 질려 비는 말도 sneer다. 그런 속셈·겁 없이 태연하게 말을 걸거나 당돌하게 자기 용건을 꺼내는 상황은, 그 침착함이 그에게 예상 밖이라 차가운 말로 받더라도 intrigued다. 세계 밖의 뜻 모를 말·행동에는 dumbfounded, 울음·겁·기력 저하를 보고 깔보는 반응은 sneer 또는 neutral이다. 비웃는 말투라고 모든 상황을 sneer로 덮지 않는다. 놀람·위협·관심은 그 상황에서 인물이 실제로 보이는 반응으로 구별한다. 상대 감정을 화자에게 복사하지 않는다. 아시나의 teary·pouty와 남자의 cold는 허용 ID가 아니다. 미래 사건이나 모르는 관계를 표정에 반영하지 않는다. 나레이션과 GM 줄에는 face를 쓰지 않는다.';
export const LINES_FORMAT = '형식: {"lines":[{"speaker":"나레이션","text":"서술"},{"speaker":"인물","face":"neutral","text":"대사"}]}';

export function linesSchema(speakers: readonly string[], maxLines: number, maxChars: number, lead?: { first: string; second?: string; rest: readonly string[] }, cast: Readonly<Record<string, CastSpec>> = {}): object {
  // 입식이 있는 화자의 줄은 face 가 필수, 나레이션·GM 줄에는 face 칸이 없다. 둘이 섞이면 anyOf 로 갈림다.
  const shape = (who: readonly string[], faces?: readonly string[]) => ({
    type: 'object',
    additionalProperties: false,
    required: faces ? ['speaker', 'face', 'text'] : ['speaker', 'text'],
    // llama.cpp 문법은 properties 순서대로 쓰게 한다. face 를 text 앞에 두어, 차가운 대사를 먼저 쓴 뒤 표정을 대사 말투에 맞춰 고르는 쏠림(59c sneer 7/8)을 막는다.
    properties: {
      speaker: { type: 'string', enum: [...who] },
      ...(faces ? { face: { type: 'string', enum: [...faces] } } : {}),
      // 큰따옴표·역슬래시·줄바꿈을 못 쓰게 해 글 안에 JSON 조각이나 끝없는 줄바꿈을 쓰며 토큰 상한까지 가는 일을 막는다.
      text: { type: 'string', pattern: `^[^"\\\\\\n\\r]{1,${maxChars * 2}}$` },
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
export const OBSERVE_CHANGE = '눈앞의 상황을 확인함';
export const GESTURE_CHANGE = '의례적인 순간 몸짓';
const CHANGE_RULES: Record<string, string> = {
  '자리가 바뀜': '무언가를 하려고 스스로 몸의 자리나 자세를 옮긴다. 몸 상태 때문에 저절로 자리가 달라진 경우는 아니다.',
  '물건을 잡거나 씀': '무엇을 쥐거나 줍거나 입거나 벗거나 휘두른다.',
  '상대나 주변에 닿거나 신호함': '사람이나 땅, 모래를 건드리거나 손을 흔들거나 쏘아본다.',
  [LOOK_CHANGE]: '아직 모르는 정보를 찾아내거나 해석하려는 별도의 시도다. 이미 보이는 상황에 시선을 옮기는 것과 구분한다.',
  [OBSERVE_CHANGE]: '이미 드러난 모습·위치·상대의 행동을 바라보거나 확인한다. 숨은 것을 찾아내거나 방해를 이겨 새 정보를 얻겠다는 목표가 없다.',
  [GESTURE_CHANGE]: '인사·맞장구·의례적인 자세처럼 즉시 할 수 있는 몸짓이다. 방해를 뚫거나 상대의 결정을 바꾸겠다는 별도의 불확실한 목표가 없다.',
  '남에게 보이려는 몸짓': '상대가 보고 달라지기를 바라며 빌기, 절하기, 척하기, 버티기를 일부러 한다.',
  '말로 새로운 성취를 시도함': '증거·논리·협상으로 상대의 판단이나 결정을 바꾸려는 별도의 불확실한 목표를 직접 시도한다. 단순 부탁·인사·감정 표현과 구분한다.',
  [YIELD_CHANGE]: '칼이든 죽음이든 처분이든 막지 않고 당하는 대로 둔다. 체념이고 항복이다.',
  [SHOWN_CHANGE]: '감정이나 몸 상태 때문에 저절로 나온 반응이다. 눈에 띄거나 소리를 내거나 위치·자세가 달라져도, 무언가를 해내려는 시도가 없으면 이 항목이다.',
  [NO_CHANGE]: '위 어디에도 안 든다. 그대로 있기, 기다리기, 포기하기, 손이나 힘을 놓고 그만두기, 숨, 표정, 입술, 고개, 멍한 시선처럼 아무것도 달라지지 않는다.',
};

/** 후보 목표 없이 입력 자체의 시도를 가린다. */
export const CHANGE_SYSTEM = '너는 입력의 의도와 시도를 분류한다. 입력에 적히지 않은 목적은 지어내지 않는다. 감정이나 몸 상태가 원인인 저절로 나온 변화와, 무언가를 해내려고 스스로 하는 시도를 구분한다. 물리적인 변화가 있다는 사실만으로 시도로 분류하지 않는다.';

/** 시도 유무를 독립적으로 확인한 뒤에만 후보의 성취를 원문과 대조한다. */
export const ATTEMPT_CHECK_SYSTEM = '입력과 판정 후보의 의미 정합성을 한 방향으로만 검수한다. 게임이 플레이어가 적지 않은 행동을 했다고 전제하지 않게 하는 것이 목적이다. input의 원문·동작·발화를 먼저 읽고 실제 행동자·대상·시도한 성취를 정한다. situation은 현재 압박의 문맥일 뿐 입력에 없는 의도를 만들 근거가 아니다. candidate의 reason/deed/approach/goal은 검증 대상이며 증거가 아니다. supported: 원문이 후보의 성취보다 더 많은 것이나 다른 것(다른 성취·다른 행동자나 대상·역할 반전·불가능한 결과)을 주장하지 않고, 이 장면에서 판정할 수 있는 시도이면 true다. 원문이 후보 성취의 일부만 했다는 이유로 false를 내지 않는다. 듣는 사람·말하는 사람·설명 내용의 소유자, 사동의 실행자와 허용자를 구별한다. 단순 발화와 즉시 가능한 관찰·인사는 새로운 불확실한 시도가 아니며, 질문형이라도 별도 증거·논리·협상으로 결정을 바꾸려는 시도가 명시되면 허용한다. partial: 원문이 후보 성취의 일부만 했으면 true다(예: 다가가기만 하고 묻지는 않음). 그때 typed에는 원문이 실제로 한 부분만 원문에 있는 말로 과거형 짧은 구로 적는다. 원문에 없는 성취는 typed에 넣지 않는다. partial이 false면 typed는 빈 문자열이다. JSON supported·partial·typed만 답한다.';

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

export function interpretSchema(free: Pick<FreeSpec, 'approaches' | 'goals'>, items: readonly string[], lore: Lore, help: readonly string[], kinds: readonly InputKind[] = INPUT_KINDS, question = false): object {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['reason', 'label', 'kind', 'about', 'risk', 'approach', 'target', 'scope', 'item', 'odd', 'absurd', 'bold', 'deed', 'stat', 'difficulty'],
    properties: {
      reason: { type: 'string', maxLength: 160 },
      label: { type: 'string', maxLength: 32 },
      kind: { type: 'string', enum: [...kinds] },
      about: { type: 'string', enum: kinds.length === 1 && kinds[0] === 'game' ? [...help, ABOUT_UNKNOWN] : [...new Set([...lore.knowledge.filter((n) => n.tier !== 'hidden').map((n) => n.id), ...help, ABOUT_UNKNOWN, ...(question ? ['scene'] : [])])] },
      risk: { type: 'string', enum: ['none', 'attack', 'unmask', 'identity'] },
      approach: { type: 'string', enum: [...free.approaches.map((a) => a.id), 'none'] },
      target: { type: 'string', enum: [...Object.keys(free.goals ?? {}), 'local', 'none'] },
      scope: { type: 'string', enum: ['ready', 'clarify', 'none'] },
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
