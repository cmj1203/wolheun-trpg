import { describe, expect, test } from 'bun:test';
import { ROUTES, FALLBACK_INPUT } from '../e2e/routes.ts';
import { Engine, type GmContext, type Interpretation } from '../src/engine/engine.ts';
import type { GameEvent, GameState, Step } from '../src/engine/types.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { loreFor } from '../src/gm/lore.ts';
import { ruleInterpret } from '../src/gm/rules.ts';
import { META, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const DEATH = '죽음을 맞이하게 될 줄은―';

class OpeningGm extends LocalGm {
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

/** 판 전체에 나온 사건(장면·줄)을 차례대로 모은다. */
async function play(seed: number, first: { type: 'approach'; id: string } | null, inputs: Record<string, string[]>) {
  const engine = new Engine(scenario, new OpeningGm(null, lore));
  let { state, step } = engine.newGame(seed, 'opening60');
  const events: GameEvent[] = [...step.events];
  const queue = structuredClone(inputs);
  if (first) {
    ({ state, step } = await engine.act(state, first));
    events.push(...step.events);
  }
  for (let turn = 0; turn < 30; turn++) {
    if (state.beat === 'b02_observed' && step.prompt.type === 'choices') {
      ({ state, step } = await engine.act(state, { type: 'choose', id: 'approach' }));
    } else if (step.prompt.type === 'free') {
      ({ state, step } = await engine.act(state, { type: 'free', text: queue[step.prompt.beat]?.shift() ?? FALLBACK_INPUT }));
    } else break;
    events.push(...step.events);
  }
  return { state: state as GameState, step: step as Step, events };
}

const beats = (state: GameState) => state.log.flatMap((e) => (e.kind === 'beat' ? [e.beat] : []));
const deathLines = (events: GameEvent[]) => events.filter((e) => e.type === 'line' && e.text === DEATH);
/** 독백 줄이 어느 장면 안에서 나왔는가. */
const sceneOf = (events: GameEvent[], line: GameEvent) => events.slice(0, events.indexOf(line)).findLast((e) => e.type === 'scene');

describe('60차: 원작 c001~c004 독백은 칼끝이 목에 닿는 판에서만 나온다', () => {
  test.each(['hit', 'mixed'] as const)('피함 %s 는 목표를 달성하고 칼끝으로 되돌아가지 않는다', async (tier) => {
    let found = false;
    for (let seed = 1; seed <= 80; seed++) {
      const engine = new Engine(scenario, new LocalGm(null, lore));
      const initial = engine.newGame(seed, `avoid-${tier}`);
      const result = await engine.act(initial.state, { type: 'approach', id: 'avoid' });
      const check = result.state.log.findLast((e) => e.kind === 'check');
      if (check?.kind !== 'check' || check.roll.tier !== tier) continue;
      found = true;
      const visited = beats(result.state);
      expect(visited).toContain('r3_slip');
      for (const beat of ['b03_ask', 'b03_met', 'b04_blade']) expect(visited).not.toContain(beat);
      expect(result.state.flags.도주).toBe(true);
      expect(result.state.flags.다가감).not.toBe(true);
      expect(result.state.flags.길_물음).not.toBe(true);
      expect(result.step.events.some((e) => e.type === 'line' && /길.*(묻는 척|여쭤보려고)/.test(e.text))).toBe(false);
      expect(result.state.tracks.체력).toBe(initial.state.tracks.체력);
      expect(result.step.events.flatMap((e) => e.type === 'price' ? [e.id] : []))
        .toEqual(tier === 'mixed' ? ['mind_strain'] : []);
      break;
    }
    expect(found).toBe(true);
  });

  test('남자를 만나지 않고 피해 간 판(r3_slip → e_road)에는 "죽음을 맞이" 독백이 없다', async () => {
    let found = 0;
    for (let seed = 1; seed <= 40 && found < 3; seed++) {
      const run = await play(seed, { type: 'approach', id: 'avoid' }, { r3_dusk: ['(별을 보고 남쪽을 찾는다)'] });
      if (!beats(run.state).includes('r3_slip') || run.state.ending !== 'road') continue;
      found++;
      expect(beats(run.state)).not.toContain('b04_blade');
      expect(deathLines(run.events)).toHaveLength(0);
      expect(run.events.some((e) => e.type === 'line' && e.cg?.startsWith('cg_open_'))).toBe(false);
    }
    expect(found).toBeGreaterThan(0);
  });

  test.each(Object.entries(ROUTES))('b04 를 지나는 경로 %s 는 칼끝 장면 안에서 한 번만 나온다', async (_key, route) => {
    const run = await play(route.seed, null, route.inputs);
    expect(run.state.ending).toBe(route.ending);
    expect(beats(run.state)).toContain('b04_blade');
    const lines = deathLines(run.events);
    expect(lines).toHaveLength(1);
    expect(sceneOf(run.events, lines[0]!)).toMatchObject({ type: 'scene', beat: 'b04_blade' });
    // 칼끝 그림은 독백 첫 줄부터 함께 나오고, 남자 그림은 남자 대사와 함께 전환한다.
    const start = run.events.findIndex((e) => e.type === 'scene' && e.beat === 'b04_blade');
    const end = run.events.findIndex((e, i) => i > start && e.type === 'scene');
    const bladeLines = run.events.slice(start, end).filter((e) => e.type === 'line');
    expect(bladeLines.length).toBeGreaterThan(8);
    for (const line of bladeLines) {
      if (line.type !== 'line' || line.text === '그리고 현재.') continue;
      expect(line.text.trim()).not.toBe('');
      expect(line.cg).toBe(line.speaker === '남자' ? 'cg_last' : 'cg_open_blade');
    }
  });
});
