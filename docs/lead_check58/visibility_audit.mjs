import { Engine } from '../../app/src/engine/engine.ts';
import { evalCond } from '../../app/src/engine/conditions.ts';
import { INTRODUCTION } from '../../app/web/introduction.ts';
import { FakeGm, loadDesert } from '../../app/tests/helpers.ts';

const scenario = await loadDesert();
const engine = new Engine(scenario, new FakeGm());
const { state } = engine.newGame(2, 'visibility58');
const ctx = { tracks: state.tracks, abilities: state.abilities, flags: state.flags, items: state.items };
const visible = [];
const gated = [];
const add = (where, text) => { if (text) visible.push(`${where}\t${text}`); };
const inspect = (value, path) => {
  if (Array.isArray(value)) { value.forEach((v, i) => inspect(v, `${path}[${i}]`)); return; }
  if (!value || typeof value !== 'object') return;
  if (value.if?.includes('flag:귀찌_') && !evalCond(value.if, ctx)) {
    gated.push({ path, condition: value.if, text: value.text });
    return;
  }
  if (typeof value.speaker === 'string') add(path, value.text);
  for (const key of ['title', 'summary', 'nextHook', 'aim', 'placeholder', 'hint', 'label']) {
    if (typeof value[key] === 'string') add(`${path}.${key}`, value[key]);
  }
  // prices는 엔진의 가격 대사로 그대로 노출된다.
  if (value.tag && typeof value.text === 'string') add(`${path}.text`, value.text);
  for (const [key, child] of Object.entries(value)) {
    if (['lines', 'choices', 'free', 'approaches', 'outcomes', 'prices', 'ending', 'idle', 'nudge', 'press', 'deflect', 'talk_fallback', 'neutral', 'improv', 'improv_bold', 'offer', 'twist'].includes(key)) inspect(child, `${path}.${key}`);
    else if (['hit', 'mixed', 'miss', 'crit', 'altered', 'interrupt'].includes(key)) inspect(child, `${path}.${key}`);
  }
};
for (const [id, beat] of Object.entries(scenario.beats)) {
  if (id === 'x_unmasked') { gated.push({ path: id, condition: 'flag:귀찌_설명 && 귀찌 <= 0', text: beat.ending?.summary }); continue; }
  inspect(beat, id);
}
for (const item of engine.hud(state).items) add(`소지품.${item.id}`, `${item.name} ${item.desc}`);
for (const note of engine.hud(state).notes) add(`수첩.${note.id}`, `${note.name} ${note.text}`);
for (const [i, line] of INTRODUCTION.entries()) add(`안내.${i + 1}`, line.text);
for (const help of scenario.gameHelp ?? []) {
  if (help.track === '귀찌') { gated.push({ path: `도움말.${help.id}`, condition: 'flag:귀찌_설명', text: help.say }); continue; }
  add(`도움말.${help.id}`, help.say);
}
for (const fate of scenario.fates ?? []) {
  if (fate.id === 'unmasked') { gated.push({ path: `운명.${fate.id}`, condition: fate.when, text: fate.warn?.lines.map((l) => l.text).join(' / ') }); continue; }
  inspect(fate.warn?.lines, `운명.${fate.id}`);
}
await Bun.write(new URL('./visible_lines.txt', import.meta.url), visible.join('\n') + '\n');
await Bun.write(new URL('./gated_lines.json', import.meta.url), JSON.stringify(gated, null, 2));
const forbidden = /귀찌 수명|변장|은발|본모습|귀찌.{0,8}(뜨거|미지근|식어)|첩자|웰든|대공가|공녀/u;
const leaks = visible.filter((line) => forbidden.test(line.split('\t').slice(1).join('\t')));
console.log(JSON.stringify({ candidates: visible.length, leaks, gated: gated.length }, null, 2));
if (leaks.length) throw new Error('1화의 선행 공개 문구가 남았습니다');
