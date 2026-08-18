import test from "node:test";
import assert from "node:assert/strict";

import { applyListFormatToText, getHashInsertionText, getListBoundaryBackspacePatch, getListEnterPatch, getListEnterPatchAfterNativeNewline, getListEnterPatchForNativeInput, getParagraphEnterPatch, getTagQueryAtCursor, isTaskListShortcut, replaceTagQueryWithSuggestion } from "../src/utils/composerInput";
import { parseMemoTags } from "../src/utils/markdown";

test("inserts a spaced hash after existing content", () => {
	assert.equal(getHashInsertionText("今天记录", 4), " #");
});

test("keeps hash at the start of text and after whitespace", () => {
	assert.equal(getHashInsertionText("", 0), "#");
	assert.equal(getHashInsertionText("今天记录 ", 5), "#");
	assert.equal(getHashInsertionText("第一行\n", 4), "#");
});

test("detects tag query around the cursor", () => {
	assert.deepEqual(getTagQueryAtCursor("今天 #pro", 7), {
		from: 3,
		to: 7,
		query: "pro",
	});
	assert.deepEqual(getTagQueryAtCursor("#project", 8), {
		from: 0,
		to: 8,
		query: "project",
	});
	assert.deepEqual(getTagQueryAtCursor("第一行\n#daily", 10), {
		from: 4,
		to: 10,
		query: "daily",
	});
	assert.equal(getTagQueryAtCursor("今天#pro", 6), null);
});

test("replaces current tag query with selected suggestion", () => {
	assert.deepEqual(replaceTagQueryWithSuggestion("今天 #pro 明天", { from: 3, to: 7, query: "pro" }, "project/knomo"), {
		value: "今天 #project/knomo 明天",
		cursor: 18,
	});
	assert.deepEqual(replaceTagQueryWithSuggestion("今天 #pro明天", { from: 3, to: 7, query: "pro" }, "project/knomo"), {
		value: "今天 #project/knomo 明天",
		cursor: 18,
	});
});

test("formats the current line as a Markdown list", () => {
	assert.deepEqual(applyListFormatToText("", 0, 0, "task"), {
		value: "- [ ] ",
		cursor: 6,
	});
	assert.deepEqual(applyListFormatToText("hello", 5, 5, "bullet"), {
		value: "- hello",
		cursor: 7,
	});
	assert.deepEqual(applyListFormatToText("hello", 5, 5, "ordered"), {
		value: "1. hello",
		cursor: 8,
	});
	assert.deepEqual(applyListFormatToText("- hello", 7, 7, "ordered"), {
		value: "1. hello",
		cursor: 8,
	});
	assert.deepEqual(applyListFormatToText("hello", 2, 2, "task"), {
		value: "- [ ] hello",
		cursor: 8,
	});
	assert.deepEqual(applyListFormatToText("- hello", 4, 4, "task"), {
		value: "- [ ] hello",
		cursor: 8,
	});
});

test("formats selected lines as a Markdown list", () => {
	assert.deepEqual(applyListFormatToText("a\nb\nc", 0, 5, "bullet"), {
		value: "- a\n- b\n- c",
		cursor: 11,
	});
	assert.deepEqual(applyListFormatToText("a\nb\nc", 0, 5, "ordered"), {
		value: "1. a\n2. b\n3. c",
		cursor: 14,
	});
});

test("recognizes the desktop Ctrl+L and Cmd+L task-list shortcuts", () => {
	assert.equal(isTaskListShortcut({ key: "l", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }), true);
	assert.equal(isTaskListShortcut({ key: "L", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }), true);
	assert.equal(isTaskListShortcut({ key: "l", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }), true);
	assert.equal(isTaskListShortcut({ key: "l", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true }), false);
});

test("formats selected lines as an unchecked task list while preserving task states", () => {
	assert.deepEqual(applyListFormatToText("a\nb\n- [x] done", 0, 14, "task"), {
		value: "- [ ] a\n- [ ] b\n- [x] done",
		cursor: 26,
	});
});

test("continues and exits Markdown bullet lists", () => {
	assert.deepEqual(getListEnterPatch("- abc", 5, 5), {
		value: "- abc\n- ",
		cursor: 8,
	});
	assert.deepEqual(getListEnterPatch("- abc\n- ", 8, 8), {
		value: "- abc\n\n",
		cursor: 6,
	});
	assert.deepEqual(getListEnterPatch("- ", 2, 2), {
		value: "",
		cursor: 0,
	});
	assert.deepEqual(getListEnterPatch("-", 1, 1), {
		value: "",
		cursor: 0,
	});
	assert.deepEqual(getListEnterPatch("  - abc", 7, 7), {
		value: "  - abc\n  - ",
		cursor: 12,
	});
	assert.deepEqual(getListEnterPatch("  - ", 4, 4), {
		value: "  ",
		cursor: 2,
	});
});

test("splits a bullet item at the actual text cursor", () => {
	assert.deepEqual(getListEnterPatch("- 任务列表测试123", 6, 6), {
		value: "- 任务列表\n- 测试123",
		cursor: 9,
	});
	assert.deepEqual(getListEnterPatch("- 任务列表测试123", 8, 8), {
		value: "- 任务列表测试\n- 123",
		cursor: 11,
	});
});

test("splits task items at the actual text cursor", () => {
	assert.deepEqual(getListEnterPatch("- [ ] 任务列表测试123", 10, 10), {
		value: "- [ ] 任务列表\n- [ ] 测试123",
		cursor: 17,
	});
	assert.deepEqual(getListEnterPatch("- [ ] 任务列表测试123", 12, 12), {
		value: "- [ ] 任务列表测试\n- [ ] 123",
		cursor: 19,
	});
});

test("backspace at a list marker removes only the marker and preserves the line break", () => {
	assert.deepEqual(getListBoundaryBackspacePatch("- ", 2), {
		value: "",
		cursor: 0,
	});
	assert.deepEqual(getListBoundaryBackspacePatch("上一行\n- ", 6), {
		value: "上一行\n\n",
		cursor: 4,
	});
	assert.deepEqual(getListBoundaryBackspacePatch("上一行\n- 内容", 6), {
		value: "上一行\n内容",
		cursor: 4,
	});
	assert.deepEqual(getListBoundaryBackspacePatch("上一行\n- [ ] ", 10), {
		value: "上一行\n\n",
		cursor: 4,
	});
	assert.deepEqual(getListBoundaryBackspacePatch("- [ ] ", 6), {
		value: "",
		cursor: 0,
	});
	assert.equal(getListBoundaryBackspacePatch("- 内容", 3), null);
});

test("keeps an ordinary paragraph boundary when leaving a task marker at file end", () => {
	assert.deepEqual(getListBoundaryBackspacePatch("上一行\n- [ ] ", 10), {
		value: "上一行\n\n",
		cursor: 4,
	});
});

test("turns ordinary Enter into a single Markdown line break", () => {
	assert.deepEqual(getParagraphEnterPatch("第一段", 0, 0), {
		value: "\n第一段",
		cursor: 1,
	});
	assert.deepEqual(getParagraphEnterPatch("第一段第二段", 3, 3), {
		value: "第一段\n第二段",
		cursor: 4,
	});
	assert.deepEqual(getParagraphEnterPatch("第一段", 3, 3), {
		value: "第一段\n",
		cursor: 4,
	});
	assert.deepEqual(getParagraphEnterPatch("第一段第二段", 2, 4), {
		value: "第一\n二段",
		cursor: 3,
	});
});

test("inserts a line break on the first Enter after ordinary text input", () => {
	const firstEnter = getParagraphEnterPatch("刚输入的内容", 6, 6);
	assert.deepEqual(firstEnter, {
		value: "刚输入的内容\n",
		cursor: 7,
	});
	assert.deepEqual(getParagraphEnterPatch(firstEnter.value, firstEnter.cursor, firstEnter.cursor), {
		value: "刚输入的内容\n\n",
		cursor: 8,
	});
});

test("continues and exits Markdown ordered lists", () => {
	assert.deepEqual(getListEnterPatch("1. abc", 6, 6), {
		value: "1. abc\n2. ",
		cursor: 10,
	});
	assert.deepEqual(getListEnterPatch("1. abc\n2. ", 10, 10), {
		value: "1. abc\n\n",
		cursor: 7,
	});
	assert.deepEqual(getListEnterPatch("2.", 2, 2), {
		value: "",
		cursor: 0,
	});
	assert.equal(getListEnterPatch("plain", 5, 5), null);
	assert.equal(getListEnterPatch("- hello", 0, 7), null);
});

test("renumbers following ordered list items after inserting in the middle", () => {
	assert.deepEqual(getListEnterPatch("1. first\n2. second\n3. third", 8, 8), {
		value: "1. first\n2. \n3. second\n4. third",
		cursor: 12,
	});
});

test("continues Markdown task lists with unchecked tasks", () => {
	assert.deepEqual(getListEnterPatch("- [ ] task", 10, 10), {
		value: "- [ ] task\n- [ ] ",
		cursor: 17,
	});
	assert.deepEqual(getListEnterPatch("- [x] done", 10, 10), {
		value: "- [x] done\n- [ ] ",
		cursor: 17,
	});
	assert.deepEqual(getListEnterPatch("- [-] cancelled", 15, 15), {
		value: "- [-] cancelled\n- [ ] ",
		cursor: 22,
	});
});

test("exits empty Markdown task lists", () => {
	assert.deepEqual(getListEnterPatch("- [ ]", 5, 5), {
		value: "",
		cursor: 0,
	});
	assert.deepEqual(getListEnterPatch("  - [ ] ", 8, 8), {
		value: "  ",
		cursor: 2,
	});
});

test("continues nested and ordered Markdown task lists", () => {
	assert.deepEqual(getListEnterPatch("  - [ ] child", 13, 13), {
		value: "  - [ ] child\n  - [ ] ",
		cursor: 22,
	});
	assert.deepEqual(getListEnterPatch("2. [x] done", 11, 11), {
		value: "2. [x] done\n3. [ ] ",
		cursor: 19,
	});
});

test("corrects native newline insertion in Markdown bullet lists", () => {
	assert.deepEqual(getListEnterPatchAfterNativeNewline("- abc\n", 6, 6), {
		value: "- abc\n- ",
		cursor: 8,
	});
	assert.deepEqual(getListEnterPatchAfterNativeNewline("- abc\n- \n", 9, 9), {
		value: "- abc\n\n",
		cursor: 6,
	});
	assert.deepEqual(getListEnterPatchAfterNativeNewline("- \n", 3, 3), {
		value: "",
		cursor: 0,
	});
	assert.equal(getListEnterPatchAfterNativeNewline("plain\n", 6, 6), null);
});

test("corrects native newline insertion in Markdown ordered lists", () => {
	assert.deepEqual(getListEnterPatchAfterNativeNewline("1. abc\n", 7, 7), {
		value: "1. abc\n2. ",
		cursor: 10,
	});
	assert.deepEqual(getListEnterPatchAfterNativeNewline("1. abc\n2. \n", 11, 11), {
		value: "1. abc\n\n",
		cursor: 7,
	});
	assert.equal(getListEnterPatchAfterNativeNewline("1. abc\n", 0, 7), null);
});

test("corrects native newline insertion in Markdown task lists", () => {
	assert.deepEqual(getListEnterPatchAfterNativeNewline("- [x] done\n", 11, 11), {
		value: "- [x] done\n- [ ] ",
		cursor: 17,
	});
	assert.deepEqual(getListEnterPatchAfterNativeNewline("- [ ] \n", 7, 7), {
		value: "",
		cursor: 0,
	});
});

test("corrects list Enter when keyboard inputType is not reliable", () => {
	assert.deepEqual(getListEnterPatchForNativeInput("- abc", "- abc\n", 6, 6), {
		value: "- abc\n- ",
		cursor: 8,
	});
	assert.deepEqual(getListEnterPatchForNativeInput("- ", "- \n", 3, 3), {
		value: "",
		cursor: 0,
	});
	assert.equal(getListEnterPatchForNativeInput("- abc", "- abc\nextra", 6, 6), null);
});

test("corrects mobile list Enter when candidate confirmation and newline share one input", () => {
	assert.equal(getListEnterPatchForNativeInput("- ni", "- 你好\n", 5, 5), null);
	assert.deepEqual(getListEnterPatchForNativeInput("- ni", "- 你好\n", 5, 5, {
		allowTextChangeWithNewline: true,
	}), {
		value: "- 你好\n- ",
		cursor: 7,
	});
	assert.deepEqual(getListEnterPatchForNativeInput("- item\n-", "- item\n- \n", 10, 10, {
		allowTextChangeWithNewline: true,
	}), {
		value: "- item\n\n",
		cursor: 7,
	});
});

test("corrects mobile list Enter when native input omits marker spacing", () => {
	assert.equal(getListEnterPatchForNativeInput("- abc", "- abc\n-", 7, 7), null);
	assert.deepEqual(getListEnterPatchForNativeInput("- abc", "- abc\n-", 7, 7, {
		allowInsertedMarkerCorrection: true,
	}), {
		value: "- abc\n- ",
		cursor: 8,
	});
	assert.deepEqual(getListEnterPatchForNativeInput("1. abc", "1. abc\n2.", 9, 9, {
		allowInsertedMarkerCorrection: true,
	}), {
		value: "1. abc\n2. ",
		cursor: 10,
	});
	assert.deepEqual(getListEnterPatchForNativeInput("- [x] done", "- [x] done\n- [ ]", 16, 16, {
		allowInsertedMarkerCorrection: true,
	}), {
		value: "- [x] done\n- [ ] ",
		cursor: 17,
	});
	assert.equal(getListEnterPatchForNativeInput("- ", "- \n-", 4, 4, {
		allowInsertedMarkerCorrection: true,
	}), null);
	assert.deepEqual(getListEnterPatchForNativeInput("- ni", "- 你好\n-", 6, 6, {
		allowTextChangeWithNewline: true,
		allowInsertedMarkerCorrection: true,
	}), {
		value: "- 你好\n- ",
		cursor: 7,
	});
});

test("parses tags at content and line starts", () => {
	assert.deepEqual(parseMemoTags("#daily\n第二行 #project/knomo\n#idea"), ["daily", "project/knomo", "idea"]);
});
