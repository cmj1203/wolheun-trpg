import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

interface ModelEntry {
  label: string;
  file: string;
  url: string;
  bytes: number;
  license: string;
  kind?: string;
}

const APP = join(import.meta.dir, '..');
const MODELS_DIR = process.env.WOLHEUN_MODELS_DIR ?? join(APP, '..', 'models');
const DISK_BUDGET = 30e9;

const registry = (await Bun.file(join(APP, 'config/models.json')).json()) as { default: string; models: Record<string, ModelEntry> };

const keys = process.argv.slice(2);
if (keys.length === 0) {
  console.error(`사용법: bun scripts/fetch_model.ts <모델키> [...]\n모델키: ${Object.keys(registry.models).join(', ')}\n기본 모델: ${registry.default}`);
  process.exit(2);
}

mkdirSync(MODELS_DIR, { recursive: true });

function storedBytes(): number {
  return readdirSync(MODELS_DIR)
    .filter((f) => f.endsWith('.gguf') || f.endsWith('.gguf.part'))
    .reduce((sum, f) => sum + statSync(join(MODELS_DIR, f)).size, 0);
}

for (const key of keys) {
  const m = registry.models[key];
  if (!m) {
    console.error(`알 수 없는 모델 키: ${key}`);
    process.exit(2);
  }
  if (m.kind === 'bridge') {
    console.log(`[건너뜀] ${key}: 브리지 모델이라 받을 파일이 없습니다`);
    continue;
  }
  const dest = join(MODELS_DIR, m.file);
  if (existsSync(dest) && statSync(dest).size === m.bytes) {
    console.log(`[건너뜀] ${key}: 이미 있음 (${dest})`);
    continue;
  }
  const part = `${dest}.part`;
  const already = existsSync(part) ? statSync(part).size : 0;
  if (storedBytes() - already + m.bytes > DISK_BUDGET) {
    console.error(`[중단] ${key}: 받으면 models/ 합계가 30GB 를 넘습니다. 비교가 끝난 모델을 먼저 지우세요.`);
    process.exit(1);
  }
  console.log(`[받는 중] ${key} (${(m.bytes / 1e9).toFixed(2)}GB, ${m.license}) <- ${m.url}`);
  const proc = Bun.spawn(['curl', '-L', '--fail', '-sS', '-C', '-', '-o', part, m.url], { stdout: 'inherit', stderr: 'inherit' });
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`[실패] ${key}: curl 종료 코드 ${code}`);
    process.exit(1);
  }
  const size = statSync(part).size;
  if (size !== m.bytes) {
    console.error(`[실패] ${key}: 받은 크기 ${size} 가 기대값 ${m.bytes} 와 다릅니다`);
    process.exit(1);
  }
  renameSync(part, dest);
  console.log(`[완료] ${key}: ${dest}`);
}
