import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { evalCond } from '../src/engine/conditions.ts';
import { Engine, type GmPort } from '../src/engine/engine.ts';
import { readSave, writeSave } from '../src/engine/save.ts';
import { GameError, type Action, type GameState, type Scenario, type Step, type ViewpointObserver } from '../src/engine/types.ts';

type Origin = { readonly seed: number; readonly fromCheckpoint?: never }
  | { readonly fromCheckpoint: string; readonly seed?: never };
type Target = { readonly kind: 'ending'; readonly id: string }
  | { readonly kind: 'checkpoint'; readonly id: string; readonly beat: string };

export type CampaignQaRoute = Origin & {
  readonly id: string;
  readonly target: Target;
  readonly choices: Readonly<Record<string, string>>;
  readonly inputs: Readonly<Record<string, readonly string[]>>;
  readonly useLuck: boolean;
  readonly confirm: boolean;
  readonly maxActions: number;
  readonly expectations?: readonly { readonly beat: string; readonly condition: string }[];
};

export interface QaProvider {
  readonly kind: 'real-model' | 'test-double';
  create(trace: (value: unknown) => void, transport: (value: unknown) => void): GmPort;
}

export interface QaRouteResult {
  readonly id: string;
  readonly completed: boolean;
  readonly actualEnding: string | null;
  readonly beat: string | null;
  readonly checkpoint: string | null;
  readonly error: string | null;
  readonly actions: number;
  readonly modelTraceRecords: number;
  readonly generatedLines: number;
  readonly review: 'pending';
}

export class CampaignQaError extends Error {
  override name = 'CampaignQaError';
}

interface EarnedCheckpoint {
  readonly slot: string;
  readonly sha256: string;
  readonly rootSession: string;
  readonly rootSeed: number;
  readonly sourceRoute: string;
  readonly beat: string;
  readonly afterActions: number;
}

const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function catalogEntry(value: unknown): readonly [string, EarnedCheckpoint] {
  if (!Array.isArray(value) || value.length !== 2) throw new CampaignQaError('체크포인트 색인 형식이 다릅니다');
  const id: unknown = value[0];
  const row: unknown = value[1];
  if (typeof id !== 'string' || !isRecord(row)
    || typeof row.slot !== 'string' || typeof row.sha256 !== 'string'
    || typeof row.rootSession !== 'string' || typeof row.rootSeed !== 'number'
    || typeof row.sourceRoute !== 'string' || typeof row.beat !== 'string'
    || typeof row.afterActions !== 'number') throw new CampaignQaError('획득 체크포인트의 출처가 부족합니다');
  return [id, {
    slot: row.slot, sha256: row.sha256, rootSession: row.rootSession, rootSeed: row.rootSeed,
    sourceRoute: row.sourceRoute, beat: row.beat, afterActions: row.afterActions,
  }];
}

/** 실제 newGame과 이 실행에서 획득한 저장만 사용한다. 함수 인자로 GameState를 받지 않는다. */
export async function executeCampaignQa(
  scenario: Scenario,
  provider: QaProvider,
  routes: readonly CampaignQaRoute[],
  directory: string,
  priorRun?: string,
): Promise<readonly QaRouteResult[]> {
  if (new Set(routes.map((route) => route.id)).size !== routes.length) throw new CampaignQaError('경로 ID가 중복됩니다');
  mkdirSync(directory, { recursive: true });
  const saveDirectory = join(directory, 'checkpoints');
  mkdirSync(saveDirectory);
  const checkpoints = new Map<string, EarnedCheckpoint>();
  let checkpointNumber = 0;
  const results: QaRouteResult[] = [];
  const scenarioHash = digest(JSON.stringify(scenario));
  const sourceLines = new Map<string, string[]>();
  for (const [beat, spec] of Object.entries(scenario.beats)) {
    for (const line of [...(spec.lead ?? []), ...spec.lines]) {
      const key = `${line.speaker}\0${line.text}`;
      sourceLines.set(key, [...(sourceLines.get(key) ?? []), beat]);
    }
  }
  writeFileSync(join(directory, 'origin.json'), JSON.stringify({
    surface: 'engine', provider: provider.kind, scenarioHash,
    scenario: scenario.id, canonicalStart: scenario.start,
    engine: { luckPrompt: true },
    runtimeHashes: Object.fromEntries([
      'campaign_qa_driver.ts', 'campaign_qa_main.ts', '../src/engine/engine.ts',
      '../src/engine/scenario.ts', '../src/engine/continuation.ts', '../src/engine/text.ts',
      '../src/gm/gm.ts', '../src/gm/prompt.ts', '../src/gm/rules.ts',
      '../src/gm/validate.ts', '../src/gm/llm.ts', '../src/gm/lore.ts',
    ].map((path) => [path, digest(readFileSync(join(import.meta.dir, path)))])),
    acceptsInjectedState: false, uiCompleted: false, artApproved: false,
  }, null, 2), { flag: 'wx' });

  if (priorRun !== undefined) {
    const priorOrigin: unknown = JSON.parse(readFileSync(join(priorRun, 'origin.json'), 'utf8'));
    if (!isRecord(priorOrigin) || priorOrigin.surface !== 'engine'
      || priorOrigin.provider !== provider.kind || priorOrigin.scenario !== scenario.id
      || priorOrigin.canonicalStart !== scenario.start
      || !isRecord(priorOrigin.engine) || priorOrigin.engine.luckPrompt !== true) {
      throw new CampaignQaError('이 실행과 출발·모델·행운 설정이 다른 저장 계보입니다');
    }
    const index: unknown = JSON.parse(readFileSync(join(priorRun, 'checkpoint-index.json'), 'utf8'));
    if (!Array.isArray(index)) throw new CampaignQaError('획득 체크포인트 색인이 없습니다');
    writeFileSync(join(directory, 'resume-origin.json'), JSON.stringify({ priorRun, priorOrigin }, null, 2), { flag: 'wx' });
    const copied = new Map<string, EarnedCheckpoint>();
    for (const candidate of index) {
      const [id, checkpoint] = catalogEntry(candidate);
      let imported = copied.get(checkpoint.slot);
      if (!imported) {
        const priorSaves = join(priorRun, 'checkpoints');
        if (digest(readFileSync(join(priorSaves, `${checkpoint.slot}.json`))) !== checkpoint.sha256) {
          throw new CampaignQaError('이전 실제 체크포인트 파일이 변경됐습니다');
        }
        const state = await readSave(priorSaves, checkpoint.slot, scenario);
        if (state.session !== checkpoint.rootSession || state.seed !== checkpoint.rootSeed
          || state.beat !== checkpoint.beat
          || state.log.find((entry) => entry.kind === 'start')?.seed !== checkpoint.rootSeed
          || state.log.find((entry) => entry.kind === 'beat')?.beat !== scenario.start) {
          throw new CampaignQaError('실제 newGame 출발 계보가 일치하지 않습니다');
        }
        const slot = `earned_${checkpointNumber++}`;
        await writeSave(saveDirectory, slot, scenario, state);
        imported = { ...checkpoint, slot, sha256: digest(readFileSync(join(saveDirectory, `${slot}.json`))) };
        copied.set(checkpoint.slot, imported);
      }
      checkpoints.set(id, imported);
    }
    writeFileSync(join(directory, 'checkpoint-index.json'), JSON.stringify([...checkpoints], null, 2));
  }

  for (const route of routes) {
    const transcript = join(directory, `${route.id}.jsonl`);
    writeFileSync(transcript, '', { flag: 'wx' });
    let actions = 0;
    let modelTraceRecords = 0;
    let generatedLines = 0;
    let current: { state: GameState; step: Step } | undefined;
    let rootSession = '';
    let rootSeed = 0;
    let earned: string | null = null;
    let completed = false;
    let error: string | null = null;
    const usedInputs = new Map<string, number>();
    const checked = new Set<number>();
    const record = (kind: string, detail: unknown): void => {
      appendFileSync(transcript, `${JSON.stringify({ route: route.id, action: actions, kind, detail })}\n`);
    };
    const observe: ViewpointObserver = (entry) => {
      record('observation', {
        source: entry.source, event: entry.event, state: entry.state, logLength: entry.logLength,
      });
    };
    const engine = new Engine(scenario, provider.create((trace) => {
      modelTraceRecords += 1;
      record('model_trace_review', { trace, review: 'pending' });
    }, (transport) => record('llm_transport', transport)), Date.now, true);

    try {
      if (route.fromCheckpoint !== undefined) {
        const checkpoint = checkpoints.get(route.fromCheckpoint);
        if (!checkpoint) throw new CampaignQaError(`실제 획득하지 않은 체크포인트: ${route.fromCheckpoint}`);
        const filename = join(saveDirectory, `${checkpoint.slot}.json`);
        if (digest(readFileSync(filename)) !== checkpoint.sha256) throw new CampaignQaError('획득 체크포인트 파일이 변경됐습니다');
        const state = await readSave(saveDirectory, checkpoint.slot, scenario);
        rootSession = checkpoint.rootSession;
        rootSeed = checkpoint.rootSeed;
        current = { state, step: engine.resume(state, observe) };
        record('earned_resume', { checkpoint: route.fromCheckpoint, ...checkpoint });
      } else {
        rootSeed = route.seed;
        rootSession = `qa-${route.id}-${Date.now()}`;
        current = engine.newGame(rootSeed, rootSession, observe);
        record('new_game', { rootSeed, rootSession, start: scenario.start });
      }

      while (true) {
        const { state, step } = current;
        record('state', { state, prompt: step.prompt });
        record('step', step);
        const historical = route.fromCheckpoint !== undefined && actions === 0;
        for (const event of step.events) {
          if (event.type !== 'line') continue;
          if (!historical && event.by === 'gm') generatedLines += 1;
          record('line_review', {
            producer: event.by, line: event, review: 'pending',
            scope: historical ? 'historical-resume-line' : event.by === 'gm'
              ? 'each-generated-line' : 'script-line-needs-source-check',
            originalSourceMatches: sourceLines.get(`${event.speaker}\0${event.text}`) ?? [],
          });
        }
        let currentCheckpoint: EarnedCheckpoint | undefined;
        if (step.prompt.type !== 'end') {
          const slot = `earned_${checkpointNumber++}`;
          await writeSave(saveDirectory, slot, scenario, state);
          currentCheckpoint = {
            slot, sha256: digest(readFileSync(join(saveDirectory, `${slot}.json`))),
            rootSession, rootSeed, sourceRoute: route.id, beat: state.beat, afterActions: actions,
          };
          const id = `${route.id}_${actions}`;
          checkpoints.set(id, currentCheckpoint);
          record('checkpoint_earned', { id, ...currentCheckpoint });
          writeFileSync(join(directory, 'checkpoint-index.json'), JSON.stringify([...checkpoints], null, 2));
        }
        for (const [index, expectation] of (route.expectations ?? []).entries()) {
          if (checked.has(index) || state.beat !== expectation.beat) continue;
          const holds = evalCond(expectation.condition, state);
          record('expectation', { ...expectation, holds });
          if (!holds) throw new CampaignQaError(`실제 상태 기대 불일치: ${expectation.beat} ${expectation.condition}`);
          checked.add(index);
        }

        if (route.target.kind === 'checkpoint' && state.beat === route.target.beat && step.prompt.type !== 'end') {
          if (checkpoints.has(route.target.id)) throw new CampaignQaError(`체크포인트 이름 중복: ${route.target.id}`);
          if (checked.size !== (route.expectations?.length ?? 0)) throw new CampaignQaError('도달하지 못한 기대 조건이 있습니다');
          if (!currentCheckpoint) throw new CampaignQaError('현재 실제 입력 경계 저장이 없습니다');
          checkpoints.set(route.target.id, currentCheckpoint);
          record('checkpoint_alias', { id: route.target.id, ...currentCheckpoint });
          writeFileSync(join(directory, 'checkpoint-index.json'), JSON.stringify([...checkpoints], null, 2));
          earned = route.target.id;
          completed = true;
          break;
        }
        if (state.ending !== null || step.prompt.type === 'end') {
          if (route.target.kind !== 'ending' || state.ending !== route.target.id) {
            throw new CampaignQaError(`실제 분기 결말을 그대로 기록합니다: ${state.ending ?? '종료 ID 없음'}`);
          }
          if (checked.size !== (route.expectations?.length ?? 0)) throw new CampaignQaError('완주했지만 도달하지 못한 기대 조건이 있습니다');
          completed = true;
          break;
        }
        if (actions >= route.maxActions) throw new CampaignQaError('유한 진행 한도 도달: 완주로 세지 않습니다');

        let action: Action;
        const inputIndex = usedInputs.get(state.beat) ?? 0;
        const plannedInput = route.inputs[state.beat]?.[inputIndex];
        if (state.pendingIntent || state.pendingRisk) {
          action = { type: 'confirm', ok: route.confirm };
        } else if (plannedInput !== undefined && step.prompt.type !== 'luck') {
          const beat = scenario.beats[state.beat];
          if (!beat?.free && !beat?.conversation) throw new CampaignQaError(`현재 장면에 실제 입력 자리가 없습니다: ${state.beat}`);
          usedInputs.set(state.beat, inputIndex + 1);
          action = { type: 'free', text: plannedInput };
        } else {
          switch (step.prompt.type) {
            case 'choices': {
              const id = route.choices[state.beat];
              if (id === undefined) throw new CampaignQaError(`미계획 실제 선택: ${state.beat}`);
              if (!step.prompt.options.some((option) => option.id === id)) throw new CampaignQaError(`실제 표시되지 않은 선택: ${state.beat} ${id}`);
              action = { type: 'choose', id };
              break;
            }
            case 'free': {
              const index = usedInputs.get(state.beat) ?? 0;
              const text = route.inputs[state.beat]?.[index];
              if (text === undefined) throw new CampaignQaError(`미준비 실제 입력: ${state.beat}[${index}]`);
              usedInputs.set(state.beat, index + 1);
              action = { type: 'free', text };
              break;
            }
            case 'luck':
              action = { type: 'luck', use: route.useLuck };
              break;
            default:
              throw new CampaignQaError(`처리하지 못한 진행 상태: ${step.prompt satisfies never}`);
          }
        }
        actions += 1;
        record('action', action);
        const previousLogLength = state.log.length;
        current = await engine.act(state, action, undefined, { observer: observe });
        record('new_audit', current.state.log.slice(previousLogLength));
      }
    } catch (caught) {
      if (!(caught instanceof CampaignQaError) && !(caught instanceof GameError)) throw caught;
      error = `${caught.name}: ${caught.message}`;
      record('incomplete', { error, state: current?.state });
    }

    const result: QaRouteResult = {
      id: route.id, completed, actualEnding: current?.state.ending ?? null,
      beat: current?.state.beat ?? null, checkpoint: earned, error,
      actions, modelTraceRecords, generatedLines, review: 'pending',
    };
    results.push(result);
    writeFileSync(join(directory, 'summary.json'), JSON.stringify({
      surface: 'engine', provider: provider.kind, scenarioHash, results,
      storyQaAccepted: false, reason: '모델 문장·고정 원문·목표 coverage·실제 UI·그림 승인을 별도로 검수해야 합니다.',
    }, null, 2));
  }
  return results;
}
