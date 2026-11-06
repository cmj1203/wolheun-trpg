import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FEEDBACK_MAX_BYTES, handleFeedback } from '../src/server/feedback.ts';

let dir = '';
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wolheun-feedback-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('http://127.0.0.1/feedback', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
const opts = (file: string, ip: string | null = '127.0.0.1') => ({ file, version: 'abc1234', ip, now: () => new Date('2026-11-04T09:00:00.000Z') });

describe('피드백 받기', () => {
  test('127.0.0.1 에서 온 글은 jsonl 에 한 줄로 덧붙고, 보낸 자동 첨부와 id·받은 시각·버전이 함께 남는다', async () => {
    const file = join(dir, 'nested', 'feedback.jsonl');
    const payload = { text: '  여우가 너무 자주 끼어들어요  ', beat: 'b05_why', seed: 7, recent: [{ speaker: '남자', text: '왜지?' }] };
    const res = await handleFeedback(post(JSON.stringify(payload)), opts(file));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe('string');
    const again = await handleFeedback(post(JSON.stringify({ text: '둘째' })), opts(file));
    expect(again.status).toBe(200);
    const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(first).toMatchObject({ id: body.id, receivedAt: '2026-11-04T09:00:00.000Z', version: 'abc1234', text: '여우가 너무 자주 끼어들어요', beat: 'b05_why', seed: 7 });
    expect(first.recent).toEqual(payload.recent);
  });

  test('보낸 글에 id·받은 시각·버전이 들어 있어도 서버 값을 덮어쓰지 못한다', async () => {
    const file = join(dir, 'feedback.jsonl');
    const res = await handleFeedback(post(JSON.stringify({ text: '덮어쓰기', id: 'fake', receivedAt: '2000-01-01T00:00:00.000Z', version: 'fake' })), opts(file));
    const { id } = (await res.json()) as { id: string };
    const line = JSON.parse((await readFile(file, 'utf8')).trim()) as Record<string, unknown>;
    expect(line).toMatchObject({ id, receivedAt: '2026-11-04T09:00:00.000Z', version: 'abc1234', text: '덮어쓰기' });
  });

  test('본문이 16KB 를 넘으면 413 이고 아무것도 저장하지 않는다', async () => {
    const file = join(dir, 'big.jsonl');
    const big = JSON.stringify({ text: 'x'.repeat(FEEDBACK_MAX_BYTES) });
    const res = await handleFeedback(post(big), opts(file));
    expect(res.status).toBe(413);
    const declared = await handleFeedback(post(JSON.stringify({ text: '작음' }), { 'content-length': String(FEEDBACK_MAX_BYTES + 1) }), opts(file));
    expect(declared.status).toBe(413);
    expect(await Bun.file(file).exists()).toBe(false);
  });

  test('잘못된 JSON·배열·빈 글은 400 이고 저장하지 않는다', async () => {
    const file = join(dir, 'bad.jsonl');
    for (const body of ['{오류', '[1,2]', JSON.stringify({ text: '   ' }), JSON.stringify({ beat: 'b02' })]) {
      const res = await handleFeedback(post(body), opts(file));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { ok: boolean }).ok).toBe(false);
    }
    expect(await Bun.file(file).exists()).toBe(false);
  });

  test('다른 사이트 화면에서 보낸 글과 JSON 이 아닌 글은 저장하지 않고, 게임 화면의 글은 받는다', async () => {
    const file = join(dir, 'cross-site.jsonl');
    const text = JSON.stringify({ text: '글' });
    expect((await handleFeedback(post(text, { 'sec-fetch-site': 'cross-site' }), opts(file))).status).toBe(403);
    expect((await handleFeedback(post(text, { origin: 'https://example.com' }), opts(file))).status).toBe(403);
    expect((await handleFeedback(post(text, { 'content-type': 'text/plain' }), opts(file))).status).toBe(400);
    expect(await Bun.file(file).exists()).toBe(false);
    expect((await handleFeedback(post(text, { 'sec-fetch-site': 'same-origin', origin: 'http://127.0.0.1' }), opts(file))).status).toBe(200);
    expect(await Bun.file(file).exists()).toBe(true);
  });

  test('길이를 알리지 않은 큰 본문도 상한을 넘으면 읽기를 멈추고 저장하지 않는다', async () => {
    const file = join(dir, 'stream.jsonl');
    const chunk = new Uint8Array(FEEDBACK_MAX_BYTES).fill(120);
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
    });
    const req = new Request('http://127.0.0.1/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    expect((await handleFeedback(req, opts(file))).status).toBe(413);
    expect(pulled).toBeLessThanOrEqual(3);
    expect(await Bun.file(file).exists()).toBe(false);
  });

  test('이 컴퓨터로 돌린 다른 도메인의 화면(DNS 리바인딩)은 출처가 같아 보여도 막는다', async () => {
    const file = join(dir, 'rebind.jsonl');
    const req = new Request('http://attacker.example:18081/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'http://attacker.example:18081' },
      body: JSON.stringify({ text: '글' }),
    });
    expect((await handleFeedback(req, opts(file))).status).toBe(403);
    expect(await Bun.file(file).exists()).toBe(false);
  });

  test('127.0.0.1 이 아닌 주소는 403 으로 거부한다', async () => {
    const file = join(dir, 'remote.jsonl');
    for (const ip of ['192.168.0.12', '10.0.0.3', null]) {
      const res = await handleFeedback(post(JSON.stringify({ text: '밖에서' })), opts(file, ip));
      expect(res.status).toBe(403);
    }
    expect((await handleFeedback(post(JSON.stringify({ text: '안에서' })), opts(file, '::1'))).status).toBe(200);
    expect(await Bun.file(file).exists()).toBe(true);
  });
});
