import { join } from 'node:path';
import type { GmContext, GmLines, GmMeta, GmPort, Interpretation, NarrateContext } from '../src/engine/engine.ts';
import { loadScenario } from '../src/engine/scenario.ts';
import type { Scenario } from '../src/engine/types.ts';
import { loadLore, withNotes, type Lore } from '../src/gm/lore.ts';

export const APP = join(import.meta.dir, '..');
export const SCENARIO_PATH = join(APP, 'content', 'ep01_desert.yaml');
export const LORE_PATH = join(APP, 'content', 'lore_wolheun.yaml');

export const loadWolheunLore = (): Promise<Lore> => loadLore(LORE_PATH);
export const loadDesert = async (): Promise<Scenario> => withNotes(await loadScenario(SCENARIO_PATH), await loadWolheunLore());

export const META: GmMeta = { attempts: 1, violations: [], fallback: false, ms: 0, model: 'fake' };

export class FakeGm implements GmPort {
  readonly calls: string[] = [];

  constructor(private readonly reading: (ctx: GmContext) => Interpretation = () => ({ kind: 'talk', source: 'rule', meta: META })) {}

  async interpret(ctx: GmContext): Promise<Interpretation> {
    this.calls.push(`interpret:${ctx.text}`);
    return this.reading(ctx);
  }

  async talk(ctx: GmContext): Promise<GmLines> {
    this.calls.push(`talk:${ctx.text}`);
    return { lines: [{ speaker: '남자', text: ctx.reaction ? '없다면, 잘 가라.' : '묻는 말에나 답해라.' }], meta: META };
  }

  async explain(ctx: GmContext): Promise<GmLines> {
    this.calls.push(`explain:${ctx.text}`);
    return { lines: [{ speaker: 'GM', text: '아시나는 알고 있다.' }], meta: META };
  }

  async narrate(ctx: NarrateContext): Promise<GmLines> {
    this.calls.push(`narrate:${ctx.approach.id}:${ctx.roll.tier}`);
    return { lines: ctx.outcome.lines, meta: META };
  }
}

export const approachOf = (approach: string): Interpretation => ({ kind: 'approach', approach, item: null, source: 'llm', meta: META });

export function fakeClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
