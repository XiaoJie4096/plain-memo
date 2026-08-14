# Import Flomo data into PlainMemo

PlainMemo can convert a Flomo HTML or ZIP export into standalone PlainMemo Markdown files.

## Export from Flomo

<!-- Add the current Flomo export instructions and an English screenshot here. -->

## Import into PlainMemo

1. Open PlainMemo settings and click **Import Flomo data**.
2. Select the `.html` or `.zip` file exported from Flomo.
3. Choose a folder in the Vault. The default is `PlainMemo` and is recommended. After import, the folder is automatically added to PlainMemo's scan scope.
4. Choose whether to skip `.m4a` voice attachments or image attachments.
5. Review the detected memo and attachment counts, then confirm the import.

Each Flomo memo becomes a standalone PlainMemo Markdown file. Its body, creation time, tags, and web links are retained. Readable images from a ZIP export are copied into PlainMemo's managed picture folder; voice attachments that are not skipped are stored in the target folder's `flomo-attachments` directory.
