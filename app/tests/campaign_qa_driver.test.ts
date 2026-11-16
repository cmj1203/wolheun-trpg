import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSave } from '../src/engine/save.ts';
import { roll2d6 } from '../src/engine/dice.ts';
import { parseScenario } from '../src/engine/scenario.ts';
import { CampaignQaError, executeCampaignQa, type CampaignQaRoute, type QaProvider } from './campaign_qa_driver.ts';
import { FakeGm, META } from './helpers.ts';

const temporary = await mkdtemp(join(tmpdir(), 'campaign-qa-driver-'));
afterAll(() => rm(temporary, { recursive: true, force: true }));
const scenario = parseScenario(JSON.stringify({
  id: 'driver_spec', title: '진행 검사', episode: '시험', source: '실행 제어 시험', rating: '15세 이용가', start: 'start',
  sheet: {
    name: '아시나', abilities: { 재치: 1, 손재주: 1, 매력: 1, 근력: 0, 교양: 1 },
    tracks: { 체력: 4, 정신력: 4, 의심: 0, 집착: 0, 호감: 0, 귀찌: 7, 탈주: 0, 행운: 6 }, items: [],
  },
  cast: { 나레이션: { display: '', style: 'narration' } }, backgrounds: {}, sprites: {}, cgs: {},
  beats: {
    start: { title: '출발', lines: [{ 나레이션: '갈림길에 도착했다.' }], next: 'fork' },
    fork: { title: '갈림길', lines: [], choices: [
      { id: 'left', text: '왼쪽', next: 'left' }, { id: 'right', text: '오른쪽', next: 'right' },
    ] },
    left: { title: '왼쪽', lines: [{ 나레이션: '왼쪽 길.', sets: 'left' }], ending: { id: 'left', title: '왼쪽', summary: '종료.', next_hook: '없음.' } },
    right: { title: '오른쪽', lines: [], next: [{ if: 'flag:left', to: 'leaked' }, { to: 'right_end' }] },
    right_end: { title: '오른쪽 끝', lines: [], ending: { id: 'right', title: '오른쪽', summary: '종료.', next_hook: '없음.' } },
    leaked: { title: '다른 분기 혼입', lines: [], ending: { id: 'leaked', title: '혼입', summary: '다른 판 기억.', next_hook: '없음.' } },
  },
}));
const provider: QaProvider = { kind: 'test-double', create: () => new FakeGm() };
const settings = { choices: {}, inputs: {}, useLuck: false, confirm: true, maxActions: 8 } as const;

test('실제 출발에서 획득한 저장으로만 두 분기를 재개하고 다른 분기 기억을 섞지 않는다', async () => {
  const routes: readonly CampaignQaRoute[] = [
    { ...settings, id: 'prefix', seed: 17, target: { kind: 'checkpoint', id: 'before_fork', beat: 'fork' } },
    { ...settings, id: 'left', fromCheckpoint: 'before_fork', choices: { fork: 'left' }, target: { kind: 'ending', id: 'left' } },
    { ...settings, id: 'right', fromCheckpoint: 'before_fork', choices: { fork: 'right' }, target: { kind: 'ending', id: 'right' } },
  ];
  const directory = join(temporary, 'branches');
  const results = await executeCampaignQa(scenario, provider, routes, directory);
  expect(results.map((result) => result.completed)).toEqual([true, true, true]);
  expect(results.map((result) => result.actualEnding)).toEqual([null, 'left', 'right']);
  expect(results.every((result) => result.review === 'pending')).toBe(true);
  const saved = await readSave(join(directory, 'checkpoints'), 'earned_0', scenario);
  expect(saved.seed).toBe(17);
  expect(saved.log.find((entry) => entry.kind === 'beat')?.beat).toBe('start');
  expect(saved.flags.left).toBeUndefined();
});

test('획득하지 않은 체크포인트를 새 판이나 임의 상태로 대체하지 않는다', async () => {
  const results = await executeCampaignQa(scenario, provider, [{
    ...settings, id: 'missing', fromCheckpoint: 'not_earned', target: { kind: 'ending', id: 'right' },
  }], join(temporary, 'missing'));
  expect(results[0]?.completed).toBe(false);
  expect(results[0]?.beat).toBeNull();
  expect(results[0]?.error).toContain('실제 획득하지 않은 체크포인트');
});

test('미계획 선택은 첫 항목을 자동 선택하지 않고 현재 실제 경계에서 멈춘다', async () => {
  const results = await executeCampaignQa(scenario, provider, [{
    ...settings, id: 'unplanned_choice', seed: 23, target: { kind: 'ending', id: 'left' },
  }], join(temporary, 'unplanned-choice'));
  expect(results[0]?.completed).toBe(false);
  expect(results[0]?.actualEnding).toBeNull();
  expect(results[0]?.beat).toBe('fork');
  expect(results[0]?.actions).toBe(0);
  expect(results[0]?.error).toContain('미계획 실제 선택');
});

test('다른 진짜 결말에 닿으면 그대로 남기고 정사로 강제 합류하지 않는다', async () => {
  const results = await executeCampaignQa(scenario, provider, [{
    ...settings, id: 'unexpected', seed: 23, choices: { fork: 'left' }, target: { kind: 'ending', id: 'right' },
  }], join(temporary, 'unexpected'));
  expect(results[0]?.completed).toBe(false);
  expect(results[0]?.actualEnding).toBe('left');
  expect(results[0]?.actions).toBe(1);
});

test('실제 입력 자리가 없는 장면에 준비한 행동을 억지로 주입하지 않는다', async () => {
  const results = await executeCampaignQa(scenario, provider, [{
    ...settings, id: 'no_input', seed: 23, inputs: { fork: ['(손을 흔든다)'] }, target: { kind: 'ending', id: 'right' },
  }], join(temporary, 'no_input'));
  expect(results[0]?.completed).toBe(false);
  expect(results[0]?.beat).toBe('fork');
  expect(results[0]?.actions).toBe(0);
  expect(results[0]?.error).toContain('실제 입력 자리');
});

test('사용자 서버처럼 실패 직후 실제 행운 확인을 거쳐 선택한다', async () => {
  const luckScenario = parseScenario(JSON.stringify({
    ...scenario, id: 'driver_luck_spec', start: 'attempt',
    cast: { ...scenario.cast, GM: { display: 'GM', style: 'gm' } },
    beats: {
      attempt: {
        title: '시도', lines: [], next: 'done',
        free: {
          prompt: '잠금을 푼다.', situation: '잠긴 문 앞.', goal: '문을 연다.', speakers: ['나레이션'],
          must_not: [], state_guard: [], echo_only: [], patience: 1,
          talk_fallback: [{ 나레이션: '문은 잠겨 있다.' }],
          press: [{ 나레이션: '다시 손을 댄다.' }],
          deflect: [{ 나레이션: '문의 걸림쇠를 살핀다.' }],
          neutral: {
            hit: [{ 나레이션: '손으로 걸림쇠를 눌러 문을 연다.' }],
            mixed: [{ 나레이션: '걸림쇠를 누르고 숨을 고른다.' }],
            miss: [{ 나레이션: '걸림쇠가 움직이지 않는다.' }],
          },
          improv: {
            hit: { lines: [{ 나레이션: '문이 열린다.' }], gist: '열림', next: 'done' },
            mixed: { lines: [{ 나레이션: '문을 열고 숨을 고른다.' }], gist: '열림과 피로', next: 'done', effects: { 정신력: -1 } },
            miss: { lines: [{ 나레이션: '문은 움직이지 않는다.' }], gist: '실패', next: 'done' },
          },
          default_approach: 'force',
          approaches: [{
            id: 'force', label: '힘으로 연다.', stat: '근력', hint: '문을 민다.', examples: [], keywords: [],
            outcomes: {
              hit: { lines: [{ 나레이션: '문이 열린다.' }], gist: '열림', next: 'done' },
              mixed: { lines: [{ 나레이션: '문을 열고 숨을 고른다.' }], gist: '열림과 피로', next: 'done', effects: { 정신력: -1 } },
              miss: { lines: [{ 나레이션: '문은 움직이지 않는다.' }], gist: '실패', next: 'done' },
            },
          }],
        },
      },
      done: { title: '끝', lines: [], ending: { id: 'done', title: '끝', summary: '종료.', next_hook: '없음.' } },
    },
  }));
  const seed = Array.from({ length: 100 }, (_, index) => index + 1)
    .find((value) => {
      const roll = roll2d6(value, '힘으로 연다.', '근력', 0, []).roll;
      return roll.tier === 'miss' && roll.total <= 3;
    });
  if (seed === undefined) throw new CampaignQaError('실패 판정 시험 시드 없음');
  const directory = join(temporary, 'luck');
  const results = await executeCampaignQa(luckScenario, {
    kind: 'test-double',
    create: () => new FakeGm(() => ({ kind: 'approach', approach: 'force', item: null, source: 'rule', meta: META })),
  }, [{
    ...settings, id: 'luck', seed, useLuck: true,
    inputs: { attempt: ['(문을 힘껏 민다)'] }, target: { kind: 'ending', id: 'done' },
  }], directory);
  expect(results[0]?.completed).toBe(true);
  expect(results[0]?.actions).toBe(2);
  const beforeLuck = await readSave(join(directory, 'checkpoints'), 'earned_1', luckScenario);
  expect(beforeLuck.pendingLuck?.approach).toBe('force');
});

test('다음 실행도 검증된 획득 저장만 이어받고 시험 모델 계보를 실모델로 바꾸지 않는다', async () => {
  const prior = join(temporary, 'prior');
  await executeCampaignQa(scenario, provider, [{
    ...settings, id: 'earned_prefix', seed: 41, target: { kind: 'checkpoint', id: 'shared', beat: 'fork' },
  }], prior);
  const route: CampaignQaRoute = {
    ...settings, id: 'next_run', fromCheckpoint: 'shared', choices: { fork: 'right' }, target: { kind: 'ending', id: 'right' },
  };
  const nextDirectory = join(temporary, 'next-run');
  const results = await executeCampaignQa(scenario, provider, [route], nextDirectory, prior);
  expect(results[0]?.completed).toBe(true);
  const imported = await readSave(join(nextDirectory, 'checkpoints'), 'earned_0', scenario);
  expect(imported.seed).toBe(41);
  expect(imported.log.find((entry) => entry.kind === 'beat')?.beat).toBe('start');
  let created = false;
  await expect(executeCampaignQa(scenario, {
    kind: 'real-model',
    create() { created = true; return new FakeGm(); },
  }, [route], join(temporary, 'wrong-provider'), prior)).rejects.toBeInstanceOf(CampaignQaError);
  expect(created).toBe(false);
});
