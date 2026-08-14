# 从 Knomo 导入到 PlainMemo

PlainMemo 可以从当前 Obsidian 库中识别 Knomo 的日记文件和月度文件，将其中的 Memo 转换为独立 PlainMemo Markdown 文件。

## 开始前

1. 备份 Obsidian 库。
2. 保留 Knomo 原始文件。导入只（自动）新建 PlainMemo 文件，不会修改或删除 Knomo 数据。
3. 导入的 PlainMemo 文件会写入PlainMemo 设置中的“默认新建位置”。

## 导入

1. 打开 PlainMemo 设置。
2. 在“导入 Knomo 数据”一项中点击按钮。
3. 等待导入完成，并查看新建、跳过、源内容已变化和失败的数量。

PlainMemo 会在当前库中识别 Knomo、Daily、Daily Notes 文件夹中的 Markdown 文件，以及以 `YYYY-MM-DD.md` 命名的日记文件。每个识别到的 Memo 会依据其原始日期和时间生成一个独立 Markdown 文件。

## 重复与后续导入

PlainMemo 会记录已经导入过的 Knomo Memo。再次运行时，未变化的来源会跳过；来源内容变化时会报告“源内容已变化”，不会覆盖已经生成的 PlainMemo 文件。
