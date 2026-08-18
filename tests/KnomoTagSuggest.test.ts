import test from "node:test";
import assert from "node:assert/strict";
import type { App } from "obsidian";

import { KnomoTagSuggest } from "../src/ui/KnomoTagSuggest";

test("refreshes Obsidian candidates for a programmatically inserted hash", () => {
	const input = new FakeTextArea("#", 1);
	const suggest = new KnomoTagSuggest({} as App, input.asTextArea(), () => undefined, {
		suggestHostEl: {} as HTMLDivElement,
	});
	let refreshCount = 0;
	(suggest as unknown as { onInputChange: () => void }).onInputChange = () => {
		refreshCount += 1;
	};

	suggest.openForCurrentTrigger();
	assert.equal(refreshCount, 1);

	// A native input event refreshes itself; avoid a second rebuild from PlainMemo.
	suggest.openForCurrentTrigger(false);
	assert.equal(refreshCount, 1);
});

test("returns every cached vault tag for an empty active query", () => {
	const input = new FakeTextArea("#", 1);
	const file = { path: "PlainMemo/example.md" };
	const app = {
		vault: { getMarkdownFiles: () => [file] },
		metadataCache: { getFileCache: () => ({ tags: ["#123a", "#概念", "#思考"] }) },
	} as unknown as App;
	const suggest = new KnomoTagSuggest(app, input.asTextArea(), () => undefined, {
		suggestHostEl: {} as HTMLDivElement,
	});
	(suggest as unknown as { activationState: { enableExplicitly: () => void } }).activationState.enableExplicitly();

	const suggestions = (suggest as unknown as { getSuggestions: (query: string) => Array<{ tag: string }> }).getSuggestions("");
	assert.deepEqual(suggestions.map((suggestion) => suggestion.tag), ["123a", "概念", "思考"]);
});

class FakeTextArea {
	readonly ownerDocument = {
		defaultView: null,
		querySelectorAll: () => [],
	};
	selectionEnd: number;

	constructor(readonly value: string, readonly selectionStart: number) {
		this.selectionEnd = selectionStart;
	}

	addEventListener(): void {}

	asTextArea(): HTMLTextAreaElement {
		return this as unknown as HTMLTextAreaElement;
	}
}
