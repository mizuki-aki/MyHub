# -*- coding: utf-8 -*-
import os
from PIL import Image, ImageDraw

BASE = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40\assets\分类"
OUT = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40\assets\debug"

picks = [
    os.path.join(BASE, "角色", "hero_idle.png"),
    os.path.join(BASE, "怪物", "skeleton_archer_a.png"),
]

def checker(w,h,s=10):
    im = Image.new("RGB",(w,h),(255,255,255)); d=ImageDraw.Draw(im)
    for y in range(0,h,s):
        for x in range(0,w,s):
            if (x//s+y//s)%2==0: d.rectangle([x,y,x+s-1,y+s-1],fill=(205,205,205))
    return im

size=520
sheet=Image.new("RGB",(size*2+20,size),(250,250,250))
for i,p in enumerate(picks):
    im=Image.open(p).convert("RGBA"); im.thumbnail((size,size))
    bg=checker(im.width,im.height); bg.paste(im,(0,0),im)
    sheet.paste(bg,(i*(size+20),0))
sheet.save(os.path.join(OUT,"matte_zoom.png"))
print("ok")
