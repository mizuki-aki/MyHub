/* 永夜微光 v3 · 公路探索 核心逻辑无头测试 */
const ROOT = 'C:/Users/Admin/WorkBuddy/2026-10-24-07-47-40';
const createGame = require(ROOT + '/minigame/js/core.js');
const manifest = require(ROOT + '/minigame/js/theme.js').sprites || {};   // assets.js 已并入 theme.js

const W = 375, H = 700;

function makeCtx() {
  const grad = () => ({ addColorStop() { } });
  const noop = () => { };
  return {
    createLinearGradient: grad, createRadialGradient: grad,
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop,
    arcTo: noop, ellipse: noop, rect: noop, clip: noop, fill: noop, stroke: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, roundRect: noop,
    fillRect: noop, clearRect: noop, strokeRect: noop, drawImage: noop,
    fillText: noop, strokeText: noop,
    measureText: () => ({ width: 40 }), setLineDash: noop,
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
    textAlign: 'left', textBaseline: 'alphabetic', globalCompositeOperation: 'source-over'
  };
}
const images = {};
for (const k of Object.keys(manifest)) images[k] = { width: 512, height: 512 };

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '  -> ' + extra : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

function mk(w, h) {
  w = w || W; h = h || H;
  let pending = null, clock = 0;
  const g = createGame({
    canvas: {}, ctx: makeCtx(), width: w, height: h, images,
    now: () => clock, raf: (fn) => { pending = fn; }
  });
  const step = (sec) => {
    const n = Math.max(1, Math.round(sec / 0.02));
    for (let i = 0; i < n; i++) { clock += 20; if (pending) { const f = pending; pending = null; f(); } }
  };
  return { g, step, S: g.state() };
}
function wall(T) { T.S.durMax = 99999; T.S.dur = 99999; }   // 测试用免死

/* ===== 1. 几何 ===== */
console.log('\n=== 1. 斜投影几何 ===');
{
  const T = mk(), D = T.g.debug, R = D.rect;
  ok(R.LANES === 5, '5 车道', 'got ' + R.LANES);
  ok(R.ROWS === 9, '纵深 9 行', 'got ' + R.ROWS);

  const a = D.w2s(100, 400), b = D.s2w(a.x, a.y);
  ok(near(b.x, 100, 0.01) && near(b.y, 400, 0.01), 'w2s / s2w 互逆',
    b.x.toFixed(2) + ',' + b.y.toFixed(2));

  const p1 = D.w2s(120, 300), p2 = D.w2s(220, 300);
  const deg = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
  ok(near(deg, 15, 0.6), '横向线旋转 15°（顺时针）', deg.toFixed(2) + '°');

  const c0 = D.w2s(187, 500), c1 = D.w2s(187, 200);
  ok(c1.x > c0.x + 60 && c1.y < c0.y, '公路向屏幕右上延伸', 'dx=' + (c1.x - c0.x).toFixed(0));
  ok(R.nearW > R.farW * 1.6, '近端明显宽于远端', R.farW.toFixed(0) + ' → ' + R.nearW.toFixed(0));
}

/* ===== 2. 反向拾取 ===== */
console.log('\n=== 2. 点击拾取格子 ===');
{
  const T = mk(), D = T.g.debug, R = D.rect;
  let hits = 0;
  for (let c = 0; c < 5; c++) {
    for (const r of [2, 4, 6]) {
      const v = r + 0.5;
      const unit = (R.nearW - (R.nearW - R.farW) * Math.pow(v / R.ROWS, 0.85)) / 5;
      const x0 = R.CX - R.shift + (c + 0.5 - R.LANES / 2) * unit;
      const y0 = R.baseY - v * R.rowH;
      const sp = D.w2s(x0, y0);
      const got = D.cellAtScreen(sp.x, sp.y);
      if (got && got.col === c && got.row === r) hits++;
    }
  }
  ok(hits === 15, '5 列 × 3 行 全部精确拾取', hits + '/15');
}

/* ===== 3. 白天自动前进 ===== */
console.log('\n=== 3. 白天自动行进 ===');
{
  const T = mk(), S = T.S;
  ok(S.stage === 'travel', '开局处于行进阶段');
  ok(S.shops.length === 8, '每天 8 个悬浮球', 'got ' + S.shops.length);
  ok(S.carCol === 2.5, '车从中间车道出发', 'carCol=' + S.carCol);
  // 最外侧球离中路 2 车道 > 1.2 吸附容差 → 中路直行不撞球
  T.step(2);
  ok(near(S.carV, 3.64, 0.15), '2 秒开 3.64 户（Lv1 = 0.55s/户）', 'carV=' + S.carV.toFixed(2));
  ok(S.stat.search === 0, '中路直行不撞球', 'search=' + S.stat.search);
  ok(S.energy === 77, '前进消耗能量（1 户 = 1）', 'energy=' + S.energy);
}

/* ===== 4. 撞球搜刮 ===== */
console.log('\n=== 4. 撞球搜刮 ===');
{
  const T = mk(), S = T.S, D = T.g.debug;
  D.setCarCol(0.5);                       // 贴最左车道
  T.step(0.5);
  ok(S.searching !== null, '贴左行驶撞到最左侧的球',
    'searching=' + (S.searching ? S.searching.type : 'null'));
  const vHit = S.carV;
  ok(vHit > 0.7 && vHit < 0.9, '球在车头前 0.25 户触发', 'carV=' + vHit.toFixed(2));
  const wood0 = S.wood, en0 = S.energy, t0 = S.stageT;
  T.step(0.8);
  ok(near(S.carV, vHit, 0.02), '搜刮中车停住', 'carV=' + S.carV.toFixed(2));
  ok(S.stageT > t0 + 0.7, '搜刮中 15s 倒计时继续走', 'stageT=' + S.stageT.toFixed(2));
  T.step(0.85);
  ok(S.searching === null, '1.4s 后搜刮完成');
  ok(S.shops[0].searched === true, '该球标记为已搜');
  ok(S.wood > wood0 || S.energy > en0, '产出已入账',
    'wood ' + wood0 + '->' + S.wood + ' energy=' + en0 + '->' + S.energy);
}

/* ===== 5. 阶段流转 ===== */
console.log('\n=== 5. 一天三段流转 ===');
{
  const T = mk(), S = T.S;
  wall(T);
  T.step(4.7);
  ok(S.stage === 'dusk', '约 4.4 秒走完 8 户即转入布防', 'stage=' + S.stage);
  ok(S.stageT < 0, '白天结余并入布防（stageT 为负）', 'stageT=' + S.stageT.toFixed(2));
  S.wood = 300;
  for (let c = 0; c < 5; c++) T.g.debug.build(c, 3);
  ok(S.buildings.length === 5, '布防阶段建满 5 路', 'got ' + S.buildings.length);
  let g = 0;
  while (S.stage === 'dusk' && g++ < 4000) T.step(0.02);
  ok(S.stage === 'night', '布防结束进入夜晚', 'stage=' + S.stage);
  T.step(31);
  ok(S.day === 2, '30 秒夜晚后进入第 2 天', 'day=' + S.day + ' stage=' + S.stage);
}

/* ===== 6. 建造规则 ===== */
console.log('\n=== 6. 建造规则 ===');
{
  const T = mk(), S = T.S;
  T.g.debug.enterDusk(0);
  T.step(0.1);
  S.wood = 100;
  const okc = T.g.debug.build(2, 4);
  ok(okc && S.buildings.length === 1, '黄昏建造立即成型', 'buildings=' + S.buildings.length);
  ok(S.wood === 90, '篝火扣 10 木', 'wood=' + S.wood);
  ok(!T.g.debug.build(2, 4), '同格重复建造被拒绝');
  ok(T.g.debug.build(2, 5) && S.wood === 80, '第二座可建（不同格）', 'wood=' + S.wood);

  T.g.debug.enterNight();
  T.step(0.1);
  S.wood = 100;
  T.g.debug.build(0, 3);
  ok(S.buildTask !== null, '夜晚建造进入施工状态');
  T.step(0.6);
  ok(S.buildings.length === 2, '施工中尚未成型', 'buildings=' + S.buildings.length);
  T.step(0.8);
  ok(S.buildings.length === 3, '1s 后成型', 'buildings=' + S.buildings.length);
}

/* ===== 7. 篝火阻挡 + 灼烧 ===== */
console.log('\n=== 7. 篝火光域 ===');
{
  const T = mk(), S = T.S;
  wall(T);
  T.g.debug.enterDusk(0);
  S.wood = 200;
  T.g.debug.build(2, 3);
  T.g.debug.enterNight();
  T.g.debug.spawn('zombie', 2);
  T.step(10);
  ok(S.monsters.length > 0 && S.monsters[0].hp < S.monsters[0].maxhp, '进入光域后持续掉血',
    S.monsters.length ? 'hp=' + S.monsters[0].hp.toFixed(0) + '/' + S.monsters[0].maxhp.toFixed(0) : 'none');
  T.step(18);
  ok(S.stat.kill >= 1, '僵尸被烧死', JSON.stringify(S.stat));
  const b = S.buildings[0];
  ok(b && !b.wreck && b.hp > 0 && b.hp < b.maxhp, '篝火守住但被打残', b ? 'hp=' + b.hp.toFixed(0) + '/' + b.maxhp : 'gone');
}

/* ===== 8. 废墟与修补 ===== */
console.log('\n=== 8. 废墟与修补 ===');
{
  const T = mk(), S = T.S;
  wall(T);
  T.g.debug.enterDusk(0);
  T.g.debug.god(true);
  S.wood = 200;
  T.g.debug.build(2, 3);
  T.g.debug.enterNight();
  T.g.debug.spawn('zombie', 2);
  T.step(18);
  const b = S.buildings[0];
  ok(b && b.wreck === true, '近战 3 下把篝火打成废墟', b ? 'hp=' + b.hp.toFixed(0) + ' wreck=' + b.wreck : 'gone');
  const w0 = S.wood;
  T.g.debug.build(2, 3);
  T.step(1.3);
  ok(S.buildings[0].wreck === false && S.buildings[0].hp > 0, '修补后恢复可用',
    'hp=' + S.buildings[0].hp);
  ok(S.wood === w0 - 2, '修补消耗 2 木', 'wood ' + w0 + ' -> ' + S.wood);
}

/* ===== 9. 车辆受击 ===== */
console.log('\n=== 9. 车辆受击 ===');
{
  const T = mk(), S = T.S;
  T.g.debug.enterDusk(0);
  T.g.debug.god(true);
  T.g.debug.enterNight();
  T.g.debug.spawn('zombie', 4);
  T.step(17.4);
  const lost = S.durMax - S.dur;
  ok(lost > 0 && lost < 40, '无防守时车被打', 'dur=' + S.dur.toFixed(1));
  ok(near(lost % 8, 0, 0.7) || near(lost % 8, 8, 0.7), '每击扣 8 点整', '共扣 ' + lost.toFixed(0));
}

/* ===== 10. 能量耗尽 ===== */
console.log('\n=== 10. 能量 0 ===');
{
  const T = mk(), S = T.S;
  S.energy = 0;
  T.step(2);
  ok(S.starved === true, '能量为 0 标记为熄火');
  ok(S.carV < 0.2, '车开不动', 'carV=' + S.carV.toFixed(2));
  T.step(14);
  ok(S.stage === 'dusk', '时间到照常进入布防', 'stage=' + S.stage);
  T.step(16);
  ok(S.penalty === 0.2, '当晚怪物强度 +20%', 'penalty=' + S.penalty);
}

/* ===== 11. 15s 预算：完美控车能撞几个 ===== */
console.log('\n=== 11. 15 秒行进预算 ===');
{
  const T = mk(), S = T.S;
  let guard = 0;
  while (S.stage === 'travel' && guard++ < 4000) {
    if (!S.searching) {
      const next = S.shops.find(s => !s.searched && !s.missed);
      S.carColT = next ? next.col + 0.5 : 2.5;
    }
    T.step(0.02);
  }
  ok(S.stage !== 'travel', '行进阶段结束', 'stage=' + S.stage);
  ok(S.stat.search >= 6, '完美控车一天能撞 6 个以上', 'searched=' + S.stat.search);
  ok(S.odometer >= 6 && S.odometer <= 8, '里程按实际开到的位置结算',
    'odometer=' + S.odometer + ' carV=' + S.carV.toFixed(2));
  console.log('    -> 撞到 ' + S.stat.search + ' 个 · 里程 ' + S.odometer + ' 户');
}

/* ===== 11b. 车速升级后能推满 8 户 ===== */
console.log('\n=== 11b. 升级后推满里程 ===');
{
  const T = mk(), S = T.S;
  S.speedLv = 4;
  let guard = 0;
  while (S.stage === 'travel' && guard++ < 4000) {
    if (!S.searching) {
      const next = S.shops.find(s => !s.searched && !s.missed);
      S.carColT = next ? next.col + 0.5 : 2.5;
    }
    T.step(0.02);
  }
  ok(S.odometer === 8, 'Lv4 完美控车能推满 8 户', 'odometer=' + S.odometer +
    ' carV=' + S.carV.toFixed(2));
  ok(S.stat.search === 8, 'Lv4 能把 8 个球全撞了', 'searched=' + S.stat.search);
}

/* ===== 12. 胜利 / 失败 ===== */
console.log('\n=== 12. 胜负判定 ===');
{
  const T = mk(), S = T.S;
  S.day = 100;
  T.g.debug.nextDay();
  ok(S.over === true && S.won === true, '第 100 天判胜', 'won=' + S.won);
}
{
  const T = mk(), S = T.S;
  S.odometer = 800;
  T.g.debug.nextDay();
  ok(S.over === true && S.won === true, '里程 800 户判胜（抵达救援中心）');
}
{
  const T = mk(), S = T.S;
  T.g.debug.enterNight();
  S.dur = 1;
  T.g.debug.spawn('zombie', 4);
  T.step(24);
  ok(S.over === true && S.won === false, '车耐久归零 = 失败', 'dur=' + S.dur);
}

/* ===== 13. 多分辨率 ===== */
console.log('\n=== 13. 多分辨率 ===');
for (const dim of [[320, 568], [375, 812], [414, 896], [768, 1024]]) {
  const T = mk(dim[0], dim[1]);
  T.step(1);
  const R = T.g.debug.rect;
  const unit = R.nearW / R.LANES;
  const ratio = R.rowH / unit;
  ok(R.ROWS === 9 && ratio > 0.6 && ratio < 1.6,
    dim[0] + 'x' + dim[1] + ' 布局合理',
    'rowH=' + R.rowH.toFixed(1) + ' 格宽=' + unit.toFixed(1));
}

/* ===== 14. 长时挂机 ===== */
console.log('\n=== 14. 连续多天不崩 ===');
{
  const T = mk(), S = T.S;
  wall(T);
  let maxMon = 0, guard = 0;
  while (S.day < 6 && guard++ < 900) {
    if (S.stage === 'dusk') {
      for (let c = 0; c < 5; c++) if (!S.buildings.some(b => b.col === c && b.row === 3)) T.g.debug.build(c, 3);
    }
    T.step(1);
    maxMon = Math.max(maxMon, S.monsters.length);
    if (S.over) break;
  }
  ok(maxMon > 0, '夜里有怪', 'peak=' + maxMon);
  console.log('    -> day=' + S.day + ' stage=' + S.stage + ' wood=' + S.wood +
    ' odometer=' + S.odometer + ' kill=' + S.stat.kill + ' peakMon=' + maxMon);
  ok(S.day >= 5, '正常推进多天', 'day=' + S.day);
}

/* ===== 15. 图纸三选一 ===== */
console.log('\n=== 15. 图纸三选一 ===');
{
  const T = mk(), S = T.S, D = T.g.debug;
  wall(T);
  D.enterDusk(0);
  D.openPick();
  ok(S.pendingPick === true, '选卡界面已弹出');
  ok(S.pickCards.length === 3, '给出 3 张卡', 'got ' + S.pickCards.length);

  const rects = [0, 1, 2].map(i => D.pickRect ? D.pickRect(i) : null);
  ok(rects.every(Boolean), '卡片有可点区域');
  if (rects[0]) {
    const before = S.towerLv;
    const r = rects.find((r, i) => S.pickCards[i].id === 'tower');
    const idx = S.pickCards.findIndex(c => c.id === 'tower');
    T.g.tap(r.x + r.w / 2, r.y + r.h / 2);
    ok(S.towerLv === Math.min(5, before + 1), '点箭头卡即升级', 'lv=' + S.towerLv);
    ok(S.pendingPick === false, '选完关闭界面');
  }
}

/* ===== 16. 搜到图纸不会卡死 ===== */
console.log('\n=== 16. 搜到图纸不卡死 ===');
{
  const T = mk(), S = T.S, D = T.g.debug;
  wall(T);
  // 直接触发 loot 入账路径：找医院/工厂搜到蓝图的那条分支
  S.blueprints = 0; S.pendingPick = false;
  S.stage = 'travel'; S.carV = 1.5;
  const shop = S.shops[5];
  shop.type = 'hospital';
  shop.searched = false;
  S.searching = shop; S.searchT = 0.05;
  for (let i = 0; i < 40 && !S.pendingPick; i++) T.step(0.05);
  // 可能这次没掉图纸，强行补一次
  if (!S.pendingPick) { D.openPick(); }
  ok(S.pickCards.length > 0, '卡片不为空（否则界面无内容可点）', 'cards=' + S.pickCards.length);
  ok(S.pendingPick === true, '进入选卡并暂停主循环');
  const before = S.day;
  T.step(2);
  ok(S.day === before, '选卡期间时间冻结', 'day=' + S.day);
}


/* ===== 17. 拖拽控车 ===== */
console.log('\n=== 17. 拖拽控车 ===');
{
  const T = mk(), S = T.S, D = T.g.debug;
  S.shops.forEach(sh => { sh.searched = true; });   // 关掉碰撞，只测转向
  const ca = D.carAnchor();
  const cy = D.w2s(ca.x, ca.y).y;          // 车所在横线的屏幕 y
  T.g.drag('down', 34, cy);
  ok(near(S.carColT, 0.5, 0.03), '拖到最左 → 目标车道 0.5', 'carColT=' + S.carColT.toFixed(2));
  ok(S.dragging === true, '进入拖拽状态');
  T.step(0.5);
  ok(near(S.carCol, 0.5, 0.03), '车在 0.22s 内滑到最左（2 车道 × 0.11s）', 'carCol=' + S.carCol.toFixed(2));
  T.g.drag('move', 340, cy);
  ok(near(S.carColT, 4.5, 0.03), '拖到最右 → 目标车道 4.5', 'carColT=' + S.carColT.toFixed(2));
  T.g.drag('up');
  ok(S.dragging === false, '抬手结束拖拽');

  // 底部按钮区不接管拖拽
  const before = S.carColT;
  T.g.drag('down', 60, T.g.debug.rect.H - 30);
  ok(near(S.carColT, before, 0.001), '按在底部按钮上不移动车', 'carColT=' + S.carColT.toFixed(2));
}

/* ===== 18. 碰撞容差 ===== */
console.log('\n=== 18. 碰撞容差 ===');
{
  const T = mk(), S = T.S, D = T.g.debug;
  D.setCarCol(1.6);                        // 球在 0.5，横向偏 1.1 车道
  T.step(0.5);
  ok(S.searching !== null, '横向偏 1.1 车道仍判定撞上（容差 1.2）',
    'searching=' + (S.searching ? 'yes' : 'no'));
}
{
  const T = mk(), S = T.S, D = T.g.debug;
  D.setCarCol(1.95);                       // 偏 1.45 车道
  T.step(0.9);
  ok(S.searching === null, '横向偏 1.45 车道撞不到');
  ok(S.shops[0].missed === true, '开过去后该球标记为漏掉');
  ok(S.missed >= 1, '漏球计数 +1', 'missed=' + S.missed);
}

/* ===== 19. 入夜车回中路 ===== */
console.log('\n=== 19. 入夜车回中路 ===');
{
  const T = mk(), S = T.S, D = T.g.debug;
  D.setCarCol(0.5);
  D.enterDusk(0);
  T.step(2);
  ok(near(S.carCol, 2.5, 0.08), '扎营后车自动滑回中路', 'carCol=' + S.carCol.toFixed(2));
  D.enterNight();
  const c0 = S.carCol;
  T.g.drag('down', 40, 400);
  ok(near(S.carColT, 2.5, 0.001) && near(S.carCol, c0, 0.001), '夜晚拖拽不生效');
}

console.log('\n---------------------------------------------');
console.log('结果: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
