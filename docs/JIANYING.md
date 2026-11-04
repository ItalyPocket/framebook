# Jianying / CapCut conversion · 剪映草稿转换

Open **Jianying / CapCut conversion** in the title bar. Choose a draft JSON or folder, or drag one into the conversion window. Default draft folders under Movies are scanned; additional search and export locations can be set in General settings.

选择标题栏的「剪映 / CapCut 转换」，打开或拖入草稿 JSON／目录。默认扫描影片目录下的草稿；常规设置可指定搜索目录、导出目录及默认格式。

Review tracks, missing media and the compatibility report before exporting. Relinking only changes the conversion session. Source drafts are never written. Optional media import uses the current project's existing media-storage preference.

导出前检查轨道、缺失素材及兼容性报告。重新关联只影响本次转换，不会改写剪映草稿；导入当前项目时沿用现有素材存储设置。

- XML: Final Cut Pro 7 xmeml for Resolve and compatible editors. Includes timeline clips, source ranges, separate and embedded audio, basic transforms and constant speed. Destination-editor verification is still required.
- JSON: normalized timeline plus original draft data, including unsupported properties.
- SRT / ASS / TXT: subtitle text and timing; original rich text styles are not retained.
- EBU STL: ASCII only, 25/30 fps, maximum 111 bytes per subtitle. Use SRT/ASS for Chinese.

Encrypted macOS drafts cannot currently be decoded. This release does not bundle the upstream Windows `plugin-core.exe`. Curved speed, reverse, transitions, keyframes, effects and color are not faithfully reproduced. These limitations appear in the compatibility report. Backups/templates may be older than the latest draft. Files from Windows usually require relinking on Mac.

目前不支持 Mac 加密草稿，不附带上游 Windows 解密程序。曲线变速、倒放、转场、关键帧、特效及调色无法完整还原。备份／模板可能不是最新版；Windows 素材路径通常需要在 Mac 重新关联。

This is draft-to-XML conversion. It does not provide folder synchronization into Jianying, edit live Jianying projects, or add Framebook timestamp markers to them.

这是「剪映草稿转 XML」，不包含剪映文件夹自动同步、实时草稿修改或帧册时间点标记写回。

Implementation reference: [Ersiter/Jianying-CapCut2XML v3.1](https://github.com/Ersiter/Jianying-CapCut2XML/releases/tag/v3.1). Framebook uses a native TypeScript implementation; Python and Windows helpers are not installed. The upstream project is MIT licensed; see its [license](https://github.com/Ersiter/Jianying-CapCut2XML/blob/v3.1/LICENSE).
