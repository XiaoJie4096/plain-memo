import assert from "node:assert/strict";
import test from "node:test";

import { ComposerRichEnterState } from "../src/ui/ComposerRichEnterState";

test("consumes only the duplicate beforeinput following a handled Enter keydown", () => {
	const state = new ComposerRichEnterState();
	const snapshot = { markdown: "1. first\n2. ", selectionStart: 12, selectionEnd: 12 };
	state.markHandledKeydown(snapshot);

	assert.equal(state.consumeDuplicateBeforeInput(snapshot), true);
	assert.equal(state.consumeDuplicateBeforeInput(snapshot), false);
});

test("does not consume a beforeinput for a different Markdown snapshot", () => {
	const state = new ComposerRichEnterState();
	state.markHandledKeydown({ markdown: "- item\n- ", selectionStart: 9, selectionEnd: 9 });

	assert.equal(state.consumeDuplicateBeforeInput({ markdown: "- item\n- next", selectionStart: 13, selectionEnd: 13 }), false);
	assert.equal(state.consumeDuplicateBeforeInput({ markdown: "- item\n- next", selectionStart: 13, selectionEnd: 13 }), false);
});

test("keeps pending guards independent from keyup timing", () => {
	const state = new ComposerRichEnterState();
	const first = { markdown: "a", selectionStart: 1, selectionEnd: 1 };
	const second = { markdown: "a\n", selectionStart: 2, selectionEnd: 2 };
	state.markHandledKeydown(first);
	state.markHandledKeydown(second);
	assert.equal(state.consumeDuplicateBeforeInput(second), true);
	assert.equal(state.consumeDuplicateBeforeInput(first), true);
});

test("pairs multiple rapid Enter guards with multiple follow-up beforeinputs", () => {
	const state = new ComposerRichEnterState();
	const first = { markdown: "a", selectionStart: 1, selectionEnd: 1 };
	const second = { markdown: "a\n", selectionStart: 2, selectionEnd: 2 };
	state.markHandledKeydown(first);
	state.markHandledKeydown(second);
	assert.equal(state.consumeDuplicateBeforeInput(second), true);
	assert.equal(state.consumeDuplicateBeforeInput(first), true);
	assert.equal(state.consumeDuplicateBeforeInput(first), false);
});
