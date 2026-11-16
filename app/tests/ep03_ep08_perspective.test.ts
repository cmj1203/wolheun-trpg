import { describe, expect, test } from 'bun:test';
import { Engine } from '../src/engine/engine.ts';
import { checkScenario, loadScenario } from '../src/engine/scenario.ts';
import { APP, FakeGm } from './helpers.ts';

const cutIds = (episode: string, first: number, last: number) =>
  Array.from({ length: last - first + 1 }, (_, index) =>
    `${episode}_c${String(first + index).padStart(3, '0')}`);

const chapters = [
  {
    name: '3화', file: 'ep03_palace.yaml',
    audience: [...cutIds('ep03', 19, 26), ...cutIds('ep03', 52, 61)],
    before: 'ep03_c026', after: 'ep03_c026_asina',
    speakers: ['ep03_시하드', 'ep03_아시나'], cg: 'ep03_cg_026',
  },
  {
    name: '8화', file: 'ep08_harem.yaml',
    audience: ['ep08_c002_audience', 'ep08_c003', 'ep08_c004', ...cutIds('ep08', 35, 54)],
    before: 'ep08_c002', after: 'ep08_c002_audience',
    speakers: ['ep08_아시나', 'ep08_쿤', 'ep08_쿤독백', 'ep08_쿤독백'], cg: 'ep08_cg_002',
  },
] as const;

for (const chapter of chapters) {
  const scenario = await loadScenario(`${APP}/content/${chapter.file}`);
  describe(`${chapter.name} 실제 원작 시점 선언`, () => {
    test('관객 선언은 실제 파서를 거쳐 보존되고 아시나의 말·속마음은 관객으로 묶지 않는다', () => {
      expect(checkScenario(scenario)).toEqual([]);
      for (const id of chapter.audience) expect(scenario.beats[id]?.perspective).toBe('audience');
      for (const beat of Object.values(scenario.beats)) {
        if (beat.lines.some((line) => scenario.cast[line.speaker]?.lore === scenario.sheet.name)) {
          expect(beat.perspective).toBeUndefined();
        }
      }
    });

    test('혼합 컷 분리는 고정 발화·동일 CG·지도 소속을 보존하며 새 입력을 만들지 않는다', () => {
      const before = scenario.beats[chapter.before];
      const after = scenario.beats[chapter.after];
      if (!before || !after) throw new Error('혼합 시점의 분리 비트가 없습니다');
      expect(before.next).toBe(after.id);
      expect(after.choices).toBeUndefined();
      expect(after.free).toBeUndefined();
      const node = scenario.atlas?.nodes.find((entry) => entry.beats.includes(before.id));
      expect(node?.beats).toContain(after.id);
      const engine = new Engine({ ...scenario, start: before.id }, new FakeGm());
      const { step } = engine.newGame(31, 'viewpoint-declaration');
      const displayed = step.events.filter((event) => event.type === 'line').slice(0, chapter.speakers.length);
      expect(displayed.map((line) => line.speaker)).toEqual([...chapter.speakers]);
      expect(displayed.map((line) => line.cg)).toEqual(chapter.speakers.map(() => chapter.cg));
    });
  });
}
