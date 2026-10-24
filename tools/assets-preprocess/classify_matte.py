# -*- coding: utf-8 -*-
import os, csv
import cv2
import numpy as np

SRC = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40\assets\cleaned"
BASE = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40\assets\分类"
os.makedirs(BASE, exist_ok=True)

# 分类映射：排序序号 -> (类别, 新文件名)
MAP = {
    1:  ("怪物", "zombie_a.png"),
    2:  ("UI",   "ui_hpbar_teal.png"),
    3:  ("UI",   "ui_panel_bars.png"),
    4:  ("UI",   "ui_icon_lantern.png"),
    5:  ("角色", "hero_idle.png"),
    6:  ("角色", "hero_walk_a.png"),
    7:  ("角色", "hero_attack.png"),
    8:  ("角色", "hero_walk_b.png"),
    9:  ("怪物", "zombie_b.png"),
    10: ("怪物", "skeleton_archer_a.png"),
    11: ("怪物", "slime_big_a.png"),
    12: ("怪物", "skeleton_archer_b.png"),
    13: ("怪物", "shadow_a.png"),
    14: ("怪物", "skeleton_dead.png"),
    15: ("怪物", "zombie_c.png"),
    16: ("怪物", "slime_big_b.png"),
    17: ("怪物", "shadow_b.png"),
    18: ("角色", "hero_spritesheet.png"),
    19: ("怪物", "slime_small.png"),
    20: ("怪物", "shadow_c.png"),
    21: ("建筑", "campfire.png"),
    22: ("建筑", "watchtower.png"),
    23: ("地块", "tile_grass.png"),
    24: ("地块", "tile_dirt.png"),
    25: ("UI",   "ui_hpbar_red.png"),
    26: ("角色", "hero_main.png"),
    27: ("参考", "style_board.png"),
}

def matte(img_bgr):
    h, w = img_bgr.shape[:2]
    b, g, r = img_bgr[:,:,0].astype(np.int32), img_bgr[:,:,1].astype(np.int32), img_bgr[:,:,2].astype(np.int32)
    mx = np.maximum(np.maximum(b,g),r)
    mn = np.minimum(np.minimum(b,g),r)
    # 近白像素
    white = ((mn >= 238) & ((mx - mn) <= 16)).astype(np.uint8)

    # 只取与图像边界连通的白底
    num, labels, stats, _ = cv2.connectedComponentsWithStats(white, connectivity=8)
    border_labels = set(labels[0,:].tolist()) | set(labels[-1,:].tolist()) \
                  | set(labels[:,0].tolist()) | set(labels[:,-1].tolist())
    bg = np.zeros((h,w), np.uint8)
    for lb in border_labels:
        if lb == 0:
            continue
        bg[labels == lb] = 255

    subject = (255 - bg).astype(np.uint8)
    # 轻微内缩去白边，再羽化
    subject = cv2.erode(subject, np.ones((3,3), np.uint8), iterations=1)
    alpha = cv2.GaussianBlur(subject, (3,3), 0.8)

    out = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2BGRA)
    out[:,:,3] = alpha
    return out

files = sorted([f for f in os.listdir(SRC) if f.lower().endswith(".png")])
rows = []
for i, f in enumerate(files, start=1):
    cat, newname = MAP.get(i, ("未分类", f))
    d = os.path.join(BASE, cat)
    os.makedirs(d, exist_ok=True)
    sp = os.path.join(SRC, f)
    img = cv2.imdecode(np.fromfile(sp, dtype=np.uint8), cv2.IMREAD_COLOR)
    if cat == "参考":
        out = img  # 参考图不抠
    else:
        out = matte(img)
    cv2.imencode(".png", out)[1].tofile(os.path.join(d, newname))
    rows.append([i, f, cat, newname])

with open(os.path.join(BASE, "分类清单.csv"), "w", newline="", encoding="utf-8-sig") as fp:
    wtr = csv.writer(fp)
    wtr.writerow(["序号","原文件","分类","新文件名"])
    wtr.writerows(rows)

for cat in ["角色","怪物","建筑","UI","地块","参考"]:
    n = len([r for r in rows if r[2]==cat])
    print(f"{cat}: {n}")
print("done")
