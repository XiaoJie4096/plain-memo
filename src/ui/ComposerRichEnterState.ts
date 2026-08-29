export interface RichEditorEnterSnapshot {
	markdown: string;
	selectionStart: number;
	selectionEnd: number;
}

/** Consumes the stray beforeinput that some Chromium paths emit after handled Enter keydown. */
export class ComposerRichEnterState {
	private pending: RichEditorEnterSnapshot[] = [];

	markHandledKeydown(snapshot: RichEditorEnterSnapshot): void {
		this.pending.push(snapshot);
	}

	consumeDuplicateBeforeInput(snapshot: RichEditorEnterSnapshot): boolean {
		const pending = this.pending.shift();
		// Chromium may mutate/re-render the editor before dispatching the stray
		// beforeinput, so its snapshot can legitimately differ from keydown's.
		// The pending marker is scoped to the next event/frame and is sufficient
		// to identify that duplicate without risking a second newline insertion.
		void snapshot;
		return pending !== undefined;
	}

	clear(expected?: RichEditorEnterSnapshot): void {
		if (expected === undefined) {
			this.pending = [];
			return;
		}
		const index = this.pending.indexOf(expected);
		if (index >= 0) this.pending.splice(index, 1);
	}
}
