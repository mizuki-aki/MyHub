
(function () {
"use strict";

/* ==================================================================
   永夜微光 · v2.9 文字占位 Demo
   --------------------------------------------------------------
   本文件的目的：用最低成本验证「改完之后的游戏长什么样、什么手感」。
   所有美术资源一律用带字的虚框/圆/三角代替，正式版全部替换为矢量绘制。
   几何沿用 minigame/js/core.js：15° 顺时针斜投影，一维纵深 v。
   ================================================================== */

/* 环境自适应：微信小游戏用 wx.createCanvas，浏览器/DOM 用 #cv（便于无头测试） */
var IS_WX = (typeof wx !== "undefined");
var HAS_DOM = (typeof document !== "undefined") && !!document.getElementById;
var cv = null, ctx = null;
if (IS_WX) {
  cv = wx.createCanvas();
  ctx = cv.getContext("2d");
} else if (HAS_DOM) {
  cv = document.getElementById("cv");
  ctx = cv.getContext("2d");
}

/* ============================ 0. 常量 ============================ */
var W = 375, H = 780;
if (IS_WX) {
  try {
    var _si = wx.getSystemInfoSync();
    /* 高度跟随屏幕比例，纵向布局整体伸缩；钳制避免极端比例 */
    H = Math.round(Math.max(620, Math.min(1000, W * _si.windowHeight / _si.windowWidth)));
  } catch (e) {}
}
var SCALE = 1;   /* 物理 px = 逻辑 px × SCALE（微信端） */

var DAY_TRAVEL = 22, DAY_DUSK = 30, DAY_NIGHT = 30;

var ROWS   = 15;      // 可见纵深：15 排 = 15 户，球正好一排一个
var LANES  = 5;

var ORB_N        = 15;   // 每天 15 个悬浮球
var HAZARD_N     = 2;    // 其中 2~3 个闷囊（危险品）
var SEC_PER_HOUSE= 1.50; // 每走一户 1.5s（原来 0.55s，靠停车搜刮凑节奏；现在不停车，速度要摊平）
var BUMP_T       = 0.22; // 撞到球的顿挫时长（不中断行驶，只是被撞一下）
var BUMP_SLOW    = 0.42; // 顿挫期间车速降到 42%
var HAZARD_T     = 0.30; // 闷囊撞开只顿 0.3s

/* 撞球要付的时间代价：从当天剩余的白天时间里直接扣掉（单位：秒） */
var ORB_COST = {
  scatter: 0.7,   // 散装：翻一下就走
  can:     0.9,   // 罐头：要撬
  med:     1.1,   // 药箱：要拆
  parts:   1.3,   // 料包：最费事，在最后面
  hazard:  0.25   // 闷囊：一下就炸，代价是耐久不是时间
};
var FUEL_PER_HOUSE = 0.85;// 每户烧 0.85 点油（日行 9 户 ≈ 7.7 点，罐头日供 10 点左右，略有盈余）
var CAR_MAX      = 140;
var CAR_HIT      = 8;    // 怪打车扣耐久
var HAZARD_DMG   = 5;    // 闷囊炸车扣耐久

var HOUSE_TOTAL  = 800;  // 唯一胜利条件（内部只用它算比例，文案里不出现户数）
var TEN_CN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
var CHAPTER_H    = 160;  // 每章 160 户，正好五章
var DAY_LIMIT    = 100;  // 100 天是时限，不是胜利条件
var SALVAGE_K    = 1 / 3;// 料堆返还造价的三分之一

var CHAPTERS = ["荒路", "霉雨", "涉水", "锈带", "灯火"];

/* 建筑表：木料造价 / 血 / 伤害 / 作用半径 */
var BUILD = {
  fire:   { ch: "火", name: "篝火", wood: 10, hp: 180, dmg: 16, r: 2.4, cd: 0.25 },
  tower:  { ch: "塔", name: "箭塔", wood: 20, hp: 140, dmg: 14, r: 4.2, cd: 1.00 },
  wall:   { ch: "障", name: "路障", wood: 6,  hp: 260, dmg: 0,  r: 0,   cd: 0 },
  barrel: { ch: "桶", name: "油桶", wood: 12, hp: 60,  dmg: 46, r: 1.5, cd: 0 },
  beacon: { ch: "信", name: "信标", wood: 35, hp: 120, dmg: 0,  r: 2.6, cd: 0 }
};
var BUILD_ORDER = ["fire", "tower", "wall", "barrel", "beacon"];

/* 四种封条 + 一种危险品：用字和边框样式区分，不靠颜色硬记 */
var ORB_K = {
  scatter: { ch: "散", col: "#e2d6bb", name: "散装封条", w: 5 },
  can:     { ch: "罐", col: "#ffcf7a", name: "罐头封条", w: 4 },
  med:     { ch: "药", col: "#7fe0b0", name: "药箱封条", w: 3 },
  parts:   { ch: "料", col: "#9fb0c8", name: "料包封条", w: 3 },
  hazard:  { ch: "囊", col: "#ff6b6b", name: "闷囊",       w: 0 }
};

/* ============================ 1. 几何 ============================ */
/* 斜投影的做法：路面中线保持竖直，只把「横线」按 x 位置微微压斜，
   制造 15° 俯视斜角；文字一律不旋转，保证占位符可读。 */
var TILT = Math.tan(9 * Math.PI / 180);   // 实际视觉斜度约 9°，比 15° 更耐看

var BOT_H    = Math.round(H * 0.19);
var baseY    = H - BOT_H;                 // 车所在底边
var fieldTop = Math.round(H * 0.200);     // 天空底边
/* 地平线：地面从这里开始，也是路的消失端。
   旧版把路的顶端画在 fieldTop（比地平线还高 40px），
   等于路插进天空里 40px —— 这是"悬浮"最直接的原因 */
var horizonY = fieldTop + 40;
var rowH     = (baseY - horizonY) / ROWS;
var PRS_K    = 0.55;                      // 纵向透视压缩：0 = 等距（旧版，像斜放的板子），越大远端越挤
var PRS_KW   = 2.35;                      // 横向收缩：远端只留 0.30 画宽。收不够，路的顶端就是"板子上底边"
var MELT     = 0.085;                     // 路顶端溶进雾里的高度（占 view 纵深的比例）
var nearW    = W * 1.02;                  // 近端路宽：略超画布，人像站在路上而不是俯看一块板
var CX       = W * 0.5;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function rnd(a, b) { return a + Math.random() * (b - a); }
function irnd(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function pick(a) { return a[(Math.random() * a.length) | 0]; }

/* 单点透视：深度 t∈[0,1] 映射到屏幕纵向比例 d，d = (1+K)t / (1+Kt)
   —— 近处每户占的像素多，远处挤在一起，这才是"往远处延伸"的关键 */
function depthOf(t) { return (1 + PRS_K) * t / (1 + PRS_K * t); }
function wAt(v) { return nearW / (1 + PRS_KW * clamp(v / ROWS, 0, 1)); }
function rowY(v) { return baseY - depthOf(clamp(v / ROWS, 0, 1)) * (baseY - horizonY); }
/* 某处的"一排行高"，用来给竖向尺寸（作用范围等）定标 */
function rowHPx(v) {
  var a = rowY(clamp(v - 0.5, 0, ROWS)), b = rowY(clamp(v + 0.5, 0, ROWS));
  if (b >= a) return 2;
  return Math.max(2, a - b);
}
/* d 的反函数：t = d / (1+K-Kd) */
function vOfY(y) {
  var d = clamp((baseY - y) / (baseY - horizonY), 0, 1);
  return d / (1 + PRS_K - d * PRS_K) * ROWS;
}
function laneUnit(v) { return wAt(v) / LANES; }
function leftX(v) { return CX - wAt(v) / 2; }
function laneCX(col, v) { return leftX(v) + (col + 0.5) * laneUnit(v); }
function scaleAt(v) { return clamp(wAt(v) / nearW, 0.5, 1.15); }

/* 世界 → 屏幕：横线按 x 偏离中线的距离压斜 */
function w2s(x, y) {
  return { x: x, y: y + (x - CX) * TILT };
}
function s2w(x, y) {
  return { x: x, y: y - (x - CX) * TILT };
}
/* 屏幕点 → 格（col, row）。阵地只允许 0..8 排 */
function cellAt(sx, sy) {
  var p = s2w(sx, sy), v = vOfY(p.y);
  if (v < -0.6 || v > ROWS) return null;
  var half = wAt(v) / 2, u = p.x - CX;
  if (u < -half || u > half) return null;
  var col = Math.floor((u + half) / laneUnit(v));
  if (col < 0 || col >= LANES) return null;
  return { col: col, v: v, row: Math.round(v * 2) / 2 };
}

/* ============================ 2. 画布适配 ============================ */
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
}

/* ============================ 3. 状态 ============================ */
var S = null;

function newState() {
  return {
    day: 1, stage: "travel", stageT: 0, turbo: 1,

    wood: 60, fuel: 80, fuelMax: 100,
    dur: CAR_MAX, durMax: CAR_MAX,

    carV: 0, carCol: 2, carColT: 2, carLerp: 2,
    gone: 0,                       // 门牌：这一天已经走过的户
    totalHouse: 0,                 // 累计门牌（内部数值，只用来算百分比与章节）
    mile: 0,                       // 已经报过「十分之几」
    bp: 0,                         // 图纸

    orbs: [], piles: [], builds: [], mobs: [], arrows: [], fx: [],
    bump: 0,                       // 撞击顿挫剩余时间
    lostT: 0,                      // 今天撞球扣掉的时间
    hint: null,                    // 前方最近那个球的提示

    buildType: "fire", buildCd: 0,
    towerLv: 1,
    msg: null, msgT: 0,
    stat: { search: 0, hazard: 0, kill: 0, salvage: 0, built: 0 },

    over: false, won: false, overT: 0, paused: true,
    btnSkip: null,
    pickMsg: null
  };
}

/* ============================ 4. 小工具 ============================ */
function say(text, dur) { S.msg = text; S.msgT = dur || 2.6; }

function addFx(kind, x, y, txt, col, dur) {
  S.fx.push({ kind: kind, x: x, y: y, txt: txt, col: col, t: 0, dur: dur || 0.9 });
}

function wood(n) { S.wood = Math.min(999, S.wood + n); }

/* ============================ 5. 生成一天的球 ============================ */
function newOrbs() {
  S.orbs = [];
  var hazard = irnd(HAZARD_N, HAZARD_N + 1);        // 2~3 个闷囊
  var kinds = [];

  // 基础配比：散装最多，罐头次之，药箱和料包是稀的
  var deck = ["scatter", "scatter", "scatter", "scatter", "can", "can", "parts"];
  for (var i = 0; i < ORB_N; i++) kinds.push(pick(deck));

  /* 料包压在"一天能走到的尽头"：撞得越多越走不到，想拿好货就得少撞前面的球。
     不再放在最后两排 —— 车速摊平后，一天只走 9~10 户，最后两排永远够不着。 */
  kinds[7] = "parts";
  kinds[8] = "parts";
  kinds[5] = "med";        // 中途一份药箱，别让耐久全靠运气
  kinds[10] = "med";       // 拼一把才拿得到

  // 挑 2~3 个位置放闷囊，避开最前面两排（给玩家反应时间）
  var used = {};
  for (var h = 0; h < hazard; h++) {
    var tries = 0, idx;
    do { idx = irnd(3, ORB_N - 2); tries++; } while (used[idx] && tries < 40);
    used[idx] = 1; kinds[idx] = "hazard";
  }

  // 车道：左右两侧为主，偶尔给中间；相邻两排不撞同一列
  var lastCol = -1;
  for (var j = 0; j < ORB_N; j++) {
    var col;
    if (j % 2 === 0) col = (Math.random() < 0.5) ? 0 : LANES - 1;
    else col = irnd(0, LANES - 1);
    if (col === lastCol) col = (col + 2) % LANES;
    lastCol = col;
    S.orbs.push({
      col: col, v: j + 1, kind: kinds[j],
      searched: false, skipped: false, flash: 0, born: 0
    });
  }
}

/* ============================ 6. 掉落 ============================ */
function rollOrb(kind, day) {
  var o = { wood: 0, fuel: 0, bp: 0, heal: 0 };
  var mb = 1 + Math.min(0.45, (day - 1) * 0.008);
  if (kind === "scatter") {
    o.wood = Math.round(irnd(10, 16) * mb);
  } else if (kind === "can") {
    o.wood = Math.round(irnd(8, 13) * mb);
    o.fuel = irnd(4, 7);
  } else if (kind === "med") {
    o.wood = Math.round(irnd(7, 12) * mb);
    o.heal = 16;
  } else if (kind === "parts") {
    o.wood = Math.round(irnd(13, 20) * mb);
    /* 图纸是稀的：料包不是每次都夹带。89 天约 62 张，正好对得上 62 层卡池 */
    if (Math.random() < 0.30) o.bp = 1;
  } else if (kind === "hazard") {
    o.wood = irnd(3, 5);            // 闷囊里能捞到一点料
  }
  return o;
}
function lootLabel(o) {
  var a = [];
  if (o.wood) a.push("+" + o.wood + " 木");
  if (o.fuel) a.push("+" + o.fuel + " 油");
  if (o.heal) a.push("+" + o.heal + " 修");
  if (o.bp) a.push("+图纸");
  return a.join(" ") || "空";
}
function applyLoot(o) {
  if (o.wood) wood(o.wood);
  if (o.fuel) S.fuel = Math.min(S.fuelMax, S.fuel + o.fuel);
  if (o.heal) S.dur = Math.min(S.durMax, S.dur + o.heal);
  if (o.bp) { S.bp += o.bp; }
}

/* ============================ 7. 阶段流转 ============================ */
function enterDusk() {
  S.gone = Math.round(S.carV);
  S.totalHouse += S.gone;
  S.stage = "dusk"; S.stageT = 0;
  S.carV = 0; S.bump = 0; S.lostT = 0; S.hint = null;
  S.orbs = S.orbs.filter(function (o) { return o.kind === "hazard" && !o.searched; });
  S.orbs = [];
  if (S.totalHouse >= HOUSE_TOTAL) { win(); return; }
  if (checkMile()) return;              // 里程碑优先，别被布防提示盖掉
  say("小鱼：天亮之前，把路堵上。", 2.4);
}

function enterNight() {
  S.stage = "night"; S.stageT = 0;
  S.spawnT = 0.5; S.spawned = 0;
  S.waveN = Math.min(14, 3 + Math.floor(S.day * 0.45));
  S.buildCd = 0;
  say("小鱼：它们来了。", 1.6);
}

function nextDay() {
  // 建筑不保留：原地变成料堆，明天白天撞它返 1/3
  S.piles = [];
  for (var i = 0; i < S.builds.length; i++) {
    var b = S.builds[i];
    if (b.dead) continue;
    S.piles.push({
      col: b.col, v: b.v,
      wood: Math.max(2, Math.floor(BUILD[b.type].wood * SALVAGE_K)),
      taken: false, flash: 0
    });
  }
  S.builds = []; S.mobs = []; S.arrows = []; S.fx = [];
  S.day++;
  if (S.day > DAY_LIMIT) { lose("一百天到了。救援中心的灯，熄了。"); return; }
  S.stage = "travel"; S.stageT = 0;
  S.carV = 0; S.carCol = 2; S.carColT = 2; S.carLerp = 2;
  S.bump = 0; S.lostT = 0; S.hint = null;
  newOrbs();
  say("第 " + S.day + " 天 · " + chapterOf(S.totalHouse), 2.2);
}

/* 每走过十分之一，小鱼报一次。跨多档时只报最新那档，不补播堆叠 */
function checkMile() {
  var t = Math.floor(S.totalHouse / HOUSE_TOTAL * 10);
  if (t <= S.mile) return false;
  S.mile = Math.min(t, 9);
  say("小鱼：走了十分之" + TEN_CN[S.mile] + "。", 2.8);
  return true;
}

function chapterOf(house) {
  var i = Math.floor(house / CHAPTER_H);
  return CHAPTERS[clamp(i, 0, 4)];
}

function win() { S.over = true; S.won = true; S.overT = 0; updateBest(); vib("medium"); }
function lose(reason) { S.over = true; S.won = false; S.overReason = reason; S.overT = 0; updateBest(); vib("heavy"); }

/* ============================ 8. 白天 ============================ */
/* 撞开一个球：车不停，只顿一下，代价从当天剩下的白天时间里扣 */
function hitOrb(o) {
  o.searched = true;
  o.flash = 1;
  var sp = orbScreen(o);

  if (o.kind === "hazard") {
    /* 闷囊：代价是耐久，不是时间 */
    S.stageT = Math.min(DAY_TRAVEL, S.stageT + ORB_COST.hazard);
    S.lostT += ORB_COST.hazard;
    S.bump = HAZARD_T;
    vib("heavy");
    S.dur = Math.max(0, S.dur - HAZARD_DMG);
    S.stat.hazard++;
    var g = rollOrb("hazard", S.day);
    wood(g.wood);
    addFx("boom", sp.x, sp.y, "-" + HAZARD_DMG + " 耐久", "#ff6b6b", 1.2);
    say("小鱼：闷囊。别撞第二次。", 1.8);
    if (S.dur <= 0) lose("车废了。");
    return;
  }

  /* 普通球：车照走，扣时间 */
  var cost = ORB_COST[o.kind] || 1.0;
  S.stageT = Math.min(DAY_TRAVEL, S.stageT + cost);
  S.lostT += cost;
  S.bump = BUMP_T;
  vib("light");

  var loot = rollOrb(o.kind, S.day);
  applyLoot(loot);
  S.stat.search++;
  addFx("loot", sp.x, sp.y - 18, lootLabel(loot), ORB_K[o.kind].col, 1.0);
  addFx("time", sp.x + 26, sp.y - 34, "-" + cost.toFixed(1) + "s", "#ff9b6b", 0.95);
}

function updateTravel(dt) {
  S.stageT += dt;
  if (S.bump > 0) S.bump = Math.max(0, S.bump - dt);

  /* --- 横移 --- */
  S.carCol += (S.carColT - S.carCol) * Math.min(1, dt * 7);

  /* --- 撞球：一帧最多撞一个，撞完继续开 --- */
  var near = null, best = 99;
  for (var i = 0; i < S.orbs.length; i++) {
    var ob = S.orbs[i];
    if (ob.searched || ob.skipped) continue;
    if (Math.abs(ob.v - S.carV) > 0.5) continue;
    if (Math.abs((ob.col + 0.5) - (S.carCol + 0.5)) > 1.15) continue;
    var d = Math.abs(ob.v - S.carV);
    if (d < best) { best = d; near = ob; }
  }
  if (near) {
    hitOrb(near);
    if (S.over) return;
  }

  /* --- 料堆（不费时间，直接收） --- */
  for (var q = 0; q < S.piles.length; q++) {
    var pl = S.piles[q];
    if (pl.taken) continue;
    if (Math.abs(pl.v - S.carV) > 0.45) continue;
    if (Math.abs((pl.col + 0.5) - (S.carCol + 0.5)) > 1.15) continue;
    pl.taken = true; pl.flash = 1;
    wood(pl.wood);
    S.stat.salvage++;
    var pp = orbScreen(pl);
    addFx("loot", pp.x, pp.y - 14, "+" + pl.wood + " 木", "#9fb0c8", 1.0);
  }

  /* --- 满油自修：白天让耐久慢慢回升，避免一夜失手就再也翻不了身 --- */
  if (S.fuel > 20 && S.dur < S.durMax) {
    S.dur = Math.min(S.durMax, S.dur + 0.10 * dt);
  }

  /* --- 前进（撞球的顿挫会临时把车速压下去） --- */
  var spd = 1 / SEC_PER_HOUSE;
  if (S.bump > 0) spd *= BUMP_SLOW;
  if (S.fuel <= 0) spd *= 0.5;                 // 油尽：半速，不当场卡死
  var step = dt * spd;
  var before = Math.floor(S.carV);
  S.carV = Math.min(ROWS, S.carV + step);
  var after = Math.floor(S.carV);
  if (after > before) {
    var n = after - before;
    S.fuel = Math.max(0, S.fuel - n * FUEL_PER_HOUSE);
    if (S.fuel <= 0) say("小鱼：油表见底。车还能爬，就是慢。", 2.2);
  }

  /* --- 前方最近的那个球，给玩家一个落点 --- */
  var h = null, hd = 999;
  for (var k = 0; k < S.orbs.length; k++) {
    var ok = S.orbs[k];
    if (ok.searched || ok.skipped) continue;
    var dd = ok.v - S.carV;
    if (dd < 0.15) continue;
    if (dd < hd) { hd = dd; h = ok; }
  }
  S.hint = h;

  if (S.carV >= ROWS || S.stageT >= DAY_TRAVEL) enterDusk();
}

function orbScreen(o) {
  var p = w2s(laneCX(o.col, o.v), rowY(o.v));
  return { x: p.x, y: p.y, s: scaleAt(o.v) };
}

/* ============================ 9. 黄昏 ============================ */
function updateDusk(dt) {
  S.stageT += dt;
  if (S.stageT >= DAY_DUSK) enterNight();
}

function tryBuild(col, v) {
  var t = S.buildType, def = BUILD[t];
  for (var i = 0; i < S.builds.length; i++) {
    var b = S.builds[i];
    if (!b.dead && b.col === col && Math.abs(b.v - v) < 0.55) return;
  }
  if (S.wood < def.wood) { say("小鱼：木头不够，" + def.name + "要 " + def.wood + "。", 1.8); return; }
  S.wood -= def.wood;
  S.builds.push({
    type: t, col: col, v: v, hp: def.hp, hpMax: def.hp,
    cd: 0, dead: false, flash: 0, born: 0
  });
  S.stat.built++;
  var p = w2s(laneCX(col, v), rowY(v));
  addFx("build", p.x, p.y, "-" + def.wood + " 木", "#ffcf7a", 0.8);
}

/* ============================ 10. 夜晚 ============================ */
function updateNight(dt) {
  S.stageT += dt;

  /* 出怪 */
  S.spawnT -= dt;
  if (S.spawned < S.waveN && S.spawnT <= 0) {
    spawnMob();
    S.spawned++;
    S.spawnT = Math.max(0.55, 2.6 - S.day * 0.03);
  }

  /* 建筑开火 */
  for (var i = 0; i < S.builds.length; i++) {
    var b = S.builds[i];
    if (b.dead) continue;
    var def = BUILD[b.type];
    b.flash = Math.max(0, b.flash - dt * 4);
    if (!def.dmg) continue;
    b.cd -= dt;
    if (b.cd > 0) continue;

    if (b.type === "tower") {
      var tgt = towerTarget(b, def.r);
      if (tgt) {
        b.cd = def.cd;
        S.arrows.push({ col: b.col, v: b.v, tc: tgt.col, tv: tgt.v, t: 0, dmg: def.dmg, to: tgt });
      }
    } else if (b.type === "fire") {
      // 灼烧：范围内每秒掉血
      b.cd = def.cd;
      for (var m = 0; m < S.mobs.length; m++) {
        var mm = S.mobs[m];
        if (mm.hp <= 0) continue;
        var d = Math.hypot(mm.col - b.col, mm.v - b.v);
        if (d <= def.r) damageMob(mm, def.dmg * def.cd);
      }
    } else if (b.type === "barrel") {
      // 油桶：怪贴到 1.5 格内就炸，一次性
      for (var n = 0; n < S.mobs.length; n++) {
        var mb2 = S.mobs[n];
        if (mb2.hp <= 0) continue;
        if (Math.hypot(mb2.col - b.col, mb2.v - b.v) <= def.r) {
          for (var q = 0; q < S.mobs.length; q++) {
            var mq = S.mobs[q];
            if (mq.hp > 0 && Math.hypot(mq.col - b.col, mq.v - b.v) <= def.r + 0.6) damageMob(mq, def.dmg);
          }
          b.dead = true; b.hp = 0;
          var bp = w2s(laneCX(b.col, b.v), rowY(b.v));
          addFx("boom", bp.x, bp.y, "油桶爆", "#ff9d5c", 1.0);
          break;
        }
      }
    }
  }

  /* 箭飞 */
  for (var a = S.arrows.length - 1; a >= 0; a--) {
    var ar = S.arrows[a];
    ar.t += dt * 3.4;
    if (ar.t >= 1) {
      if (ar.to && ar.to.hp > 0) damageMob(ar.to, ar.dmg);
      S.arrows.splice(a, 1);
    }
  }

  /* 怪行动 */
  for (var k = 0; k < S.mobs.length; k++) {
    var mo = S.mobs[k];
    if (mo.hp <= 0) continue;
    mo.flash = Math.max(0, mo.flash - dt * 4);

    // 信标减速
    var slow = 1;
    for (var s = 0; s < S.builds.length; s++) {
      var bb = S.builds[s];
      if (bb.dead || bb.type !== "beacon") continue;
      if (Math.hypot(mo.col - bb.col, mo.v - bb.v) <= BUILD.beacon.r) { slow = 0.55; break; }
    }

    // 路上有建筑就停下来打
    var block = null;
    for (var t2 = 0; t2 < S.builds.length; t2++) {
      var bt = S.builds[t2];
      if (bt.dead) continue;
      if (Math.abs(bt.col - mo.col) > 0.55) continue;
      if (Math.abs(bt.v - mo.v) > 0.55) continue;
      block = bt; break;
    }
    if (block) {
      mo.atk -= dt;
      if (mo.atk <= 0) {
        mo.atk = 0.9;
        block.hp -= mo.dmg;
        block.flash = 1;
        if (block.hp <= 0) {
          block.dead = true;
          var dp = w2s(laneCX(block.col, block.v), rowY(block.v));
          addFx("boom", dp.x, dp.y, BUILD[block.type].name + "塌", "#7c879b", 0.9);
        }
      }
      continue;
    }

    mo.v -= mo.spd * slow * dt;

    if (mo.v <= 0.15) {
      S.dur -= CAR_HIT;
      S.dur = Math.max(0, S.dur);
      mo.hp = 0;
      var cp = w2s(laneCX(S.carCol, 0), rowY(0));
      addFx("boom", cp.x, cp.y - 10, "-" + CAR_HIT, "#ff6b6b", 1.0);
      if (S.dur <= 0) { lose("车被拆了。"); return; }
    }
  }
  S.mobs = S.mobs.filter(function (m) { return m.hp > 0; });

  if (S.stageT >= DAY_NIGHT) nextDay();
}

function towerTarget(b, range) {
  /* 射程内优先打最靠前的（v 最小），避免所有塔集火同一只后排 */
  var best = null, bv = 999;
  for (var i = 0; i < S.mobs.length; i++) {
    var m = S.mobs[i];
    if (m.hp <= 0) continue;
    if (Math.hypot(m.col - b.col, m.v - b.v) > range) continue;
    if (m.v < bv) { bv = m.v; best = m; }
  }
  return best;
}

function damageMob(m, dmg) {
  if (m.hp <= 0) return;
  m.hp -= dmg;
  m.flash = 1;
  if (m.hp <= 0) {
    S.stat.kill++;
    var p = w2s(laneCX(m.col, m.v), rowY(m.v));
    addFx("kill", p.x, p.y, "×", "#7c879b", 0.6);
  }
}

function spawnMob() {
  var col = irnd(0, LANES - 1);
  var lvl = S.day;
  // 成长三系数减半后的数值
  var hp = 52 + lvl * 1.6;
  var spd = 0.62 + Math.min(0.35, lvl * 0.004);
  var dmg = 26 + Math.min(18, lvl * 0.22);
  var t = "尸";
  var r = Math.random();
  if (lvl >= 6 && r < 0.28) { t = "弓"; hp *= 0.7; spd *= 0.85; }
  else if (lvl >= 10 && r < 0.42) { t = "影"; hp *= 0.95; spd *= 1.15; }
  S.mobs.push({
    col: col, v: ROWS - 0.6, hp: hp, hpMax: hp,
    spd: spd, dmg: dmg, atk: 0.4, flash: 0, ch: t
  });
}

/* ============================ 11. 特效推进 ============================ */
function updateFx(dt) {
  for (var i = S.fx.length - 1; i >= 0; i--) {
    var f = S.fx[i];
    f.t += dt;
    if (f.t >= f.dur) S.fx.splice(i, 1);
  }
  if (S.msgT > 0) { S.msgT -= dt; if (S.msgT <= 0) S.msg = null; }
  for (var j = 0; j < S.orbs.length; j++) S.orbs[j].flash = Math.max(0, S.orbs[j].flash - dt * 3.5);
  for (var k = 0; k < S.piles.length; k++) S.piles[k].flash = Math.max(0, S.piles[k].flash - dt * 3.5);
}

/* ============================ 12. 主循环 ============================ */
var last = 0;
function loop(ts) {
  if (!last) last = ts;
  var dt = Math.min(0.05, (ts - last) / 1000) * (S ? S.turbo : 1);
  last = ts;

  if (S) {
    if (!S.over && !S.paused) {
      if (S.stage === "travel") updateTravel(dt);
      else if (S.stage === "dusk") updateDusk(dt);
      else if (S.stage === "night") updateNight(dt);
      updateFx(dt);
    } else if (S.over) {
      S.overT += dt;
    }
    render();
  }
  requestAnimationFrame(loop);
}

/* ============================ 13. 渲染 · 底层 ============================ */
function txt(s, x, y, size, color, align, weight, font) {
  ctx.save();
  ctx.font = (weight || "") + " " + size + "px " + (font || '"PingFang SC","Microsoft YaHei",system-ui,sans-serif');
  ctx.textAlign = align || "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}
function line(x1, y1, x2, y2, color, w, dash) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = w || 1;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}
function box(x, y, w, h, stroke, fill, r) {
  ctx.save();
  ctx.beginPath();
  var rr = r == null ? 3 : r;
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.restore();
}

/* 尘幕：天上压着一层灰，太阳只透得下黄光 */
function drawSky() {
  var g = ctx.createLinearGradient(0, 0, 0, horizonY);
  g.addColorStop(0, "#2b2417");
  g.addColorStop(0.45, "#1d1f24");
  g.addColorStop(1, "#151922");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, horizonY);

  // 尘幕横纹
  for (var i = 0; i < 15; i++) {
    var y = 6 + i * ((horizonY - 12) / 15);
    ctx.fillStyle = "rgba(190,166,110," + (0.11 - i * 0.0055) + ")";
    ctx.fillRect(0, y, W, 1);
  }

  /* 地面底色（路之外的两侧）：
     起点必须和天空底同色（#151922），否则地平线上会出现一条亮带 ——
     那条亮带正好把路夹在中间，是"路浮在背景上"的帮凶。
     往下才慢慢压暗，近处最暗，让被车灯照亮的路面从地面里"立"起来 */
  var gg = ctx.createLinearGradient(0, horizonY, 0, H);
  gg.addColorStop(0, "#151922");
  gg.addColorStop(0.16, "#141820");
  gg.addColorStop(0.45, "#10141b");
  gg.addColorStop(0.74, "#0c0f14");
  gg.addColorStop(1, "#0a0c10");
  ctx.fillStyle = gg;
  ctx.fillRect(0, horizonY, W, H - horizonY);

  // 地平线
  line(0, horizonY, W, horizonY, "rgba(255,207,122,.15)", 1);

  // 被尘幕糊住的日：只在地平线上露出半轮
  var sx = W * 0.84, sy = horizonY - 26, sr = 30;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, horizonY, W, 110); ctx.clip();
  var rg = ctx.createRadialGradient(sx, sy, 4, sx, sy, sr * 3.4);
  rg.addColorStop(0, "rgba(255,207,122,.40)");
  rg.addColorStop(0.42, "rgba(255,207,122,.11)");
  rg.addColorStop(1, "rgba(255,207,122,0)");
  ctx.fillStyle = rg;
  ctx.beginPath(); ctx.arc(sx, sy, sr * 3.4, 0, 6.2832); ctx.fill();
  ctx.fillStyle = S && S.stage === "night" ? "rgba(190,150,110,.18)" : "rgba(230,193,128,.72)";
  ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 6.2832); ctx.fill();
  ctx.restore();

  /* 地平线上的远景剪影：给"远处"一个实体参照。
     没有它，路的尽头就是一片虚空 —— 这也是"悬浮"的一部分 */
  var FAR = [[0.04, 16, 22, "楼"], [0.11, 26, 16, "塔"], [0.19, 11, 26, "树"],
             [0.28, 19, 18, "楼"], [0.70, 13, 24, "树"], [0.79, 24, 17, "楼"],
             [0.88, 12, 21, "塔"], [0.96, 18, 23, "树"]];
  for (var f = 0; f < FAR.length; f++) {
    var fx = W * FAR[f][0], fh = FAR[f][1], fw = FAR[f][2];
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "rgba(17,21,28,1)";
    ctx.fillRect(fx - fw / 2, horizonY - fh, fw, fh);
    ctx.globalAlpha = 0.22;
    txt(FAR[f][3], fx, horizonY - fh * 0.42, 7.5, "#8b9ab2", "center", "400");
    ctx.restore();
  }

  /* 地面碎石：稀疏的暗点，近大远小。让两侧不再是纯色，路才有"地"可落 */
  for (var gs = 0; gs < GROUND_SPECKS.length; gs++) {
    var gd0 = GROUND_SPECKS[gs];
    var gsv = gd0.v;
    var gsx = gd0.side < 0
      ? leftX(gsv) - gd0.off
      : leftX(gsv) + wAt(gsv) + gd0.off;
    var gsp2 = w2s(gsx, rowY(gsv));
    var gk2 = 1 - gsv / ROWS;
    ctx.save();
    ctx.globalAlpha = 0.09 + 0.16 * gk2 * gk2;
    txt(gd0.ch, gsp2.x, gsp2.y, Math.max(4, 3 + 6 * gk2), "#93a3bb", "center", "400");
    ctx.restore();
  }

  /* 路边残骸：文字占位，但跟着路走（世界坐标 + 透视缩放），
     这样地面也有纵深，不再是一层贴在镜头上的字 */
  var junk = [[-1, 3.0, "屋"], [1, 4.2, "杆"], [-1, 7.5, "墙"], [1, 9.0, "牌"],
              [-1, 11.5, "杆"], [1, 13.2, "屋"]];
  for (var j = 0; j < junk.length; j++) {
    var side = junk[j][0], jv = junk[j][1];
    var off = (26 + 22 * scaleAt(jv)) * side;
    var jxw = side < 0 ? leftX(jv) - off : leftX(jv) + wAt(jv) + off;
    var jp = w2s(jxw, rowY(jv));
    var fade = clamp(1 - jv / ROWS * 0.55, 0.25, 1);
    ctx.save();
    ctx.globalAlpha = 0.075 * fade;
    txt(junk[j][2], jp.x, jp.y, 8 + 4 * scaleAt(jv), "#cfd8e6", "center", "400");
    ctx.restore();
  }
}

/* 路面颗粒：固定种子的伪随机，一帧不动，避免每帧抖动。
   u = 车道横向比例 0~1，v = 深度，w = 颗粒基准大小，a = 明暗权重 */
var ROAD_SPECKS = (function () {
  var arr = [], seed = 20261024;
  function nr() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  for (var i = 0; i < 110; i++) {
    arr.push({ u: nr(), v: nr() * ROWS, w: 0.45 + nr() * 1.5, a: 0.3 + nr() * 0.7 });
  }
  return arr;
})();

/* 地面碎石：文字占位（用极淡的「·」「′」「‵」），按世界坐标撒在路两侧 */
var GROUND_SPECKS = (function () {
  var arr = [], seed = 77213;
  function nr() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
  var marks = ["·", "·", "·", "′", "‵", "′"];
  for (var i = 0; i < 54; i++) {
    arr.push({
      side: nr() < 0.5 ? -1 : 1,
      v: nr() * ROWS,
      off: 18 + nr() * 130,
      ch: marks[(nr() * marks.length) | 0]
    });
  }
  return arr;
})();

/* 地面田埂：横向等距线，从路沿向外铺到画面边。
   没有它，路两侧就是一片纯色 —— 路没有"地"可踩，眼睛就读成浮着的一块板。
   只画到 v=12：更远的横线经过 9° 剪切会越过地平线插进天空里。 */
function drawRidges() {
  for (var v = 1.5; v <= 12; v += 3) {
    var y = rowY(v), k = 1 - v / ROWS;
    var a = (0.008 + 0.042 * k * k).toFixed(3);
    var wd = 0.35 + 1.1 * k;
    var l1 = w2s(leftX(v) - 7, y), l2 = w2s(-14, y);
    var r1 = w2s(leftX(v) + wAt(v) + 7, y), r2 = w2s(W + 14, y);
    line(l1.x, l1.y, l2.x, l2.y, "rgba(158,178,206," + a + ")", wd);
    line(r1.x, r1.y, r2.x, r2.y, "rgba(158,178,206," + a + ")", wd);
  }
}


/* 公路。
   关键：路面两侧必须是**曲线**（沿 wAt/rowY 采样），不能是四点直线梯形。
   旧版用 4 个点画边，边线是直的，而物件按透视曲线排 —— 两者对不上，
   整块路就变成"一块斜放的亮板子"。改成按户采样之后，边缘自带收缩曲率，
   再加上接地阴影 / 路肩 / 颗粒 / 边线衰减 / 远端雾，纵深才立得住。 */
function drawRoad() {
  var STEP = 0.5;                                  // 沿纵深采样步长（户）
  function west(v) { return leftX(v) - 0; }
  function east(v) { return leftX(v) + wAt(v); }

  /* 沿纵深画闭合路形；out = 向外扩出的像素（路肩用） */
  function roadPath(outNear, outFar) {
    outNear = outNear || 0;
    outFar = (outFar === undefined) ? outNear : outFar;
    var v, p, first = true;
    ctx.beginPath();
    for (v = 0; v <= ROWS + 1e-6; v += STEP) {
      p = w2s(west(v) - (outNear + (outFar - outNear) * (v / ROWS)), rowY(v));
      if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
    }
    for (v = ROWS; v >= -1e-6; v -= STEP) {
      p = w2s(east(v) + (outNear + (outFar - outNear) * (v / ROWS)), rowY(v));
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }
  function span(v0, x0, v1, x1) {
    var a = w2s(x0, rowY(v0)), b = w2s(x1, rowY(v1));
    return [a.x, a.y, b.x, b.y];
  }

  /* ① 接地阴影：向外扩散的软黑，路才压在地面上。
     不能太宽 —— 19px + blur24 在近端会变成两条黑沟，反而把路描成一块板 */
  ctx.save();
  roadPath(9, 2.4);
  ctx.shadowColor = "rgba(0,0,0,.88)";
  ctx.shadowBlur = 13;
  ctx.fillStyle = "#0c0f14";
  ctx.fill();
  ctx.restore();

  /* ② 路肩：两侧土带，比路面暗、比地面亮，让路"嵌"进去 */
  ctx.save();
  roadPath(6, 1.8);
  var shg = ctx.createLinearGradient(0, baseY, 0, horizonY);
  shg.addColorStop(0, "#13161d");
  shg.addColorStop(0.55, "#111419");
  shg.addColorStop(1, "#0f1217");
  ctx.fillStyle = shg;
  ctx.fill();
  ctx.restore();

  /* ③ 路面。整体压暗（参考图的路几乎纯黑，只有线亮），
     但远端终点仍要≈地平线处地面色，否则又成"暗楔子" */
  ctx.save();
  roadPath(0);
  var pg = ctx.createLinearGradient(0, baseY, 0, horizonY);
  pg.addColorStop(0,    "#1f2430");
  pg.addColorStop(0.18, "#1c2029");
  pg.addColorStop(0.45, "#191d25");
  pg.addColorStop(0.74, "#181c24");
  pg.addColorStop(1,    "#171c25");
  ctx.fillStyle = pg;
  ctx.fill();
  ctx.restore();

  /* 以下纹理裁在路面内 */
  ctx.save();
  roadPath(0); ctx.clip();

  /* ④ 路面颗粒：近大远小 */
  for (var q = 0; q < ROAD_SPECKS.length; q++) {
    var sp = ROAD_SPECKS[q], qv = sp.v;
    var qp = w2s(leftX(qv) + sp.u * wAt(qv), rowY(qv));
    var kq = 1 - qv / ROWS;
    ctx.beginPath();
    ctx.arc(qp.x, qp.y, Math.max(0.35, sp.w * (0.4 + 2.0 * kq)), 0, 6.2832);
    ctx.fillStyle = "rgba(196,210,234," + (0.020 + 0.055 * kq * kq * sp.a).toFixed(3) + ")";
    ctx.fill();
  }

  /* ⑤ 车道虚线：白色短段，亮、粗，随纵深衰减（豆包参考图的主视觉语言）。
     黑路面 + 亮白虚线，冷峻干净的高对比 */
  for (var c = 1; c < LANES; c++) {
    for (var i = 0; i < ROWS; i++) {
      var v0 = i + 0.08, v1 = i + 0.62;
      var kk = 1 - i / ROWS;
      var sg = span(v0, leftX(v0) + c * laneUnit(v0), v1, leftX(v1) + c * laneUnit(v1));
      line(sg[0], sg[1], sg[2], sg[3],
        "rgba(236,242,250," + (0.14 + 0.58 * kk).toFixed(3) + ")",
        0.5 + 2.1 * kk);
    }
  }

  /* ⑥ 左右边线：暖黄实线（参考图里最亮的两条），近粗远细 */
  for (var side = 0; side < 2; side++) {
    for (var j = 0; j < ROWS; j++) {
      var k3 = 1 - j / ROWS;
      var x0 = side ? east(j) : west(j);
      var x1 = side ? east(j + 1) : west(j + 1);
      var s3 = span(j, x0, j + 1, x1);
      line(s3[0], s3[1], s3[2], s3[3],
        "rgba(255,196,92," + (0.16 + 0.62 * k3 * k3).toFixed(3) + ")",
        0.6 + 2.5 * k3 * k3);
    }
  }

  ctx.restore();

  /* ⑥.5 护栏：银色金属柱 + 反光带。柱距随透视压缩，
     是仅次于边线的纵深线索 —— 现实公路照片里最会"报距离"的就是它。
     参考图里护栏是画面里最亮的东西之一，银白、柱高、带反光点 */
  for (var gd = 0; gd < 2; gd++) {
    var gpts = [];
    for (var gv = 0; gv <= ROWS; gv += 1) {
      var gk = 1 - gv / ROWS;
      var sw = 11 + (3 - 11) * (gv / ROWS);        // 该处的路肩宽度
      var gx = gd ? east(gv) + sw + 4 : west(gv) - sw - 4;
      var gpp = w2s(gx, rowY(gv));
      gpts.push({ x: gpp.x, y: gpp.y, h: 4 + 24 * gk, k: gk });
    }
    for (var gi = 0; gi < gpts.length - 1; gi++) {
      var ga = gpts[gi], gb = gpts[gi + 1];
      line(ga.x, ga.y - ga.h, gb.x, gb.y - gb.h,
        "rgba(188,204,224," + (0.10 + 0.34 * ga.k * ga.k).toFixed(3) + ")",
        0.5 + 1.5 * ga.k);
    }
    for (var gj = 0; gj < gpts.length; gj++) {
      var gq = gpts[gj];
      line(gq.x, gq.y, gq.x, gq.y - gq.h,
        "rgba(216,230,248," + (0.16 + 0.50 * gq.k * gq.k).toFixed(3) + ")",
        0.6 + 1.8 * gq.k);
      /* 柱头反光点：护栏"金属感"的来源 */
      if (gq.k > 0.12) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(gq.x, gq.y - gq.h - 1, 0.7 + 1.8 * gq.k, 0, 6.2832);
        ctx.fillStyle = "rgba(226,238,252," + (0.20 + 0.55 * gq.k * gq.k).toFixed(3) + ")";
        ctx.fill();
        ctx.restore();
      }
    }
  }

  /* ⑦ 远端雾：只留薄薄一层软化地平线。旧版厚 0.19 且全宽，
     把地平线附近的地面一起糊平了 —— 田埂和灯杆刚画就被吃掉，
     地面的纵深线索全没了，路只好重新浮起来 */
  var fogH = (baseY - horizonY) * 0.055;
  var fg = ctx.createLinearGradient(0, horizonY - 4, 0, horizonY + fogH);
  fg.addColorStop(0,    "rgba(21,25,34,.88)");
  fg.addColorStop(0.35, "rgba(21,25,33,.40)");
  fg.addColorStop(0.72, "rgba(21,25,32,.12)");
  fg.addColorStop(1,    "rgba(20,24,31,0)");
  ctx.save();
  ctx.fillStyle = fg;
  ctx.fillRect(0, horizonY - 4, W, fogH + 4);
  ctx.restore();

  /* ⑦.5 路顶端溶进地里：只裁在路面内，把路的上沿抹成地面色。
     收窄只能让"上底边"变短，抹掉才能让它不存在 —— 这一步做完，
     路的远端是真的"没有边"了，而不是"有一条很短的边"。
     裁在路内 + 画在球之前，所以不会吃掉最远排的悬空球 */
  var meltH = (baseY - horizonY) * MELT;
  ctx.save();
  roadPath(0); ctx.clip();
  var mg = ctx.createLinearGradient(0, horizonY - 1, 0, horizonY + meltH);
  mg.addColorStop(0,    "rgba(21,25,34,1)");     // 与地平线处地面同色 #151922
  mg.addColorStop(0.28, "rgba(22,26,35,.80)");
  mg.addColorStop(0.60, "rgba(22,26,35,.38)");
  mg.addColorStop(1,    "rgba(22,26,35,0)");
  ctx.fillStyle = mg;
  ctx.fillRect(0, horizonY - 1, W, meltH + 1);
  ctx.restore();

  /* ⑧ 里程刻度：每 5 户一个小横杠，只在白天显示。
     最远那条（m=15）正好落在路顶端，会把路的收口描成一条亮横边 ——
     那就是"板子上底边"，所以只画到 12 */
  for (var m = 5; m <= 12 && S.stage === "travel"; m += 5) {
    var lx = w2s(leftX(m) - 6, rowY(m));
    var rx = w2s(leftX(m) + wAt(m) + 6, rowY(m));
    line(lx.x, lx.y, rx.x, rx.y, "rgba(255,255,255,.10)", 1, [3, 5]);
    txt(m + "", lx.x - 9, lx.y, 8, "rgba(255,255,255,.18)", "right", "", "monospace");
  }
}

/* 车头灯打在路面上的光锥。用 lighter 叠加，只加亮不遮挡后面的东西。
   关键：必须是**沿路铺开的梯形**，四角由 laneCX/laneUnit 算出。
   旧版是一个屏幕空间的椭圆斑 —— 正圆的斑不服从透视，等于在透视路面上
   糊了一块平光，纵深立刻塌掉。 */
function drawCarLight() {
  if (S.stage === "night") return;
  var FAR = 7;                                        // 灯照到第 7 户
  var y0 = rowY(0), y1 = rowY(FAR);
  var c0 = laneCX(S.carCol, 0), c1 = laneCX(S.carCol, FAR);
  var h0 = laneUnit(0) * 0.46, h1 = laneUnit(FAR) * 0.66;
  var a = w2s(c0 - h0, y0), b = w2s(c0 + h0, y0);
  var c = w2s(c1 + h1, y1), d = w2s(c1 - h1, y1);
  var g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0,    "rgba(255,200,126,.20)");
  g.addColorStop(0.30, "rgba(255,192,118,.105)");
  g.addColorStop(0.62, "rgba(255,186,110,.040)");
  g.addColorStop(1,    "rgba(255,182,104,0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/* ============================ 14. 渲染 · 物件 ============================ */
function drawOrb(o) {
  if (o.searched || o.skipped) return;
  var gp = orbScreen(o);                 // 地面点
  var def = ORB_K[o.kind];
  /* 球径受两个约束：横向不超车道，纵向不超本排行高的一半 —— 否则远端会叠成一坨 */
  var r = Math.min(rowHPx(o.v) * 0.44, laneUnit(o.v) * 0.38);
  r = Math.max(r, 8);
  var pulse = 1 + Math.sin(performance.now() / 420 + o.v) * 0.045;
  r *= pulse;

  /* 球浮在地面上方一个半径的四成处，影子留在路上。
     这一步是"路变成地"的关键：有落影，人才会相信那是地面 */
  var lift = r * 0.40;
  var p = { x: gp.x, y: gp.y - lift, s: gp.s };

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(gp.x, gp.y + r * 0.10, r * 0.80, r * 0.30, 0, 0, 6.2832);
  ctx.fillStyle = "rgba(3,5,9,.55)";
  ctx.fill();
  ctx.restore();

  if (o.kind === "hazard") {
    // 闷囊：胀着的黑囊，带刺边
    ctx.save();
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = i / 10 * 6.2832;
      var rr = i % 2 ? r * 0.78 : r * 1.02;
      var x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(255,107,107,.10)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,107,107,.85)";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.restore();
    txt("囊", p.x, p.y + 1, Math.max(9, r * 0.95), "#ff8f8f", "center", "700");
    if (o === S.hint) {
      ctx.save();
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 4.5, 0, 6.2832);
      ctx.strokeStyle = "rgba(238,243,255,.28)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    return;
  }

  // 悬浮球：外圈虚线 + 中间封条字
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, 6.2832);
  ctx.fillStyle = "rgba(255,255,255,.035)";
  ctx.fill();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = def.col;
  ctx.globalAlpha = 0.55 + o.flash * 0.45;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();

  txt(def.ch, p.x, p.y + 1, Math.max(9, r * 0.95), def.col, "center", "700");

  // 悬浮高度指示：一条短竖线 + 小点，暗示球是浮着的
  ctx.save();
  ctx.globalAlpha = 0.18;
  line(p.x, p.y + r + 2, p.x, p.y + r + 9, def.col, 1, [2, 3]);
  ctx.restore();

  // 下一个要面对的球，给一个外圈，让眼睛有落点
  if (o === S.hint) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 4.5, 0, 6.2832);
    ctx.strokeStyle = "rgba(238,243,255,.30)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

}

function drawPile(p) {
  if (p.taken) return;
  var gsp = orbScreen(p);
  var r = Math.max(7, Math.min(rowHPx(p.v) * 0.42, laneUnit(p.v) * 0.32));
  var sp = { x: gsp.x, y: gsp.y - r * 0.18, s: gsp.s };
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(gsp.x, gsp.y + r * 0.10, r * 0.92, r * 0.30, 0, 0, 6.2832);
  ctx.fillStyle = "rgba(3,5,9,.50)";
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(sp.x - r * 0.9, sp.y - r * 0.7, r * 1.8, r * 1.4);
  ctx.fillStyle = "rgba(159,176,200,.08)";
  ctx.fill();
  ctx.setLineDash([2, 3]);
  ctx.strokeStyle = "rgba(159,176,200,.7)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  txt("堆", sp.x, sp.y + 1, Math.max(9, r * 0.85), "#b7c6dc", "center", "700");
  txt("+" + p.wood, sp.x, sp.y + r * 1.25, 8, "rgba(183,198,220,.75)", "center", "", "monospace");
}

function drawBuild(b) {
  if (b.dead) {
    // 塌掉的建筑画成一堆灰烬文字
    var dp = w2s(laneCX(b.col, b.v), rowY(b.v));
    txt("×", dp.x, dp.y, 12, "rgba(124,135,155,.45)", "center", "700");
    return;
  }
  var def = BUILD[b.type];
  var p = w2s(laneCX(b.col, b.v), rowY(b.v));
  var u = laneUnit(b.v);
  var w = u * 0.70, h = u * 0.50;

  // 作用范围（篝火 / 塔 / 信标）
  if (def.r > 0 && (S.stage === "night" || S.stage === "dusk")) {
    var pc = w2s(laneCX(b.col, b.v), rowY(b.v));
    var rx = def.r * laneUnit(b.v) * 0.58;   // 横向收窄，纯示意，别横跨整屏
    var ry = def.r * rowHPx(b.v) * 0.92;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(pc.x, pc.y, rx, ry, 0, 0, 6.2832);
    ctx.strokeStyle = b.type === "fire" ? "rgba(255,157,92,.26)"
      : b.type === "beacon" ? "rgba(160,200,255,.22)" : "rgba(255,207,122,.16)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    if (b.type === "fire") {
      ctx.fillStyle = "rgba(255,157,92,.035)";
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(p.x - w / 2, p.y - h / 2, w, h);
  var heat = def.dmg ? Math.min(1, b.flash) : 0;
  ctx.fillStyle = "rgba(255,207,122," + (0.10 + heat * 0.35) + ")";
  ctx.fill();
  ctx.strokeStyle = b.type === "fire" ? "rgba(255,157,92,.85)"
    : b.type === "beacon" ? "rgba(160,200,255,.8)"
    : b.type === "barrel" ? "rgba(255,157,92,.6)"
    : "rgba(255,207,122,.75)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();

  txt(def.ch, p.x, p.y + 1, Math.max(9, u * 0.42), "#ffe2b0", "center", "700");

  // 血条
  if (b.hp < b.hpMax) {
    var bw = w, bh = 2.5, bx = p.x - bw / 2, by = p.y + h / 2 + 3;
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = "#ff9d5c";
    ctx.fillRect(bx, by, bw * clamp(b.hp / b.hpMax, 0, 1), bh);
  }
}

function drawMob(m) {
  var p = w2s(laneCX(m.col, m.v), rowY(m.v));
  var u = laneUnit(m.v);
  var s = u * 0.46;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - s);
  ctx.lineTo(p.x + s * 0.82, p.y + s * 0.7);
  ctx.lineTo(p.x - s * 0.82, p.y + s * 0.7);
  ctx.closePath();
  ctx.fillStyle = m.flash > 0.3 ? "rgba(255,107,107,.55)" : "rgba(255,255,255,.06)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,107,107,.7)";
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();

  txt(m.ch, p.x, p.y + s * 0.18, Math.max(8, s * 0.95), "#ff9d9d", "center", "700");

  if (m.hp < m.hpMax) {
    var bw = s * 1.8, by = p.y - s - 5;
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fillRect(p.x - bw / 2, by, bw, 2);
    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(p.x - bw / 2, by, bw * clamp(m.hp / m.hpMax, 0, 1), 2);
  }
}

function drawCar() {
  var v = S.carV;
  var bp = S.stage === "travel" ? S.bump : 0;
  var k = bp > 0 ? bp / BUMP_T : 0;                 // 0..1，撞得越狠越大
  // 顿挫：车身上下一抖，横向也带一点
  var shake = k * 3.2;
  var p = w2s(laneCX(S.carCol, v), rowY(v) - 4);
  p.x += Math.sin((1 - k) * 42) * shake;
  p.y += Math.cos((1 - k) * 37) * shake * 0.6;
  var u = laneUnit(Math.max(v, 0.4));
  var w = u * 0.95, h = u * 0.62;

  // 车头灯（正是这盏灯招来了东西）
  ctx.save();
  var lg = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 44);
  lg.addColorStop(0, S.fuel > 0 ? "rgba(255,207,122,.16)" : "rgba(120,140,180,.10)");
  lg.addColorStop(1, "rgba(255,207,122,0)");
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.arc(p.x, p.y, 44, 0, 6.2832); ctx.fill();
  ctx.restore();

  /* 撞击反应：外包一圈红环，迅速散掉 */
  if (k > 0) {
    ctx.save();
    ctx.globalAlpha = k * 0.7;
    ctx.beginPath();
    ctx.arc(p.x, p.y, u * (0.55 + (1 - k) * 0.30), 0, 6.2832);
    ctx.strokeStyle = "#ff6b6b";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // 车底阴影：车压在路面上
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + h * 0.52, w * 0.62, h * 0.30, 0, 0, 6.2832);
  ctx.fillStyle = "rgba(3,4,8,.55)";
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(p.x - w / 2, p.y - h / 2, w, h);
  ctx.fillStyle = k > 0 ? "rgba(255,107,107,.22)" : "rgba(255,207,122,.14)";
  ctx.fill();
  ctx.strokeStyle = k > 0 ? "#ff8f8f" : "#ffcf7a";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  txt("车", p.x, p.y + 1, Math.max(10, u * 0.40), "#ffe9c4", "center", "700");
}

function drawArrows() {
  for (var i = 0; i < S.arrows.length; i++) {
    var a = S.arrows[i];
    var x0 = laneCX(a.col, a.v), y0 = rowY(a.v);
    var x1 = laneCX(a.tc, a.tv), y1 = rowY(a.tv);
    var mx = x0 + (x1 - x0) * a.t, my = y0 + (y1 - y0) * a.t;
    var p = w2s(mx, my);
    txt("→", p.x, p.y, 9, "rgba(255,207,122,.9)", "center", "700");
  }
}

function drawFx() {
  for (var i = 0; i < S.fx.length; i++) {
    var f = S.fx[i];
    var k = f.t / f.dur;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    if (f.kind === "boom") {
      ctx.beginPath();
      ctx.arc(f.x, f.y, 6 + k * 22, 0, 6.2832);
      ctx.strokeStyle = f.col;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    txt(f.txt, f.x, f.y - k * 22, f.kind === "loot" ? 10 : 11, f.col, "center", "600", '"PingFang SC",monospace');
    ctx.restore();
  }
}

/* ============================ 15. 渲染 · HUD ============================ */
function drawHUD() {
  // 顶部渐隐底
  ctx.save();
  var g = ctx.createLinearGradient(0, 0, 0, 116);
  g.addColorStop(0, "rgba(7,9,13,.94)");
  g.addColorStop(0.7, "rgba(7,9,13,.55)");
  g.addColorStop(1, "rgba(7,9,13,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 116);
  ctx.restore();

  /* --- 第一行：天 / 章 / 路程百分比 --- */
  txt("DAY " + S.day, 14, 18, 12, "#ffcf7a", "left", "700", "monospace");
  txt("/ " + DAY_LIMIT, 64, 18, 9, "rgba(255,255,255,.28)", "left", "", "monospace");

  var chIdx = clamp(Math.floor(S.totalHouse / CHAPTER_H), 0, 4);
  txt("第 " + (chIdx + 1) + " 章 · " + CHAPTERS[chIdx], CX, 18, 11, "rgba(255,255,255,.60)", "center", "500");

  var pct = Math.floor(clamp(S.totalHouse / HOUSE_TOTAL, 0, 1) * 100);
  txt(pct + "%", W - 14, 18, 10.5, "#eef3ff", "right", "700", "monospace");
  var pw = 86, px = W - 14 - pw;
  ctx.fillStyle = "rgba(255,255,255,.09)";
  ctx.fillRect(px, 27, pw, 2);
  ctx.fillStyle = "#7fe0b0";
  ctx.fillRect(px, 27, pw * clamp(S.totalHouse / HOUSE_TOTAL, 0, 1), 2);

  /* --- 第二行：木 / 油 / 车 --- */
  drawRes("木", S.wood, "#e2d6bb", 14, 47);
  drawRes("油", Math.round(S.fuel), "#6fb1d6", 88, 47);

  var dw = 84, dx = W - 14 - dw - 22;
  txt("车", dx - 8, 47, 9.5, "rgba(255,255,255,.42)", "right");
  ctx.fillStyle = "rgba(255,255,255,.09)";
  ctx.fillRect(dx, 43, dw, 5);
  var dk = clamp(S.dur / S.durMax, 0, 1);
  ctx.fillStyle = dk > 0.5 ? "#7fe0b0" : (dk > 0.25 ? "#ffcf7a" : "#ff6b6b");
  ctx.fillRect(dx, 43, dw * dk, 5);
  txt(Math.round(S.dur) + "", dx + dw + 5, 47, 9, "rgba(255,255,255,.40)", "left", "", "monospace");

  /* --- 第三行：阶段进度 --- */
  drawStageBar();

  /* --- 小鱼说话 --- */
  if (S.msg) {
    var a = Math.min(1, S.msgT * 2.4);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '11px "PingFang SC",sans-serif';
    var tw = ctx.measureText(S.msg).width + 28;
    box((W - tw) / 2, 92, tw, 22, "rgba(255,207,122,.20)", "rgba(8,10,15,.86)", 11);
    drawAvatar(26, 103, 15);
    txt(S.msg, W / 2 + 9, 103, 11, "#ffdca8", "center", "500");
    ctx.restore();
  }
}

function drawRes(label, val, col, x, y) {
  txt(label, x, y, 10, col, "left", "600");
  txt(val + "", x + 15, y, 12, "#eef3ff", "left", "700", "monospace");
}

function drawStageBar() {
  var y = 70;
  var dur = { travel: DAY_TRAVEL, dusk: DAY_DUSK, night: DAY_NIGHT }[S.stage] || 1;
  var k = clamp(S.stageT / dur, 0, 1);
  var segs = [
    { n: "行进", col: "#ffcf7a", on: S.stage === "travel" },
    { n: "布防", col: "#9fb0c8", on: S.stage === "dusk" },
    { n: "守夜", col: "#ff6b6b", on: S.stage === "night" }
  ];
  for (var i = 0; i < 3; i++) {
    txt(segs[i].n, 14 + i * 42, y, 9,
      segs[i].on ? segs[i].col : "rgba(255,255,255,.20)", "left", segs[i].on ? "700" : "400");
  }
  var bx = 146, bw = W - 14 - bx - 40;
  ctx.fillStyle = "rgba(255,255,255,.07)";
  ctx.fillRect(bx, y - 2, bw, 3);
  ctx.fillStyle = segs[0].on ? segs[0].col : (segs[1].on ? segs[1].col : segs[2].col);
  ctx.fillRect(bx, y - 2, bw * k, 3);
  txt(Math.ceil(Math.max(0, dur - S.stageT)) + "s", W - 14, y, 9.5, "rgba(255,255,255,.34)", "right", "", "monospace");
}

/* ============================ 16. 渲染 · 面板 ============================ */
function drawPanel() {
  var y0 = baseY + 4;
  ctx.save();
  var g = ctx.createLinearGradient(0, y0 - 20, 0, H);
  g.addColorStop(0, "rgba(7,9,13,0)");
  g.addColorStop(0.3, "rgba(7,9,13,.96)");
  g.addColorStop(1, "rgba(7,9,13,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y0 - 20, W, H - y0 + 20);
  ctx.restore();

  if (S.stage === "dusk") {
    drawDuskPanel(y0);
  } else if (S.stage === "night") {
    drawNightPanel(y0);
  } else {
    drawTravelPanel(y0);
  }
}

function drawTravelPanel(y0) {
  txt("白天 · 撞开悬浮球搜刮", 14, y0 + 18, 11.5, "rgba(255,255,255,.62)", "left", "600");

  var done = 0, haz = 0;
  for (var i = 0; i < S.orbs.length; i++) {
    var o = S.orbs[i];
    if (o.kind === "hazard") { if (o.searched) haz++; }
    else if (o.searched) done++;
  }

  /* 撞球代价：已经扣掉的白天时间，和最直观的一句换算 */
  var normalN = 0;
  for (var q = 0; q < S.orbs.length; q++) if (S.orbs[q].kind !== "hazard") normalN++;
  txt("已搜 " + done + " / " + normalN, 14, y0 + 38, 9.5, "rgba(255,255,255,.42)", "left", "", "monospace");
  if (S.hint) {
    var hk = ORB_K[S.hint.kind], hc = ORB_COST[S.hint.kind] || 1.0;
    txt("下一个", 14, y0 + 54, 9.5, "rgba(255,255,255,.28)", "left");
    txt(hk.ch, 54, y0 + 54, 9.5, hk.col, "left", "700");
    txt("-" + hc.toFixed(1) + "s", 66, y0 + 54, 9.5, "rgba(255,155,107,.9)", "left", "", "monospace");
    if (S.lostT > 0.05) {
      txt("今天已扣 -" + S.lostT.toFixed(1) + "s", 108, y0 + 54, 9.5, "rgba(255,155,107,.45)", "left", "", "monospace");
    }
  } else {
    txt("前面没球了，赶紧走", 14, y0 + 54, 9.5, "rgba(255,255,255,.24)", "left");
  }

  if (haz > 0) {
    txt("闷囊 " + haz, W - 14, y0 + 38, 10, "rgba(255,107,107,.75)", "right", "", "monospace");
  }
  txt("本日 " + Math.round(clamp(S.carV / ROWS, 0, 1) * 100) + "%", W - 14, y0 + 54, 10, "rgba(255,207,122,.7)", "right", "", "monospace");

  // 本日进度：时间条（剩多少白天）
  var mw = W - 28, mx = 14, my = y0 + 74;
  ctx.fillStyle = "rgba(255,255,255,.09)";
  ctx.fillRect(mx, my - 3, mw, 4);
  var k = clamp(S.stageT / DAY_TRAVEL, 0, 1);
  ctx.fillStyle = "#ffcf7a";
  ctx.fillRect(mx, my - 3, mw * k, 4);
  // 扣掉的那一段标红
  if (S.lostT > 0.05) {
    var lostW = mw * clamp(S.lostT / DAY_TRAVEL, 0, 1);
    var lx = Math.max(mx, mx + mw * k - lostW);
    ctx.fillStyle = "rgba(255,107,107,.55)";
    ctx.fillRect(lx, my - 3, mw * k - (lx - mx), 4);
  }
}

function drawTurboBtn(rx, cy) {
  var w = 46, h = 18, x = rx - w;
  box(x, cy - h / 2, w, h, "rgba(255,255,255,.14)", "rgba(255,255,255,.04)", 9);
  txt("×" + S.turbo, rx - w / 2, cy, 10, S.turbo > 1 ? "#7fe0b0" : "rgba(255,255,255,.5)", "center", "700", "monospace");
}

function drawDuskPanel(y0) {
  var left = Math.max(0, Math.ceil(DAY_DUSK - S.stageT));
  txt("黄昏 · 布防", 14, y0 + 15, 11, "#9fb0c8", "left", "700");
  txt(left + "s", 14 + 58, y0 + 15, 11, left <= 8 ? "#ffcf7a" : "rgba(159,176,200,.45)", "left", "700", "monospace");
  txt("点格子放建筑 · 只保一夜", 14, y0 + 32, 9, "rgba(255,255,255,.26)", "left");
  txt("木 " + S.wood, W - 14, y0 + 15, 10, "#e2d6bb", "right", "700", "monospace");

  // 建造选择条
  var cx = 12, cy = y0 + 60, bw = 64, bh = 38;
  for (var i = 0; i < BUILD_ORDER.length; i++) {
    var key = BUILD_ORDER[i], def = BUILD[key];
    var on = S.buildType === key;
    var enough = S.wood >= def.wood;
    var bx = cx + i * (bw + 5);
    box(bx, cy - bh / 2, bw, bh,
      on ? "#ffcf7a" : "rgba(255,255,255,.12)",
      on ? "rgba(255,207,122,.12)" : "rgba(255,255,255,.025)", 6);
    txt(def.ch, bx + 13, cy - 3, 12, enough ? (on ? "#ffcf7a" : "rgba(255,255,255,.55)") : "rgba(255,255,255,.18)", "center", "700");
    txt(def.name, bx + 26, cy - 6, 9, enough ? "rgba(255,255,255,.62)" : "rgba(255,255,255,.16)", "left", "500");
    txt(def.wood + " 木", bx + 26, cy + 7, 8.5, enough ? "rgba(226,214,187,.6)" : "rgba(255,107,107,.45)", "left", "", "monospace");
    S.btnBuild[i] = { x: bx, y: cy - bh / 2, w: bw, h: bh, key: key };
  }

  /* 跳过：布过 3 秒之后才亮，免得手滑点掉 */
  var sw = 74, sh = 28, sx = W - 14 - sw, sy = y0 + 96;
  var hot = S.stageT > 3;
  box(sx, sy, sw, sh, hot ? "rgba(159,176,200,.55)" : "rgba(255,255,255,.10)", "rgba(255,255,255,.03)", 14);
  txt("跳过 →", sx + sw / 2, sy + sh / 2, 10.5, hot ? "rgba(255,255,255,.78)" : "rgba(255,255,255,.22)", "center", "600");
  S.btnSkip = { x: sx, y: sy, w: sw, h: sh, ok: hot };

  txt(hot ? "布置完了就跳" : "布完再跳", 14, y0 + 110, 9, "rgba(255,255,255,.22)", "left");
}

function drawNightPanel(y0) {
  txt("守夜 · 别让它们摸到车", 14, y0 + 15, 11, "#ff6b6b", "left", "700");
  var alive = S.mobs.length;
  txt("场上 " + alive + " 只 · 已放倒 " + S.stat.kill, 14, y0 + 33, 9.5, "rgba(255,255,255,.34)", "left", "", "monospace");
  txt("剩余 " + Math.ceil(DAY_NIGHT - S.stageT) + " 秒", W - 14, y0 + 15, 10, "rgba(255,255,255,.42)", "right", "", "monospace");
  drawTurboBtn(W - 14, y0 + 40);
  txt("建筑撑不住会塌 · 明天原地变料堆", 14, y0 + 55, 9, "rgba(255,255,255,.22)", "left");
}

/* ============================ 17. 覆盖层 ============================ */
function drawOverlay() {
  if (!S.over) return;
  ctx.save();
  ctx.fillStyle = "rgba(5,7,11,.965)";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  if (S.won) {
    txt("到 了", W / 2, H * 0.36, 34, "#ffcf7a", "center", "700");
    txt("走完全程 · 第 " + S.day + " 天", W / 2, H * 0.43, 12, "rgba(255,255,255,.6)", "center", "", "monospace");
    txt("救援中心的灯还亮着。", W / 2, H * 0.48, 11, "rgba(255,255,255,.42)", "center");
  } else {
    txt("停 在 这 里", W / 2, H * 0.36, 30, "#ff6b6b", "center", "700");
    txt(S.overReason || "", W / 2, H * 0.43, 11, "rgba(255,255,255,.55)", "center");
    var lpct = Math.floor(clamp(S.totalHouse / HOUSE_TOTAL, 0, 1) * 100);
    txt("走了 " + lpct + "% · 第 " + S.day + " 天", W / 2, H * 0.48, 11, "rgba(255,255,255,.38)", "center", "", "monospace");
  }

  // 统计
  var st = S.stat;
  var lines = [
    "搜刮 " + st.search + " 次      闷囊 " + st.hazard + " 个",
    "放倒 " + st.kill + " 只      料堆 " + st.salvage + " 堆",
    "建造 " + st.built + " 座      图纸 " + (S.bp || 0) + " 张"
  ];
  for (var i = 0; i < lines.length; i++) {
    txt(lines[i], W / 2, H * 0.56 + i * 20, 10, "rgba(255,255,255,.32)", "center", "", "monospace");
  }

  var bw = 130, bh = 40, bx = (W - bw) / 2, by = H * 0.72;
  box(bx, by, bw, bh, "#ffcf7a", "rgba(255,207,122,.10)", 20);
  txt("再 来 一 局", W / 2, by + bh / 2, 12, "#ffcf7a", "center", "700");
  S.btnRestart = { x: bx, y: by, w: bw, h: bh };
}

/* ============================ 18. 渲染主函数 ============================ */
function render() {
  if (cover) {
    ctx.clearRect(0, 0, W, H);
    drawCover();
    return;
  }
  ctx.clearRect(0, 0, W, H);
  drawSky();
  drawRidges();          // 地面田埂：先画，会被路的接地阴影压住外沿
  drawRoad();
  drawCarLight();

  // 黄昏显示可建造格子
  if (S.stage === "dusk") drawGrid();

  // 夜色
  if (S.stage === "night") {
    var ng = ctx.createLinearGradient(0, horizonY, 0, H);
    ng.addColorStop(0, "rgba(30,12,22,.30)");
    ng.addColorStop(1, "rgba(20,6,14,.20)");
    ctx.fillStyle = ng;
    ctx.fillRect(0, 0, W, H);
  }

  // 由远及近画，保证近处盖住远处
  var i;
  if (S.stage === "travel") {
    for (i = ROWS; i >= 1; i--) {
      for (var j = 0; j < S.orbs.length; j++) {
        if (S.orbs[j].v > i - 1 && S.orbs[j].v <= i) drawOrb(S.orbs[j]);
      }
      for (var m = 0; m < S.piles.length; m++) {
        if (S.piles[m].v > i - 1 && S.piles[m].v <= i) drawPile(S.piles[m]);
      }
    }
  }
  for (i = 0; i < S.builds.length; i++) drawBuild(S.builds[i]);
  for (i = 0; i < S.mobs.length; i++) drawMob(S.mobs[i]);
  drawArrows();
  drawCar();
  drawFx();

  drawHUD();
  drawPanel();
  drawOverlay();
}

function drawGrid() {
  for (var col = 0; col < LANES; col++) {
    for (var v = 0; v <= 8; v++) {
      var occupied = false;
      for (var i = 0; i < S.builds.length; i++) {
        var b = S.builds[i];
        if (!b.dead && b.col === col && Math.abs(b.v - v) < 0.55) { occupied = true; break; }
      }
      if (occupied) continue;
      var p = w2s(laneCX(col, v + 0.5), rowY(v + 0.5));
      var u = laneUnit(v + 0.5);
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = "rgba(159,176,200,.55)";
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(p.x - u * 0.34, p.y - u * 0.22, u * 0.68, u * 0.44);
      ctx.stroke();
      ctx.restore();
    }
  }
  txt("布防区 · 前 8 排", W / 2, horizonY + 24, 9, "rgba(159,176,200,.32)", "center", "500");
}

/* ============================ 19. 输入 ============================ */
S = newState();
S.btnBuild = [];
newOrbs();

var dragging = false, dragX = 0, dragCol0 = 2;
var rect = null;
function toLocal(e) {
  var t = (e.touches && e.touches.length) ? e.touches[0]
        : (e.changedTouches && e.changedTouches.length) ? e.changedTouches[0] : e;
  if (IS_WX) return { x: (t.clientX - OX) / SCALE, y: (t.clientY - OY) / SCALE };
  rect = cv.getBoundingClientRect();
  return {
    x: (t.clientX - rect.left) / rect.width * W,
    y: (t.clientY - rect.top) / rect.height * H
  };
}

function onDown(e) {
  if (cover) {
    var pc = toLocal(e);
    if (coverBtn && hit(pc, coverBtn)) startGame();
    return;
  }
  if (S.over) {
    if (S.btnRestart) {
      var p0 = toLocal(e);
      if (hit(p0, S.btnRestart)) { restart(); }
    }
    return;
  }
  var p = toLocal(e);
  rect = cv.getBoundingClientRect();

  // 底部按钮优先
  if (S.stage === "dusk") {
    if (S.btnSkip && S.btnSkip.ok && hit(p, S.btnSkip)) { enterNight(); return; }
    for (var i = 0; i < S.btnBuild.length; i++) {
      if (hit(p, S.btnBuild[i])) { S.buildType = S.btnBuild[i].key; return; }
    }
  }
  if (p.y > baseY + 34 && p.y < baseY + 62 && p.x > W - 62) {
    S.turbo = S.turbo === 1 ? 2 : 1;
    return;
  }

  dragging = true;
  dragX = p.x; dragCol0 = S.carCol;

  // 黄昏：点格子建造
  if (S.stage === "dusk") {
    var c = cellAt(p.x, p.y);
    if (c && c.row >= 0 && c.row <= 8) {
      tryBuild(c.col, c.row);
      dragging = false;
    }
  }
}

function onMove(e) {
  if (!dragging || S.stage !== "travel" || S.over) return;
  var p = toLocal(e);
  var dx = p.x - dragX;
  var col = clamp(dragCol0 + dx / 34, 0, LANES - 1);
  S.carColT = col;
}

function onUp() { dragging = false; }

function hit(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

if (IS_WX) {
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
}

if (!IS_WX && HAS_DOM) window.addEventListener("keydown", function (e) {
  if (S.over && (e.key === "Enter" || e.key === " ")) { restart(); return; }
  if (e.key === "ArrowLeft" || e.key === "a") S.carColT = clamp(S.carColT - 1, 0, LANES - 1);
  if (e.key === "ArrowRight" || e.key === "d") S.carColT = clamp(S.carColT + 1, 0, LANES - 1);
  if (e.key >= "1" && e.key <= "5") S.buildType = BUILD_ORDER[parseInt(e.key, 10) - 1];
  if (e.key === " ") {
    if (S.stage === "dusk") enterNight();
    else S.turbo = S.turbo === 1 ? 2 : 1;
  }
});

function restart() {
  S = newState();
  S.btnBuild = [];
  newOrbs();
  last = 0;
}

/* ============================ 20. 封面 / 存储 / 震动 / 分享 ============================ */
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
GG.YY = {
  S: function () { return S; },
  start: startGame,
  isCover: function () { return cover; },
  restart: restart,
  nextDay: nextDay,
  enterDusk: enterDusk,
  enterNight: enterNight,

  /* 单步推进：调试用，可以精确停在撞击那一帧 */
  tick: function (dt) {
    if (S.stage === "travel") updateTravel(dt);
    else if (S.stage === "dusk") updateDusk(dt);
    else updateNight(dt);
    updateFx(dt);
  },

  /* 自动试玩：不渲染，按固定步长快进，用来验证流程与数值
     mode = "greedy"（见球就撞） / "smart"（缺什么才撞，其余躲开） */
  sim: function (days, mode) {
    mode = mode || "greedy";
    var guard = 0;
    while (S.day <= days && !S.over && guard < 600000) {
      guard++;
      if (S.stage === "travel") {
        var need = mode === "greedy" ||
                   (S.wood < 190 || S.dur < S.durMax * 0.5 || S.fuel < 30);
        var target = null, bd = 99;
        for (var i = 0; i < S.orbs.length; i++) {
          var o = S.orbs[i];
          if (o.searched || o.skipped) continue;
          var d = Math.abs(o.v - S.carV);
          if (d < bd) { bd = d; target = o; }
        }
        if (need && target) {
          S.carColT = target.col;
        } else {
          // 躲：找一条前方 3 户内没球的车道
          var avoid = {};
          for (var j = 0; j < S.orbs.length; j++) {
            var ob = S.orbs[j];
            if (ob.searched || ob.skipped) continue;
            if (ob.v > S.carV - 0.5 && ob.v < S.carV + 3) avoid[ob.col] = 1;
          }
          for (var c = 0; c < LANES; c++) {
            if (!avoid[c]) { S.carColT = c; break; }
          }
        }
        updateTravel(1 / 60);
      } else if (S.stage === "dusk") {
        autoBuild();
        updateDusk(1 / 60);
      } else {
        updateNight(1 / 60);
      }
      updateFx(1 / 60);
    }
    return {
      day: S.day, house: S.totalHouse, wood: Math.round(S.wood),
      fuel: Math.round(S.fuel), dur: Math.round(S.dur),
      over: S.over, won: S.won, stat: S.stat, bp: S.bp
    };
  }
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = { YY: GG.YY };
}

/* 自动布防：卡在车前方 3~7 格，先中路后两侧，最后补满 */
var BUILD_PLAN = (function () {
  return [
    [2, 6, "tower"], [1, 6, "tower"], [3, 6, "tower"],
    [2, 5, "fire"], [1, 5, "fire"], [3, 5, "fire"],
    [0, 6, "tower"], [4, 6, "tower"],
    [2, 4, "fire"], [1, 4, "fire"], [3, 4, "fire"],
    [0, 5, "tower"], [4, 5, "tower"],
    [2, 3, "fire"], [1, 3, "fire"], [3, 3, "fire"],
    [0, 4, "wall"], [4, 4, "wall"],
    [2, 7, "tower"], [1, 7, "tower"], [3, 7, "tower"],
    [0, 7, "tower"], [4, 7, "tower"],
    [2, 2, "fire"], [1, 2, "fire"], [3, 2, "fire"],
    [0, 2, "wall"], [4, 2, "wall"]
  ];
})();

function autoBuild() {
  for (var i = 0; i < BUILD_PLAN.length; i++) {
    var pl = BUILD_PLAN[i];
    var exists = false;
    for (var b = 0; b < S.builds.length; b++) {
      var bb = S.builds[b];
      if (!bb.dead && bb.col === pl[0] && Math.abs(bb.v - pl[1]) < 0.55) { exists = true; break; }
    }
    if (exists) continue;
    if (S.wood < BUILD[pl[2]].wood) return;
    S.buildType = pl[2];
    tryBuild(pl[0], pl[1]);
  }
}
})();
