# Export PlainMemo data to Flomo

PlainMemo can export standalone Markdown memos as a Flomo-compatible CSV file. Exporting does not modify existing memos.

## Export

1. In PlainMemo settings, click **Export data to Flomo**.
2. The CSV and `import-instructions.md` are saved side by side in the Vault-root `plainmemo-export-to-flomo` folder.

## Import into Flomo

1. In Flomo's data-import screen, select the exported CSV file.
2. Complete the import using Flomo's on-screen instructions.

## Data scope

- Each PlainMemo memo is exported as one row, using the filename creation time in the `created_at` column.
- Markdown, line breaks, and `#tags` in the body remain unchanged.
- The CSV uses UTF-8 with BOM and follows Flomo's `content,created_at` column order.
- Flomo's CSV import template supports text and line breaks only; it cannot carry image files. PlainMemo therefore removes Markdown image syntax and Obsidian image embeds. This limitation comes from Flomo's CSV template.
