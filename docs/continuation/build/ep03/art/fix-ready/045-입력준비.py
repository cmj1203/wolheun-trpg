"""파일 판독 오류를 진단하고 원본 내용 그대로의 작은 PNG 입력을 준비한다."""
import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
GEN = ROOT / "assets/ep03/gen"
OUT = Path(__file__).resolve().parent
records = []
for filename in ("ep03_c045.png", "source/ep03_c045.png", "source/ep03_c048.png", "source/ep03_c040.png"):
    path = GEN / filename
    with Image.open(path) as image:
        image.load()
        records.append({"입력": str(path), "해상도": list(image.size), "형식": image.format, "바이트": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})

for filename, crop, targetname in (
    ("ep03_c045.png", None, "045-입력_편집대상.png"),
    ("source/ep03_c045.png", None, "045-입력_실제원작.png"),
    ("source/ep03_c048.png", (0, 5680, 2000, 7180), "045-입력_048원작침대.png"),
):
    image = Image.open(GEN / filename).convert("RGB")
    if crop:
        image = image.crop(crop)
    image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
    target = OUT / targetname
    if target.exists():
        raise FileExistsError(f"기존 파일 덮어쓰기 금지: {target}")
    image.save(target, format="PNG")
    records.append({"정리한_입력": str(target), "원본": str(GEN / filename), "원작_크롭_반열림": list(crop) if crop else None, "출력_해상도": list(image.size), "내용_변경": "없음. RGB PNG 재저장·비율 유지 축소·지정 침대 구간 추출만 수행."})
target = OUT / "045-입력출처.json"
if target.exists():
    raise FileExistsError(f"기존 파일 덮어쓰기 금지: {target}")
target.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")
for record in records:
    print(json.dumps(record, ensure_ascii=False))
