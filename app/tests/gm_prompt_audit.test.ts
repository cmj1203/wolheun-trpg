// GM 금지 규칙 감사(docs/research/gm_prompt_audit.md)의 사례. 검사 함수가 실제로 막는 것, 이번에 고친 검사 버그, 아직 빠져나가는 표현을 나눠 돌린다.
// '알려진 빈틈' 묶음은 지금 동작을 적은 것이다. 빈틈을 고치면 그 기대를 뒤집고 문서의 표도 고친다.
import { describe, expect, test } from 'bun:test';
import { Engine, type GmContext, type NarrateContext } from '../src/engine/engine.ts';
import type { GameState, Line, Tier } from '../src/engine/types.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { loreFor } from '../src/gm/lore.ts';
import { buildTalkUser } from '../src/gm/prompt.ts';
import { ruleInterpret } from '../src/gm/rules.ts';
import { forbiddenIn, normalizeKo, validateOutput, type CheckOptions } from '../src/gm/validate.ts';
import { FakeGm, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const rawLore = await loadWolheunLore();
const fresh = new Engine(scenario, new FakeGm()).newGame(1, 'audit').state;
const lore = loreFor(rawLore, fresh);
const beat = scenario.beats.b05_why;
const free = beat?.free;
if (!beat || !free) throw new Error('b05_why 에 free 가 없습니다');

const FACED = new Set(['아시나', '속마음', '남자']);
const out = (...xs: [string, string][]) => JSON.stringify({ lines: xs.map(([speaker, text]) => ({ speaker, text, ...(FACED.has(speaker) ? { face: 'neutral' } : {}) })) });

function options(overrides: Partial<CheckOptions> = {}): CheckOptions {
  return {
    speakers: ['GM', ...(free?.speakers ?? [])],
    maxLines: 4,
    maxChars: 100,
    cast: scenario.cast,
    lore,
    stateGuard: [],
    echoOnly: [],
    outcomeForbid: [],
    playerText: '',
    reserved: [],
    gist: '',
    playerLore: '아시나',
    ...overrides,
  };
}

const rules = (raw: string, o = options()) => validateOutput(raw, o).violations.map((v) => `${v.kind}/${v.rule}`);
const hard = (raw: string, o = options()) => validateOutput(raw, o).violations.filter((v) => v.severity === 'hard').map((v) => `${v.kind}/${v.rule}`);

describe('다섯 금지 규칙이 실제로 막는 사례', () => {
  test.each([
    ['원작 미래 기억: 숨긴 이름', ['남자', '나는 베히다트다.'], 'lore/spoilers'],
    ['원작 미래 기억: 숨긴 칭호', ['속마음', '설마 국왕이라도 되는 건가.'], 'lore/spoilers'],
    ['원작 미래 기억: 뒤 화의 일', ['남자', '감옥에 처넣어라.'], 'lore/spoilers'],
    ['현실 물건', ['나레이션', '모래 속에서 휴대폰이 울렸다.'], 'lore/modern'],
    ['현실 지명', ['속마음', '서울은 이렇게 덥지 않았는데.'], 'lore/realworld'],
    ['GM 해설: 바깥 낱말', ['나레이션', '주사위가 나를 살렸다.'], 'lore/meta'],
    ['GM 해설: 플레이어를 부름', ['남자', '플레이어여, 선택하라.'], 'lore/meta'],
    ['이름 노출: 변장이 풀림', ['나레이션', '후드 아래로 은발이 쏟아졌다.'], 'beat/exposed'],
  ] as const)('%s', (_name, line, rule) => {
    expect(hard(out([...line]))).toContain(rule);
  });

  test('같은 말 반복: 이번 판에 같은 화자가 한 말은 문장부호만 달라도 막는다', () => {
    expect(hard(out(['남자', '하, 웃기는 여자군!']), options({ spoken: { 남자: ['하. 웃기는 여자군.'] } }))).toContain('beat/repeat_play');
  });

  test('원작 미래 기억: 다음 장면의 원작 대사를 앞당기면 막는다', () => {
    const reserved = [{ text: '바로 죽일까 했는데, 마음이 바뀌었다.', future: true }].map((r) => ({ ...r, norm: normalizeKo(r.text) }));
    expect(hard(out(['남자', '…바로 죽일까 했는데, 마음이 바뀌었다.']), options({ reserved }))).toContain('beat/reserved_line');
  });

  test('프롬프트에도 바깥 이야기와 정체 금지가 적혀 있다', () => {
    const user = buildTalkUser({ scenario, beat, free, state: fresh, text: '당신 누구예요?' }, '', 2, 100);
    expect(user).toContain('정체를 밝히는 답은 하지 않는다');
    expect(user).toContain('이 세계에 없는 말(현대 물건, 게임 바깥 낱말)은 인물이 뜻을 모른다');
  });
});

describe('고친 검사 버그', () => {
  test('여우(GM) 줄의 존댓말 끝(~요, ~죠)을 막는다. 반말 "~니까."와 낱말 "필요"는 막지 않는다', () => {
    expect(hard(out(['GM', '여긴 죽음의 사막 지르다예요.']))).toContain('lore/gm_voice');
    expect(hard(out(['GM', '그건 아직 몰라요.']))).toContain('lore/gm_voice');
    expect(hard(out(['GM', '적국 땅이라 그렇죠.']))).toContain('lore/gm_voice');
    expect(rules(out(['GM', '적국 땅이니까. 들키면 무사하지 못해.']))).not.toContain('lore/gm_voice');
    expect(rules(out(['GM', '지금은 물이 제일 필요.']))).not.toContain('lore/gm_voice');
    expect(rules(out(['GM', '그건 강요.']))).not.toContain('lore/gm_voice');
    // 여우가 따옴표로 인용한 남의 말은 여우 말투가 아니다. 줄 전체가 따옴표면 그 안을 본다.
    expect(rules(out(['GM', '이렇게 말해 봐. "살려 주세요."']))).not.toContain('lore/gm_voice');
    expect(rules(out(['GM', '그 남자가 "왜요?"래.']))).not.toContain('lore/gm_voice');
    expect(hard(out(['GM', '"여긴 사막입니다."']))).toContain('lore/gm_voice');
  });

  test('두 낱말에 걸친 우연을 금지어로 보지 않는다(자 해 → 자해, 일 본 → 일본, 작은 발 → 은발)', () => {
    expect(rules(out(['속마음', '자 해보자!']))).not.toContain('rating/harm');
    expect(rules(out(['나레이션', '이런 일 본 적 없었다.']))).not.toContain('lore/realworld');
    expect(rules(out(['나레이션', '물 한 국자를 겨우 넘겼다.']))).not.toContain('lore/realworld');
    expect(rules(out(['나레이션', '모래 위에 작은 발자국이 찍혀 있었다.']))).not.toContain('beat/exposed');
    // 붙여 쓴 낱말과 세 글자 이상 낱말은 그대로 막는다.
    expect(hard(out(['나레이션', '자해라도 할 기세였다.']))).toContain('rating/harm');
    expect(hard(out(['속마음', '일본에 가고 싶다.']))).toContain('lore/realworld');
    expect(hard(out(['남자', '베 히 다 트.']))).toContain('lore/spoilers');
    expect(forbiddenIn('국 왕창', '국왕')).toBe(false);
    expect(forbiddenIn('스마트 폰', '스마트폰')).toBe(true);
  });

  test('등급 낱말(욕·선정·잔혹·자해)은 띄어 써도 막는다. 입력도 같다', () => {
    for (const text of ['섹 스 하자', '자 살 할래', '강 간', '알 몸이 된다', '참 수 한다', '마 약을 먹는다', '고 문 한다', '시 발 꺼져']) {
      expect(ruleInterpret(free, text, [], lore)).toMatchObject({ kind: 'deflect' });
    }
    expect(hard(out(['나레이션', '알 몸이 드러났다.']))).toContain('rating/sexual');
    expect(hard(out(['속마음', '차라리 자 살이라도…']))).toContain('rating/harm');
    expect(hard(out(['남자', '병 신 같은 소리.']))).toContain('rating/profanity');
  });

  test('입력 해석도 "자 해볼까"를 등급 밖으로 돌리지 않는다', () => {
    expect(ruleInterpret(free, '자 해볼까', [], lore).kind).not.toBe('deflect');
    expect(ruleInterpret(free, '자해할 거야', [], lore)).toMatchObject({ kind: 'deflect' });
    expect(ruleInterpret(free, '자, 해 봐요', [], lore).kind).not.toBe('deflect');
  });

  test('스포일러는 이번 입력에 든 말만 면제한다. 지난 입력(said)과 해석 요약(deed)으로 풀리지 않는다', () => {
    const line = out(['남자', '그래, 내가 베히다트다.']);
    // 끼어들기로 들어간 "베히다트 맞죠?"가 said 에 남아 다음 턴 playerText 에 섞인 경우.
    expect(hard(line, options({ input: '당신 누구예요?', playerText: '당신 누구예요? 베히다트 맞죠?' }))).toContain('lore/spoilers');
    expect(hard(out(['남자', '폐하라고? 제법 눈치가 빠르군.']), options({ input: '무릎을 꿇는다', playerText: '무릎을 꿇는다 폐하께 하듯 무릎을 꿇고 절했다', deed: '폐하께 하듯 무릎을 꿇고 절했다' }))).toContain('lore/spoilers');
    // 이번 입력에 그 말이 있으면 인물이 되받는 것은 그대로 허락한다(설계).
    expect(hard(line, options({ input: '베히다트 맞죠?', playerText: '베히다트 맞죠?' }))).not.toContain('lore/spoilers');
  });

  test('변장 노출 말도 지난 입력·해석 요약으로 면제되지 않는다', () => {
    expect(hard(out(['나레이션', '후드 아래로 은발이 쏟아졌다.']), options({ input: '칼 치워요', playerText: '칼 치워요 전 은발도 아니고 그냥 여행자예요' }))).toContain('beat/exposed');
    expect(hard(out(['나레이션', '귀찌가 빠져 모래 위로 굴렀다.']), options({ input: '귀를 감싼다', playerText: '귀를 감싼다 귀찌가 빠지지 않게 귀를 감쌌다', deed: '귀찌가 빠지지 않게 귀를 감쌌다' }))).toContain('beat/exposed');
    expect(hard(out(['남자', '은발? 무슨 헛소리지.']), options({ input: '제가 은발이면 어쩔 건데요?', playerText: '제가 은발이면 어쩔 건데요?' }))).not.toContain('beat/exposed');
  });

  test('한 답 안의 같은 말은 문장부호가 달라도 되풀이로 보고, 뒤의 줄은 화면에 내지 않는다', () => {
    const res = validateOutput(out(['남자', '하. 웃기는 여자군.'], ['남자', '하, 웃기는 여자군!']), options());
    expect(res.violations.map((v) => v.rule)).toContain('repeat');
    expect(res.lines.map((l) => l.text)).toEqual(['하. 웃기는 여자군.']);
    // polish 가 앞의 "하."를 지우면 같은 줄이 되므로 이것도 같은 말이다.
    const ha = validateOutput(out(['남자', '하. 웃기는 여자군.'], ['남자', '웃기는 여자군.']), options());
    expect(ha.lines.map((l) => l.text)).toEqual(['하. 웃기는 여자군.']);
  });

  test('"하."를 떼고 다시 쓴 지난 말과 원작 줄도 같은 말로 본다(polish 가 "하."를 지우므로)', () => {
    expect(hard(out(['남자', '하. 그 입은 쉬지를 않는군.']), options({ spoken: { 남자: ['그 입은 쉬지를 않는군.'] } }))).toContain('beat/repeat_play');
    expect(hard(out(['남자', '그 입은 쉬지를 않는군.']), options({ spoken: { 남자: ['하. 그 입은 쉬지를 않는군.'] } }))).toContain('beat/repeat_play');
    const reserved = [{ text: '하. 웃기는 여자군.', future: true }].map((r) => ({ ...r, norm: normalizeKo(r.text) }));
    expect(hard(out(['남자', '웃기는 여자군.']), options({ reserved }))).toContain('beat/reserved_line');
    // "하."뿐인 짧은 반응도 되풀이는 막는다.
    expect(hard(out(['남자', '하.']), options({ spoken: { 남자: ['하…'] } }))).toContain('beat/repeat_play');
    // "하늘" 같은 낱말 앞머리는 떼지 않는다.
    expect(hard(out(['나레이션', '하늘이 붉었다.']), options({ spoken: { 나레이션: ['늘이 붉었다.'] } }))).not.toContain('beat/repeat_play');
  });

  test('다섯 글자보다 짧은 곧 나올 줄("여자.")은 줄 전체가 같을 때만 앞당김으로 본다', () => {
    const reserved = [{ text: '여자.', future: true }].map((r) => ({ ...r, norm: normalizeKo(r.text) }));
    expect(hard(out(['남자', '입을 닫아라, 여자.']), options({ reserved }))).not.toContain('beat/reserved_line');
    expect(hard(out(['남자', '여자.']), options({ reserved }))).toContain('beat/reserved_line');
  });
});

describe('프롬프트와 검사의 어긋남', () => {
  test('검사가 막는 나레이션·속마음의 지난 말도 프롬프트의 "이미 한 말"에 적는다(전에는 인물 대사만 적어 다시 쓰기 한 번을 날렸다)', () => {
    const state = { ...fresh, spoken: { 나레이션: ['칼끝이 멈췄다.'], 속마음: ['살았다…!!'], 남자: ['왜지?'], GM: ['와, 그걸 진짜 하네.'] } };
    const user = buildTalkUser({ scenario, beat, free, state, text: '억울해요!' }, '', 2, 100);
    const rule = user.split('\n').find((l) => l.includes('이번 판에 이미 한 말')) ?? '';
    expect(rule).toContain('"칼끝이 멈췄다."');
    expect(rule).toContain('"살았다…!!"');
    expect(rule).toContain('"왜지?"');
    expect(rule).not.toContain('그걸 진짜 하네');
  });
});

describe('고친 대체 문구(모델 없음·끝내 실패)', () => {
  const gm = new LocalGm(null, rawLore);
  const ctxWith = (state: Partial<GameState>, extra: Partial<GmContext> = {}): GmContext => ({ scenario, beat, free, state: { ...fresh, ...state }, text: '닥쳐 씨발', ...extra });
  const texts = (ls: readonly Line[]) => ls.map((l) => l.text);

  test('두 줄짜리 돌려 막기 묶음이 턴마다 번갈아 나온다(전에는 늘 같은 줄)', async () => {
    const first = await gm.talk(ctxWith({ free: { beat: beat.id, talks: 0, rolls: 0 }, said: ['a'] }, { tone: 'deflect' }));
    const second = await gm.talk(ctxWith({ free: { beat: beat.id, talks: 1, rolls: 0 }, said: ['a', 'b'] }, { tone: 'deflect' }));
    expect(texts(first.lines)).not.toEqual(texts(second.lines));
  });

  test('이번 판에 그 인물이 이미 한 대체 줄은 남은 줄이 있는 동안 다시 고르지 않는다', async () => {
    const pool = free.deflect.map((l) => l.text);
    for (const talks of [0, 1, 2, 3]) {
      const reply = await gm.talk(ctxWith({ free: { beat: beat.id, talks, rolls: 0 }, spoken: { 남자: [pool[0] ?? ''] } }, { tone: 'deflect' }));
      expect(texts(reply.lines)).toEqual([pool[1] ?? '']);
    }
  });

  test('묶음을 다 쓴 뒤에는 가장 오래전에 한 줄을 고른다(같은 입력 되풀이로 talks 가 2씩 뛰거나 그대로여도 한 줄에 갇히지 않는다)', async () => {
    const [a, b] = free.deflect.map((l) => l.text);
    if (!a || !b) throw new Error('b05_why 돌려 막기 줄이 둘이 아닙니다');
    for (const talks of [2, 4, 6]) {
      const afterB = await gm.talk(ctxWith({ free: { beat: beat.id, talks, rolls: 0 }, spoken: { 남자: [a, b] } }, { tone: 'deflect' }));
      expect(texts(afterB.lines)).toEqual([a]);
      const afterA = await gm.talk(ctxWith({ free: { beat: beat.id, talks, rolls: 0 }, spoken: { 남자: [b, a] } }, { tone: 'deflect' }));
      expect(texts(afterA.lines)).toEqual([b]);
    }
  });

  test('여우 한마디 대체 줄도 이미 한 말은 피한다', async () => {
    for (const said of rawLore.gmQuips) {
      const reply = await gm.quip(ctxWith({ spoken: { GM: [said] } }, { text: '모래성을 쌓는다' }));
      expect(texts(reply.lines)).not.toContain(said);
    }
  });

  test('해석 요약(deed)에 세계 밖 물건·스포일러가 들었으면 그 요약을 검사 없이 화면에 내지 않는다', async () => {
    const approach = free.approaches.find((a) => a.id === 'plead');
    if (!approach) throw new Error('plead 가 없습니다');
    const narrate = (deed: string, tier: Tier = 'hit'): NarrateContext => ({
      ...ctxWith({}, { text: '꺼낸다' }),
      approach,
      roll: { label: approach.label, stat: approach.stat, statValue: 2, mods: [], dice: [5, 5], total: 12, tier },
      outcome: approach.outcomes[tier],
      improv: { deed, absurd: false, bold: false },
      deed,
    });
    const bad = await gm.narrate(narrate('휴대폰을 꺼내 들었다'));
    expect(texts(bad.lines).join(' ')).not.toContain('휴대폰');
    const spoiler = await gm.narrate(narrate('베히다트에게 절을 했다'));
    expect(texts(spoiler.lines).join(' ')).not.toContain('베히다트');
    const ok = await gm.narrate(narrate('모래를 한 줌 집어 던졌다'));
    expect(texts(ok.lines)[0]).toBe('모래를 한 줌 집어 던졌다.');
  });

  test('입력 가림(screen)도 두 낱말에 걸친 우연으로 스포일러를 잡지 않는다', () => {
    const at = (text: string) => ({ scenario, beat, free, state: fresh, text });
    expect(gm.screen(at('국 왕창 먹고 싶어요'))).toBeNull();
    expect(gm.screen(at('왕 이야기 좀 해 줘요'))).not.toBeNull(); // '왕이야'는 세 글자라 띄어 써도 걸린다(알려진 오탐).
    expect(gm.screen(at('베히다트 맞죠?'))).toMatchObject({ reason: 'unknown', term: '베히다트' });
  });
});

describe('알려진 빈틈(지금 동작). 고치면 기대를 뒤집고 문서 표를 고친다', () => {
  test.each([
    ['프롬프트 숨은 설정의 낱말 "사막 대국의 왕"', ['나레이션', '사막 대국의 왕이 내 앞에 서 있었다.']],
    ['칭호 활용 "왕인가"', ['속마음', '설마 이 사람, 왕인가?']],
    ['칭호 바꿔 말하기 "임금"', ['남자', '나는 이 땅의 임금이다.']],
    ['가운뎃점으로 쪼갠 이름', ['나레이션', '베히·다트라는 이름이 떠올랐다.']],
    ['변장 노출 활용 "귀찌를 빼냈다"', ['나레이션', '귀찌를 빼냈다.']],
    ['변장 노출 바꿔 말하기 "은빛으로"', ['나레이션', '머리카락이 은빛으로 물들었다.']],
    ['현대 물건 합성어 "총구"', ['나레이션', '모래 속에서 총구가 번뜩였다.']],
    ['현대 물건 "라이터"', ['속마음', '라이터라도 있었으면.']],
    ['현실 종교 "하나님"', ['속마음', '하나님, 살려 주세요.']],
    ['바깥 낱말 "게임"', ['속마음', '이건 게임이 아니야.']],
    ['바깥 낱말 "선택지"', ['나레이션', '내게 남은 선택지는 둘뿐이었다.']],
    ['3인칭 내레이션 "아시나도"', ['나레이션', '아시나도 모르게 숨을 삼켰다.']],
  ] as const)('빠져나감: %s', (_name, line) => {
    const v = validateOutput(out([...line]), options()).violations.filter((x) => x.kind !== 'format');
    expect(v).toEqual([]);
  });

  test.each([
    ['"왕 이야기" → 왕이야', ['나레이션', '그 왕 이야기는 들은 적이 없었다.'], 'lore/spoilers'],
    ['"모래가 버스럭" → 버스', ['나레이션', '모래가 버스럭거렸다.'], 'lore/modern'],
    ['"이 세계에서" → 이 세계', ['나레이션', '이 세계에서 가장 뜨거운 곳이었다.'], 'lore/meta'],
    ['"황폐하기" → 폐하', ['나레이션', '모래 언덕은 황폐하기 그지없었다.'], 'lore/spoilers'],
  ] as const)('오탐: %s', (_name, line, rule) => {
    expect(hard(out([...line]))).toContain(rule);
  });

  test('같은 말에 한 낱말만 더하면(정말) 이번 판 반복 검사를 빠져나간다', () => {
    expect(rules(out(['남자', '정말 웃기는 여자군.']), options({ spoken: { 남자: ['웃기는 여자군.'] } }))).not.toContain('beat/repeat_play');
  });

  test('판정 실패인데 "통했다"로 쓰면 결과 반대 검사를 빠져나간다', () => {
    expect(rules(out(['나레이션', '거짓말이 통했다.']), options({ tier: 'miss' }))).not.toContain('beat/tier_mismatch');
  });
});
