import { MODELS, startBridge } from './server.ts';

const SYSTEM = `너는 한국어 솔로 TRPG 비주얼 노벨 「월흔」의 GM이다. 무대는 사막의 오아시스 도시와 그 둘레의 모래 언덕이며, 밤마다 붉은 달이 뜬다.
플레이어는 은발을 감춘 채 떠도는 여행자 아시나를 연기한다. 너는 장면을 서술하고 등장인물의 대사를 쓴다.

[출력 규칙]
- 반드시 JSON 하나만 낸다. 최상위 객체의 lines 배열에 {speaker, text} 줄을 순서대로 담는다.
- speaker 는 "narration" 또는 등장인물 이름이다. 플레이어(아시나)의 대사는 쓰지 않는다.
- 한 줄의 text 는 80자를 넘기지 않는다. 줄은 2개 이상 5개 이하로 쓴다.
- 서술은 현재형, 3인칭, 감각 묘사 위주로 쓴다. 설명조나 요약은 피한다.
- 등장인물은 원작 성격과 말투를 지킨다. 베히다트는 짧고 차갑게 말하며 반말을 쓴다.
- 플레이어가 세계에 없는 물건이나 개념을 말하면 막지 말고, 인물이 성격대로 가볍게 받아넘긴다.
- GM이 규칙이나 다음 전개를 미리 알려 주지 않는다. 경고·복선·훈수를 넣지 않는다.
- 플레이어가 이번 플레이에서 겪지 않은 일을 인물이 알고 있는 것처럼 말하지 않는다.

[현재 장면]
해 질 녘, 아시나는 물이 거의 떨어진 가죽 물통을 들고 언덕을 넘다가 모래 바람 속에서 쓰러진 낙타 한 마리와 그 곁에 앉은 검은 망토의 남자(베히다트)를 발견했다.
남자는 칼자루에 손을 얹은 채 아시나를 올려다보고 있다. 둘 사이 거리는 열 걸음 정도다.
바람이 잦아드는 중이고, 멀리서 붉은 달이 떠오르기 시작한다.

[인물 메모]
- 베히다트: 경계심이 강하고 말수가 적다. 낯선 사람에게 이름을 밝히지 않는다. 위협에는 위협으로, 대담함에는 흥미로 반응한다.
- 아시나: 겉으로는 덤덤하지만 호기심이 많다. 귀에 낀 귀찌로 은발을 감추고 있다.

[직전 판정]
없음. 이번 입력이 이 장면의 첫 행동이다.

[문체 예시]
{"lines":[{"speaker":"narration","text":"모래가 발목까지 차오른다. 바람 끝이 뺨을 긁고 지나간다."},{"speaker":"베히다트","text":"거기서 멈춰."}]}`;

const USER = '플레이어 입력: 물통을 흔들어 보이며 "물 좀 나눠 줄 수 있어?" 하고 다가간다.';

const SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: { speaker: { type: 'string' }, text: { type: 'string' } },
        required: ['speaker', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['lines'],
  additionalProperties: false,
};

async function readSse(res: Response) {
  let text = '';
  let model: string | null = null;
  let usage: { prompt_tokens?: number | null; completion_tokens?: number | null } = {};
  const raw = await res.text();
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') continue;
    const chunk = JSON.parse(data);
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === 'string') text += delta;
    if (chunk.model) model = chunk.model;
    if (chunk.usage) usage = chunk.usage;
  }
  return { text, model, usage };
}

const bridge = startBridge({ port: 18197 });
console.log(`bridge ${bridge.url}  system prompt ${SYSTEM.length} chars`);
try {
  const health = await fetch(`${bridge.url}/health`);
  console.log(`health ${health.status}`);
  for (const alias of MODELS) {
    const started = performance.now();
    const res = await fetch(`${bridge.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: alias,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: USER },
        ],
        temperature: 0.7,
        top_p: 0.9,
        seed: 7,
        max_tokens: 600,
        stream: true,
        cache_prompt: true,
        response_format: { type: 'json_schema', json_schema: { name: 'gm_output', strict: true, schema: SCHEMA } },
      }),
    });
    const ms = Math.round(performance.now() - started);
    if (!res.ok) {
      console.log(`${alias}: FAIL ${res.status} ${(await res.text()).slice(0, 200)} (${ms}ms)`);
      continue;
    }
    const out = await readSse(res);
    let valid = false;
    try {
      const parsed = JSON.parse(out.text) as { lines?: unknown };
      valid = Array.isArray(parsed.lines);
    } catch {
      valid = false;
    }
    console.log(`${alias}: ${valid ? 'ok' : 'fail(json)'} model=${out.model} wall=${ms}ms in=${out.usage.prompt_tokens} out=${out.usage.completion_tokens}`);
    console.log(`  ${out.text.slice(0, 300)}`);
  }
} finally {
  await bridge.stop();
}
