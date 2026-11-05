// 입력 종류를 문장 꼴로 읽는 readInput 의 시험. 낱말 뜻이 아니라 어미·호칭·높임·물음·부정의 꼴을 본다.
import { describe, expect, test } from 'bun:test';
import { readInput, type InputKind } from '../src/engine/text.ts';

const OPTS = { selfNames: ['아시나'] };
const kindOf = (text: string, opts: Parameters<typeof readInput>[1] = OPTS): InputKind => readInput(text, opts).kind;

function each(kind: InputKind, cases: string[]): void {
  test.each(cases)(`%s → ${kind}`, (text) => {
    expect(kindOf(text)).toBe(kind);
  });
}

describe('행동: 현재 서술 "-ㄴ다/-는다"와 다짐 "-ㄹ게/-ㄹ래/-자"', () => {
  each('action', [
    '바위 뒤로 몸을 숨긴다',
    '남자의 손목을 덥석 잡는다',
    '물을 마신다', // "마신다"의 "신"을 높임 "-시-"로 읽지 않는다
    '남자를 꽉 안는다', // "안는다"는 부정 "안"이 아니다
    '눈을 피하지 않고 노려본다', // 부정은 앞 마디에만 있다
    '팔을 흔들며 그쪽으로 걸어간다', // "그쪽으로"는 방향이지 2인칭이 아니다
    '일단 뛰어 볼게',
    '모래를 던질래',
    '도망가자',
    '던져 볼까?',
    '저 사람들 누구지? 일단 말 걸어본다', // 마지막 문장이 정한다
  ]);
});

describe('시도하지 않음: 마지막 서술어의 부정', () => {
  each('refrain', ['아무것도 안 한다', '칼을 잡지 않는다', '던지려다 만다', '그냥 안 할래', '안할래', '싸우지 말자', '그만 둔다', '그만하자']);
});

describe('건넨말: 듣는 이 표지', () => {
  each('speech', [
    '칼부터 좀 내려 주시면 안 될까요', // 해요체
    '실례합니다, 길 좀 여쭤도 될까요?', // 합쇼체·낮춤말
    '물 좀 나눠 주실 수 있나요?', // 듣는 이 높임 "-시-"
    '저 아세요? 처음 보는 사이잖아요',
    '제가 무기라도 든 것처럼 보여요?', // 낮춤 1인칭
    '팔 안 아파요?', // 존댓말 부정 물음
    '너 여기서 뭐 하는 놈이야?', // 2인칭
    '그 칼 진짜로 쓸 거야?', // 듣는 이 쪽 "그"
    '내가 뭘 잘못했는데?', // 대명사와 "-는데?"
    '당신을 믿는다', // 서술 꼴이어도 2인칭이면 말이다
    '이봐, 칼 치워', // 부름말
    '아저씨, 진정 좀 해', // 호칭
    '아저씨 이름이 뭐야?',
    '거기 세 분!',
    '거기 멈춰! 누구냐!', // 해라체 물음
    '됐고, 물이나 좀 줘', // 시킴 "-어 줘"
    '웃기지 마', // 막음 "-지 마"
    '비켜라', // 해라체 시킴
    '뭐라고?', // 되물음
    '네',
    '"살려 주세요" 하고 외친다', // 따옴표 안의 말
  ]);
});

describe('혼잣말: 듣는 이 없음·자문·반어·기도·제 이름', () => {
  each('self', [
    '다리 아파…',
    '발바닥 다 익겠다', // "-겠다"는 현재 서술이 아니다
    '진짜 최악이다',
    '망했다 망했어',
    '손이 왜 이렇게 떨리지', // 물음표 없는 자문
    '하필 이런 데서 걸리냐', // 물음표·의문사·느낌표 없는 "-냐"는 탄식
    '아까 숨어 있을걸 그랬나',
    '이러다 진짜 죽는 거 아니야?', // 반어
    '신이시여, 한 번만 살려 주세요', // 기도: 높임말이어도 앞사람에게 한 말이 아니다
    '후, 정신 차려 아시나', // 제 이름
    '울면 안 돼, 울면 안 돼', // "안 돼"는 행동의 부정이 아니다
    '괜찮아, 할 수 있어', // 해체 서술어 조각은 부름이 아니다
  ]);
});

describe('게임질문: 듣는 이 표지가 없는 물음', () => {
  each('question', [
    '저장은 어디서 하나요?', // 존댓말이어도 듣는 이 표지가 없다
    '판정은 어떻게 정해지나요?',
    '이 남자랑 싸우면 이길 확률 있어?', // 앞사람을 3인칭으로 가리킨다
    '판정 목표 숫자가 몇이었지?', // 물음표가 있는 "-지"
    '저 아저씨 누구야?', // "저 ~"는 듣는 이가 아니다
    '선택지 없이 그냥 써도 돼?',
  ]);
});

describe('세계밖: 로마자·자모 웃음·"이거"·채팅체·넘겨받은 목록', () => {
  each('outside', ['ㅋㅋ 개웃기네 이거', '친구가 이거 해 보라고 해서 왔어', '나 지금 수업 시간에 몰래 하는 중', 'GPS 켜서 길을 찾는다']);
  test('세계에 없는 물건은 넘겨받은 목록으로만 안다', () => {
    expect(kindOf('휴대폰 꺼내서 지도 앱을 켠다')).toBe('action');
    const r = readInput('휴대폰 꺼내서 지도 앱을 켠다', { ...OPTS, outsideWords: ['휴대폰'] });
    expect(r.kind).toBe('outside');
    expect(r.outside).toBe('thing');
  });
  test('세계 밖 물건을 묻는 말은 게임 질문이다', () => {
    expect(kindOf('이 게임 AI가 쓰는 거야?')).toBe('question');
  });
});

describe('말 높이가 달라도 행동은 행동이다', () => {
  each('action', ['문을 엽니다', '아시나는 칼을 피합니다', '문 열어 볼게요', '조사할게요', '던질 게', '그쪽 길로 간다', '길을 안내한다', '아는 걸 다 말한다', '품에 안긴다']);
  each('speech', ['정말 감사합니다', '같이 갈래?', '도와줄래?', '정말 아무 짓도 안 할게요 나리', '무슨 일인지 설명해 줄 수 있소?', '하지마!', '그거 내려놔. 나 아무것도 안 가졌어', '베지 마! 난 길을 잃었을 뿐이야', '왜 이러는데']);
  each('refrain', ['안 할래요', '소리치려다 입을 꾹 다문다', '칼을 잡으려고 손을 뻗다가 도로 거둔다', '손을 흔들까 하다가, 관둔다', '말을 걸지 않기로 한다', '도망치지 않을래. 그냥 이대로 있을래', '아무말도안함']);
  each('self', ['그건 안 된다!', '저 칼 진짜 날카로워 보인다…', '침착하자 침착하자', '침착하자 아시나, 침착하자', '구석에 웬 상자', '날씨, 좋다!', '얼음']);
  each('question', [
    '그 사람 누구야?', // 앞에 나온 것을 받는 "그"는 듣는 이 표지가 아니다
    '저 사람 누구예요?', // 지시어 "저"는 낮춤 1인칭이 아니다
    '이 도시는 어디예요?',
    '아시나 머리 색이 뭐야?', // 제 이름을 3인칭으로 쓴 물음
    '맨손으로 싸워도 되는 거야? 규칙상', // 물음 뒤 한 낱말 꼬리
    '경비병은 몇 명 보여? 묘사 좀 더 해줘', // 진행자에게 물은 뒤 덧붙인 부탁
    '이 남자 정체가 뭔지 알려줘',
    '지금 몇 턴째야', // 물음표 없는 "몇 … -야"
  ]);
  test('"도망가자, 빨리 도망가자"는 되풀이가 아니라 다짐이다', () => {
    expect(kindOf('도망가자, 빨리 도망가자')).toBe('action');
    expect(kindOf('살려줘 살려줘!')).toBe('speech');
  });
  test('따옴표 말 뒤에 다른 마디가 있으면 행동이다', () => {
    expect(kindOf('"싸울 생각 없어"라고 중얼거리며 한 걸음 뒤로 물러선다')).toBe('action');
    expect(kindOf('신이시여 하고 중얼거리며 무릎을 꿇는다')).toBe('action');
  });
});

describe('두 번째 검토에서 고친 꼴', () => {
  each('action', ['칼을 뽑는다. 천천히.', '칼을 뽑는다 (진지)', '칼을 뽑았다', '칼을 뽑음', '남자에게 다가감']);
  each('speech', ['칼을 뽑는다. 꺼져!', '남자에게 말을 건다. "괜찮아요?"', '멈춰라!', '놔라', '네 이름이 뭐야?', '그대는 누구인가?', '왜 그러는데?', '뭐라고요?', '아저씨~', '그 칼 진짜로 쓸 거야?']);
  each('self', ["'뭐지?'", '배고팠다', '칼 든 남자', '하느님 맙소사']);
  each('question', ['저 남자 누구예요?', '저 여자 누구예요?', '제가 다쳤나요?']);
  each('refrain', ['말 안 할 거야', '싸우지 않을 거야', '안 함']);
  test('"-나요"는 받침 없는 줄기("물러나요")에서 물음이 아니다', () => {
    expect(readInput('천천히 뒤로 물러나요').asking).toBe(false);
    expect(readInput('여기 물 있나요').asking).toBe(true);
  });
  test('물은 뒤 부탁을 되풀이한 긴 입력도 곧 끝난다', () => {
    const started = performance.now();
    expect(kindOf(`뭐? ${'해줘. '.repeat(10000)}`)).toBe('question');
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe('글자 없음', () => {
  each('noise', ['?', 'ㅋㅋㅋ', '...', '']);
});

describe('읽은 꼴', () => {
  test('서술어 꼴과 물음 여부를 함께 돌려준다', () => {
    expect(readInput('바위 뒤로 숨는다')).toMatchObject({ form: 'narrative', asking: false });
    expect(readInput('저장은 어디서 하나요?')).toMatchObject({ form: 'polite', asking: true });
    expect(readInput('손이 왜 이렇게 떨리지')).toMatchObject({ form: 'musing', asking: false });
    expect(readInput('발바닥 다 익겠다')).toMatchObject({ form: 'declarative' });
    expect(readInput('고맙습니다')).toMatchObject({ form: 'formal' });
  });
  test('곁에 있는 인물의 이름을 부르면 건넨 말이다', () => {
    expect(kindOf('크롬웰, 칼 치워', { names: ['크롬웰'] })).toBe('speech');
    expect(kindOf('칼 치워')).toBe('self');
  });
});

describe('측정 뒤 고친 버그', () => {
  test('"그대로"는 2인칭 "그대"가 아니다', () => {
    expect(kindOf('그대로 뒤로 털썩 주저앉는다')).toBe('action');
    expect(kindOf('그대는 누구인가?')).toBe('speech');
  });
  test('붙여 쓴 "주실수"도 듣는 이 높임이다', () => {
    expect(kindOf('물 좀 주실수 있나요ㅠ')).toBe('speech');
  });
});

describe('docs/research/input_corpus.jsonl 회귀 문턱', () => {
  // 학습용 154·확인용 68 로 나눠 잰 값(PR 본문)보다 조금 낮게 둔 회귀 문턱이다. 세계밖은 낱말 뜻에 기대는 입력이 많아 따로 센다.
  const KIND: Record<string, InputKind> = { 행동: 'action', 건넨말: 'speech', 혼잣말: 'self', 게임질문: 'question', 세계밖: 'outside' };
  test('세계밖을 뺀 종류는 85% 넘게, 전체는 80% 넘게 맞힌다', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { loadWolheunLore } = await import('./helpers.ts');
    const lore = await loadWolheunLore();
    const text = await readFile(join(import.meta.dir, '../../docs/research/input_corpus.jsonl'), 'utf8');
    const rows = text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as { text: string; kind: string });
    let all = 0;
    let inner = 0;
    let innerN = 0;
    for (const r of rows) {
      const ok = readInput(r.text, { selfNames: ['아시나'], outsideWords: lore.forbidden.modern }).kind === KIND[r.kind];
      all += ok ? 1 : 0;
      if (r.kind !== '세계밖') {
        innerN += 1;
        inner += ok ? 1 : 0;
      }
    }
    expect(inner / innerN).toBeGreaterThan(0.85);
    expect(all / rows.length).toBeGreaterThan(0.8);
  });
});
