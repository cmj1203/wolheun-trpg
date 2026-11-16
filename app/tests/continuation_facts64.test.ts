import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { connectContinuation, loadCampaignScenario } from '../src/engine/continuation.ts';
import { ABOUT_UNKNOWN, activeFacts, Engine, type GmContext, type GmLines, type Interpretation } from '../src/engine/engine.ts';
import { assertState } from '../src/engine/save.ts';
import { loadScenario, ScenarioError } from '../src/engine/scenario.ts';
import type { FactSpec, GameEvent, GameState, Scenario } from '../src/engine/types.ts';
import { loadLore, loreFor, withNotes } from '../src/gm/lore.ts';
import { buildInterpretSystem, questionFacts } from '../src/gm/prompt.ts';
import { ViewpointPlayback } from '../src/server/viewpoint.ts';
import { APP, FakeGm, META, SCENARIO_PATH } from './helpers.ts';

const lore = await loadLore(join(APP, 'content/lore_wolheun.yaml'));
const scenario = withNotes(await loadCampaignScenario(SCENARIO_PATH), lore);
const eighth = await loadScenario(join(APP, 'content/ep08_harem.yaml'));
const fifth = await loadScenario(join(APP, 'content/ep05_audience.yaml'));
const fixture: unknown = await Bun.file(join(import.meta.dir, 'fixtures/continuation-facts-earned64.json')).json();
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
if (!record(fixture) || !record(fixture.frames) || !record(fixture.checkpoints) || !record(fixture.http)) throw new ScenarioError('실제 프레임 fixture 형태가 다릅니다');
const recordings = fixture;

function frameState(name: string): GameState {
  if (!record(recordings.frames)) throw new ScenarioError('관측 목록 없음');
  const frame = recordings.frames[name];
  if (!record(frame)) throw new ScenarioError(`실제 관측 없음: ${name}`);
  return assertState(scenario, structuredClone(frame.state));
}

function checkpoint(slot: string): GameState {
  if (!record(recordings.checkpoints)) throw new ScenarioError('획득 목록 없음');
  const entry = recordings.checkpoints[slot];
  if (!record(entry) || !record(entry.snapshot)) throw new ScenarioError(`실제 획득 저장 없음: ${slot}`);
  return assertState(scenario, structuredClone(entry.snapshot.state));
}

function fact(index: number): FactSpec {
  const value = eighth.facts[index];
  if (!value) throw new ScenarioError(`8화 원본 사실 없음: ${index}`);
  return value;
}

class EvidenceGm extends FakeGm {
  readonly questions: GmContext[] = [];
  readonly evidence: Record<string, string>[] = [];

  override async interpret(ctx: GmContext): Promise<Interpretation> {
    this.questions.push(ctx);
    return { kind: 'ask', about: ABOUT_UNKNOWN, source: 'rule', meta: META };
  }

  override async explain(ctx: GmContext): Promise<GmLines> {
    this.evidence.push(questionFacts(ctx, loreFor(lore, ctx.state)));
    return { lines: [{ speaker: 'GM', text: '그건 아직 몰라.' }], meta: META };
  }
}

const texts = (state: GameState, source: Scenario = scenario): string[] => activeFacts(source, state).map(value => value.text);
function token(event: GameEvent): string {
  if (!('frame' in event) || typeof event.frame !== 'string') throw new ScenarioError('관측 frame 토큰 없음');
  return event.frame;
}

test('실제 2화 confirmed 질문의 공개 근거와 분류 system에 미래·standalone 사실이 들어가지 않는다', async () => {
  if (!record(recordings.http) || !record(recordings.http.viewpoint) || !record(recordings.http.viewpoint.current)) throw new ScenarioError('실제 HTTP 확정 프레임 없음');
  const current = recordings.http.viewpoint.current;
  const privateState = assertState(scenario, structuredClone(current.state));
  const authority = assertState(scenario, structuredClone(recordings.http.state));
  const gm = new EvidenceGm();
  const engine = new Engine(scenario, gm);
  await engine.act(authority, { type: 'ask', text: '방금 저 둘이 한 대화를 아시나도 들은 거야?' }, undefined, {
    question: { state: privateState, scene: privateState.beat },
  });
  const ctx = gm.questions[0];
  expect(ctx).toBeDefined();
  if (!ctx) throw new ScenarioError('질문 문맥이 전달되지 않았습니다');
  const publicEvidence = Object.values(gm.evidence[0] ?? {});
  expect(publicEvidence).not.toContain(fact(0).text);
  expect(publicEvidence).not.toContain(fact(1).text);
  const hood = scenario.facts.find(value => value.if === 'flag:후드_벗음');
  expect(hood).toBeDefined();
  if (!hood) throw new ScenarioError('기존 후드 사실 없음');
  expect(publicEvidence).toContain(hood.text);
  const system = buildInterpretSystem(ctx, loreFor(lore, ctx.state));
  expect(system).not.toContain(fact(0).text);
  expect(system).not.toContain(fact(1).text);
});

test('실제 획득7화 경계에서 새 엔진으로8화 첫 scene에 진입하면 대기 사실은 활성화된다', async () => {
  const gm = new FakeGm();
  const engine = new Engine(scenario, gm);
  const source = checkpoint('33');
  const before = structuredClone(source);
  const observations: Parameters<ViewpointPlayback['observe']>[0][] = [];
  await engine.act(source, { type: 'choose', id: 'continue_ep08' }, undefined, { observer: observation => observations.push(observation) });
  const scene = observations.find(observation => observation.event.type === 'scene' && observation.state.beat === 'ep08_c001');
  expect(scene).toBeDefined();
  if (!scene) throw new ScenarioError('실제8화 시작 관측 없음');
  const state = { ...scene.state, log: [...scene.readLog()] };
  expect(state.flags.ep08_r01).toBeUndefined();
  expect(state.flags.ep08_r10).toBeUndefined();
  expect(texts(state)).toContain(fact(1).text);
  expect(texts(state)).not.toContain(fact(0).text);
  expect(texts(state)).not.toContain(fact(2).text);
  expect(source).toEqual(before);
  expect(gm.calls).toEqual([]);
});

test('기존 실제8화 첫 대사 프레임도 원시 플래그를 주입하지 않고 현재 대기 사실을 보존한다', () => {
  const state = frameState('eightLine');
  expect(state.flags.ep08_r01).toBeUndefined();
  expect(state.flags['말함_ep08_c001']).toBe(true);
  expect(texts(state)).toContain(fact(1).text);
  expect(texts(state)).not.toContain(fact(0).text);
});

test('실제 획득8화 선택에서 나온 confirmed 직전·직후를 앞서간 권위 상태와 분리한다', async () => {
  const gm = new EvidenceGm();
  const engine = new Engine(scenario, gm);
  const playback = new ViewpointPlayback();
  const result = await engine.act(checkpoint('34'), { type: 'choose', id: 'ep08_c024_ask' }, undefined, { observer: playback.observe });
  expect(result.state.flags.ep08_r10).toBe(true);
  let beforeQuestion: ReturnType<ViewpointPlayback['question']> | undefined;
  let afterQuestion: ReturnType<ViewpointPlayback['question']> | undefined;
  for (const event of result.step.events) {
    if (!('frame' in event)) continue;
    playback.confirm(token(event));
    const question = playback.question(token(event));
    if (event.type === 'scene' && event.beat === 'ep08_c034') beforeQuestion = question;
    if (event.type === 'line' && question.state.beat === 'ep08_c034' && question.state.flags.ep08_r10 === true) {
      afterQuestion = question;
      break;
    }
  }
  expect(beforeQuestion).toBeDefined();
  expect(afterQuestion).toBeDefined();
  if (!beforeQuestion || !afterQuestion) throw new ScenarioError('공개 직전·직후 실제 관측 없음');
  expect(beforeQuestion.state.flags.ep08_r10).toBeUndefined();
  await engine.act(result.state, { type: 'ask', text: '누르에게서 누구를 조심하라고 들었어?' }, undefined, { question: beforeQuestion });
  expect(gm.questions.at(-1)?.state.flags.ep08_r10).toBeUndefined();
  expect(Object.values(gm.evidence.at(-1) ?? {})).toContain(fact(1).text);
  expect(Object.values(gm.evidence.at(-1) ?? {})).not.toContain(fact(2).text);
  await engine.act(result.state, { type: 'ask', text: '누르에게서 누구를 조심하라고 들었어?' }, undefined, { question: afterQuestion });
  expect(Object.values(gm.evidence.at(-1) ?? {})).not.toContain(fact(1).text);
  expect(Object.values(gm.evidence.at(-1) ?? {})).toContain(fact(2).text);
  expect(result.state.flags.ep08_r10).toBe(true);
});

test.each(['ninth', 'tenth'])('실제 %s 프레임에서 이전에 획득한 사실을 버리지 않고 standalone만 제외한다', name => {
  const state = frameState(name);
  expect(state.flags.ep08_r10).toBe(true);
  expect(texts(state)).toContain(fact(2).text);
  expect(texts(state)).not.toContain(fact(0).text);
});

test('다른 새 부정·OR 조건도 소유 장 진입 전에 참이 되지 않는다', async () => {
  const base = await loadScenario(SCENARIO_PATH);
  const second = await loadScenario(join(APP, 'content/ep02_captivity.yaml'));
  const contextual: FactSpec = { if: 'flag:unit_offered || !flag:unit_answered', text: '현재 장의 대답 대기 상태', state_guard: [] };
  const combined = connectContinuation(base, { ...second, facts: [contextual] });
  // 조건 결합 자체의 단위 회귀다. 실제 정상판 진행 증거로 세지 않는다.
  const beforeChapter = new Engine(base, new FakeGm()).newGame(913, 'scope-condition-unit').state;
  expect(texts(beforeChapter, combined)).not.toContain(contextual.text);
});

test('조건 단위에서 앞 화 사건의 계승을 사실 소유 화 진입까지 숨기지 않는다', () => {
  const state = checkpoint('20');
  const carried = fifth.facts[0];
  if (!carried) throw new ScenarioError('거리 유지 계승 사실 없음');
  // 사건 조건 수명의 단위 회귀이며 가상 분기를 실제 완주로 승격하지 않는다.
  const unit = { ...state, flags: { ...state.flags, ep04_distance_kept: true } };
  expect(texts(unit)).toContain(carried.text);
});

test('원본8화 standalone 사실과 입력 객체는 캠페인 조립으로 훼손되지 않는다', async () => {
  const base = await loadScenario(SCENARIO_PATH);
  const beforeBase = structuredClone(base);
  const beforeEighth = structuredClone(eighth);
  connectContinuation(base, eighth);
  expect(base).toEqual(beforeBase);
  expect(eighth).toEqual(beforeEighth);
  expect(texts(frameState('eightLine'), eighth)).toContain(fact(0).text);
});
