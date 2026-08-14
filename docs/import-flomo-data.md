# 从 Flomo 导入到 PlainMemo

PlainMemo 可以将 Flomo 导出的 HTML 或 ZIP 文件转换为独立 PlainMemo Markdown 文件。

## 从 Flomo 导出

<img title="" src="file:///C:/Users/Xiaoku/AppData/Roaming/marktext/images/2026-08-14-17-53-47-image.png" alt="" data-align="left" width="607">

## 导入到 PlainMemo

1. 打开 PlainMemo 设置，点击“导入 Flomo 数据”。
2. 选择 Flomo 导出的 `.html` 或 `.zip` 文件。
3. 选择库内目标文件夹（默认为PlainMemo，不建议修改）。导入完成后，该文件夹会自动加入 PlainMemo 的扫描范围。
4. 按需设置是否跳过 `.m4a` 语音附件或图片附件。
5. 查看识别到的笔记和附件数量，确认后开始导入。

每条 Flomo 笔记会转换为一个独立 PlainMemo Markdown 文件，并保留正文、创建时间、标签和网页链接。ZIP 中可读取的图片会复制到 PlainMemo 管理的图片目录；没有跳过的语音附件保存在目标文件夹的 `flomo-attachments` 目录。
