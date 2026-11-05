import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** e2e 전용 저장·기록 폴더. 사용자의 app/saves 와 app/logs 를 건드리지 않게 서버 환경 변수로 넘긴다. */
export function e2eState() {
  const dir = mkdtempSync(join(tmpdir(), 'wolheun-e2e-'));
  const logsDir = join(dir, 'logs');
  return {
    logsDir,
    env: { WOLHEUN_SAVES: join(dir, 'saves'), WOLHEUN_LOGS: logsDir, WOLHEUN_ATLAS: join(dir, 'atlas.json'), WOLHEUN_FEEDBACK: join(dir, 'feedback.jsonl') },
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}
