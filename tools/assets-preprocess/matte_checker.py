# -*- coding: utf-8 -*-
import os
from PIL import Image, ImageDraw

BASE = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40\assets\分类"
OUT = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40\assets\debug"

cats = ["角色","怪物","建筑","UI","地块","参考"]
items = []
for c in cats:
    d = os.path.join(BASE, c)
    if not os.path.isdir(d): continue
    for f in sorted(os.listdir(d)):
        if f.lower().endswith(".png"):
            items.append((c, os.path.join(d, f), f))

def checker(w, h, s=16):
    im = Image.new("RGB", (w, h), (255,255,255))
    d = ImageDraw.Draw(im)
    for y in range(0, h, s):
        for x in range(0, w, s):
            if (x//s + y//s) % 2 == 0:
                d.rectangle([x,y,x+s-1,y+s-1], fill=(210,210,210))
    return im

cols, cell, ch = 6, 200, 230
rows = (len(items)+cols-1)//cols
sheet = Image.new("RGB", (cols*cell, rows*ch), (250,250,250))
sd = ImageDraw.Draw(sheet)

for i,(cat,p,f) in enumerate(items):
    im = Image.open(p).convert("RGBA")
    im.thumbnail((cell-12, cell-12))
    bg = checker(im.width, im.height)
    bg.paste(im, (0,0), im)
    r,c = i//cols, i%cols
    x,y = c*cell+6, r*ch+6
    sheet.paste(bg, (x,y))
    sd.text((x+2, y+cell+2), f"{cat}/{f}", fill=(30,30,30))

sheet.save(os.path.join(OUT, "matte_checker_sheet.png"))
print("items", len(items))
