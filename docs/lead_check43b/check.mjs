// 43b 격리 서버 검증(질문 모드 단정 금지·끝 재촉 삭제). stdout은 서버 응답 원문 JSONL이다.
import { strict as assert } from 'node:assert';

const base = `http://127.0.0.1:${process.env.PORT ?? '18196'}`;

async function post(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  console.log(JSON.stringify({ 시각: new Date().toISOString(), 경로: path, 요청: body, 상태: response.status, 응답원문: raw }));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw}`);
  return raw;
}

const health = await (await fetch(`${base}/api/health`)).json();
assert.equal(health.llm.enabled, true);
assert.equal(health.llm.ok, true);
console.log(JSON.stringify({ 구분: '서버', 응답: health }));
const start = JSON.parse(await post('/api/new', { seed: 3 }));
const session = start.session;
assert.equal(typeof session, 'string');

async function act(action) {
  const raw = await post('/api/act', { session, action });
  for (const line of raw.trim().split('\n')) {
    const message = JSON.parse(line);
    if (message.error) throw new Error(message.error);
  }
}

// 엔진은 연속 대사를 한 번에 내보낸다. scene은 화면에서 읽고 있는 장면이다.
await act({ type: 'ask', scene: 'b01_sand', text: '여긴 대체 어디 땅이야?' });
await act({ type: 'ask', scene: 'b01_sand', text: '이 모래밭은 누구 나라에 속하는 거야?' });
await act({ type: 'ask', scene: 'b01_sand', text: '이 사막은 누구 땅이야?' });
await act({ type: 'ask', scene: 'b01_sand', text: '지르다 주인이 있어?' });
await act({ type: 'ask', scene: 'b02_people', text: '저 셋 어느 나라 사람 같아?' });
await act({ type: 'ask', scene: 'b02_people', text: '저 무리는 어느 왕국에서 온 걸까?' });
await act({ type: 'approach', id: 'run' });
await act({ type: 'ask', scene: 'b03_ask', text: '저 칼 든 놈 정체가 뭐야?' });
await act({ type: 'ask', scene: 'b03_ask', text: '터번 쓴 사람이 어느 쪽 사람인지 알아?' });
await act({ type: 'ask', scene: 'b04_blade', text: '들키면 어떻게 돼?' });
await act({ type: 'ask', scene: 'b04_blade', text: '내가 공녀란 걸 알아채면 무슨 일이 벌어져?' });
await act({ type: 'ask', scene: 'b04_blade', text: '페시안은 어떤 나라야?' });
await act({ type: 'free', text: '페시안으로 가는 길을 묻는다' });
console.error('검증 완료: 질문 10개, 공개 전 이름 입력 2개');
