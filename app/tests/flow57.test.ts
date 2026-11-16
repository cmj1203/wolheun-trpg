import { expect, test } from 'bun:test';
import { Engine, type GmPort } from '../src/engine/engine.ts';
import { roll2d6 } from '../src/engine/dice.ts';
import { actClauses, isLinkedAct } from '../src/engine/text.ts';
import type { GameState, Step, Tier } from '../src/engine/types.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { LlmClient, type ChatRequest, type LlmResult } from '../src/gm/llm.ts';
import { ATTEMPT_CHECK_SYSTEM, CHANGE_SYSTEM } from '../src/gm/prompt.ts';
import { FakeGm, META, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const lines = (step: Step) => step.events.flatMap((e) => e.type === 'line' ? [e.text] : []);
function at(beat: string, gm: GmPort = new FakeGm(), seed = 1) {
  const engine = new Engine(scenario, gm);
  const base = engine.newGame(seed, `flow57-${beat}`).state;
  const state: GameState = { ...base, rng: seed, beat, ending: null, free: { beat, talks: 0, rolls: 0 },
    tracks: { ...base.tracks, 귀찌: 8, 의심: 0, 체력: 5, 정신력: 5 },
    flags: { ...base.flags, 경고_spy_cut: true } };
  return { engine, state };
}
function seedFor(tier: Tier, stat = 1): number {
  for (let seed = 1; seed < 1000; seed++) if (roll2d6(seed, '검사', '재치', stat, []).roll.tier === tier) return seed;
  throw new Error(`시드 없음: ${tier}`);
}

test('F01: 정식 spy 직전 의심 10은 spy_cut으로 정산한다', async () => {
  const { engine, state } = at('r2_bind', new FakeGm(), seedFor('miss', 1));
  state.tracks.의심 = 9;
  const r = await engine.act(state, { type: 'approach', id: 'cover' });
  expect(r.state.ending).toBe('spy_cut');
  expect(r.state.tracks.의심).toBe(10);
  expect(lines(r.step)).not.toContain('거친 밧줄이 손목을 파고들었다. 마법 가방까지 빼앗기는 걸 보면서, 나는 정신을 잃었다.');
});

test('F02: 가방 압수는 수납된 지도만 함께 없애고 어깨의 가방을 다시 보여주지 않는다', async () => {
  for (const drawn of [false, true]) {
    let checked = false;
    for (let seed = 1; seed < 150 && !checked; seed++) {
      const { engine, state } = at('b05_why', new FakeGm(() => ({
        kind: 'improv', label: '가방 방어', stat: '손재주', difficulty: 0, absurd: false, bold: false,
        target: 'local', deed: '가방을 방패처럼 휘두른다', source: 'llm', meta: META,
      })), seed);
      state.flags.지도_꺼냄 = drawn;
      const r = await engine.act(state, { type: 'free', text: '(가방을 방패처럼 휘두른다)' });
      if (!r.step.events.some((e) => e.type === 'price' && e.id === 'bag_taken')) continue;
      checked = true;
      expect(r.state.items).not.toContain('magic_bag');
      expect(r.state.items.includes('map')).toBe(drawn);
      expect(lines(r.step).some((s) => s.includes('어깨의 가방'))).toBe(false);
    }
    expect(checked).toBe(true);
  }
});

test('F03: 가방 방어의 끊긴 끈은 다시 끊어지지 않으며 두 상태가 보존된다', async () => {
  for (const broken of [false, true]) {
    const { engine, state } = at('b06_swing', new FakeGm(), seedFor('mixed', 1));
    state.flags.가방_끈 = broken;
    const r = await engine.act(state, { type: 'approach', id: 'block' });
    expect(r.state.flags.가방_끈).toBe(true);
    expect(r.state.flags.짐_쏟음).toBe(true);
    expect(lines(r.step).some((s) => s.includes('가방끈이 끊어지며'))).toBe(!broken);
  }
});

test('F04: 다른 경로는 칼 CG 직전에 벗겨지고 미인계 후에는 반복하지 않는다', () => {
  for (const hoodOff of [false, true]) {
    const prepared = { ...scenario, start: 'b06_swing', sheet: { ...scenario.sheet, tracks: { ...scenario.sheet.tracks, 귀찌: 8 } } };
    const engine = new Engine(prepared, new FakeGm());
    // 이미 벗은 경로는 재개 시 현재 조건만 적용한다.
    if (hoodOff) {
      const { state } = at('b06_swing');
      state.flags.후드_벗음 = true;
      expect(lines(engine.resume(state))).not.toContain('그 바람에 후드가 벗겨졌다.');
    } else {
      const r = engine.newGame(1, 'hood57');
      const shown = lines(r.step);
      expect(shown.indexOf('그 바람에 후드가 벗겨졌다.')).toBeLessThan(shown.indexOf('미친―! 피해야 돼!!'));
      expect(r.state.flags.후드_벗음).toBe(true);
    }
  }
});

for (const beat of ['r4_prove', 'r5_claim']) {
  test(`F05·F10: ${beat} 말 없는 새 행동은 발화 대가 없이 판단 전환 뒤 진행한다`, async () => {
    const gm = new FakeGm((ctx) => ({ kind: 'improv', stat: '재치', difficulty: 0, label: '즉흥 행동', absurd: false, bold: false,
      target: 'local', deed: ctx.input?.kind === 'valid' ? ctx.input.action : ctx.text, source: 'rule', meta: META }));
    for (const text of ['(모래에 동그라미를 그린다)', '(신발 끝으로 작은 삼각형을 새긴다)']) {
      const { engine, state } = at(beat, gm, seedFor('mixed'));
      const r = await engine.act(state, { type: 'free', text });
      expect(r.step.events.some((e) => e.type === 'price' && ['half_heard', 'sand_edge', 'name_slip'].includes(e.id))).toBe(false);
      expect(lines(r.step)).toContain(beat === 'r4_prove' ? '값은 크라차에서 매기지.' : '진짜라면 쓸모가 있다. 가짜라면 그때 베면 된다.');
      expect(r.state.ending).toBe(beat === 'r4_prove' ? 'deal' : 'value');
    }
  });
}

test('F06: 지도 꺼내기와 함께 말한 신분은 소지품 판정에도 남는다', async () => {
  const text = '나는 웰든 공녀예요. (가방에서 지도를 꺼내 보여 준다)';
  class MapReadingClient extends LlmClient {
    override async chatJson(request: ChatRequest): Promise<LlmResult> {
      const primary = {
        reason: '지도를 꺼내 보이며 신분을 밝힌다', kind: 'action', about: 'none', risk: 'identity',
        approach: 'bag', target: 'bag', scope: 'ready', item: 'magic_bag',
        label: '지도 보이기', deed: '가방에서 지도를 꺼내 보였다', stat: '손재주', difficulty: '보통',
        odd: false, absurd: false, bold: false,
      };
      const body = request.system === ATTEMPT_CHECK_SYSTEM ? { supported: true }
        : request.system === CHANGE_SYSTEM ? (isLinkedAct(text)
          ? { changes: actClauses(text).map(() => '물건을 잡거나 씀') } : { change: '물건을 잡거나 씀' })
        : primary;
      return { text: JSON.stringify(body), ttftMs: 0, totalMs: 0, promptTokens: 0,
        completionTokens: 0, promptMs: 0, genMs: 0, model: 'flow57-map-fixture' };
    }
  }
  const actual = new LocalGm(new MapReadingClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 1 }), lore);
  const fake = new FakeGm();
  const { engine, state } = at('b05_why', {
    prepare: (ctx) => actual.prepare(ctx), screen: (ctx) => actual.screen(ctx),
    interpret: (ctx) => actual.interpret(ctx), talk: (ctx) => fake.talk(ctx),
    narrate: (ctx) => fake.narrate(ctx), explain: (ctx) => fake.explain(ctx),
  });
  const r = await engine.act(state, { type: 'free', text });
  expect(r.state.flags.신분_노출).toBe(true);
  expect(r.state.log.some((e) => e.kind === 'input' && e.approach === 'bag')).toBe(true);
  expect(lines(r.step)).not.toContain('마법 가방이라. 떠돌이치고는 귀한 걸 지녔군.');
});

test('F06: 행동 해석이 신분 위험을 빼먹어도 실제 공개 사건은 별도로 적용한다', async () => {
  for (const [text, claimed] of [
    ['나는 웰든 공녀예요. (가방에서 지도를 꺼내 보여 준다)', true],
    ['(가방에서 웰든의 지도를 꺼내 보여 준다)', false],
  ] as const) {
    const { engine, state } = at('b05_why', new FakeGm(() => ({ kind: 'approach', approach: 'bag',
      item: 'magic_bag', spoken: false, source: 'llm', meta: META })));
    const r = await engine.act(state, { type: 'free', text });
    expect(r.state.flags.신분_노출 === true).toBe(claimed);
    expect(r.state.log.some((e) => e.kind === 'input' && e.approach === 'bag')).toBe(true);
  }
});

for (const text of ['나는 웰든 공녀가 아니에요', '제가 웰든 공녀인가요?', '(속으로 내가 공녀였다는 사실을 떠올린다)']) {
  test(`F07: 공개가 아닌 입력에 신분 효과가 없다: ${text}`, async () => {
    const { engine, state } = at('b05_why', new LocalGm(null, lore));
    const r = await engine.act(state, { type: 'free', text });
    expect(r.state.flags.신분_노출).toBeUndefined();
    expect(r.state.beat).not.toBe('r5_claim');
  });
}

for (const text of ['(미소녀라고 말하지 않는다)', '나는 미소녀가 아니에요', '(속으로 미소녀라고 생각한다)', '(그가 미소녀라고 말했다고 적는다)']) {
  test(`F08: 긍정 발화가 아닌 입력은 주장과 콜백 기억에 남지 않는다: ${text}`, async () => {
    const { engine, state } = at('b05_why', new LocalGm(null, lore));
    const r = await engine.act(state, { type: 'free', text });
    expect(r.state.flags.미소녀).toBeUndefined();
    expect(r.state.said).toEqual([]);
  });
}

test('F08: 새 질문이나 취소한 말 없는 행동이 이전의 실제 발화 기억을 지우지 않는다', async () => {
  const asked = at('b05_why', new FakeGm(() => ({ kind: 'ask', game: 'play', source: 'rule', meta: META })));
  asked.state.said = ['전 상인이에요'];
  const r = await asked.engine.act(asked.state, { type: 'free', text: '판정은 어떻게 하나요?' });
  expect(r.state.said).toEqual(['전 상인이에요']);
  const card = at('b05_why', new FakeGm(() => ({ kind: 'improv', stat: '재치', difficulty: 0,
    label: '즉흥 행동', absurd: false, bold: true, target: 'local', deed: '모래 위에 원을 그렸다', source: 'rule', meta: META })));
  card.state.said = ['전 상인이에요'];
  const pending = await card.engine.act(card.state, { type: 'free', text: '(검지로 둥근 원을 그린다)' });
  expect(pending.state.pendingIntent).toBeDefined();
  const cancelled = await card.engine.act(pending.state, { type: 'confirm', ok: false });
  expect(cancelled.state.said).toEqual(['전 상인이에요']);
});

test('F11·F12: 포박 명령은 심문 전에 한 번이며 답할 수 없는 질문은 없다', async () => {
  const start = new Engine({ ...scenario, start: 'r2_bind' }, new FakeGm());
  const opening = start.newGame(1, 'bind57');
  expect(opening.state.flags.포박).toBe(true);
  expect(lines(opening.step).indexOf('묶어라. 수상한 짓을 하면 그 자리에서 베어도 좋다.')).toBeLessThan(lines(opening.step).indexOf('어디서 왔고, 누가 보냈지?'));
  const { engine, state } = at('r2_bind', new FakeGm(), seedFor('mixed'));
  state.flags.포박 = true;
  const r = await engine.act(state, { type: 'approach', id: 'cover' });
  expect(lines(r.step)).not.toContain('그 친척의 이름은?');
  expect(lines(r.step)).not.toContain('묶어라. 수상한 짓을 하면 그 자리에서 베어도 좋다.');
});

test('F09·F18: 거듭 대화해도 수락 처리가 없는 물과 지도 기회를 약속하지 않는다', async () => {
  for (const beat of ['b02_people', 'b08_gaze']) {
    const { engine, state } = at(beat);
    let current = state;
    const shown: string[] = [];
    for (const text of ['저기요', '잠시만요', '잘 들었어요', '알겠어요', '기다려 주세요']) {
      if (current.beat !== beat) break;
      const r = await engine.act(current, { type: 'free', text });
      current = r.state;
      shown.push(...lines(r.step));
    }
    expect(current.flags.기회_물).toBeUndefined();
    expect(shown.some((s) => /다가가면 받을 수|지도는 돌아오지 않을/.test(s))).toBe(false);
  }
});

test('F13·F14: 밤의 실패에는 뜨거운 모래가 없고 잠든 뒤 일몰로 돌아가지 않는다', async () => {
  const gm = new FakeGm(() => ({ kind: 'idle', source: 'rule', meta: META }));
  const idle = at('r3_dusk', gm);
  expect(lines((await idle.engine.act(idle.state, { type: 'free', text: '(가만히 있는다)' })).step).some((s) => s.includes('뜨거운 모래'))).toBe(false);
  const shelter = at('r3_dusk', new FakeGm(), seedFor('mixed'));
  const r = await shelter.engine.act(shelter.state, { type: 'approach', id: 'shelter' });
  expect(r.state.flags.밤).toBe(true);
  expect(lines(r.step)).toContain('잠깐 눈을 감았을 뿐인데, 달이 한참이나 옮겨 가 있었다.');
  expect(lines(r.step).some((s) => /밤이 가깝다|뜰 무렵|내려앉을 무렵/.test(s))).toBe(false);
});

test('F15: 이미 뽑힌 칼을 뽑지 않았다고 서술하지 않는다', async () => {
  const { engine, state } = at('r4_prove', new FakeGm(), seedFor('mixed', 2));
  state.flags.칼끝_만남 = true;
  const r = await engine.act(state, { type: 'approach', id: 'charm' });
  expect(r.step.events.find(e => e.type === 'roll')).toMatchObject({ tier: 'mixed' });
  expect(r.state.flags.칼끝_만남).toBe(true);
  expect(r.state.flags.쓸모_내세움).toBe(true);
  expect(r.state.tracks.집착).toBe(state.tracks.집착 + 1);
  expect(r.state.ending).toBe('deal');
  expect(r.step.events.filter(e => e.type === 'price')).toMatchObject([{ id: 'guard_scoff' }]);
  expect(r.state.tracks.정신력).toBe(state.tracks.정신력 - 1);
  expect(r.state.tracks.의심).toBe(state.tracks.의심 + 1);
  const nextScene = r.step.events.findIndex(e => e.type === 'scene');
  const shown = nextScene < 0 ? r.step.events : r.step.events.slice(0, nextScene);
  expect(shown.some(e => e.type === 'line' && e.style === 'speech' && e.text.trim().length > 0)).toBe(true);
  expect(shown.filter(e => e.type === 'line').every(e => e.text.trim().length > 0)).toBe(true);
  expect(lines(r.step).some(s => /(?:칼|곡도)(?:을|를)?\s*(?:다시\s*)?(?:뽑|빼\s*들)/u.test(s))).toBe(false);
});

test('F16·F17: 재개는 조건을 거르고 효과를 다시 적용하지 않으며 밤에는 햇빛이 없다', () => {
  for (const noble of [false, true]) {
    const { engine, state } = at('e_value');
    state.ending = 'value';
    state.flags.신분_고집 = noble;
    const before = structuredClone(state);
    const shown = lines(engine.resume(state));
    expect(shown.includes('데려가라. 귀한 몸이라니, 귀하게 모셔야지.')).toBe(noble);
    expect(shown.includes('데려가라. 값은 크라차에서 매기지.')).toBe(!noble);
    expect(state).toEqual(before);
  }
  const { engine, state } = at('x_unmasked');
  state.ending = 'unmasked';
  state.flags.밤 = true;
  expect(lines(engine.resume(state))).toContain('귓불에서 마지막 온기가 빠져나갔다.');
  expect(lines(engine.resume(state)).some((s) => s.includes('햇빛'))).toBe(false);
});
