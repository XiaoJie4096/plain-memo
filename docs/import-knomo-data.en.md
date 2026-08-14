# Import Knomo data into PlainMemo

PlainMemo can recognize Knomo daily and monthly files in the current Obsidian Vault and convert their Memos into standalone PlainMemo Markdown files.

## Before you start

1. Back up the Obsidian Vault.
2. Keep the original Knomo files. Import only creates PlainMemo files automatically; it does not change or delete Knomo data.
3. Imported PlainMemo files are written to the **Default creation folder** in PlainMemo settings.

## Import

1. Open PlainMemo settings.
2. Click **Import Knomo data**.
3. Wait for the import to finish, then review the created, skipped, source-changed, and failed counts.

PlainMemo recognizes Markdown files in `Knomo`, `Daily`, and `Daily Notes` folders, as well as daily files named `YYYY-MM-DD.md`. Each recognized Memo becomes an independent Markdown file using its original date and time.

## Repeated imports

PlainMemo records Knomo Memos that have already been imported. When you run the import again, unchanged sources are skipped; changed sources are reported as **Source content changed** and do not overwrite the existing PlainMemo file.
