"""기존 036 정확 합성의 가운데 그림 경계와 원본 대응을 읽기 전용으로 조사한다."""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[6]
GEN = ROOT / "assets/ep03/gen"
candidate = Image.open(GEN / "ep03_c036_exact.png").convert("RGB")
source = Image.open(GEN / "source/ep03_c036.png").convert("RGB")
array = np.asarray(candidate)
print("원본 크기:", source.size, "기존 후보 크기:", candidate.size)
for y in (79, 80, 200, 350, 380, 390, 400, 410, 420, 450):
    segment = array[y, 690:1360]
    dark = np.where((segment[:, 0] < 180) & (segment[:, 1] < 150) & (segment[:, 2] < 150))[0]
    print("행", y, "갈색·짙은 픽셀 범위:", (int(dark.min() + 690), int(dark.max() + 690)) if dark.size else None)
for width in (659, 660, 661):
    scaled = source.resize((width, round(source.height * width / source.width)), Image.Resampling.LANCZOS)
    patch = array[700:1000, 800:1250]
    result = cv2.matchTemplate(np.asarray(scaled), patch, cv2.TM_CCOEFF_NORMED)
    _, score, _, location = cv2.minMaxLoc(result)
    print("원본 축소 폭:", width, "대응 점수:", round(score, 6), "좌표:", location)
