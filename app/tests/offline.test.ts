import { describe, expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { startServer } from '../src/server/main.ts';
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
    const { server } = await startServer({
      port: 0,
      llmUrl: null,
      modelKey: null,
      scenarioPath: SCENARIO_PATH,
      lorePath: LORE_PATH,
      savesDir: join(APP, 'saves'),
      atlasFile: join(APP, 'logs', 'atlas-test.json'),
      logsDir: join(APP, 'logs'),
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
    }
  });
});
