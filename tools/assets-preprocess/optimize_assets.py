# -*- coding: utf-8 -*-
import os
from PIL import Image

BASE = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40\assets\分类"
DST  = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40\minigame\images"

CAT_MAP = {"角色":"char", "怪物":"monster", "建筑":"building", "UI":"ui", "地块":"tile"}

def trim(im):
    bbox = im.split()[-1].getbbox()
    return im.crop(bbox) if bbox else im

def fit(im, maxside):
    w, h = im.size
    s = min(1.0, maxside / max(w, h))
    if s < 1.0:
        im = im.resize((max(1,int(w*s)), max(1,int(h*s))), Image.LANCZOS)
    return im

for cn, en in CAT_MAP.items():
    src = os.path.join(BASE, cn)
    dst = os.path.join(DST, en)
    os.makedirs(dst, exist_ok=True)
    for f in sorted(os.listdir(src)):
        if not f.lower().endswith(".png"): continue
        im = Image.open(os.path.join(src, f)).convert("RGBA")
        im = trim(im)
        if en == "tile":
            out = fit(im, 192)
        elif f == "hero_spritesheet.png":
            out = fit(im, 512)
        elif en == "ui":
            out = fit(im, 256)
        else:
            out = fit(im, 200)
        out.save(os.path.join(dst, f), optimize=True)
        print(f"{en}/{f}\t{im.size} -> {out.size}")

# 统计体积
tot = 0
for root, _, files in os.walk(DST):
    for f in files:
        if f.endswith(".png"):
            tot += os.path.getsize(os.path.join(root, f))
print("TOTAL_PNG_BYTES", tot, f"({tot/1024/1024:.2f} MB)")
