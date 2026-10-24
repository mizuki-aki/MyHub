# -*- coding: utf-8 -*-
import os
from PIL import Image

SRC = r"E:\model\素材\图片"

files = sorted([f for f in os.listdir(SRC) if f.lower().endswith(".png")])
print("count:", len(files))
for f in files:
    p = os.path.join(SRC, f)
    im = Image.open(p)
    w, h = im.size
    # 采样右下角区域（最后 25% 宽、最后 8% 高）
    reg = im.convert("RGB").crop((int(w*0.75), int(h*0.92), w, h))
    px = list(reg.getdata())
    # 非纯白像素占比
    nonwhite = sum(1 for r,g,b in px if not (r>245 and g>245 and b>245))
    ratio = nonwhite/len(px)*100
    print(f"{f}\t{w}x{h}\t{im.mode}\tcorner_nonwhite={ratio:.1f}%")
