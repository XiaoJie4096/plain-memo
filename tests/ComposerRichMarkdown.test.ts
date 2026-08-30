import test from "node:test";
import assert from "node:assert/strict";

import {
	parseComposerInline,
	parseComposerMarkdown,
	serializeComposerInline,
	serializeComposerMarkdown,
} from "../src/ui/ComposerRichMarkdown";
import { remapSelectionAfterNormalization, shouldRefreshInlinePresentation } from "../src/ui/ComposerEditorPresentation";

test("parses and serializes supported list blocks", () => {
	const document = parseComposerMarkdown("第一段\n- [ ] 一个任务\n- [x] 已完成\n1. 有序项");
	assert.equal(document.blocks[0]?.type, "paragraph");
	assert.equal(document.blocks[1]?.type, "list");
	assert.deepEqual(document.blocks[1]?.type === "list" ? document.blocks[1].items.map((item) => item.checked) : [], [" ", "x"]);
	assert.equal(serializeComposerMarkdown(document), "第一段\n- [ ] 一个任务\n- [x] 已完成\n1. 有序项");
});

test("keeps adjacent ordinary and task list items distinct in Markdown", () => {
	const source = "- 普通项\n- [ ] 待办项\n- 另一条普通项";
	assert.equal(serializeComposerMarkdown(parseComposerMarkdown(source)), source);
});

test("preserves ordered task items as ordered Markdown", () => {
	const source = "1. [ ] first\n2. [x] second";
	const document = parseComposerMarkdown(source);
	assert.equal(document.blocks[0]?.type, "list");
	assert.equal(document.blocks[0]?.type === "list" ? document.blocks[0].ordered : false, true);
	assert.deepEqual(document.blocks[0]?.type === "list" ? document.blocks[0].items.map((item) => item.checked) : [], [" ", "x"]);
	assert.equal(serializeComposerMarkdown(document), source);
});

test("preserves list indentation while parsing and serializing", () => {
	const source = "  - [ ] nested task\n    - nested child";
	const document = parseComposerMarkdown(source);
	assert.equal(document.blocks[0]?.type, "list");
	if (document.blocks[0]?.type === "list") {
		assert.deepEqual(document.blocks[0].items.map((item) => item.indent), ["  ", "    "]);
	}
	assert.equal(serializeComposerMarkdown(document), source);
});

test("preserves tags and image source syntax as inline nodes", () => {
	const source = "记录 #工作 和 ![[picture/a.png]]";
	const nodes = parseComposerInline(source);
	assert.deepEqual(nodes.filter((node) => node.type === "tag").map((node) => node.source), ["#工作"]);
	assert.deepEqual(nodes.filter((node) => node.type === "image").map((node) => node.source), ["![[picture/a.png]]"]);
	assert.equal(serializeComposerInline(nodes), source);
});

test("recognizes a manually completed tag once whitespace follows it", () => {
	const source = "#项目 ";
	const nodes = parseComposerInline(source);
	assert.deepEqual(nodes, [
		{ type: "tag", value: "项目", source: "#项目" },
		{ type: "text", value: " " },
	]);
});

test("refreshes list presentation when a marker is completed with whitespace", () => {
	const event = { isComposing: false, inputType: "insertText", data: " " } as InputEvent;
	const paragraph = parseComposerMarkdown("1. ");
	assert.equal(shouldRefreshInlinePresentation(event, paragraph, "1. ", 3), true);
	assert.equal(shouldRefreshInlinePresentation(event, parseComposerMarkdown("- "), "- ", 2), true);
	assert.equal(shouldRefreshInlinePresentation(event, parseComposerMarkdown("[] "), "[] ", 3), true);
	assert.equal(shouldRefreshInlinePresentation(event, parseComposerMarkdown("普通文字 "), "普通文字 ", 5), false);
	assert.equal(shouldRefreshInlinePresentation(event, parseComposerMarkdown("普通文字\n- 已有列表"), "普通文字\n- 已有列表", 5), false);
	assert.equal(shouldRefreshInlinePresentation({ ...event, data: "\n" } as InputEvent, parseComposerMarkdown("1.\n"), "1.\n", 4), false);
});

test("remaps the caret after normalizing fullwidth task markers", () => {
	assert.deepEqual(remapSelectionAfterNormalization("【】 ", "- [ ] ", { start: 3, end: 3 }), { start: 6, end: 6 });
	assert.deepEqual(remapSelectionAfterNormalization("前文 【】 ", "前文 - [ ] ", { start: 6, end: 6 }), { start: 9, end: 9 });
});

test("parses bare task markers with halfwidth and fullwidth brackets", () => {
	for (const source of ["[] 待办", "【】 待办", "- [] 待办", "1. 【】 待办"]) {
		const document = parseComposerMarkdown(source);
		assert.equal(document.blocks[0]?.type, "list", source);
		assert.equal(document.blocks[0]?.type === "list" ? document.blocks[0].items[0]?.checked : null, " ");
	}
});

test("keeps unsupported block Markdown as raw source", () => {
	const document = parseComposerMarkdown("> 引用\n普通文字");
	assert.deepEqual(document.blocks[0], { type: "raw", value: "> 引用" });
	assert.equal(serializeComposerMarkdown(document), "> 引用\n普通文字");
});

test("preserves a trailing newline", () => {
	const document = parseComposerMarkdown("- [ ] task\n");
	assert.equal(document.trailingNewline, true);
	assert.equal(serializeComposerMarkdown(document), "- [ ] task\n");
});

test("preserves blank lines between supported blocks", () => {
	const source = "第一段\n\n第二段";
	const document = parseComposerMarkdown(source);
	assert.equal(document.blocks.length, 1);
	assert.equal(serializeComposerMarkdown(document), source);
});

test("keeps a single Markdown newline as a soft break inside one paragraph", () => {
	const source = "第一行\n第二行";
	const document = parseComposerMarkdown(source);
	assert.equal(document.blocks.length, 1);
	assert.equal(serializeComposerMarkdown(document), source);
});

test("keeps leading, middle, and trailing ordinary line breaks in one editor paragraph", () => {
	for (const source of ["\n第一行", "第一行\n\n第二行", "第一行\n"]) {
		const document = parseComposerMarkdown(source);
		assert.equal(document.blocks.length, 1, source);
		assert.equal(serializeComposerMarkdown(document), source);
	}
});

test("preserves soft line breaks at paragraph boundaries", () => {
	assert.equal(serializeComposerMarkdown(parseComposerMarkdown("\n第一行")), "\n第一行");
	assert.equal(serializeComposerMarkdown(parseComposerMarkdown("第一行\n")), "第一行\n");
});

test("keeps adjacent editor paragraphs separated by a blank line", () => {
	const document = {
		blocks: [
			{ type: "paragraph" as const, inlines: [{ type: "text" as const, value: "第一段" }] },
			{ type: "paragraph" as const, inlines: [{ type: "text" as const, value: "第二段" }] },
		],
		trailingNewline: false,
	};
	assert.equal(serializeComposerMarkdown(document), "第一段\n\n第二段");
});

test("keeps typed text after an exited empty task on the correct line", () => {
	const document = {
		blocks: [
			{ type: "paragraph" as const, inlines: [{ type: "text" as const, value: "第一段" }] },
			{ type: "paragraph" as const, inlines: [{ type: "text" as const, value: "" }] },
			{ type: "paragraph" as const, inlines: [{ type: "text" as const, value: "第二段" }] },
		],
		trailingNewline: false,
	};
	assert.equal(serializeComposerMarkdown(document), "第一段\n\n第二段");
});
