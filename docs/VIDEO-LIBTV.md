# 视频片段、项目存储与 LibTV / Video clips, storage and LibTV

## 视频片段

在截帧工作台选择“视频片段”，设置入点和出点后保存。片段记录范围，不会立即复制视频。素材库筛选中可以只查看片段；从分镜画面单元格的添加菜单选择“添加视频片段”。点击封面可播放选区。

导出支持 MP4/H.264 和 MOV/ProRes 422。原生分辨率保留来源尺寸；其他尺寸保持比例且不放大小素材。默认保留音频，预览音量不影响导出。MOV 在应用内使用预览代理，确认导出保留原始 ProRes 文件。

Use Video clip mode in Capture to save source ranges. Clips share the original media and can be added to storyboard image cells. PDF exports use covers; CSV records the source and in/out range. Export supports MP4/H.264 and MOV/ProRes 422; native resolution, aspect-preserving downscaling and optional audio. Preview volume never changes exported audio.

## 项目数据与媒体

应用内部 `Projects/<project-id>.sbref` 保存主数据及数据恢复副本，不复制媒体。新项目媒体默认保存在“文稿/帧册/项目/项目名.sbref”。项目库从内部主数据读取，外部文件夹保存同步副本、媒体和导出。

项目设置可修改媒体项目文件夹；复制并核对成功后切换，原目录保留。外部副本被其他程序修改时暂停覆盖，内部保存不受影响。确认使用内部版本时，在项目设置选择“同步内部工程至项目文件夹”。外部盘离线时不会重新创建同名空目录；重新连接后，下次保存会重试同步。

导出设置按项目保存，默认使用 `导出/分镜本`、`导出/静帧`、`导出/视频片段`，均相对于项目媒体文件夹。可设置绝对目录及每次询问位置。

Canonical project JSON and recovery history remain in the application data directory. Media lives in the selected project archive, alongside its synchronized JSON and project-relative exports. Changing the archive copies and verifies its files while preserving the original. External edits are protected from silent overwrite; offline archives do not prevent internal data saves.

## LibTV 登录与绑定

官方 CLI 安装包：[LibTV CLI 1.2.0](https://liblibai-web-static.liblib.cloud/cli/1.2.0/libtv-cli-skill.zip)。按包内安装说明安装后，在“设置 → 项目设置 → LibTV”点击登录，在浏览器完成账户验证。返回后刷新，选择工作区和目标画布并绑定。Hermes 配套能力包安装在其本地 skills 目录。

上传通过官方 CLI 建立画布资源节点，并查询目标画布确认节点存在。视频片段上传只包含所保存的范围。登录凭据保存在本机，不进入项目或源码仓库。

图片及视频生成入口位于 LibTV 创作面板。模型和参数从 CLI 读取，开始生成前需要确认账户额度使用。停止本地等待不会取消云端生成，也不会退款；需在 LibTV 管理云端任务。生成结果可以下载进素材库。账户额度、价格及模型可用性由 LibTV 决定。

Install the official CLI, then use Project settings → LibTV → Sign in. Finish browser login and choose a workspace and canvas. No legacy access key is needed. Uploads create and verify resource nodes. Generation requires explicit credit-use confirmation; stopping local waiting does not cancel a cloud task. Downloaded results can be added to the media library. Credentials stay local.
