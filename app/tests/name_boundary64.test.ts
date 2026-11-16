import { expect, test } from 'bun:test';
import { Engine, type GmContext } from '../src/engine/engine.ts';
import { LocalGm } from '../src/gm/gm.ts';
import { loreFor } from '../src/gm/lore.ts';
import { properNameIn, validateOutput, type CheckOptions } from '../src/gm/validate.ts';
import { FakeGm, loadDesert, loadWolheunLore } from './helpers.ts';

const scenario = await loadDesert(), rawLore = await loadWolheunLore();
const state = new Engine(scenario, new FakeGm()).newGame(2, 'noun-boundary').state;
const lore = loreFor(rawLore, state);
const beat = scenario.beats.b05_why;
if (!beat?.free) throw new Error('검수 문맥 없음');
const base: GmContext = { scenario, state, beat, free: beat.free, text: '' };
const options: CheckOptions = {
  speakers: ['나레이션'], maxLines: 3, maxChars: 300, cast: scenario.cast, lore,
  stateGuard: [], echoOnly: [], outcomeForbid: [], playerText: '', reserved: [], gist: '', playerLore: scenario.sheet.name,
};
const spoilers = (text: string, input = '') => validateOutput(JSON.stringify({ lines: [{ speaker: '나레이션', text }] }),
  { ...options, input, playerText: input }).violations.filter(v => v.rule === 'spoilers').map(v => v.detail);

const originals = [
  '다급한 호소가 공중에 흩어졌다. 목을 짓누르던 서늘한 금속의 감촉이 아주 조금, 손가락 한 마디만큼 멀어졌다.',
  '다급한 호소가 공중에 흩어졌다. 목을 짓누르던 서늘한 감각이 아주 조금, 손가락 한 마디만큼 멀어졌다.',
  '다급한 외침이 공중에 흩어졌다. 서늘한 감각이 조금씩 멀어지며, 목을 짓누르던 날카로운 압박이 아주 미세하게 물러났다.',
];
test.each(originals)('원시 생성문의 정상 활용형은 숨긴 이름을 가리키지 않는다: %s', text => {
  expect(spoilers(text)).not.toContain('누르');
  expect(new LocalGm(null, rawLore).screen({ ...base, text })).toBeNull();
});

test.each([
  ['누르', '무게가 어깨를 억누르며 버텼다.'],
  ['누르', '손을 내밀어 단추를 누르고 기다렸다.'],
  ['누르', '단추를 누르던 손이 멎었다.'],
  ['누르', '몸을 더 세게 내리누르게 만들었다.'],
  ['연우', '자연우림을 떠올렸다.'],
  ['카라', '카라멜을 조금 먹었다.'],
  ['라', '바람이 달아올랐다.'],
] as const)('다른 단어 내부의 부분문자열은 이름이 아니다: %s / %s', (term, text) => {
  expect(properNameIn(text, term)).toBe(false);
});

test.each([
  ['누르', '누르'],
  ['누르', '누르가 왔다.'],
  ['누르', '누르에게도 전했다.'],
  ['누르', '누르님께서 왔다.'],
  ['누르', '그 여인의 이름은 누르였다.'],
  ['누르', '누르와는 처음 만났다.'],
  ['누르', '“누르”라고 불렀다.'],
  ['누르', '누르라는 여인이었다.'],
  ['베히다트', '나는 베히다트다.'],
  ['베히다트', '베 히 다 트.'],
  ['베히다트', '베히다트에게서도 답이 왔다.'],
  ['페시안', '페시안이라면 이야기가 달랐다.'],
] as const)('실제 이름과 조사·호칭·서술격은 계속 차단한다: %s / %s', (term, text) => {
  expect(properNameIn(text, term)).toBe(true);
});

test('일반 활용형 입력은 실제 이름 유출의 면제를 열지 않는다', () => {
  expect(spoilers('누르가 다가왔다.', '그 손을 짓누르던 무게를 치운다.')).toContain('누르');
});

test('실제 이름을 먼저 말한 입력의 되받기는 기존대로 면제하되 입력 screen은 이름을 가린다', () => {
  expect(spoilers('누르를 본 적은 없다.', '누르가 누구야?')).not.toContain('누르');
  expect(new LocalGm(null, rawLore).screen({ ...base, text: '누르가 누구야?' })).toMatchObject({ reason: 'unknown', term: '누르' });
});
