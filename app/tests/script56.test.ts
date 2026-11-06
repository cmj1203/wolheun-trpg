import { expect, test } from 'bun:test';
import { Engine } from '../src/engine/engine.ts';
import { FakeGm, loadDesert } from './helpers.ts';

const scenario = await loadDesert();

test('칼끝 장면은 원작의 속마음→남자 질문→아시나 발화 순서다', async () => {
  const engine = new Engine(scenario, new FakeGm());
  const { step } = await engine.act(engine.newGame(1, 'script56').state, { type: 'approach', id: 'run' });
  const lines = step.events.flatMap((e) => e.type === 'line' ? [`${e.speaker}: ${e.text}`] : []);
  const thought = lines.indexOf('속마음: 크라차에 원수라도 진 건지… 다짜고짜 사람 목에 칼이나 들이대고 말이야!');
  expect(thought).toBeGreaterThanOrEqual(0);
  expect(lines.slice(thought, thought + 3)).toEqual([
    '속마음: 크라차에 원수라도 진 건지… 다짜고짜 사람 목에 칼이나 들이대고 말이야!',
    '남자: 마지막으로 할 말은 있나?',
    '아시나: 억울해…',
  ]);
});

test('미인계는 모든 판정 등급에서 선언을 유지하고 결과로 갈라진다', async () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 40 && seen.size < 3; seed++) {
    const engine = new Engine(scenario, new FakeGm());
    const base = engine.newGame(seed, `beauty56-${seed}`).state;
    const state = { ...base, beat: 'b05_why', free: { beat: 'b05_why', talks: 0, rolls: 0 } };
    const { step } = await engine.act(state, { type: 'approach', id: 'beauty' });
    const roll = step.events.find((e) => e.type === 'roll');
    if (!roll || roll.type !== 'roll') continue;
    seen.add(roll.tier);
    const lines = step.events.flatMap((e) => e.type === 'line' && e.speaker === '아시나' ? [e.text] : []);
    expect(lines.slice(0, 3)).toEqual(['왜냐하면 저는…', '대륙에서 하나뿐인,', '미소녀니까요.']);
    if (roll.tier === 'hit') expect(lines.slice(3, 7)).toEqual([
      '저는 말이죠.', '미소녀는 나라에서 보호해야 할 의무가 있다고 생각해요.',
      '예쁘고 아름다운 걸 지키는 건 당연한 일이니까…', '안 그래요?',
    ]);
  }
  expect([...seen].sort()).toEqual(['hit', 'miss', 'mixed']);
});
