# 导入 PlainMemo 数据到 Knomo

PlainMemo 可以将独立 Markdown 笔记导出为 Knomo 能识别的 Daily Notes ZIP 压缩包。导出不会修改现有 Daily Notes、Knomo 月度归档或 Knomo 索引。

## 导出

1. 在 PlainMemo 设置中点击“导出数据到 Knomo”。
2. ZIP 和 `导入说明.md` 会并列保存到 Obsidian 库根目录的 `plainmemo导出到knomo` 文件夹。

压缩包只包含按日期命名的 Daily Notes Markdown 文件；`导入说明.md` 保存在压缩包外，和 ZIP 并列。

## 导入到 Knomo

1. 解压 ZIP 文件。
2. 将解压出的日期 Markdown 文件复制到 Obsidian 的日记文件夹。Obsidian 默认把日记文件放在库根目录；如果你在“设置 → 核心插件 → 日记 → 新建文件位置”中配置过其他文件夹，就复制到那个文件夹。
3. 启用 Obsidian 的 Daily Notes 核心插件和 Knomo 插件。
4. 在 Knomo 设置中选择要导入的部分，运行“导入旧日记 Memos”，先预览候选内容，确认分组后执行导入。
6. 如卡片未出现或索引异常，在 Knomo 设置中运行“修复 Knomo 数据”。

## 数据范围

- 每条 PlainMemo 笔记会根据文件名中的创建时间写入对应日期的 Daily Note。
- 文件名只保存到分钟，因此导出的 Knomo 时间会补为 `:00` 秒。
- 标签、WikiLink、Markdown 链接、图片引用和正文会保留在 Markdown 内容中。
- PlainMemo 不会导出同步设置、置顶状态、回收站、随机重逢记录、时光浮标索引或 Knomo 索引。
- ZIP 内不包含 Knomo 的月度归档；这些归档由 Knomo 在导入后自行维护。

## 重复导入

Knomo 在导入前会预览候选内容，并会跳过已识别的重复 Memo。仍建议在导入前备份 Obsidian 库，并在首次导入时先选择少量日期验证结果。
