/* 永夜微光 · 素材快速替换层
 * --------------------------------------------------------------
 * 换素材只需改这个文件 + 替换 images/ 下同名文件，游戏代码不用动。
 * 所有素材都可缺省：文件不存在时自动回退到内置矢量绘制。
 *
 * 当前素材清单：
 *   images/yuxia.png   小鱼（车载导航精灵）头像
 *                      —— 形象参考：assets/refs/yuxia_ref.jpeg
 *                      替换方法：把新图裁成 256×256 圆形安全区，
 *                      覆盖 images/yuxia.png 即可，无需改代码。
 *                      删除该文件则回退为内置矢量头像。
 */
module.exports = {
  /* 小鱼头像（封面 + 对话条） */
  avatar: "images/yuxia.png"

  /* 后续扩展位（留档，正式美术阶段启用）：
   * buildings: { fire: "images/building/fire.png", tower: "...", ... },
   * car: "images/car.png",
   * palette: { road: "#1f2430", line: "#ffffff", edge: "#ffc45c", rail: "#d6e2f4" }
   */
};
