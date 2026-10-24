// 永夜微光 v1.0 · 微信小游戏入口
var createGame = require('./js/core.js');
var manifest = require('./js/assets.js');

var info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
var W = info.windowWidth;
var H = info.windowHeight;
var dpr = info.pixelRatio || 1;

var canvas = wx.createCanvas();
canvas.width = Math.round(W * dpr);
canvas.height = Math.round(H * dpr);
var ctx = canvas.getContext('2d');
ctx.scale(dpr, dpr);

var images = {};
var keys = Object.keys(manifest);
var loaded = 0;
var started = false;

function start() {
  if (started) return;
  started = true;
  createGame({
    canvas: canvas,
    ctx: ctx,
    width: W,
    height: H,
    images: images,
    now: function () { return Date.now(); },
    raf: function (fn) { return requestAnimationFrame(fn); },
    onPointer: function (cb) {
      wx.onTouchStart(function (e) {
        var t = e.touches && e.touches[0];
        if (t) cb(t.clientX, t.clientY);
      });
    },
    // 白天碰碰车：按下 / 拖动 / 抬起
    onDrag: function (cb) {
      var active = false;
      wx.onTouchStart(function (e) {
        var t = e.touches && e.touches[0];
        if (!t) return;
        active = true;
        cb('down', t.clientX, t.clientY);
      });
      wx.onTouchMove(function (e) {
        var t = e.touches && e.touches[0];
        if (!t || !active) return;
        cb('move', t.clientX, t.clientY);
      });
      wx.onTouchEnd(function () {
        if (!active) return;
        active = false;
        cb('up');
      });
      if (wx.onTouchCancel) {
        wx.onTouchCancel(function () {
          if (!active) return;
          active = false;
          cb('up');
        });
      }
    }
  });
}

if (!keys.length) start();
keys.forEach(function (k) {
  var img = wx.createImage();
  img.onload = function () { images[k] = img; if (++loaded >= keys.length) start(); };
  img.onerror = function () { if (++loaded >= keys.length) start(); };
  img.src = manifest[k];
});
