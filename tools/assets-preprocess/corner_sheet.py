# -*- coding: utf-8 -*-
import os
from PIL import Image, ImageDraw

SRC = r"E:\model\素材\图片"
OUT = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40\assets\debug"
os.makedirs(OUT, exist_ok=True)

files = sorted([f for f in os.listdir(SRC) if f.lower().endswith(".png")])
files = [f for f in files if Image.open(os.path.join(SRC,f)).size == (1536,1536)]

cols = 6
cw, ch = 200, 220
rows = (len(files)+cols-1)//cols
sheet = Image.new("RGB", (cols*cw, rows*ch), (240,240,240))
draw = ImageDraw.Draw(sheet)

for i, f in enumerate(files):
    im = Image.open(os.path.join(SRC, f)).convert("RGB")
    crop = im.crop((1136,1136,1536,1536)).resize((cw-6, cw-6))
    r, c = i//cols, i%cols
    x, y = c*cw+3, r*ch+3
    sheet.paste(crop, (x,y))
    draw.text((x+2, y+cw-4), str(i+1), fill=(200,0,0))

sheet.save(os.path.join(OUT, "corner_sheet.png"))
print("saved", os.path.join(OUT,"corner_sheet.png"), "files:", len(files))
