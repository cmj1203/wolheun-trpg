import { Engine } from '../../app/src/engine/engine.ts';
import { LocalGm, DEFAULT_GM_OPTIONS } from '../../app/src/gm/gm.ts';
import { LlmClient } from '../../app/src/gm/llm.ts';
import { loadDesert, loadWolheunLore } from '../../app/tests/helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const offline = new Engine(scenario, new LocalGm(null, lore));
const opening = offline.newGame(1, 'lane52-base');
const b05 = (await offline.act(opening.state, { type: 'approach', id: 'run' })).state;
const b06 = (await offline.act(structuredClone(b05), { type: 'free', text: '아무 말도 하지 않는다' })).state;
const cases52 = [
  '눈물을 뚝뚝 흘리며 고개를 숙인다',
  '입술만 깨물고 아무 말도 안 한다',
  '전 그냥 지나가던 여행자예요, 제발요',
  '대륙에서 하나뿐인 미소녀니까요',
];
const cases53 = [
  '눈물이 멈추지 않아 어깨만 들썩인다',
  '놀라 온몸이 굳어 발이 떨어지지 않는다',
  '초점 잃은 눈으로 모래만 바라본다',
  '다리에 힘이 풀려 모래 위에 털썩 앉는다',
  '훌쩍이며 "제발 칼을 내려 주세요"라고 말한다',
  '목소리를 떨며 "저는 길을 잃었을 뿐이에요"라고 한다',
  '크라차로 가는 것조차 죄야?',
  '내 물음에는 대답도 안 하네?',
];
const records52 = [];
const records53 = [];
async function run(beat, text, priorTalk = false) {
  const traces = [];
  const gm = new LocalGm(new LlmClient({ baseUrl: 'http://127.0.0.1:18097', timeoutMs: 90_000 }), lore, {
    ...DEFAULT_GM_OPTIONS,
    onTrace: (trace) => traces.push(trace),
  });
  const engine = new Engine(scenario, gm);
  let state = structuredClone(beat === 'b05_why' ? b05 : b06);
  state.session = crypto.randomUUID();
  if (priorTalk && state.free) state.free.talks = 1;
  let result = await engine.act(state, { type: 'free', text });
  const events = [...result.step.events];
  if (result.state.pendingLuck) {
    result = await engine.act(result.state, { type: 'luck', use: false });
    events.push(...result.step.events);
  }
  const input = result.state.log.findLast((entry) => entry.kind === 'input');
  const record = {
    beat, text, priorTalk,
    classification: input?.result,
    next: result.state.beat,
    prompt: result.step.prompt,
    lines: events.filter((e) => e.type === 'line'),
    rolls: events.filter((e) => e.type === 'roll').length,
    traces,
  };
  console.log(JSON.stringify({ beat, text, kind: record.classification, next: record.next, rolls: record.rolls, lines: record.lines.map((l) => `${l.speaker}: ${l.text}`) }));
  return record;
}
for (const text of cases52) {
  records52.push(await run('b05_why', text));
  await Bun.write(new URL('./gm_raw.jsonl', import.meta.url), records52.map(JSON.stringify).join('\n') + '\n');
}
for (const beat of ['b05_why', 'b06_swing']) {
  for (const [i, text] of cases53.entries()) {
    records53.push(await run(beat, text, i >= 6));
    await Bun.write(new URL('../lead_check53/gm_raw.jsonl', import.meta.url), records53.map(JSON.stringify).join('\n') + '\n');
  }
}
