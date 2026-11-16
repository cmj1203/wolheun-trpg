import { expect, spyOn, test } from 'bun:test';
import { mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../src/engine/engine.ts';
import { readSaveSnapshot, writeSave } from '../src/engine/save.ts';
import { ViewpointPlayback } from '../src/server/viewpoint.ts';
import { FakeGm, loadDesert } from './helpers.ts';

test('슬롯 파일 교체 중 snapshot은 한 세대의 검증된 state·view·private 투영을 함께 읽는다', async () => {
  const scenario = await loadDesert();
  const dir = await mkdtemp(join(tmpdir(), 'wolheun-save-atomic-'));
  const playback = new ViewpointPlayback();
  const { state, step } = new Engine(scenario, new FakeGm()).newGame(2, 'atomic', playback.observe);
  const first = step.events[0];
  if (!first || !('frame' in first) || !first.frame) throw new Error('시작 frame 없음');
  playback.confirm(first.frame);
  const privateA = playback.save();
  if (!privateA.current) throw new Error('확인된 투영 없음');
  state.flags.generation = 'A';
  privateA.current.state.flags.generation = 'A';
  await writeSave(dir, 'slot', scenario, state, 1, { generation: 'A' }, privateA);
  const privateB = structuredClone(privateA);
  if (!privateB.current) throw new Error('B 투영 없음');
  privateB.current.state.flags.generation = 'B';
  await writeSave(dir, 'replacement', scenario, { ...state, flags: { ...state.flags, generation: 'B' } }, 2, { generation: 'B' }, privateB);
  const path = join(dir, 'slot.json');
  const file = Bun.file;
  let reads = 0;
  const intercept = spyOn(Bun, 'file').mockImplementation((name, options) => {
    const real = typeof name === 'number' ? file(name, options)
      : typeof name === 'string' || name instanceof URL ? file(name, options) : file(name, options);
    if (name !== path) return real;
    return new Proxy(real, {
      get(target, key) {
        if (key === 'json') return async () => {
          const parsed = await target.json();
          if (++reads === 1) await rename(join(dir, 'replacement.json'), path);
          return parsed;
        };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  });
  try {
    const snapshot = await readSaveSnapshot(dir, 'slot', scenario);
    expect(reads).toBe(1);
    expect(snapshot.state.flags.generation).toBe('A');
    expect(snapshot.view).toEqual({ generation: 'A' });
    const restored = new ViewpointPlayback();
    const tokens = restored.restore(snapshot.viewpoint as ReturnType<ViewpointPlayback['save']>, 'restored');
    expect(restored.question(tokens.get(first.frame)).state.flags.generation).toBe('A');
    intercept.mockRestore();
    expect((await readSaveSnapshot(dir, 'slot', scenario)).state.flags.generation).toBe('B');
  } finally {
    intercept.mockRestore();
    await rm(dir, { recursive: true, force: true });
  }
});
