import { TIER_LABEL, TRACKS, TRACK_INFO, type GameState, type ItemView, type RollResult, type Scenario, type TrackView } from './types.ts';

export interface DecisionView {
  beatTitle: string;
  kind: 'choice' | 'input';
  text: string;
  detail: string;
  playMs: number;
}

export interface CheckView extends RollResult {
  beatTitle: string;
  tierLabel: string;
  playMs: number;
}

export interface ResultSummary {
  scenarioTitle: string;
  episode: string;
  ending: { id: string; title: string; summary: string; nextHook: string } | null;
  playMs: number;
  startedAt: number;
  decisions: DecisionView[];
  checks: CheckView[];
  tracks: TrackView[];
  items: ItemView[];
  gm: { calls: number; retries: number; blocked: number; fallbacks: number; llmMs: number };
}

export function summarize(scenario: Scenario, state: GameState): ResultSummary {
  const titleOf = (beat: string) => scenario.beats[beat]?.title ?? beat;
  const approachLabel = (beat: string, id: string | null) =>
    scenario.beats[beat]?.free?.approaches.find((a) => a.id === id)?.label ?? '';
  const decisions: DecisionView[] = [];
  const checks: CheckView[] = [];
  const gm = { calls: 0, retries: 0, blocked: 0, fallbacks: 0, llmMs: 0 };
  for (const e of state.log) {
    if (e.kind === 'choice') {
      decisions.push({ beatTitle: titleOf(e.beat), kind: 'choice', text: e.text, detail: e.choice.startsWith('approach:') ? '행동 버튼' : '선택지', playMs: e.playMs });
    } else if (e.kind === 'input') {
      const detail = e.result === 'approach' ? `자유 입력 → ${approachLabel(e.beat, e.approach)}` : e.result === 'talk' ? '자유 입력 → 대화' : '자유 입력 → 즉흥 행동';
      decisions.push({ beatTitle: titleOf(e.beat), kind: 'input', text: e.text, detail, playMs: e.playMs });
    } else if (e.kind === 'check') {
      checks.push({ ...e.roll, beatTitle: titleOf(e.beat), tierLabel: TIER_LABEL[e.roll.tier], playMs: e.playMs });
    } else if (e.kind === 'gm') {
      gm.calls += 1;
      gm.retries += Math.max(0, e.attempts - 1);
      gm.blocked += e.violations.length;
      gm.fallbacks += e.fallback ? 1 : 0;
      gm.llmMs += e.ms;
    }
  }
  const endingBeat = Object.values(scenario.beats).find((b) => b.ending?.id === state.ending);
  const ending = endingBeat?.ending
    ? { id: endingBeat.ending.id, title: endingBeat.ending.title, summary: endingBeat.ending.summary, nextHook: endingBeat.ending.next_hook }
    : null;
  return {
    scenarioTitle: scenario.title,
    episode: scenario.episode,
    ending,
    playMs: state.playMs,
    startedAt: state.startedAt,
    decisions,
    checks,
    tracks: TRACKS.map((key) => ({ key, ...TRACK_INFO[key], value: state.tracks[key] })),
    items: state.items.map((id) => {
      const item = scenario.sheet.items.find((i) => i.id === id);
      return { id, name: item?.name ?? id, desc: item?.desc ?? '' };
    }),
    gm,
  };
}
