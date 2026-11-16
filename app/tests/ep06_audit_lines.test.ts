import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Engine } from '../src/engine/engine.ts';
import { loadScenario } from '../src/engine/scenario.ts';
import type { GameEvent, LineStyle } from '../src/engine/types.ts';
import { FakeGm } from './helpers.ts';

const scenario = await loadScenario(join(import.meta.dir, '../content/ep06_library.yaml'));
// 최종 원작 감사의 정본이다. YAML에서 기대값을 읽어 만들지 않는다.
const corrections = [
  {"cut":"ep06_c001","lines":[["ep06_아시나","speech","덕분에 잘 지냈다마다요."],["ep06_아시나","speech","라 쿤께선 지난밤 평안하셨는지요?"]]},
  {"cut":"ep06_c007","lines":[["ep06_라독백","thought","손이 부드럽군."],["ep06_라독백","thought","나시르의 말도 일리가 있겠어."],["ep06_청발회상","thought","행동이 과격하긴 하나,"],["ep06_청발회상","thought","말투나 생김새… 그리고 풍기는 느낌이 심상치 않은게."],["ep06_청발회상","thought","왠지 북대륙의 귀족 자제 같습니다."]]},
  {"cut":"ep06_c008","lines":[["ep06_라","speech","크라차에 가는 목적은?"],["ep06_아시나","speech","말했잖아요."],["ep06_아시나","speech","단순한 여-"],["ep06_라","speech","단순한 여행."],["ep06_라","speech","-이라고 한 번만 더 내뱉는다면,"],["ep06_라","speech","지금 당장 그 입을 막아 주지."]]},
  {"cut":"ep06_c011","lines":[["ep06_독백","thought","내 본능은 이 남자를 피하라고 하고 있다는 거다."],["ep06_아시나","speech","…그, 대추야자가 맛있다고 해서!"],["ep06_아시나","speech","크라차산 대추야자가 유명하잖아요."],["ep06_아시나","speech","그래서 가려고 했던 거예요."]]},
  {"cut":"ep06_c024","lines":[["ep06_라","speech","…이름이 뭐지?"],["ep06_독백","thought","빨리도 물어본다, 나쁜 놈."],["ep06_아시나","speech","아시나예요."]]},
  {"cut":"ep06_c025","lines":[["ep06_나시르","speech","또 뵙게 되어 반갑습니다. 아시나님."],["ep06_나시르","speech","옷을 갈아입으시니 몰라보겠습니다."],["ep06_나시르","speech","아주 어여쁘시네요. 라 쿤께서는 좋으시겠습니다."]]},
  {"cut":"ep06_c026","lines":[["ep06_아시나","speech","당연하죠, 전 미소녀니까."],["ep06_미확정풍선","narration","이 상황에서도 입은 살아있군."]]},
  {"cut":"ep06_c027","lines":[["ep06_한숨미확정","speech","하아…"],["ep06_라","speech","데려가라."],["ep06_독백미확정","thought","왜 날 자꾸 어디론가 보내는 거야?!"]]},
  {"cut":"ep06_c029","lines":[]},
  {"cut":"ep06_c032","lines":[["ep06_라","speech","…뭐,"],["ep06_라","speech","애초에 겁박으로는 입을 열지 않는 위인인듯하니."],["ep06_라","speech","너라면 말로 구슬려 낼 수 있겠지."],["ep06_라","speech","그 여자 진짜 정체가 뭔지 알아내라."],["ep06_나시르","speech","예, 시하드시여."]]},
  {"cut":"ep06_c046","lines":[["ep06_나시르","speech","크라차와 페시안이 현재 적대 관계라는 것을요."],["ep06_아시나","speech","…!"],["ep06_아시나","speech","아니요, 그건 몰랐는데요."],["ep06_아시나","speech","크라차가 페시안 건국에 반대하는 사람들이 모여서 만든 나라라는 것만 알았지…"],["ep06_아시나","speech","사이가 안 좋다는 말은 처음 듣는데…"]]},
  {"cut":"ep06_c047","lines":[["ep06_나시르","speech","최근 크라차와 페시안 사이에 마찰이 있었습니다."],["ep06_나시르","speech","그것 때문에 분위기가 안 좋죠."],["ep06_나시르","speech","아시나님은 모르셨던 모양입니다."]]},
  {"cut":"ep06_c048","lines":[["ep06_아시나","speech","…아무래도 북에 있는 기록은 몇 년 늦기 마련이니까요."]]},
  {"cut":"ep06_c049","lines":[]},
  {"cut":"ep06_c051","lines":[["ep06_나시르","speech","그렇군요."],["ep06_아시나","speech","날 그렇게 죄인 취급했던 것도 이해가 가네요."]]},
  {"cut":"ep06_c052","lines":[["ep06_독백","thought","하필이면 적국의 왕한테 크라차 가는 길을 물어봤다니."],["ep06_독백","thought","심지어 감옥에서도 탈출하고"],["ep06_독백","thought","ㅋㅋㅋㅋㅋ"],["ep06_독백","thought","딱 봐도 수상한 짓 했네… 내가…"]]},
  {"cut":"ep06_c053","lines":[["ep06_독백","thought","감옥에 넣은 게 감사한 처사였다…"]]},
  {"cut":"ep06_c054","lines":[["ep06_나시르","speech","이번엔 제가 물어봐도 될까요?"],["ep06_아시나","speech","네. 그럼요."],["ep06_나시르","speech","사막 이야기가 나와서 말입니다."]]},
  {"cut":"ep06_c055","lines":[["ep06_나시르","speech","크라차로 가는 길에 안내인들이,"],["ep06_나시르","speech","사막을 가로지르지 않고 우회해서 가는 방향을 추천하지 않았습니까?"],["ep06_나시르","speech","크라차로 가는 북인들은 다 그렇게 가던데"],["ep06_아시나","speech","알아요. 그렇게 가라고 했었죠. 제가 거절했지만."]]},
  {"cut":"ep06_c056","lines":[["ep06_나시르","speech","…그러면 더더욱 모르겠군요."],["ep06_나시르","speech","왜 죽을 위험을 감수하면서까지 사막에 가셨던 건지."],["ep06_나시르독백","thought","지금까지 했던 말로는 이자가 말하는 게 진실인지 알 수 없다."],["ep06_나시르독백","thought","하지만 사막에 간 이유까지 거짓말하면 티가 나기 마련이지."]]},
  {"cut":"ep06_c057","lines":[["ep06_나시르독백","thought","그러니 이제는 보여라,"],["ep06_나시르독백","thought","그 아름다운 얼굴 뒤에 숨기고 있는 게 뭔지-"]]},
  {"cut":"ep06_c058","lines":[["ep06_아시나","speech","북대륙은 말이죠."],["ep06_아시나","speech","계절마다 산의 색이 달라지고,"],["ep06_아시나","speech","들판은 푸르고 아름다워요."],["ep06_아시나","speech","하지만,"]]},
  {"cut":"ep06_c059","lines":[["ep06_아시나","speech","모래로 이루어진 바다는 없죠."]]},
  {"cut":"ep06_c060","lines":[["ep06_아시나","speech","그래서 그 광경이 보고 싶었어요."],["ep06_나시르","speech","그러셨군요…"],["ep06_나시르독백","thought","나 역시 이곳에서 나고 자라며 사막을 보긴 했지만,"]]},
  {"cut":"ep06_c061","lines":[["ep06_나시르독백","thought","저런 기분은 한 번도 받지 못했다."],["ep06_나시르","speech","그래서,"],["ep06_나시르","speech","직접 사막을 본 소감은 어떻습니까?"]]},
  {"cut":"ep06_c062","lines":[["ep06_아시나","speech","사막은…"],["ep06_아시나","speech","상상했던 것보다 더 예뻤어요."],["ep06_아시나미확정","narration","타는듯한 더위에 녹아 사라져도 좋을 만큼."]]},
  {"cut":"ep06_c063","lines":[["ep06_아시나","speech","그런곳이 죽음의 사막이라 불린다니…"],["ep06_아시나","speech","좀 놀랐어요."]]},
  {"cut":"ep06_c064","lines":[["ep06_나시르독백","thought","이 여자는 진실을 말하고 있다."],["ep06_나시르","speech","네, 죽음의 사막을 아름답다고 하는 사람은"],["ep06_나시르","speech","세상에 아시나님밖에 없을 겁니다."]]},
  {"cut":"ep06_c065","lines":[["ep06_나시르독백","thought","저런 눈빛을 보면 누구라도 인정할 수밖에 없겠어."]]}
] satisfies readonly { readonly cut: string; readonly lines: readonly (readonly [string, LineStyle, string])[] }[];

const gm = new FakeGm();
const engine = new Engine(scenario, gm, () => 1000);
let result = engine.newGame(6, 'ep06-최종감사');
const events: GameEvent[] = [...result.step.events];
for (const decision of ['decline', 'purpose', 'origin', 'question', 'politics', 'travel']) {
  result = await engine.act(result.state, { type: 'choose', id: 'ep06_' + decision + '_direct' });
  events.push(...result.step.events);
}
const actual = new Map<string, (readonly [string, LineStyle, string])[]>();
let cut = '';
for (const event of events) {
  if (event.type === 'scene') cut = scenario.beats[event.beat]?.cut ?? cut;
  if (event.type === 'line' && event.text) {
    const lines = actual.get(cut) ?? [];
    lines.push([event.speaker, event.style, event.text]);
    actual.set(cut, lines);
  }
}

describe('6화 최종 원작 감사 29컷의 실제 재생', () => {
  for (const correction of corrections) {
    test(correction.cut + ': 원문 대사와 화자·발화 종류를 보존한다', () => {
      expect(actual.get(correction.cut) ?? []).toEqual(correction.lines);
    });
  }
  test('교정 대사를 재생해도 판정이나 모델 호출 없이 도서실에서 끝난다', () => {
    expect(result.state.ending).toBe('ep06_internal_end');
    expect(events.filter((event) => event.type === 'roll')).toEqual([]);
    expect(gm.calls).toEqual([]);
  });
});
