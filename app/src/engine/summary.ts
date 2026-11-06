import { TIER_LABEL, TRACKS, trackView, type GameState, type ItemView, type PriceTag, type RollResult, type Scenario, type TrackView } from './types.ts';

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

/** 판이 끝난 뒤 돌아보는 줄. 선택·주사위 눈·대가를 일어난 순서대로 놓는다. */
export type ReplayEntry =
  | ({ kind: 'decision' } & Omit<DecisionView, 'kind'>)
  | ({ kind: 'check' } & CheckView)
  | { kind: 'price'; beatTitle: string; tag: PriceTag; text: string; playMs: number };

export interface ResultSummary {
  scenarioTitle: string;
  episode: string;
  ending: { id: string; title: string; summary: string; nextHook: string; bad: boolean } | null;
  playMs: number;
  startedAt: number;
  decisions: DecisionView[];
  checks: CheckView[];
  replay: ReplayEntry[];
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
  const replay: ReplayEntry[] = [];
  const decide = (d: DecisionView) => {
    decisions.push(d);
    const { kind: _kind, ...rest } = d;
    replay.push({ kind: 'decision', ...rest });
  };
  const gm = { calls: 0, retries: 0, blocked: 0, fallbacks: 0, llmMs: 0 };
  for (const e of state.log) {
    if (e.kind === 'choice') {
      decide({ beatTitle: titleOf(e.beat), kind: 'choice', text: e.text, detail: e.choice.startsWith('approach:') ? '행동 버튼' : '선택지', playMs: e.playMs });;
    } else if (e.kind === 'input') {
      // 여우에게 물은 말은 이야기 속 결정이 아니다.
      if (e.result === 'ask' || e.result === 'game') continue;
      const detail = e.result === 'approach' ? `자유 입력 → ${approachLabel(e.beat, e.approach)}` : e.result === 'talk' ? '자유 입력 → 대화' : e.result === 'idle' ? '자유 입력 → 가만히 있음' : '자유 입력 → 즉흥 행동';
      decide({ beatTitle: titleOf(e.beat), kind: 'input', text: e.text, detail, playMs: e.playMs });
    } else if (e.kind === 'check') {
      const check: CheckView = { ...e.roll, beatTitle: titleOf(e.beat), tierLabel: TIER_LABEL[e.roll.tier], playMs: e.playMs };
      checks.push(check);
      replay.push({ kind: 'check', ...check });
    } else if (e.kind === 'price') {
      replay.push({ kind: 'price', beatTitle: titleOf(e.beat), tag: e.tag, text: e.text, playMs: e.playMs });
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
    ? { id: endingBeat.ending.id, title: endingBeat.ending.title, summary: endingBeat.ending.summary, nextHook: endingBeat.ending.next_hook, bad: endingBeat.ending.bad === true }
    : null;
  return {
    scenarioTitle: scenario.title,
    episode: scenario.episode,
    ending,
    playMs: state.playMs,
    startedAt: state.startedAt,
    decisions,
    checks,
    replay,
    tracks: TRACKS.map((key) => trackView(scenario.fates, key, state.tracks[key])),
    items: state.items.map((id) => {
      const item = scenario.sheet.items.find((i) => i.id === id);
      return { id, name: item?.name ?? id, desc: item?.desc ?? '' };
    }),
    gm,
  };
}
