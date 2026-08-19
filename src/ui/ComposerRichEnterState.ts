export interface RichEditorEnterSnapshot {
	markdown: string;
	selectionStart: number;
	selectionEnd: number;
}

/** Consumes the stray beforeinput that some Chromium paths emit after handled Enter keydown. */
export class ComposerRichEnterState {
	private pending: RichEditorEnterSnapshot | null = null;

	markHandledKeydown(snapshot: RichEditorEnterSnapshot): void {
		this.pending = snapshot;
	}

	consumeDuplicateBeforeInput(snapshot: RichEditorEnterSnapshot): boolean {
		const pending = this.pending;
		this.pending = null;
		return pending?.markdown === snapshot.markdown
			&& pending.selectionStart === snapshot.selectionStart
			&& pending.selectionEnd === snapshot.selectionEnd;
	}

	clear(): void {
		this.pending = null;
	}
}
