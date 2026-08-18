import test from "node:test";
import assert from "node:assert/strict";

import { prepareMemoCardMarkdown } from "../src/ui/MemoCardMarkdown";

test("turns plain memo paragraph line breaks into explicit Markdown hard breaks", () => {
	assert.equal(
		prepareMemoCardMarkdown("第一行\n第二行\n第三行"),
		"第一行  \n第二行  \n第三行",
	);
});

test("keeps blank-line paragraph boundaries unchanged", () => {
	assert.equal(
		prepareMemoCardMarkdown("第一段\n\n第二段"),
		"第一段\n\n第二段",
	);
});

test("keeps existing Markdown hard breaks unchanged", () => {
	assert.equal(
		prepareMemoCardMarkdown("空格硬换行  \n反斜杠硬换行\\\n最后一行"),
		"空格硬换行  \n反斜杠硬换行\\\n最后一行",
	);
});

test("does not add hard breaks across Markdown block structures", () => {
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

	assert.equal(prepareMemoCardMarkdown(markdown), markdown);
});

test("ends a task list before the following ordinary paragraph", () => {
	assert.equal(
		prepareMemoCardMarkdown("- [ ] task\n退出任务列表\n普通内容"),
		"- [ ] task\n\n退出任务列表  \n普通内容",
	);
});

test("keeps consecutive task and other list items in the same list block", () => {
	const markdown = "- [ ] task\n- 普通列表项\n普通段落";
	assert.equal(prepareMemoCardMarkdown(markdown), "- [ ] task\n- 普通列表项\n普通段落");
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

	assert.equal(prepareMemoCardMarkdown(markdown), markdown);
});

test("preserves inline Markdown while making its paragraph line break explicit", () => {
	assert.equal(
		prepareMemoCardMarkdown("**粗体**、[[内部链接]]和 #标签\n继续正文"),
		"**粗体**、[[内部链接]]和 #标签  \n继续正文",
	);
});
