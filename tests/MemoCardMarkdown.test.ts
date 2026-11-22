import test from "node:test";
import assert from "node:assert/strict";

import { prepareMemoCardMarkdown } from "../src/ui/MemoCardMarkdown";

test("distinguishes ordinary prose boundaries from real blank lines", () => {
	const source = prepareMemoCardMarkdown("First\nSecond\n\nThird\nFourth");
	assert.equal(source.markdown, "First\n\nSecond\n\nThird\n\nFourth");
	assert.deepEqual([...source.syntheticBreaks], [6, 21]);
});

test("keeps blank-line paragraph boundaries unchanged", () => {
	assert.equal(
		prepareMemoCardMarkdown("第一段\n\n第二段").markdown,
		"第一段\n\n第二段",
	);
});

test("keeps existing Markdown hard breaks unchanged", () => {
	assert.equal(
		prepareMemoCardMarkdown("空格硬换行  \n反斜杠硬换行\\\n最后一行").markdown,
		"空格硬换行  \n反斜杠硬换行\\\n最后一行",
	);
});

test("does not split Markdown block structures", () => {
	const markdown = [
		"# 标题",
		"- 列表一",
		"- 列表二",
		"> 引用一",
		"> 引用二",
		"| 列一 | 列二 |",
		"| --- | --- |",
		"| 值一 | 值二 |",
	].join("\n");

	assert.equal(prepareMemoCardMarkdown(markdown).markdown, markdown);
});

test("normalizes fullwidth ordered markers for card rendering", () => {
	assert.equal(
		prepareMemoCardMarkdown("1。 第一项\n2。 第二项").markdown,
		"1. 第一项\n2. 第二项",
	);
});

test("ends a task list before the following ordinary paragraph", () => {
	assert.equal(
		prepareMemoCardMarkdown("- [ ] task\n退出任务列表\n普通内容").markdown,
		"- [ ] task\n\n退出任务列表\n\n普通内容",
	);
});

test("keeps consecutive task and other list items in the same list block", () => {
	const markdown = "- [ ] task\n- 普通列表项\n普通段落";
	assert.equal(prepareMemoCardMarkdown(markdown).markdown, "- [ ] task\n- 普通列表项\n普通段落");
});

test("does not rewrite fenced code block contents", () => {
	const markdown = [
		"代码如下",
		"```ts",
		"const first = 1;",
		"const second = 2;",
		"```",
		"代码结束",
	].join("\n");

	assert.equal(prepareMemoCardMarkdown(markdown).markdown, markdown);
});

test("preserves inline Markdown when starting a new paragraph", () => {
	assert.equal(
		prepareMemoCardMarkdown("**粗体**、[[内部链接]]和 #标签\n继续正文").markdown,
		"**粗体**、[[内部链接]]和 #标签\n\n继续正文",
	);
});

test("never inserts a task boundary inside a code fence", () => {
	const markdown = "```md\n- [ ] text\nregular text\n```";
	assert.equal(prepareMemoCardMarkdown(markdown).markdown, markdown);
});

test("preserves explicit line breaks, multiline formatting, and Setext headings", () => {
	for (const markdown of [
		"First<br>\nsecond",
		"**First\nsecond**",
		"First\nsecond\n======",
		"$$\nx + y\ny = z\n$$",
		"%%\nfirst hidden line\nsecond hidden line\n%%",
	]) {
		const source = prepareMemoCardMarkdown(markdown);
		assert.equal(source.markdown, markdown);
		assert.equal(source.syntheticBreaks.size, 0);
	}
});
