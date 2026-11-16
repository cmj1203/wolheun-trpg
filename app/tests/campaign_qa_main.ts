import { join } from 'node:path';
import { loadCampaignScenario } from '../src/engine/continuation.ts';
import { TIER_LABEL } from '../src/engine/types.ts';
import { DEFAULT_GM_OPTIONS, LocalGm } from '../src/gm/gm.ts';
import { LlmClient } from '../src/gm/llm.ts';
import { loadLore, withNotes } from '../src/gm/lore.ts';
import { CampaignQaError, executeCampaignQa, type CampaignQaRoute, type QaProvider } from './campaign_qa_driver.ts';

const APP = join(import.meta.dir, '..');

class RecordingLlmClient extends LlmClient {
  constructor(
    config: ConstructorParameters<typeof LlmClient>[0],
    private readonly recordTransport: (value: unknown) => void,
  ) {
    super(config);
  }

  override async warm(system: string): Promise<void> {
    this.recordTransport({ kind: 'prefill_request', system });
    return super.warm(system);
  }

  override async chatJson(request: Parameters<LlmClient['chatJson']>[0]): ReturnType<LlmClient['chatJson']> {
    this.recordTransport({ kind: 'generation_request', request });
    return super.chatJson(request);
  }
}

/** 첫 자연 진행 시도. 실제 다른 결말에 도달하면 그 결과를 기록하고 끝낸다. */
export const firstCanonicalRoute: CampaignQaRoute = {
  id: 'canonical_first',
  seed: 913,
  target: { kind: 'ending', id: 'ep10_boundary' },
  useLuck: true,
  confirm: true,
  maxActions: 256,
  choices: {
    e_curious: 'continue_chapter',
    e_survivor: 'continue_chapter',
    ep02_court_boundary: 'continue_ep03',
    ep03_c046: 'ep03_i01_protest',
    ep03_c049: 'ep03_i02_quiet',
    ep03_c061: 'continue_ep04',
    ep04_i01_scout: 'passage',
    ep04_i03_origin: 'conceal',
    ep04_i04_distance: 'retort',
    ep04_boundary: 'continue_ep05',
    ep04_distance_boundary: 'continue_ep05',
    ep05_c020: 'ep05_role_original',
    ep05_c045: 'ep05_summons_original',
    ep05_c053: 'ep05_reply_original',
    ep05_boundary: 'continue_ep06',
    ep06_c003: 'ep06_decline_direct',
    ep06_c008: 'ep06_purpose_direct',
    ep06_c035: 'ep06_origin_direct',
    ep06_c038: 'ep06_question_direct',
    ep06_c046: 'ep06_politics_direct',
    ep06_c056_response: 'ep06_travel_direct',
    ep06_c065: 'continue_ep07',
    ep07_c063: 'continue_ep08',
    ep08_c024: 'ep08_c024_ask',
    ep08_c057: 'ep08_c057_quiet',
    ep08_c062: 'continue_ep09',
    ep09_c063: 'ep09_protest',
    ep09_c080: 'ep09_breath',
    ep09_c084: 'continue_ep10',
    ep10_c026: 'ep10_hair_source',
    ep10_c029: 'ep10_family_tell',
    ep10_c034: 'ep10_name_tell',
    ep10_c043: 'ep10_travel_retort',
    ep10_travel_choice: 'ep10_travel_retort',
    ep10_c052: 'ep10_title_behi',
    ep10_c058: 'ep10_contact_silent',
  },
  inputs: {
    b02_people: [
      '(눈앞의 사람들에게 달려가 말을 건다) 길을 잃었어요. 가까운 마을이 어디인가요?',
      '길을 찾고 있을 뿐이에요. 가까운 마을이 어느 쪽인지 알려 주세요.',
      '(세 사람에게 달려가 다가선다) 크라차로 가는 길을 알려 주세요.',
    ],
    b05_why: [
      '길을 잃었어요. 당신들에게 해를 끼치려는 게 아니에요. 칼을 내려 주세요.',
      '아무것도 훔치지 않았어요. 제 말을 들어 주세요.',
      '(빈손을 보여 준다) 싸우려는 게 아니에요.',
    ],
    b06_swing: [
      '(몸을 옆으로 던져 날아오는 칼날을 피한다)',
      '(자세를 낮추고 칼날이 지나가는 반대쪽으로 몸을 뺀다)',
      '(몸을 굴려 칼날이 닿지 않는 곳으로 피한다)',
    ],
    b08_gaze: [
      '(고개를 들고 붉은 눈을 똑바로 마주한다) 길을 잃었을 뿐이에요.',
      '제가 무슨 잘못을 했는지부터 말해 주세요.',
      '(눈을 피하지 않고 천천히 숨을 고른다)',
    ],
    r2_bind: [
      '아무것도 훔치지 않았어요. 길을 잃고 헤매고 있었을 뿐이에요.',
      '사실대로 말하고 있어요. 제 말을 끝까지 들어 주세요.',
      '(상대를 똑바로 바라보며 고개를 젓는다) 범죄를 저지른 적 없어요.',
    ],
    r3_dusk: [
      '(해가 기우는 방향과 주변 지형을 살펴 걸어갈 길을 정한다)',
      '(바람을 피할 곳에서 몸을 쉬었다가 걸어간다)',
      '(발자국과 지형을 다시 살펴 길을 잡는다)',
    ],
    r4_prove: [
      '(상대의 눈을 피하지 않고 침착하게 말한다) 절 데려가면 길을 찾는 데 쓸모가 있을 거예요.',
      '함부로 내버려 두는 것보다 제 말을 들어 보는 편이 나을 거예요.',
      '(침착하게 주변 지형을 짚으며 길을 찾는 데 도움이 될 만한 점을 설명한다)',
    ],
    r5_claim: [
      '(허리를 세우고 정중한 예법에 맞춰 인사한다)',
      '(태도를 가다듬고 상대의 말에 격식을 갖춰 답한다)',
      '제 말을 가볍게 넘기지 말아 주세요.',
    ],
    ep02_unlock: [
      '(핀으로 걸림쇠를 천천히 더듬어 잠금을 푼다)',
      '(핀의 각도를 바꾸어 걸림쇠가 움직이는 지점을 찾는다)',
      '(작은 소리에 귀를 기울이며 핀을 조금씩 움직여 잠금을 푼다)',
      '(순찰병에게 들키지 않도록 금속 소리를 죽이며 핀으로 잠금쇠를 풀고 문밖으로 나간다)',
    ],
    ep02_question: [
      '(태연한 표정으로 말한다) 문이 열려 있길래 나왔을 뿐이에요.',
      '몰래 도망치려던 게 아니에요. 열린 문으로 나왔어요.',
      '(붙잡힌 손을 내려다본다) 손부터 놓고 이야기해요.',
      '(핀을 숨기고, 우연히 열린 문으로 나왔다고 둘러대 탈옥 수단을 감추려 한다) 문이 잠겨 있지 않았어요.',
    ],
    ep04_i02_accusation: [
      '듣지도 않고 도둑으로 몰지 마세요. 물건을 훔친 적 없어요.',
      '(또렷하게 상대를 바라본다) 무슨 근거로 그런 말을 하는 거죠?',
      '제 이야기를 먼저 들어 주세요.',
    ],
    ep04_origin_free: [
      '길을 잃고 낯선 곳에서 헤매고 있었어요. 그 이상은 말하지 않겠어요.',
      '(입을 다물고 상대를 바라본다)',
    ],
    ep04_distance_free: [
      '(한 걸음 물러서며 손을 들어 상대가 더 다가오지 못하게 한다)',
      '(옆으로 비켜 서며 상대와 거리를 벌린다)',
      '더 가까이 오지 마세요.',
    ],
  },
};

async function main(): Promise<void> {
  const lore = await loadLore(join(APP, 'content/lore_wolheun.yaml'));
  const scenario = withNotes(await loadCampaignScenario(join(APP, 'content/ep01_desert.yaml')), lore);
  for (const [beat, choice] of Object.entries(firstCanonicalRoute.choices)) {
    if (!scenario.beats[beat]?.choices?.some((candidate) => candidate.id === choice)) {
      throw new CampaignQaError(`첫 경로의 실제 선택이 없습니다: ${beat}/${choice}`);
    }
  }
  for (const beat of Object.keys(firstCanonicalRoute.inputs)) {
    if (!scenario.beats[beat]?.free && !scenario.beats[beat]?.conversation) {
      throw new CampaignQaError(`첫 경로의 실제 입력 자리가 없습니다: ${beat}`);
    }
  }
  const terminal = Object.values(scenario.beats).find((beat) => beat.ending?.id === 'ep10_boundary');
  if (!terminal) throw new CampaignQaError('실제 10화 종료가 없습니다');
  const run = Bun.argv.includes('--run');
  if (!run) {
    const outcomeContexts = Object.values(scenario.beats).flatMap((beat) => {
      if (!beat.free) return [];
      return [
        ...Object.keys(beat.free.goals ?? {}).map((id) => ({ group: 'goal', checkpoint: beat.id, outcome: id })),
        ...beat.free.approaches.map((approach) => ({ group: 'approach', checkpoint: beat.id, outcome: approach.id })),
        { group: 'improv', checkpoint: beat.id, outcome: 'improv' },
        ...(beat.free.improv_bold ? [{ group: 'improv_bold', checkpoint: beat.id, outcome: 'improv_bold' }] : []),
      ];
    });
    const runtimeTierCases = outcomeContexts.flatMap((context) => Object.keys(TIER_LABEL).map((tier) => ({
      id: `${context.group}:${context.checkpoint}:${context.outcome}:${tier}`,
      ...context,
      desiredTier: tier,
      earned: false,
      verified: false,
    })));
    console.log(JSON.stringify({
      prepared: true, modelCalls: 0, surface: 'engine', canonicalStart: scenario.start,
      inputBeats: Object.keys(firstCanonicalRoute.inputs).length,
      plannedChoices: Object.keys(firstCanonicalRoute.choices).length,
      runtimeTierPlan: {
        tiers: Object.keys(TIER_LABEL),
        goalCases: runtimeTierCases.filter((entry) => entry.group === 'goal').length,
        approachCases: runtimeTierCases.filter((entry) => entry.group === 'approach').length,
        localCases: runtimeTierCases.filter((entry) => entry.group === 'improv' || entry.group === 'improv_bold').length,
        status: '현재 자유입력 판정 템플릿이며 실제 획득·검증 증거가 아님',
        cases: runtimeTierCases,
      },
      expectedEnding: terminal.ending?.id, seed: firstCanonicalRoute.seed,
      command: 'bun tests/campaign_qa_main.ts --run --model-window-assigned',
      next: '리드가 모델 창을 배정한 뒤에만 실행',
    }, null, 2));
    return;
  }
  if (!Bun.argv.includes('--model-window-assigned')) throw new CampaignQaError('모델 독점 창 배정 없이 실행하지 않습니다');
  const priorIndex = Bun.argv.indexOf('--resume-run');
  const checkpointIndex = Bun.argv.indexOf('--checkpoint');
  const priorRun = priorIndex < 0 ? undefined : Bun.argv[priorIndex + 1];
  const checkpoint = checkpointIndex < 0 ? undefined : Bun.argv[checkpointIndex + 1];
  if ((priorIndex >= 0 || checkpointIndex >= 0) && (!priorRun || !checkpoint)) {
    throw new CampaignQaError('--resume-run과 --checkpoint를 함께 지정해야 합니다');
  }
  const route: CampaignQaRoute = checkpoint === undefined ? firstCanonicalRoute : {
    id: 'canonical_resume', fromCheckpoint: checkpoint, target: firstCanonicalRoute.target,
    choices: firstCanonicalRoute.choices, inputs: firstCanonicalRoute.inputs,
    useLuck: firstCanonicalRoute.useLuck, confirm: firstCanonicalRoute.confirm,
    maxActions: firstCanonicalRoute.maxActions,
  };
  const directory = join(APP, '../work/continuation/qa', `real-${Date.now()}`);
  const provider: QaProvider = {
    kind: 'real-model',
    create(trace, transport) {
      return new LocalGm(new RecordingLlmClient({ baseUrl: 'http://127.0.0.1:18196', timeoutMs: 60_000 }, transport), lore, {
        ...DEFAULT_GM_OPTIONS, onTrace: trace,
      });
    },
  };
  const results = await executeCampaignQa(scenario, provider, [route], directory, priorRun);
  console.log(`ACTUAL_CAMPAIGN_RUN_FINISHED ${JSON.stringify({ directory, results })}`);
  process.exitCode = results.every((result) => result.completed) ? 0 : 1;
}

if (import.meta.main) await main();
