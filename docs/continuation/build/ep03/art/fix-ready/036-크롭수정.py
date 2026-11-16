"""기존 합성의 가운데 크롭 상단만 잘라내고 나머지 픽셀은 그대로 보존한다."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
GEN = ROOT / "assets/ep03/gen"
OUT = Path(__file__).resolve().parent
OLD = GEN / "ep03_c036_exact.png"
NEW = GEN / "ep03_c036_readyfix1.png"
old = Image.open(OLD).convert("RGB")
new = old.copy()

# 기존 가운데 그림: x=[694,1354), y=[80,1070).
# 위 크롭 경계를 y=410으로 내리고 아래 그림의 좌표·배율은 유지한다.
removed = (694, 80, 1354, 410)
new.paste(old.getpixel((680, 80)), removed)
if NEW.exists():
    raise FileExistsError(f"기존 파일 덮어쓰기 금지: {NEW}")
new.save(NEW, format="PNG")

before = np.asarray(old)
after = np.asarray(Image.open(NEW).convert("RGB"))
changed = np.any(before != after, axis=2)
allowed = np.zeros(changed.shape, dtype=bool)
allowed[80:410, 694:1354] = True
if np.any(changed & ~allowed):
    raise RuntimeError("허용한 상단 크롭 밖 픽셀이 바뀌었다")
if old.size != (2048, 1152) or new.size != old.size:
    raise RuntimeError("기존 16:9 배치가 달라졌다")
metrics = {
    "기존_후보": str(OLD),
    "새_후보": str(NEW),
    "해상도": list(new.size),
    "제거한_상단_영역_반열림": list(removed),
    "중간_그림_새_상단_y": 410,
    "변경_픽셀수": int(changed.sum()),
    "크롭_밖_변경_픽셀수": int((changed & ~allowed).sum()),
    "왼쪽_그림_동일": bool(np.array_equal(before[:, :694], after[:, :694])),
    "오른쪽_그림_동일": bool(np.array_equal(before[:, 1354:], after[:, 1354:])),
    "중간_아래_그림_동일": bool(np.array_equal(before[410:, 694:1354], after[410:, 694:1354])),
    "기존_sha256": hashlib.sha256(OLD.read_bytes()).hexdigest(),
    "새_sha256": hashlib.sha256(NEW.read_bytes()).hexdigest(),
}
target = OUT / "036-픽셀검증.json"
if target.exists():
    raise FileExistsError(f"기존 파일 덮어쓰기 금지: {target}")
target.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(metrics, ensure_ascii=False, indent=2))
