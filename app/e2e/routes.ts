export interface BranchRoute {
  title: string;
  ending: string;
  seed: number;
  inputs: Record<string, string[]>;
  saveLoadAt?: string;
}

/** 갈래 5개를 끝까지 가는 입력. seed 는 판정이 이 갈래로 떨어지는 값이다(tests/branches.test.ts 가 확인한다). */
export const ROUTES: Record<string, BranchRoute> = {
  '1': {
    title: '마음이 바뀌었다',
    ending: 'curious',
    seed: 2,
    saveLoadAt: 'b06_swing',
    inputs: {
      b02_people: ['(달려가서 길을 묻는다)'],
      b05_why: ['너 몇 살이야?', '(후드를 벗고 생긋 웃으며 말한다) 대륙에서 하나뿐인 미소녀를 죽이면 대륙의 손해라고요!'],
      b06_swing: ['(몸을 던져 칼날을 피한다)'],
      b08_gaze: ['(붉은 눈을 피하지 않고 똑바로 마주 본다)'],
    },
  },
  '2': {
    title: '수상한 이방인',
    ending: 'spy',
    seed: 4,
    inputs: {
      b02_people: ['(모래 언덕 뒤에 숨어서 지켜본다)'],
      b05_why: ['저는 귀한 집안 사람이에요. 함부로 대하면 후회하실 거예요'],
      b06_swing: ['(가방을 방패 삼아 막는다)'],
      b08_gaze: ['(머리카락으로 귀찌를 가린다)'],
      r2_bind: ['아무도 안 보냈어요. 전 그냥 여행자예요'],
    },
  },
  '3': {
    title: '혼자 걷는 사막',
    ending: 'road',
    seed: 1,
    inputs: {
      b02_people: ['(달려가서 길을 묻는다)'],
      b05_why: ['(칼날을 밀어내고 모래를 차서 도망친다)'],
      r3_dusk: ['(별을 보고 남쪽을 찾는다)'],
    },
  },
  '4': {
    title: '길잡이 계약',
    ending: 'deal',
    seed: 1,
    inputs: {
      b02_people: ['(달려가서 길을 묻는다)'],
      b05_why: ['저를 살려 주시면 크라차까지 길잡이를 해 드리고 보상도 드릴게요'],
      r4_prove: ['(지도를 펼쳐 크라차 쪽 길을 짚어 보인다)'],
    },
  },
  '5': {
    title: '자칭 공녀',
    ending: 'value',
    seed: 1,
    inputs: {
      b02_people: ['(달려가서 길을 묻는다)'],
      b05_why: ['저는 크롬웰 제국의 귀족 가문 사람이에요'],
      r5_claim: ['(허리를 펴고 궁정식으로 인사한다)'],
    },
  },
};

export const FALLBACK_INPUT = '(똑바로 바라본다)';
