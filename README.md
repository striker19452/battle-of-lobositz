# 罗布西茨会战电子版

《The Battle of Lobositz》的中英双语、手机优先电子化实现。

在线游玩：[GitHub Pages](https://striker19452.github.io/battle-of-lobositz/)

## 当前版本

当前版本为 v1.1.0，已经包含：

- 依据 `field.pdf` 标定的 94 个平顶六边形。
- 双方共 28 个数据化单位和 SVG 棋子。
- 历史模式按版图预印兵种符号部署，掷弹兵每局随机占据普通步兵位。
- 普鲁士先手、每方移动 3 个单位、攻击 2 个单位的回合框架。
- 移动范围、己方穿越、敌军阻挡、控制区停止、四条高程线跨越即停和易北河不可进入。
- 射程、单位阻挡、城镇/树林/高地阻挡，以及沿格边时的双路径视线判定。
- 单位攻击、两单位联合攻击、3D 掷骰动画、防御地形修正、混乱、自动撤退和消灭。
- 回合末恢复与普鲁士目标格胜利检查。
- 中文和英文即时切换。
- 鼠标、键盘、单指拖动、双指缩放和缩放按钮。
- 浏览器本地自动保存。

道路/桥梁、跨高程线受攻的防御修正、野战工事和全部可选规则仍在继续数字化。

## 本地运行

```powershell
pnpm install
pnpm dev
```

访问 `http://127.0.0.1:5173`。

## 验证

```powershell
pnpm test
pnpm build
```

`scripts/capture-qa.mjs` 使用 Chrome DevTools Protocol 在真实 390×844
移动视口中检查 94 个格子、28 个棋子、横向溢出和视线交互。

## 部署

推送到 `main` 后，GitHub Actions 会运行测试、构建项目并自动部署到
GitHub Pages。Pages 构建可在本地通过 `pnpm build:pages` 验证。
