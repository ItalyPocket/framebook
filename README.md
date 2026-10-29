# 帧册 / Framebook

面向 Apple Silicon Mac 的静帧截取、拉片分析、分镜本与拍摄计划工具。

## 使用

从[发布页](https://github.com/ItalyPocket/framebook/releases)下载 DMG。项目库管理本机项目；右上角搜索图标展开搜索。左上角项目名可直接重命名。

- 工作台：导入或拖入 MP4、MOV、图片，逐帧查看并截取静帧。
- 画廊：调整静帧顺序、批量命名及导出。
- 分镜本：一镜多图、自定义字段与选项，支持横竖版 PDF 和 CSV 预览导出。
- 拍摄计划：按场景、日期时间、地点分组安排镜头，独立设置显示列；分镜字段双向同步，负责人及拍摄耗时独立填写。
- 拍摄通告：单独编辑各组集合、人员、器材和紧急联系信息。

设置管理项目目录、自动保存、恢复副本、素材内嵌、导出目录、开屏和动画。默认每 60 秒自动保存，保留 5 份数据恢复副本。项目包默认包含导入素材，也可使用外部引用并通过 ZIP 打包分享。

版本 7 兼容旧项目，迁移拍摄日到计划分组并保留旧条次数据。界面提供中文和英文，支持系统减少动态效果。

## 开发

需要 Node.js 22+。

```sh
npm ci
npm run dev
```

```sh
npm run typecheck
npm run lint
npm run build
npm run package
```

安装包输出到 `release/`，自带 ffmpeg。当前构建没有 Apple Developer ID 签名和公证。端到端验证需要可启动 Electron 的 macOS 桌面环境，截帧测试还需要 PATH 中的 ffmpeg、ffprobe。

## 来源与许可

原作 [Storyboard Reference Studio](https://github.com/wassermanproductions/storyboard-reference-studio)：Sam Wasserman ([wassermanproductions.com](https://wassermanproductions.com))。帧册改版：ItalyPocket。完整许可与声明见 [LICENSE](LICENSE)、[NOTICE](NOTICE)。
