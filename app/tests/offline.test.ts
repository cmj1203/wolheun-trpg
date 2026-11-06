import { describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { optionsFromEnv, sharedWithUser, startServer } from '../src/server/main.ts';
import { APP, LORE_PATH, SCENARIO_PATH } from './helpers.ts';

const ALLOWED_URL_PREFIXES = ['http://127.0.0.1', 'http://localhost', 'http://www.w3.org/2000/svg'];
const RUNTIME_DIRS = ['src', 'web', 'content'];
const NETWORK_SDKS = ['openai', '@anthropic-ai', '@google/generative-ai', '@google/genai', 'axios', 'node-fetch', 'cohere-ai', '@mistralai'];

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

describe('게임 실행 코드에 외부 네트워크 호출이 없다', () => {
  test('실행 코드, 화면, 콘텐츠에 이 컴퓨터 밖을 가리키는 주소가 없다', async () => {
    const offenders: string[] = [];
    for (const dir of RUNTIME_DIRS) {
      for (const file of await filesUnder(join(APP, dir))) {
        const text = await Bun.file(file).text();
        for (const url of text.match(/https?:\/\/[^\s'"`)<>]+/g) ?? []) {
          if (!ALLOWED_URL_PREFIXES.some((p) => url.startsWith(p))) offenders.push(`${file}: ${url}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('외부 AI 서비스나 HTTP 클라이언트 패키지를 쓰지 않는다', async () => {
    const pkg = (await Bun.file(join(APP, 'package.json')).json()) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    for (const dir of RUNTIME_DIRS.slice(0, 2)) {
      for (const file of await filesUnder(join(APP, dir))) {
        if (!file.endsWith('.ts')) continue;
        const text = await Bun.file(file).text();
        for (const sdk of NETWORK_SDKS) expect(text.includes(`from '${sdk}`)).toBe(false);
      }
    }
  });

  test('앱 서버는 127.0.0.1 에만 열리고, 화면은 같은 출처만 허용하는 CSP 를 받는다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wolheun-offline-'));
    const { server } = await startServer({
      port: 0,
      llmUrl: null,
      modelKey: null,
      scenarioPath: SCENARIO_PATH,
      lorePath: LORE_PATH,
      savesDir: join(dir, 'saves'),
      atlasFile: join(dir, 'atlas.json'),
      logsDir: join(dir, 'logs'),
      feedbackFile: join(dir, 'feedback.jsonl'),
      llmTimeoutMs: 1000,
    });
    try {
      expect(server.hostname).toBe('127.0.0.1');
      const page = await fetch(`http://127.0.0.1:${server.port}/`);
      const csp = page.headers.get('content-security-policy') ?? '';
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("script-src 'self'");
      const html = await page.text();
      expect(html).not.toMatch(/<script[^>]+src="https?:/);
      expect(html).not.toMatch(/<link[^>]+href="https?:/);
      const health = (await (await fetch(`http://127.0.0.1:${server.port}/api/health`)).json()) as { llm: { enabled: boolean } };
      expect(health.llm.enabled).toBe(false);
    } finally {
      server.stop(true);
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('시험 서버와 사용자 판 분리', () => {
  const separated = (dir: string) => ({ WOLHEUN_NO_LLM: '1', WOLHEUN_SAVES: join(dir, 'saves'), WOLHEUN_ATLAS: join(dir, 'atlas.json'), WOLHEUN_LOGS: join(dir, 'logs'), WOLHEUN_FEEDBACK: join(dir, 'feedback.jsonl') });

  test('사용자 포트가 아니면 기본 경로 넷과 사용자 LLM 을 모두 거부한다', async () => {
    const opts = optionsFromEnv({ WOLHEUN_PORT: '18199' });
    expect(sharedWithUser(opts)).toEqual(['WOLHEUN_SAVES', 'WOLHEUN_ATLAS', 'WOLHEUN_LOGS', 'WOLHEUN_FEEDBACK', 'WOLHEUN_LLM_URL']);
    await expect(startServer(opts)).rejects.toThrow('따로 주세요');
  });

  test('경로를 일부만 나누거나 사용자 폴더를 직접 적어도 거부한다', () => {
    const dir = join(tmpdir(), 'wolheun-guard');
    const env = { WOLHEUN_PORT: '18199', ...separated(dir) };
    expect(sharedWithUser(optionsFromEnv({ ...env, WOLHEUN_SAVES: undefined }))).toEqual(['WOLHEUN_SAVES']);
    expect(sharedWithUser(optionsFromEnv({ ...env, WOLHEUN_LOGS: join(APP, 'logs') }))).toEqual(['WOLHEUN_LOGS']);
    expect(sharedWithUser(optionsFromEnv({ ...env, WOLHEUN_ATLAS: join(APP, 'saves', 'atlas.json') }))).toEqual(['WOLHEUN_ATLAS']);
    expect(sharedWithUser(optionsFromEnv({ ...env, WOLHEUN_NO_LLM: undefined, WOLHEUN_LLM_URL: 'http://127.0.0.1:18080' }))).toEqual(['WOLHEUN_LLM_URL']);
  });

  test('사용자 포트의 기본 경로는 그대로 쓴다', () => {
    expect(sharedWithUser(optionsFromEnv({}))).toEqual([]);
    expect(sharedWithUser(optionsFromEnv({ WOLHEUN_PORT: '18081' }))).toEqual([]);
  });

  test('경로를 다 나누면 시험 포트에서 뜬다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wolheun-guard-'));
    const { server } = await startServer({ ...optionsFromEnv({ ...separated(dir), WOLHEUN_PORT: '0' }) });
    try {
      expect((await fetch(`http://127.0.0.1:${server.port}/api/health`)).ok).toBe(true);
    } finally {
      server.stop(true);
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('실제 시작 명령도 사용자 파일을 건드리기 전에 끝난다', async () => {
    const saves = join(APP, 'saves');
    const before = await stat(saves).then((s) => s.mtimeMs).catch(() => null);
    const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('WOLHEUN_')));
    const run = Bun.spawn(['bun', 'src/server/main.ts'], { cwd: APP, env: { ...clean, WOLHEUN_PORT: '18199', WOLHEUN_NO_LLM: '1' }, stdout: 'pipe', stderr: 'pipe' });
    const [code, err] = await Promise.all([run.exited, new Response(run.stderr).text()]);
    expect(code).not.toBe(0);
    expect(err).toContain('WOLHEUN_SAVES');
    expect(await stat(saves).then((s) => s.mtimeMs).catch(() => null)).toBe(before);
  });
});
