import { describe, expect, test } from 'bun:test';
import { edgesOf, faceProblem, parseScenario } from '../src/engine/scenario.ts';

function declaration() {
  return {
    id: 'dialogue_parser',
    title: '선택 대화',
    episode: '시험',
    source: '선언 경계 fixture',
    rating: '15세 이용가',
    start: 'talk',
    sheet: {
      name: '아시나',
      abilities: { 재치: 1, 손재주: 1, 매력: 1, 근력: 0, 교양: 1 },
      tracks: { 체력: 4, 정신력: 4, 의심: 0, 집착: 0, 호감: 0, 귀찌: 7, 탈주: 0, 행운: 6 },
      items: [],
    },
    cast: {
      나레이션: { display: '', style: 'narration' },
      GM: { display: '여우', style: 'gm' },
      주인공: { display: '아시나', style: 'speech', lore: '아시나', sprite: 'hero', faces: ['neutral'] },
      응답자: { display: '시녀', style: 'speech', lore: '안내 시녀', presentation: 'cg', faces: ['neutral', 'scared'] },
      별칭: { display: '시녀', style: 'speech', lore: '안내 시녀', presentation: 'cg', faces: ['neutral', 'scared'] },
      부재자: { display: '손님', style: 'speech', lore: '손님', sprite: 'guest', faces: ['neutral'] },
    },
    backgrounds: {},
    sprites: {
      hero: { label: '아시나', file: 'hero.png', placeholder: '아시나' },
      guest: { label: '손님', file: 'guest.png', placeholder: '손님' },
    },
    cgs: { room: { label: '대화 장면', file: 'room.png' } },
    beats: {
      talk: {
        title: '대답',
        cast: { left: '주인공', right: '응답자' },
        lines: [{ 응답자: '무엇을 묻겠습니까?', cg: 'room', face: 'neutral' }],
        choices: [{ id: 'continue', text: '계속', next: 'original' }],
        conversation: {
          situation: '시녀가 눈앞에서 대답을 기다린다.',
          goal: '실제로 건넨 말과 몸짓에 응답한다.',
          speakers: ['나레이션', '별칭'],
          must_not: [], state_guard: [], echo_only: [], talk_fallback: [], deflect: [],
          cg: 'room',
          next: 'custom',
        },
      },
      original: { title: '원래 선택', lines: [{ 나레이션: '원래 선택의 다음 장면이다.' }], next: 'end' },
      custom: { title: '직접 입력', lines: [{ 나레이션: '직접 입력 뒤의 장면이다.' }], next: 'end' },
      end: { title: '끝', lines: [], ending: { id: 'done', title: '끝', summary: '시험 종료.', next_hook: '다음 이야기.' } },
    },
  };
}

describe('선택 대화 선언 경계', () => {
  test('선택과 직접 입력의 다음 경로를 함께 읽고 같은 lore의 현장 별칭을 허용한다', () => {
    const scenario = parseScenario(JSON.stringify(declaration()));
    const beat = scenario.beats.talk;
    if (!beat) throw new Error('대화 비트 없음');
    expect(beat.conversation?.speakers).toEqual(['나레이션', '별칭']);
    expect(beat.conversation?.next).toBe('custom');
    expect(edgesOf(beat)).toEqual(['custom', 'original']);
    expect(beat.free).toBeUndefined();
  });

  test.each([
    { name: '다음 경로 누락', change: { next: undefined }, error: /conversation.next/ },
    { name: '빈 다음 경로', change: { next: [] }, error: /conversation.next/ },
    { name: '없는 다음 비트', change: { next: 'missing' }, error: /conversation.next/ },
    { name: '없는 CG', change: { cg: 'missing' }, error: /conversation.cg/ },
    { name: '빈 응답자', change: { speakers: [] }, error: /conversation.speakers/ },
    { name: '무대 밖 응답자', change: { speakers: ['부재자'] }, error: /conversation.speakers/ },
    { name: '주인공의 새 발화', change: { speakers: ['주인공'] }, error: /conversation.speakers/ },
    { name: 'GM 발화', change: { speakers: ['GM'] }, error: /conversation.speakers/ },
    { name: '알 수 없는 응답자', change: { speakers: ['없음'] }, error: /conversation.speakers/ },
  ])('$name 선언은 거절한다', ({ change, error }) => {
    const raw = declaration();
    const talk = { ...raw.beats.talk, conversation: { ...raw.beats.talk.conversation, ...change } };
    expect(() => parseScenario(JSON.stringify({ ...raw, beats: { ...raw.beats, talk } }))).toThrow(error);
  });

  test.each([
    { name: '선택 없음', choices: undefined },
    { name: '조건부 선택만 있음', choices: [{ id: 'only', text: '계속', if: '체력 > 0', next: 'original' }] },
    {
      name: '판정 선택만 있음',
      choices: [{
        id: 'only', text: '설득', next: 'original', check: { stat: '매력', label: '설득' },
        outcomes: { hit: { lines: [] }, mixed: { lines: [] }, miss: { lines: [] } },
      }],
    },
  ])('$name 상태에는 선택 대화를 둘 수 없다', ({ choices }) => {
    const raw = declaration();
    const talk = { ...raw.beats.talk, choices };
    expect(() => parseScenario(JSON.stringify({ ...raw, beats: { ...raw.beats, talk } }))).toThrow(/conversation.*기본 선택지/);
  });

  test('조건과 판정이 없는 원문 선택지가 있으면 조건부 선택을 함께 둘 수 있다', () => {
    const raw = declaration();
    const choices = [...raw.beats.talk.choices, { id: 'other', text: '다른 길', if: '체력 > 0', next: 'custom' }];
    const talk = { ...raw.beats.talk, choices };
    expect(() => parseScenario(JSON.stringify({ ...raw, beats: { ...raw.beats, talk } }))).not.toThrow();
  });

  test('선택지가 없어도 판정 자유 입력과 선택 대화를 함께 둘 수 없다', () => {
    const raw = declaration();
    const lines = [{ 나레이션: '걸림쇠가 움직였다.' }];
    const outcomes = {
      hit: { lines },
      mixed: { lines, effects: { 정신력: -1 } },
      miss: { lines },
    };
    const free = {
      ...raw.beats.talk.conversation,
      prompt: '어떻게 할까?',
      default_approach: 'careful',
      turns: 1,
      approaches: [{ id: 'careful', label: '조심히', hint: '천천히 움직인다.', stat: '손재주', outcomes }],
      improv: outcomes,
    };
    const talk = { ...raw.beats.talk, choices: undefined, free };
    expect(() => parseScenario(JSON.stringify({ ...raw, beats: { ...raw.beats, talk } }))).toThrow(/conversation.*free/);
  });

  test('결말과 선택 대화를 함께 둘 수 없다', () => {
    const raw = declaration();
    const talk = { ...raw.beats.talk, ending: raw.beats.end.ending };
    expect(() => parseScenario(JSON.stringify({ ...raw, beats: { ...raw.beats, talk } }))).toThrow(/conversation/);
  });
});

describe('CG 전용 배우의 출력 선언', () => {
  test('입식 없는 CG 배우의 허용 표정은 그대로 허용한다', () => {
    const raw = declaration();
    raw.beats.talk.lines[0] = { 응답자: '말씀하십시오.', cg: 'room', face: 'scared' };
    const scenario = parseScenario(JSON.stringify(raw));
    expect(scenario.cast.응답자?.presentation).toBe('cg');
    expect(faceProblem(scenario, '응답자', 'scared')).toBeNull();
  });

  test.each([
    { name: 'CG 없는 줄', line: { 응답자: '말씀하십시오.' }, error: /유효한 CG/ },
    { name: '없는 CG를 참조한 줄', line: { 응답자: '말씀하십시오.', cg: 'missing' }, error: /유효한 CG/ },
    { name: '미허용 표정', line: { 응답자: '말씀하십시오.', cg: 'room', face: 'angry' }, error: /표정/ },
  ])('$name은 거절한다', ({ line, error }) => {
    const raw = declaration();
    const talk = { ...raw.beats.talk, lines: [line] };
    expect(() => parseScenario(JSON.stringify({ ...raw, beats: { ...raw.beats, talk } }))).toThrow(error);
  });

  test('lead 줄의 CG 배우도 유효 CG를 요구한다', () => {
    const raw = declaration();
    const talk = { ...raw.beats.talk, lead: [{ 응답자: '앞서 말한다.' }] };
    expect(() => parseScenario(JSON.stringify({ ...raw, beats: { ...raw.beats, talk } }))).toThrow(/유효한 CG/);
  });

  test('CG 배우도 기본 표정 neutral을 선언하지 않으면 표정 생략을 허용하지 않는다', () => {
    const raw = declaration();
    raw.cast.응답자.faces = ['scared'];
    const talk = { ...raw.beats.talk, lines: [{ 응답자: '말씀하십시오.', cg: 'room' }] };
    expect(() => parseScenario(JSON.stringify({ ...raw, beats: { ...raw.beats, talk } }))).toThrow(/neutral/);
  });

  test.each([
    { name: '입식 기본값', change: { sprite: 'guest' } },
    { name: '입식 대체값', change: { sprite_alt: { if: '체력 > 0', sprite: 'guest' } } },
    { name: '나레이션 스타일', change: { style: 'narration' } },
    { name: 'GM 스타일', change: { style: 'gm' } },
  ])('$name을 CG 전용 표시와 함께 둘 수 없다', ({ change }) => {
    const raw = declaration();
    const cast = { ...raw.cast, 응답자: { ...raw.cast.응답자, ...change } };
    expect(() => parseScenario(JSON.stringify({ ...raw, cast }))).toThrow(/presentation/);
  });

  test('CG 표시 없는 일반 배우는 입식 없는 표정을 계속 거절한다', () => {
    const raw = declaration();
    raw.cast.부재자.faces = ['neutral', 'scared'];
    expect(() => parseScenario(JSON.stringify(raw))).toThrow(/없는 입식 "guest_scared"/);
  });

  test('CG 표시가 없는 입식 없는 배우는 CG가 붙어 있어도 자동 면제되지 않는다', () => {
    const raw = declaration();
    const cast = { ...raw.cast, 응답자: { ...raw.cast.응답자, presentation: undefined } };
    expect(() => parseScenario(JSON.stringify({ ...raw, cast }))).toThrow(/입식이 없습니다/);
  });
});
