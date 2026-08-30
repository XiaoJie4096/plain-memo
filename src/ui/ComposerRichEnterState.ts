export interface RichEditorEnterSnapshot {
	markdown: string;
	selectionStart: number;
	selectionEnd: number;
}

/** Consumes the stray beforeinput that some Chromium paths emit after handled Enter keydown. */
export class ComposerRichEnterState {
	private pending: Array<{ snapshot: RichEditorEnterSnapshot; expiresAt: number }> = [];

	markHandledKeydown(snapshot: RichEditorEnterSnapshot): void {
		this.pending.push({ snapshot, expiresAt: Date.now() + 150 });
	}

	consumeDuplicateBeforeInput(snapshot: RichEditorEnterSnapshot): boolean {
		const now = Date.now();
		while (this.pending[0] !== undefined && this.pending[0].expiresAt < now) {
			this.pending.shift();
		}
		// Match the post-render Markdown, not merely queue order. A real Enter can
		// arrive after an earlier handled Enter whose duplicate never fired; using
		// shift() here would swallow that real event and leave task lists stuck.
		const index = this.pending.findIndex((entry) => entry.snapshot.markdown === snapshot.markdown);
		if (index < 0) return false;
		this.pending.splice(index, 1);
		return true;
	}

	clear(expected?: RichEditorEnterSnapshot): void {
		if (expected === undefined) {
			this.pending = [];
			return;
		}
		const index = this.pending.findIndex((entry) => entry.snapshot === expected);
		if (index >= 0) this.pending.splice(index, 1);
	}
}
