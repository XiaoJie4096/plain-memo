import test from "node:test";
import assert from "node:assert/strict";

import { ensureObsidianStub } from "./helpers/obsidianStub";

test("creates a UTF-8 BOM CSV with escaped Flomo template fields", async () => {
	await ensureObsidianStub();
	const { createFlomoCsv } = await import("../src/services/FlomoDataExportService");
	const csv = createFlomoCsv([{ content: "First line\n#tag, \"quoted\"", createdAt: new Date(2025, 8, 3, 10, 0) }]);

	assert.equal(csv, "\uFEFFcontent,created_at\n\"First line\n#tag, \"\"quoted\"\"\",2025-09-03 10:00:00\n");
});

test("removes supported image embeds while keeping Markdown, tags, and code examples", async () => {
	await ensureObsidianStub();
	const { removeFlomoUnsupportedImages } = await import("../src/services/FlomoDataExportService");
	const source = "**Bold** #tag\n![[PlainMemo/picture/photo.png|300]]\n![remote](https://example.com/photo.jpg)\n`![literal](code.png)`";

	assert.deepEqual(removeFlomoUnsupportedImages(source), {
		content: "**Bold** #tag\n\n\n`![literal](code.png)`",
		omittedImageCount: 2,
	});
});
