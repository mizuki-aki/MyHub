/* 篝火「种进地里」参数对比图 */
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const ROOT = 'C:/Users/Admin/WorkBuddy/2026-10-24-07-47-40';

(async () => {
  const img = await loadImage(path.join(ROOT, 'minigame/images/building/campfire.png'));
  const H_IMG = 150;
  const CELL_W = 210, CELL_H = 230;
  const canvas = createCanvas(CELL_W * 4, CELL_H);
  const ctx = canvas.getContext('2d');

  // 草地底
  ctx.fillStyle = '#6f9f5c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(26,42,22,.16)';
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * CELL_W, 0); ctx.lineTo(i * CELL_W, canvas.height); ctx.stroke();
  }

  function ell(cx, cy, rx, ry, style) {
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.2832);
    ctx.fillStyle = style; ctx.fill();
  }
  function half(cx, cy, rx, ry, style) {
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
    ctx.fillStyle = style; ctx.fill();
  }

  // 变体：sink(占高比), pitRy(占宽比), lipRy(占宽比), 是否先画坑
  const variants = [
    { name: 'M 小土斑+薄唇+草', sink: 0.05, pitRy: 0.085, lipRy: 0.035, clip: false, full: false, grass: 8, dirt: ['rgba(44,33,22,.62)', 'rgba(52,39,25,.85)', 'rgba(68,52,34,.8)', 'rgba(88,68,46,.3)'] },
    { name: 'N 土斑+厚唇+草', sink: 0.05, pitRy: 0.10, lipRy: 0.055, clip: false, full: false, grass: 8, dirt: ['rgba(44,33,22,.65)', 'rgba(50,38,24,.9)', 'rgba(66,50,33,.85)', 'rgba(86,66,44,.3)'] },
    { name: 'O 无坑 只薄唇+草', sink: 0.05, pitRy: 0.0, lipRy: 0.045, clip: false, full: false, grass: 10, dirt: [null, 'rgba(48,36,23,.88)', 'rgba(64,48,32,.8)', 'rgba(84,64,42,.28)'] },
    { name: 'P 大土斑+草', sink: 0.05, pitRy: 0.13, lipRy: 0.05, clip: false, full: false, grass: 10, dirt: ['rgba(44,33,22,.6)', 'rgba(52,39,25,.88)', 'rgba(68,52,34,.82)', 'rgba(88,68,46,.3)'] },
  ];

  variants.forEach((v, i) => {
    const cx = CELL_W * (i + 0.5), cy = 175;
    const h = H_IMG, w = h * img.width / img.height;
    const sink = h * v.sink;

    ctx.save();
    // 接触阴影
    ell(cx, cy + 1, w * 0.38, w * 0.085, 'rgba(0,0,0,.16)');
    if (v.pitRy > 0) {
      ell(cx, cy + 1, w * 0.44, w * v.pitRy, v.dirt[0]);
      ell(cx, cy + 1, w * 0.34, w * v.pitRy * 0.72, 'rgba(24,16,9,.55)');
    }
    if (v.clip) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - w, cy - h * 2, w * 2, h * 2 + 1);
      ctx.clip();
      ctx.drawImage(img, cx - w / 2, cy + sink - h, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, cx - w / 2, cy + sink - h, w, h);
    }
    if (v.full) {
      ell(cx, cy + w * v.lipRy * 0.10, w * 0.44, w * v.lipRy, v.dirt[1]);
      ell(cx, cy - w * v.lipRy * 0.30, w * 0.40, w * v.lipRy * 0.62, v.dirt[2]);
      ell(cx, cy - w * v.lipRy * 0.55, w * 0.28, w * v.lipRy * 0.30, v.dirt[3]);
    } else {
      half(cx, cy + 1, w * 0.44, w * v.lipRy, v.dirt[1]);
      half(cx, cy + 1 - w * v.lipRy * 0.35, w * 0.40, w * v.lipRy * 0.78, v.dirt[2]);
      half(cx, cy + 1 - w * v.lipRy * 0.7, w * 0.30, w * v.lipRy * 0.45, v.dirt[3]);
    }
    ell(cx - w * 0.40, cy + 1, w * 0.06, w * 0.030, 'rgba(66,50,33,.85)');
    ell(cx + w * 0.40, cy + 1, w * 0.06, w * 0.030, 'rgba(66,50,33,.85)');
    if (v.grass) {
      for (let g = 0; g < v.grass; g++) {
        const t = (g + 0.5) / v.grass;
        const ang = Math.PI * (0.08 + t * 0.84);
        const gx = cx + Math.cos(Math.PI - ang) * w * 0.42;
        const gy = cy + Math.sin(ang) * w * Math.max(v.pitRy, 0.05);
        const hh = 5 + (g % 3) * 2.5;
        ctx.beginPath();
        ctx.moveTo(gx, gy + 1);
        ctx.quadraticCurveTo(gx - 1.5, gy - hh * 0.6, gx - 2.5, gy - hh);
        ctx.moveTo(gx, gy + 1);
        ctx.quadraticCurveTo(gx + 1.5, gy - hh * 0.7, gx + 2.5, gy - hh * 0.9);
        ctx.strokeStyle = 'rgba(70,112,56,.85)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.fillStyle = '#1b2416';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(v.name, cx, 24);
  });

  const out = path.join(ROOT, 'assets/debug/plant_variants.png');
  fs.writeFileSync(out, await canvas.encode('png'));
  console.log('wrote', out);
})();
