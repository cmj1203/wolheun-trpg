import { expect, test } from 'bun:test';
import { Engine, noteFlag, type GmContext } from '../src/engine/engine.ts';
import { buildSystem } from '../src/gm/prompt.ts';
import { loreFor } from '../src/gm/lore.ts';
import { FakeGm, META, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const question = '혹시 크라차까지 가는 길을 아시나요?';

for (const path of ['run', 'watch']) {
  test(`${path}: 크라차 질문 뒤 의심이 오르고 칼이 나온다`, async () => {
    const engine = new Engine(scenario, new FakeGm());
    const fresh = engine.newGame(1, `kracha-${path}`).state;
    const state = { ...fresh, flags: { ...fresh.flags, [noteFlag('man')]: true } };
    const { step } = await engine.act(state, { type: 'approach', id: path });
    const questionIndex = step.events.findIndex((e) => e.type === 'line' && e.text === question);
    const bladeIndex = step.events.findIndex((e) => e.type === 'scene' && e.beat === 'b04_blade');
    expect(questionIndex).toBeGreaterThanOrEqual(0);
    expect(bladeIndex).toBeGreaterThan(questionIndex);
    expect(step.events.filter((e) => e.type === 'line' && e.text === question)).toHaveLength(1);
    const between = step.events.slice(questionIndex + 1, bladeIndex);
    expect(between).toContainEqual({ type: 'change', parts: [
      { text: '의심 +1', tone: 'bad' },
      { text: '크라차까지 가는 길을 물음', tone: 'warm' },
    ] });
    expect(between.some((e) => e.type === 'line' && e.text === '그저 길을 물어봤을 뿐이었다.')).toBe(true);
    expect(step.events.slice(0, questionIndex).some((e) => e.type === 'line' && e.text === '정말이지 난')).toBe(true);
  });
}

test.each(['hit', 'mixed'] as const)('avoid %s: 피해 가는 목표를 이루고 질문·칼 경로로 돌아가지 않는다', async (tier) => {
  let found = false;
  for (let seed = 1; seed <= 100 && !found; seed++) {
    const engine = new Engine(scenario, new FakeGm());
    const fresh = engine.newGame(seed, `kracha-avoid-${tier}`).state;
    const { state, step } = await engine.act(fresh, { type: 'approach', id: 'avoid' });
    const roll = step.events.find((e) => e.type === 'roll');
    if (roll?.type !== 'roll' || roll.tier !== tier) continue;
    found = true;
    const scenes = step.events.flatMap((e) => e.type === 'scene' ? [e.beat] : []);
    expect(scenes).toContain('r3_slip');
    expect(scenes).not.toContain('b03_ask');
    expect(scenes).not.toContain('b03_met');
    expect(scenes).not.toContain('b04_blade');
    expect(state.flags.도주).toBe(true);
    expect(state.flags.다가감).toBeUndefined();
    expect(state.flags.길_물음).toBeUndefined();
    expect(state.tracks.탈주).toBeGreaterThan(fresh.tracks.탈주 ?? 0);
    expect(step.events.some((e) => e.type === 'line' && e.text === question)).toBe(false);
    expect(step.events.some((e) => e.type === 'line' && e.text === '그저 길을 물어봤을 뿐이었다.')).toBe(false);
    if (tier === 'mixed') {
      expect(step.events.some((e) => e.type === 'price')).toBe(true);
      expect(state.tracks.정신력).toBeLessThan(fresh.tracks.정신력 ?? 0);
    } else {
      expect(step.events.some((e) => e.type === 'price')).toBe(false);
    }
  }
  expect(found).toBe(true);
});

// 61차: 다가가거나 길을 묻지 않은 판은 b03_met 으로 간다. 끌려 나와도 아시나가 먼저 길을 물었다고 전제하지 않는다.
test('머뭇거리다 상대가 먼저 다가온 판은 길을 물었다고 전제하지 않는다', async () => {
  const engine = new Engine(scenario, new FakeGm(() => ({ kind: 'idle', source: 'llm', meta: META })));
  let { state, step } = engine.newGame(1, 'kracha-met');
  const events = [...step.events];
  for (let i = 0; i < 4 && state.beat === 'b02_people'; i++) {
    ({ state, step } = await engine.act(state, { type: 'free', text: '(가만히 서 있는다)' }));
    events.push(...step.events);
  }
  const scenes = events.flatMap((e) => (e.type === 'scene' ? [e.beat] : []));
  const lines = events.flatMap((e) => (e.type === 'line' ? [e.text] : []));
  expect(scenes).toContain('b03_met');
  expect(scenes).not.toContain('b03_ask');
  expect(lines.some((line) => line.includes('호위 하나가 내 팔을 붙잡아'))).toBe(true);
  expect(lines).not.toContain(question);
  expect(lines).not.toContain('그저 길을 물어봤을 뿐이었다.');
  expect(lines.some((line) => line.startsWith('크라차에 원수라도'))).toBe(false);
  expect(lines.some((line) => line.startsWith('말 한마디 안 했는데'))).toBe(true);
});

test('인물 수첩 공개 전 질문의 의심과 이유는 노출되지 않는다', async () => {
  const engine = new Engine(scenario, new FakeGm());
  const fresh = engine.newGame(1, 'kracha-hidden').state;
  const { step } = await engine.act(fresh, { type: 'approach', id: 'run' });
  const questionIndex = step.events.findIndex((e) => e.type === 'line' && e.text === question);
  const bladeIndex = step.events.findIndex((e) => e.type === 'scene' && e.beat === 'b04_blade');
  const between = step.events.slice(questionIndex + 1, bladeIndex);
  expect(between.some((e) => e.type === 'tracks' && e.changes.some((c) => c.key === '의심' && c.to - c.from === 1))).toBe(true);
  expect(between.some((e) => e.type === 'change')).toBe(false);
  expect(JSON.stringify(step.events)).not.toMatch(/첩자라고 의심|사실은 사막 대국의 왕|페샨|베히다트/);
});

test('끼어들어 이미 길을 물은 판은 질문을 되풀이하지 않는다', async () => {
  const engine = new Engine(scenario, new FakeGm());
  const fresh = engine.newGame(1, 'kracha-already').state;
  const state = { ...fresh, flags: { ...fresh.flags, 이미_길_물음: true } };
  const { step } = await engine.act(state, { type: 'approach', id: 'run' });
  expect(step.events.filter((e) => e.type === 'line' && e.text === question)).toHaveLength(0);
  expect(step.events.some((e) => e.type === 'line' && e.text === '그저 길을 물어봤을 뿐이었다.')).toBe(true);
});

test('첩자 의심 동기는 GM 문맥에만 있고 플레이어 수첩에는 없다', () => {
  const engine = new Engine(scenario, new FakeGm());
  const state = engine.newGame(1, 'kracha-context').state;
  const beat = scenario.beats.b05_why;
  if (!beat?.free) throw new Error('b05 대화 장면이 필요합니다');
  const ctx: GmContext = { scenario, state, beat, free: beat.free, text: '왜 나한테 칼을 겨눠?' };
  const system = buildSystem(ctx, loreFor(lore, state));
  expect(system).toContain('죽음의 사막을 혼자 건너 크라차로 가는 여자');
  expect(system).toContain('크롬웰의 첩자라고 의심');
  expect(system).toContain('남자는 "첩자"라는 말을 입 밖에 내지 않는다');
  expect(system).toContain('같은 판에서 이미 한 대사를 다시 쓰지 않는다');
  expect(JSON.stringify(engine.hud(state).notes)).not.toContain('첩자라고 의심');
});
