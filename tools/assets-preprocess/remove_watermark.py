# -*- coding: utf-8 -*-
import os
import cv2
import numpy as np

SRC = r"E:\model\素材\图片"
OUT = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40\assets\cleaned"
os.makedirs(OUT, exist_ok=True)

files = sorted([f for f in os.listdir(SRC) if f.lower().endswith(".png")])
print("total:", len(files))

report = []
for f in files:
    sp = os.path.join(SRC, f)
    img = cv2.imdecode(np.fromfile(sp, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        print("READ_FAIL", f); continue
    h, w = img.shape[:2]

    # 右下角搜索区（水印固定贴底右）
    x0, y0 = max(0, w - 380), max(0, h - 150)
    roi = img[y0:h, x0:w].copy()
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    S = hsv[:, :, 1].astype(np.int32)
    V = hsv[:, :, 2].astype(np.int32)

    # 浅灰文字：低饱和 + 中高亮度 + 非纯白
    mask = ((S <= 32) & (V >= 140) & (V <= 248)).astype(np.uint8) * 255

    # 去掉零星噪点，再膨胀覆盖抗锯齿边缘
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    cnt = int((mask > 0).sum())

    if cnt < 150:
        # 没有检测到水印，原样保存
        cv2.imencode(".png", img)[1].tofile(os.path.join(OUT, f))
        report.append((f, cnt, "skip(no watermark)"))
        continue

    mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)
    fixed = cv2.inpaint(roi, mask, 5, cv2.INPAINT_TELEA)
    img[y0:h, x0:w] = fixed
    cv2.imencode(".png", img)[1].tofile(os.path.join(OUT, f))
    report.append((f, cnt, "inpainted"))

for f, c, a in report:
    print(f"{a}\t{c}\t{f}")
