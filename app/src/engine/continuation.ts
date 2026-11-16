import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseCond } from './conditions.ts';
import type { Engine } from './engine.ts';
import { SaveError } from './save.ts';
import { checkScenario, loadScenario, ScenarioError } from './scenario.ts';
import type { BeatSpec, GameState, Scenario, Step, ViewpointObserver } from './types.ts';

const BOUNDARIES = {
  e_survivor: { ending: 'survivor', choice: 'continue_chapter' },
  e_curious: { ending: 'curious', choice: 'continue_chapter' },
  ep02_court_boundary: { ending: 'ep02_court_boundary', choice: 'continue_ep03' },
  ep03_c061: { ending: 'ep03_boundary', choice: 'continue_ep04' },
  ep04_boundary: { ending: 'ep04_boundary', choice: 'continue_ep05' },
  ep04_distance_boundary: { ending: 'ep04_distance_boundary', choice: 'continue_ep05' },
  ep05_boundary: { ending: 'ep05_boundary', choice: 'continue_ep06' },
  ep06_c065: { ending: 'ep06_internal_end', choice: 'continue_ep07' },
  ep07_c063: { ending: 'ep07_internal_end', choice: 'continue_ep08' },
  ep08_c062: { ending: 'ep08_boundary', choice: 'continue_ep09' },
  ep09_c084: { ending: 'ep09_internal_end', choice: 'continue_ep10' },
} as const;
const CAPTURE_BEATS = ['e_survivor', 'e_curious'] as const;
const CONTINUATION_FLAG = '후속_시작';

// 원본 FactSpec에는 scope/id가 없다. 본문이 아닌 원본 출처로 독립 검증 역할을 선언한다.
const STANDALONE_FACTS: Readonly<Record<string, readonly number[]>> = {
  ep08_harem: [0],
};

/** 이전 저장에도 남는 실제 사건·발화 표식. 시트 기본값은 진입 증거로 쓰지 않는다. */
function eventFlags(scenario: Scenario): Set<string> {
  const flags = new Set(Object.keys(scenario.beats).map(id => `말함_${id}`));
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (typeof value !== 'object' || value === null) return;
    if ('sets' in value && typeof value.sets === 'string') flags.add(value.sets);
    if ('flags' in value && typeof value.flags === 'object' && value.flags !== null) {
      for (const [name, assigned] of Object.entries(value.flags)) if (assigned) flags.add(name);
    }
    Object.values(value).forEach(visit);
  };
  visit(scenario.beats);
  return flags;
}

function mergeEntries<T>(base: Record<string, T>, added: Record<string, T>, field: string): Record<string, T> {
  for (const [key, value] of Object.entries(added)) {
    if (key in base && !isDeepStrictEqual(base[key], value)) {
      throw new ScenarioError(`${field}.${key}: 후속 장이 기존 정의를 덮어쓸 수 없습니다`);
    }
  }
  return { ...base, ...added };
}

function connectAtlas(base: Scenario, chapter: Scenario, boundaries: readonly string[]): Scenario['atlas'] {
  if (!base.atlas && !chapter.atlas) return undefined;
  const baseNodes = base.atlas?.nodes ?? [];
  const addedNodes = chapter.atlas?.nodes ?? [];
  const nodes = [...baseNodes.map((node) => (
    node.beats.some((beat) => boundaries.includes(beat)) ? { ...node, ending: false } : node
  )), ...addedNodes];
  const edges: [string, string][] = [...(base.atlas?.edges ?? []), ...(chapter.atlas?.edges ?? [])];
  if (chapter.atlas) {
    const entry = addedNodes.find((node) => node.beats.includes(chapter.start));
    if (!entry) throw new ScenarioError('atlas.nodes: 후속 시작 비트를 포함한 노드가 필요합니다');
    for (const node of baseNodes) {
      if (node.beats.some((beat) => boundaries.includes(beat))) edges.push([node.id, entry.id]);
    }
  }
  const groups = [
    ...(base.atlas?.chapters ?? (baseNodes.length ? [{ id: 'ep01', label: '1화', nodes: baseNodes.map((node) => node.id) }] : [])),
    ...(chapter.atlas?.chapters ?? []),
  ];
  const chapters = new Map<string, { id: string; label: string; nodes: string[] }>();
  for (const group of groups) {
    const existing = chapters.get(group.id);
    if (existing && existing.label !== group.label) {
      throw new ScenarioError(`atlas.chapters.${group.id}: 같은 화의 표기가 다릅니다`);
    }
    chapters.set(group.id, { ...group, nodes: [...(existing?.nodes ?? []), ...group.nodes] });
  }
  return { nodes, edges, chapters: [...chapters.values()] };
}

/** 장을 더해도 기존 판의 식별자·시트·시작 위치는 바꾸지 않는다. */
function connectChapter(base: Scenario, chapter: Scenario, boundaries: readonly (keyof typeof BOUNDARIES)[]): Scenario {
  for (const id of Object.keys(chapter.beats)) {
    if (id in base.beats) throw new ScenarioError(`beats.${id}: 후속 비트 id가 중복됩니다`);
  }
  if (!isDeepStrictEqual(base.sheet.items, chapter.sheet.items)) {
    throw new ScenarioError('sheet.items: 후속 장은 사막 시작 소지품을 바꿀 수 없습니다');
  }
  const beats: Record<string, BeatSpec> = { ...base.beats, ...chapter.beats };
  const previousFlags = eventFlags(base);
  const chapterFlags = eventFlags(chapter);
  const knownFlags = new Set([...previousFlags, ...chapterFlags]);
  const entryFlag = `fact_entered_${chapter.start}`;
  const admission = [
    `flag:${entryFlag}`,
    ...[...chapterFlags].filter(flag => !previousFlags.has(flag)).map(flag => `flag:${flag}`),
  ];
  const standalone = STANDALONE_FACTS[chapter.id] ?? [];
  for (const index of standalone) {
    if (!chapter.facts[index]) throw new ScenarioError(`facts.${chapter.id}.${index}: 독립 검증 출처가 없습니다`);
  }
  let needsEntry = false;
  const facts = chapter.facts.flatMap((fact, index) => {
    if (standalone.includes(index)) return [];
    const branches = fact.if.split('||').map(branch => branch.trim());
    const scoped = parseCond(fact.if).flatMap((atoms, branchIndex) => {
      const branch = branches[branchIndex];
      if (branch === undefined) throw new ScenarioError('facts: 조건 분기 수가 다릅니다');
      // 실제 선행 사건으로 성립한 기억과 현재 상태 조건의 원래 수명을 보존한다.
      if (atoms.some(atom => atom.kind === 'flag' && !atom.negate && knownFlags.has(atom.name))) return [branch];
      needsEntry = true;
      return admission.map(proof => `${proof} && ${branch}`);
    });
    return [{ ...fact, if: scoped.join(' || ') }];
  });
  if (needsEntry) {
    const start = beats[chapter.start];
    if (!start) throw new ScenarioError('facts: 소유 장의 시작 비트가 없습니다');
    beats[chapter.start] = {
      ...start,
      effects: { ...start.effects, flags: { ...start.effects?.flags, [entryFlag]: true } },
    };
  }
  for (const id of boundaries) {
    const boundary = BOUNDARIES[id];
    const beat = base.beats[id];
    if (!beat || beat.ending?.id !== boundary.ending) {
      throw new ScenarioError(`beats.${id}: 후속 연결 대상인 장 경계가 없습니다`);
    }
    const { ending: _ending, ...capture } = beat;
    beats[id] = {
      ...capture,
      effects: { ...capture.effects, flags: { ...capture.effects?.flags, [CONTINUATION_FLAG]: true } },
      choices: [{ id: boundary.choice, text: '계속', next: chapter.start }],
      next: chapter.start,
    };
  }
  const scenario: Scenario = {
    ...base,
    cast: mergeEntries(base.cast, chapter.cast, 'cast'),
    backgrounds: mergeEntries(base.backgrounds, chapter.backgrounds, 'backgrounds'),
    sprites: mergeEntries(base.sprites, chapter.sprites, 'sprites'),
    cgs: mergeEntries(base.cgs, chapter.cgs, 'cgs'),
    beats,
    facts: [...base.facts, ...facts],
    callbacks: [...(base.callbacks ?? []), ...(chapter.callbacks ?? [])],
    foreshadow: [...(base.foreshadow ?? []), ...(chapter.foreshadow ?? [])],
    fates: [...(base.fates ?? []), ...(chapter.fates ?? [])],
    atlas: connectAtlas(base, chapter, boundaries),
  };
  const problems = checkScenario(scenario);
  if (problems.length) throw new ScenarioError(`후속 연결 검증 실패:\n- ${problems.join('\n- ')}`);
  return scenario;
}

export function connectContinuation(base: Scenario, chapter: Scenario): Scenario {
  const guard = (when: string): string => when.split('||')
    .map((group) => `!flag:${CONTINUATION_FLAG} && ${group.trim()}`).join(' || ');
  return connectChapter({
    ...base,
    fates: (base.fates ?? []).map((fate) => ({
      ...fate,
      when: guard(fate.when),
      ...(fate.warn ? { warn: { ...fate.warn, when: guard(fate.warn.when) } } : {}),
    })),
  }, chapter, CAPTURE_BEATS);
}

export async function loadCampaignScenario(path: string): Promise<Scenario> {
  const base = await loadScenario(path);
  if (base.id !== 'ep01_desert') return base;
  const [second, third, fourth, fifth, sixth, seventh, eighth, ninth, tenth] = await Promise.all([
    loadScenario(join(import.meta.dir, '../../content/ep02_captivity.yaml')),
    loadScenario(join(import.meta.dir, '../../content/ep03_palace.yaml')),
    loadScenario(join(import.meta.dir, '../../content/ep04_night.yaml')),
    loadScenario(join(import.meta.dir, '../../content/ep05_audience.yaml')),
    loadScenario(join(import.meta.dir, '../../content/ep06_library.yaml')),
    loadScenario(join(import.meta.dir, '../../content/ep07_harem.yaml')),
    loadScenario(join(import.meta.dir, '../../content/ep08_harem.yaml')),
    loadScenario(join(import.meta.dir, '../../content/ep09_palace.yaml')),
    loadScenario(join(import.meta.dir, '../../content/ep10_internal.yaml')),
  ]);
  if (third.start !== 'ep03_c001') throw new ScenarioError('3화 시작은 ep03_c001이어야 합니다');
  if (fourth.id !== 'ep04_night' || fourth.start !== 'ep04_c001') throw new ScenarioError('4화는 ep04_night의 ep04_c001에서 시작해야 합니다');
  const throughThird = connectChapter(connectContinuation(base, second), third, ['ep02_court_boundary']);
  const throughFourth = connectChapter(throughThird, fourth, ['ep03_c061']);
  if (fifth.id !== 'ep05_audience' || fifth.start !== 'ep05_entry') throw new ScenarioError('5화는 ep05_audience의 ep05_entry에서 시작해야 합니다');
  const throughFifth = connectChapter(throughFourth, fifth, ['ep04_boundary', 'ep04_distance_boundary']);
  if (sixth.id !== 'ep06_library' || sixth.start !== 'ep06_c001') throw new ScenarioError('6화는 ep06_library의 ep06_c001에서 시작해야 합니다');
  const throughSixth = connectChapter(throughFifth, sixth, ['ep05_boundary']);
  if (seventh.id !== 'ep07_harem' || seventh.start !== 'ep07_c001') throw new ScenarioError('7화는 ep07_harem의 ep07_c001에서 시작해야 합니다');
  const throughSeventh = connectChapter(throughSixth, seventh, ['ep06_c065']);
  if (eighth.id !== 'ep08_harem' || eighth.start !== 'ep08_c001') throw new ScenarioError('8화는 ep08_harem의 ep08_c001에서 시작해야 합니다');
  const throughEighth = connectChapter(throughSeventh, eighth, ['ep07_c063']);
  if (ninth.id !== 'ep09_palace' || ninth.start !== 'ep09_c001') throw new ScenarioError('9화는 ep09_palace의 ep09_c001에서 시작해야 합니다');
  const throughNinth = connectChapter(throughEighth, ninth, ['ep08_c062']);
  if (tenth.id !== 'ep10_internal' || tenth.start !== 'ep10_c001') throw new ScenarioError('10화는 ep10_internal의 ep10_c001에서 시작해야 합니다');
  return connectChapter(throughNinth, tenth, ['ep09_c084']);
}

/**
 * 예전 버전의 연결 대상 종료 저장만 다음 장으로 연다.
 * 이미 읽은 경계의 줄과 효과를 재생하지 않고 실제 장 경계 선택을 한 번 실행한다.
 */
export async function resumeCampaign(
  engine: Engine,
  saved: GameState,
  observer?: ViewpointObserver,
): Promise<{ state: GameState; step: Step; continued: boolean }> {
  if (saved.beat === 'ep04_distance_boundary' && saved.flags.ep04_distance_kept !== true) {
    throw new SaveError('거리 성취 종료 저장에 성취 기록이 없습니다. 원래 저장과 판정 기록을 확인해 주세요.');
  }
  const boundary = Object.entries(BOUNDARIES).find(([beat]) => beat === saved.beat)?.[1];
  const bridge = engine.scenario.beats[saved.beat];
  if (!boundary || !bridge?.choices?.some((choice) => choice.id === boundary.choice) || (saved.ending !== null && saved.ending !== boundary.ending)) {
    return { state: saved, step: engine.resume(saved, observer), continued: false };
  }
  let current = saved;
  if (saved.beat === 'ep05_boundary') {
    const flags = ['ep05_시선답변', 'ep05_지난밤답변', 'ep05_지난밤되물음'] as const;
    const [reply, answer, question] = flags.map((flag) => saved.flags[flag] === true);
    if (!(reply && ((answer && question) || (!answer && !question)))) {
      if (flags.some((flag) => saved.flags[flag] !== undefined)) {
        throw new SaveError('5화 종료 저장의 인사 발화 기록이 서로 맞지 않습니다. 원래 저장의 대사 기록을 확인해 주세요.');
      }
      const recorded = flags.map((flag) => {
        const line = engine.scenario.beats.ep05_c055?.lines.find((candidate) => candidate.sets === flag);
        if (!line) throw new ScenarioError(`5화 인사 발화 선언이 없습니다: ${flag}`);
        return saved.spoken?.[line.speaker]?.includes(line.text) === true
          || saved.recent.some((entry) => entry.speaker === line.speaker && entry.text === line.text);
      });
      const standardBeat = saved.log.some((entry) => entry.kind === 'beat' && entry.beat === 'ep05_c055');
      const shortBeat = saved.log.some((entry) => entry.kind === 'beat' && entry.beat === 'ep05_reply_short');
      if (!((standardBeat && !shortBeat && recorded.every(Boolean))
        || (shortBeat && !standardBeat && recorded[0] && !recorded[1] && !recorded[2]))) {
        throw new SaveError('5화 종료 저장의 인사 발화를 구분할 기록이 없습니다. 원래 저장의 대사 기록을 확인해 주세요.');
      }
      current = structuredClone(saved);
      for (const [index, flag] of flags.entries()) if (recorded[index]) current.flags[flag] = true;
    }
  }
  if (current.ending !== boundary.ending) {
    return { state: current, step: engine.resume(current, observer), continued: false };
  }
  const opened = current === saved ? structuredClone(saved) : current;
  opened.ending = null;
  opened.flags[CONTINUATION_FLAG] = true;
  const result = await engine.act(opened, { type: 'choose', id: boundary.choice }, undefined, observer ? { observer } : undefined);
  return { ...result, continued: true };
}
