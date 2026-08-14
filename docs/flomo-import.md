# 导入 PlainMemo 数据到 Flomo

PlainMemo 可以将独立 Markdown 笔记导出为 Flomo 可导入的 CSV 文件。导出不会修改现有笔记。

## 导出

1. 在 PlainMemo 设置中点击“导出数据到 Flomo”。
2. CSV 和 `导入说明.md` 会并列保存到 Obsidian 库根目录的 `plainmemo导出到flomo` 文件夹。

## 导入到 Flomo

1. 在 Flomo 的数据导入界面选择导出的 CSV 文件。
2. 按 Flomo 的页面提示完成导入。

## 数据范围

- 每条 PlainMemo 笔记会导出为一行，使用文件名中的创建时间写入 `created_at` 列。
- 正文中的 Markdown、换行和 `#标签` 保持不变。
- CSV 使用 UTF-8 with BOM 编码，并遵循 Flomo 样本的 `content,created_at` 列顺序。
- Flomo 的 CSV 导入模板只支持文本和换行，不能携带图片文件。因此 PlainMemo 会移除 Markdown 图片和 Obsidian 图片嵌入；这个限制来自 Flomo 的 CSV 模板。
