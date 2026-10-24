# -*- coding: utf-8 -*-
"""生成静态场景页（用于无头浏览器截图核对版式）"""
import os, base64, json, sys

ROOT = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40"
IMG = os.path.join(ROOT, "minigame", "images")
OUT = os.path.join(ROOT, "assets", "debug")
os.makedirs(OUT, exist_ok=True)

assets = {}
for root, _, files in os.walk(IMG):
    for f in sorted(files):
        if not f.lower().endswith(".png"):
            continue
        full = os.path.join(root, f)
        rel = os.path.relpath(full, os.path.join(ROOT, "minigame")).replace("\\", "/")
        key = os.path.splitext(rel)[0].replace("images/", "")
        with open(full, "rb") as fp:
            assets[key] = "data:image/png;base64," + base64.b64encode(fp.read()).decode("ascii")

TPL = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<style>html,body{margin:0;height:100%;background:#0d1018;overflow:hidden}
#stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
canvas{display:block}</style></head>
<body><div id="stage"><canvas id="game"></canvas></div>
<script src="../../minigame/js/core.js"></script>
<script>
var ASSETS = __ASSETS__;
var W = __W__, H = __H__;
var canvas = document.getElementById('game');
canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
canvas.width = W; canvas.height = H;
var ctx = canvas.getContext('2d');
var images = {}, keys = Object.keys(ASSETS), loaded = 0, g = null;
function start(){
  g = createGame({
    canvas: canvas, ctx: ctx, width: W, height: H, images: images,
    now: function(){ return Date.now(); },
    raf: function(fn){ return requestAnimationFrame(fn); },
    onPointer: function(){}
  });
  window.__g = g;
  __SCENE__
  window.__ready = true;
}
if (!keys.length) start();
keys.forEach(function(k){
  var img = new Image();
  img.onload = function(){ images[k] = img; if (++loaded >= keys.length) start(); };
  img.onerror = function(){ if (++loaded >= keys.length) start(); };
  img.src = ASSETS[k];
});
</script></body></html>
"""

def build(name, w, h, scene_js):
    html = (TPL.replace("__ASSETS__", json.dumps(assets))
               .replace("__W__", str(w)).replace("__H__", str(h))
               .replace("__SCENE__", scene_js))
    p = os.path.join(OUT, name)
    with open(p, "w", encoding="utf-8") as fp:
        fp.write(html)
    print("wrote", p, len(html))

# 场景 A：第 1 天白天，仅 3 路开放
build("scene_day1.html", 375, 700, """
  g.__setT(6);
  g.setBuildType('campfire'); g.buildAt(1, 2); g.buildAt(0, 3);
  g.setBuildType('tower');    g.buildAt(3, 3); g.buildAt(2, 4);
""")

# 场景 B：第 3 天夜晚，7 路全开，有怪物在场
build("scene_night.html", 375, 700, """
  g.__setT(101 + 26);
  g.setBuildType('campfire');
  g.buildAt(1, 0); g.buildAt(1, 1); g.buildAt(0, 2); g.buildAt(1, 3);
  g.buildAt(0, 4); g.buildAt(1, 5); g.buildAt(0, 6);
  g.setBuildType('tower');
  g.buildAt(3, 1); g.buildAt(3, 3); g.buildAt(3, 5); g.buildAt(2, 6);
  g.__setT(101 + 34);
""")
