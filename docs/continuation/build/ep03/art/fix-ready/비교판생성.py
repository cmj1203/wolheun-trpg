"""지정한 컷의 원본·반려 후보·변경 후보를 나란히 놓는 검수 자료를 만든다."""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[6]
GEN = ROOT / "assets/ep03/gen"
OUT = Path(__file__).resolve().parent
FONT = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 27)
number = sys.argv[1]
version = sys.argv[2] if len(sys.argv) > 2 else "1"
source = Image.open(GEN / f"source/ep03_c{number}.png").convert("RGB")
old = Image.open(GEN / f"ep03_c{number}{'_exact' if number == '036' else ''}.png").convert("RGB")
new = Image.open(GEN / f"ep03_c{number}_readyfix{version}.png").convert("RGB")
board = Image.new("RGB", (2400, 1500), "#eeeeee")
draw = ImageDraw.Draw(board)


def put(image, box, label):
    x, y, w, h = box
    draw.text((x, y), label, font=FONT, fill="black")
    image = image.copy()
    image.thumbnail((w, h - 45))
    board.paste(image, (x, y + 45))


put(source, (15, 15, 430, 1470), "실제 원작 전체")
put(old, (470, 15, 950, 600), "기존 반려 후보")
put(new, (1440, 15, 950, 600), "변경 후보 · 검수 전")
if number == "036":
    put(source.crop((0, 4200, 2000, 7200)), (470, 650, 620, 830), "원작 중간 구간")
    put(old.crop((694, 80, 1354, 1070)), (1110, 650, 620, 830), "기존 크롭 상단 y=80")
    put(new.crop((694, 80, 1354, 1070)), (1750, 650, 620, 830), "수정 크롭 상단 y=410")
else:
    put(old.crop((0, 120, 240, 700)), (470, 650, 400, 830), "기존 왼쪽")
    put(new.crop((0, 120, 240, 700)), (890, 650, 400, 830), "수정 왼쪽")
    put(old.crop((1330, 0, old.width, 700)), (1310, 650, 520, 830), "기존 오른쪽 침대")
    put(new.crop((1330, 0, new.width, 700)), (1850, 650, 530, 830), "수정 오른쪽 침대")
target = OUT / f"{number}-원본_기존_수정비교{version if version != '1' else ''}.png"
if target.exists():
    raise FileExistsError(f"기존 파일 덮어쓰기 금지: {target}")
board.save(target)
print(target)
