// 게임 속 피드백 받기. 127.0.0.1 에서 온 JSON 만 받아 feedback.jsonl 에 한 줄로 덧붙인다. 판단은 리드가 한다.
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { rejectForeignPost } from './same_origin.ts';

/** 본문 상한(바이트). 자동 첨부(최근 줄 6개·수치·플래그)를 넣어도 넉넉하다. */
export const FEEDBACK_MAX_BYTES = 16 * 1024;

const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export interface FeedbackOptions {
  /** 덧붙일 jsonl 파일. 폴더가 없으면 만든다. */
  file: string;
  /** 앱 버전(git short hash). 없으면 null 로 적는다. */
  version: string | null;
  /** 요청이 온 주소. 127.0.0.1 이 아니면 거부한다. */
  ip: string | null;
  now?: () => Date;
  /** 보낸 쪽이 적은 session 으로 서버가 아는 판 상태(비트·시드·수치·플래그·마지막 입력)를 붙인다. 모르는 판이면 null. */
  enrich?: (session: unknown) => Record<string, unknown> | null;
}

const reply = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

/** 본문을 읽다가 상한을 넘으면 바로 멈춘다. Content-Length 가 없는 요청도 전부 읽지 않는다. */
async function readLimited(req: Request, max: number): Promise<string | null> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of req.body ?? []) {
    size += chunk.byteLength;
    if (size > max) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** 피드백 한 건을 받아 저장한다. 성공하면 {ok:true,id}, 실패하면 {ok:false,error} 와 상태 코드. */
export async function handleFeedback(req: Request, opts: FeedbackOptions): Promise<Response> {
  if (opts.ip === null || !LOCAL.has(opts.ip)) return reply({ ok: false, error: '이 컴퓨터에서만 보낼 수 있습니다' }, 403);
  const foreign = rejectForeignPost(req);
  if (foreign) return reply({ ok: false, error: foreign.error }, foreign.status);
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > FEEDBACK_MAX_BYTES) return reply({ ok: false, error: `본문이 너무 큽니다(최대 ${FEEDBACK_MAX_BYTES} 바이트)` }, 413);
  const raw = await readLimited(req, FEEDBACK_MAX_BYTES);
  if (raw === null) return reply({ ok: false, error: `본문이 너무 큽니다(최대 ${FEEDBACK_MAX_BYTES} 바이트)` }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ ok: false, error: '요청 본문이 올바른 JSON 이 아닙니다' }, 400);
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return reply({ ok: false, error: '요청 본문이 올바르지 않습니다' }, 400);
  const record = body as Record<string, unknown>;
  const text = typeof record.text === 'string' ? record.text.trim() : '';
  if (!text) return reply({ ok: false, error: '피드백 글이 비어 있습니다' }, 400);
  const id = crypto.randomUUID();
  const receivedAt = (opts.now ?? (() => new Date()))().toISOString();
  const game = opts.enrich?.(record.session) ?? null;
  const line = JSON.stringify({ ...record, id, receivedAt, version: opts.version, text, game });
  await mkdir(dirname(opts.file), { recursive: true });
  await appendFile(opts.file, `${line}\n`);
  return reply({ ok: true, id }, 200);
}

/** 앱 버전으로 쓸 git short hash. git 저장소가 아니거나 git 이 없으면 null. */
export async function gitShortHash(cwd: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(['git', 'rev-parse', '--short', 'HEAD'], { cwd, stdout: 'pipe', stderr: 'ignore' });
    const out = (await new Response(proc.stdout).text()).trim();
    return (await proc.exited) === 0 && out ? out : null;
  } catch {
    return null;
  }
}
