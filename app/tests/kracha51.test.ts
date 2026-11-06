import { expect, test } from 'bun:test';
import { Engine, noteFlag, type GmContext } from '../src/engine/engine.ts';
import { buildSystem } from '../src/gm/prompt.ts';
import { loreFor } from '../src/gm/lore.ts';
import { FakeGm, approachOf, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const question = '혹시 크라차까지 가는 길을 아시나요?';

for (const path of ['run', 'watch', 'avoid']) {
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

for (const [path, text] of [['watch', '모래 언덕 뒤에서 먼저 살핀다'], ['avoid', '몰래 돌아서 피해 간다']] as const) {
  test(`${path}: 말 없이 끌려와도 저기 다음에 크라차를 묻는다`, async () => {
    const engine = new Engine(scenario, new FakeGm(() => approachOf(path)));
    const { state } = engine.newGame(1, `kracha-dragged-${path}`);
    const { step } = await engine.act(state, { type: 'free', text });
    const lines = step.events.flatMap((e) => e.type === 'line' ? [e.text] : []);
    const dragged = lines.findIndex((line) => line.includes('호위 하나가 내 팔을 붙잡아'));
    expect(dragged).toBeGreaterThanOrEqual(0);
    expect(lines.indexOf('저… 저기…')).toBeGreaterThan(dragged);
    expect(lines.indexOf(question)).toBeGreaterThan(lines.indexOf('저… 저기…'));
    expect(lines).not.toContain('무슨 말을 꺼내기도 전이었다.');
  });
}

test('인물 수첩 공개 전 질문의 의심과 이유는 노출되지 않는다', async () => {
  const engine = new Engine(scenario, new FakeGm());
  const fresh = engine.newGame(1, 'kracha-hidden').state;
  const { step } = await engine.act(fresh, { type: 'approach', id: 'avoid' });
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
