import { describe, expect, test } from 'bun:test';
import { FALLBACK_INPUT, ROUTES } from '../e2e/routes.ts';
import { Engine, type GmContext, type Interpretation } from '../src/engine/engine.ts';
import { parseStoryInput, readInput } from '../src/engine/text.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { loreFor } from '../src/gm/lore.ts';
import { ruleInterpret } from '../src/gm/rules.ts';
import { META, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();

class BranchGm extends LocalGm {
  override async interpret(ctx: GmContext): Promise<Interpretation> {
    if (ctx.input?.kind === 'valid' && ctx.input.action) {
      const reading = ruleInterpret(ctx.free, ctx.text, ctx.state.items, loreFor(lore, ctx.state));
      if (reading.kind === 'approach') {
        return { kind: 'approach', approach: reading.approach, item: reading.item,
          spoken: Boolean(ctx.input.speech), source: 'rule', meta: META };
      }
      const example = ctx.free.approaches.find(a => a.examples.includes(ctx.text));
      if (example) {
        return { kind: 'approach', approach: example.id, item: example.item ?? null,
          spoken: Boolean(ctx.input.speech), source: 'rule', meta: META };
      }
    }
    return super.interpret(ctx);
  }
}

describe('이야기 갈래 5개', () => {
  test.each(Object.entries(ROUTES))('경로 %s 는 정해 둔 결말에 닿는다', async (_key, route) => {
    const engine = new Engine(scenario, new BranchGm(null, lore));
    let { state, step } = engine.newGame(route.seed, 's');
    const queue = structuredClone(route.inputs);
    for (let turn = 0; step.prompt.type === 'free' || (state.beat === 'b02_observed' && step.prompt.type === 'choices'); turn++) {
      expect(turn).toBeLessThan(30);
      if (step.prompt.type === 'choices') {
        ({ state, step } = await engine.act(state, { type: 'choose', id: 'approach' }));
      } else if (step.prompt.type === 'free') {
        const text = queue[step.prompt.beat]?.shift() ?? FALLBACK_INPUT;
        ({ state, step } = await engine.act(state, { type: 'free', text }));
      }
    }
    expect(state.ending).toBe(route.ending);
  });

  test('경로 다섯 개의 결말이 모두 다르다', () => {
    expect(new Set(Object.values(ROUTES).map((r) => r.ending)).size).toBe(5);
  });

  test('반복 person 대화는 소모하지 않고 noise와 명시 무시도는 구분해 실제 진행한다', async () => {
    const setup = new Engine(scenario, new LocalGm(null, lore));
    const start = setup.newGame(11, 's');
    const nearby = (await setup.act(start.state, { type: 'approach', id: 'run' })).state;
    expect(nearby.beat).toBe('b05_why');
    const dialogue = new Engine(scenario, new LocalGm(null, lore));
    let talking = structuredClone(nearby);
    for (let turn = 0; turn < 40; turn++) {
      const text = '당신은 말투가 거칠군요.';
      const result = await dialogue.act(talking, { type: 'free', text });
      expect(result.state.beat).toBe('b05_why');
      expect(result.state.ending).toBeNull();
      expect(result.step.events.some(e => e.type === 'roll')).toBe(false);
      expect(result.state.log.findLast(e => e.kind === 'input')).toMatchObject({ result: 'talk', text });
      expect(result.state.said).toContain(text);
      expect(result.step.events.some(e => e.type === 'line' && e.text.trim().length > 0)).toBe(true);
      talking = result.state;
    }
    for (const [text, form] of [['ㅋㅋㅋ', 'noise'], ['asdf', 'outside']] as const) {
      const engine = new Engine(scenario, new LocalGm(null, lore));
      expect(readInput(text).kind).toBe(form);
      const first = await engine.act(structuredClone(nearby), { type: 'free', text });
      expect(first.state.beat).toBe('b05_why');
      expect(first.step.events.some(e => e.type === 'roll')).toBe(false);
      const second = await engine.act(first.state, { type: 'free', text });
      expect(second.state.beat).toBe('b06_swing');
      expect(second.step.events.some(e => e.type === 'roll')).toBe(false);
      expect(second.state.log.findLast(e => e.kind === 'input')).toMatchObject({ result: 'idle', text });
      expect(second.step.events.some(e => e.type === 'line' && e.text.trim().length > 0)).toBe(true);
    }
    for (const text of ['배고파', '(춤을 춘다)', '(핸드폰을 꺼낸다)', '(옷을 벗는다)']) {
      const engine = new Engine(scenario, new LocalGm(null, lore));
      const result = await engine.act(structuredClone(nearby), { type: 'free', text });
      expect(result.step.events.some(e => e.type === 'roll')).toBe(false);
      expect(result.step.events.some(e => e.type === 'line' && e.text.trim().length > 0)).toBe(true);
    }
    const engine = new Engine(scenario, new LocalGm(null, lore));
    let { state, step } = engine.newGame(11, 'idle');
    let moved = false;
    for (let turn = 0; step.prompt.type === 'free'; turn++) {
      expect(turn).toBeLessThan(40);
      const text = '(가만히 있는다)';
      expect(parseStoryInput(text)).toMatchObject({ kind: 'valid', action: '가만히 있는다', speech: '', explicit: true });
      const before = state.beat;
      ({ state, step } = await engine.act(state, { type: 'free', text }));
      moved ||= state.beat !== before;
      expect(step.events.some(e => e.type === 'roll')).toBe(false);
      expect(state.log.findLast(e => e.kind === 'input')).toMatchObject({ result: 'idle', text });
      expect(step.events.some(e => e.type === 'line')).toBe(true);
    }
    expect(moved).toBe(true);
    expect(state.ending).not.toBeNull();
  });
});
