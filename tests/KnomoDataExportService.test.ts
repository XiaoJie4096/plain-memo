import test from "node:test";
import assert from "node:assert/strict";

import { ensureObsidianStub } from "./helpers/obsidianStub";

test("formats PlainMemo content as a Knomo memo block", async () => {
	await ensureObsidianStub();
	const { formatKnomoMemo } = await import("../src/services/KnomoDataExportService");
	const createdAt = new Date(2026, 7, 14, 15, 30);

	assert.equal(formatKnomoMemo(createdAt, "First line #tag\nSecond line\n\nThird line"), "- 15:30:00 First line #tag\n\tSecond line\n\t\n\tThird line");
});

test("creates a readable ZIP archive with stored Markdown entries", async () => {
	await ensureObsidianStub();
	const { createZipArchive } = await import("../src/services/KnomoDataExportService");
	const archive = createZipArchive([
		{ name: "2026-08-14.md", data: new TextEncoder().encode("- 15:30:00 Hello") },
	]);
	const view = new DataView(archive.buffer);

	assert.equal(view.getUint32(0, true), 0x04034b50);
	assert.equal(view.getUint16(6, true), 0x0800);
	assert.equal(view.getUint32(archive.length - 22, true), 0x06054b50);
	assert.equal(view.getUint16(archive.length - 12, true), 1);
	assert.equal(view.getUint32(archive.length - 14, true) > 0, true);
});
