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

/** 모델 없는 wire fixture의 단어 tokenizer. 실제 예산 상한은 llm_budget64에서 별도로 검증한다. */
export async function tokenBudgetFixture(req: Request): Promise<Response | undefined> {
  const path = new URL(req.url).pathname;
  if (path === '/props') return Response.json({ default_generation_settings: { n_ctx: 8192 }, total_slots: 1 });
  if (path === '/apply-template') {
    const body: { messages: { role: string; content: string }[] } = await req.json();
    return Response.json({ prompt: body.messages.map(message => `${message.role}\n${message.content}`).join('\n') });
  }
  if (path === '/tokenize') {
    const body: { content: string; add_special: boolean } = await req.json();
    const count = body.content.split(/\s+/u).filter(Boolean).length + Number(body.add_special);
    return Response.json({ tokens: Array.from({ length: count }, () => 1) });
  }
  return undefined;
}
