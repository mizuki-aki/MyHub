/* 循环审计：不改 core.js，只测量「玩法闭环 / 资源溢出 / 无效机制」
 * 用法：
 *   node tools/loop_audit.js clock    # 白天 15 秒时间预算（车速 1~5 × 撞球数 0~8）
 *   node tools/loop_audit.js flow     # 逐日资源流水（木/油/耐久/图纸/里程）
 *   node tools/loop_audit.js grid     # 格子预算（45 格 vs 5 种建筑需求）
 *   node tools/loop_audit.js pool     # 卡池填充率与抽卡上限
 *   node tools/loop_audit.js all
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

/* ================= A. 白天时间预算 ================= */
// 固定追 k 个球，测：实际撞到几个、走完几户、多出多少空闲时间
function dayClock(speedLv, chase) {
  const env = mk(7);
  const { S, D, tick } = env;
  S.speedLv = speedLv;
  S.wood = 9999; S.energy = 100; S.dur = 200; S.durMax = 200;

  let chased = 0, searchTime = 0, prevSearching = null, prevStage = S.stage;
  let t0 = 0, travelT = 0, duskT = null;

  // 记录每天白天结束时的状态
  let result = null;
  const seenShop = new Set();
  let hitCount = 0;

  function playTravel() {
    if (S.searching) return;
    // 撞满 chase 个就回中路不再追
    if (chase > 0 && S.stat.search >= chase) { S.carColT = 2.5; return; }
    const next = S.shops.find(s => !s.searched && !s.missed);
    if (!next) { S.carColT = 2.5; return; }
    S.carColT = next.col + 0.5;
  }

  let guard = 0, energyMin = 100, woodIn = 0;
  while (!result && guard++ < 60 * 30) {
    if (S.stage !== prevStage) {
      if (S.stage === 'dusk') {
        result = {
          hits: S.stat.search,
          odometer: S.odometer,
          missed: S.missed,
          energy: Math.round(S.energy),
          energyMin: Math.round(energyMin),
          starved: S.starved,
          wood: S.wood,
          searchTotal: +(S.stat.search * 1.4).toFixed(2)
        };
        break;
      }
      prevStage = S.stage;
    }
    if (S.stage === 'travel') playTravel();
    tick(0.02);
    if (S.energy < energyMin) energyMin = S.energy;
  }
  return result;
}

function clock() {
  console.log('\n=== A. 白天 15 秒时间预算（core.js 实测） ===');
  console.log('   车速    追球数  实撞  漏球  里程  白天空闲  收尾时油');
  const speeds = [1, 2, 3, 4, 5];
  for (const lv of speeds) {
    for (const chase of [0, 4, 6, 7, 8]) {
      const r = dayClock(lv, chase);
      if (!r) { console.log('   Lv' + lv + ' 追' + chase + ' 失败'); continue; }
      // 空闲 = 15 - 撞球耗时 - 行驶耗时（行驶 = 里程 × posTime）
      const posT = [0.55, 0.46, 0.38, 0.31, 0.25][lv - 1];
      const idle = 15 - r.searchTotal - r.odometer * posT;
      console.log('   Lv' + lv + '     ' + String(chase).padStart(2) +
        '    ' + String(r.hits).padStart(2) +
        '    ' + String(r.missed).padStart(2) +
        '    ' + String(r.odometer).padStart(2) +
        '     ' + String(Math.max(0, idle).toFixed(1)).padStart(5) + 's' +
        '      ' + String(r.energy).padStart(3) + (r.starved ? ' 断油!' : ''));
    }
    console.log('');
  }
}

/* ================= B. 逐日资源流水 ================= */
// 真实对局：白天追球、黄昏按「纯塔」摆、夜晚补防。记录每天的收支
function flow(tag, chaseLimit) {
  const env = mk(21);
  const { S, D, tick } = env;
  let dayChased = 0, prevStage = S.stage, lastDay = 1;
  const rows = [];
  let dWood = 0, dEnergyMin = 100, dEnergyEnd = 100, dSearch = 0, dMiss = 0;
  let dKill = 0, dBp = 0, dDurMin = 999, dBuilds = 0, dWreck = 0, dBuildAll = 0;
  let wIn = 0, wOut = 0;
  const seenLoot = new Set();

  function playTravel() {
    if (S.searching) return;
    const next = S.shops.find(s => !s.searched && !s.missed);
    if (!next) { S.carColT = 2.5; return; }
    if (chaseLimit > 0 && dayChased >= chaseLimit) { S.carColT = 2.5; return; }
    if (S.carColT !== next.col + 0.5) dayChased++;
    S.carColT = next.col + 0.5;
  }
  function playDusk() {
    // 纯塔流：r3~r8 每格补塔（实测最优）
    for (const r of [3, 4, 5, 6, 7, 8]) for (let c = 0; c < 5; c++) {
      if (S.buildings.some(b => b.col === c && b.row === r && !b.wreck)) continue;
      if (S.wood < 25 && S.towerItem <= 0) continue;
      S.buildType = 'tower'; D.build(c, r);
    }
  }
  let rt = 0;
  function playNight(dt) {
    rt -= dt; if (rt > 0) return; rt = 0.4;
    if (S.buildTask) return;
    for (let c = 0; c < 5; c++) {
      const th = S.monsters.some(m => m.col === c && !m.fly && m.v < 5 && m.v > 0.2);
      if (!th) continue;
      const has = S.buildings.some(b => b.col === c && !b.wreck && b.hp > b.maxhp * 0.3 && b.row < 5);
      if (has) continue;
      for (const r of [1, 2, 3, 4]) {
        if (!S.buildings.some(b => b.col === c && b.row === r && !b.wreck && b.hp > 0)) {
          if (S.wood < 25 && S.towerItem <= 0) break;
          S.buildType = 'tower'; D.build(c, r); return;
        }
      }
    }
    const w = S.buildings.find(b => b.wreck);
    if (w && S.wood >= 8) D.build(w.col, w.row);
  }
  function smartPick() {
    const want = S.speedLv < 5 ? 'speed' : 'tower';
    return S.pickCards.some(c => c.id === want) ? want : (S.pickCards[0] ? S.pickCards[0].id : 'tower');
  }

  let guard = 0;
  while (!S.over && guard++ < 60 * 60 * 60) {
    for (const sh of S.shops) {
      if (sh.searched && sh.loot && !seenLoot.has(sh)) {
        seenLoot.add(sh); wIn += sh.loot.wood;
      }
    }
    if (S.stage !== prevStage) { if (S.stage === 'travel') { dayChased = 0; } prevStage = S.stage; }
    if (S.pendingPick) { const b = S.blueprints; D.pick(smartPick()); if (S.blueprints < b) dBp++; continue; }
    if (S.stage === 'travel') playTravel();
    else if (S.stage === 'dusk') playDusk();
    else if (S.stage === 'night') playNight(0.05);
    tick(0.05);

    if (S.energy < dEnergyMin) dEnergyMin = S.energy;
    if (S.stage === 'night') {
      if (S.dur < dDurMin) dDurMin = S.dur;
      // 夜末快照：此刻还没换日，建筑还在
      if (S.stageT > 29.5) {
        dWreck = S.buildings.filter(b => b.wreck).length;
        dBuilds = S.buildings.filter(b => !b.wreck && b.hp > 0).length;
        dBuildAll = S.buildings.length;
      }
    }

    if (S.day !== lastDay || S.over) {
      const rec = {
        d: S.day, wood: S.wood, eMin: Math.round(dEnergyMin), eEnd: Math.round(S.energy),
        dur: Math.round(S.dur), durMin: Math.round(dDurMin),
        odo: S.odometer, srch: S.stat.search, miss: S.missed,
        kill: S.stat.kill, pick: dBp, bld: dBuilds, all: dBuildAll,
        wreck: dWreck,
        starved: S.starved
      };
      rows.push(rec);
      dEnergyMin = 100; dDurMin = 999; lastDay = S.day;
      if (S.over) break;
    }
  }

  console.log('\n=== B. 逐日流水 · ' + tag + ' ===');
  console.log('   天  木头  油min 耐久夜末 里程 累计撞 漏 击杀 抽卡 活/总 塌 断油');
  const show = rows.filter((r, i) => i < 4 || i % 5 === 4 || i === rows.length - 1);
  for (const r of show) {
    console.log('  ' + String(r.d).padStart(3) +
      '  ' + String(r.wood).padStart(4) +
      '  ' + String(r.eMin).padStart(4) +
      '  ' + String(r.dur).padStart(4) + '/' + String(r.durMin).padStart(3) +
      '  ' + String(r.odo).padStart(4) +
      '  ' + String(r.srch).padStart(5) +
      '  ' + String(r.miss).padStart(2) +
      '  ' + String(r.kill).padStart(4) +
      '  ' + String(r.pick).padStart(4) +
      '  ' + String(r.bld).padStart(2) + '/' + String(r.all).padStart(2) +
      '  ' + String(r.wreck).padStart(2) +
      '   ' + (r.starved ? 'Y' : '-'));
  }
  const last = rows[rows.length - 1];
  const avgOdo = (last.odo / last.d).toFixed(2);
  console.log('  → 活到 day ' + last.d + '，里程 ' + last.odo + '（日均 ' + avgOdo + ' 户）');
  console.log('  → 木头总收入 ' + wIn + '，抽卡 ' + last.pick + '，击杀 ' + last.kill);
  console.log('  → 按此日均，800 户需 ' + Math.ceil(800 / avgOdo) + ' 天（上限 100 天）');
  return { rows, last };
}

/* ================= C. 格子预算 ================= */
function grid() {
  console.log('\n=== C. 格子预算（5 道 × 9 排 = 45 格） ===');
  const cases = [
    ['纯塔饱和（实测最优解）', { tower: 25 }],
    ['纯塔 + 前排路障 5', { tower: 20, barricade: 5 }],
    ['混建：塔 15 + 篝火 10 + 路障 5', { tower: 15, campfire: 10, barricade: 5 }],
    ['五种全上：塔 12 + 篝 8 + 障 5 + 油 4 + 信 1', { tower: 12, campfire: 8, barricade: 5, oil: 4, signal: 1 }],
    ['五章第 5 章灯火：篝火要铺满诱饵', { tower: 12, campfire: 18, barricade: 4, oil: 3, signal: 1 }],
  ];
  for (const [name, comp] of cases) {
    const total = Object.values(comp).reduce((a, b) => a + b, 0);
    console.log('  ' + name.padEnd(42) + ' 占 ' + String(total).padStart(2) + '/45 格' +
      (total > 45 ? '  <<< 超了 ' + (total - 45) : '  余 ' + (45 - total)));
  }
  console.log('  说明：整备期可全拆重建，格子不是永久的；但单晚 45 格是硬上限。');
}

/* ================= D. 卡池填充 ================= */
function pool() {
  console.log('\n=== D. 卡池填充率 ===');
  const LAYERS = 62;
  // 抽卡来源：图纸掉落 + 200 木换图纸
  const draws = [
    ['只靠掉落（34~51 天实测）', 27, 41],
    ['掉落 + 换图纸（净余 41 木/天，200 木 1 张）', 27 + Math.floor(34 * 41 / 200), 41 + Math.floor(51 * 41 / 200)],
    ['满配：嗅图满层（每 4 天 +1）', 27 + 8, 41 + 12],
  ];
  for (const [name, lo, hi] of draws) {
    console.log('  ' + name.padEnd(40) + ' ' + String(lo).padStart(3) + '~' + hi +
      ' 抽 → 填充 ' + (lo / LAYERS * 100).toFixed(0) + '%~' + (hi / LAYERS * 100).toFixed(0) + '%');
  }
  console.log('  单线点满成本（层数）：火 11 / 箭 9 / 障 8 / 油 8 / 信 6 / 车 11 / 搜 9');
  console.log('  → 抽 33~45 次时，能点满 2~3 条线（21~24 层）+ 余量散投');
}

/* ================= E. 无效机制扫描 ================= */
function dead() {
  console.log('\n=== E. 机制活性扫描（有没有边际收益） ===');
  // 1. 油
  console.log('\n  1) 油（能量）：行进燃料');
  console.log('     消耗：1 点 / 户，每天最多 8 户 = 8 点');
  console.log('     收入：民房 5~8 面 × 15 = 75~120 点（截断 100）；超市/医院 60% × 15 = 15 点');
  console.log('     → 撞到 1 个民房的能量 = 9~15 天的行进消耗。上限 100 点 = 12 天不用加油');
  console.log('     → 判定：饱和资源，starved（断油）几乎不会发生');
  // 2. 治疗药
  console.log('\n  2) 治疗药：+40 耐久 / 个');
  console.log('     耐久上限 120（Lv1）~200（Lv5 护板满层 220）');
  console.log('     → 一个药 = 上限的 18%~33%。医院 55% 概率掉，一天 1 个球 → 有效');
  // 3. 加速药
  console.log('\n  3) 加速药：60 秒 = 搜刮 ×0.62 + 建造提速');
  console.log('     一面包 60 秒覆盖整天（71 秒）。超市 10% 概率掉');
  console.log('     → 白天 15 秒内省 8×1.4×0.38 = 4.3 秒 = 多走 7.7 户（Lv1）');
  console.log('     → 判定：数值上极强，但掉率 10% × 只有前 5 球 → 实际几乎拿不到，是「彩票」不是「资源」');
  // 4. 塔等级
  console.log('\n  4) 塔等级（towerLv 1~5）：+18%/级 伤害');
  console.log('     实测 Lv1 与 Lv5 结果完全一致（25 座塔已饱和，伤害溢出）');
  console.log('     → 定稿 2.4 已修（曲线递减 + 怪随天变强），但要看怪血公式是否真的能压住');
  // 5. 木头
  console.log('\n  5) 木头：');
  console.log('     日收入 ~216，标准开支 175，上限 400 → 长期贴顶');
  console.log('     定稿 2.2 加「200 木换图纸」：每天 1 次 = 每天能消耗 200');
  console.log('     → 若有 200 木出口，每天净收 216 - 175 - 200 = -159，会变成「木荒」');
}

/* ================= F. 防线临界点 ================= */
function fort() {
  const med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  function oneNight(day, nTower, nFire, seed) {
    let pending = null, clock = 0;
    const g = createGame({ canvas: {}, ctx, width: 375, height: 700, images: {}, now: () => clock, raf: f => { pending = f; } });
    const S = g.state(), D = g.debug; S.seed = seed;
    D.setDay(day); S.wood = 99999; S.towerLv = 1; S.dur = 120; S.durMax = 120;
    D.setStage('dusk', 0);
    let placed = 0;
    for (let r = 8; r >= 1 && placed < nTower; r--) for (let c = 0; c < 5 && placed < nTower; c++) {
      S.buildType = 'tower'; if (D.build(c, r)) placed++;
    }
    let f = 0;
    for (let r = 1; r <= 3 && f < nFire; r++) for (let c = 0; c < 5 && f < nFire; c++) {
      S.buildType = 'campfire'; if (D.build(c, r)) f++;
    }
    S.buildTask = null;
    for (const b of S.buildings) { b.hp = b.maxhp; b.wreck = false; }
    D.enterNight(); S.spawnTimer = 0.8; S.dur = S.durMax;
    const d0 = S.dur;
    let leak = 0; const track = new Set();
    for (let i = 0; i < 30 / 0.02; i++) {
      clock += 20; if (pending) { const p = pending; pending = null; p(); }
      for (const m of S.monsters) if (!m.dead && m.v <= 0.32 && !track.has(m)) { track.add(m); leak++; }
    }
    return { leak, dmg: Math.round(d0 - S.dur) };
  }
  console.log('\n=== F. 防线规模 vs 一夜车损（7 局中位数，120 = 车毁） ===');
  console.log('   day   5塔   8塔  12塔  16塔  20塔  25塔  30塔');
  for (const day of [20, 40, 60, 80, 100]) {
    const row = [];
    for (const n of [5, 8, 12, 16, 20, 25, 30]) {
      const runs = []; for (let s = 1; s <= 7; s++) runs.push(oneNight(day, n, 0, s * 37 + day));
      row.push(med(runs.map(r => r.dmg)));
    }
    console.log('   ' + String(day).padStart(3) + '  ' + row.map(v => String(v).padStart(5)).join(' '));
  }
  console.log('\n   → 临界塔数：day20≈12 / day40≈16 / day60≈20 / day80≈25 / day100≈30');
  console.log('   → 每天收入 216 木只能建 8 座，day 40 起必然崩');
}

const mode = process.argv[2] || 'all';
if (mode === 'clock') clock();
else if (mode === 'flow') { flow('认真玩（每天追 7 球）', 7); flow('普通玩（每天追 5 球）', 5); }
else if (mode === 'grid') grid();
else if (mode === 'pool') pool();
else if (mode === 'dead') dead();
else if (mode === 'fort') fort();
else { clock(); fort(); grid(); pool(); dead(); }
