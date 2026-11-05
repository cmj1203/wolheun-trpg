import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadScenario, parseScenario, ScenarioError } from '../src/engine/scenario.ts';

// 검사 하나하나가 실제로 막는지 보기 위한 작은 시나리오. 선택지·판정 선택지·자유 비트·대가 표·장면 검사·CG·작은 끝·큰 행동을 다 갖췄다.
const BASE = `
id: check_test
title: 검사 시험
episode: 시험
source: 단위 테스트
rating: 15세 이용가
start: intro
sheet:
  name: 아시나
  abilities: { 재치: 1, 손재주: 1, 매력: 0, 체력: 0, 교양: 0 }
  tracks: { 의심: 0, 집착: 0, 호감: 0, 귀찌: 5, 탈주: 0, 행운: 0 }
  tension: 3
  items:
    - { id: pin, name: 가는 핀, desc: 자물쇠를 딸 수 있는 핀 }
cast:
  나레이션: { display: "", style: narration }
  간수: { display: 간수, style: speech, sprite: guard }
backgrounds:
  cell: { label: 감옥, placeholder: blackout }
sprites:
  guard: { label: 간수 입식, placeholder: silhouette }
cgs:
  flash: { label: 섬광, file: flash.png, crop: [0, 0, 10, 10] }
identity:
  with: 남자
  words: [정체]
  omen:
    - 나레이션: 바람이 차다.
  effects: { 집착: 1 }
fates:
  - { id: doom_f, when: "의심 >= 9", to: doom }
beats:
  intro:
    title: 시작
    bg: cell
    lines:
      - 나레이션: 문이 닫힌다.
        cg: flash
    choices:
      - id: wait
        text: 기다린다
        next: cell
      - id: test
        text: 시험한다
        check:
          stat: 재치
          label: 살핀다
          mods:
            - { if: "item:pin", value: 1, label: 핀 }
        outcomes:
          hit: { lines: [ { 나레이션: 보였다. } ], next: cell }
          mixed: { lines: [ { 나레이션: 조금 보였다. } ], next: cell }
          miss: { lines: [ { 나레이션: 안 보였다. } ], next: cell }
  cell:
    title: 감옥
    cast: { left: 간수 }
    lines:
      - 나레이션: 쇠사슬이 무겁다.
    twist:
      altered:
        - id: drip
          lines: [ { 나레이션: 물이 떨어진다. } ]
      interrupt:
        - id: bell
          lines: [ { 나레이션: 종이 울린다. } ]
    free:
      prompt: 탈옥 계획을 세워 보세요.
      situation: 감옥.
      goal: 탈옥 준비.
      speakers: [나레이션, 간수]
      must_not: [간수가 문을 열어 준다]
      state_guard: []
      talk_fallback: [ { 간수: 조용히 해라. } ]
      press: [ { 간수: 서둘러라. } ]
      deflect: [ { 나레이션: 그건 안 된다. } ]
      improv:
        hit: { gist: 먹힌다, lines: [ { 나레이션: 먹혔다. } ] }
        mixed: { gist: 조금 먹힌다, lines: [ { 나레이션: 조금 먹혔다. } ] }
        miss: { gist: 안 먹힌다, lines: [ { 나레이션: 안 먹혔다. } ] }
      prices:
        - { id: p_soft, tag: 시간, weight: soft, text: 시간이 흐른다 }
        - { id: p_hard, tag: 소지품, weight: hard, text: 핀을 잃는다 }
      turns: 5
      until: "탈주 >= 3"
      default_approach: watch
      approaches:
        - id: watch
          label: 간수를 관찰한다
          stat: 재치
          hint: 순찰 간격을 센다
          examples: []
          keywords: [관찰]
          outcomes:
            hit: { gist: 순찰 간격을 알아낸다, lines: [ { 나레이션: 간격을 알아냈다. } ], effects: { 탈주: 1 } }
            mixed: { gist: 조금 알아낸다, lines: [ { 나레이션: 조금 알았다. } ], effects: { 탈주: 1, 귀찌: -1 } }
            miss: { gist: 들킨다, lines: [ { 나레이션: 들켰다. } ], effects: { 의심: 1 } }
        - id: pick
          label: 핀으로 자물쇠를 딴다
          stat: 손재주
          item: pin
          hint: 핀을 쓴다
          examples: []
          keywords: [핀]
          outcomes:
            hit: { gist: 열린다, lines: [ { 나레이션: 찰칵. } ], effects: { 탈주: 2 } }
            mixed: { gist: 반쯤 열린다, lines: [ { 나레이션: 덜컥. } ], effects: { 탈주: 1 } }
            miss: { gist: 핀이 부러진다, lines: [ { 나레이션: 핀이 부러졌다. } ], effects: { lose: [pin], 의심: 1 } }
    next:
      - { if: "탈주 >= 3", to: out }
      - { to: caught }
  out:
    title: 탈출
    lines: [ { 나레이션: 빠져나왔다. } ]
    ending: { id: out, title: 탈출, summary: 나왔다, next_hook: 다음 }
  caught:
    title: 붙잡힘
    lines: [ { 나레이션: 붙잡혔다. } ]
    ending: { id: caught, title: 붙잡힘, summary: 잡혔다, next_hook: 다음 }
  doom:
    title: 파멸
    lines: [ { 나레이션: 모든 것이 무너졌다. } ]
    ending: { id: doom, title: 파멸, summary: 무너졌다, next_hook: 다음, bad: true }
`;

/** from 이 원문에 정확히 한 번 나올 때만 바꾼다. 바꿀 곳을 못 찾은 행이 그냥 통과하지 않게 한다. */
function swap(src: string, from: string | RegExp, to: string): string {
  const hits = typeof from === 'string' ? src.split(from).length - 1 : (src.match(new RegExp(from.source, `${from.flags.replace('g', '')}g`)) ?? []).length;
  expect(hits).toBe(1);
  return src.replace(from, to);
}

function failure(src: string): Error {
  try {
    parseScenario(src);
  } catch (err) {
    return err as Error;
  }
  throw new Error('시나리오가 그대로 읽혀 버렸습니다');
}

type Row = [name: string, edit: (s: string) => string, keyword: RegExp];

// 이 행들은 지금 ScenarioError 가 아니라 맨 Error 를 던진다(scenario.ts 의 사건 줄·긴장도 검사). 클래스는 Error 까지만 본다.
const PLAIN: Row[] = [
  ['장면 검사 사건 줄이 비면 막는다', (s) => swap(s, 'lines: [ { 나레이션: 종이 울린다. } ]', 'lines: []'), /interrupt\[0\]\.lines: 사건 줄이 비어/],
  ['긴장도가 하한보다 작으면 막는다', (s) => swap(s, '  tension: 3\n', '  tension: 0\n'), /sheet\.tension/],
  ['긴장도가 상한보다 크면 막는다', (s) => swap(s, '  tension: 3\n', '  tension: 7\n'), /sheet\.tension/],
];

const ROWS: Row[] = [
  // 기본 값 읽기
  ['공백뿐인 제목은 글자로 치지 않는다', (s) => swap(s, '    title: 감옥\n', '    title: "   "\n'), /beats\.cell\.title: 글자가 필요/],
  ['무한대 시간은 숫자로 치지 않는다', (s) => swap(s, '    title: 시작\n', '    title: 시작\n    time: .inf\n'), /beats\.intro\.time: 숫자가 필요/],
  ['대사 한 줄에 화자가 둘이면 막는다', (s) => swap(s, '- 나레이션: 쇠사슬이 무겁다.', '- { 나레이션: 쇠사슬이 무겁다., 간수: 덤이다. }'), /lines\[0\]: "화자: 대사" 한 쌍/],
  ['cast 에 없는 화자를 막는다', (s) => swap(s, '- 나레이션: 문이 닫힌다.', '- 유령: 문이 닫힌다.'), /없는 화자 "유령"/],
  ['플래그 값이 목록이면 막는다', (s) => swap(s, 'effects: { 의심: 1 } }', 'effects: { flags: { 표시: [1] } } }'), /flags\.표시: 참\/거짓/],
  ['알 수 없는 효과 이름을 막는다', (s) => swap(s, 'effects: { 탈주: 2 }', 'effects: { 엉뚱: 2 }'), /알 수 없는 효과 "엉뚱"/],
  ['forbid 는 조용히 버리지 않는다', (s) => swap(s, '    title: 감옥\n', '    title: 감옥\n    forbid: [x]\n'), /beats\.cell\.forbid/],
  ['결과 등급이 하나라도 빠지면 막는다', (s) => swap(s, '        miss: { gist: 안 먹힌다, lines: [ { 나레이션: 안 먹혔다. } ] }\n', ''), /improv: miss 결과가 없습니다/],
  ['crop 수가 넷보다 많으면 막는다', (s) => swap(s, 'crop: [0, 0, 10, 10]', 'crop: [0, 0, 10, 10, 5]'), /cgs\.flash\.crop/],
  ['crop 너비가 0 이면 막는다', (s) => swap(s, 'crop: [0, 0, 10, 10]', 'crop: [0, 0, 0, 10]'), /cgs\.flash\.crop/],
  ['crop 높이가 0 이면 막는다', (s) => swap(s, 'crop: [0, 0, 10, 10]', 'crop: [0, 0, 10, 0]'), /cgs\.flash\.crop/],
  ['crop 시작점이 음수면 막는다', (s) => swap(s, 'crop: [0, 0, 10, 10]', 'crop: [-1, 0, 10, 10]'), /cgs\.flash\.crop/],
  ['큰 행동에 효과가 없으면 막는다', (s) => swap(s, '  effects: { 집착: 1 }\n', ''), /identity\.effects/],
  // 대가 표
  ['대가의 once 가 참/거짓이 아니면 막는다', (s) => swap(s, 'text: 시간이 흐른다 }', 'text: 시간이 흐른다, once: "네" }'), /prices\[0\]\.once: 참\/거짓/],
  ['대가에 모르는 항목이 있으면 막는다', (s) => swap(s, 'text: 시간이 흐른다 }', 'text: 시간이 흐른다, 덤: 1 }'), /알 수 없는 항목 "덤"/],
  ['soft 대가는 탈주를 내리지 못한다', (s) => swap(s, 'text: 시간이 흐른다 }', 'text: 시간이 흐른다, effects: { 탈주: -1 } }'), /탈주를 내릴 수 없습니다/],
  ['soft 대가는 플래그를 끄지 못한다', (s) => swap(s, 'text: 시간이 흐른다 }', 'text: 시간이 흐른다, effects: { flags: { 경계: false } } }'), /soft 대가는 플래그/],
  ['대가 id 가 겹치면 막는다', (s) => swap(s, '{ id: p_hard,', '{ id: p_soft,'), /prices\.p_soft: 같은 id/],
  ['hit 에는 대가를 두지 않는다', (s) => swap(s, 'effects: { 탈주: 1 } }\n            mixed: { gist: 조금 알아낸다', 'effects: { 탈주: 1 }, price: [p_soft] }\n            mixed: { gist: 조금 알아낸다'), /watch\.hit\.price: hit 에는/],
  [
    '대가 표 없이 price 후보를 적으면 막는다',
    (s) => swap(swap(s, /      prices:\n(        - .*\n){2}/, ''), 'effects: { 탈주: 1, 귀찌: -1 } }', 'effects: { 탈주: 1, 귀찌: -1 }, price: [p_soft] }'),
    /watch\.mixed\.price: 비트에 prices 가 없습니다/,
  ],
  ['뽑을 soft 대가가 없으면 막는다', (s) => swap(s, 'weight: soft', 'weight: hard'), /watch\.mixed: 뽑을 soft 대가가 없습니다/],
  // 조건식 이름
  ['조건의 없는 소지품을 막는다', (s) => swap(s, '"item:pin"', '"item:nope"'), /없는 소지품 "nope"/],
  ['조건의 수치가 아닌 이름을 막는다', (s) => swap(s, 'until: "탈주 >= 3"', 'until: "기세 >= 3"'), /아닌 이름 "기세"/],
  // next 와 길
  ['next 가 없는 비트를 가리키면 막는다', (s) => swap(s, '        next: cell\n      - id: test', '        next: nowhere\n      - id: test'), /choices\.wait\.next: 없는 비트 "nowhere"/],
  ['조건 분기의 마지막이 기본 경로가 아니면 막는다', (s) => swap(s, '- { to: caught }', '- { if: "탈주 < 3", to: caught }'), /beats\.cell\.next: 조건 분기의 마지막/],
  ['시작 비트가 없으면 막는다', (s) => swap(s, 'start: intro', 'start: nowhere'), /start: 없는 비트 "nowhere"/],
  ['작은 끝 id 가 겹치면 막는다', (s) => swap(s, '  - { id: doom_f, when: "의심 >= 9", to: doom }\n', '  - { id: doom_f, when: "의심 >= 9", to: doom }\n  - { id: doom_f, when: "집착 >= 9", to: doom }\n'), /fates\.doom_f: 같은 id/],
  ['작은 끝이 없는 비트로 가면 막는다', (s) => swap(s, 'to: doom }', 'to: nowhere }'), /fates\.doom_f\.to: 없는 비트/],
  ['작은 끝이 bad 결말이 아니면 막는다', (s) => swap(s, ', bad: true }', ' }'), /fates\.doom_f\.to: 작은 끝은 ending\.bad/],
  ['막다른 비트를 막는다', (s) => swap(s, '        next: cell\n      - id: test', '        next: limbo\n      - id: test') + '  limbo:\n    title: 허공\n    lines: [ { 나레이션: 아무것도 없다. } ]\n', /beats\.limbo: choices, free, next, ending 중 하나/],
  ['결말 비트에 next 를 두면 막는다', (s) => swap(s, '    ending: { id: out,', '    next: caught\n    ending: { id: out,'), /beats\.out: 결말 비트에는/],
  ['choices 와 free 를 함께 두면 막는다', (s) => swap(s, '    title: 감옥\n', '    title: 감옥\n    choices:\n      - { id: x, text: 엉뚱하다 }\n'), /beats\.cell: choices 와 free/],
  ['next 없는 선택지를 막는다', (s) => swap(s, '        next: cell\n      - id: test', '      - id: test'), /choices\.wait: 다음 비트가 정해지지 않습니다/],
  ['결과 하나라도 next 가 없는 판정 선택지를 막는다', (s) => swap(s, '{ 나레이션: 안 보였다. } ], next: cell }', '{ 나레이션: 안 보였다. } ] }'), /choices\.test: 다음 비트가 정해지지 않습니다/],
  ['빈 선택지 목록을 막는다', (s) => swap(s, /    choices:\n[\s\S]*?(?=  cell:\n)/, '    choices: []\n'), /beats\.intro\.choices: 선택지가 비어/],
  ['결과 대사가 비면 막는다', (s) => swap(s, 'lines: [ { 나레이션: 보였다. } ]', 'lines: []'), /choices\.test\.hit\.lines: 작가 대사가 비어/],
  ['닿을 수 없는 비트를 막는다', (s) => `${s}  island:\n    title: 섬\n    lines: [ { 나레이션: 외딴 섬. } ]\n    ending: { id: island, title: 섬, summary: 섬, next_hook: 다음 }\n`, /beats\.island: 시작에서 닿을 수 없는/],
  [
    '닿을 수 있는 결말이 없으면 막는다',
    (s) => swap(swap(swap(s, 'to: out }', 'to: intro }'), 'to: caught }', 'to: intro }'), /fates:\n.*\n/, ''),
    /닿을 수 있는 결말 비트가 없습니다/,
  ],
  // 자유 비트
  ['접근이 하나도 없으면 막는다', (s) => swap(s, /      approaches:\n[\s\S]*?(?=    next:\n      - \{ if)/, '      approaches: []\n'), /free\.approaches: 접근이 하나 이상/],
  ['기본 접근이 없는 접근이면 막는다', (s) => swap(s, 'default_approach: watch', 'default_approach: nope'), /default_approach: 없는 접근 "nope"/],
  ['addressed 가 없는 접근이면 막는다', (s) => swap(s, '      turns: 5\n', '      turns: 5\n      addressed: nope\n'), /addressed: 없는 접근 "nope"/],
  ['기본 접근에 소지품 조건을 두지 않는다', (s) => swap(s, 'default_approach: watch', 'default_approach: pick'), /기본 접근에는 소지품/],
  ['자유 비트 화자가 cast 에 없으면 막는다', (s) => swap(s, 'speakers: [나레이션, 간수]', 'speakers: [나레이션, 유령]'), /free\.speakers: cast 에 없는 화자 "유령"/],
  ['대체 대사가 비면 막는다', (s) => swap(s, 'talk_fallback: [ { 간수: 조용히 해라. } ]', 'talk_fallback: []'), /free\.talk_fallback: GM 이 실패할 때/],
  ['patience 가 1 보다 작으면 막는다', (s) => swap(s, '      turns: 5\n', '      turns: 5\n      patience: 0\n'), /free\.patience: 1 이상/],
  ['turns 가 1 보다 작으면 막는다', (s) => swap(s, '      turns: 5\n', '      turns: 0\n'), /free\.turns: 1 이상/],
  ['접근의 소지품이 없는 소지품이면 막는다', (s) => swap(s, '          item: pin\n', '          item: nope\n'), /free\.pick\.item: 없는 소지품 "nope"/],
  ['턴이 끝난 뒤 갈 곳이 없으면 막는다', (s) => swap(s, '    next:\n      - { if: "탈주 >= 3", to: out }\n      - { to: caught }\n', ''), /beats\.cell\.free: 턴이 끝난 뒤/],
  ['직접 입력 판에서 남는 대사가 없으면 막는다', (s) => swap(s, '{ 나레이션: 간격을 알아냈다. }', '{ 나레이션: 간격을 알아냈다., tie: true }'), /free\.watch\.hit: 직접 입력한 판에서/],
  ['접근 결과에 요지가 없으면 막는다', (s) => swap(s, 'gist: 순찰 간격을 알아낸다, ', ''), /free\.watch\.hit\.gist/],
  // 그림·인물
  ['CG 대체가 없는 CG 면 막는다', (s) => swap(s, 'file: flash.png,', 'file: flash.png, alt: { if: "flag:x", id: ghost },'), /cgs\.flash\.alt\.id: 없는 이벤트 CG "ghost"/],
  ['인물 입식이 없으면 막는다', (s) => swap(s, 'sprite: guard }', 'sprite: nope }'), /cast\.간수\.sprite: 없는 입식 "nope"/],
  ['인물 대체 입식이 없으면 막는다', (s) => swap(s, 'sprite: guard }', 'sprite: guard, sprite_alt: { if: "flag:x", sprite: nope } }'), /sprite_alt\.sprite: 없는 입식 "nope"/],
  ['없는 배경을 막는다', (s) => swap(s, '    bg: cell\n', '    bg: nope\n'), /beats\.intro\.bg: 없는 배경 "nope"/],
  ['파일 없는 이벤트 CG 를 막는다', (s) => swap(s, 'file: flash.png, ', ''), /cgs\.flash\.file: 이벤트 CG 에는 파일/],
  ['비트 자리의 없는 인물을 막는다', (s) => swap(s, 'cast: { left: 간수 }', 'cast: { left: 유령 }'), /beats\.cell\.cast: cast 에 없는 인물 "유령"/],
];

describe('시나리오 검사가 하나씩 실제로 막는다', () => {
  test('손대지 않은 시험 시나리오는 그대로 읽힌다', () => {
    const s = parseScenario(BASE);
    expect(Object.keys(s.beats)).toEqual(['intro', 'cell', 'out', 'caught', 'doom']);
    expect(s.cgs.flash?.crop).toEqual([0, 0, 10, 10]);
    expect(s.sheet.tension).toBe(3);
    expect(s.identity?.effects).toEqual({ tracks: { 집착: 1 } });
    expect(s.beats.cell?.twist?.interrupt.map((t) => t.id)).toEqual(['bell']);
    expect(s.beats.intro?.choices?.map((c) => [c.id, c.check?.mods?.[0]?.if ?? null])).toEqual([
      ['wait', null],
      ['test', 'item:pin'],
    ]);
  });

  test.each(ROWS)('%s', (_name, edit, keyword) => {
    const src = edit(BASE);
    expect(src).not.toBe(BASE);
    const err = failure(src);
    expect(err).toBeInstanceOf(ScenarioError);
    expect(err.message).toMatch(keyword);
  });

  test.each(PLAIN)('%s', (_name, edit, keyword) => {
    const src = edit(BASE);
    expect(src).not.toBe(BASE);
    const err = failure(src);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(keyword);
  });
});

describe('파일에서 읽을 때', () => {
  test('검사 실패 메시지 앞에 파일 경로를 붙인다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scenario-check-'));
    try {
      const path = join(dir, 'broken.yaml');
      await Bun.write(path, swap(BASE, 'start: intro', 'start: nowhere'));
      const err = await loadScenario(path).then(
        () => new Error('읽혀 버렸습니다'),
        (e: unknown) => e as Error,
      );
      expect(err).toBeInstanceOf(ScenarioError);
      expect(err.message.startsWith(`${path}\n`)).toBe(true);
      expect(err.message).toContain('start: 없는 비트 "nowhere"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
