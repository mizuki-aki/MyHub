# -*- coding: utf-8 -*-
"""把 demo/v25_text.html 的玩法 JS 移植为 minigame/js/game.js（微信小游戏环境）。
保留浏览器路径，便于 tools/harness.html 无头测试。"""
import io, sys

SRC = "tools/_demo_extract.js"
DST = "minigame/js/game.js"

s = io.open(SRC, encoding="utf-8").read()
n0 = len(s)

def rep(old, new, tag):
    global s
    assert old in s, "NOT FOUND: " + tag
    assert s.count(old) == 1, "NOT UNIQUE: " + tag
    s = s.replace(old, new)
    print("ok:", tag)

# ---------- 1. 头部：环境自适应画布 ----------
rep("""var cv  = document.getElementById("cv");
var ctx = cv.getContext("2d");""",
"""/* 环境自适应：微信小游戏用 wx.createCanvas，浏览器/DOM 用 #cv（便于无头测试） */
var IS_WX = (typeof wx !== "undefined");
var HAS_DOM = (typeof document !== "undefined") && !!document.getElementById;
var cv = null, ctx = null;
if (IS_WX) {
  cv = wx.createCanvas();
  ctx = cv.getContext("2d");
} else if (HAS_DOM) {
  cv = document.getElementById("cv");
  ctx = cv.getContext("2d");
}""", "canvas-env")

# ---------- 2. 逻辑分辨率：宽度固定 375，高度按屏幕比例 ----------
rep("""var W = 375, H = 780;""",
"""var W = 375, H = 780;
if (IS_WX) {
  try {
    var _si = wx.getSystemInfoSync();
    /* 高度跟随屏幕比例，纵向布局整体伸缩；钳制避免极端比例 */
    H = Math.round(Math.max(620, Math.min(1000, W * _si.windowHeight / _si.windowWidth)));
  } catch (e) {}
}
var SCALE = 1;   /* 物理 px = 逻辑 px × SCALE（微信端） */""", "logical-size")

# ---------- 3. fit() ----------
rep("""/* ============================ 2. 画布适配 ============================ */
var dpr = 1;
function fit() {
  var s = Math.min(window.innerWidth / W, window.innerHeight / H);
  cv.style.width  = (W * s) + "px";
  cv.style.height = (H * s) + "px";
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width  = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", fit);
window.addEventListener("orientationchange", function () { setTimeout(fit, 120); });
fit();""",
"""/* ============================ 2. 画布适配 ============================ */
var dpr = 1, OX = 0, OY = 0;
function fit() {
  if (IS_WX) {
    var si = wx.getSystemInfoSync();
    var sw = si.windowWidth, sh = si.windowHeight;
    /* 等比缩放 + 居中：手机竖屏正好满屏；平板等宽屏两侧留黑边 */
    SCALE = Math.min(sw / W, sh / H);
    OX = (sw - W * SCALE) / 2;
    OY = (sh - H * SCALE) / 2;
    dpr = Math.min(si.pixelRatio || 1, 2);
    cv.width  = Math.round(sw * dpr);
    cv.height = Math.round(sh * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#07090d";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr * SCALE, 0, 0, dpr * SCALE, dpr * OX, dpr * OY);
  } else if (cv) {
    var s = Math.min(window.innerWidth / W, window.innerHeight / H);
    cv.style.width  = (W * s) + "px";
    cv.style.height = (H * s) + "px";
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width  = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
if (IS_WX) {
  fit();
  wx.onWindowResize && wx.onWindowResize(function () { fit(); });
} else if (HAS_DOM) {
  window.addEventListener("resize", fit);
  window.addEventListener("orientationchange", function () { setTimeout(fit, 120); });
  fit();
}""", "fit")

# ---------- 4. 触控坐标换算 ----------
rep("""function toLocal(e) {
  rect = cv.getBoundingClientRect();
  var t = e.touches ? e.touches[0] : e;
  return {
    x: (t.clientX - rect.left) / rect.width * W,
    y: (t.clientY - rect.top) / rect.height * H
  };
}""",
"""function toLocal(e) {
  var t = (e.touches && e.touches.length) ? e.touches[0]
        : (e.changedTouches && e.changedTouches.length) ? e.changedTouches[0] : e;
  if (IS_WX) return { x: (t.clientX - OX) / SCALE, y: (t.clientY - OY) / SCALE };
  rect = cv.getBoundingClientRect();
  return {
    x: (t.clientX - rect.left) / rect.width * W,
    y: (t.clientY - rect.top) / rect.height * H
  };
}""", "toLocal")

# ---------- 5. 输入监听 ----------
rep("""cv.addEventListener("mousedown", onDown);
window.addEventListener("mousemove", onMove);
window.addEventListener("mouseup", onUp);
cv.addEventListener("touchstart", function (e) { e.preventDefault(); onDown(e); }, { passive: false });
cv.addEventListener("touchmove", function (e) { e.preventDefault(); onMove(e); }, { passive: false });
cv.addEventListener("touchend", onUp);""",
"""if (IS_WX) {
  wx.onTouchStart(function (e) { onDown(e); });
  wx.onTouchMove(function (e) { onMove(e); });
  wx.onTouchEnd(function () { onUp(); });
  wx.onTouchCancel && wx.onTouchCancel(function () { onUp(); });
} else if (HAS_DOM) {
  cv.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  cv.addEventListener("touchstart", function (e) { e.preventDefault(); onDown(e); }, { passive: false });
  cv.addEventListener("touchmove", function (e) { e.preventDefault(); onMove(e); }, { passive: false });
  cv.addEventListener("touchend", onUp);
}""", "input")

# ---------- 6. 键盘（仅浏览器调试） ----------
rep("""window.addEventListener("keydown", function (e) {""",
"""if (!IS_WX && HAS_DOM) window.addEventListener("keydown", function (e) {""", "keydown")

# ---------- 7. 封面 / 存储 / 震动 / 分享 ----------
rep("""/* ============================ 20. 启动 ============================ */
say("小鱼：路还长。天要黑了。", 3.4);
S.turbo = 1;
document.getElementById("startBtn").addEventListener("click", function () {
  document.getElementById("intro").classList.add("hide");
  S.paused = false;
  last = 0;
});
// 首帧之后视口才稳定，再量一次
requestAnimationFrame(function () { fit(); requestAnimationFrame(loop); });

/* 供外部调试 */
window.YY = {""",
"""/* ============================ 20. 封面 / 存储 / 震动 / 分享 ============================ */
var cover = true;
var coverBtn = null;

function loadBest() {
  try { if (IS_WX) return wx.getStorageSync("yy_best_v1") || null; } catch (e) {}
  return null;
}
function saveBest(rec) {
  try { if (IS_WX) wx.setStorageSync("yy_best_v1", rec); } catch (e) {}
}
function vib(kind) {
  try { if (IS_WX && wx.vibrateShort) wx.vibrateShort({ type: kind || "light" }); } catch (e) {}
}

function updateBest() {
  var b = loadBest();
  var pct = Math.floor(clamp(S.totalHouse / HOUSE_TOTAL, 0, 1) * 100);
  var rec = { pct: pct, day: S.day, won: !!S.won };
  if (!b || (rec.won && !b.won) ||
      (rec.won === b.won && rec.won && rec.day < b.day) ||
      (rec.won === b.won && !rec.won && rec.pct > b.pct)) {
    saveBest(rec);
  }
}

var AVATAR = null;
(function loadAvatar() {
  try {
    var path = "images/yuxia.png";
    if (typeof require === "function") {
      path = require("./theme.js").avatar || path;
    }
    if (!IS_WX && typeof ASSET_BASE !== "undefined") path = ASSET_BASE + path;
    var img = IS_WX ? wx.createImage() : new Image();
    img.onload = function () { AVATAR = img; };
    img.src = path;
  } catch (e) {}
})();

/* 圆形头像：有图用图，没图回退到矢量小鱼 */
function drawAvatar(x, y, r) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.closePath();
  ctx.fillStyle = "#141a26"; ctx.fill();
  ctx.clip();
  if (AVATAR) {
    ctx.drawImage(AVATAR, x - r, y - r, r * 2, r * 2);
  } else {
    /* 矢量回退：深蓝卷发 + 呆毛 + 围裙领 */
    ctx.fillStyle = "#2b3a6e";
    ctx.beginPath(); ctx.arc(x, y + r * 0.15, r * 0.78, 0, 6.2832); ctx.fill();
    ctx.fillStyle = "#f2e6da";
    ctx.beginPath(); ctx.arc(x, y + r * 0.55, r * 0.4, 0, 6.2832); ctx.fill();
    ctx.fillStyle = "#141a26";
    ctx.beginPath(); ctx.arc(x - r * 0.25, y, r * 0.07, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.25, y, r * 0.07, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = "#2b3a6e"; ctx.lineWidth = r * 0.09; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y - r * 0.62); ctx.quadraticCurveTo(x + r * 0.3, y - r * 1.05, x + r * 0.08, y - r * 1.15); ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
  ctx.strokeStyle = "rgba(255,207,122,.45)"; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();
}

function drawCover() {
  ctx.fillStyle = "#07090d";
  ctx.fillRect(0, 0, W, H);
  var g = ctx.createRadialGradient(W / 2, 0, 20, W / 2, 0, H * 0.62);
  g.addColorStop(0, "rgba(255,166,84,.13)");
  g.addColorStop(1, "rgba(255,166,84,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  txt("NIGHTFALL GLOW", W / 2, H * 0.075, 10, "rgba(255,207,122,.65)", "center", "600", "monospace");
  txt("永 夜 微 光", W / 2, H * 0.125, 32, "#fff3dc", "center", "700");
  drawAvatar(W / 2, H * 0.225, Math.min(52, W * 0.13));

  var rules = [
    ["白天", "左右换道，撞开悬浮球搜刮", "撞得越多，今天走得越短"],
    ["黄昏", "点格子布防，可跳过", "建筑只保一夜，塌了变料堆"],
    ["夜晚", "守车", "篝火和箭塔挡在车前面"],
    ["闷囊", "红色刺囊，撞了炸车", "躲开是本事，撞上是代价"]
  ];
  var ry = H * 0.325, rh = Math.min(52, (H * 0.62 - ry) / 4);
  for (var i = 0; i < rules.length; i++) {
    var r0 = rules[i];
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.07)";
    ctx.beginPath(); ctx.moveTo(W * 0.12, ry + i * rh); ctx.lineTo(W * 0.88, ry + i * rh); ctx.stroke();
    ctx.restore();
    txt(r0[0], W * 0.12, ry + i * rh + rh * 0.32, 11, "#ffcf7a", "left", "700");
    txt(r0[1], W * 0.21, ry + i * rh + rh * 0.30, 11, "#dfe6f2", "left", "500");
    txt(r0[2], W * 0.21, ry + i * rh + rh * 0.66, 9, "rgba(111,124,146,.9)", "left", "400");
  }

  var b = loadBest();
  if (b) {
    var bs = b.won ? ("最好：通关 · 第 " + b.day + " 天") : ("最好：走了 " + b.pct + "%");
    txt(bs, W / 2, H * 0.60 + rh * 0.2, 10, "rgba(159,176,200,.55)", "center", "", "monospace");
  }

  var bw2 = Math.min(210, W * 0.56), bh2 = 44, bx2 = (W - bw2) / 2, by2 = H * 0.68;
  ctx.save();
  box(bx2, by2, bw2, bh2, "#ffcf7a", "rgba(255,207,122,.10)", 22);
  ctx.restore();
  txt("开 始", W / 2, by2 + bh2 / 2 + 1, 14, "#ffcf7a", "center", "600");
  coverBtn = { x: bx2, y: by2, w: bw2, h: bh2 };

  txt("走到路的尽头就是救援中心 · 100 天是时限", W / 2, by2 + bh2 + 26, 9.5, "rgba(159,176,200,.4)", "center");
  txt("路上每过十分之一，小鱼会告诉你一次", W / 2, by2 + bh2 + 42, 9.5, "rgba(159,176,200,.4)", "center");
}

function startGame() {
  cover = false;
  S.paused = false;
  last = 0;
  say("小鱼：路还长。天要黑了。", 3.4);
}

/* 分享 */
if (IS_WX) {
  try {
    wx.showShareMenu && wx.showShareMenu({ withShareTicket: false });
    wx.onShareAppMessage(function () {
      var pct = Math.floor(clamp(S.totalHouse / HOUSE_TOTAL, 0, 1) * 100);
      return {
        title: (S.over && S.won)
          ? "我用了 " + S.day + " 天，走到了救援中心"
          : "我在这条永夜公路上走到了 " + pct + "%",
        query: "from=share"
      };
    });
  } catch (e) {}
}

say("小鱼：路还长。天要黑了。", 3.4);
S.turbo = 1;

// 首帧之后视口才稳定，再量一次
if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(function () { fit(); requestAnimationFrame(loop); });
}

/* 供外部调试 */
var GG = (typeof GameGlobal !== "undefined") ? GameGlobal
       : (typeof window !== "undefined") ? window
       : (typeof global !== "undefined") ? global : {};
GG.YY = {""", "cover-share")

# ---------- 8. YY 增补 start/cover，并导出 ----------
rep("""  S: function () { return S; },
  restart: restart,""",
"""  S: function () { return S; },
  start: startGame,
  isCover: function () { return cover; },
  restart: restart,""", "yy-start")

rep("""    return {
      day: S.day, house: S.totalHouse, wood: Math.round(S.wood),
      fuel: Math.round(S.fuel), dur: Math.round(S.dur),
      over: S.over, won: S.won, stat: S.stat, bp: S.bp
    };
  }
};""",
"""    return {
      day: S.day, house: S.totalHouse, wood: Math.round(S.wood),
      fuel: Math.round(S.fuel), dur: Math.round(S.dur),
      over: S.over, won: S.won, stat: S.stat, bp: S.bp
    };
  }
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = { YY: GG.YY };
}""", "yy-export")

# ---------- 9. onDown 支持封面 ----------
rep("""function onDown(e) {
  if (S.over) {""",
"""function onDown(e) {
  if (cover) {
    var pc = toLocal(e);
    if (coverBtn && hit(pc, coverBtn)) startGame();
    return;
  }
  if (S.over) {""", "ondown-cover")

# ---------- 10. render() 封面分支 ----------
rep("""function render() {
  ctx.clearRect(0, 0, W, H);
  drawSky();""",
"""function render() {
  if (cover) {
    ctx.clearRect(0, 0, W, H);
    drawCover();
    return;
  }
  ctx.clearRect(0, 0, W, H);
  drawSky();""", "render-cover")

# ---------- 11. 胜负时更新最好成绩 + 震动 ----------
rep("""function win() { S.over = true; S.won = true; S.overT = 0; }
function lose(reason) { S.over = true; S.won = false; S.overReason = reason; S.overT = 0; }""",
"""function win() { S.over = true; S.won = true; S.overT = 0; updateBest(); vib("medium"); }
function lose(reason) { S.over = true; S.won = false; S.overReason = reason; S.overT = 0; updateBest(); vib("heavy"); }""", "winlose")

# ---------- 12. 撞球震动 ----------
rep("""    S.bump = HAZARD_T;
    S.dur = Math.max(0, S.dur - HAZARD_DMG);""",
"""    S.bump = HAZARD_T;
    vib("heavy");
    S.dur = Math.max(0, S.dur - HAZARD_DMG);""", "vib-hazard")

rep("""  S.lostT += cost;
  S.bump = BUMP_T;""",
"""  S.lostT += cost;
  S.bump = BUMP_T;
  vib("light");""", "vib-bump")

# ---------- 13. 消息条加头像 ----------
rep("""    txt(S.msg, W / 2, 103, 11, "#ffdca8", "center", "500");""",
"""    drawAvatar(26, 103, 15);
    txt(S.msg, W / 2 + 9, 103, 11, "#ffdca8", "center", "500");""", "msg-avatar")

io.open(DST, "w", encoding="utf-8", newline="\n").write(s)
print("written", DST, n0, "->", len(s))
