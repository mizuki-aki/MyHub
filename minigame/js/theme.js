/* 永夜微光 · 素材快速替换层
 * --------------------------------------------------------------
 * 换素材只需改这个文件 + 替换 images/ 下同名文件，游戏代码不用动。
 * 所有素材都可缺省：文件不存在时自动回退到内置矢量绘制。
 *
 * 当前素材清单（AI 生成 · 暗黑末世卡通风 · 抠图去底 · 量化压缩）：
 *   avatar           小鱼头像 256×256（参考图 assets/refs/yuxia_ref.jpeg）
 *   orb_*            5 种悬浮补给囊：散装/罐头/药箱/料包/闷囊
 *   b_*              5 种建筑：篝火/箭塔/路障/油桶/信标
 *   car              越野车
 *   mob_*            3 种怪物：僵尸/骷髅弓手/紫黑影
 *   pile             建筑塌了变出的料堆
 *
 * 原图与中间产物：minigame/images/gen/{raw,processed}/（不上架，仅留档）
 * 换素材 = 覆盖 images/ 下同名 PNG，不改代码；删除文件则回退矢量。
 */
module.exports = {
  avatar: "images/yuxia.png",

  sprites: {
    orb_scatter: "images/orb_scatter.png",
    orb_can:     "images/orb_can.png",
    orb_med:     "images/orb_med.png",
    orb_parts:   "images/orb_parts.png",
    orb_hazard:  "images/orb_hazard.png",
    b_fire:      "images/b_fire.png",
    b_tower:     "images/b_tower.png",
    b_wall:      "images/b_wall.png",
    b_barrel:    "images/b_barrel.png",
    b_beacon:    "images/b_beacon.png",
    car:         "images/car.png",
    mob_zombie:  "images/mob_zombie.png",
    mob_archer:  "images/mob_archer.png",
    mob_shadow:  "images/mob_shadow.png",
    pile:        "images/pile.png"
  }
};
