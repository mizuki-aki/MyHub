/* 卡池可行性分析：不改 core.js，只驱动公开接口测真实产量与卡效边际
 * 用法：
 *   node tools/card_feasibility.js runs      # 100 天全流程，统计抽卡次数 / 木收支 / 漏怪
 *   node tools/card_feasibility.js night     # 单晚对照实验：towerLv 1..5 对漏怪的边际
 *   node tools/card_feasibility.js budget    # 卡效预算：每层增幅换算成「等效箭塔数」
 */
const ROOT = 'C:/Users/Admin/WorkBuddy/2026-10-24-07-47-40';
const createGame = require(ROOT + '/minigame/js/core.js');

const noop = () => { };
const grad = () => ({ addColorStop() { } });
const ctx = new Proxy({}, {
  get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? grad
    : (k === 'measureText' ? () => ({ width: 10 }) : (typeof k === 'string' ? noop : undefined)),
  set: () => true
});

function mk(seed) {
  let pending = null, clock = 0;
  const g = createGame({
    canvas: {}, ctx, width: 375, height: 700, images: {},
    now: () => clock, raf: (fn) => { pending = fn; }
  });
  const S = g.state();
  S.seed = seed || 1;
  return {
    g, S, D: g.debug,
    tick(dt) { clock += dt * 1000; if (pending) { const f = pending; pending = null; f(); } }
  };
}

/* ---------- A. 100 天全流程 ---------- */
function runs(tag, chase, god) {
  const env = mk(7);
  const { S, D, tick } = env;
  if (god) D.god(true);
  let dayChased = 0, prevStage = S.stage, lastDay = 1;
  let pickCount = 0, bpByDay = [], woodIn = 0, woodOut = 0;
  const seen = new Set();
  let statSearch = 0, statMiss = 0, statKill = 0, durMin = 999, leakNights = 0, nightCount = 0;
  let dayWoodIn = 0, dayPick = 0, daySearch = 0;
  const rows = [];

  function playTravel() {
    if (S.searching) return;
    const next = S.shops.find(s => !s.searched && !s.missed);
    if (!next) { S.carColT = 2.5; return; }
    if (chase > 0 && dayChased >= chase) { S.carColT = 2.5; return; }
    if (S.carColT !== next.col + 0.5) dayChased++;
    S.carColT = next.col + 0.5;
  }
  function playDusk() {
    const plan = [];
    for (let c = 0; c < 5; c++) plan.push([c, 2, 'campfire']);
    for (let c = 0; c < 5; c++) plan.push([c, 5, 'campfire']);
    for (let c = 0; c < 5; c++) plan.push([c, 7, 'tower']);
    for (const [c, r, type] of plan) {
      const cost = type === 'tower' ? 25 : 10;
      const hasItem = (type === 'tower' ? S.towerItem : S.campfireItem) > 0;
      if (!hasItem && S.wood < cost) continue;
      if (S.buildings.some(b => b.col === c && b.row === r && !b.wreck)) continue;
      S.buildType = type; D.build(c, r);
    }
  }
  let repairTimer = 0;
  function playNight(dt) {
    repairTimer -= dt; if (repairTimer > 0) return; repairTimer = 0.35;
    if (S.buildTask) return;
    for (let c = 0; c < 5; c++) {
      const threat = S.monsters.some(m => m.col === c && !m.fly && m.v < 4.5 && m.v > 0.2);
      if (!threat) continue;
      const guard = S.buildings.some(b => b.col === c && b.type === 'campfire' && !b.wreck && b.hp > b.maxhp * 0.3 && b.row < 4);
      if (guard) continue;
      if (S.wood < 10 && S.campfireItem <= 0) continue;
      for (const r of [1, 2, 3]) {
        if (!S.buildings.some(b => b.col === c && b.row === r && !b.wreck && b.hp > 0)) {
          S.buildType = 'campfire'; D.build(c, r); return;
        }
      }
    }
    const wreck = S.buildings.find(b => b.wreck);
    if (wreck && S.wood >= (wreck.type === 'tower' ? 8 : 2)) D.build(wreck.col, wreck.row);
  }
  // 现有 3 卡策略：先车速到 5（决定里程），再箭塔
  function smartPick() {
    const want = S.speedLv < 5 ? 'speed' : 'tower';
    return S.pickCards.some(c => c.id === want) ? want : (S.pickCards[0] ? S.pickCards[0].id : 'tower');
  }

  let guard = 0;
  while (!S.over && guard++ < 60 * 60 * 106) {
    // 搜刮结算：捕获木头收入
    for (const sh of S.shops) {
      if (sh.searched && sh.loot && !seen.has(sh)) {
        seen.add(sh); woodIn += sh.loot.wood; dayWoodIn += sh.loot.wood;
      }
    }
    if (S.stage !== prevStage) {
      if (S.stage === 'travel') { dayChased = 0; dayWoodIn = 0; dayPick = 0; daySearch = 0; }
      if (S.stage === 'night') nightCount++;
      prevStage = S.stage;
    }
    if (S.pendingPick) { const b = S.blueprints; D.pick(smartPick()); if (S.blueprints < b) { pickCount++; dayPick++; } continue; }
    if (S.stage === 'travel') playTravel();
    else if (S.stage === 'dusk') playDusk();
    else if (S.stage === 'night') playNight(0.05);
    tick(0.05);
    if (S.stage === 'night' && S.dur < durMin) durMin = S.dur;
    if (S.day !== lastDay) {
      rows.push({ d: S.day - 1, wood: S.wood, dur: Math.round(S.dur), odo: S.odometer,
        pick: pickCount, search: S.stat.search, miss: S.missed });
      bpByDay.push(pickCount); lastDay = S.day;
      if (S.dur < S.durMax * 0.35) leakNights++;
    }
  }
  const d = rows.filter((r, i) => i < 5 || i % 10 === 9);
  console.log('\n=== ' + tag + ' ===');
  console.log('  天/木/耐久/里程/累计抽卡/累计搜索/当日漏球');
  for (const r of d) {
    console.log('   d' + String(r.d).padStart(3) + ' wood=' + String(r.wood).padStart(3) +
      ' dur=' + String(r.dur).padStart(3) + ' odo=' + String(r.odo).padStart(3) +
      ' pick=' + String(r.pick).padStart(3) + ' srch=' + String(r.search).padStart(3) +
      ' miss=' + r.miss);
  }
  console.log('  结束 day=' + S.day + ' won=' + S.won + ' 里程=' + S.odometer +
    ' 抽卡=' + pickCount + ' 搜索=' + S.stat.search + ' 击杀=' + S.stat.kill +
    ' 木收入合计=' + woodIn + ' 最低耐久=' + Math.round(durMin));
  return { pickCount, search: S.stat.search, woodIn, kill: S.stat.kill, odo: S.odometer, day: S.day, won: S.won };
}

/* ---------- B. 单晚对照：塔等级对漏怪的边际 ---------- */
function night(towerLv, day, nBuild) {
  const env = mk(11);
  const { S, D, tick } = env;
  S.day = day; D.setDay(day);
  S.towerLv = towerLv;
  S.wood = 9999;
  // 固定布局：10 篝火 + nBuild 箭塔
  D.setStage('dusk', 0);
  for (let c = 0; c < 5; c++) { S.buildType = 'campfire'; D.build(c, 2); D.build(c, 5); }
  for (let i = 0; i < nBuild; i++) { S.buildType = 'tower'; D.build(i % 5, 7); }
  S.buildTask = null;
  for (const b of S.buildings) { b.hp = b.maxhp; b.wreck = false; }
  const comp = S.buildings.map(b => b.type[0]).join('');
  D.enterNight();
  S.spawnTimer = 0.8;
  S.dur = S.durMax;
  const t0 = S.stat.kill, d0 = S.dur;
  let leaked = 0, track = new Set();
  for (let i = 0; i < 30 / 0.05; i++) {
    tick(0.05);
    for (const m of S.monsters) if (!m.dead && m.v <= 0.32 && !track.has(m)) { track.add(m); leaked++; }
  }
  const built = S.buildings.filter(b => !b.wreck).length;
  return { towerLv, kill: S.stat.kill - t0, dmg: Math.round(d0 - S.dur), leaked, built, comp };
}

/* ---------- C. 卡效预算换算 ---------- */
function budget() {
  console.log('\n=== 等效换算（以 Lv1 箭塔 14dmg/1s 为 1 单位 DPS） ===');
  const TOWER_DPS = 14, TOWER_CD = 1.0;
  const base = night(1, 60, 5);
  console.log('  建筑构成: ' + base.comp + ' （c=campfire t=tower，共 ' + base.built + ' 座）');
  console.log('  day60 基线 5 塔 10 篝火：击杀 ' + base.kill + ' 漏怪 ' + base.leaked + ' 车损 ' + base.dmg);
  for (const lv of [2, 3, 4, 5]) {
    const r = night(lv, 60, 5);
    console.log('  塔 Lv' + lv + '（伤害 x' + (1 + (lv - 1) * 0.2).toFixed(1) + '）：击杀 ' + r.kill +
      ' 漏怪 ' + r.leaked + ' 车损 ' + r.dmg);
  }
  // 塔数量边际
  for (const n of [3, 5, 7, 9]) {
    const r = night(1, 60, n);
    console.log('  塔数 ' + n + '：击杀 ' + r.kill + ' 漏怪 ' + r.leaked + ' 车损 ' + r.dmg);
  }
}

const mode = process.argv[2] || 'runs';
if (mode === 'runs') {
  runs('全追 8 球（极限操作）', 0);
  runs('追 7 球（认真玩）', 7);
  runs('追 5 球（普通玩家）', 5);
} else if (mode === 'god') {
  runs('无敌模式跑满 100 天（求抽卡总量）', 0, true);
  runs('无敌 + 只追 6 球', 6, true);
} else if (mode === 'night') {
  budget();
} else if (mode === 'budget') {
  budget();
}
