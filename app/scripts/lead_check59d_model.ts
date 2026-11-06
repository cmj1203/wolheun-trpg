import { Engine } from '../src/engine/engine.ts';
import type { GameEvent, GameState } from '../src/engine/types.ts';
import { LocalGm, DEFAULT_GM_OPTIONS, type GmTrace } from '../src/gm/gm.ts';
import { LlmClient } from '../src/gm/llm.ts';
import { loadDesert, loadWolheunLore } from '../tests/helpers.ts';
import { appendFile } from 'node:fs/promises';

const original = await loadDesert();
const lore = await loadWolheunLore();
const b05 = original.beats.b05_why;
const b06 = original.beats.b06_swing;
if (!b05?.free || !b06?.free) throw new Error('b05·b06 자유 입력 장면이 필요합니다');
// 59c 와 같은 시험 복사본: 턴 상한만 늘리고 의심 10 결말 전환만 유예한다. 실제 콘텐츠는 바꾸지 않는다.
const scenario = { ...original, fates: original.fates?.filter(fate => fate.id !== 'spy_cut'), beats: {
  ...original.beats,
  [b05.id]: { ...b05, free: { ...b05.free, turns: 3 } },
  [b06.id]: { ...b06, free: { ...b06.free, turns: 20 } },
} };
const cases = [
  { text: '울컥한 마음에 턱 끝이 떨리고 눈앞이 흐려진다', situation: '눈물이 차올라 말문이 막히는 몸 반응', expected: ['sneer', 'neutral'] },
  { text: '긴장이 몰려와 손끝이 차갑고 숨이 가빠진다', situation: '긴장·차가운 손끝·가쁜 숨', expected: ['sneer', 'neutral'] },
  { text: '치밀어 오른 분노에 뺨이 달아오르고 말문이 막힌다', situation: '분노로 얼굴이 붉고 말문이 막힘', expected: ['sneer', 'neutral'] },
  { text: '힘이 쭉 빠져 무릎이 후들거린다', situation: '기력 저하·무릎 떨림', expected: ['sneer', 'neutral'] },
  { text: '눈시울이 뜨거워지고 콧등이 시큰해진다', situation: '울음이 차오르는 몸 반응', expected: ['sneer', 'neutral'] },
  { text: '다치게 할 생각은 없어요. 얘기부터 해요.', situation: '칼 앞에서도 대화를 요구하는 담대한 설득', expected: ['intrigued'] },
  { text: '칼을 든 손목을 양손으로 잡아 옆으로 밀어낸다.', situation: '남자의 무기 든 손목을 직접 붙잡아 미는 위협', expected: ['menacing'] },
  { text: '근처에 물을 얻을 곳이 있나요?', situation: '죽음의 위협 앞에서 물을 구하는 뜻밖의 담담함', expected: ['intrigued'] },
  { text: '칼 좀 내려 주실래요? 목이 따끔해서요.', situation: '(새 표현) 칼끝 앞의 태연한 부탁', expected: ['intrigued'] },
  { text: '제발 살려 주세요, 시키는 건 뭐든 할게요.', situation: '(새 표현) 겁에 질린 애원', expected: ['sneer', 'neutral'] },
  { text: '죽일 거면 통성명이라도 하고 죽이시죠.', situation: '(새 표현) 죽음 앞의 당돌한 요구', expected: ['intrigued'] },
  { text: '어머, 칼 쥔 손이 참 멋지시네요.', situation: '(새 표현) 아첨', expected: ['sneer', 'neutral'] },
];
const root = new URL('../../', import.meta.url);
const dir = new URL('docs/lead_check59d/', root);
const requestFile = new URL('model_requests.jsonl', dir);
await Bun.write(requestFile, '');
const nativeFetch = globalThis.fetch;
globalThis.fetch = Object.assign(async (...args: Parameters<typeof fetch>) => {
  const [input, init] = args;
  const url = input instanceof Request ? input.url : String(input);
  if (url.startsWith('http://127.0.0.1:18192/') && url.endsWith('/v1/chat/completions') && typeof init?.body === 'string') {
    await appendFile(requestFile, `${JSON.stringify({ at: Date.now(), url, body: JSON.parse(init.body) })}\n`, 'utf8');
  }
  return nativeFetch(...args);
}, { preconnect: nativeFetch.preconnect });
const before59c: { rows: { ms: number }[] } = await Bun.file(new URL('docs/lead_check59c/model_sequential.json', root)).json();
const pidFile = process.env.LANE59D_PIDS;
if (!pidFile) throw new Error('LANE59D_PIDS 가 필요합니다');
const modelPid = (await Bun.file(pidFile).text()).trim().split('\n')[0];
if (!modelPid) throw new Error('격리 모델 PID가 없습니다');
const cpu = async () => (await Bun.$`ps -p ${modelPid} -o pid=,stat=,%cpu=,etime=`.quiet().text()).trim();
let traces: GmTrace[] = [];
const gm = new LocalGm(new LlmClient({ baseUrl: 'http://127.0.0.1:18192', timeoutMs: 90000 }), lore, {
  ...DEFAULT_GM_OPTIONS, onTrace: trace => traces.push(trace),
});
const engine = new Engine(scenario, gm, () => Date.now(), false);
let { state, step: opening } = engine.newGame(59, 'lane59d-sequential');
({ state, step: opening } = await engine.act(state, { type: 'approach', id: 'run' }));
if (state.beat !== b05.id || state.flags['수첩:man'] !== true) throw new Error('정상 도입을 거쳐 남자 수첩이 열린 b05에서 시작해야 합니다');
const initial = structuredClone(state);
type Row = {
  i: number; text: string; beat: string; before: GameState; after: GameState;
  events: GameEvent[]; traces: GmTrace[]; ms: number; ms59c: number | null;
  cpuBefore: string; cpuAfter: string; situation: string; expected: string[];
};
const rows: Row[] = [];
for (const [index, { text, situation, expected }] of cases.entries()) {
  if (state.ending) throw new Error(`입력 ${index + 1} 전에 결말 도달: ${state.ending}`);
  traces = [];
  const before = structuredClone(state);
  const cpuBefore = await cpu();
  const started = performance.now();
  let result = await engine.act(state, { type: 'free', text });
  const events = [...result.step.events];
  for (let n = 0; n < 4; n++) {
    const action = result.state.pendingIntent || result.state.pendingRisk ? { type: 'confirm', ok: true } as const
      : result.state.pendingLuck ? { type: 'luck', use: false } as const : null;
    if (!action) break;
    result = await engine.act(result.state, action);
    events.push(...result.step.events);
  }
  const ms = Math.round(performance.now() - started);
  state = result.state;
  rows.push({
    i: index + 1, text, beat: before.beat, before, after: structuredClone(state),
    events, traces: [...traces], ms, ms59c: before59c.rows[index]?.ms ?? null,
    cpuBefore, cpuAfter: await cpu(), situation, expected,
  });
  await Bun.write(new URL('model_sequential.json', dir), JSON.stringify({ initial, opening, rows }, null, 2));
  const male = events.flatMap(e => e.type === 'line' && e.speaker === '남자' ? [`${e.text} [${e.face}]`] : []);
  const hero = events.flatMap(e => e.type === 'roll' ? [`${e.tierLabel}→${e.hero?.face ?? '-'}`] : []);
  console.log(JSON.stringify({ i: index + 1, beat: before.beat, ms, male, hero }));
}
console.log('MODEL59D_DONE');
