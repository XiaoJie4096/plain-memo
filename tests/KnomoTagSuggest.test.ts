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

test("returns no suggestions once the current query exactly matches an existing tag", () => {
	const input = new FakeTextArea("#123a", 5);
	const file = { path: "PlainMemo/example.md" };
	const app = {
		vault: { getMarkdownFiles: () => [file] },
		metadataCache: { getFileCache: () => ({ tags: ["#123a", "#123a/123"] }) },
	} as unknown as App;
	const suggest = new KnomoTagSuggest(app, input.asTextArea(), () => undefined, {
		suggestHostEl: {} as HTMLDivElement,
	});
	(suggest as unknown as { activationState: { enableExplicitly: () => void } }).activationState.enableExplicitly();

	const suggestions = (suggest as unknown as { getSuggestions: (query: string) => Array<{ tag: string }> })
		.getSuggestions("123a");

	assert.deepEqual(suggestions, []);
});

test("deactivates the query before mirroring an accepted suggestion", () => {
	const input = new FakeTextArea("#pro", 4);
	let replacement: { value: string; cursor: number } | null = null;
	const suggest = new KnomoTagSuggest({} as App, input.asTextArea(), () => undefined, {
		suggestHostEl: {} as HTMLDivElement,
		onSuggestionSelected: (next) => {
			replacement = next;
		},
	});
	(suggest as unknown as { activationState: { enableExplicitly: () => void } }).activationState.enableExplicitly();

	(suggest as unknown as { selectSuggestion: (value: { tag: string }, event: KeyboardEvent) => void })
		.selectSuggestion({ tag: "project/knomo" }, {} as KeyboardEvent);

	assert.deepEqual(replacement, { value: "#project/knomo ", cursor: 15 });
	assert.equal((suggest as unknown as { activationState: { isEnabled: () => boolean } }).activationState.isEnabled(), false);
});

test("settles an accepted suggestion even when synchronization closes the popover", () => {
	const frames = new FakeAnimationFrames();
	const input = new FakeTextArea("#pro", 4, frames.asWindow());
	let settled: { value: string; cursor: number } | null = null;
	let suggest: KnomoTagSuggest;
	suggest = new KnomoTagSuggest({} as App, input.asTextArea(), () => undefined, {
		suggestHostEl: {} as HTMLDivElement,
		onSuggestionSelected: () => suggest.close(),
		onSuggestionSettled: (next) => {
			settled = next;
		},
	});
	(suggest as unknown as { activationState: { enableExplicitly: () => void } }).activationState.enableExplicitly();

	(suggest as unknown as { selectSuggestion: (value: { tag: string }, event: KeyboardEvent) => void })
		.selectSuggestion({ tag: "project/knomo" }, {} as KeyboardEvent);
	assert.equal(settled, null);

	frames.flush();
	assert.deepEqual(settled, { value: "#project/knomo ", cursor: 15 });
});

class FakeTextArea {
	readonly ownerDocument: { defaultView: Window | null; querySelectorAll: () => never[] };
	selectionEnd: number;

	constructor(readonly value: string, readonly selectionStart: number, defaultView: Window | null = null) {
		this.selectionEnd = selectionStart;
		this.ownerDocument = { defaultView, querySelectorAll: () => [] };
	}

	addEventListener(): void {}

	asTextArea(): HTMLTextAreaElement {
		return this as unknown as HTMLTextAreaElement;
	}
}

class FakeAnimationFrames {
	private callback: FrameRequestCallback | null = null;

	asWindow(): Window {
		return {
			requestAnimationFrame: (callback: FrameRequestCallback) => {
				this.callback = callback;
				return 1;
			},
			cancelAnimationFrame: () => {
				this.callback = null;
			},
		} as unknown as Window;
	}

	flush(): void {
		const callback = this.callback;
		this.callback = null;
		callback?.(0);
	}
}
