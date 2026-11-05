// --no-llm 경로(LocalGm(null))로 갈래를 끝까지 돌리고, 화면에 나오는 글을 web/main.ts 가 보여 주는 모양대로 적는다.
// 실행: cd app && bun ../docs/research/playthrough/run_playthrough.ts [갈래키...]
// 결과: docs/research/playthrough/transcripts/<키>.md
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Engine } from '../../../app/src/engine/engine.ts';
import { summarize } from '../../../app/src/engine/summary.ts';
import type { Action, GameEvent, GameState, Prompt, Step } from '../../../app/src/engine/types.ts';
import { LocalGm } from '../../../app/src/gm/gm.ts';
import { loadDesert, loadWolheunLore } from '../../../app/tests/helpers.ts';
import { PLAYS, type Play, type Move } from './plays.ts';

const OUT = join(import.meta.dir, 'transcripts');
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
const shownText = (style: string, text: string) => (style === 'thought' && !/^\(.*\)$/s.test(text.trim()) ? `(${text})` : text);
const TWIST_LABEL = { none: '그대로', altered: '달라진 결', interrupt: '끼어드는 일' } as const;

function renderEvent(ev: GameEvent, out: string[]): void {
  switch (ev.type) {
    case 'scene':
      out.push('', `### [장면] ${ev.title}  \`${ev.beat}\``, '');
      break;
    case 'line': {
      const text = shownText(ev.style, ev.text);
      const by = ev.by === 'gm' ? ' ‹GM›' : '';
      // 효과음·그림(CG)·화면 효과는 같은 줄 끝에 붙인다(줄 번호가 바뀌지 않게).
      const deco = `${ev.sfx ? ` 〔효과음 ${ev.sfx}〕` : ''}${ev.cg ? ` 〔그림 ${ev.cg}〕` : ''}${ev.fx ? ` 〔화면 ${ev.fx}〕` : ''}`;
      if (ev.style === 'gm') out.push(`- 🦊 **${ev.display}**: ${text}${by}${deco}`);
      else if (ev.style === 'narration') out.push(`- ${text}${by}${deco}`);
      else out.push(`- **${ev.display}**: ${text}${by}${deco}`);
      break;
    }
    case 'echo':
      out.push(`- ▷ (입력 되보이기) ${ev.text}`);
      break;
    case 'roll': {
      const mods = ev.mods.map((m) => ` ${signed(m.value)}(${m.label})`).join('');
      const note = ev.tier === 'hit' ? '10 이상 · 원하는 대로 된다' : ev.tier === 'mixed' ? '7~9 · 해내지만 대가가 따른다' : '6 이하 · 실패';
      out.push(`- 🎲 〔주사위 창〕 ${ev.label} · ${ev.stat} 판정 | ${ev.dice[0]} + ${ev.dice[1]} ${signed(ev.statValue)}(${ev.stat})${mods} = ${ev.total} / 목표 10 | **${ev.tierLabel}** | ${note}`);
      break;
    }
    case 'tracks':
      out.push(`- 〔수치 칸〕 ${ev.changes.map((c) => `${c.key} ${c.from}→${c.to}`).join(', ')}`);
      break;
    case 'price':
      out.push(`- 〔대가 줄〕 ${ev.tag} — ${ev.text}`);
      break;
    case 'twist':
      out.push(`- 〔장면 검사〕 긴장 ${ev.tension} · 주사위 ${ev.roll} → ${TWIST_LABEL[ev.result]}`);
      break;
    case 'confirm':
      out.push(`- 〔확인 창〕 ${ev.text} [${ev.yes ?? '끝낸다'}] [${ev.no ?? '계속한다'}]`);
      break;
    case 'notice':
      out.push('- 〔알림〕 질문은 오른쪽 🦊 GM 단추로 물어 봐.');
      break;
    case 'items':
      for (const i of ev.gained) out.push(`- 〔알림〕 얻음: ${i.name}`);
      for (const i of ev.lost) out.push(`- 〔알림〕 잃음: ${i.name}`);
      break;
    case 'note':
      out.push(`- 〔알림〕 수첩에 적었다 · ${ev.name}`);
      break;
    case 'ending':
      out.push(`- 〔${ev.bad ? '작은 끝' : '결말'} 카드〕 **${ev.title}** — ${ev.summary}`);
      break;
    case 'sprite':
    case 'revise':
      break;
  }
}

function renderPrompt(p: Prompt, out: string[]): void {
  if (p.type === 'free') {
    out.push('', `> **〔입력 자리〕** ${p.placeholder}`);
    out.push(`> 입력칸 안내: ${p.example ? `예: ${p.example}` : '말하거나 행동하기'}`);
    out.push(`> 단추: ${p.approaches.map((a) => `[${a.label} ${a.stat} ${signed(a.statValue)}${a.locked ? ' 잠김' : ''}]`).join(' ')}`);
  } else if (p.type === 'luck') {
    out.push('', `> **〔행운 선택〕** [행운 ${p.need} 쓰기] [그대로 간다] (남은 행운 ${p.have})`);
  } else if (p.type === 'choices') {
    out.push('', `> **〔선택지〕** ${p.options.map((o, i) => `${i + 1}. ${o.text}`).join(' / ')}`);
  }
}

function renderMove(m: Move, out: string[]): void {
  if ('free' in m) out.push('', `**▶ 플레이어 입력:** 「${m.free}」`, '');
  else if ('approach' in m) out.push('', `**▶ 플레이어:** 단추 [${m.approach}] 누름`, '');
  else if ('luck' in m) out.push('', `**▶ 플레이어:** ${m.luck ? '[행운 쓰기]' : '[그대로 간다]'}`, '');
  else if ('confirm' in m) out.push('', `**▶ 플레이어:** 확인 창 ${m.confirm ? '[예 쪽]' : '[아니오 쪽]'}`, '');
  else if ('ask' in m) out.push('', `**▶ 플레이어:** 🦊 GM 단추(질문 모드)로 묻기 「${m.ask}」`, '');
}

function renderResult(engine: Engine, state: GameState, out: string[]): void {
  const r = summarize(engine.scenario, state);
  out.push('', '### [결과 화면]', '');
  out.push(`- ${r.episode} · **${r.ending?.title ?? '이야기의 끝'}**`);
  out.push(`- ${r.ending?.summary ?? ''}`);
  out.push(`- 다음: ${r.ending?.nextHook ?? ''}`);
  out.push(`- 판정 ${r.checks.length}회 · 선택과 입력 ${r.decisions.length}회`);
  out.push(`- 수치: ${r.tracks.map((t) => `${t.label} ${t.value}${t.unit || `/${t.max}`}`).join(', ')}`);
  out.push(`- 단추: ${r.ending?.bad ? '[마지막 갈림길에서 다시] [처음부터]' : '[다시 하기]'}`);
  out.push('- 돌아보기:');
  let scene = '';
  for (const e of r.replay) {
    if (e.beatTitle !== scene) out.push(`  - 〈${(scene = e.beatTitle)}〉`);
    if (e.kind === 'decision') out.push(`    - ${e.text} (${e.detail})`);
    else if (e.kind === 'check') out.push(`    - 🎲 ${e.label} ${e.total} → ${e.tierLabel}`);
    else out.push(`    - 대가 ${e.tag} — ${e.text}`);
  }
}

function nextMove(play: Play, step: Step, queues: Record<string, Move[]>, lastConfirm: boolean): Move {
  const p = step.prompt;
  if (lastConfirm) return queues['@confirm']?.shift() ?? { confirm: play.confirmDefault ?? false };
  if (p.type === 'luck') return queues['@luck']?.shift() ?? { luck: false };
  if (p.type === 'free') return queues[p.beat]?.shift() ?? { free: play.fallback ?? '똑바로 바라본다' };
  throw new Error(`입력 자리 아님: ${p.type}`);
}

export async function runPlay(key: string, play: Play, write = true): Promise<{ ending: string | null; turns: number; text: string }> {
  const scenario = await loadDesert();
  const lore = await loadWolheunLore();
  let now = 1_000_000;
  const gm = new LocalGm(null, lore);
  if (play.attackOn?.length) {
    // --no-llm 에서는 attack 위험을 LLM 만 매긴다. 칼 앞 작은 끝(x_reckless)을 보려고 이 입력만 LLM 이 attack 으로 읽었다고 대신 적는다.
    const interpret = gm.interpret.bind(gm);
    gm.interpret = async (ctx) => {
      const read = await interpret(ctx);
      return play.attackOn!.includes(ctx.text) ? { ...read, risk: 'attack' } : read;
    };
  }
  const engine = new Engine(scenario, gm, () => now, true);
  let { state, step } = engine.newGame(play.seed, `pt-${key}`);
  const out: string[] = [`# ${key}. ${play.title}`, '', `seed ${play.seed} · --no-llm(LocalGm null) · 목표 결말 \`${play.ending}\``, '', play.note ?? '', ''];
  for (const ev of step.events) renderEvent(ev, out);
  const queues: Record<string, Move[]> = structuredClone(play.moves);
  let turns = 0;
  let lastConfirm = false;
  while (step.prompt.type !== 'end') {
    if (++turns > 60) throw new Error(`${key}: 60턴 안에 끝나지 않았다`);
    renderPrompt(step.prompt, out);
    const move = nextMove(play, step, queues, lastConfirm);
    renderMove(move, out);
    const action: Action = 'free' in move ? { type: 'free', text: move.free } : 'approach' in move ? { type: 'approach', id: move.approach } : 'luck' in move ? { type: 'luck', use: move.luck } : 'ask' in move ? { type: 'ask', text: move.ask } : { type: 'confirm', ok: move.confirm };
    now += 20_000;
    ({ state, step } = await engine.act(state, action));
    for (const ev of step.events) renderEvent(ev, out);
    lastConfirm = step.events.some((e) => e.type === 'confirm');
  }
  renderResult(engine, state, out);
  const left = Object.entries(queues).filter(([, q]) => q.length > 0).map(([b, q]) => `${b}:${q.length}`);
  if (left.length) out.push('', `(쓰지 않은 입력: ${left.join(', ')})`);
  const text = out.join('\n') + '\n';
  if (write) {
    await mkdir(OUT, { recursive: true });
    await writeFile(join(OUT, `${key}.md`), text);
  }
  return { ending: state.ending, turns, text };
}

if (import.meta.main) {
  const keys = process.argv.slice(2);
  let bad = 0;
  for (const [key, play] of Object.entries(PLAYS)) {
    if (keys.length && !keys.includes(key)) continue;
    const r = await runPlay(key, play);
    const ok = r.ending === play.ending;
    if (!ok) bad++;
    console.log(`${ok ? 'ok ' : 'NG '} ${key.padEnd(18)} → ${r.ending} (목표 ${play.ending}, ${r.turns}턴)`);
  }
  process.exit(bad ? 1 : 0);
}
