import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAtlas, emptyAtlas, type AtlasRecord } from '../src/engine/atlas.ts';
import { loadScenario } from '../src/engine/scenario.ts';
import type { Scenario } from '../src/engine/types.ts';
import { SCENARIO_PATH } from './helpers.ts';

const source = await Bun.file(SCENARIO_PATH).text();
const beat = 'b02_people';

async function loadLabelScenario(label: string) {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-label64-'));
  const path = join(directory, 'scenario.yaml');
  const data = Bun.YAML.parse(source);
  if (typeof data !== 'object' || data === null) throw new Error('scenario fixture must be a mapping');
  const labeled = {
    ...data,
    atlas: {
      nodes: [{ id: 'scene', col: 0, row: 0, beats: [beat], label }],
      edges: [],
    },
  };
  await writeFile(path, JSON.stringify(labeled));
  try {
    return await loadScenario(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const labeledScenario = await loadLabelScenario('명시된 사건 이름');
const sourceBeat = labeledScenario.beats[beat];
if (sourceBeat === undefined) throw new Error('scenario fixture beat is missing');
const base: Scenario = {
  ...labeledScenario,
  beats: {
    ...labeledScenario.beats,
    [beat]: { ...sourceBeat, title: '일반 비트 제목' },
  },
};
const record = (beats: string[]): AtlasRecord => ({
  ...emptyAtlas(),
  display: { beats, paths: [], runs: { run: beats } },
});

describe('명시적 지도 노드 이름', () => {
  test('실제 시나리오 로더가 atlas 노드 이름을 보존한다', () => {
    const loaded = labeledScenario.atlas?.nodes.find((entry) => entry.id === 'scene');

    expect(loaded?.label).toBe('명시된 사건 이름');
  });

  test('도달한 노드 카드와 currentScene에 사건 이름을 쓰고 비트 제목은 보존한다', () => {
    const view = buildAtlas(base, record([beat]));

    expect(view.nodes[0]?.label).toBe('명시된 사건 이름');
    expect(view.currentScene).toBe('명시된 사건 이름');
    expect(base.beats[beat]?.title).toBe('일반 비트 제목');
  });

  test('미도달 노드는 이름을 숨기고 메타데이터를 노출하지 않는다', () => {
    const view = buildAtlas(base, record([]));

    expect(view.nodes[0]?.label).toBeNull();
    expect(JSON.stringify(view)).not.toContain('명시된 사건 이름');
  });

  test('이름이 없는 기존 노드는 기존 비트 제목을 사용한다', () => {
    const legacy: Scenario = {
      ...base,
      atlas: {
        nodes: [{ id: 'scene', col: 0, row: 0, beats: [beat] }],
        edges: [],
      },
    };
    const view = buildAtlas(legacy, record([beat]));

    expect(view.nodes[0]?.label).toBe('일반 비트 제목');
    expect(view.currentScene).toBe('일반 비트 제목');
  });
});
