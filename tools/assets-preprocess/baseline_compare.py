# -*- coding: utf-8 -*-
import os
from PIL import Image

before = r"E:\model\素材\图片\微信小游戏美术风格基准图_资产设定板__卡通2_5D_俯视4_2026-10-24T00-29-27.png"
after  = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40\assets\cleaned\微信小游戏美术风格基准图_资产设定板__卡通2_5D_俯视4_2026-10-24T00-29-27.png"
OUT = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40\assets\debug"

box = (980, 740, 1536, 1024)
a = Image.open(before).convert("RGB").crop(box)
b = Image.open(after).convert("RGB").crop(box)
w, h = a.size
sheet = Image.new("RGB", (w, h*2+10), (220,220,220))
sheet.paste(a, (0,0))
sheet.paste(b, (0,h+10))
sheet.save(os.path.join(OUT, "baseline_ui_compare.png"))
print("saved compare", a.size)
