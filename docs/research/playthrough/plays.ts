// 결말 11개까지 가는 대표 갈래. seed 는 판정이 이 갈래로 떨어지는 값(run_playthrough.ts 가 결말을 확인한다).
// moves: 비트별 입력 큐. '@luck' 은 행운 창, '@confirm' 은 확인 창의 답. 큐가 비면 fallback 입력.
export type Move = { free: string } | { approach: string } | { luck: boolean } | { confirm: boolean } | { ask: string };

export interface Play {
  title: string;
  ending: string;
  seed: number;
  note?: string;
  fallback?: string;
  confirmDefault?: boolean;
  /** 이 입력은 LLM 이 위험(attack)으로 읽었다고 대신 적는다. --no-llm 으로는 닿지 않는 작은 끝을 보기 위한 대역. */
  attackOn?: string[];
  moves: Record<string, Move[]>;
}

const f = (...texts: string[]): Move[] => texts.map((free) => ({ free }));

const a = (...ids: string[]): Move[] => ids.map((approach) => ({ approach }));

export const PLAYS: Record<string, Play> = {
  '01_curious': {
    title: '흥미로운 여자 (원작 흐름, 집착 4 이상)',
    ending: 'curious',
    seed: 2,
    note: 'e2e 갈래 1과 같은 입력. 칼 앞에서 엉뚱한 질문을 한 번 던지고 미인계로 버틴다.',
    moves: {
      b02_people: f('달려가서 길을 묻는다'),
      b05_why: f('너 몇 살이야?', '후드를 벗고 생긋 웃으며 말한다. 대륙에서 하나뿐인 미소녀를 죽이면 대륙의 손해라고요!'),
      b06_swing: f('몸을 던져 칼날을 피한다'),
      b08_gaze: f('붉은 눈을 피하지 않고 똑바로 마주 본다'),
    },
  },
  '02_survivor': {
    title: '살아남은 자 (원작 흐름, 집착 4 미만)',
    ending: 'survivor',
    seed: 1,
    note: '애원하고, 가방으로 막고, 받아친다. 의심도 집착도 문턱에 못 미친다.',
    moves: {
      b02_people: f('저기요! 손을 흔들며 다가간다'),
      b05_why: f('제발 살려 주세요. 저는 길을 잃었을 뿐이에요'),
      b06_swing: f('가방을 방패 삼아 막는다'),
      b08_gaze: f('실례네요. 남의 얼굴을 왜 그렇게 구경해요?'),
    },
  },
  '03_spy': {
    title: '수상한 이방인 (의심 6 이상 → 결박·심문)',
    ending: 'spy',
    seed: 4,
    note: 'e2e 갈래 2와 같은 입력. 숨어 지켜보다 들키고, 귀한 집안이라 우기고, 귀찌를 감춘다.',
    moves: {
      b02_people: f('모래 언덕 뒤에 숨어서 지켜본다'),
      b05_why: f('저는 귀한 집안 사람이에요. 함부로 대하면 후회하실 거예요'),
      b06_swing: f('가방을 방패 삼아 막는다'),
      b08_gaze: f('머리카락으로 귀찌를 가린다'),
      r2_bind: f('아무도 안 보냈어요. 전 그냥 여행자예요'),
    },
  },
  '04_road_b05': {
    title: '크라차로 가는 길 (b05 칼끝에서 몸을 뺀다)',
    ending: 'road',
    seed: 1,
    note: 'e2e 갈래 3과 같은 입력.',
    moves: {
      b02_people: f('달려가서 길을 묻는다'),
      b05_why: f('칼날을 밀어내고 모래를 차서 도망친다'),
      r3_dusk: f('별을 보고 남쪽을 찾는다'),
    },
  },
  '05_road_b02': {
    title: '크라차로 가는 길 (b02 사람을 피해 간다)',
    ending: 'road',
    seed: 2,
    note: '남자를 만나기 전에 몰래 피한다. 단추만 누른다.',
    moves: {
      b02_people: a('avoid'),
      r3_dusk: a('shelter'),
    },
  },
  '06_road_b06': {
    title: '크라차로 가는 길 (b06 칼을 피하며 달아난다)',
    ending: 'road',
    seed: 2,
    note: '칼 앞에서 말로 버티다 휘두르는 칼을 피해 달아난다. 사막 밤에 물을 아껴 마신다.',
    moves: {
      b02_people: f('달려가서 길을 묻는다'),
      b05_why: f('억울해요! 전 그냥 길을 물었을 뿐이라고요'),
      b06_swing: f('칼날을 피하며 모래 언덕 쪽으로 달아난다'),
      r3_dusk: f('물을 한 모금만 마시고 계속 걷는다'),
    },
  },
  '07_deal': {
    title: '길잡이 계약 (살려 두면 쓸모 있다)',
    ending: 'deal',
    seed: 1,
    note: 'e2e 갈래 4와 같은 입력.',
    moves: {
      b02_people: f('달려가서 길을 묻는다'),
      b05_why: f('저를 살려 주시면 크라차까지 길잡이를 해 드리고 보상도 드릴게요'),
      r4_prove: f('지도를 펼쳐 크라차 쪽 길을 짚어 보인다'),
    },
  },
  '08_value': {
    title: '값을 매긴 여자 (귀족이라고 내세운다)',
    ending: 'value',
    seed: 1,
    note: 'e2e 갈래 5와 같은 입력. 중간에 GM 단추로 배경을 두 번 묻는다(질문 모드).',
    moves: {
      b02_people: f('달려가서 길을 묻는다'),
      b05_why: [{ ask: '크롬웰이 뭐야?' }, { free: '저는 크롬웰 제국의 귀족 가문 사람이에요' }],
      r5_claim: [{ ask: '저 남자 누구야?' }, { free: '허리를 펴고 궁정식으로 인사한다' }],
    },
  },
  '09_quit': {
    title: '여기까지 (그만두기)',
    ending: 'quit',
    seed: 1,
    note: '칼 앞에서 그만할래를 친다. 처음엔 확인 창에서 계속하고, 두 번째에 끝낸다.',
    moves: {
      b02_people: f('달려가서 길을 묻는다'),
      b05_why: f('그만할래', '그만할래'),
      '@confirm': [{ confirm: false }, { confirm: true }],
    },
  },
  '10_unmasked': {
    title: '은발 (귀찌 수명 0, 작은 끝)',
    ending: 'unmasked',
    seed: 17,
    note: '무작위 단추·헛말 3000판 탐색에서 찾은 줄. 행운을 쓰고, 칼 앞에서 웃어넘기기만 하다 귀찌가 다 식는다.',
    moves: {
      b02_people: a('run'),
      '@luck': [{ luck: true }, { luck: true }],
      b05_why: [{ free: 'ㅋㅋㅋ' }, { free: 'ㅋㅋㅋ' }, { approach: 'beauty' }],
      b06_swing: a('dodge'),
      b08_gaze: [{ free: 'ㅋㅋㅋ' }, { free: 'ㅋㅋㅋ' }, { approach: 'stare_back' }],
    },
  },
  '11_spy_cut': {
    title: '첩자 (의심 10, 작은 끝)',
    ending: 'spy_cut',
    seed: 9,
    note: '칼 앞에서 칼을 빼앗으려 든다(규칙 해석으로는 즉흥 행동).',
    moves: {
      b02_people: f('달려가서 길을 묻는다'),
      b05_why: f('칼을 빼앗는다', '칼을 빼앗는다'),
    },
    fallback: '칼을 빼앗는다',
  },
  '12_reckless': {
    title: '칼 앞에서 (맨손으로 덤빈 판정 실패, 작은 끝) ※ LLM 해석 대역',
    ending: 'reckless',
    seed: 2,
    note: '--no-llm 규칙 해석은 attack 위험을 매기지 않아 이 끝에 닿지 않는다. "남자를 걷어찬다" 한 입력만 LLM 이 attack 으로 읽었다고 대신 적었다. 나머지는 모두 --no-llm 그대로다.',
    attackOn: ['남자를 걷어찬다'],
    moves: {
      b02_people: f('달려가서 길을 묻는다'),
      b05_why: f('남자를 걷어찬다', '남자를 걷어찬다', '남자를 걷어찬다'),
    },
    fallback: '남자를 걷어찬다',
  },
  '13_collapse': {
    title: '모래 위에서 (머뭇 3, 작은 끝)',
    ending: 'collapse',
    seed: 1,
    note: '무엇을 해야 할지 몰라 헛말만 한다.',
    fallback: '음…',
    moves: {},
  },
  '14_modern': {
    title: '엉뚱한 입력 (현대 물건·춤) 끝까지',
    ending: 'collapse',
    seed: 1,
    note: '원작을 모르는 사람이 장난삼아 현대 물건과 춤으로만 버틴다. 어디까지 가는지 본다.',
    fallback: '핸드폰을 꺼낸다',
    moves: {
      b02_people: f('춤을 춘다'),
    },
  },
  '15_buttons_first': {
    title: '단추 첫 칸만 누르기',
    ending: 'curious',
    seed: 2,
    note: '글을 치지 않고 늘 맨 앞 단추만 누른다. 처음 해 보는 사람이 가장 흔히 할 법한 길.',
    moves: {
      b02_people: a('run'),
      b05_why: a('beauty'),
      b06_swing: a('dodge'),
      b08_gaze: a('stare_back'),
    },
  },
};
