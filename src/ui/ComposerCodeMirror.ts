import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { applyListFormatToText, getHashInsertionText, getListEnterPatch, type ListFormatType } from "../utils/composerInput";

export interface ComposerEditorSelection { start: number; end: number; }
/** DOM-compatible view of the CodeMirror surface used by legacy integrations. */
export interface ComposerInputSurface extends HTMLElement {
	value: string;
	selectionStart: number;
	selectionEnd: number;
	disabled: boolean;
	readOnly: boolean;
	setSelectionRange(start: number, end: number): void;
}
export interface ComposerCodeMirrorOptions {
	onChange: (markdown: string, selection: ComposerEditorSelection, event?: InputEvent) => void;
	onInput?: (event: InputEvent) => void;
	onSelectionChange?: (markdown: string, selection: ComposerEditorSelection) => void;
	onBeforeInput?: (event: InputEvent) => boolean;
	onKeydown?: (event: KeyboardEvent) => boolean;
	shouldSkipSelectionChangeOnKeyup?: (event: KeyboardEvent) => boolean;
	onCompositionStart?: () => void;
	onCompositionEnd?: (event: CompositionEvent, markdown: string, selection: ComposerEditorSelection) => void;
	onShortcut?: (event: KeyboardEvent) => boolean;
	resolveImageUrl?: (source: string) => string | null;
	ariaLabelledBy?: string;
}

class ComposerMarkdownDecorations {
	decorations = Decoration.none;
	constructor(view: EditorView, private readonly resolveImageUrl?: (source: string) => string | null) { this.decorations = this.build(view); }
	update(update: ViewUpdate): void { if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view); }
	private build(view: EditorView) {
		const builder = new RangeSetBuilder<Decoration>();
		const ranges: Array<{ from: number; to: number; decoration: Decoration }> = [];
		for (const { from, to } of view.visibleRanges) {
			const text = view.state.doc.sliceString(from, to);
			const tagRegex = /(^|\s)(#[^\s#]+)(?=\s|$)/gm;
			let tag: RegExpExecArray | null;
			while ((tag = tagRegex.exec(text)) !== null) {
				const prefixLength = tag[1]?.length ?? 0;
				ranges.push({
					from: from + tag.index + prefixLength,
					to: from + tag.index + tag[0].length,
					decoration: Decoration.mark({ class: "plain-memo-cm-tag" }),
				});
			}
			if (this.resolveImageUrl !== undefined) {
				const imageRegex = /!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]*\)/g;
				let image: RegExpExecArray | null;
				while ((image = imageRegex.exec(text)) !== null) {
					const source = image[0];
					const url = this.resolveImageUrl(source);
					if (url !== null) ranges.push({ from: from + image.index, to: from + image.index + source.length, decoration: Decoration.replace({ widget: new ImageWidget(source, url), inclusive: false }) });
				}
			}
			const taskRegex = /^(\s*(?:[-*+]\s+|\d+[.)]\s+))(?:\[[ xX-]\]|【】)(?=\s|$)/gm;
			let task: RegExpExecArray | null;
			while ((task = taskRegex.exec(text)) !== null) {
				const start = from + task.index;
				const source = task[0];
				const checked = /\[[xX]\]/.test(source);
				ranges.push({ from: start, to: start + source.length, decoration: Decoration.replace({ widget: new TaskCheckboxWidget(source, checked), inclusive: false }) });
			}
			const listRegex = /^(\s*)([-*+]\s+|\d+[.)]\s+)(?!\[[ xX-]\]|【】)/gm;
			let list: RegExpExecArray | null;
			while ((list = listRegex.exec(text)) !== null) {
				const marker = list[0];
				const number = /^\d+/.test(list[2] ?? "")
					? (list[2]?.match(/^\d+/)?.[0] ?? "1")
					: null;
				ranges.push({
					from: from + list.index,
					to: from + list.index + marker.length,
					decoration: Decoration.replace({
						widget: new ListMarkerWidget(number),
						inclusive: false,
					}),
				});
			}
		}
		ranges.sort((a, b) => a.from - b.from || a.to - b.to);
		let lastTo = -1;
		for (const range of ranges) {
			// A tag-like token inside an image destination/alt text must not
			// overlap the image replacement range.
			if (range.from < lastTo) continue;
			builder.add(range.from, range.to, range.decoration);
			lastTo = range.to;
		}
		return builder.finish();
	}
}

class TaskCheckboxWidget extends WidgetType {
	constructor(private readonly source: string, private readonly checked: boolean) { super(); }
	toDOM(view: EditorView): HTMLElement {
		const input = view.dom.ownerDocument.createElement("input");
		input.type = "checkbox"; input.checked = this.checked; input.className = "plain-memo-cm-task-checkbox";
		input.addEventListener("change", () => {
			const replacement = this.source.replace(/\[[ xX-]\]|【】/, input.checked ? "[x]" : "[ ]");
			const position = view.posAtDOM(input);
			view.dispatch({ changes: { from: position, to: position + this.source.length, insert: replacement } });
		});
		return input;
	}
	ignoreEvent(): boolean { return false; }
}

class ImageWidget extends WidgetType {
	constructor(private readonly source: string, private readonly url: string) { super(); }
	toDOM(view: EditorView): HTMLElement {
		const document = view.dom.ownerDocument;
		const wrapper = document.createElement("span"); wrapper.className = "plain-memo-rich-editor-image"; wrapper.dataset.source = this.source;
		const image = document.createElement("img"); image.src = this.url; image.alt = this.source; image.loading = "lazy"; wrapper.appendChild(image); return wrapper;
	}
	// Let CodeMirror own pointer events so dragging across an inline image keeps
	// one continuous document selection. The image is a visual decoration, not
	// a second editable surface.
	ignoreEvent(): boolean { return false; }
}

class ListMarkerWidget extends WidgetType {
	constructor(private readonly number: string | null) { super(); }
	toDOM(view: EditorView): HTMLElement {
		const marker = view.dom.ownerDocument.createElement("span");
		marker.className = "plain-memo-cm-list-marker-widget";
		marker.setAttribute("aria-hidden", "true");
		marker.textContent = this.number === null ? "•" : `${this.number}.`;
		return marker;
	}
	ignoreEvent(): boolean { return false; }
}

/** Text-first PlainMemo editor backed by the official CodeMirror 6 state/view. */
export class ComposerCodeMirror {
	readonly view: EditorView;
	readonly el: HTMLDivElement;
	private lastSyncedMarkdown: string;
	private savedSelection: ComposerEditorSelection | null = null;

	constructor(container: HTMLElement, initialMarkdown: string, private readonly options: ComposerCodeMirrorOptions) {
		this.lastSyncedMarkdown = initialMarkdown;
		const state = EditorState.create({ doc: initialMarkdown, extensions: [
			markdown(), EditorView.lineWrapping, history(),
			keymap.of([{ key: "Enter", run: insertParagraphCommand }, ...defaultKeymap, ...historyKeymap, indentWithTab]),
			ViewPlugin.define((view) => new ComposerMarkdownDecorations(view, options.resolveImageUrl), { decorations: (value) => value.decorations }),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) { this.lastSyncedMarkdown = update.state.doc.toString(); this.options.onChange(this.lastSyncedMarkdown, this.getSelection()); }
				if (update.selectionSet) this.notifySelectionChange();
			}),
		] });
		this.view = new EditorView({ state, parent: container });
		// Expose CodeMirror's actual editable surface, not the outer `.cm-editor`
		// shell. All PlainMemo focus, disabled-state, and input listeners must
		// address this one element so there is no second editable boundary.
		this.el = this.view.contentDOM as HTMLDivElement;
		this.el.classList.add("plain-memo-rich-editor", "plain-memo-code-mirror-editor");
		this.el.spellcheck = true;
		this.el.setAttribute("contenteditable", "true"); this.el.setAttribute("role", "textbox"); this.el.setAttribute("aria-multiline", "true");
		if (options.ariaLabelledBy !== undefined) this.el.setAttribute("aria-labelledby", options.ariaLabelledBy);
		this.el.addEventListener("beforeinput", (event) => { if (options.onBeforeInput?.(event as InputEvent) === true) event.preventDefault(); });
		this.el.addEventListener("input", (event) => options.onInput?.(event as InputEvent));
		this.el.addEventListener("keydown", (event) => { if (options.onKeydown?.(event) === true || options.onShortcut?.(event) === true) event.preventDefault(); });
		this.el.addEventListener("focus", () => this.notifySelectionChange());
		this.el.addEventListener("keyup", (event) => { if (options.shouldSkipSelectionChangeOnKeyup?.(event) !== true) this.notifySelectionChange(); });
		this.el.addEventListener("compositionstart", () => options.onCompositionStart?.());
		this.el.addEventListener("compositionend", (event) => options.onCompositionEnd?.(event as CompositionEvent, this.getMarkdown(), this.getSelection()));
	}

	getMarkdown(): string { return this.view.state.doc.toString(); }
	getInputSurface(): ComposerInputSurface {
		const surface = this.el as unknown as ComposerInputSurface;
		if (!Object.prototype.hasOwnProperty.call(surface, "value")) {
			Object.defineProperties(surface, {
				value: { configurable: true, get: () => this.getMarkdown(), set: (value: string) => this.setMarkdown(String(value)) },
				selectionStart: { configurable: true, get: () => this.getSelection().start },
				selectionEnd: { configurable: true, get: () => this.getSelection().end },
				disabled: {
					configurable: true,
					get: () => this.el.contentEditable === "false",
					set: (value: boolean) => { this.el.contentEditable = value ? "false" : "true"; },
				},
				readOnly: {
					configurable: true,
					get: () => this.el.contentEditable === "false",
					set: (value: boolean) => { this.el.contentEditable = value ? "false" : "true"; },
				},
				setSelectionRange: { configurable: true, value: (start: number, end: number) => this.setSelection(start, end) },
			});
		}
		return surface;
	}
	setMarkdown(markdownText: string): void { if (markdownText !== this.getMarkdown()) this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: markdownText } }); this.lastSyncedMarkdown = markdownText; }
	getLastSyncedMarkdown(): string { return this.lastSyncedMarkdown; }
	getSelection(): ComposerEditorSelection { const range = this.view.state.selection.main; const selection = { start: range.from, end: range.to }; this.savedSelection = selection; return selection; }
	setSelection(start: number, end = start): void {
		const safeStart = clampEditorPosition(start, this.view.state.doc.length);
		const safeEnd = clampEditorPosition(Math.max(safeStart, end), this.view.state.doc.length);
		const current = this.view.state.selection.main;
		if (current.from === safeStart && current.to === safeEnd) return;
		this.view.dispatch({ selection: EditorSelection.range(safeStart, safeEnd), scrollIntoView: true });
	}
	applyListFormat(type: ListFormatType): void { const s = this.getSelection(); const p = applyListFormatToText(this.getMarkdown(), s.start, s.end, type); this.setMarkdownAndRestoreSelection(p.value, p.cursor); }
	insertText(text: string): void { const s = this.getSelection(); const value = text === "#" ? getHashInsertionText(this.getMarkdown(), s.start) : text; this.view.dispatch({ changes: { from: s.start, to: s.end, insert: value }, selection: { anchor: s.start + value.length } }); }
	insertParagraph(): void { const s = this.getSelection(); const p = getListEnterPatch(this.getMarkdown(), s.start, s.end); if (p !== null) this.setMarkdownAndRestoreSelection(p.value, p.cursor); else this.insertText("\n"); }
	insertWikiLinkShell(): void { const s = this.getSelection(); const selected = this.getMarkdown().slice(s.start, s.end); const value = `[[${selected}]]`; this.view.dispatch({ changes: { from: s.start, to: s.end, insert: value }, selection: { anchor: s.start + 2 + selected.length } }); }
	focus(_options?: FocusOptions): void { this.view.focus(); }
	focusAndRestoreSelection(start: number, end = start): void { this.setSelection(start, end); this.view.focus(); }
	setMarkdownAndRestoreSelection(markdownText: string, start: number, end = start): void {
		const current = this.getMarkdown();
		const safeStart = clampEditorPosition(start, markdownText.length);
		const safeEnd = clampEditorPosition(Math.max(safeStart, end), markdownText.length);
		if (current === markdownText) this.setSelection(safeStart, safeEnd);
		else this.view.dispatch({ changes: { from: 0, to: current.length, insert: markdownText }, selection: EditorSelection.range(safeStart, safeEnd), scrollIntoView: true });
		this.lastSyncedMarkdown = markdownText;
	}
	getCaretRectAt(offset: number): DOMRect | null { const c = this.view.coordsAtPos(Math.max(0, Math.min(offset, this.view.state.doc.length))); return c === null ? null : new DOMRect(c.left, c.top, c.right - c.left, c.bottom - c.top); }
	rememberSelectionBeforeToolbarAction(): void { this.savedSelection = this.getSelection(); }
	destroy(): void { this.view.destroy(); }
	private notifySelectionChange(): void { this.options.onSelectionChange?.(this.getMarkdown(), this.getSelection()); }
}

function clampEditorPosition(position: number, length: number): number {
	return Math.max(0, Math.min(length, Number.isFinite(position) ? Math.trunc(position) : length));
}

function insertParagraphCommand(view: EditorView): boolean {
	const range = view.state.selection.main;
	const source = view.state.doc.toString();
	const patch = getListEnterPatch(source, range.from, range.to);
	if (patch !== null) {
		view.dispatch({ changes: { from: range.from, to: range.to, insert: patch.value.slice(range.from, patch.value.length - (source.length - range.to)) }, selection: { anchor: patch.cursor }, scrollIntoView: true });
		return true;
	}
	view.dispatch({ changes: { from: range.from, to: range.to, insert: "\n" }, selection: { anchor: range.from + 1 }, scrollIntoView: true });
	return true;
}
