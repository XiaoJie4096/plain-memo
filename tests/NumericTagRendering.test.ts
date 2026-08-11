import test from "node:test";
import assert from "node:assert/strict";

import { splitRecognizedNumericTags } from "../src/ui/NumericTagRendering";

test("splits numeric tags recognized by PlainMemo metadata", () => {
	assert.deepEqual(splitRecognizedNumericTags("#1\n#123 #123a #a123", ["1", "123", "123a", "a123"]), [
		{ type: "tag", value: "1" },
		{ type: "text", value: "\n" },
		{ type: "tag", value: "123" },
		{ type: "text", value: " #123a #a123" },
	]);
});

test("leaves unrecognized numeric text and embedded hashes unchanged", () => {
	assert.deepEqual(splitRecognizedNumericTags("year#2026 #404 (#7)", ["7"]), [
		{ type: "text", value: "year#2026 #404 (#7)" },
	]);
});

test("does not treat numeric hashes inside words as tags", () => {
	assert.deepEqual(splitRecognizedNumericTags("before#1 #1-after #1", ["1"]), [
		{ type: "text", value: "before#1 #1-after " },
		{ type: "tag", value: "1" },
	]);
});
