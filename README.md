# 帧册 / Framebook

为拉片分析设计的 macOS 静帧与分镜本工具。基于 Sam Wasserman 的 [Storyboard Reference Studio](https://github.com/wassermanproductions/storyboard-reference-studio)，保留 Apache-2.0 许可与原作者署名。

## 第一版功能

- 简体中文、English、跟随系统，切换后保存偏好。
- 截帧工作台：导入 MP4 / MOV，逐帧浏览、手动截帧、场景检测、按间隔或数量批量截帧。
- 静帧画廊：默认按素材导入顺序与源时间排序，支持拖动或按钮重排、恢复时间排序、多选、按当前顺序导出 `001.png` / `001.jpg`，附源时间清单。
- 独立分镜本：一图一镜或多图合成一个镜头；起始／中间／结束／参考图片；图片重排与移除；镜头复制、重排、删除、撤销和重做。
- 镜头字段：场次、镜号、名称、景别、角度、焦段、运动、转场、画面描述、构图、光线与色彩、对白／旁白、音乐／音效、分析笔记、起止时间与时长。
- 分镜本导出：中文或英文标题、A4 横向或纵向 PDF、连续列表或每镜一页卡片、UTF-8 CSV，另附可独立打开的 HTML。
- 横竖屏保持原比例，支持 9:16、3:4 等裁切。分镜图片保存独立快照，删除画廊静帧不会影响分镜本。
- 保留上游画面标注、演示、动画视频及可选 AI 提示词功能。基础工作流离线可用，AI 生成需要另行配置服务。

![分镜本](docs/images/framebook-storyboard.png)

## 运行与打包

面向 Apple Silicon（M 系列）Mac。开发需要 Node.js 22+。

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

打包产物位于 `release/`，自带 ffmpeg，无需另装。当前构建没有 Apple Developer ID 签名和公证。

测试使用真实 Electron 和 ffmpeg；测试环境的 PATH 需要有 `ffmpeg`、`ffprobe`。

```sh
npm run e2e
```

## 项目与保存

项目为 `.sbref` 文件夹，包含 `project.json`、复制的媒体、缓存和 `exports/`。请移动整个文件夹。⌘S 保存，自动备份每 60 秒写入一次；旧版项目首次保存前会保留 `project.pre-framebook.json`。版本 3 可读取上游版本 1/2 项目，并将原有静帧转为独立分镜。

批量截帧单次上限 300 张。长视频或高分辨率素材的处理速度取决于设备。MOV 是容器，具体编码的预览能力取决于 Electron；本版测试覆盖 H.264 的 MP4 / MOV。HDR 色彩管理和专业时间码工作流不属于本版功能。

## 致谢

原作由 **Sam Wasserman** 创建：[wassermanproductions.com](https://wassermanproductions.com) · [wasserman.ai](https://wasserman.ai)。帧册的中文工作流、独立分镜编辑与白蓝视觉改版由 ItalyPocket 定制。完整许可见 [LICENSE](LICENSE)，原作声明见 [NOTICE](NOTICE)。
