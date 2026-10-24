# -*- coding: utf-8 -*-
import os, base64, json

ROOT = r"C:\Users\Admin\WorkBuddy\2026-10-24-07-47-40"
IMG  = os.path.join(ROOT, "minigame", "images")
JS   = os.path.join(ROOT, "minigame", "js")

# ---------- 1. assets.js (微信小游戏) ----------
entries = []
for root, _, files in os.walk(IMG):
    for f in sorted(files):
        if f.lower().endswith(".png"):
            full = os.path.join(root, f)
            rel = os.path.relpath(full, os.path.join(ROOT, "minigame")).replace("\\", "/")
            key = os.path.splitext(rel)[0].replace("images/", "")
            entries.append((key, rel))
entries.sort()

lines = ["// 自动生成：素材清单（相对小游戏根目录）", "module.exports = {"]
for k, rel in entries:
    lines.append('  "%s": "%s",' % (k, rel))
lines.append("};")
with open(os.path.join(JS, "assets.js"), "w", encoding="utf-8") as fp:
    fp.write("\n".join(lines))
print("assets.js entries:", len(entries))

# ---------- 2. preview.html (内联 base64) ----------
assets_map = {}
for k, rel in entries:
    with open(os.path.join(ROOT, "minigame", rel), "rb") as fp:
        b64 = base64.b64encode(fp.read()).decode("ascii")
    assets_map[k] = "data:image/png;base64," + b64

with open(os.path.join(JS, "core.js"), "r", encoding="utf-8") as fp:
    core = fp.read()

html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>永夜微光 · v1.1 碰碰车</title>
<style>
  html,body{margin:0;height:100%;background:#0d1018;overflow:hidden;
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;}
  #stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;}
  canvas{display:block;box-shadow:0 10px 50px rgba(0,0,0,.6);border-radius:18px;}
  #hint{position:fixed;left:50%;bottom:6px;transform:translateX(-50%);color:#7c879b;
    font-size:11px;letter-spacing:.4px;white-space:nowrap;}
</style>
</head>
<body>
<div id="stage"><canvas id="game"></canvas></div>
<div id="hint">永夜微光 v1.1 · 白天拖车横移撞悬浮球 · 黄昏点格子布防 · 夜晚守车 · 撑过 100 天或开过 800 户</div>
<script>
__CORE__
</script>
<script>
var ASSETS = __ASSETS__;
(function(){
  var MAX_W = 480;
  var cssW = Math.min(window.innerWidth, MAX_W);
  var cssH = window.innerHeight;
  var dpr = window.devicePixelRatio || 1;
  var canvas = document.getElementById('game');
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  var ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  var images = {}, keys = Object.keys(ASSETS), loaded = 0, started = false;
  function start(){
    if (started) return; started = true;
    createGame({
      canvas: canvas, ctx: ctx, width: cssW, height: cssH, images: images,
      now: function(){ return Date.now(); },
      raf: function(fn){ return requestAnimationFrame(fn); },
      onPointer: function(cb){
        canvas.addEventListener('pointerdown', function(e){
          var r = canvas.getBoundingClientRect();
          cb(e.clientX - r.left, e.clientY - r.top);
        });
      },
      onDrag: function(cb){
        var active = false;
        canvas.addEventListener('pointerdown', function(e){
          var r = canvas.getBoundingClientRect();
          active = true;
          if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch(err){} }
          cb('down', e.clientX - r.left, e.clientY - r.top);
        });
        canvas.addEventListener('pointermove', function(e){
          if (!active) return;
          var r = canvas.getBoundingClientRect();
          cb('move', e.clientX - r.left, e.clientY - r.top);
        });
        window.addEventListener('pointerup', function(){ if (!active) return; active = false; cb('up'); });
        window.addEventListener('pointercancel', function(){ if (!active) return; active = false; cb('up'); });
        canvas.addEventListener('touchmove', function(e){ e.preventDefault(); }, { passive: false });
      }
    });
  }
  if (!keys.length) start();
  keys.forEach(function(k){
    var img = new Image();
    img.onload = function(){ images[k] = img; if (++loaded >= keys.length) start(); };
    img.onerror = function(){ if (++loaded >= keys.length) start(); };
    img.src = ASSETS[k];
  });
})();
</script>
</body>
</html>
"""

html = html.replace("__CORE__", core).replace("__ASSETS__", json.dumps(assets_map))
out = os.path.join(ROOT, "demo", "preview.html")
with open(out, "w", encoding="utf-8") as fp:
    fp.write(html)
print("preview:", out, os.path.getsize(out), "bytes")
