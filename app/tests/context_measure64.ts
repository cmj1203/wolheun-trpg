import { join } from 'node:path';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import type { GmContext } from '../src/engine/engine.ts';
import { parseStoryInput } from '../src/engine/text.ts';
import type { GameState } from '../src/engine/types.ts';
import type { ChatRequest } from '../src/gm/llm.ts';
import { loadLore, loreFor, withNotes } from '../src/gm/lore.ts';
import { buildInterpretSystem, buildInterpretUser } from '../src/gm/prompt.ts';

// GET props, apply-template, tokenize만 호출한다. completion·warm·모델 기동은 없다.
const root = join(import.meta.dir, '../..');
const endpoint = 'http://127.0.0.1:18196';
const source = join(root, 'work/continuation/qa/real-1794206518713/canonical_first.jsonl');
interface Row {
  action: number;
  kind: string;
  detail: {
    text?: string;
    state?: GameState;
    request?: ChatRequest;
    trace?: { task: string; llm?: { promptTokens: number; completionTokens: number }; error?: string };
  };
}
const rows: Row[] = (await Bun.file(source).text()).trim().split('\n').map(line => JSON.parse(line));
const lore = await loadLore(join(root, 'app/content/lore_wolheun.yaml'));
const scenario = withNotes(await loadCampaignScenario(join(root, 'app/content/ep01_desert.yaml')), lore);
const props = await (await fetch(`${endpoint}/props`)).json();
const context = props.default_generation_settings.n_ctx;

async function count(system: string, user: string): Promise<number> {
  const template = await (await fetch(`${endpoint}/apply-template`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  })).json();
  if (typeof template.prompt !== 'string') throw new Error('템플릿 응답 없음');
  const tokenized = await (await fetch(`${endpoint}/tokenize`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: template.prompt, add_special: true, parse_special: true }),
  })).json();
  if (!Array.isArray(tokenized.tokens)) throw new Error('토큰 응답 없음');
  return tokenized.tokens.length;
}

const results = [];
for (const action of [17, 18]) {
  const recorded = rows.find(row => row.action === action && row.kind === 'llm_transport' && row.detail.request?.maxTokens === 320)?.detail.request;
  const trace = rows.find(row => row.action === action && row.kind === 'model_trace_review' && row.detail.trace?.task === 'interpret')?.detail.trace;
  const state = rows.findLast(row => row.action < action && row.kind === 'state')?.detail.state;
  if (!recorded || !trace || !state) throw new Error(`A${action} 원시 문맥 없음`);
  const beat = scenario.beats[state.beat];
  const free = beat?.free;
  if (!beat || !free) throw new Error(`A${action} 현재 자유 입력 없음`);
  const inputRow = rows.find(row => row.action === action && row.kind === 'action');
  const input: { text?: string } = inputRow?.detail ?? {};
  if (!input.text) throw new Error(`A${action} 입력 없음`);
  const ctx: GmContext = { scenario, beat, free, state, text: input.text, input: parseStoryInput(input.text) };
  const visible = loreFor(lore, state);
  const system = buildInterpretSystem(ctx, visible), user = buildInterpretUser(ctx, visible);
  const before = await count(recorded.system, recorded.user);
  const after = await count(system, user);
  results.push({
    action, beat: beat.id, context, reserve: recorded.maxTokens,
    recordedPrompt: trace.llm?.promptTokens, recordedCompletion: trace.llm?.completionTokens, recordedError: trace.error,
    beforeTokens: before, beforeTotalWithReserve: before + recorded.maxTokens,
    afterTokens: after, afterTotalWithReserve: after + recorded.maxTokens,
    outputRoomAfter: context - after,
    beforeChars: recorded.system.length + recorded.user.length, afterChars: system.length + user.length,
  });
}
const evidence = { endpoint, n_ctx: context, totalSlots: props.total_slots, add_special: true, generationCalls: 0, source, results };
await Bun.write(join(root, 'work/demo-slice/lane64/context-budget-measure.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
