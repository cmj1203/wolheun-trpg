interface ModelEntry {
  label: string;
  file: string;
}

const registry = (await Bun.file(new URL('../config/models.json', import.meta.url)).json()) as { default: string; models: Record<string, ModelEntry> };
const key = process.argv[2] || registry.default;
const model = registry.models[key];
if (!model) {
  console.error(`config/models.json 에 없는 모델: ${key} (있는 모델: ${Object.keys(registry.models).join(', ')})`);
  process.exit(1);
}
console.log([key, model.file, model.label].join('\t'));
