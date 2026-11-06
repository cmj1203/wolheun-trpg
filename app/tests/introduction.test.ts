import { describe, expect, test } from 'bun:test';
import { Introduction } from '../web/introduction.ts';

describe('이야기 시작 전 안내', () => {
  test('새 게임은 안내 여섯 줄을 한 번씩 넘긴 뒤 이야기를 시작한다', () => {
    const intro = new Introduction('new');
    const shown: string[] = [];
    while (intro.current) {
      shown.push(intro.current.text);
      intro.next();
    }
    expect(shown).toHaveLength(6);
    expect(shown[0]).toBe('난 이 판을 진행하는 사막여우야.');
    expect(shown[1]).toBe('넌 아시나가 돼.');
    expect(shown[5]).toBe('막히거나 궁금하면 입력창 오른쪽 내 얼굴 단추를 눌러 물어봐.');
    expect(intro.current).toBeNull();
    intro.next();
    expect(intro.current).toBeNull();
  });

  test('불러오기는 안내 없이 저장한 장면으로 간다', () => {
    const intro = new Introduction('load');
    expect(intro.current).toBeNull();
    intro.next();
    expect(intro.current).toBeNull();
  });

  test.each([0, 2, 5])('%i번 넘긴 자리에서 건너뛰면 남은 안내가 나오지 않는다', (clicks) => {
    const intro = new Introduction('new');
    for (let i = 0; i < clicks; i += 1) intro.next();
    expect(intro.current).not.toBeNull();
    intro.skip();
    expect(intro.current).toBeNull();
    intro.next();
    expect(intro.current).toBeNull();
  });
});
