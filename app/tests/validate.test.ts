import { describe, expect, test } from 'bun:test';
import { echoesInput, facedSpeakers, feedbackFor, losesItem, normalizeKo, validateOutput, type CheckOptions } from '../src/gm/validate.ts';
import { linesSchema } from '../src/gm/prompt.ts';
import { Engine } from '../src/engine/engine.ts';
import { LoreError, loreFor, parseLore, spoilersFor, withNotes } from '../src/gm/lore.ts';
import { FakeGm, LORE_PATH, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
// 숨긴 항목(남자의 이름·칭호)이 아직 열리지 않은 새 게임 상태 기준의 설정 사전.
const rawLore = await loadWolheunLore();
const lore = loreFor(rawLore, new Engine(scenario, new FakeGm()).newGame(1, 'validate-test').state);
const free = scenario.beats.b05_why?.free;
if (!free) throw new Error('b05_why 에 free 가 없습니다');

const reserved = [
  { text: '하. 웃기는 여자군.', future: true },
  { text: '남는 것은 살아남는 자와 죽는 자.', future: true },
  { text: '그것 좀 치워봐요! 난 죽이면 안 돼요.', future: false },
].map((r) => ({ ...r, norm: normalizeKo(r.text) }));

function options(overrides: Partial<CheckOptions> = {}): CheckOptions {
  return {
    speakers: free?.speakers ?? [],
    maxLines: 4,
    maxChars: 80,
    cast: scenario.cast,
    lore,
    stateGuard: free?.state_guard ?? [],
    echoOnly: free?.echo_only ?? [],
    outcomeForbid: ['칼을 거두'],
    playerText: '억울해요!',
    reserved,
    gist: '남자는 아시나의 눈을 오래 들여다본다. 거짓은 아닌 듯하다고 여겨 칼끝을 살짝 물린다.',
    playerLore: '아시나',
    ...overrides,
  };
}

const out = (...lines: [string, string][]) => JSON.stringify({ lines: lines.map(([speaker, text]) => ({ speaker, text })) });
const rules = (raw: string, o = options()) => validateOutput(raw, o).violations.map((v) => `${v.kind}/${v.rule}`);
const severityOf = (raw: string, rule: string) => validateOutput(raw, options()).violations.find((v) => `${v.kind}/${v.rule}` === rule)?.severity;

describe('판정 결과와 서술', () => {
  test.each([
    { previous: ['그게 한계인가?', '눈을 떠라.'], text: '겁이 난 건가?', repeat: false },
    { previous: ['그게 한계인가?'], text: '겁이 난 건가?', repeat: false },
    { previous: ['그게 한계인가?', '벌써 끝인가?'], text: '겁이 난 건가?', repeat: true },
    { previous: ['여행자, 눈을 들어라.', '그만 떨지.'], text: '숨이 막히나, 여행자?', repeat: true },
    { previous: ['상인, 눈을 들어라.', '그만 떨지.'], text: '상인의 고집도 대단하군.', repeat: true },
    { previous: ['그게 한계인가?', '눈을 들어라.', '그만 떨지.'], text: '겁이 난 건가?', repeat: false },
    { previous: ['그게 한계인가?', '참 우습군.'], text: '다리는 떨리는가? 버텨라.', repeat: false },
    { previous: ['고개를 들어라.', '그만 떨지.'], text: '여행자, 아직 버티는군.', repeat: false },
  ])('최근 실제 남자 줄과 끝 절·호칭 구조를 비교한다: $text', ({ previous, text, repeat }) => {
    const checked = rules(out(['남자', text]), options({ spoken: { 남자: previous } }));
    expect(checked.includes('beat/reaction_repeat')).toBe(repeat);
  });

  test('다른 화자와 다른 판의 기록은 남자 반복 구조로 쓰지 않는다', () => {
    const text = out(['남자', '겁이 난 건가?']);
    expect(rules(text, options({ spoken: { 아시나: ['그게 한계인가?'] } }))).not.toContain('beat/reaction_repeat');
    expect(rules(text, options({ spoken: {} }))).not.toContain('beat/reaction_repeat');
  });

  test('구조 반복은 다른 안전 검사를 막지 않는 soft 위반이다', () => {
    const checked = validateOutput(out(['남자', '여행자, 아직 버티는군.']), options({
      spoken: { 남자: ['여행자, 눈을 들어라.'] },
    }));
    expect(checked.violations.find(v => v.rule === 'reaction_repeat')?.severity).toBe('soft');
  });

  test.each(['...', '…….', '… …', '?!'])('직접 반응할 인물의 말 내용 없는 줄은 hard 위반이다: %s', text => {
    const checked = validateOutput(out(['남자', text]), options({ reactor: '남자' }));
    expect(checked.violations.find(v => v.rule === 'reaction_response')?.severity).toBe('hard');
  });

  test.each(['그 손부터 놓아라.', '……왜지?', '셋.'])('실제 말이 있는 반응은 문장부호와 함께 쓸 수 있다: %s', text => {
    expect(rules(out(['남자', text]), options({ reactor: '남자' }))).not.toContain('beat/reaction_response');
  });

  test('직접 반응할 상대가 없는 장면의 침묵과 나레이션은 그대로 둔다', () => {
    expect(rules(out(['남자', '…….']))).not.toContain('beat/reaction_response');
    expect(rules(out(['나레이션', '…….'], ['남자', '손을 치워라.']), options({ reactor: '남자' }))).not.toContain('beat/reaction_response');
  });

  test('성공과 대가 있는 성공에서 빗나간 서술을 막고, 정해진 요지에 있는 말은 막지 않는다', () => {
    const missed = out(['나레이션', '주먹은 허공을 갈랐다.']);
    expect(rules(missed, options({ tier: 'hit' }))).toContain('beat/tier_mismatch');
    expect(rules(missed, options({ tier: 'mixed' }))).toContain('beat/tier_mismatch');
    expect(rules(missed, options({ tier: 'miss' }))).not.toContain('beat/tier_mismatch');
    expect(rules(missed, options({ tier: 'hit', gist: '주먹은 허공을 갈랐다' }))).not.toContain('beat/tier_mismatch');
    expect(rules(out(['나레이션', '완벽하게 해냈다.']), options({ tier: 'miss' }))).toContain('beat/tier_mismatch');
  });
});

describe('리드 QA 때 나온 GM 실수', () => {
  test('대사 줄에 섞인 지문을 막고, 소리 내어 하는 "~다." 대사는 통과시킨다', () => {
    expect(rules(out(['아시나', '후드를 휙 벗어 던지고 생긋 웃으며 말했다.']))).toContain('format/stage_direction');
    expect(rules(out(['남자', '마음이 바뀌었다.']))).not.toContain('format/stage_direction');
  });

  test('남자는 여자를 "네놈"이라고 부르지 않는다', () => {
    expect(rules(out(['남자', '네놈은 왜 여기 있지?']))).toContain('lore/register_word');
  });

  test('이미 후드를 벗은 판에서 후드가 벗겨지는 장면은 막는다', () => {
    const hoodOff = scenario.facts.find((f) => f.if === 'flag:후드_벗음');
    if (!hoodOff) throw new Error('후드 사실이 없습니다');
    const raw = out(['나레이션', '칼바람에 머리 위로 후드가 벗겨졌다.']);
    expect(rules(raw, options({ stateGuard: [...(free?.state_guard ?? []), ...hoodOff.state_guard] }))).toContain('beat/state_guard');
  });
});

describe('GM 출력 검증', () => {
  test('세계 밖 행동은 첫 줄이 나레이션이어야 하고, 상대 인물 줄도 한 줄 있어야 한다(택시 FAIL 재발 방지)', () => {
    const opt = options({ first: '나레이션', reactor: '남자', outcomeForbid: [] });
    const manFirst = validateOutput(out(['남자', '허공에 손을 휘저으며 입술을 달싹였다.'], ['남자', '정말이지, 말도 안 되는 소리를 내뱉고 말았다.']), opt);
    expect(manFirst.violations.map((v) => v.rule)).toContain('first_speaker');
    const noMan = validateOutput(out(['나레이션', '허공에 손을 흔들었다. 아무것도 오지 않았다.'], ['속마음', '뭘 한 거지, 나.']), opt);
    expect(noMan.violations.map((v) => v.rule)).toContain('no_reaction');
    const good = validateOutput(out(['나레이션', '허공에 손을 흔들었다. 아무것도 오지 않았다.'], ['남자', '…뭐 하는 짓이지.']), opt);
    expect(good.violations.filter((v) => v.rule === 'first_speaker' || v.rule === 'no_reaction')).toEqual([]);
  });

  test('원작 말투를 지킨 출력은 통과한다', () => {
    const raw = out(['아시나', '정말이에요! 전 길만 물었다고요!'], ['나레이션', '칼끝이 내 목에서 손가락 한 마디만큼 물러났다.'], ['남자', '거짓말은 아닌 모양이군.']);
    expect(validateOutput(raw, options())).toEqual({
      lines: [
        { speaker: '아시나', text: '정말이에요! 전 길만 물었다고요!' },
        { speaker: '나레이션', text: '칼끝이 내 목에서 손가락 한 마디만큼 물러났다.' },
        { speaker: '남자', text: '거짓말은 아닌 모양이군.' },
      ],
      violations: [],
    });
  });

  test.each([
    ['JSON 이 아님', '그냥 문장', 'format/json'],
    ['허용되지 않은 화자', out(['호위', '죽여야 합니다']), 'format/speaker'],
    ['줄 수 초과', out(['나레이션', '하나였다.'], ['나레이션', '둘이었다.'], ['나레이션', '셋이었다.'], ['나레이션', '넷이었다.'], ['나레이션', '다섯이었다.']), 'format/too_many'],
    ['한 줄이 너무 김', out(['나레이션', '모래가'.repeat(30)]), 'format/too_long'],
    ['한자 섞임', out(['남자', '女子, 웃기는군.']), 'format/han'],
    ['영문 섞임', out(['남자', 'sword 를 거둘 생각은 없다.']), 'format/latin'],
    ['이모지 섞임', out(['아시나', '살려 주세요 😭']), 'format/emoji'],
    ['같은 대사 반복', out(['남자', '왜지?'], ['남자', '왜지?']), 'format/repeat'],
    ['끝나지 않은 문장', out(['나레이션', '칼은 여전히 목을 가리고,']), 'format/unfinished'],
    ['대사에 자기 묘사', out(['남자', '남자는 칼을 고쳐 쥐었다.']), 'format/speaker_voice'],
    ['게임 밖 이야기', out(['나레이션', '주사위가 나를 살렸다.']), 'lore/meta'],
    ['현대 물건', out(['아시나', '스마트폰이라도 있었으면!']), 'lore/modern'],
    ['현실 지명', out(['아시나', '서울로 돌아가고 싶어요.']), 'lore/realworld'],
    ['아직 안 나온 이야기', out(['남자', '내 하렘에 들어오겠나?']), 'lore/spoilers'],
    ['원작 표기 오류', out(['나레이션', '귀걸이가 뜨겁게 달아올랐다.']), 'lore/misspelling'],
    ['남자의 존댓말', out(['남자', '살려 드릴게요.']), 'lore/register'],
    ['남자의 사과', out(['남자', '미안하다.']), 'lore/register_word'],
    ['내레이션 존댓말', out(['나레이션', '칼끝이 물러났습니다.']), 'lore/register'],
    ['내레이션 현재형', out(['나레이션', '칼끝이 조금 물러난다.']), 'lore/tense'],
    ['내레이션 3인칭', out(['나레이션', '아시나는 숨을 삼켰다.']), 'lore/register_word'],
    ['심한 욕설', out(['아시나', '이 씨발 놈아!']), 'rating/profanity'],
    ['성적 묘사', out(['나레이션', '알몸이 드러났다.']), 'rating/sexual'],
    ['잔혹 묘사', out(['나레이션', '모래가 피투성이가 되었다.']), 'rating/gore'],
    ['남자의 이름을 밝힘', out(['남자', '나는 베히다트다.']), 'lore/spoilers'],
    ['칭호 노출', out(['아시나', '폐하, 살려 주세요!']), 'lore/spoilers'],
    ['플레이어가 말하지 않은 정체', out(['남자', '웰든의 공녀로군.']), 'beat/echo_only'],
    ['판정 결과와 어긋남', out(['나레이션', '남자가 칼을 거두었다.']), 'beat/outcome_forbid'],
    ['다른 장면 대사를 앞당김', out(['남자', '하. 웃기는 여자군.']), 'beat/reserved_line'],
    ['요지 문장을 그대로 옮김', out(['나레이션', '거짓은 아닌 듯하다고 여겨 칼끝을 살짝 물린다.']), 'beat/gist_copy'],
    ['이미 나온 대사 반복', out(['아시나', '그것 좀 치워봐요! 난 죽이면 안 돼요.']), 'beat/repeat_earlier'],
    ['대사 안에 이 장면에 없는 화자 이름', out(['아시나', 'GM: 미인계다!']), 'format/speaker_prefix'],
  ])('%s → 막는다', (_name, raw, rule) => {
    expect(rules(raw)).toContain(rule);
  });

  test.each([
    ['내레이션 현재형', out(['나레이션', '칼끝이 조금 물러난다.']), 'lore/tense', 'soft'],
    ['내레이션 3인칭', out(['나레이션', '아시나는 숨을 삼켰다.']), 'lore/register_word', 'soft'],
    ['요지 베끼기', out(['나레이션', '거짓은 아닌 듯하다고 여겨 칼끝을 살짝 물린다.']), 'beat/gist_copy', 'soft'],
    ['이미 나온 대사 반복', out(['아시나', '그것 좀 치워봐요! 난 죽이면 안 돼요.']), 'beat/repeat_earlier', 'soft'],
    ['남자의 존댓말', out(['남자', '살려 드릴게요.']), 'lore/register', 'hard'],
    ['다음 장면 대사 앞당김', out(['남자', '하. 웃기는 여자군.']), 'beat/reserved_line', 'hard'],
    ['정체 노출', out(['남자', '나는 베히다트다.']), 'lore/spoilers', 'hard'],
    ['등급 위반', out(['아시나', '이 씨발 놈아!']), 'rating/profanity', 'hard'],
    ['여우의 반말 감탄(하다)', out(['GM', '와, 진짜 대담하다.']), 'lore/gm_voice', 'soft'],
    ['여우의 과거 서술(했다)', out(['GM', '네가 칼을 밀어냈다.']), 'lore/gm_voice', 'hard'],
    ['여우의 합쇼체', out(['GM', '주사위를 굴립니다.']), 'lore/gm_voice', 'hard'],
  ])('%s 는 %s 위반으로 %s', (_name, raw, rule, severity) => {
    expect(severityOf(raw, rule)).toBe(severity as 'hard' | 'soft');
  });

  test('플레이어가 먼저 말한 정체는 받아 칠 수 있다', () => {
    const raw = out(['남자', '웰든의 공녀라. 우스운 거짓말이군.']);
    expect(rules(raw, options({ playerText: '저는 웰든 대공가의 공녀예요!' }))).not.toContain('beat/echo_only');
  });

  test('다시 생성할 때 넘기는 지적은 한국어 목록이고 분류가 붙는다', () => {
    const { violations } = validateOutput(out(['남자', '폐하께 말씀드리지요.'], ['나레이션', '주사위가 굴렀다.'], ['나레이션', '남자가 칼을 거두었다.']), options());
    const feedback = feedbackFor(violations);
    expect(feedback.split('\n').every((l) => l.startsWith('- ['))).toBe(true);
    expect(feedback).toContain('[장면]');
    expect(feedback).toContain('[설정]');
  });
  test('행동을 전제하는 낱말은 입력에 그 뜻이 있을 때만 쓸 수 있다', () => {
    const presume = ['피하', '피한', '피했', '피해'];
    const thought = out(['속마음', '피하지 않았으면 정말 베였을 거야.']);
    expect(rules(thought, options({ playerText: '남자를 향해 달려든다', presume }))).toContain('beat/presume');
    expect(rules(thought, options({ playerText: '몸을 숙여 피한다', presume }))).not.toContain('beat/presume');
  });
  test.each([
    ['다른 낱말의 일부', ['막을'], '모래 소리가 정막을 깼다.', false],
    ['하지 못한 일', ['막을'], '막을 틈도 없이 칼날이 지나갔다.', false],
    ['하지 못한 일', ['피하'], '피하지 못하고 그대로 굳었다.', false],
    ['붙여 쓴 묶음', ['몸을 던'], '모래 위로 몸을  던졌다.', true],
    ['한 일로 쓴 낱말', ['피할'], '칼날을 피할 시간을 벌었다.', true],
  ] as const)('전제 판정: %s', (_name, presume, text, hit) => {
    const got = rules(out(['나레이션', text]), options({ playerText: '귀찌를 만진다', presume: [...presume] }));
    expect(got.includes('beat/presume')).toBe(hit);
  });
});

describe('입력 되풀이와 소지품', () => {
  test('속마음이 입력 문구를 안고 있으면 되풀이로 본다', () => {
    expect(echoesInput('배고파라고 하면 뭐라도 툭 튀어나오나?', '배고파')).toBe(true);
    expect(echoesInput('그냥 누워서 자면 뭐라도 나오나?', '그냥 누워서 잔다')).toBe(true);
    expect(echoesInput('속이 쓰렸다. 물부터 찾아야 해.', '배고파')).toBe(false);
  });

  test('자기 말을 돌아보는 속마음은 남의 말처럼 받은 것이 아니다', () => {
    const out = validateOutput(JSON.stringify({ lines: [{ speaker: '속마음', text: '아, 미쳤나 봐! 나 지금 무슨 소리를 하는 거야?!', face: 'wary' }] }), options({ speakers: ['속마음'], input: '경찰 부를 거예요' }));
    expect(out.violations.map((v) => v.rule)).not.toContain('echo_input');
  });

  test('글 앞에 쓴 화자 이름은 다시 쓰게 하지 않고 그 화자의 줄로 옮긴다', () => {
    const faced = ['속마음'];
    const { lines, violations } = validateOutput(out(['나레이션', '속마음: 내가 지금 뭘 하는 거야…']), options({ speakers: ['나레이션', '속마음'], faced }));
    expect(lines).toEqual([{ speaker: '속마음', text: '내가 지금 뭘 하는 거야…', face: 'neutral' }]);
    expect(violations.map((v) => v.rule)).not.toContain('speaker_prefix');
  });

  test('이번에 쓸 수 없는 화자의 이름을 글 앞에 쓴 줄은 다른 줄이 남으면 빼고, 남지 않으면 다시 쓰게 한다', () => {
    const speakers = ['나레이션', '남자'];
    const dropped = validateOutput(out(['나레이션', '속마음: 망했다…'], ['나레이션', '바람이 분다.']), options({ speakers }));
    expect(dropped.lines).toEqual([{ speaker: '나레이션', text: '바람이 분다.' }]);
    expect(dropped.violations.map((v) => v.rule)).not.toContain('speaker_prefix');
    const only = validateOutput(out(['나레이션', '속마음: 망했다…']), options({ speakers }));
    expect(only.violations.map((v) => v.rule)).toContain('speaker_prefix');
  });

  test('길이를 넘은 줄은 문장 경계에서 나누고, 줄 수 상한을 넘게 되면 그대로 둬서 다시 쓰게 한다', () => {
    const first = `${'모래'.repeat(30)}가 흩어졌다.`;
    const second = `${'칼끝'.repeat(30)}이 멈췄다.`;
    const split = validateOutput(out(['나레이션', `${first} ${second}`]), options({ speakers: ['나레이션'], maxChars: 80, maxLines: 2 }));
    expect(split.lines.map((l) => l.text)).toEqual([first, second]);
    expect(split.violations.map((v) => v.rule)).not.toContain('too_long');
    const kept = validateOutput(out(['나레이션', `${first} ${second}`]), options({ speakers: ['나레이션'], maxChars: 80, maxLines: 1 }));
    expect(kept.lines).toHaveLength(1);
    expect(kept.violations.map((v) => v.rule)).toContain('too_long');
  });

  test('한 문장으로 길이를 넘으면 나눌 수 없어 다시 쓰게 한다', () => {
    const { violations } = validateOutput(out(['나레이션', `${'모래'.repeat(60)}가 흩어졌다.`]), options({ speakers: ['나레이션'], maxChars: 80 }));
    expect(violations.map((v) => v.rule)).toContain('too_long');
  });

  test('스키마는 글 안의 따옴표·역슬래시·줄바꿈을 막고, 반응 인물을 둘째 줄로 고정할 수 있다', () => {
    const schema = linesSchema(['나레이션', '남자'], 2, 80, { first: '나레이션', second: '남자', rest: ['나레이션'] }) as {
      properties: { lines: { prefixItems: { properties: { speaker: { enum: string[] }; text: { pattern: string } } }[] } };
    };
    const items = schema.properties.lines.prefixItems;
    expect(items.map((i) => i.properties.speaker.enum)).toEqual([['나레이션'], ['남자']]);
    const pattern = new RegExp(items[0]?.properties.text.pattern ?? '');
    expect(pattern.test('칼끝이 흔들렸다.')).toBe(true);
    for (const bad of ['말"했다', '말\\했다', '줄\n바꿈', '']) expect(pattern.test(bad)).toBe(false);
  });

  test('입력을 되받는 속마음은 다른 줄이 있으면 뺀다', () => {
    const raw = JSON.stringify({ lines: [{ speaker: '속마음', text: '이 상황에서 이게 무슨 소리야!' }, { speaker: '나레이션', text: '모래가 발을 붙잡았다.' }] });
    const got = validateOutput(raw, options({ speakers: ['속마음', '나레이션'] }));
    expect(got.lines.map((l) => l.speaker)).toEqual(['나레이션']);
    expect(got.violations.map((v) => v.rule)).not.toContain('echo_input');
  });

  test('속마음이 입력을 남의 말처럼 받으면 막는다', () => {
    const out = validateOutput(JSON.stringify({ lines: [{ speaker: '속마음', text: '(이 상황에서 이게 무슨 소리야!)' }] }), options({ speakers: ['속마음'] }));
    expect(out.violations.map((v) => v.rule)).toContain('echo_input');
  });

  test('소지품이 손을 떠났다고 쓰면 막고, 쥐고 쓰는 것은 둔다', () => {
    expect(losesItem('가방을 던져버리고 몸을 숙였다.', '가방')).toBe(true);
    expect(losesItem('가방을 놓쳤다.', '가방')).toBe(true);
    expect(losesItem('호위가 내 마법 가방을 거칠게 낚아채 갔다.', '가방')).toBe(true);
    expect(losesItem('가방을 내팽개치듯 던지며 몸을 숙였다.', '가방')).toBe(true);
    expect(losesItem('던져진 지도가 모래 위를 굴렀다.', '지도')).toBe(true);
    expect(losesItem('가방끈을 쥔 채 휘둘렀다.', '가방')).toBe(false);
  });
});

describe('플레이어가 먼저 한 행동(deed)과 상태 기준 스포일러', () => {
  const kissed = out(['나레이션', '아시나는 남자의 입에 입을 맞췄다. 붉은 눈이 멈췄다.'], ['남자', '……미친 여자군.']);

  test('해석이 요약한 행동에 든 말은 state_guard 에 걸리지 않고, 입력 글자만으로는 걸린다', () => {
    expect(rules(kissed, options({ stateGuard: ['입을 맞'], playerText: '뽀뽀' }))).toContain('beat/state_guard');
    expect(rules(kissed, options({ stateGuard: ['입을 맞'], playerText: '뽀뽀 남자의 입에 입을 맞췄다', deed: '남자의 입에 입을 맞췄다' }))).not.toContain('beat/state_guard');
  });

  test('답 뒤에 곧 나올 줄을 베끼면 그 줄만 빼고, 그 줄뿐이면 앞당김으로 막는다', () => {
    const copied = validateOutput(out(['나레이션', '하늘을 보려 했지만 눈이 부셨다.'], ['남자', '하. 웃기는 여자군.']), options());
    expect(copied.lines.map((l) => l.text)).toEqual(['하늘을 보려 했지만 눈이 부셨다.']);
    expect(copied.violations.map((v) => v.rule)).not.toContain('reserved_line');
    expect(rules(out(['남자', '하. 웃기는 여자군.']))).toContain('beat/reserved_line');
  });

  test('짧은 다음 줄은 낱말이 겹쳐도 앞당김이 아니고 줄 전체가 같을 때만 앞당김이다', () => {
    const short = options({ reserved: [{ text: '사람?!', norm: normalizeKo('사람?!'), future: true }] });
    expect(rules(out(['나레이션', '멀리 세 사람의 형체가 일렁였다.']), short)).not.toContain('beat/reserved_line');
    expect(rules(out(['나레이션', '사람?!']), short)).toContain('beat/reserved_line');
  });

  test('플레이어가 먼저 한 일과 같은 다음 장면 원작 줄은 앞당김으로 보지 않는다', () => {
    const raw = out(['남자', '하. 웃기는 여자군.']);
    expect(rules(raw)).toContain('beat/reserved_line');
    expect(rules(raw, options({ deed: '웃기는 여자라고 스스로 외쳤다', playerText: '웃기는 여자라고 스스로 외쳤다' }))).not.toContain('beat/reserved_line');
  });

  test('큰 행동의 최소 줄 수에 못 미치면 다시 쓰게 한다', () => {
    expect(rules(kissed, options({ minLines: 3, playerText: '뽀뽀 남자의 입에 입을 맞췄다' }))).toContain('format/too_few');
    expect(rules(kissed, options({ minLines: 2, playerText: '뽀뽀 남자의 입에 입을 맞췄다' }))).not.toContain('format/too_few');
  });

  test('숨긴 항목의 이름은 열리기 전에만 스포일러고, 열리면 저절로 풀린다', () => {
    const state = new Engine(scenario, new FakeGm()).newGame(2, 'spoiler-test').state;
    const before = spoilersFor(rawLore, state);
    expect(before).toContain('베히다트');
    expect(before).toContain('폐하');
    expect(before).toContain('감옥');
    expect(before).toContain('페시안');
    expect(before).toContain('적국');
    const after = spoilersFor(rawLore, { ...state, flags: { ...state.flags, 남자_정체_앎: true } });
    expect(after).not.toContain('베히다트');
    expect(after).not.toContain('폐하');
    expect(after).toContain('감옥');
    expect(after).toContain('하렘');
    expect(after).toContain('페시안');
    const revealed = spoilersFor(rawLore, { ...state, flags: { ...state.flags, 페시안_앎: true } });
    expect(revealed).not.toContain('페시안');
    expect(revealed).not.toContain('적국');
    expect(revealed).toContain('베히다트');
  });
});

describe('표정(face): GM 생성 줄의 표정 허용 집합', () => {
  const faced = facedSpeakers(scenario.cast, free?.speakers ?? []);
  const withFace = (...lines: [string, string, string?][]) => JSON.stringify({ lines: lines.map(([speaker, text, face]) => ({ speaker, text, ...(face ? { face } : {}) })) });
  const formatRules = (raw: string) => validateOutput(raw, options({ faced })).violations.filter((v) => v.kind === 'format').map((v) => v.rule);

  test('입식이 있는 인물(대사·속마음)만 face 대상이고 나레이션·GM 은 아니다', () => {
    expect(facedSpeakers(scenario.cast, ['나레이션', 'GM', '아시나', '속마음', '남자'])).toEqual(['아시나', '속마음', '남자']);
  });

  test('인물 줄에 허용 집합의 face 가 있고 나레이션에 없으면 형식 위반이 없다', () => {
    const raw = withFace(['나레이션', '칼끝이 조금 내려갔다.'], ['남자', '무슨 속셈이지?', 'wary'], ['속마음', '살았다……', 'surprised']);
    expect(formatRules(raw)).toEqual([]);
    const parsed = validateOutput(raw, options({ faced })).lines;
    expect(parsed.map((l) => l.face)).toEqual([undefined, 'wary', 'surprised']);
  });

  test('인물 줄에 face 가 없으면 face_missing, 허용 집합 밖이면 face, 나레이션에 있으면 face_extra 로 막는다', () => {
    expect(formatRules(withFace(['남자', '무슨 속셈이지?']))).toContain('face_missing');
    expect(formatRules(withFace(['남자', '무슨 속셈이지?', 'sad']))).toContain('face');
    expect(formatRules(withFace(['나레이션', '칼끝이 내려갔다.', 'smile'], ['남자', '지루하군.', 'neutral']))).toContain('face_extra');
    for (const face of scenario.cast.남자?.faces ?? []) expect(formatRules(withFace(['남자', '지루하군.', face]))).toEqual([]);
    expect(formatRules(withFace(['남자', '지루하군.', 'scared']))).toContain('face');
    expect(formatRules(withFace(['아시나', '정말 억울해요.', 'sneer']))).toContain('face');
    expect(formatRules(withFace(['속마음', '큰일이다.', 'menacing']))).toContain('face');
  });

  test('faced 를 넘기지 않으면(옛 호출) face 검사를 하지 않는다', () => {
    expect(validateOutput(withFace(['남자', '지루하군.']), options()).violations.filter((v) => v.rule.startsWith('face'))).toEqual([]);
  });

  test('출력 스키마는 인물 줄에만 face 를 필수로 두고, 섞인 화자는 anyOf 로 가른다', () => {
    const only = linesSchema(['남자'], 2, 80, undefined, scenario.cast) as { properties: { lines: { items: { required: string[]; properties: { face?: { enum: string[] } } } } } };
    expect(only.properties.lines.items.required).toEqual(['speaker', 'face', 'text']);
    // llama.cpp 문법은 properties 순서로 생성한다: 표정을 대사보다 먼저 고른다.
    expect(Object.keys(only.properties.lines.items.properties)).toEqual(['speaker', 'face', 'text']);
    expect(only.properties.lines.items.properties.face?.enum).toEqual([...(scenario.cast.남자?.faces ?? [])]);
    const plain = linesSchema(['나레이션'], 2, 80) as { properties: { lines: { items: { required: string[]; properties: Record<string, unknown> } } } };
    expect(plain.properties.lines.items.required).toEqual(['speaker', 'text']);
    expect('face' in plain.properties.lines.items.properties).toBe(false);
    const mixed = linesSchema(['나레이션', '남자'], 3, 80, undefined, scenario.cast) as { properties: { lines: { items: { anyOf: { required: string[]; properties: { speaker: { enum: string[] } } }[] } } } };
    expect(mixed.properties.lines.items.anyOf.map((s) => [s.properties.speaker.enum, s.required])).toEqual([[['남자'], ['speaker', 'face', 'text']], [['나레이션'], ['speaker', 'text']]]);
    expect(linesSchema(['아시나', '남자'], 2, 80, undefined, scenario.cast)).toMatchObject({
      properties: { lines: { items: { anyOf: [
        { properties: { speaker: { enum: ['아시나'] }, face: { enum: scenario.cast.아시나?.faces } } },
        { properties: { speaker: { enum: ['남자'] }, face: { enum: scenario.cast.남자?.faces } } },
      ] } } },
    });
  });

  test('설정 사전의 고정 반응 줄은 face 가 허용 집합 안에 있어야 읽힌다', async () => {
    const source = await Bun.file(LORE_PATH).text();
    for (const [tier, pool] of Object.entries(rawLore.characters.베히다트?.reactions ?? {})) {
      expect(pool.length, tier).toBeGreaterThan(0);
      for (const line of pool) expect(scenario.cast.남자?.faces).toContain(line.face);
    }
    expect(() => withNotes(scenario, parseLore(source.replace('face: dumbfounded', 'face: scared')))).toThrow(LoreError);
    expect(() => parseLore(source.replace('{ text: "……미친 여자군.", face: dumbfounded }', '"……미친 여자군."'))).toThrow(LoreError);
  });
});
