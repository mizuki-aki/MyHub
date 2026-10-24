/* 离屏渲染游戏画面为 PNG（用于版式核对） */
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const ROOT = 'C:/Users/Admin/WorkBuddy/2026-10-24-07-47-40';
const createGame = require(ROOT + '/minigame/js/core.js');
const manifest = require(ROOT + '/minigame/js/assets.js');

const W = Number(process.argv[2] || 375);
const H = Number(process.argv[3] || 700);
const SCENE = process.argv[4] || 'travel';
const OUT = process.argv[5] || (ROOT + '/assets/debug/v4_' + SCENE + '.png');

(async () => {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const images = {};
  for (const k of Object.keys(manifest)) {
    images[k] = await loadImage(path.join(ROOT, 'minigame', manifest[k]));
  }

  let pending = null, clock = 0;
  const g = createGame({
    canvas, ctx, width: W, height: H, images,
    now: () => clock,
    raf: (fn) => { pending = fn; }
  });
  const S = g.state();
  const D = g.debug;

  const step = (sec) => {
    const frames = Math.max(1, Math.round(sec / 0.05));
    for (let i = 0; i < frames; i++) {
      clock += 50;
      if (pending) { const f = pending; pending = null; f(); }
    }
  };

  S.durMax = 99999; S.dur = 99999;      // 截图不判负

  if (SCENE === 'travel') {
    step(1.4);
  } else if (SCENE === 'travel_late') {
    step(3.2);
  } else if (SCENE === 'swing') {
    D.setCarCol(0.5);
    step(2.75);              // 撞完左侧两个球，正往右侧横穿
    S.carColT = 4.5;
    step(0.16);
  } else if (SCENE === 'search') {
    D.setCarCol(0.5);
    step(0.45);              // 撞上第一个球
    step(0.70);
  } else if (SCENE === 'dusk') {
    D.enterDusk(0);
    S.wood = 220;
    D.build(1, 4); D.build(2, 3); D.build(3, 5); D.build(0, 2);
    step(5.5);
  } else if (SCENE === 'night') {
    D.enterDusk(0);
    S.wood = 320;
    for (let c = 0; c < 5; c++) D.build(c, 3);
    D.build(2, 5); D.build(1, 6);
    D.enterNight();
    const mix = ['zombie', 'archer', 'slime', 'shadow', 'zombieB', 'zombie', 'archer'];
    for (let c = 0; c < 5; c++) D.spawn(mix[c], c);
    step(9);
    D.spawn('slime', 2); D.spawn('zombie', 0); D.spawn('archer', 3);
    step(1.4);
  } else if (SCENE === 'night_mid') {
    D.enterDusk(0);
    S.wood = 320;
    for (let c = 0; c < 5; c++) D.build(c, 4);
    D.enterNight();
    for (let c = 0; c < 5; c++) D.spawn('zombie', c);
    step(14);
  } else if (SCENE === 'pick') {
    D.enterDusk(0);
    step(0.5);
    S.blueprints = 1;
    D.openPick();
    step(0.1);
  } else if (SCENE === 'over') {
    D.enterDusk(0);
    step(0.5);
    S.over = true; S.won = true; S.odometer = 800; S.day = 100;
    step(0.05);
  }

  const buf = await canvas.encode('png');
  fs.writeFileSync(OUT, buf);
  const st = g.state();
  console.log('wrote', OUT, buf.length, 'bytes | stage=' + st.stage,
    JSON.stringify({ day: st.day, carV: +st.carV.toFixed(2), wood: st.wood,
      buildings: st.buildings.length, monsters: st.monsters.length, dur: Math.round(st.dur) }));
})();
