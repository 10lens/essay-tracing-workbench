# 作文描摹工作台 · PWA / GitHub Pages

一个纯前端的作文答题卡排版工具。桌面宽屏采用左右分栏；当窗口变窄或纵向比例较高时，自动切换为「上方编辑设置、下方答题卡预览」。同一个页面适用于 Windows、macOS、iPhone、iPad 和 Android 浏览器。

## 核心原则

- **静态托管**：GitHub Pages 只提供网页文件、空白答题卡模板和预览图。
- **本地处理**：作文编辑、排版计算、字体加载、预览和 PDF 生成都在访问者的浏览器中运行；不设置接收作文内容的后端接口。
- **沿用原模板**：PDF 导出是在原始 `assets/answer-template.pdf` 的页面上叠加文字，不重绘格线。文字叠层以 300 DPI PNG 嵌入 PDF，底层答题卡仍保留原始 PDF 的矢量内容。
- **响应式布局**：CSS 根据窗口宽度与纵横比切换左右布局和上下布局。手机上的上下排版也能用于拉成长条的电脑浏览器窗口。
- **PWA**：提供 Web App Manifest 和 Service Worker。首次打开仍需联网加载网页/导出库；缓存完成后，应用 shell、模板以及 PDF 导出库会尽量支持离线使用。

## 部署到 GitHub Pages

1. 在 GitHub 新建一个公开仓库，例如 `essay-tracing-workbench`。
2. 将本目录中的所有文件和文件夹上传到仓库根目录（不要只上传 `index.html`）。
3. 打开仓库 **Settings → Pages**。
4. 在 **Build and deployment** 中选择 **Deploy from a branch**，分支选 `main`，目录选 `/(root)`，保存。
5. 等待 GitHub Pages 发布完成后，使用页面给出的 HTTPS 网址访问。

后续更新时，把修改后的文件提交到同一分支即可。GitHub Pages 网址通常形如 `https://你的用户名.github.io/仓库名/`。

## 在手机上安装

- **iPhone / iPad**：使用 Safari 打开 HTTPS 网站，点分享按钮，再选「添加到主屏幕」。
- **Android**：用支持安装 PWA 的浏览器打开网站，在浏览器菜单中选择「安装应用」或「添加到主屏幕」（名称因浏览器而异）。
- 桌面端也可以直接用浏览器访问；支持安装 PWA 的浏览器还可以把它安装成独立窗口。

## 使用方法

1. 输入标题和正文；正文中每个非空行视为一个自然段，长段落会自动换行。
2. 设置标题/正文对齐、段首缩进、段间距、描摹字号与灰度。
3. 按需填写独立的范文点评，选择格内黑字、便利贴或点评卡片，以及正文后或页底位置。
4. 如果设备没有合适的楷体，可以选择本地 TTF/OTF 字体文件。字体只在本机加载，不会上传；点击「恢复设备字体」可随时切回系统字体。将字体随项目 JSON 保存时，字体数据也只写入用户主动下载的项目文件。
5. 点击「导出 A3 PDF」。在 iPhone 上，如果浏览器打开了 PDF 预览，可使用系统分享菜单保存到「文件」或发送到打印机。
6. 「保存项目 JSON」用于在本地保存正文、点评和排版参数；「打开项目」可以恢复它们。

## 本地开发与检查

本项目为静态网站，可以直接通过任何本地 HTTP 服务器运行。例如：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。由于浏览器的安全限制，不建议通过直接双击 `index.html`（`file://`）使用。

布局算法的简单单元测试：

```bash
npm test
```

## 技术说明与限制

- PDF 导出使用 `pdf-lib`，通过 jsDelivr 加载其浏览器版；Service Worker 会尝试缓存该库。首次访问需要网络。答题卡预览另有独立的 HTML 图片兜底；即使交互脚本加载失败，也会先显示空白答题卡并提示检查文件路径。
- 文字叠层采用浏览器 Canvas 以 300 DPI 渲染后嵌入 PDF，以保持原模板和文字叠层精确共页。正文是高分辨率图像而非 PDF 文本对象，因此打印效果优先，但无法在 PDF 中直接选择/复制描摹文字。
- 预览优先使用设备上的楷体/宋体/黑体；各系统字体名称与字形可能有差异。需要更稳定的效果时，应上传同一个 TTF/OTF 字体文件，并将其随项目 JSON 一并保存。
- 目前是第一版 Web/PWA 移植，不会更改或替换现有 Windows EXE。
- 代码默认不发送用户作文或点评内容。标准网页请求仍会向 GitHub Pages 和 jsDelivr 请求静态资源；没有集成访问统计脚本。

## 文件结构

```text
index.html
styles.css
app.js
layout.js
manifest.webmanifest
sw.js
assets/
  answer-template.pdf
  answer-template-preview.png
  app-icon.svg
  app-icon-180.png
  app-icon-512.png
tests/layout.test.mjs
```

## 预览加载修复版

本版将答题卡 PNG 预览和 PDF 模板加载拆成两个独立步骤：即使 PDF 模板请求失败或网络较慢，预览仍会先显示；PDF 导出组件改为点击导出时再加载，不再阻塞网页初始化。Service Worker 缓存版本已更新，并为外部 PDF 库缓存设置了超时。

如果你已经部署过旧版，请将本项目的新版本文件覆盖到 GitHub 仓库对应位置（尤其是 `app.js`、`index.html`、`sw.js`），提交更改并等待 Pages 部署完成。浏览器若仍显示旧版本，请强制刷新；如果是已经安装的 PWA，可先完全关闭后重新打开，必要时移除主屏幕快捷方式并重新添加。
