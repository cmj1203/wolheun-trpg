import { describe, expect, test } from 'bun:test';
import { evalCond, evalCondRaw, render, SCENARIO_PATH } from '../scripts/script_audit.ts';
import { TRACKS, type FlagValue, type Track } from '../src/engine/types.ts';

describe('대본 점검 스크립트', () => {
  test('빠른 조건 계산이 엔진 evalCond 와 같은 값을 낸다', async () => {
    const yaml = await Bun.file(SCENARIO_PATH).text();
    const conds = [...new Set([...yaml.matchAll(/(?:if|when|until):\s*"([^"]+)"/g)].map((m) => m[1] ?? ''))];
    expect(conds.length).toBeGreaterThan(20);
    const flagNames = [...new Set(conds.flatMap((c) => [...c.matchAll(/flag:([\p{L}\p{N}_-]+)/gu)].map((m) => m[1] ?? '')))];
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let i = 0; i < 400; i++) {
      const tracks = Object.fromEntries(TRACKS.map((t) => [t, rnd(11)])) as Record<Track, number>;
      const flags: Record<string, FlagValue> = {};
      for (const f of flagNames) {
        const r = rnd(4);
        if (r === 1) flags[f] = true;
        else if (r === 2) flags[f] = rnd(4);
        else if (r === 3) flags[f] = false;
      }
      const items = ['magic_bag', 'map', 'earring', 'pin'].filter(() => rnd(2) === 1);
      const ctx = { tracks, abilities: { 재치: 1, 손재주: 1, 매력: 2, 체력: 0, 교양: 1 }, flags, items };
      for (const c of conds) expect(`${c}=${evalCond(c, ctx)}`).toBe(`${c}=${evalCondRaw(c, ctx)}`);
    }
  });

  test('표는 자동 구역 표지 안에 들어가고 칸의 | 를 이스케이프한다', () => {
    const md = render({
      stats: { nodes: 1, edges: 0, endings: {} },
      unreachableBeats: [{ kind: '닿지 않음', where: 'x', text: 'a|b', detail: 'd' }],
      deadEnds: [],
      flags: [],
      coverage: [],
      lore: [],
      state: [],
      repeats: [],
      habits: [],
      premises: [],
    });
    expect(md.startsWith('<!-- audit:begin -->')).toBe(true);
    expect(md.trimEnd().endsWith('<!-- audit:end -->')).toBe(true);
    expect(md).toContain('a\\|b');
  });
});
