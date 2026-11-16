"""GPT 편집 결과의 지정 두 배경 패치만 기존 후보에 적용한다."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
GEN = ROOT / "assets/ep03/gen"
OUT = Path(__file__).resolve().parent
OLD = GEN / "ep03_c045.png"
RAW = OUT / "045-원격편집.png"
NEW = GEN / "ep03_c045_readyfix2.png"
old = Image.open(OLD).convert("RGB")
raw = Image.open(RAW).convert("RGB")
remote = raw.resize(old.size, Image.Resampling.LANCZOS) if raw.size != old.size else raw
width, height = old.size
y, x = np.mgrid[:height, :width]

# 왼쪽 인물 조각과 오른쪽 침대만 허용한다. 경계 12픽셀은 안쪽에서 연결한다.
left = np.minimum.reduce((
    np.clip((100 - x) / 12, 0, 1),
    np.clip((670 - y) / 12, 0, 1),
))
right = np.minimum(
    np.clip((x - 1330) / 12, 0, 1),
    np.clip((700 - y) / 12, 0, 1),
)
alpha = np.maximum(left, right)
mask = Image.fromarray(np.round(alpha * 255).astype(np.uint8))
new = Image.composite(remote, old, mask)
if NEW.exists():
    raise FileExistsError(f"기존 파일 덮어쓰기 금지: {NEW}")
maskpath = OUT / "045-변경허용마스크2.png"
if maskpath.exists():
    raise FileExistsError(f"기존 파일 덮어쓰기 금지: {maskpath}")
new.save(NEW, format="PNG")
mask.save(maskpath, format="PNG")
before = np.asarray(old)
after = np.asarray(Image.open(NEW).convert("RGB"))
changed = np.any(before != after, axis=2)
allowed = np.asarray(mask) > 0
outside = int((changed & ~allowed).sum())
actor = (250, 320, 1310, 885)
actor_same = bool(np.array_equal(
    np.asarray(old.crop(actor)),
    np.asarray(new.crop(actor)),
))
if outside or not actor_same:
    raise RuntimeError("허용 마스크 밖이나 아시나 영역이 바뀌었다")
metrics = {
    "기존_후보": str(OLD),
    "GPT_편집_원본": str(RAW),
    "새_후보": str(NEW),
    "원격_출력_해상도": list(raw.size),
    "최종_해상도": list(new.size),
    "원격_패치_정렬": "GPT 출력 폭 1671을 기존 폭 1672로 정렬. 합성 허용 부위에만 적용.",
    "변경_허용_영역": "왼쪽 x<100,y<670 / 오른쪽 x>1330,y<700. 각 경계 안쪽 12픽셀 연결.",
    "변경_픽셀수": int(changed.sum()),
    "마스크_밖_변경_픽셀수": outside,
    "아시나_확인_영역_반열림": list(actor),
    "아시나_영역_완전_동일": actor_same,
    "기존_sha256": hashlib.sha256(OLD.read_bytes()).hexdigest(),
    "GPT_출력_sha256": hashlib.sha256(RAW.read_bytes()).hexdigest(),
    "새_sha256": hashlib.sha256(NEW.read_bytes()).hexdigest(),
}
target = OUT / "045-픽셀검증2.json"
if target.exists():
    raise FileExistsError(f"기존 파일 덮어쓰기 금지: {target}")
target.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(metrics, ensure_ascii=False, indent=2))
