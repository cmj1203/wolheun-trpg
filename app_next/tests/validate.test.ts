import { describe, expect, test } from 'bun:test';
import { feedbackFor, normalizeKo, validateOutput, type CheckOptions } from '../src/gm/validate.ts';
import { loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
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
    sceneForbid: free?.forbid ?? [],
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
    expect(rules(raw, options({ sceneForbid: [...(free?.forbid ?? []), ...hoodOff.forbid] }))).toContain('beat/scene_forbid');
  });
});

describe('GM 출력 검증', () => {
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
    ['남자의 이름을 밝힘', out(['남자', '나는 베히다트다.']), 'beat/scene_forbid'],
    ['칭호 노출', out(['아시나', '폐하, 살려 주세요!']), 'beat/scene_forbid'],
    ['플레이어가 말하지 않은 정체', out(['남자', '웰든의 공녀로군.']), 'beat/echo_only'],
    ['판정 결과와 어긋남', out(['나레이션', '남자가 칼을 거두었다.']), 'beat/outcome_forbid'],
    ['다른 장면 대사를 앞당김', out(['남자', '하. 웃기는 여자군.']), 'beat/reserved_line'],
    ['요지 문장을 그대로 옮김', out(['나레이션', '거짓은 아닌 듯하다고 여겨 칼끝을 살짝 물린다.']), 'beat/gist_copy'],
    ['이미 나온 대사 반복', out(['아시나', '그것 좀 치워봐요! 난 죽이면 안 돼요.']), 'beat/repeat_earlier'],
    ['대사 안에 화자 이름', out(['아시나', '속마음: 미인계다!']), 'format/speaker_prefix'],
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
    ['정체 노출', out(['남자', '나는 베히다트다.']), 'beat/scene_forbid', 'hard'],
    ['등급 위반', out(['아시나', '이 씨발 놈아!']), 'rating/profanity', 'hard'],
  ])('%s 는 %s 위반으로 %s', (_name, raw, rule, severity) => {
    expect(severityOf(raw, rule)).toBe(severity as 'hard' | 'soft');
  });

  test('플레이어가 먼저 말한 정체는 받아 칠 수 있다', () => {
    const raw = out(['남자', '웰든의 공녀라. 우스운 거짓말이군.']);
    expect(rules(raw, options({ playerText: '저는 웰든 대공가의 공녀예요!' }))).not.toContain('beat/echo_only');
  });

  test('다시 생성할 때 넘기는 지적은 한국어 목록이고 분류가 붙는다', () => {
    const { violations } = validateOutput(out(['남자', '폐하께 말씀드리지요.'], ['나레이션', '주사위가 굴렀다.']), options());
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
});
