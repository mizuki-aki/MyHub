/* 平衡探针：模拟一个「会补防的普通玩家」，跑满 100 天看生存曲线与经济 */
const ROOT = 'C:/Users/Admin/WorkBuddy/2026-10-24-07-47-40';
const createGame = require(ROOT + '/minigame/js/core.js');

const noop = () => { };
const grad = () => ({ addColorStop() { } });
const ctx = new Proxy({}, {
  get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? grad
    : (k === 'measureText' ? () => ({ width: 10 }) : (typeof k === 'string' ? noop : undefined)),
  set: () => true
});

const W = 375, H = 700;
const CHASE = Number(process.argv[2] || 0);      // 每天最多追几个球（0 = 全追）
const SKIP = Number(process.argv[3] || 0);       // 主动放掉前 N 个球
const RESERVE = Number(process.argv[4] || 0);    // 夜里修废墟的木头预留

let pending = null, clock = 0;
const g = createGame({
  canvas: {}, ctx, width: W, height: H, images: {},
  now: () => clock, raf: (fn) => { pending = fn; }
});
const S = g.state();
const D = g.debug;

function tick(dt) {
  clock += dt * 1000;
  if (pending) { const f = pending; pending = null; f(); }
}

let dayChased = 0;
function playTravel() {
  if (S.searching) return;
  const next = S.shops.find(s => !s.searched && !s.missed);
  if (!next) { S.carColT = 2.5; return; }
  if (next.idx < SKIP) { S.carColT = 2.5; return; }              // 主动放掉
  if (CHASE > 0 && dayChased >= CHASE) { S.carColT = 2.5; return; }
  if (S.carColT !== next.col + 0.5) dayChased++;
  S.carColT = next.col + 0.5;
}

function playDusk() {
  const wants = [];
  for (let c = 0; c < 5; c++) wants.push([c, 2, 'campfire']);
  for (let c = 0; c < 5; c++) wants.push([c, 5, 'campfire']);
  for (let c = 0; c < 5; c++) wants.push([c, 7, 'tower']);

  for (const [c, r, type] of wants) {
    const cost = type === 'tower' ? 25 : 10;
    const hasItem = (type === 'tower' ? S.towerItem : S.campfireItem) > 0;
    if (!hasItem && S.wood < cost + RESERVE) continue;
    if (S.buildings.some(b => b.col === c && b.row === r && !b.wreck)) continue;
    S.buildType = type;
    D.build(c, r);
  }
}

let repairTimer = 0;
function playNight(dt) {
  repairTimer -= dt;
  if (repairTimer > 0) return;
  repairTimer = 0.35;
  if (S.buildTask) return;
  // 1) 临时补位：某条车道有怪逼近而前方已无完好篝火
  for (let c = 0; c < 5; c++) {
    const threat = S.monsters.some(m => m.col === c && !m.fly && m.v < 4.5 && m.v > 0.2);
    if (!threat) continue;
    const guard = S.buildings.some(b => b.col === c && b.type === 'campfire' && !b.wreck && b.hp > b.maxhp * 0.3 && b.row < 4);
    if (guard) continue;
    if (S.wood < 10 && S.campfireItem <= 0) continue;
    for (const r of [1, 2, 3]) {
      const has = S.buildings.some(b => b.col === c && b.row === r && !b.wreck && b.hp > 0);
      if (!has) { S.buildType = 'campfire'; D.build(c, r); return; }
    }
  }
  // 2) 修废墟
  const wreck = S.buildings.find(b => b.wreck);
  if (wreck && S.wood >= (wreck.type === 'tower' ? 8 : 2)) D.build(wreck.col, wreck.row);
}

let prevStage = S.stage;
let lastDay = 1;
const rows = [];
let guard = 0;

/* 真人玩家选卡：车速优先（决定 800 户线），耐久见底补耐久，其余给箭塔 */
const PICK_ORDER = () => {
  if (S.speedLv < 4) return 'speed';
  if (S.durLv < 3 && S.dur < S.durMax * 0.55) return 'dur';
  if (S.towerLv < 3) return 'tower';
  if (S.speedLv < 5) return 'speed';
  return 'tower';
};
function smartPick() {
  const want = PICK_ORDER();
  const has = S.pickCards.some(c => c.id === want);
  return has ? want : (S.pickCards[0] ? S.pickCards[0].id : 'tower');
}

while (!S.over && guard++ < 60 * 60 * 106) {
  if (S.stage !== prevStage) {
    if (S.stage === 'travel') dayChased = 0;
    prevStage = S.stage;
  }
  if (S.pendingPick) { D.pick(smartPick()); continue; }
  if (S.stage === 'travel') playTravel();
  else if (S.stage === 'dusk') playDusk();
  else if (S.stage === 'night') playNight(0.05);

  tick(0.05);

  if (S.day !== lastDay) {
    rows.push({ d: S.day - 1, wood: S.wood, dur: Math.round(S.dur), kill: S.stat.kill,
      odo: S.odometer, en: Math.round(S.energy) });
    lastDay = S.day;
  }
}

const show = rows.filter((r, i) => i < 10 || i % 10 === 9);
console.log('每日快照（天 / 木 / 车耐久 / 累计击杀 / 里程 / 能量）');
for (const r of show) {
  console.log('  d' + String(r.d).padStart(3) + '  wood=' + String(r.wood).padStart(3) +
    '  dur=' + String(r.dur).padStart(3) + '  kill=' + String(r.kill).padStart(3) +
    '  odo=' + String(r.odo).padStart(3) + '  energy=' + String(r.en).padStart(3));
}
console.log('\n结束: day=' + S.day + ' over=' + S.over + ' won=' + S.won +
  ' 里程=' + S.odometer + ' 耐久=' + Math.round(S.dur) + ' 木=' + S.wood +
  ' 击杀=' + S.stat.kill + ' 搜索=' + S.stat.search);
