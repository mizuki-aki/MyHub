/* 永夜微光 v3.0 · 公路探索（竖版 · 15° 斜路 · 5 车道战场 · 平台无关） */
(function (root) {
  "use strict";

  function createGame(env) {
    var ctx = env.ctx;
    var images = env.images || {};
    var W = env.width || 375;
    var H = env.height || 700;
    var FONT = "-apple-system,PingFang SC,Microsoft YaHei,sans-serif";

    /* ================= 0. 工具 ================= */
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function irnd(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
    function pick(a) { return a[(Math.random() * a.length) | 0]; }
    function ease(t) { return t * t * (3 - 2 * t); }

    function roundRect(x, y, w, h, r) {
      r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function ellipseFill(cx, cy, rx, ry, style) {
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, 6.2832);
      else {
        ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx);
        ctx.arc(0, 0, Math.abs(rx), 0, 6.2832); ctx.restore();
      }
      ctx.fillStyle = style;
      ctx.fill();
    }
    function drawSprite(key, cx, cy, h, opt) {
      var img = images[key];
      if (!img || !img.width) return null;
      opt = opt || {};
      var s = h / img.height, w = img.width * s;
      ctx.save();
      if (opt.alpha != null) ctx.globalAlpha = clamp(opt.alpha, 0, 1);
      ctx.drawImage(img, cx - w / 2, cy - h, w, h);
      ctx.restore();
      return { w: w, h: h };
    }
    function txt(s, x, y, size, color, align, weight) {
      ctx.save();
      ctx.font = (weight || "") + " " + size + "px " + FONT;
      ctx.textAlign = align || "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = color;
      ctx.fillText(s, x, y);
      ctx.restore();
    }

    /* ================= 1. 斜投影几何（顺时针 15°） ================= */
    var ROT = 15 * Math.PI / 180;
    var COS = Math.cos(ROT), SIN = Math.sin(ROT);

    var LANES = 5;
    var ROWS = 9;
    var BOT_H = Math.round(H * 0.19);
    var baseY = H - BOT_H;                       // 车 / 阵地底边（未旋转坐标）
    var fieldTop = Math.round(H * 0.155);        // 地平线
    var rowH = (baseY - fieldTop) / ROWS;
    var nearW = W * 0.545;                       // 近端路宽
    var farW = nearW * 0.46;                     // 远端路宽
    var CX = W * 0.5;
    var SHIFT = W * 0.112;                       // 整体左移，抵消旋转后向右上的偏移
    var RCX = W * 0.5, RCY = baseY;              // 旋转中心

    function wAt(v) {
      var t = clamp(v / ROWS, 0, 1);
      return nearW - (nearW - farW) * Math.pow(t, 0.85);
    }
    function rowY(v) { return baseY - v * rowH; }
    function vOfY(y) { return (baseY - y) / rowH; }
    function scaleAt(v) { return clamp(wAt(v) / nearW, 0.5, 1.15); }
    function laneUnit(v) { return wAt(v) / LANES; }
    function leftX(v) { return CX - SHIFT - wAt(v) / 2; }
    function laneCX(col, v) { return leftX(v) + (col + 0.5) * laneUnit(v); }

    // 世界（未旋转屏幕坐标）→ 屏幕
    function w2s(x, y) {
      var dx = x - RCX, dy = y - RCY;
      return { x: RCX + dx * COS - dy * SIN, y: RCY + dx * SIN + dy * COS };
    }
    // 屏幕 → 世界（未旋转）
    function s2w(x, y) {
      var dx = x - RCX, dy = y - RCY;
      return { x: RCX + dx * COS + dy * SIN, y: RCY - dx * SIN + dy * COS };
    }
    function cellAtScreen(sx, sy) {
      var p = s2w(sx, sy);
      var v = vOfY(p.y);
      if (v < -0.3 || v > ROWS) return null;
      var half = wAt(v) / 2;
      var u = p.x - (CX - SHIFT);
      if (u < -half || u > half) return null;
      var col = Math.floor((u + half) / laneUnit(v));
      var row = Math.floor(v);
      if (col < 0 || col >= LANES || row < 0 || row >= ROWS) return null;
      return { col: col, row: row, v: v };
    }

    /* ================= 2. 数值表（v3.0 冻结） ================= */
    var DAY_TRAVEL = 15, DAY_DUSK = 15, DAY_NIGHT = 30;
    var DAY_TOTAL = DAY_TRAVEL + DAY_DUSK + DAY_NIGHT;
    var SHOP_PER_DAY = 8;
    var RESCUE_HOUSES = 800;                     // 救援中心里程（房子数）
    var WIN_DAYS = 100;

    // 碰碰车：前进按「秒/户」，横移按「秒/车道」。两者都随车速等级提升。
    var SPEED_STEP = [0.55, 0.46, 0.38, 0.31, 0.25];        // 前进
    var TURN_STEP  = [0.110, 0.092, 0.076, 0.062, 0.050];   // 横移
    var SPEED_NAME = ["Lv1", "Lv2", "Lv3", "Lv4", "Lv5"];
    var SEARCH_T = 1.40;                                 // 搜刮固定 1.4s（不吃车速升级）
    var SEARCH_BOOST_K = 0.62;                           // 加速药：搜刮时间系数

    // 车宽 / 碰撞盒
    var CAR_W = 1.0;                                     // 车宽 = 1 条车道
    var ORB_R = 0.26;                                    // 悬浮球半径（车道）
    var HIT_AHEAD = 0.25;                                // 球在车前方多少户内触发（车头）
    var HIT_BEHIND = 0.45;                               // 车开过球多远内仍算撞上（擦尾容错）
    var HIT_X = CAR_W * 0.5 + ORB_R + 0.40;              // 横向吸附容差 ≈ 1.16 车道

    var CAR_MAX = 120, CAR_MAX_LV = [120, 140, 160, 180, 200];
    var CAR_HIT = 8;                             // 怪打车扣耐久
    var HEAL_AMT = 40;                           // 治疗药
    var ENERGY_MAX = 100, ENERGY_START = 80;
    var BREAD = 15;                              // 面包 → 能量
    var REGEN = 0.5;                             // 满能量回耐久 /s
    var BOOST_T = 60;

    var BUILD = {
      campfire: { name: "篝火", wood: 10, repair: 2, hp: 180, light: 1, lightDmg: 18, slow: 0.55 },
      tower:    { name: "箭塔", wood: 25, repair: 8, hp: 140, atkCd: 1.0, dmg: 14, range: 4.2 }
    };

    var SHOP_DEF = {
      market:   { name: "超市", en: "MARKET" },
      hospital: { name: "医院", en: "CLINIC" },
      factory:  { name: "工厂", en: "FACTORY" },
      house:    { name: "民房", en: "HOME" }
    };
    var SHOP_MIX = [
      { d: 1, w: { house: 5, market: 3 } },
      { d: 3, w: { house: 4, market: 3, hospital: 1, factory: 1 } },
      { d: 5, w: { house: 3, market: 2, hospital: 2, factory: 2 } },
      { d: 8, w: { house: 2, market: 2, hospital: 3, factory: 3 } }
    ];

    var KINDS = {
      zombie:  { key: "monster/zombie_a",          ai: "melee",  hp: 55,  spd: 0.58, bdmg: 34, cd: 0.95, h: 0.95, hw: 15 },
      zombieB: { key: "monster/zombie_b",          ai: "melee",  hp: 50,  spd: 0.62, bdmg: 32, cd: 0.90, h: 0.93, hw: 15 },
      zombieC: { key: "monster/zombie_c",          ai: "melee",  hp: 68,  spd: 0.52, bdmg: 36, cd: 1.00, h: 1.00, hw: 16 },
      archer:  { key: "monster/skeleton_archer_a", ai: "archer", hp: 40,  spd: 0.50, bdmg: 25, cd: 1.50, h: 0.96, hw: 14, range: 1.5 },
      archerB: { key: "monster/skeleton_archer_b", ai: "archer", hp: 44,  spd: 0.47, bdmg: 25, cd: 1.35, h: 0.98, hw: 14, range: 1.5 },
      slime:   { key: "monster/slime_small",       ai: "slime",  hp: 70,  spd: 0.50, bdmg: 30, cd: 1.20, h: 0.78, hw: 17 },
      slimeB:  { key: "monster/slime_big_a",       ai: "slime",  hp: 88,  spd: 0.44, bdmg: 32, cd: 1.25, h: 0.92, hw: 19 },
      shadow:  { key: "monster/shadow_a",          ai: "shadow", hp: 58,  spd: 0.66, bdmg: 36, cd: 0.90, h: 1.06, hw: 15 }
    };
    var SPAWN_TABLE = [
      { d: 1,  list: ["zombie", "zombieB"] },
      { d: 3,  list: ["zombie", "zombieB", "archer"] },
      { d: 6,  list: ["zombie", "zombieB", "zombieC", "archer"] },
      { d: 9,  list: ["zombie", "zombieB", "zombieC", "archer", "slime"] },
      { d: 13, list: ["zombie", "zombieB", "zombieC", "archer", "archerB", "slime", "shadow"] },
      { d: 17, list: ["zombie", "zombieB", "zombieC", "archer", "archerB", "slime", "slimeB", "shadow"] }
    ];

    /* ================= 3. 状态 ================= */
    var S = {
      day: 1, stage: "travel", stageT: 0, speed: 1,
      wood: 80, energy: ENERGY_START,
      dur: CAR_MAX, durMax: CAR_MAX,
      odometer: 0,
      carV: 0, carCol: 2.5, carColT: 2.5, dragging: false,
      searching: null, searchT: 0, searchMax: 1, missed: 0,
      shops: [], buildings: [], monsters: [], arrows: [], fx: [],
      buildType: "campfire", buildTask: null,
      campfireItem: 0, towerItem: 0, healItem: 0, boostItem: 0, blueprints: 0,
      boostT: 0, pauseUsed: false, pauseT: 0,
      towerLv: 1, speedLv: 1, durLv: 1,
      starved: false, penalty: 0,
      over: false, won: false,
      pendingPick: false, pickCards: [],
      dayLoot: null,
      godMode: false, spawnTimer: 0, stat: { search: 0, kill: 0, boom: 0, tp: 0 },
      seed: 1
    };
    var last = env.now ? env.now() : Date.now();

    function rand() { S.seed = (S.seed * 1103515245 + 12345) & 0x7fffffff; return S.seed / 0x7fffffff; }

    /* ================= 4. 特效 ================= */
    function addFxW(kind, x0, y0, r, dur, msg) {
      var pp = w2s(x0, y0);
      addFx(kind, pp.x, pp.y, r, dur, msg);
    }
    function addFx(kind, x, y, r, dur, msg) {
      S.fx.push({ kind: kind, x: x, y: y, r: r || 30, t: 0, dur: dur || 0.5, msg: msg });
    }

    /* ================= 5. 路段生成 ================= */
    function shopMixFor(d) {
      var w = SHOP_MIX[0].w;
      for (var i = 0; i < SHOP_MIX.length; i++) if (d >= SHOP_MIX[i].d) w = SHOP_MIX[i].w;
      return w;
    }
    function pickShopType(d) {
      var w = shopMixFor(d), total = 0, k;
      for (k in w) total += w[k];
      var r = rand() * total;
      for (k in w) { r -= w[k]; if (r <= 0) return k; }
      return "house";
    }
    function rollLoot(type, day) {
      var o = { wood: 0, energy: 0, campfire: 0, tower: 0, heal: 0, boost: 0, blueprint: 0 };
      var mb = 1 + Math.min(0.40, (day - 1) * 0.01);
      if (type === "market") {
        o.wood = Math.round(irnd(12, 19) * mb);
        if (rand() < 0.55) o.energy = 1;
        if (rand() < 0.34) o.campfire = 1;
        if (rand() < 0.10) o.boost = 1;
      } else if (type === "hospital") {
        o.wood = Math.round(irnd(12, 19) * mb);
        if (rand() < 0.60) o.energy = 1;
        if (rand() < 0.55) o.heal = 1;
        if (rand() < 0.16) o.blueprint = 1;
      } else if (type === "factory") {
        o.wood = Math.round(irnd(24, 38) * mb);
        if (rand() < 0.22) o.campfire = 1;
        if (rand() < 0.26) o.tower = 1;
        if (rand() < 0.20) o.blueprint = 1;
      } else {
        o.wood = Math.round(irnd(12, 19) * mb);
        o.energy = irnd(5, 8);
      }
      return o;
    }
    function newDayShops() {
      S.shops = [];
      for (var i = 0; i < SHOP_PER_DAY; i++) {
        // 远端固定是工厂（高木），第 6 位固定超市 —— 想拿好货就得开到最后
        var t;
        if (i >= SHOP_PER_DAY - 2) t = "factory";
        else if (i === SHOP_PER_DAY - 3) t = "market";
        else t = pickShopType(S.day);
        S.shops.push({
          idx: i,
          // 悬浮球只挂在最外侧两条车道，「左左右右」成对分布
          col: (Math.floor(i / 2) % 2 === 0) ? 0 : LANES - 1,
          v: i + 1,
          type: t, searched: false, missed: false, loot: null, flash: 0
        });
      }
    }

    /* ================= 6. 阶段流转 ================= */
    function enterDusk(extra) {
      var reached = Math.floor(S.carV);
      if (S.energy <= 0 && S.carV < SHOP_PER_DAY) S.starved = true;
      S.odometer += reached;                     // 只有真正开过的路才计入里程
      S.stage = "dusk";
      S.stageT = -(extra || 0);                  // 负值 = 白天结余并入
      S.carV = 0;
      S.dragging = false;
      S.searching = null;
      S.shops = [];
      S.pauseUsed = false;
      S.pauseT = 0;
      addFx("text", W * 0.5, H * 0.42, 0, 1.2, "扎营 · 布防");
    }
    function enterNight() {
      S.stage = "night";
      S.stageT = 0;
      S.spawnTimer = 0.8;
      S.buildTask = null;
      S.penalty = S.starved ? 0.20 : 0;
      if (S.pauseT > 0) S.pauseT = 0;
    }
    function nextDay() {
      if (S.odometer >= RESCUE_HOUSES) { S.over = true; S.won = true; return; }
      if (S.day >= WIN_DAYS) { S.over = true; S.won = true; return; }
      S.day++;
      S.stage = "travel";
      S.stageT = 0;
      S.carV = 0; S.carCol = LANES / 2; S.carColT = LANES / 2;
      S.dragging = false; S.searching = null; S.missed = 0;
      S.buildings = []; S.monsters = []; S.arrows = []; S.fx = [];
      S.starved = false;
      S.dayLoot = null;
      newDayShops();
      if (S.energy <= 0) S.starved = true;
    }

    /* ================= 7. 白天：碰碰车行进 + 撞球搜刮 ================= */
    function posTime() { return SPEED_STEP[clamp(S.speedLv - 1, 0, 4)]; }
    function turnTime() { return TURN_STEP[clamp(S.speedLv - 1, 0, 4)]; }
    function searchTime() { return SEARCH_T * (S.boostT > 0 ? SEARCH_BOOST_K : 1); }
    function carColMin() { return CAR_W / 2; }
    function carColMax() { return LANES - CAR_W / 2; }
    // 相机跟车：车在屏幕上的纵深固定为 CAR_V0，其余物体按「相对纵深」叠加
    var CAR_V0 = 0.30;
    function carAnchor() {
      return { v: CAR_V0, x: leftX(CAR_V0) + S.carCol * laneUnit(CAR_V0), y: rowY(CAR_V0) };
    }

    function lootLabel(o) {
      var parts = [];
      if (o.wood) parts.push("+" + o.wood + "木");
      if (o.energy) parts.push("+" + o.energy + "面");
      if (o.campfire) parts.push("+篝火");
      if (o.tower) parts.push("+箭塔");
      if (o.heal) parts.push("+药");
      if (o.boost) parts.push("+加速");
      if (o.blueprint) parts.push("+图纸");
      return parts.join(" ");
    }
    function applyLoot(o) {
      S.wood = Math.min(400, S.wood + o.wood);
      S.energy = Math.min(ENERGY_MAX, S.energy + o.energy * BREAD);
      S.campfireItem += o.campfire;
      S.towerItem += o.tower;
      S.healItem += o.heal;
      S.boostItem += o.boost;
      S.blueprints += o.blueprint;
      if (o.blueprint) makePickCards();
      if (o.heal) {
        S.dur = Math.min(S.durMax, S.dur + HEAL_AMT);
      }
      dayLootPush(o);
    }
    function dayLootPush(o) {
      if (!S.dayLoot) S.dayLoot = { wood: 0, energy: 0, item: 0 };
      S.dayLoot.wood += o.wood;
      S.dayLoot.energy += o.energy;
      S.dayLoot.item += o.campfire + o.tower + o.heal + o.boost + o.blueprint;
    }

    /* 横向转向：以 turnTime() 的速度向目标车道滑，制造「车有惯性」的手感 */
    function turnToward(dt) {
      var d = S.carColT - S.carCol;
      var stepMax = dt / turnTime();
      if (Math.abs(d) <= stepMax) S.carCol = S.carColT;
      else S.carCol += (d > 0 ? 1 : -1) * stepMax;
      S.carCol = clamp(S.carCol, carColMin(), carColMax());
    }

    /* 碰撞：纵向在车头前 0.1 户 ~ 车尾后 0.5 户之间，横向 1.2 车道内 */
    function hitOrb(s) {
      var dv = s.v - S.carV;
      if (dv > HIT_AHEAD || dv < -HIT_BEHIND) return null;
      var dx = Math.abs(S.carCol - (s.col + 0.5));
      if (dx > HIT_X) return null;
      return s;
    }

    function updateTravel(dt) {
      // 搜刮中：车与球全冻结，但 15s 倒计时照走
      if (S.searching) {
        S.searchT -= dt;
        S.searching.flash = 1;
        if (S.searchT <= 0) {
          var s = S.searching;
          s.searched = true;
          s.loot = rollLoot(s.type, S.day);
          applyLoot(s.loot);
          var a = orbAnchor(s);
          var p = w2s(a.x, a.y);
          addFx("loot", p.x, p.y - 46, 26, 0.9, lootLabel(s.loot));
          S.stat.search++;
          S.searching = null;
        }
        return;
      }
      if (S.starved) return;

      turnToward(dt);

      // 撞球判定（同一帧可能连撞两个，间隔太小不会发生，取最近的）
      var near = null, nearD = 9;
      for (var i = 0; i < S.shops.length; i++) {
        var sh = S.shops[i];
        if (sh.searched || sh.missed) continue;
        if (hitOrb(sh)) {
          var dd = Math.abs(sh.v - S.carV);
          if (dd < nearD) { nearD = dd; near = sh; }
        }
        if (sh.v - S.carV < -HIT_BEHIND && !sh.searched) { sh.missed = true; S.missed++; }
      }
      if (near) {
        S.searching = near;
        S.searchT = searchTime();
        S.searchMax = S.searchT;
        near.flash = 1;
        return;
      }

      if (S.carV >= SHOP_PER_DAY) { finishTravel(); return; }

      var step = dt / posTime();
      var before = Math.floor(S.carV);
      S.carV = Math.min(SHOP_PER_DAY, S.carV + step);
      var after = Math.floor(S.carV);
      if (after > before) {
        var cost = after - before;
        if (S.energy < cost) {
          S.carV = before + Math.max(0, S.energy);
          S.energy = 0;
          S.starved = true;
        } else S.energy -= cost;
      }
      if (S.carV >= SHOP_PER_DAY) finishTravel();
    }
    function finishTravel() {
      var extra = Math.max(0, DAY_TRAVEL - S.stageT);
      if (S.energy <= 0) S.starved = true;
      enterDusk(extra);
    }

    /* ================= 8. 黄昏 / 夜晚 ================= */
    // 扎营时车队横过来封路 —— 车自动滑回中路
    function recenterCar(dt) {
      S.carColT = LANES / 2;
      var d = LANES / 2 - S.carCol;
      if (Math.abs(d) < 0.004) { S.carCol = LANES / 2; return; }
      S.carCol += d * Math.min(1, dt * 5);
    }
    function updateDusk(dt) {
      if (S.pauseT > 0) { S.pauseT -= dt; return; }
      recenterCar(dt);
      S.stageT += dt;
      if (S.stageT >= DAY_DUSK) enterNight();
    }
    function updateNight(dt) {
      S.stageT += dt;
      if (S.boostT > 0) S.boostT -= dt;
      recenterCar(dt);

      // 满能量缓慢回耐久
      if (S.energy >= ENERGY_MAX && S.dur < S.durMax) S.dur = Math.min(S.durMax, S.dur + REGEN * dt);

      // 刷怪
      S.spawnTimer -= dt;
      var cap = Math.min(18, 4 + Math.floor(S.day * 0.55));
      if (S.spawnTimer <= 0 && S.monsters.length < cap) {
        S.spawnTimer = Math.max(4.0, 9.2 - S.day * 0.30) * (1 - S.penalty * 0.12);
        spawnMonster();
      }

      updateMonsters(dt);
      updateBuildings(dt);
      updateArrows(dt);

      if (S.buildTask) {
        S.buildTask.t -= dt;
        if (S.buildTask.t <= 0) {
          if (S.buildTask.rep) {
            var rb = S.buildTask.rep;
            rb.wreck = false; rb.hp = rb.maxhp; rb.grow = 0;
            addFxW("dust", laneCX(rb.col, rb.row + 0.5), rowY(rb.row + 0.5), 18, 0.4);
          } else commitBuild(S.buildTask);
          S.buildTask = null;
        }
      }

      for (var f = 0; f < S.fx.length; f++) S.fx[f].t += dt;
      S.fx = S.fx.filter(function (o) { return o.t < o.dur; });

      if (S.stageT >= DAY_NIGHT) {
        // 天亮了
        for (var i = 0; i < S.monsters.length; i++) S.monsters[i].flee = true;
        S.monsters = [];
        S.arrows = [];
        nextDay();
      }
    }

    /* ================= 9. 怪物 ================= */
    function spawnTableFor(d) {
      var list = SPAWN_TABLE[0].list;
      for (var i = 0; i < SPAWN_TABLE.length; i++) if (d >= SPAWN_TABLE[i].d) list = SPAWN_TABLE[i].list;
      return list;
    }
    function spawnMonster(forceId, forceCol) {
      var list = spawnTableFor(S.day);
      var id = forceId || list[(rand() * list.length) | 0];
      var K = KINDS[id];
      var col = forceCol != null ? forceCol : ((rand() * LANES) | 0);
      var hpMul = (1 + (S.day - 1) * 0.06) * (1 + S.penalty);
      S.monsters.push({
        id: id, key: K.key, ai: K.ai, col: col, v: ROWS + 0.35,
        hp: K.hp * hpMul, maxhp: K.hp * hpMul,
        spd: K.spd * (1 + (S.day - 1) * 0.012),
        bdmg: K.bdmg * (1 + (S.day - 1) * 0.045) * (1 + S.penalty),
        cd: K.cd, atk: K.cd * 0.5, range: K.range || 0,
        h: laneUnit(2) * K.h * 1.36, hw: K.hw * (laneUnit(2) / 41),
        alpha: 0, dead: false, flee: false,
        fly: K.ai === "slime", flyT: 0, flyDur: 1.6, arc: 0, toV: 0,
        fuse: null, tpCd: 0, hitFlash: 0, bob: rand() * 6, moving: true,
        lit: false
      });
    }
    function targetAt(col, v) {
      var best = null;
      for (var i = 0; i < S.buildings.length; i++) {
        var b = S.buildings[i];
        if (b.hp <= 0 || b.col !== col) continue;
        if (b.row < v - 0.05 && (!best || b.row > best.row)) best = b;
      }
      return best;
    }
    function slimeLandRow(col) {
      var first = null;
      for (var i = 0; i < S.buildings.length; i++) {
        var b = S.buildings[i];
        if (b.hp <= 0 || b.col !== col) continue;
        if (!first || b.row < first.row) first = b;
      }
      if (!first) return 0.4;
      return Math.max(0.4, first.row - 1);
    }

    function hurtBuilding(b, dmg) {
      b.hp -= dmg;
      b.hitFlash = 0.16;
      if (b.hp <= 0) {
        b.hp = 0;
        b.wreck = true;
        addFxW("dust", bx(b), rowY(b.row), 24, 0.5);
      }
    }
    function bx(b) { return laneCX(b.col, b.row + 0.5); }

    function updateMonsters(dt) {
      for (var i = 0; i < S.monsters.length; i++) {
        var m = S.monsters[i];
        if (m.dead) { m.alpha -= dt * 2.4; continue; }
        m.alpha = Math.min(1, m.alpha + dt * 2.4);
        if (m.hitFlash > 0) m.hitFlash -= dt;
        m.atk -= dt;
        if (m.tpCd > 0) m.tpCd -= dt;

        if (m.fly) {
          m.flyT += dt;
          var p = Math.min(1, m.flyT / m.flyDur);
          m.v = (ROWS + 0.35) + (m.toV - (ROWS + 0.35)) * p;
          m.arc = -Math.sin(Math.PI * p) * rowH * 1.5;
          if (p >= 1) { m.fly = false; m.arc = 0; m.fuse = 2.2; addFxW("dust", laneCX(m.col, m.v), rowY(m.v), 20, 0.4); }
          continue;
        }

        // 光照判定（篝火十字 5 格）
        m.lit = !S.godMode && litAt(m.col, Math.round(m.v));
        if (m.lit) {
          m.hp -= dt * BUILD.campfire.lightDmg;
          if (m.hp <= 0) { killMonster(m); continue; }
        }
        if (m.fuse != null) {
          m.fuse -= dt;
          if (m.fuse <= 0) killMonster(m);
          m.moving = false;
          continue;                                    // 引信期间原地待爆
        }

        var tg = targetAt(m.col, m.v);
        var stopV;
        if (tg) stopV = m.ai === "archer" ? tg.row + 0.5 + m.range : tg.row + 0.5 + 0.42;
        else stopV = 0.30;

        // 同车道排队
        var ahead = 0;
        for (var z = 0; z < S.monsters.length; z++) {
          var o = S.monsters[z];
          if (o === m || o.dead || o.fly || o.col !== m.col) continue;
          if (o.v < m.v && o.v > stopV - 0.9) ahead++;
        }
        var slot = stopV + ahead * 0.30;

        if (m.v > slot + 0.02) {
          var slow = m.lit ? BUILD.campfire.slow : 1;
          m.v -= m.spd * slow * dt;
          if (m.v < slot) m.v = slot;
          m.moving = true;
        } else {
          m.moving = false;
          if (m.ai === "shadow" && tg && !tg.wreck && m.tpCd <= 0) {
            m.v = Math.max(0.25, tg.row - 0.75);
            m.tpCd = 5.0;
            S.stat.tp++;
            addFxW("tp", bx(tg), rowY(tg.row + 0.5), 28, 0.45);
            continue;
          }
          if (m.atk <= 0) {
            m.atk = m.cd;
            if (m.ai === "archer") {
              fireArrow(laneCX(m.col, m.v), rowY(m.v) - m.h * 0.55, laneCX(m.col, tg ? tg.row + 0.5 : 0.3), rowY(tg ? tg.row + 0.5 : 0.3), m.bdmg, true, tg || null, 360);
            } else if (tg) {
              hurtBuilding(tg, m.bdmg * (m.lit ? 0.9 : 1));
              addFxW("hit", bx(tg), rowY(tg.row + 0.5) - 6, 12, 0.22);
            } else {
              hurtCar(CAR_HIT * (1 + (S.day - 1) * 0.035));
              m.atk = 1.6;
            }
          }
        }
      }
    }

    function killMonster(m) {
      if (m.dead) return;
      m.dead = true;
      m.hp = 0;
      S.stat.kill++;
      if (m.ai === "slime") {
        S.stat.boom++;
        var R = laneUnit(2) * 1.7;
        var cx = laneCX(m.col, m.v), cy = rowY(m.v) - 6;
        addFxW("boom", cx, cy, R, 0.55);
        for (var i = 0; i < S.buildings.length; i++) {
          var b = S.buildings[i];
          if (b.hp <= 0) continue;
          var dx = bx(b) - cx, dy = rowY(b.row + 0.5) - cy;
          if (dx * dx + dy * dy < R * R) hurtBuilding(b, 26);
        }
        if (m.v < 1.2) hurtCar(14);
      } else {
        addFxW("dust", laneCX(m.col, m.v), rowY(m.v) - 6, 18, 0.35);
      }
    }

    function hurtCar(dmg) {
      if (S.over) return;
      S.dur = Math.max(0, S.dur - dmg);
      addFx("hit", W * 0.5, baseY - 16, 14, 0.25);
      if (S.dur <= 0 && !S.over) { S.over = true; S.won = false; }
    }

    /* ================= 10. 建筑 ================= */
    function buildingAt(col, row) {
      for (var i = 0; i < S.buildings.length; i++) {
        var b = S.buildings[i];
        if (b.col === col && b.row === row && b.hp > 0) return b;
      }
      return null;
    }
    function litAt(col, row) {
      for (var i = 0; i < S.buildings.length; i++) {
        var b = S.buildings[i];
        if (b.hp <= 0 || !BUILD[b.type].light) continue;
        if (Math.abs(b.col - col) + Math.abs(b.row - row) <= 1) return true;
      }
      return false;
    }
    function buildCost(type) {
      if (type === "campfire" && S.campfireItem > 0) return 0;
      if (type === "tower" && S.towerItem > 0) return 0;
      return BUILD[type].wood;
    }
    function payBuild(type) {
      if (type === "campfire" && S.campfireItem > 0) { S.campfireItem--; return true; }
      if (type === "tower" && S.towerItem > 0) { S.towerItem--; return true; }
      var c = BUILD[type].wood;
      if (S.wood < c) return false;
      S.wood -= c;
      return true;
    }
    function commitBuild(tk) {
      S.buildings.push({
        col: tk.col, row: tk.row, type: tk.type,
        hp: BUILD[tk.type].hp, maxhp: BUILD[tk.type].hp,
        atk: 0.4, ph: rand() * 6, hitFlash: 0, grow: 0, wreck: false
      });
      addFxW("dust", laneCX(tk.col, tk.row + 0.5), rowY(tk.row + 0.5), 20, 0.4);
    }
    function tryBuild(col, row) {
      if (S.stage !== "dusk" && S.stage !== "night") return false;
      if (col < 0 || col >= LANES || row < 0 || row >= ROWS) return false;
      if (S.stage === "night" && S.buildTask) return false;

      var exist = null;
      for (var i = 0; i < S.buildings.length; i++) {
        var b = S.buildings[i];
        if (b.col === col && b.row === row) { exist = b; break; }
      }
      if (exist && (exist.wreck || exist.hp < exist.maxhp)) {
        var cost = BUILD[exist.type].repair;
        if (S.wood < cost) { addFxW("text", laneCX(col, row), rowY(row), 0, 0.9, "木头不足"); return false; }
        S.wood -= cost;
        if (S.stage === "night") {
          S.buildTask = { rep: exist, col: col, row: row, type: exist.type, t: S.boostT > 0 ? 0.5 : 1.0 };
        } else {
          exist.wreck = false; exist.hp = exist.maxhp; exist.grow = 0;
          addFxW("dust", laneCX(col, row), rowY(row), 18, 0.4);
        }
        return true;
      }
      if (exist) return false;

      if (buildCost(S.buildType) > S.wood && !(S.buildType === "campfire" && S.campfireItem) && !(S.buildType === "tower" && S.towerItem)) {
        addFxW("text", laneCX(col, row), rowY(row), 0, 0.9, "木头不足");
        return false;
      }
      if (!payBuild(S.buildType)) {
        addFxW("text", laneCX(col, row), rowY(row), 0, 0.9, "木头不足");
        return false;
      }
      var tk = { col: col, row: row, type: S.buildType };
      if (S.stage === "night") {
        S.buildTask = { col: col, row: row, type: S.buildType, t: S.boostT > 0 ? 0.5 : 1.0 };
      } else {
        commitBuild(tk);
      }
      return true;
    }

    function updateBuildings(dt) {
      for (var i = 0; i < S.buildings.length; i++) {
        var b = S.buildings[i];
        if (b.hitFlash > 0) b.hitFlash -= dt;
        if (b.grow < 1) b.grow = Math.min(1, b.grow + dt * 5);
        b.ph += dt;
        if (b.wreck || !BUILD[b.type].dmg) continue;
        var def = BUILD[b.type];
        b.atk -= dt;
        if (b.atk > 0) continue;
        var bestM = null, bestD = 1e9;
        for (var k = 0; k < S.monsters.length; k++) {
          var mm = S.monsters[k];
          if (mm.dead || mm.fly) continue;
          if (Math.abs(mm.col - b.col) > 1) continue;          // 覆盖本车道 + 左右各一条
          var dv2 = mm.v - (b.row + 0.5);
          if (dv2 <= 0 || dv2 > def.range) continue;
          var dist = dv2 + Math.abs(mm.col - b.col) * 0.8;
          if (dist < bestD) { bestD = dist; bestM = mm; }
        }
        if (bestM) {
          b.atk = def.atkCd;
          fireArrow(bx(b), rowY(b.row + 0.5) - laneUnit(b.row) * 1.1, laneCX(bestM.col, bestM.v), rowY(bestM.v) - bestM.h * 0.45, def.dmg * (1 + (S.towerLv - 1) * 0.2), false, bestM, 420);
        }
      }
    }

    function fireArrow(x0, y0, x1, y1, dmg, foe, tg, spd) {
      var len = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
      S.arrows.push({
        x: x0, y: y0, x0: x0, y0: y0, tx: x1, ty: y1,
        prog: 0, len: len, spd: spd, dmg: dmg, foe: foe, tg: tg
      });
    }

    function updateArrows(dt) {
      for (var a = 0; a < S.arrows.length; a++) {
        var ar = S.arrows[a];
        ar.prog += ar.spd * dt / ar.len;
        if (ar.prog >= 1) {
          if (ar.foe) {
            if (ar.tg && ar.tg.hp > 0) hurtBuilding(ar.tg, ar.dmg);
            else hurtCar(ar.dmg * 0.45);
          } else {
            if (ar.tg && !ar.tg.dead) {
              ar.tg.hp -= ar.dmg; ar.tg.hitFlash = 0.12;
              if (ar.tg.hp <= 0) killMonster(ar.tg);
            }
          }
          addFxW("hit", ar.tx, ar.ty, 8, 0.2);
          ar.hit = true;
        } else {
          ar.x = ar.x0 + (ar.tx - ar.x0) * ar.prog;
          ar.y = ar.y0 + (ar.ty - ar.y0) * ar.prog;
        }
      }
      S.arrows = S.arrows.filter(function (o) { return !o.hit; });
      S.monsters = S.monsters.filter(function (o) { return !(o.dead && o.alpha <= 0); });
    }

    /* ================= 11. 图纸升级 ================= */
    function makePickCards() {
      var pool = [
        { id: "tower", name: "箭塔伤害 +20%", desc: "当前 " + SPEED_NAME[0].replace("Lv", "Lv") + " → 更强", lv: S.towerLv },
        { id: "speed", name: "车速提升一级", desc: "跨侧 / 同侧耗时缩短", lv: S.speedLv },
        { id: "dur", name: "车耐久上限 +20", desc: "并立即修复 20 点", lv: S.durLv }
      ];
      pool[0].desc = "Lv" + S.towerLv + " → Lv" + Math.min(5, S.towerLv + 1);
      pool[1].desc = SPEED_NAME[S.speedLv - 1] + " → " + SPEED_NAME[Math.min(4, S.speedLv)];
      pool[2].desc = "Lv" + S.durLv + " → Lv" + Math.min(5, S.durLv + 1);
      S.pickCards = pool;
      S.pendingPick = true;
    }
    function applyPick(id) {
      if (id === "tower") { S.towerLv = Math.min(5, S.towerLv + 1); }
      else if (id === "speed") { S.speedLv = Math.min(5, S.speedLv + 1); }
      else if (id === "dur") {
        S.durLv = Math.min(5, S.durLv + 1);
        S.durMax = CAR_MAX_LV[S.durLv - 1];
        S.dur = Math.min(S.durMax, S.dur + 20);
      }
      S.blueprints--;
      S.pendingPick = false;
      if (S.blueprints > 0) makePickCards();
    }

    /* ================= 12. 主更新 ================= */
    function update(dt) {
      if (S.over) return;
      if (S.pendingPick) { updateFxOnly(dt); return; }
      if (S.stage === "travel") {
        S.stageT += dt;
        updateTravel(dt);
        // 时间到：正在进行的搜刮先让它做完，再收摊
        if (S.stage === "travel" && S.stageT >= DAY_TRAVEL && !S.searching) finishTravel();
      }
      else if (S.stage === "dusk") updateDusk(dt);
      else if (S.stage === "night") updateNight(dt);
      if (S.boostT > 0 && S.stage !== "night") S.boostT -= dt;
      for (var i = 0; i < S.shops.length; i++) if (S.shops[i].flash > 0) S.shops[i].flash -= dt;
    }
    function updateFxOnly(dt) {
      for (var f = 0; f < S.fx.length; f++) S.fx[f].t += dt;
      S.fx = S.fx.filter(function (o) { return o.t < o.dur; });
    }

    /* ================= 13. 渲染 ================= */
    function darkFactor() {
      if (S.stage === "travel") return 0;
      if (S.stage === "dusk") {
        var t = clamp(S.stageT / DAY_DUSK, 0, 1);
        return ease(t) * 0.56;
      }
      if (S.stage === "night") {
        var u = S.stageT / DAY_NIGHT;
        if (u > 0.88) return 0.56 * (1 - (u - 0.88) / 0.12);
        return 0.56;
      }
      return 0;
    }

    function drawSky(dark) {
      var g = ctx.createLinearGradient(0, 0, 0, fieldTop + rowH);
      if (dark < 0.05) {
        g.addColorStop(0, "#9db8c4"); g.addColorStop(0.6, "#c3d2c4"); g.addColorStop(1, "#cdd8c0");
      } else {
        g.addColorStop(0, "#0a0f1c"); g.addColorStop(0.6, "#141c2c"); g.addColorStop(1, "#20262c");
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, fieldTop + rowH * 1.5);

      // 星
      if (dark > 0.2) {
        var seed = 977;
        for (var i = 0; i < 26; i++) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          var sx = (seed / 0x7fffffff) * W;
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          var sy = 6 + (seed / 0x7fffffff) * (fieldTop * 0.55);
          ctx.globalAlpha = dark * (0.25 + 0.5 * Math.abs(Math.sin(S.stageT * 1.1 + i)));
          ctx.fillStyle = "#e8eeff";
          ctx.beginPath(); ctx.arc(sx, sy, 1, 0, 6.2832); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // 太阳 / 月亮
      var mx = W * 0.14, my = fieldTop * 0.55;
      if (dark > 0.5) {
        ctx.fillStyle = "rgba(232,240,255,.9)";
        ctx.beginPath(); ctx.arc(mx, my, 13, 0, 6.2832); ctx.fill();
        ctx.fillStyle = dark > 0.55 ? "#0a0f1c" : "rgba(10,15,28,.85)";
        ctx.beginPath(); ctx.arc(mx + 5, my - 4, 11, 0, 6.2832); ctx.fill();
      } else {
        var sg = ctx.createRadialGradient(mx, my, 2, mx, my, 54);
        sg.addColorStop(0, "rgba(255,240,200,.9)");
        sg.addColorStop(1, "rgba(255,240,200,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(mx - 60, my - 60, 120, 120);
      }

      // 远景枯树剪影
      for (var L = 0; L < 2; L++) {
        var by = fieldTop + 4 - L * 5;
        ctx.fillStyle = "rgba(24,30,26," + (dark > 0.05 ? 0.55 + dark * 0.45 : 0.30 + L * 0.14) + ")";
        ctx.beginPath();
        ctx.moveTo(0, by);
        for (var x = 0; x <= W + 12; x += 11) {
          var hh = 9 + Math.sin(x * 0.085 + L * 2.1) * 6 + Math.sin(x * 0.029) * 8;
          ctx.lineTo(x, by - hh);
        }
        ctx.lineTo(W, by); ctx.closePath(); ctx.fill();
      }
    }

    function drawRoad(dark) {
      // 路外荒地：整块旋转大平面（左上角留出天空）
      var yFar = rowY(ROWS + 0.06);
      var A0 = w2s(-W * 0.85, rowY(-3.2)), B0 = w2s(W * 1.85, rowY(-3.2));
      var C0 = w2s(W * 1.85, yFar), D0 = w2s(-W * 0.85, yFar);
      ctx.fillStyle = dark > 0.05 ? "#1b1a13" : "#4b4636";
      ctx.beginPath();
      ctx.moveTo(A0.x, A0.y); ctx.lineTo(B0.x, B0.y); ctx.lineTo(C0.x, C0.y); ctx.lineTo(D0.x, D0.y);
      ctx.closePath(); ctx.fill();

      // 路肩带宽一点的浅土
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        var q0 = w2s(CX - SHIFT + s2 * (nearW / 2 + laneUnit(0) * 0.04), rowY(0));
        var q1 = w2s(CX - SHIFT + s2 * (farW / 2 + laneUnit(ROWS) * 0.04), rowY(ROWS));
        var q2 = w2s(CX - SHIFT + s2 * (farW / 2 + laneUnit(ROWS) * 0.62), rowY(ROWS));
        var q3 = w2s(CX - SHIFT + s2 * (nearW / 2 + laneUnit(0) * 0.62), rowY(0));
        ctx.fillStyle = dark > 0.05 ? "#26251b" : "#6d6450";
        ctx.beginPath();
        ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q3.x, q3.y);
        ctx.closePath(); ctx.fill();
      }

      // 路面：逐行四边形
      for (var r = ROWS; r >= 1; r--) {
        var v0 = r, v1 = r - 1;
        var y0 = rowY(v0), y1 = rowY(v1);
        var w0 = wAt(v0), w1 = wAt(v1);
        var A = w2s(CX - SHIFT - w0 / 2, y0), B = w2s(CX - SHIFT + w0 / 2, y0);
        var C2 = w2s(CX - SHIFT + w1 / 2, y1), D = w2s(CX - SHIFT - w1 / 2, y1);
        ctx.fillStyle = ((r % 2 === 0) ? (dark > 0.05 ? "#2b2b32" : "#42434a") : (dark > 0.05 ? "#27272e" : "#3c3d44"));
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C2.x, C2.y); ctx.lineTo(D.x, D.y);
        ctx.closePath(); ctx.fill();
      }

      // 车道虚线
      ctx.save();
      ctx.strokeStyle = "rgba(232,226,196," + (dark > 0.05 ? 0.26 : 0.50) + ")";
      ctx.lineWidth = 2;
      for (var c = 1; c < LANES; c++) {
        for (var r2 = 0; r2 < ROWS; r2++) {
          var va = r2 + 0.62, vb = r2 + 0.98;
          var xa = laneCX(c - 0.5, va), xb = laneCX(c - 0.5, vb);
          var pa = w2s(xa, rowY(va)), pb = w2s(xb, rowY(vb));
          ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        }
      }
      // 路缘实线
      ctx.strokeStyle = "rgba(236,230,204," + (dark > 0.05 ? 0.20 : 0.36) + ")";
      ctx.lineWidth = 2.5;
      for (var side = -1; side <= 1; side += 2) {
        var p0 = w2s(CX - SHIFT + side * nearW / 2, rowY(0));
        var p1 = w2s(CX - SHIFT + side * farW / 2, rowY(ROWS));
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      }
      ctx.restore();

      // 远景雾带：6 层递减模拟渐变，贴地平线最浓
      for (var fb = 0; fb < 6; fb++) {
        var yT = rowY(ROWS + 0.10 - fb * 0.30);
        var yB = rowY(ROWS + 0.10 - (fb + 1) * 0.30);
        var fa = (0.26 - fb * 0.042);
        if (fa <= 0) continue;
        var f1 = w2s(CX - SHIFT - nearW * 0.95, yT), f2 = w2s(CX - SHIFT + nearW * 0.95, yT);
        var f3 = w2s(CX - SHIFT + nearW * 0.95, yB), f4 = w2s(CX - SHIFT - nearW * 0.95, yB);
        ctx.fillStyle = dark > 0.05 ? "rgba(28,36,58," + fa + ")" : "rgba(206,214,198," + fa + ")";
        ctx.beginPath();
        ctx.moveTo(f1.x, f1.y); ctx.lineTo(f2.x, f2.y); ctx.lineTo(f3.x, f3.y); ctx.lineTo(f4.x, f4.y);
        ctx.closePath(); ctx.fill();
      }
    }

    /* ---- 布防网格：只在能造东西的时候浮现，行进时完全隐藏 ---- */
    function drawCellGrid() {
      var a = S.stage === "dusk" ? 0.17 : (S.stage === "night" ? 0.085 : 0);
      if (a <= 0.001) return;
      ctx.save();
      ctx.strokeStyle = "rgba(206,226,255," + a + ")";
      ctx.lineWidth = 1;
      for (var r = 0; r < ROWS; r++) {
        var y0 = rowY(r), y1 = rowY(r + 1);
        var lu0 = laneUnit(r), lu1 = laneUnit(r + 1);
        var x0 = leftX(r), x1 = leftX(r + 1);
        var ka = r <= 5 ? 1 : (r === 6 ? 0.7 : 0.45);
        ctx.strokeStyle = "rgba(206,226,255," + (a * ka) + ")";
        for (var c = 0; c < LANES; c++) {
          var pA = w2s(x0 + c * lu0, y0), pB = w2s(x0 + (c + 1) * lu0, y0);
          var pC = w2s(x1 + (c + 1) * lu1, y1), pD = w2s(x1 + c * lu1, y1);
          ctx.beginPath();
          ctx.moveTo(pA.x, pA.y); ctx.lineTo(pB.x, pB.y);
          ctx.lineTo(pC.x, pC.y); ctx.lineTo(pD.x, pD.y);
          ctx.closePath(); ctx.stroke();
        }
      }
      ctx.restore();
    }

    /* ---- 悬浮球（原「店铺」，白天挂最外侧车道） ---- */
    function orbAnchor(s) {
      var dv = s.v - S.carV;
      var vv = clamp(dv + CAR_V0, -0.6, ROWS + 0.6);
      var u = laneUnit(vv) * ORB_R;
      var bob = Math.sin(S.stageT * 2.6 + s.idx * 1.15) * u * 0.34;
      var r = u * 1.46;
      // 撞破的瞬间在 0.3s 内缩没，把画面让给搜刮进度条
      if (s === S.searching) {
        var t = 1 - clamp(S.searchT / S.searchMax, 0, 1);
        r *= Math.max(0, 1 - t * (s === S.searching ? 1 / 0.22 : 1));
      }
      return {
        v: dv,
        x: laneCX(s.col, vv),
        y: rowY(vv) - u * 1.34 + bob,
        r: r,
        ground: rowY(vv)
      };
    }

    var ORB_COL = {
      house:    { a: "#e9c891", b: "#a87b48", gl: "#ffd79a", ink: "#6b4826" },
      market:   { a: "#f0a26c", b: "#b05a30", gl: "#ffb877", ink: "#6d2f12" },
      hospital: { a: "#c2e4ea", b: "#6b9aa9", gl: "#cfeeff", ink: "#255a68" },
      factory:  { a: "#d2c38e", b: "#887a4a", gl: "#e8d89a", ink: "#4b411e" }
    };

    function drawOrbIcon(type, cx, cy, s, color) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = color;
      var k;
      if (type === "house") {
        ctx.beginPath();
        ctx.moveTo(-s * 0.54, -s * 0.02);
        ctx.lineTo(0, -s * 0.60);
        ctx.lineTo(s * 0.54, -s * 0.02);
        ctx.closePath(); ctx.fill();
        ctx.fillRect(-s * 0.36, -s * 0.05, s * 0.72, s * 0.47);
      } else if (type === "market") {
        // 购物袋：上宽下窄的袋身 + 半圆提手
        ctx.beginPath();
        ctx.moveTo(-s * 0.46, -s * 0.06);
        ctx.lineTo(s * 0.46, -s * 0.06);
        ctx.lineTo(s * 0.34, s * 0.44);
        ctx.lineTo(-s * 0.34, s * 0.44);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.6, s * 0.16);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(0, -s * 0.06, s * 0.24, Math.PI, 0);
        ctx.stroke();
      } else if (type === "hospital") {
        var a = s * 0.17, b = s * 0.47;
        ctx.fillRect(-a, -b, a * 2, b * 2);
        ctx.fillRect(-b, -a, b * 2, a * 2);
      } else {
        // 工厂：锯齿屋顶厂房 + 烟囱
        ctx.beginPath();
        ctx.moveTo(-s * 0.48, s * 0.42);
        ctx.lineTo(-s * 0.48, s * 0.14);
        for (k = 0; k < 2; k++) {
          var x0 = -s * 0.48 + k * s * 0.40;
          ctx.lineTo(x0 + s * 0.20, -s * 0.10);
          ctx.lineTo(x0 + s * 0.40, s * 0.14);
        }
        ctx.lineTo(s * 0.32, s * 0.42);
        ctx.closePath(); ctx.fill();
        ctx.fillRect(s * 0.32, -s * 0.42, s * 0.16, s * 0.52);
      }
      ctx.restore();
    }

    function drawOrb(s, dark) {
      if (s.searched || s.missed) return;
      var a = orbAnchor(s);
      if (a.v < -0.58 || a.v > ROWS + 0.7) return;
      var al = clamp(1 - Math.max(0, -a.v) * 1.7, 0, 1);
      if (al <= 0.01) return;
      var r = a.r;
      var C = ORB_COL[s.type] || ORB_COL.house;
      var k = 1 - dark * 0.5;

      ctx.save();
      ctx.globalAlpha = al;

      // 地面投影
      var gp = w2s(a.x, a.ground);
      ellipseFill(gp.x, gp.y + 1, r * 0.44, r * 0.15, "rgba(0,0,0,.34)");

      var p = w2s(a.x, a.y);

      // 光晕
      var gg = ctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r * 1.9);
      gg.addColorStop(0, hexA(C.gl, 0.20 * k));
      gg.addColorStop(0.55, hexA(C.gl, 0.07 * k));
      gg.addColorStop(1, hexA(C.gl, 0));
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.75, 0, 6.2832); ctx.fill();

      // 球体
      var bg = ctx.createRadialGradient(p.x - r * 0.32, p.y - r * 0.38, r * 0.10, p.x, p.y, r * 1.08);
      bg.addColorStop(0, shade(C.a, 1.12 * k));
      bg.addColorStop(0.60, shade(C.a, 0.92 * k));
      bg.addColorStop(1, shade(C.b, 0.82 * k));
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.fill();

      // 外圈
      ctx.strokeStyle = "rgba(255,246,214," + (0.28 * k).toFixed(3) + ")";
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.96, 0, 6.2832); ctx.stroke();

      // 顶部高光
      ctx.fillStyle = "rgba(255,255,255," + (0.32 * k).toFixed(3) + ")";
      ctx.beginPath();
      ctx.ellipse(p.x - r * 0.25, p.y - r * 0.43, r * 0.29, r * 0.18, -0.5, 0, 6.2832);
      ctx.fill();

      // 类型图标
      drawOrbIcon(s.type, p.x, p.y + r * 0.05, r * 0.95, hexA(C.ink, 0.90 * k));

      // 被撞瞬间的闪光
      if (s.flash > 0) {
        ctx.globalAlpha = al * clamp(s.flash, 0, 1) * 0.65;
        ctx.fillStyle = "rgba(255,240,196,.85)";
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.3, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
    }

    function shade(hex, k) {
      var n = parseInt(hex.slice(1), 16);
      var r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
      return "rgb(" + Math.min(255, r) + "," + Math.min(255, g) + "," + Math.min(255, b) + ")";
    }
    function hexA(hex, a) {
      var n = parseInt(hex.slice(1), 16);
      return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
    }

    /* ---- 车 ---- */
    function drawCar(dark) {
      var ca = carAnchor();
      var p = w2s(ca.x, ca.y);
      var w = laneUnit(ca.v) * CAR_W, h = w * 1.42;
      ctx.save();
      // 夜晚车灯锥
      if (S.stage === "night") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ROT);
        var lg = ctx.createLinearGradient(0, -h * 0.45, 0, -h * 3.4);
        lg.addColorStop(0, "rgba(255,240,196,.22)");
        lg.addColorStop(0.55, "rgba(255,236,180,.08)");
        lg.addColorStop(1, "rgba(255,236,180,0)");
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(-w * 0.42, -h * 0.45);
        ctx.lineTo(w * 0.42, -h * 0.45);
        ctx.lineTo(w * 2.4, -h * 3.4);
        ctx.lineTo(-w * 2.4, -h * 3.4);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      // 车底阴影
      ellipseFill(p.x, p.y + 2, w * 0.62, w * 0.19, "rgba(0,0,0,.38)");
      ctx.translate(p.x, p.y);
      ctx.rotate(ROT);
      // 车身
      var g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      g.addColorStop(0, dark > 0.05 ? "#3c4436" : "#4e5a42");
      g.addColorStop(0.5, dark > 0.05 ? "#556049" : "#6b7a56");
      g.addColorStop(1, dark > 0.05 ? "#333a2e" : "#3f4936");
      ctx.fillStyle = g;
      roundRect(-w / 2, -h, w, h, w * 0.16); ctx.fill();
      // 车顶
      ctx.fillStyle = dark > 0.05 ? "#5c6650" : "#76855e";
      roundRect(-w * 0.38, -h * 0.78, w * 0.76, h * 0.50, w * 0.10); ctx.fill();
      // 挡风
      ctx.fillStyle = "rgba(150,190,205," + (dark > 0.05 ? 0.28 : 0.62) + ")";
      roundRect(-w * 0.31, -h * 0.74, w * 0.62, h * 0.15, w * 0.06); ctx.fill();
      // 前灯
      ctx.fillStyle = dark > 0.05 ? "#ffe6a8" : "#e8e4d0";
      ctx.fillRect(-w * 0.40, -h * 0.50, w * 0.15, h * 0.05);
      ctx.fillRect(w * 0.25, -h * 0.50, w * 0.15, h * 0.05);
      // 备胎
      ctx.fillStyle = "rgba(20,20,22,.85)";
      roundRect(-w * 0.17, -h * 0.34, w * 0.34, h * 0.20, w * 0.05); ctx.fill();
      // 轮子
      ctx.fillStyle = "#22241f";
      roundRect(-w * 0.50, -h * 0.79, w * 0.15, h * 0.27, 3); ctx.fill();
      roundRect(w * 0.35, -h * 0.79, w * 0.15, h * 0.27, 3); ctx.fill();
      roundRect(-w * 0.50, -h * 0.31, w * 0.15, h * 0.27, 3); ctx.fill();
      roundRect(w * 0.35, -h * 0.31, w * 0.15, h * 0.27, 3); ctx.fill();
      // 顶部灯条
      ctx.fillStyle = "rgba(255,214,130,.9)";
      ctx.fillRect(-w * 0.12, -h * 0.92, w * 0.24, h * 0.035);
      ctx.restore();

      // 车耐久条（悬在车上）
      var bw = Math.max(w * 1.05, 34), by = p.y - h - 8;
      ctx.fillStyle = "rgba(0,0,0,.5)";
      roundRect(p.x - bw / 2, by, bw, 4, 2); ctx.fill();
      ctx.fillStyle = S.dur > S.durMax * 0.5 ? "#7fe0a0" : (S.dur > S.durMax * 0.22 ? "#ffc456" : "#ff6a5a");
      roundRect(p.x - bw / 2, by, Math.max(2, bw * clamp(S.dur / S.durMax, 0, 1)), 4, 2); ctx.fill();
    }

    /* ---- 车灯自发光：夜晚要在暗罩之上再补一层，否则车会整个沉进黑里 ---- */
    function drawCarGlow(dark) {
      if (S.stage === "travel") return;
      var k = clamp(dark / 0.56, 0, 1);
      var ca = carAnchor();
      var p = w2s(ca.x, ca.y);
      var w = laneUnit(ca.v) * CAR_W;
      var cy = p.y - w * 0.95;
      var g = ctx.createRadialGradient(p.x, cy, w * 0.15, p.x, cy, w * 2.3);
      g.addColorStop(0, "rgba(255,234,172," + (0.46 * k).toFixed(3) + ")");
      g.addColorStop(0.42, "rgba(255,206,118," + (0.16 * k).toFixed(3) + ")");
      g.addColorStop(1, "rgba(255,206,118,0)");
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, cy, w * 2.3, 0, 6.2832); ctx.fill();
      ctx.restore();
      // 顶灯一点
      ctx.fillStyle = "rgba(255,242,200," + (0.92 * k).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(p.x, p.y - w * 1.52, Math.max(2, w * 0.075), 0, 6.2832); ctx.fill();
    }

    /* ---- 建筑 ---- */
    function drawBuildingOne(b) {
      var x0 = bx(b), y0 = rowY(b.row + 0.5);
      var p = w2s(x0, y0);
      var u = laneUnit(b.row + 0.5);
      var def = BUILD[b.type];
      var grow = b.grow == null ? 1 : b.grow;
      var s = 0.7 + 0.3 * grow;

      if (b.wreck) {
        // 废墟：碳化的架子
        ctx.save();
        ellipseFill(p.x, p.y + 1, u * 0.42, u * 0.13, "rgba(0,0,0,.30)");
        ctx.fillStyle = "rgba(46,40,34,.92)";
        for (var i = 0; i < 4; i++) {
          var a = -1.1 + i * 0.72;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(a * 0.55);
          ctx.fillRect(-2.5, -u * 0.34, 5, u * 0.34);
          ctx.restore();
        }
        ctx.restore();
        return;
      }

      // 土斑 + 精灵
      ellipseFill(p.x, p.y + 1, u * 0.44, u * 0.115, "rgba(0,0,0,.16)");
      ellipseFill(p.x, p.y, u * 0.42, u * 0.10, "rgba(44,33,22,.62)");
      var key = b.type === "campfire" ? "building/campfire" : "building/watchtower";
      var hh = u * (b.type === "campfire" ? 1.14 : 1.86) * s;
      var dr = drawSprite(key, p.x, p.y + hh * 0.08, hh, { alpha: b.hitFlash > 0 ? 0.55 : 1 });
      if (!dr) {
        // 无素材兜底
        ctx.fillStyle = b.type === "campfire" ? "#ff9a3c" : "#8a7a5e";
        ctx.fillRect(p.x - u * 0.16, p.y - u * 0.42 * s, u * 0.32, u * 0.42 * s);
      }
      // 夜里火苗
      if (b.type === "campfire" && S.stage === "night") {
        var f = 0.7 + Math.sin(b.ph * 7) * 0.3;
        ctx.globalAlpha = 0.75;
        ellipseFill(p.x, p.y - hh * 0.22, u * 0.12 * f, u * 0.22 * f, "rgba(255,190,90,.85)");
        ctx.globalAlpha = 1;
      }

      if (b.hp < b.maxhp) {
        var bw = u * 0.52, by = p.y - hh - 5;
        ctx.fillStyle = "rgba(0,0,0,.45)";
        roundRect(p.x - bw / 2, by, bw, 3.5, 1.75); ctx.fill();
        ctx.fillStyle = b.type === "tower" ? "#8ecbff" : "#ffb057";
        roundRect(p.x - bw / 2, by, Math.max(1.5, bw * b.hp / b.maxhp), 3.5, 1.75); ctx.fill();
      }
    }

    /* ---- 怪 ---- */
    function drawMonsterOne(m) {
      var x0 = laneCX(m.col, m.v);
      var y0 = rowY(m.v) + (m.arc || 0);
      var p = w2s(x0, y0);
      var sc = scaleAt(m.v);
      var bob = m.moving ? Math.sin((S.stageT + m.bob) * 9) * 2 : 0;
      var hh = m.h * sc;
      var img = images[m.key];
      if (m.ai === "slime" || m.fly) {
        ellipseFill(p.x, p.y + 2, m.hw * sc * 0.7, m.hw * sc * 0.24, "rgba(0,0,0,.14)");
      } else {
        ellipseFill(p.x, p.y + 1, m.hw * sc * 1.02, m.hw * sc * 0.30, "rgba(0,0,0,.26)");
      }
      if (!img) return;
      var dw = img.width * (hh / img.height);
      ctx.save();
      ctx.globalAlpha = clamp(m.alpha, 0, 1);
      if (m.spawnT != null) { }
      ctx.drawImage(img, p.x - dw / 2, p.y + bob - hh, dw, hh);
      if (m.hitFlash > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.30 * clamp(m.alpha, 0, 1);
        ctx.drawImage(img, p.x - dw / 2, p.y + bob - hh, dw, hh);
      }
      ctx.restore();
      // 夜里点一对眼睛，黑暗中才认得出怪
      if (S.stage === "night" && !m.dead && m.alpha > 0.35) {
        var eyeY = p.y + bob - hh * 0.80;
        var ex2 = Math.max(2, hh * 0.115);
        ctx.save();
        ctx.globalAlpha = clamp(m.alpha, 0, 1) * 0.92;
        ctx.fillStyle = m.ai === "shadow" ? "#c2a0ff" : (m.ai === "slime" ? "#9cff7a" : "#ff5f48");
        ctx.beginPath(); ctx.arc(p.x - ex2, eyeY, Math.max(1.1, hh * 0.032), 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.arc(p.x + ex2, eyeY, Math.max(1.1, hh * 0.032), 0, 6.2832); ctx.fill();
        ctx.restore();
      }
      if (!m.dead && m.hp < m.maxhp) {
        var bw = Math.max(14, m.hw * sc * 1.7), by = p.y + bob - hh - 6;
        ctx.fillStyle = "rgba(0,0,0,.5)";
        roundRect(p.x - bw / 2, by, bw, 3, 1.5); ctx.fill();
        ctx.fillStyle = "#7ef0a0";
        roundRect(p.x - bw / 2, by, Math.max(1, bw * m.hp / m.maxhp), 3, 1.5); ctx.fill();
      }
    }

    /* ---- 篝火光域 ---- */
    function drawGlow(mul, dark) {
      for (var i = 0; i < S.buildings.length; i++) {
        var b = S.buildings[i];
        if (!BUILD[b.type].light || b.wreck) continue;
        var p = w2s(bx(b), rowY(b.row + 0.5));
        var R = laneUnit(b.row + 0.5) * 1.95;
        var gy2 = p.y - laneUnit(b.row + 0.5) * 0.52;
        var g = ctx.createRadialGradient(p.x, gy2, 2, p.x, gy2, R);
        g.addColorStop(0, "rgba(255,212,130," + (0.46 * mul) + ")");
        g.addColorStop(0.5, "rgba(160,255,190," + (0.14 * mul) + ")");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = g;
        ctx.fillRect(p.x - R, gy2 - R, R * 2, R * 2);
        ctx.restore();
      }
    }

    function drawArrows() {
      for (var i = 0; i < S.arrows.length; i++) {
        var a = S.arrows[i];
        var t2 = Math.min(1, a.prog + 0.14);
        var p = w2s(a.x, a.y);
        var q = w2s(a.x0 + (a.tx - a.x0) * t2, a.y0 + (a.ty - a.y0) * t2);
        ctx.save();
        ctx.strokeStyle = a.foe ? "rgba(232,226,205,.92)" : "rgba(150,220,255,.95)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        ctx.restore();
      }
    }

    function drawFx() {
      for (var i = 0; i < S.fx.length; i++) {
        var f = S.fx[i], p = Math.min(1, f.t / f.dur);
        ctx.save();
        if (f.kind === "boom") {
          ctx.globalAlpha = 1 - p;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + p), 0, 6.2832);
          ctx.fillStyle = "rgba(255,150,60,.5)"; ctx.fill();
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.14 + p * 0.6), 0, 6.2832);
          ctx.fillStyle = "rgba(255,240,190,.85)"; ctx.fill();
        } else if (f.kind === "tp") {
          ctx.globalAlpha = 1 - p;
          ctx.strokeStyle = "rgba(190,150,255,.9)";
          ctx.lineWidth = 2;
          for (var r = 0; r < 3; r++) {
            ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - p) * (1 - r * 0.25) + 4, 0, 6.2832); ctx.stroke();
          }
        } else if (f.kind === "text") {
          ctx.globalAlpha = 1 - p;
          ctx.font = "bold 13px " + FONT;
          ctx.textAlign = "center";
          ctx.fillStyle = "#ffdca0";
          ctx.strokeStyle = "rgba(10,12,18,.6)";
          ctx.lineWidth = 3;
          ctx.strokeText(f.msg || "", f.x, f.y - p * 16);
          ctx.fillText(f.msg || "", f.x, f.y - p * 16);
        } else if (f.kind === "loot") {
          ctx.globalAlpha = 1 - p;
          ctx.font = "bold 12px " + FONT;
          ctx.textAlign = "center";
          ctx.fillStyle = "#b6f0b0";
          ctx.strokeStyle = "rgba(10,12,18,.75)";
          ctx.lineWidth = 3;
          ctx.strokeText(f.msg || "", f.x, f.y - p * 34);
          ctx.fillText(f.msg || "", f.x, f.y - p * 34);
        } else if (f.kind === "dust") {
          ctx.globalAlpha = (1 - p) * 0.5;
          ctx.fillStyle = "rgba(214,208,180,1)";
          for (var d = 0; d < 5; d++) {
            var ang = (d / 5) * 6.2832;
            ctx.beginPath();
            ctx.arc(f.x + Math.cos(ang) * f.r * p, f.y - 3 + Math.sin(ang) * f.r * p * 0.4, 3.5 * (1 - p) + 1, 0, 6.2832);
            ctx.fill();
          }
        } else {
          ctx.globalAlpha = 1 - p;
          ctx.fillStyle = "#fff3c4";
          for (var h = 0; h < 3; h++) {
            var a2 = (h / 3) * 6.2832 + p * 2;
            ctx.beginPath();
            ctx.arc(f.x + Math.cos(a2) * f.r * p * 1.2, f.y + Math.sin(a2) * f.r * p, 2.6 * (1 - p), 0, 6.2832);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }

    /* ================= 14. HUD ================= */
    var BTN_H = 46;
    function btnY() { return H - BTN_H - 12; }

    function bottomButtons() {
      var list = [];
      var pad = 12, gap = 8;
      if (S.stage === "travel") {
        var w = (W - pad * 2 - gap * 2) / 3;
        list.push({ id: "skip", label: "直接布防", sub: "结算里程", x: pad, y: btnY(), w: w, h: BTN_H });
      } else {
        var w2 = (W - pad * 2 - gap * 2) / 3;
        list.push({ id: "campfire", label: "篝火", sub: itemCost("campfire"), x: pad, y: btnY(), w: w2, h: BTN_H, active: S.buildType === "campfire" });
        list.push({ id: "tower", label: "箭塔", sub: itemCost("tower"), x: pad + w2 + gap, y: btnY(), w: w2, h: BTN_H, active: S.buildType === "tower" });
        if (S.stage === "dusk") {
          list.push({
            id: "pause", label: S.pauseUsed ? "已用" : "暂停",
            sub: S.pauseUsed ? "—" : "10s 一次",
            x: pad + (w2 + gap) * 2, y: btnY(), w: w2, h: BTN_H, dim: S.pauseUsed
          });
        } else {
          list.push({
            id: "boost", label: "用药", sub: S.boostItem > 0 ? "加速 x" + S.boostItem : "无",
            x: pad + (w2 + gap) * 2, y: btnY(), w: w2, h: BTN_H, dim: S.boostItem <= 0
          });
        }
      }
      return list;
    }
    function itemCost(type) {
      if (type === "campfire" && S.campfireItem > 0) return "道具 " + S.campfireItem;
      if (type === "tower" && S.towerItem > 0) return "道具 " + S.towerItem;
      return BUILD[type].wood + " 木";
    }
    function speedBtnRect() { return { x: W - 52, y: 46, w: 40, h: 20 }; }

    function drawHUD(dark) {
      // 顶部底衬
      var g = ctx.createLinearGradient(0, 0, 0, 84);
      g.addColorStop(0, "rgba(8,11,20,.75)");
      g.addColorStop(0.72, "rgba(8,11,20,.36)");
      g.addColorStop(1, "rgba(8,11,20,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, 84);

      // 车耐久
      var bw = W * 0.33;
      ctx.fillStyle = "rgba(255,255,255,.16)";
      roundRect(12, 12, bw, 8, 4); ctx.fill();
      ctx.fillStyle = S.dur > S.durMax * 0.5 ? "#6fdca0" : (S.dur > S.durMax * 0.22 ? "#ffc456" : "#ff6a5a");
      roundRect(12, 12, Math.max(2, bw * clamp(S.dur / S.durMax, 0, 1)), 8, 4); ctx.fill();
      txt("车 " + Math.ceil(S.dur) + "/" + S.durMax, 12, 34, 10.5, "rgba(226,234,250,.92)", "left", "bold");

      // 能量
      var ew = W * 0.19, ex = 12, ey = 42;
      ctx.fillStyle = "rgba(255,255,255,.15)";
      roundRect(ex, ey, ew, 6, 3); ctx.fill();
      ctx.fillStyle = "#ffca6a";
      roundRect(ex, ey, Math.max(2, ew * clamp(S.energy / ENERGY_MAX, 0, 1)), 6, 3); ctx.fill();
      txt("能" + Math.floor(S.energy), ex + ew + 5, ey + 6, 9.5, "rgba(222,230,246,.82)", "left", "bold");

      // 天数 / 阶段 / 里程
      var cyc = S.stage === "travel" ? DAY_TRAVEL : (S.stage === "dusk" ? DAY_DUSK : DAY_NIGHT);
      var remain = Math.max(0, cyc - S.stageT);
      var stageName = S.stage === "travel" ? "行进" : (S.stage === "dusk" ? "布防" : "夜袭");
      var phaseColor = S.stage === "travel" ? "#ffcf7a" : (S.stage === "dusk" ? "#ffa76a" : "#9fb0ff");
      var stageLine = stageName + " " + Math.ceil(remain) + "s";
      if (S.stage === "travel") stageLine += " · 撞 " + S.stat.search + "/" + SHOP_PER_DAY;
      txt("第 " + S.day + "/" + WIN_DAYS + " 天", W / 2, 20, 12.5, "rgba(238,243,255,.97)", "center", "bold");
      txt(stageLine, W / 2, 35, 11, phaseColor, "center", "bold");

      var pw = Math.min(112, W * 0.3);
      ctx.fillStyle = "rgba(255,255,255,.18)";
      roundRect(W / 2 - pw / 2, 41, pw, 3, 1.5); ctx.fill();
      ctx.fillStyle = phaseColor;
      roundRect(W / 2 - pw / 2, 41, Math.max(2, pw * clamp(S.stageT / cyc, 0, 1)), 3, 1.5); ctx.fill();

      txt(Math.floor(S.wood) + " 木", W - 12, 20, 12.5, "#ffe0a8", "right", "bold");
      var houses = Math.min(RESCUE_HOUSES, S.odometer + Math.floor(S.carV));
      txt(houses + "/" + RESCUE_HOUSES + " 户", W - 12, 38, 9.5, "rgba(210,220,240,.72)", "right", "bold");

      // 倍速
      var sb = speedBtnRect();
      ctx.fillStyle = "rgba(255,255,255,.14)";
      roundRect(sb.x, sb.y, sb.w, sb.h, sb.h / 2); ctx.fill();
      ctx.strokeStyle = "rgba(170,190,255,.40)"; ctx.lineWidth = 1; ctx.stroke();
      txt(S.speed + "x", sb.x + sb.w / 2, sb.y + 14, 11, S.speed === 1 ? "rgba(200,210,240,.9)" : "#ffde96", "center", "bold");

      // 首次上手提示
      if (S.day === 1 && S.stage === "travel" && S.stageT < 5.5 && !S.searching) {
        var ha = clamp(Math.min(S.stageT * 2, (5.5 - S.stageT) * 1.6), 0, 1);
        ctx.save();
        ctx.globalAlpha = ha * 0.92;
        txt("拖动屏幕左右控车 · 撞破悬浮球补给", W / 2, H - BTN_H - 34, 12.5, "rgba(255,238,196,.98)", "center", "bold");
        ctx.restore();
      }

      // 暂停遮罩
      if (S.pauseT > 0) {
        ctx.fillStyle = "rgba(10,14,26,.35)";
        ctx.fillRect(0, 0, W, H);
        txt("暂停 " + Math.ceil(S.pauseT) + "s", W / 2, H * 0.42, 22, "rgba(255,232,180,.95)", "center", "bold");
      }

      // 底部按钮
      var btns = bottomButtons();
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i], on = !!b.active;
        ctx.save();
        ctx.globalAlpha = b.dim ? 0.42 : 1;
        ctx.fillStyle = on ? "rgba(255,186,86,.94)" : "rgba(20,26,40,.82)";
        roundRect(b.x, b.y, b.w, b.h, 12); ctx.fill();
        if (on) { ctx.strokeStyle = "rgba(255,236,190,.95)"; ctx.lineWidth = 2; ctx.stroke(); }
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = on ? "#3a2410" : "rgba(228,234,252,.95)";
        ctx.font = "bold 13px " + FONT;
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h * 0.36);
        ctx.font = "10.5px " + FONT;
        ctx.fillStyle = on ? "rgba(70,44,16,.85)" : "rgba(176,196,228,.88)";
        ctx.fillText(b.sub, b.x + b.w / 2, b.y + b.h * 0.72);
        ctx.restore();
      }

      // 建造进度
      if (S.buildTask) {
        var q = w2s(laneCX(S.buildTask.col, S.buildTask.row + 0.5), rowY(S.buildTask.row + 0.5));
        var pct = 1 - S.buildTask.t / (S.boostT > 0 ? 0.5 : 1.0);
        ctx.fillStyle = "rgba(0,0,0,.5)";
        roundRect(q.x - 18, q.y - 26, 36, 5, 2.5); ctx.fill();
        ctx.fillStyle = "#ffc456";
        roundRect(q.x - 18, q.y - 26, Math.max(2, 36 * clamp(pct, 0, 1)), 5, 2.5); ctx.fill();
      }

      // 搜刮进度（跟着被撞破的球走）
      if (S.searching) {
        var sa = orbAnchor(S.searching);
        var sp = w2s(sa.x, sa.y - sa.r * 1.5);
        var pct2 = 1 - S.searchT / S.searchMax;
        ctx.fillStyle = "rgba(0,0,0,.55)";
        roundRect(sp.x - 24, sp.y - 12, 48, 7, 3.5); ctx.fill();
        ctx.fillStyle = "#8fe0b0";
        roundRect(sp.x - 24, sp.y - 12, Math.max(2, 48 * clamp(pct2, 0, 1)), 7, 3.5); ctx.fill();
      }
    }

    function drawOverlay() {
      ctx.save();
      ctx.fillStyle = "rgba(8,10,18,.78)";
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      var arrived = S.odometer >= RESCUE_HOUSES;
      ctx.fillStyle = S.won ? "#ffe6a6" : "#ff9a8a";
      ctx.font = "bold 24px " + FONT;
      ctx.fillText(S.won ? (arrived ? "抵达救援中心" : "撑过 100 天") : "车辆报废", W / 2, H * 0.40);
      ctx.fillStyle = "rgba(230,236,252,.9)";
      ctx.font = "14px " + FONT;
      ctx.fillText("车队前进 " + S.odometer + " 户 · 第 " + S.day + " 天", W / 2, H * 0.40 + 30);
      ctx.fillStyle = "rgba(200,210,235,.75)";
      ctx.fillText("点击任意处重新开始", W / 2, H * 0.40 + 62);
      ctx.restore();
    }

    function drawBlueprintPicker() {
      ctx.save();
      ctx.fillStyle = "rgba(8,10,18,.80)";
      ctx.fillRect(0, 0, W, H);
      txt("获得图纸 · 选择一项升级", W / 2, H * 0.28, 17, "#ffe6a6", "center", "bold");
      var cw = W * 0.78, ch = 62, gap = 12;
      var top = H * 0.34;
      for (var i = 0; i < S.pickCards.length; i++) {
        var c = S.pickCards[i];
        var y = top + i * (ch + gap);
        var r = pickRect(i);
        ctx.fillStyle = "rgba(34,42,62,.96)";
        roundRect(r.x, r.y, r.w, r.h, 12); ctx.fill();
        ctx.strokeStyle = "rgba(255,200,120,.55)"; ctx.lineWidth = 1.4; ctx.stroke();
        txt(c.name, r.x + 16, r.y + 26, 14, "#ffe0a8", "left", "bold");
        txt(c.desc, r.x + 16, r.y + 46, 11.5, "rgba(200,214,240,.8)", "left", "");
      }
      ctx.restore();
    }
    function pickRect(i) {
      var ch = 62, gap = 12, top = Math.round(H * 0.34);
      var cw = W * 0.78;
      return { x: (W - cw) / 2, y: top + i * (ch + gap), w: cw, h: ch };
    }

    /* ================= 15. 渲染主流程 ================= */
    function render() {
      var dark = darkFactor();
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = dark > 0.05 ? "#0b0e16" : "#8fa2a0";
      ctx.fillRect(0, 0, W, H);
      drawSky(dark);
      drawRoad(dark);
      drawCellGrid();
      drawGlow(0.55, dark);

      // 收集可排序对象
      var items = [];
      var i;
      if (S.stage === "travel") {
        for (i = 0; i < S.shops.length; i++) {
          var s = S.shops[i];
          if (s.searched || s.missed) continue;
          if (s.v - S.carV < -0.58) continue;
          items.push({ y: rowY(s.v - S.carV), k: 0, o: s });
        }
      }
      for (i = 0; i < S.buildings.length; i++) items.push({ y: rowY(S.buildings[i].row + 0.5), k: 1, o: S.buildings[i] });
      for (i = 0; i < S.monsters.length; i++) items.push({ y: rowY(S.monsters[i].v), k: 2, o: S.monsters[i] });
      items.sort(function (a, b) { return a.y - b.y || a.k - b.k; });

      for (i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.k === 0) continue;                       // 球留到最后画
        if (it.k === 1) drawBuildingOne(it.o);
        else drawMonsterOne(it.o);
      }

      drawArrows();

      if (dark > 0) {
        ctx.fillStyle = "rgba(8,12,30," + (dark * 0.82) + ")";
        ctx.fillRect(0, 0, W, H);
        drawGlow(1.15, dark);
      }

      // 车与球永远在最上层：车在阵前，球是悬浮物
      drawCar(dark);
      if (dark > 0) drawCarGlow(dark);
      for (i = 0; i < items.length; i++) if (items[i].k === 0) drawOrb(items[i].o, dark);

      // 白天视野暗角
      drawFx();
      drawHUD(dark);
      if (S.pendingPick) drawBlueprintPicker();
      if (S.over) drawOverlay();
    }

    /* ================= 16. 输入 ================= */
    function onTap(sx, sy) {
      if (S.over) { reset(); return; }

      if (S.pendingPick) {
        for (var i = 0; i < S.pickCards.length; i++) {
          var r = pickRect(i);
          if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) { applyPick(S.pickCards[i].id); return; }
        }
        return;
      }

      if (S.pauseT > 0) return;

      var sb = speedBtnRect();
      if (sx >= sb.x && sx <= sb.x + sb.w && sy >= sb.y && sy <= sb.y + sb.h) {
        S.speed = S.speed >= 3 ? 1 : S.speed + 1;
        return;
      }

      var btns = bottomButtons();
      for (var b = 0; b < btns.length; b++) {
        var bt = btns[b];
        if (sx >= bt.x && sx <= bt.x + bt.w && sy >= bt.y && sy <= bt.y + bt.h) {
          handleBtn(bt.id);
          return;
        }
      }

      // 白天不再点房子：只保留 UI 按钮，驾驶靠拖拽
      if (S.stage === "travel") return;

      // 布防/夜晚点格子
      var c = cellAtScreen(sx, sy);
      if (c) tryBuild(c.col, c.row);
    }

    /* ---- 拖拽控车 ---- */
    // 手指 x 投影到车所在横线，再用反投影换算车道坐标
    function screenToCol(sx) {
      var a = carAnchor();
      var w = s2w(sx, a.y);
      return clamp((w.x - leftX(a.v)) / laneUnit(a.v), carColMin(), carColMax());
    }
    function overUI(sx, sy) {
      var sb = speedBtnRect();
      if (sx >= sb.x - 7 && sx <= sb.x + sb.w + 7 && sy >= sb.y - 7 && sy <= sb.y + sb.h + 7) return true;
      var btns = bottomButtons();
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) return true;
      }
      return false;
    }
    function onDrag(phase, sx, sy) {
      if (S.over || S.pendingPick || S.pauseT > 0) return;
      if (S.stage !== "travel" || S.searching) { S.dragging = false; return; }
      if (phase === "up") { S.dragging = false; return; }
      if (phase === "down") {
        if (overUI(sx, sy)) { S.dragging = false; return; }
        S.dragging = true;
        S.carColT = screenToCol(sx);
        return;
      }
      if (!S.dragging) return;
      if (overUI(sx, sy)) return;
      S.carColT = screenToCol(sx);
    }

    function handleBtn(id) {
      if (id === "skip") {
        if (S.stage === "travel") {
          var extra = Math.max(0, DAY_TRAVEL - S.stageT);
          enterDusk(extra);
        }
        return;
      }
      if (id === "campfire") { S.buildType = "campfire"; return; }
      if (id === "tower") { S.buildType = "tower"; return; }
      if (id === "pause") {
        if (S.pauseUsed || S.stage !== "dusk") return;
        S.pauseUsed = true;
        S.pauseT = 10;
        return;
      }
      if (id === "boost") {
        if (S.boostItem <= 0) return;
        S.boostItem--;
        S.boostT = BOOST_T;
        addFx("text", W / 2, H * 0.45, 0, 1.0, "加速生效 60s");
        return;
      }
    }

    /* ================= 17. 生命周期 ================= */
    function reset() {
      S.day = 1; S.stage = "travel"; S.stageT = 0; S.speed = 1;
      S.wood = 80; S.energy = ENERGY_START;
      S.dur = CAR_MAX; S.durMax = CAR_MAX;
      S.odometer = 0; S.carV = 0; S.carCol = LANES / 2; S.carColT = LANES / 2;
      S.dragging = false; S.searching = null; S.missed = 0;
      S.buildings = []; S.monsters = []; S.arrows = []; S.fx = [];
      S.buildType = "campfire"; S.buildTask = null;
      S.campfireItem = 0; S.towerItem = 0; S.healItem = 0; S.boostItem = 0; S.blueprints = 0;
      S.boostT = 0; S.pauseUsed = false; S.pauseT = 0;
      S.towerLv = 1; S.speedLv = 1; S.durLv = 1;
      S.starved = false; S.penalty = 0;
      S.over = false; S.won = false;
      S.pendingPick = false; S.pickCards = [];
      S.dayLoot = null; S.spawnTimer = 0; S.stat = { search: 0, kill: 0, boom: 0, tp: 0 };
      newDayShops();
    }

    function frame() {
      var now = env.now ? env.now() : Date.now();
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!S.over) update(dt * S.speed);
      render();
      if (env.raf) env.raf(frame);
    }

    newDayShops();
    if (env.onPointer) env.onPointer(onTap);
    if (env.onDrag) env.onDrag(onDrag);
    if (env.raf) env.raf(frame);

    return {
      tap: onTap,
      drag: onDrag,
      restart: reset,
      state: function () { return S; },
      debug: {
        S: S,
        cellAtScreen: cellAtScreen,
        w2s: w2s,
        s2w: s2w,
        enterDusk: enterDusk,
        enterNight: enterNight,
        nextDay: nextDay,
        spawn: spawnMonster,
        build: tryBuild,
        orbAnchor: orbAnchor,
        carAnchor: carAnchor,
        screenToCol: screenToCol,
        drag: onDrag,
        setDay: function (d) { S.day = d; newDayShops(); },
        setCarV: function (v) { S.carV = v; },
        setCarCol: function (c) { S.carCol = c; S.carColT = c; },
        setStage: function (s, t) { S.stage = s; S.stageT = t || 0; },
        setWood: function (v) { S.wood = v; },
        setEnergy: function (v) { S.energy = v; },
        god: function (v) { S.godMode = !!v; },
        pick: applyPick,
        applyPick: applyPick,
        openPick: makePickCards,
        pickRect: pickRect,
        rect: { W: W, H: H, baseY: baseY, fieldTop: fieldTop, rowH: rowH, ROWS: ROWS, LANES: LANES, nearW: nearW, farW: farW, shift: SHIFT, CX: CX }
      }
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = createGame;
  else root.createGame = createGame;
})(typeof globalThis !== "undefined" ? globalThis : this);
