# 永夜微光 v2.9 · 微信小游戏成品

末世公路生存：开着车灯走完一条永夜公路。白天**拖屏换道撞悬浮球**搜刮（撞球不停车，扣时间），黄昏 **30 秒布防**（可跳过），夜晚**守车**。**100 天内走完 800 户**抵达救援中心是唯一胜利条件。

> 玩法实现与 `demo/v25_text.html`（v2.6 数值 + v2.7 文案口径 + v2.9 路面风格）完全同源；`js/core.js` 是旧架构参考实现，当前版本不引用。

## 目录

```
minigame/
├── game.js             入口（只 require js/game.js）
├── game.json           竖屏配置
├── project.config.json compileType: game
├── js/game.js          玩法主体（约 2000 行，含封面/存储/震动/分享）
├── js/theme.js         ★ 素材快速替换层
├── js/core.js          旧架构参考实现（未引用，包内可留可删）
└── images/yuxia.png    小鱼头像（21KB，可整体替换）
```

用微信开发者工具导入 `minigame/` 目录即可运行（`project.config.json` 里 `appid` 目前是测试号 `touristappid`，上架前换成自己的 AppID）。

## 换素材（不改代码）

| 要换什么 | 怎么做 |
|---|---|
| 小鱼头像 | 裁成 256×256，覆盖 `images/yuxia.png`。形象参考：`assets/refs/yuxia_ref.jpeg`。**删除该文件**则自动回退为内置矢量头像 |
| 增加贴图（建筑/车等） | 在 `js/theme.js` 里加路径，在 `js/game.js` 对应绘制函数里优先画图、缺图回退矢量（与 `AVATAR` 同一模式） |

所有素材可缺省：任何一张图缺失或加载失败，游戏照常运行。

## 微信能力

| 能力 | 接入点 |
|---|---|
| 触控 | `wx.onTouchStart/Move/End/Cancel` → 与浏览器鼠标同一路径 |
| 存档 | 最好成绩 `wx.setStorageSync("yy_best_v1")`（通关天数 / 最远百分比） |
| 震动 | 撞球 light、闷囊/败局 heavy |
| 分享 | `wx.onShareAppMessage`：按进度动态生成文案 |
| 适配 | 逻辑分辨率 375×780 等比缩放居中，dpr 上限 2；极端宽屏（平板）两侧留黑边 |

## 自测

```bash
# Node 无头两局（不需要任何依赖）
node -e "const {YY}=require('./minigame/js/game.js');YY.start();console.log(YY.sim(200,'greedy'))"

# 浏览器无头截图（封面/白天/黄昏/夜晚/结算/多机型）
node tools/shot.mjs "file://.../tools/harness.html" shots/x.png 390 844 1600 "YY.start();..."
```

基线：贪心 3 局 89~90 天 / 802~807 户全胜。

## 上架前清单

- [ ] `project.config.json` 换正式 AppID
- [ ] 微信开发者工具真机预览（iOS / Android 各一台）
- [ ] 后台配置「服务类目」（休闲游戏）与隐私协议（本作不收集任何数据）
- [ ] 包体积检查（当前 ~100KB，远低于 4MB 主包限制）
