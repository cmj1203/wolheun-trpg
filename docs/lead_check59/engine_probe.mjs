import { Engine } from '../../app/src/engine/engine.ts';
import { LocalGm, DEFAULT_GM_OPTIONS } from '../../app/src/gm/gm.ts';
import { LlmClient } from '../../app/src/gm/llm.ts';
import { loadDesert, loadWolheunLore } from '../../app/tests/helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const cases = [
  { beat: 'b05_why', text: '주머니에서 핸드폰을 꺼내 남자 얼굴 앞에 흔든다', outside: true },
  { beat: 'b06_swing', text: '허공에 리모컨을 겨누고 전원 단추를 누른다', outside: true },
  { beat: 'b08_gaze', text: '목에 칼이 있는데도 제자리에서 어깨춤을 춘다', large: true },
  { beat: 'b05_why', text: '발뒤꿈치를 들고 남자의 입술에 뽀뽀하려 든다', large: true },
  { beat: 'b06_swing', text: '혀를 내밀어 목 앞의 칼날을 핥으려 한다', large: true },
  { beat: 'b08_gaze', text: '오늘 저녁엔 뭘 먹을 건데요, 저도 한 자리 껴요?' },
  { beat: 'b05_why', text: '당신 터번에 모래가 몇 알 붙었나 세어 볼게요' },
  { beat: 'b06_swing', text: '지금 칼싸움 대신 가위바위보로 정하면 안 돼요?' },
  { beat: 'b05_why', text: '제발 칼을 조금만 내려 주세요, 숨도 못 쉬겠어요', normal: true },
  { beat: 'b06_swing', text: '몸을 낮춰 칼을 든 손의 바깥으로 빠져나가려 한다', normal: true },
  { beat: 'b08_gaze', text: '그늘 쪽으로 한 걸음 비키며 물 한 모금만 달라고 한다', normal: true },
  { beat: 'b05_why', text: '이 정도 미모면 그냥 보내 주실 만하지 않아요?', normal: true },
];
const output = new URL('./engine_model.json', import.meta.url);
const retry = Number(process.argv.find(arg => arg.startsWith('--retry='))?.split('=')[1] ?? 0);
const rows = process.argv.includes('--resume') || retry ? await Bun.file(output).json() : [];
let traces = [];
const gm = new LocalGm(new LlmClient({ baseUrl: 'http://127.0.0.1:18097', timeoutMs: 90000 }), lore,
  { ...DEFAULT_GM_OPTIONS, budgetMs: 90000, onTrace: t => traces.push(t) });
for (const [i, item] of cases.entries()) {
    if (retry ? i !== retry - 1 : i < rows.length) continue;
    traces = [];
    const started = performance.now();
    const cpuBefore = (await Bun.$`ps -p 16678 -o pid=,stat=,%cpu=,etime=`.quiet().text()).trim();
    const engine = new Engine({ ...scenario, start: item.beat }, gm, () => 0, false);
    const opening = engine.newGame(i + 2, `faces59-${i}`);
    const before = structuredClone(opening.state);
    let result = await engine.act(before, { type: 'free', text: item.text });
    const events = [...result.step.events];
    for (let n = 0; n < 4; n++) {
      const action = result.state.pendingIntent ? { type: 'confirm', ok: true }
        : result.state.pendingLuck ? { type: 'luck', use: false }
        : result.state.pendingRisk ? { type: 'confirm', ok: true } : null;
      if (!action) break;
      result = await engine.act(result.state, action);
      events.push(...result.step.events);
    }
    const maleIndex = events.findIndex(e => e.type === 'line' && e.speaker === '남자' && e.by === 'gm');
    const male = events[maleIndex];
    const lines = events.filter(e => e.type === 'line' && e.by === 'gm');
    const delta = Object.entries(result.state.tracks).flatMap(([key, value]) =>
      value !== before.tracks[key] ? [{ key, from: before.tracks[key], to: value }] : []);
    const row = {
      i: i + 1, ...item, before, after: result.state, events, lines, male, delta, traces,
      rolled: events.some(e => e.type === 'roll'),
      gm: result.state.log.filter(e => e.kind === 'gm'),
      ms: Math.round(performance.now() - started), cpuBefore,
      cpuAfter: (await Bun.$`ps -p 16678 -o pid=,stat=,%cpu=,etime=`.quiet().text()).trim(),
    };
    rows[i] = row;
    await Bun.write(output, JSON.stringify(rows, null, 2));
    if (!male) throw new Error(`${i + 1}: 남자 모델 반응 줄 없음`);
    console.log(`CASE ${i + 1}/12: ${male.text} | ${male.face} | ${delta.map(d=>`${d.key}:${d.to-d.from}`).join(',')} | roll=${row.rolled}`);
}
console.log('ENGINE59_DONE');
