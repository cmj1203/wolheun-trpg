interface ModelEntry {
  label: string;
  file?: string;
  kind?: string;
}

const registry = (await Bun.file(new URL('../config/models.json', import.meta.url)).json()) as { default: string; models: Record<string, ModelEntry> };
const key = process.argv[2] || registry.default;
const model = registry.models[key];
if (!model) {
  console.error(`config/models.json 에 없는 모델: ${key} (있는 모델: ${Object.keys(registry.models).join(', ')})`);
  process.exit(1);
}
if (model.kind === 'bridge' || !model.file) {
  console.error(`${key} 는 브리지 모델이라 llama-server 로 띄우지 않습니다. 게임 안 '게임 모델'에서 고르세요.`);
  process.exit(1);
}
console.log([key, model.file, model.label].join('\t'));
