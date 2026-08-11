import test from "node:test";
import assert from "node:assert/strict";

import { popMobileTagHistory, pushMobileTagHistory } from "../src/ui/MobileTagHistory";

test("mobile tag history keeps two previous tags before falling back to home", () => {
	let history = pushMobileTagHistory<string>([], "home");
	history = pushMobileTagHistory(history, "tag-a");
	history = pushMobileTagHistory(history, "tag-b");

	assert.deepEqual(history, ["tag-a", "tag-b"]);

	const firstBack = popMobileTagHistory(history);
	assert.equal(firstBack.value, "tag-b");

	const secondBack = popMobileTagHistory(firstBack.entries);
	assert.equal(secondBack.value, "tag-a");

	const thirdBack = popMobileTagHistory(secondBack.entries);
	assert.equal(thirdBack.value, null);
});
