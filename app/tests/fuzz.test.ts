// 퍼저(scripts/fuzz.ts)가 찾은 버그를 하나씩 고정하는 시험과, 퍼저 자체의 짧은 회귀 실행.
import { describe, expect, test } from 'bun:test';
import { Engine } from '../src/engine/engine.ts';
import { GameError, type Action, type GameState, type Step } from '../src/engine/types.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { FakeGm, fakeClock, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();

/** 행동 단추와 첫 선택지로만 결말까지 간다. */
async function playToEnd(engine: Engine, start: { state: GameState; step: Step }) {
  let { state, step } = start;
  for (let i = 0; i < 200 && !state.ending; i++) {
    const p = step.prompt;
    const action: Action =
      p.type === 'luck' ? { type: 'luck', use: false }
      : p.type === 'choices' ? { type: 'choose', id: p.options[0]!.id }
      : p.type === 'free' ? { type: 'approach', id: p.approaches.find((a) => !a.locked)!.id }
      : (() => {
          throw new Error('끝');
        })();
    ({ state, step } = await engine.act(state, action));
  }
  if (!state.ending) throw new Error('결말에 닿지 않았습니다');
  return { state, step };
}

const interject = (text: string, scene: string | null): Action => ({ type: 'interject', text, scene, shown: [], pending: [] });

describe('퍼저가 찾은 버그: 그만두기 확인이 남는 자리', () => {
  test('끝난 판에 끼어들어 그만두겠다고 해도 확인을 남기지 않고 결말도 바뀌지 않는다', async () => {
    const engine = new Engine(scenario, new LocalGm(null, lore), fakeClock().now, true);
    const { state: ended } = await playToEnd(engine, engine.newGame(68, 'q'));
    const ending = ended.ending;
    expect(ending).not.toBe('quit');
    const asked = await engine.act(ended, interject('집에 갈래', ended.beat));
    expect(asked.state.pendingRisk).toBeUndefined();
    const yes = await engine.act(asked.state, interject('응', ended.beat));
    expect(yes.state.ending).toBe(ending);
    expect(yes.state.beat).toBe(ended.beat);
    const please = await engine.act(yes.state, interject('끝내줘', ended.beat));
    expect(please.state.ending).toBe(ending);
  });

  test('그만두기 확인이 떠 있는 채로 결말에 닿으면 확인은 사라진다', async () => {
    const engine = new Engine(scenario, new FakeGm(), fakeClock().now, true);
    const first = engine.newGame(3, 'q');
    const asked = await engine.act(first.state, { type: 'ask', text: '그만할래', scene: first.state.beat });
    expect(asked.state.pendingRisk).toBeDefined();
    const { state } = await playToEnd(engine, asked);
    expect(state.pendingRisk).toBeUndefined();
  });

  test('그만두기 확인에 답하지 않고 행동 단추를 누르면 확인은 끝나고, 뒤의 "응"이 판을 끝내지 않는다', async () => {
    const engine = new Engine(scenario, new FakeGm(), fakeClock().now, false);
    const first = engine.newGame(2, 'q');
    const asked = await engine.act(first.state, { type: 'ask', text: '그만할래', scene: first.state.beat });
    expect(asked.state.pendingRisk).toBeDefined();
    const pressed = await engine.act(asked.state, { type: 'approach', id: 'run' });
    expect(pressed.state.pendingRisk).toBeUndefined();
    if (pressed.state.ending === null && pressed.step.prompt.type === 'free') {
      const yes = await engine.act(pressed.state, { type: 'free', text: '응' });
      expect(yes.state.ending).not.toBe('quit');
    }
  });

  test('그만두기 확인 뒤 선택지를 고르거나 행운에 답해도 확인은 끝난다', async () => {
    const engine = new Engine(scenario, new FakeGm(), fakeClock().now, true);
    for (let seed = 1; seed < 400; seed++) {
      const { state } = engine.newGame(seed, 'l');
      const r = await engine.act(state, { type: 'approach', id: 'run' });
      if (r.step.prompt.type !== 'luck') continue;
      const asked = await engine.act(r.state, { type: 'free', text: '그만할래' });
      expect(asked.state.pendingRisk).toBeDefined();
      const luck = await engine.act(asked.state, { type: 'luck', use: false });
      expect(luck.state.pendingRisk).toBeUndefined();
      return;
    }
    throw new Error('행운을 묻는 시드가 없습니다');
  });

  test('의도 카드가 떠 있을 때 질문 모드로 그만두겠다고 하면, 확인 창의 답은 그만두기에 간다', async () => {
    const bold = () => ({ kind: 'improv', stat: '재치', difficulty: 0, label: '즉흥', absurd: false, bold: true, deed: '그의 칼을 붙잡았다', source: 'llm', meta: { attempts: 1, violations: [], fallback: false, ms: 0, model: 'fake' } }) as const;
    const engine = new Engine(scenario, new FakeGm(bold), fakeClock().now, false);
    const first = engine.newGame(2, 'i');
    const carded = await engine.act(first.state, { type: 'free', text: '칼을 붙잡는다' });
    expect(carded.state.pendingIntent).toBeDefined();
    const asked = await engine.act(carded.state, { type: 'ask', text: '그만할래', scene: first.state.beat });
    expect(asked.state.pendingRisk).toBeDefined();
    const ok = await engine.act(asked.state, { type: 'confirm', ok: true });
    expect(ok.state.ending).toBe('quit');
    expect(ok.state.log.filter((e) => e.kind === 'check').length).toBe(carded.state.log.filter((e) => e.kind === 'check').length);
  });
});

test('끝난 판에 끼어들기 말고 다른 행동은 받지 않는다', async () => {
  const engine = new Engine(scenario, new LocalGm(null, lore), fakeClock().now, true);
  const { state } = await playToEnd(engine, engine.newGame(5, 'e'));
  for (const action of [{ type: 'confirm', ok: true }, { type: 'free', text: '응' }, { type: 'ask', text: '그만할래' }] as Action[]) {
    await expect(engine.act(state, action)).rejects.toBeInstanceOf(GameError);
  }
});
