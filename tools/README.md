# tools

## 开发工具（日常用）

| 脚本 | 用途 |
|---|---|
| `test_core.js` | 78 项无头回归。mock canvas ctx + 受控时钟手动驱动 `raf`，覆盖几何换算、拖拽控车、碰撞容差、建造规则、昼夜流转、胜负判定 |
| `balance_probe.js` | 平衡探针。自动玩家跑满 100 天，输出每日存活、里程、击杀。参数：`<每日追球数> <放掉前几个球>` |
| `render_shot.js` | 离屏截图。场景 `travel / swing / search / dusk / night / pick / over`，参数 `<宽> <高> <场景>` |
| `build_preview.py` | 重建 `minigame/js/assets.js` 并生成内联图片的 `demo/preview.html` |

```bash
node tools/test_core.js
node tools/balance_probe.js 0 0
node tools/render_shot.js 375 700 night
python tools/build_preview.py
```

`test_core.js` 与 `render_shot.js` 依赖 `@napi-rs/canvas` 做离屏渲染，运行时需设 `NODE_PATH` 指向其安装位置：

```bash
export NODE_PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules"
```

## assets-preprocess/（一次性素材处理）

去水印、抠图边界检查、按类型分类、拼图预览、体积优化等脚本。它们读取的是本地 `assets/` 下的原始生成素材——那个目录约 265MB，未纳入版本库（见根目录 `.gitignore`），所以这些脚本单独 clone 后跑不起来，仅作过程留档。

工程实际使用的贴图已裁好放进 `minigame/images/`。
