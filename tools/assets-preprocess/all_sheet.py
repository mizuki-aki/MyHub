# -*- coding: utf-8 -*-
import os
from PIL import Image, ImageDraw

SRC = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40\assets\cleaned"
OUT = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40\assets\debug"
os.makedirs(OUT, exist_ok=True)

files = sorted([f for f in os.listdir(SRC) if f.lower().endswith(".png")])

cols = 6
cw, ch = 190, 210
rows = (len(files)+cols-1)//cols
sheet = Image.new("RGB", (cols*cw, rows*ch), (235,235,235))
draw = ImageDraw.Draw(sheet)

for i, f in enumerate(files):
    im = Image.open(os.path.join(SRC, f)).convert("RGBA")
    im.thumbnail((cw-10, cw-10))
    r, c = i//cols, i%cols
    x, y = c*cw+5, r*ch+5
    # 白底铺一层，方便看
    bg = Image.new("RGBA", im.size, (255,255,255,255))
    bg.alpha_composite(im)
    sheet.paste(bg.convert("RGB"), (x,y))
    draw.text((x+2, y+cw-8), f"{i+1}", fill=(200,0,0))

sheet.save(os.path.join(OUT, "all_sheet.png"))
with open(os.path.join(OUT, "all_sheet_index.txt"), "w", encoding="utf-8") as fp:
    for i, f in enumerate(files):
        fp.write(f"{i+1}\t{f}\n")
print("saved", len(files))
