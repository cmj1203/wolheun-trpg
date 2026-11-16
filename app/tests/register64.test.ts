import { expect, test } from 'bun:test';
import { validateOutput, type CheckOptions } from '../src/gm/validate.ts';
import { loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert();
const lore = await loadWolheunLore();
const options: CheckOptions = {
  speakers: ['나레이션', '남자'], maxLines: 3, maxChars: 100,
  cast: scenario.cast, lore, stateGuard: [], echoOnly: [], outcomeForbid: [], absent: [], reserved: [],
  playerLore: '아시나', playerText: '', gist: '',
};

test('명시적으로 금지한 3인칭 자기 호명은 soft 최선 후보로 남길 수 없다', () => {
  const result = validateOutput(JSON.stringify({ lines: [{ speaker: '나레이션', text: '그녀는 남자의 손을 바라보았다.' }] }), options);
  expect(result.violations.some((v) => v.rule === 'register_word' && v.severity === 'hard')).toBe(true);
});

test('정상 시녀 호칭은 서로 다른 답의 반복으로 오인하지 않는다', () => {
  const man = scenario.cast.남자;
  if (!man) throw new Error('시험 화자 없음');
  const result = validateOutput(JSON.stringify({ lines: [{ speaker: '남자', text: '아가씨, 서두르지 않으셔도 됩니다.' }] }), {
    ...options, speakers: ['남자'], reactor: '남자',
    cast: { ...scenario.cast, 남자: { ...man, lore: '안내 시녀', display: '안내 시녀' } },
    spoken: { 남자: ['아가씨, 안으로 들어오십시오.', '여기 앉으시면 됩니다.'] },
  });
  expect(result.violations.filter((v) => v.rule === 'reaction_repeat')).toEqual([]);
});

test('호칭이 정상이어도 이번 판에 한 응답 전체를 복사하는 것은 계속 거절한다', () => {
  const text = '이쪽으로 오십시오.';
  const result = validateOutput(JSON.stringify({ lines: [{ speaker: '남자', text }] }), {
    ...options, spoken: { 남자: [text] },
  });
  expect(result.violations.some((v) => v.rule === 'repeat_play' && v.severity === 'hard')).toBe(true);
});

test('재시도 가능한 길이 스타일은 명시 금지와 달리 soft로 유지한다', () => {
  const result = validateOutput(JSON.stringify({ lines: [{ speaker: '나레이션', text: '나는 남자의 손을 바라보았다.' }] }), { ...options, maxChars: 5 });
  expect(result.violations.some((v) => v.rule === 'too_long' && v.severity === 'soft')).toBe(true);
});
