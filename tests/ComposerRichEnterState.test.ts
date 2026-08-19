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

test("does not consume a later Enter after the editor content changed", () => {
	const state = new ComposerRichEnterState();
	state.markHandledKeydown({ markdown: "- item\n- ", selectionStart: 9, selectionEnd: 9 });

	assert.equal(state.consumeDuplicateBeforeInput({ markdown: "- item\n- next", selectionStart: 13, selectionEnd: 13 }), false);
});
