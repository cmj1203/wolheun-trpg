import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Engine } from '../src/engine/engine.ts';
import type { GmLines, GmPort, Interpretation } from '../src/engine/engine.ts';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { DEFAULT_GM_OPTIONS, LocalGm } from '../src/gm/gm.ts';
import { LlmClient } from '../src/gm/llm.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';

// 수동 순차 실행 전용. 리드가18196을 배정한 동안에만 실행한다.
const app = join(import.meta.dir, '..');
const out = Bun.argv[2];
if (!out) throw new Error('검증 결과를 쓸 절대 경로가 필요합니다');
mkdirSync(out, { recursive: true });
const transcript = join(out, 'transcript.jsonl');
writeFileSync(transcript, '', { flag: 'wx' });
let current = '준비';
const record = (kind: string, value: unknown): void => {
  appendFileSync(transcript, `${JSON.stringify({ case: current, kind, value })}\n`);
};
const build = await Bun.build({ entrypoints: [join(app, 'web/main.ts')], target: 'browser', minify: true });
const built = build.outputs[0];
if (!build.success || !built) throw new Error('현재 UI 번들을 만들지 못했습니다');
const digest = (bytes: Uint8Array) => new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
const served = await fetch('http://127.0.0.1:18241/app.js', { signal: AbortSignal.timeout(5_000) });
if (!served.ok) throw new Error(`검증 앱 번들 응답 ${served.status}`);
const builtHash = digest(new Uint8Array(await built.arrayBuffer()));
const servedHash = digest(new Uint8Array(await served.arrayBuffer()));
record('bundle', { builtHash, servedHash, latest: builtHash === servedHash, uiVerified: false });
const sources: Record<string, string> = {};
for await (const file of new Bun.Glob('src/{gm,engine}/**/*.ts').scan(app)) {
  sources[file] = digest(new Uint8Array(await Bun.file(join(app, file)).arrayBuffer()));
}
sources['content/ep03_palace.yaml'] = digest(new Uint8Array(await Bun.file(join(app, 'content/ep03_palace.yaml')).arrayBuffer()));
record('sourceHashes', sources);
const lore = await loadLore(join(app, 'content/lore_wolheun.yaml'));
const scenario = withNotes(await loadCampaignScenario(join(app, 'content/ep01_desert.yaml')), lore);
const local = new LocalGm(new LlmClient({ baseUrl: 'http://127.0.0.1:18196', timeoutMs: 90_000 }), lore, {
  ...DEFAULT_GM_OPTIONS,
  onTrace(trace) { record('trace', trace); },
});
const cases = [
  { id: '원문선택', scene: 'source', text: '', mode: 'source' },
  { id: '직접대사', scene: 'ep03_c046', text: '제 생각도 들어 주세요.', mode: 'advance' },
  { id: '괄호몸짓', scene: 'ep03_c046', text: '(시녀를 바라보며 고개를 기울인다)', mode: 'advance' },
  { id: '혼합대사행동', scene: 'ep03_c046', text: '(손을 가볍게 들어 보인다) 잠시 제 말도 들어 주세요.', mode: 'advance' },
  { id: '의례몸짓', scene: 'ep03_c046', text: '(시녀에게 정중히 절한다)', mode: 'advance' },
  { id: '불확실시도', scene: 'ep03_c046', text: '(시녀의 제지를 피해 문밖으로 빠져나가려 한다)', mode: 'hold' },
  { id: '지속목표', scene: 'ep03_c046', text: '(하렘에서 벗어나 짐을 찾아 고국으로 돌아간다)', mode: 'hold' },
  { id: '둘째자리질문', scene: 'ep03_c049', text: '여기에 다른 사람은 없나요?', mode: 'advance' },
  { id: '둘째자리혼합', scene: 'ep03_c049', text: '(시녀를 향해 손바닥을 편다) 이 방은 왜 이렇게 조용한가요?', mode: 'advance' },
] as const;
const selected = Bun.argv[3]?.split(',');
if (selected?.some((id) => !cases.some((item) => item.id === id))) {
  throw new Error('알 수 없는 검증 케이스입니다');
}
const results: { id: string; passed: boolean; checks?: Record<string, boolean>; error?: string }[] = [];
for (const item of cases) {
  if (selected && !selected.includes(item.id)) continue;
  current = item.id;
  let reading: Interpretation | undefined;
  const replies: GmLines[] = [];
  const gm: GmPort = {
    async interpret(ctx) {
      reading = await local.interpret(ctx);
      record('interpretation', reading);
      return reading;
    },
    async talk(ctx) {
      const reply = await local.talk(ctx);
      replies.push(reply);
      record('reply', reply);
      return reply;
    },
    narrate: (ctx) => local.narrate(ctx),
    explain: (ctx) => local.explain(ctx),
  };
  const engine = new Engine({ ...scenario, start: 'ep03_c001' }, gm, () => 1_000);
  let state = engine.newGame(20261109, `ep03-real-${item.id}`).state;
  if (item.scene === 'ep03_c049' || item.mode === 'source') {
    state = (await engine.act(state, { type: 'choose', id: 'ep03_i01_protest' })).state;
  }
  const before = structuredClone(state);
  record('before', { beat: state.beat, flags: state.flags, items: state.items, heard: state.heard, text: item.text });
  try {
    const result = await engine.act(state, item.mode === 'source'
      ? { type: 'choose', id: 'ep03_i02_quiet' }
      : { type: 'interject', text: item.text, scene: state.beat, shown: [...state.recent], pending: [] });
    const lines = result.step.events.filter((event) => event.type === 'line');
    const gmLines = lines.filter((line) => line.by === 'gm');
    const unselected = [
      '말이 돼? 정신 차려! 남자와 여자는 무조건 한 쌍이어야 한다고!',
      '여러 명의 여자랑 놀아나는 곳에 들어온 건데, 어떻게 영광이야!',
      '당신들은 장난감 취급 당하고 있는 거야.', '이건 부당한 대우라고! 정신 차려!',
      '…근데, 왜 이렇게 조용하죠?', '다른 여자들은 어디 있길래…', '나 혼자라고?',
    ];
    const checks = {
      statePreserved: result.state.rng === before.rng
        && JSON.stringify(result.state.tracks) === JSON.stringify(before.tracks)
        && JSON.stringify(result.state.items) === JSON.stringify(before.items),
      noRoll: !result.step.events.some((event) => event.type === 'roll'),
      noFree: result.state.free === null,
      outcome: item.mode === 'hold'
        ? JSON.stringify(result.state) === JSON.stringify(before)
          && result.step.events.some((event) => event.type === 'notice' && event.kind === 'rewrite')
          && replies.length === 0
        : result.state.beat === (item.scene === 'ep03_c046' ? 'ep03_c049' : 'ep03_c061'),
      realReply: item.mode !== 'advance' || (
        replies.length > 0 && replies.every((reply) => !reply.meta.fallback && reply.lines.length > 0)
        && gmLines.length > 0
      ),
      noUnselectedSpeech: item.mode === 'source' || !lines.some((line) => unselected.includes(line.text)),
      currentCg: item.mode !== 'advance' || gmLines.every((line) => line.cg === (
        item.scene === 'ep03_c046' ? 'ep03_cg_046' : 'ep03_cg_049'
      )),
    };
    const passed = Object.values(checks).every(Boolean);
    results.push({ id: item.id, passed, checks });
    record('result', { passed, checks, reading, state: result.state, events: result.step.events, prompt: result.step.prompt });
    console.log(`CASE ${item.id}: ${passed ? 'PASS' : 'FAIL'}`);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    results.push({ id: item.id, passed: false, error: error.message });
    record('failure', { error: error.message, reading, replies });
    console.log(`CASE ${item.id}: FAIL ${error.message}`);
  }
}
writeFileSync(join(out, 'structure-results.json'), JSON.stringify(results, null, 2));
console.log(`DONE ${results.filter((row) => row.passed).length}/${results.length}; 문장 수동 검수 별도`);
if (results.some((row) => !row.passed)) process.exitCode = 1;
