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

## 2.8 迁移、缓存与画布工作区 / Migration, cache and canvas workspace

“设置 → 存储与迁移”或项目库的同名入口可扫描 `.sbref` 和 ZIP，查看媒体清单、容量、缺失文件及同 ID 项目摘要。选择目标后复制并核验 SHA-256，成功后登记内部主数据与外部归档；原文件始终保留。便携打包默认收集外部媒体，不包含导出、缓存、登录凭据及本机偏好。缺失素材必须重新关联或明确允许不完整导入。高于版本 9 的工程不会被降级写回。

预览缓存默认 2GB，图片解码预算 256MB；视频按需读取。清理缓存不会删除唯一静帧或原素材。GPU 缓存重建在下次启动执行；当前 Electron 保留硬件加速，但不保证所有 Skia 着色器都落盘。相关依据：[Electron Session](https://www.electronjs.org/docs/latest/api/session)、[上游问题](https://github.com/electron/electron/issues/54112)。

LibTV 创作工作区左侧浏览本地素材与节点，中间查看真实画布，右侧编辑生成参数，底部管理任务。点击输出端口再点击目标输入端口添加参考；右侧可排序或移除。拖入本地素材后仍需确认目标，上传完成重新读取画布。切换账户后请重新选择工作区与画布。参考 [CLI 使用经验](https://xueai.me/library/liblib-tv/)，具体命令以本机官方 1.2.0 文档核验。

模型、参数及额度由 LibTV 决定，帧册不估算价格。生成前明确确认；停止等待只隐藏等待状态，后台 CLI 继续处理，不代表云端取消。重开后查询原节点恢复；状态未知时先检查官网，不自动重提任务。结果按来源节点避免重复下载。

Use Settings → Storage and migration, or the project library shortcut, to scan archives and ZIP packages before copying. Files are verified by SHA-256; originals and recovery data are retained. Duplicate IDs default to independent copies. Missing media requires relinking or explicit incomplete import. Future project versions are never downgraded.

The dedicated LibTV workspace provides real canvas nodes, edges, draggable positions, reference ordering, model-driven controls and recoverable tasks. Uploads are confirmed and verified on the destination canvas. Generation always requires credit-use confirmation. Stop waiting leaves the CLI running in the background and does not cancel a cloud job. Unknown tasks are checked instead of automatically resubmitted. Credentials and runtime state stay outside portable projects.
