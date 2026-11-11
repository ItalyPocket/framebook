# Jianying / CapCut conversion · 剪映草稿转换

Open **Draft conversion** in the title bar, set the draft directory and browse projects by cover, name, modification time and duration. Select a project and timeline, then choose **Start conversion**. Search opens from the search icon. The chosen directory is saved and shared with General settings. Opening a JSON file directly remains available.

选择标题栏的「草稿转换」，设置草稿目录，在应用内按封面、名称、修改时间及时长浏览工程。选中工程和时间线后点击「进入转换」。点击搜索图标展开搜索；目录会保存并与常规设置同步，也可直接打开 JSON 文件。

Encrypted projects remain visible. Readable backups and templates are explicitly listed for selection; they are never silently substituted for the current draft. They may be older than the current edit. Project metadata from the draft index helps browsing, but does not decrypt timeline content.

加密工程仍可在草稿库中查看。若存在可读取的备份或模板，需要明确选择；程序不会静默替换当前草稿。副本可能早于当前剪辑版本。草稿索引信息用于展示名称、时长等，不代表时间线已解密。

Review tracks, missing media and the compatibility report before exporting. Relinking only changes the conversion session. Source drafts are never written. Optional media import uses the current project's existing media-storage preference.

导出前检查轨道、缺失素材及兼容性报告。重新关联只影响本次转换，不会改写剪映草稿；导入当前项目时沿用现有素材存储设置。

- XML: Final Cut Pro 7 xmeml for Resolve and compatible editors. Includes timeline clips, source ranges, separate and embedded audio, basic transforms and constant speed. Destination-editor verification is still required.
- JSON: normalized timeline plus original draft data, including unsupported properties.
- SRT / ASS / TXT: subtitle text and timing; original rich text styles are not retained.
- EBU STL: ASCII only, 25/30 fps, maximum 111 bytes per subtitle. Use SRT/ASS for Chinese.

Encrypted macOS drafts cannot currently be decoded. This release does not bundle the upstream Windows `plugin-core.exe`. Curved speed, reverse, transitions, keyframes, effects and color are not faithfully reproduced. These limitations appear in the compatibility report. Backups/templates may be older than the latest draft. Files from Windows usually require relinking on Mac.

Mac 加密草稿可选择通过 HTWMedia 云端转换：在草稿库选中时间线，展开云端密钥设置，保存密钥并勾选上传授权，再进入转换。仅上传草稿正文，不上传素材。密钥通过系统加密保存在本机，可随时移除。支持从时间线清单读取原始名称，以及读取预设中的内嵌时间线。不附带上游 Windows 解密程序。曲线变速、倒放、转场、关键帧、特效及调色无法完整还原。备份／模板可能不是最新版；Windows 素材路径通常需要在 Mac 重新关联。

This is draft-to-XML conversion. It does not provide folder synchronization into Jianying, edit live Jianying projects, or add Framebook timestamp markers to them.

这是「剪映草稿转 XML」，不包含剪映文件夹自动同步、实时草稿修改或帧册时间点标记写回。

Implementation reference: [Ersiter/Jianying-CapCut2XML v3.1](https://github.com/Ersiter/Jianying-CapCut2XML/releases/tag/v3.1). Framebook uses a native TypeScript implementation; Python and Windows helpers are not installed. The upstream project is MIT licensed; see its [license](https://github.com/Ersiter/Jianying-CapCut2XML/blob/v3.1/LICENSE).
