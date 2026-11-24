# recall-vocab

主动回忆式背单词工具，单文件 HTML，零依赖。目标四级，同时内置多本词书。

核心交互：屏幕先只出英文单词。你想出中文意思就直接输入并自动判分；想不出来则点「不认识 / 模糊 / 认识」三档自评。两条路在同一张卡上并存。

调度用 FSRS-5，按记忆稳定性动态安排复习间隔；进度、助记、打卡记录只存在本地浏览器，导出 JSON 即可备份迁移。

## 直接使用的三种方式

1. **本地**：下载 `index.html`，双击用浏览器打开。首次需联网取词库，之后缓存到本地，断网也能背。
2. **手机**：把整个仓库部署到任意静态托管（GitHub Pages / Gitee Pages / Cloudflare Pages 均可），手机浏览器打开后，从菜单选「添加到主屏幕」，全屏使用，跟 App 一样。
3. **只带一个 HTML 文件**：`index.html` 本身不含词库。首次打开会自动从下面的源取词库并缓存，取到后就不必再联网。

## 词库源

启动时按顺序自动切换，取到即用，并写入本地缓存：

1. jsDelivr CDN（GitHub 仓库镜像）
2. Gitee 仓库 raw
3. GitHub 仓库 raw

索引与例句分离：`data/books.js`（词书与词池）、`data/examples.js`（例句）。

也可在「设置 → 数据 → 词库源」里填自定义目录 URL，格式为包含 `books.js` 和 `examples.js` 的目录，例如：

```
https://gitee.com/你的账号/你的仓库/raw/main/data
```

填错或不可达时会自动回退到官方源。

## 重新构建

```bash
node build-app.js
```

把 `fsrs.js`、`words.js`、`loader.js` 注入 `app-template.html` 生成 `index.html`，并把 `books.js`、`examples.js` 复制到 `data/`。词库数据由 `build-books.js` 和 `build-examples.js` 从原始词表生成。

## 目录说明

- `index.html` — 成品，可直接双击
- `data/` — 词库文件，部署时必须与 index.html 同目录
- `app-template.html` — 界面与逻辑源码
- `loader.js` — 词库加载器（多源切换、IndexedDB 缓存、离线回退）
- `fsrs.js` — FSRS-5 调度实现
- `words.js` / `books.js` / `examples.js` — 词表、词书分类、例句数据
- `test-*.mjs` — 端到端测试（Edge 无头浏览器 + CDP）

## 说明

词库数据来自公开词表整理，例句来自 `KyleBing/english-vocabulary`。学习进度不会上传，全部保存在当前设备的浏览器里。
