![帧册 — Capture. Study. Arrange.](docs/images/hero.svg)

[English](README.md) · [简体中文](README.zh-CN.md)

**面向 Apple Silicon Mac 的静帧截取、拉片分析、分镜本与拍摄筹备工具。**

[下载安装包](https://github.com/ItalyPocket/framebook/releases) · [反馈问题](https://github.com/ItalyPocket/framebook/issues) · [支持项目](docs/SUPPORT.md)

> **最新版本：2.5.1 · Apple Silicon Mac。** [下载 DMG](https://github.com/ItalyPocket/framebook/releases/tag/v2.5.1)。下方截图摄于 2.5.0。


> 当前源码 2.5.2 暂停 AI 功能；已发布的 2.5.1 安装包尚未包含此调整。

## 从参考画面到拍摄计划

**截帧工作台 → 静帧画廊 → 分镜本 → 拍摄计划 → 拍摄通告**

导入影片，选取关键静帧，整理成镜头，再按场景安排拍摄，让参考画面贯穿整个准备过程。

| 工作区 | 主要用途 |
| --- | --- |
| 截帧工作台 | 导入或拖入 MP4、MOV 和图片，逐帧查看并截取静帧。 |
| 静帧画廊 | 调整顺序、批量命名导出，建立单图或一镜多图的镜头。 |
| 分镜本 | 自定义文字、数字和选项列，管理常用选项，填写与计算镜头时长。 |
| 拍摄计划 | 按场景、日期时间、地点分组，独立选择显示列和拍摄顺序。 |
| 拍摄通告 | 单独整理集合信息、人员、器材和紧急联系方式。 |

## 按你的思路制作分镜本

一镜多图、自定义列和可复用选项，适应不同的拉片与创作方式。分镜字段与拍摄计划关联，预计拍摄耗时与成片时长分开管理。

![分镜本：多镜头画面与可编辑字段](docs/images/storyboard.jpg)

## 先收集画面，再整理顺序

静帧画廊承接截帧与图片导入。整理顺序后，可以建立分镜，也可以按命名顺序导出图片。

![静帧画廊](docs/images/gallery.jpg)

## 让拍摄安排保持可视化

把镜头放入场景分组，为每组填写日期、地点和时间。计划可以只显示需要的列，沿用分镜本的画面参考。

![按场景分组的拍摄计划](docs/images/planning.jpg)

*截图为 2.5.0 英文界面，使用原创插画示例画面，不含用户素材；软件可切换为中文。*

## 导出、保存与项目移动

- 分镜本 PDF/CSV 与静帧导出前可预览，分镜本 PDF 支持 A4 横版与竖版。
- 点击主页图标返回欢迎页并重播开屏，可继续已保存的项目。
- 应用内项目库、项目名直接修改，以及可设置的保存与导出目录。
- 默认每 60 秒自动保存，保留 5 份数据恢复副本，均可调整。
- 默认将素材复制进 `.sbref` 项目包；也可使用外部引用，通过 ZIP 分享时收集素材，生成可移动副本。
- 提供中英文界面、开屏与过渡效果设置，以及减少动态效果支持。

截帧、编辑与导出在本地运行。AI 功能暂未启用，相关操作入口已隐藏；旧项目中的提示词数据仍保留兼容。请勿将私人素材与项目包提交到源码仓库。

## 从源码运行

需要 Node.js 22+ 和 macOS 桌面环境。

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

Apple Silicon DMG 输出至 `release/`，自带 FFmpeg。当前构建没有 Apple Developer ID 签名和公证。核心截帧验证使用项目自带的 FFmpeg。

## 支持帧册

欢迎提交问题、复现步骤和翻译改进。财政托管正在筹备，**暂未开放资金赞助**；审核通过后会加入已核实的收款入口，详情见[支持说明](docs/SUPPORT.md)。

## 来源与许可

帧册由 ItalyPocket 基于 Sam Wasserman 的 [Storyboard Reference Studio](https://github.com/wassermanproductions/storyboard-reference-studio) 改版。采用 Apache-2.0 许可，完整内容见 [LICENSE](LICENSE) 和 [NOTICE](NOTICE)。
