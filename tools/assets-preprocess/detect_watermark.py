# -*- coding: utf-8 -*-
import os
from PIL import Image

SRC = r"E:\model\素材\图片"
OUT = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40\assets\debug"
os.makedirs(OUT, exist_ok=True)

files = sorted([f for f in os.listdir(SRC) if f.lower().endswith(".png")])

def detect(im):
    W, H = im.size
    rgb = im.convert("RGB")
    x0, y0 = int(W*0.70), int(H*0.88)
    x1, y1 = W, H
    px = rgb.load()
    minx, miny, maxx, maxy = W, H, -1, -1
    cnt = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[x, y]
            mx, mn = max(r,g,b), min(r,g,b)
            # 浅灰文字：低饱和、亮度中高、非纯白
            if (mx - mn) <= 18 and 140 <= mn and mx <= 250:
                cnt += 1
                if x < minx: minx = x
                if y < miny: miny = y
                if x > maxx: maxx = x
                if y > maxy: maxy = y
    if cnt == 0:
        return None, cnt
    return (minx, miny, maxx, maxy), cnt

for f in files:
    p = os.path.join(SRC, f)
    im = Image.open(p)
    bbox, cnt = detect(im)
    W, H = im.size
    if bbox:
        bx0, by0, bx1, by1 = bbox
        fx0, fy0, fx1, fy1 = bx0/W, by0/H, bx1/W, by1/H
        print(f"{f}\t{W}x{H}\tcnt={cnt}\tbbox=({bx0},{by0},{bx1},{by1})\tfrac=({fx0:.3f},{fy0:.3f},{fx1:.3f},{fy1:.3f})")
    else:
        print(f"{f}\t{W}x{H}\tNO_DETECT")
