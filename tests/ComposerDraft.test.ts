import test from "node:test";
import assert from "node:assert/strict";

import {
	captureCreateDraft,
	formatMarkdownQuoteDraft,
	getComposerMode,
	getComposerContentAfterSave,
	getDiscardedComposerAttachmentPaths,
	getDraftForComposerClose,
	prepareComposerCreateInput,
	prepareComposerSaveInput,
	shouldDismissBlankCreateComposer,
} from "../src/ui/ComposerDraft";

test("composer restores a create draft after temporarily editing another memo", () => {
	const createDraft = captureCreateDraft("", "unfinished new memo", "create");

	assert.equal(captureCreateDraft(createDraft, "existing memo edit", "edit"), createDraft);
	assert.equal(getComposerContentAfterSave("update", createDraft), "unfinished new memo");
	assert.equal(getComposerContentAfterSave("create", createDraft), "");
});

test("composer keeps pending images still referenced by a preserved create draft", () => {
	assert.deepEqual(getDiscardedComposerAttachmentPaths(
		["PlainMemo/picture/draft.png", "PlainMemo/picture/edit.png", "PlainMemo/picture/orphan.png"],
		new Set(["PlainMemo/picture/edit.png"]),
		new Set(["PlainMemo/picture/draft.png"]),
	), ["PlainMemo/picture/orphan.png"]);
});

test("mobile Back dismisses only a blank create composer", () => {
	assert.equal(shouldDismissBlankCreateComposer("   ", null), true);
	assert.equal(shouldDismissBlankCreateComposer("draft", null), false);
	assert.equal(shouldDismissBlankCreateComposer("   ", { id: "memo-1" }), false);
});

test("composer draft resolves mode from editing and quote state", () => {
	assert.equal(getComposerMode(null, null), "create");
	assert.equal(getComposerMode({ id: "memo-1" }, null), "edit");
	assert.equal(getComposerMode(null, "memo-1"), "quote");
	assert.equal(getComposerMode({ id: "memo-1" }, "memo-2"), "edit");
});

test("composer draft keeps non-quote drafts when closing", () => {
	assert.equal(getDraftForComposerClose("draft memo", "create", "> source"), "draft memo");
	assert.equal(getDraftForComposerClose("draft memo", "edit", "> source"), "draft memo");
	assert.equal(getDraftForComposerClose("draft memo", "quote", null), "draft memo");
});

test("composer draft drops an unchanged quote-only draft when closing", () => {
	assert.equal(getDraftForComposerClose("> source memo\n", "quote", "> source memo"), "");
	assert.equal(getDraftForComposerClose("> source memo\n\nreply", "quote", "> source memo"), "> source memo\n\nreply");
});

test("formats referenced memo content as a Markdown quote draft", () => {
	assert.equal(formatMarkdownQuoteDraft("source memo"), "> source memo");
	assert.equal(formatMarkdownQuoteDraft("first\n\nsecond"), "> first\n> \n> second");
});

test("composer create input leaves plain create input unchanged", () => {
	assert.deepEqual(
		prepareComposerCreateInput("plain memo", {
			sourceMemoId: null,
			referenceText: "[[Daily#^abc]]",
			markdownText: "> source memo",
		}),
		{
			content: "plain memo",
			sourceMemoId: null,
			sourceReferenceText: null,
			quoteTrailer: null,
		},
	);
});

test("composer create input builds referenced quote content", () => {
	assert.deepEqual(
		prepareComposerCreateInput("reply memo", {
			sourceMemoId: "source-id",
			referenceText: "[[Daily#^abc]]",
			markdownText: "> source memo",
		}),
		{
			content: "reply memo [[Daily#^abc]]\n> source memo",
			sourceMemoId: "source-id",
			sourceReferenceText: "[[Daily#^abc]]",
			quoteTrailer: null,
		},
	);
});

test("composer save input rejects blank content", () => {
	assert.deepEqual(
		prepareComposerSaveInput(" \n\t", null, {
			sourceMemoId: null,
			referenceText: null,
			markdownText: null,
		}),
		{ type: "empty" },
	);
});

test("composer save input prepares edits without quote context", () => {
	const editingMemo = { id: "memo-1" };

	assert.deepEqual(
		prepareComposerSaveInput("updated memo", editingMemo, {
			sourceMemoId: "source-id",
			referenceText: "[[Daily#^abc]]",
			markdownText: "> source memo",
		}),
		{
			type: "update",
			previousMemo: editingMemo,
			content: "updated memo",
		},
	);
});

test("composer save input prepares plain creates", () => {
	assert.deepEqual(
		prepareComposerSaveInput("plain memo", null, {
			sourceMemoId: null,
			referenceText: null,
			markdownText: null,
		}),
		{
			type: "create",
			content: "plain memo",
			source: "plugin_input",
			sourceMemoId: null,
			sourceReferenceText: null,
			dailyTrailer: null,
		},
	);
});

test("composer save input prepares quote creates", () => {
	assert.deepEqual(
		prepareComposerSaveInput("reply memo", null, {
			sourceMemoId: "source-id",
			referenceText: "[[Daily#^abc]]",
			markdownText: "> source memo",
		}),
		{
			type: "create",
			content: "reply memo [[Daily#^abc]]\n> source memo",
			source: "quote_create",
			sourceMemoId: "source-id",
			sourceReferenceText: "[[Daily#^abc]]",
			dailyTrailer: null,
		},
	);
});
