# Export PlainMemo data to Knomo

PlainMemo can export standalone Markdown memos as a ZIP archive of Knomo-compatible Daily Notes. Exporting does not modify existing Daily Notes, Knomo monthly archives, or Knomo indexes.

## Export

1. In PlainMemo settings, click **Export data to Knomo**.
2. The ZIP and `import-instructions.md` are saved side by side in the Vault-root `plainmemo-export-to-knomo` folder.

The ZIP contains only Daily Notes Markdown files named by date. `import-instructions.md` remains outside the ZIP, next to it.

## Import into Knomo

1. Extract the ZIP file.
2. Copy the dated Markdown files to Obsidian's Daily Notes folder. By default, Obsidian stores daily notes in the Vault root. If **Settings -> Core plugins -> Daily notes -> New file location** is configured, use that folder instead.
3. Enable Obsidian's Daily Notes core plugin and Knomo.
4. In Knomo settings, select the parts to import, run **Import legacy daily memos**, preview the candidates, confirm the grouping, then import.
5. If cards do not appear or indexes are inconsistent, run **Repair Knomo data** in Knomo settings.

## Data scope

- Each PlainMemo memo is written into the Daily Note for the date derived from its filename creation time.
- PlainMemo filenames store time only to the minute, so exported Knomo times use `:00` seconds.
- Tags, WikiLinks, Markdown links, image references, and body text remain in the Markdown content.
- PlainMemo does not export sync settings, pins, trash, Random reunion records, Time buoy indexes, or Knomo indexes.
- The ZIP does not contain Knomo monthly archives; Knomo maintains those after import.

## Repeated imports

Knomo previews candidates before importing and skips recognized duplicate Memos. Back up the Obsidian Vault before importing, and select a small date range on the first import to verify the result.
