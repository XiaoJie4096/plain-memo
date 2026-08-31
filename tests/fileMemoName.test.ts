import assert from "node:assert/strict";
import test from "node:test";

import {
	formatMemoFilenameTimestamp,
	isPlainMemoFileName,
	parseMemoFilenameTimestamp,
	toSafeMemoFileStem,
} from "../src/utils/fileMemoName";

test("memo filename helpers recognize valid timestamp suffixes", () => {
	assert.equal(isPlainMemoFileName("想法_2607261430.md"), true);
	assert.equal(isPlainMemoFileName("想法_2607261430 (2).md"), true);
	assert.equal(isPlainMemoFileName("想法.md"), false);
	assert.equal(formatMemoFilenameTimestamp(new Date(2026, 6, 26, 14, 30)), "2607261430");
	assert.equal(parseMemoFilenameTimestamp("想法_2607261430.md")?.getMinutes(), 30);
});

test("memo filename stem stays within the safe limit without changing memo body text", () => {
	const longText = `${"很长的内容".repeat(100)} / : * ? \" < > |`;
	const stem = toSafeMemoFileStem(longText, "Flomo");
	assert.ok(stem.length <= 100);
	assert.equal(/[\\/:*?"<>|]/.test(stem), false);
	assert.equal(toSafeMemoFileStem("   ", "Flomo"), "Flomo");
});

test("memo filename stems stay within a mobile-safe UTF-8 byte budget", () => {
	const stem = toSafeMemoFileStem("中文标题".repeat(100));
	const filename = `${stem}_2607261430.md`;
	assert.ok(new TextEncoder().encode(stem).length <= 200);
	assert.ok(new TextEncoder().encode(filename).length < 255);
});

test("memo filename stems remove path separators and trailing dots after truncation", () => {
	const stem = toSafeMemoFileStem("标题/带\\路径... ");
	assert.equal(stem.includes("/"), false);
	assert.equal(stem.includes("\\"), false);
	assert.equal(/[. ]$/.test(stem), false);
});
