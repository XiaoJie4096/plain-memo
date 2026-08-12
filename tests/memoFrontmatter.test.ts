import test from "node:test";
import assert from "node:assert/strict";

import {
	getMemoCollapseLineWeight,
	getMemoVisibleContent,
	restoreMemoFrontmatter,
	splitLeadingMemoFrontmatter,
} from "../src/utils/memoFrontmatter";

const legacyMemo = "---\ncreated: 2025-08-05T08:55:37\n---\nfirst line\n\nsecond line";

test("splits only a complete leading YAML frontmatter block", () => {
	assert.deepEqual(splitLeadingMemoFrontmatter(legacyMemo), {
		frontmatter: "---\ncreated: 2025-08-05T08:55:37\n---\n",
		body: "first line\n\nsecond line",
	});
	assert.equal(getMemoVisibleContent("---\nnot closed\nbody"), "---\nnot closed\nbody");
});

test("restores existing frontmatter unchanged after editing the body", () => {
	assert.equal(
		restoreMemoFrontmatter(legacyMemo, "updated body"),
		"---\ncreated: 2025-08-05T08:55:37\n---\nupdated body",
	);
	assert.equal(restoreMemoFrontmatter("plain memo", "updated body"), "updated body");
});

test("counts visible text by estimated wrapped lines and each blank run as 0.33 lines", () => {
	assert.equal(getMemoCollapseLineWeight(legacyMemo), 2.33);
	assert.equal(getMemoCollapseLineWeight("one\n\n\ntwo"), 2.33);
	assert.equal(getMemoCollapseLineWeight("one\n\ntwo\n\nthree"), 3.66);
});

test("estimates Chinese characters as twice the width of English letters and digits", () => {
	assert.equal(getMemoCollapseLineWeight("一二三四五", 4), 3);
	assert.equal(getMemoCollapseLineWeight("abcd12", 4), 2);
	assert.equal(getMemoCollapseLineWeight("一二ab三", 4), 2);
});
