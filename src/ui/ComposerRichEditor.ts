import {
	parseComposerInline,
	parseComposerMarkdown,
	serializeComposerInline,
	serializeComposerMarkdown,
	type ComposerBlock,
	type ComposerInlineNode,
	type ComposerListItem,
	type ComposerMarkdownDocument,
} from "./ComposerRichMarkdown";
import { applyListFormatToText, getHashInsertionText, getListBoundaryBackspacePatch, getListEnterPatch, getParagraphEnterPatch, type ListFormatType } from "../utils/composerInput";

export interface ComposerRichEditorOptions {
	onChange: (markdown: string, selection: ComposerRichEditorSelection, event?: InputEvent) => void;
	onSelectionChange?: (markdown: string, selection: ComposerRichEditorSelection) => void;
	onBeforeInput?: (event: InputEvent) => boolean;
	onCompositionStart?: () => void;
	onCompositionEnd?: (event: CompositionEvent, markdown: string, selection: ComposerRichEditorSelection) => void;
	onShortcut?: (event: KeyboardEvent) => boolean;
	resolveImageUrl?: (source: string) => string | null;
	ariaLabelledBy?: string;
}

export interface ComposerRichEditorSelection {
	start: number;
	end: number;
}

export class ComposerRichEditor {
	readonly el: HTMLDivElement;
	private document: ComposerMarkdownDocument;
	private isRendering = false;
	private savedSelection: { start: number; end: number } | null = null;

	constructor(container: HTMLElement, initialMarkdown: string, private readonly options: ComposerRichEditorOptions) {
		this.document = parseComposerMarkdown(initialMarkdown);
		this.el = container.createDiv({
			cls: "plain-memo-rich-editor",
			attr: {
				contenteditable: "true",
				role: "textbox",
				"aria-multiline": "true",
				"aria-labelledby": this.options.ariaLabelledBy ?? "",
			},
		});
		if (this.options.ariaLabelledBy === undefined) {
			this.el.removeAttribute("aria-labelledby");
		}
		this.el.addEventListener("input", (event) => this.handleInput(event as InputEvent));
		this.el.addEventListener("mouseup", () => this.notifySelectionChange());
		this.el.addEventListener("keyup", () => this.notifySelectionChange());
		this.el.addEventListener("focus", () => this.notifySelectionChange());
		this.el.addEventListener("compositionstart", () => this.options.onCompositionStart?.());
		this.el.addEventListener("compositionend", (event) => {
			if (!this.isRendering) {
				this.document = serializeEditorDom(this.el, this.document);
				this.rememberSelection();
			}
			this.options.onCompositionEnd?.(event as CompositionEvent, this.getMarkdown(), this.getSelection());
		});
		this.el.addEventListener("beforeinput", (event) => {
			const inputEvent = event as InputEvent;
			if (this.options.onBeforeInput?.(inputEvent) === true || this.handleBeforeInput(inputEvent)) {
				event.preventDefault();
			}
		});
		this.el.addEventListener("keydown", (event) => {
			if (this.handleKeydown(event)) {
				return;
			}
			if (this.options.onShortcut?.(event) === true) {
				event.preventDefault();
				event.stopPropagation();
			}
		});
		this.render();
	}

	setMarkdown(markdown: string): void {
		this.document = parseComposerMarkdown(markdown);
		this.render();
	}

	getMarkdown(): string {
		return serializeComposerMarkdown(this.document);
	}

	applyListFormat(type: ListFormatType): void {
		const source = this.getMarkdown();
		const selection = this.getSelection();
		const replacement = applyListFormatToText(source, selection.start, selection.end, type);
		this.setMarkdown(replacement.value);
		this.restoreSelection(replacement.cursor, replacement.cursor);
		this.notifyChange(replacement.value);
	}

	insertText(text: string): void {
		const source = this.getMarkdown();
		const selection = this.getSelection();
		const insertedText = text === "#" ? getHashInsertionText(source, selection.start) : text;
		const value = `${source.slice(0, selection.start)}${insertedText}${source.slice(selection.end)}`;
		this.setMarkdown(value);
		this.restoreSelection(selection.start + insertedText.length, selection.start + insertedText.length);
		this.notifyChange(value);
	}

	insertWikiLinkShell(): void {
		const source = this.getMarkdown();
		const selection = this.getSelection();
		const selected = source.slice(selection.start, selection.end);
		const replacement = `[[${selected}]]`;
		const value = `${source.slice(0, selection.start)}${replacement}${source.slice(selection.end)}`;
		this.setMarkdown(value);
		const cursor = selection.start + 2 + selected.length;
		this.restoreSelection(cursor, cursor);
		this.notifyChange(value);
	}

	focus(options?: FocusOptions): void {
		this.el.focus(options);
	}

	/** Applies externally generated Markdown, such as an input suggestion, without losing the caret. */
	setMarkdownAndRestoreSelection(markdown: string, start: number, end = start): void {
		this.setMarkdown(markdown);
		this.restoreSelection(start, end);
		this.notifyChange(markdown);
	}

	getCaretRectAt(offset: number): DOMRect | null {
		const point = findTextPoint(this.el, offset);
		if (point === null) return null;
		const range = this.el.ownerDocument.createRange();
		range.setStart(point.node, point.offset);
		range.collapse(true);
		const rect = range.getBoundingClientRect();
		if (rect.width > 0 || rect.height > 0) return rect;
		return range.getClientRects().item(0) ?? null;
	}

	private handleInput(event: InputEvent): void {
		if (this.isRendering) {
			return;
		}
		this.document = serializeEditorDom(this.el, this.document);
		this.rememberSelection();
		this.notifyChange(serializeComposerMarkdown(this.document), event);
	}

	private handleBeforeInput(event: InputEvent): boolean {
		if (event.isComposing) return false;
		if (event.inputType === "deleteContentBackward") {
			return this.handleListBoundaryBackspace();
		}
		const isInsertedNewline = event.inputType === "insertText" && event.data === "\n";
		if (event.inputType !== "insertParagraph" && event.inputType !== "insertLineBreak" && !isInsertedNewline) {
			return false;
		}
		return this.handleEnter();
	}

	handleKeydown(event: KeyboardEvent): boolean {
		if (event.key === "Backspace" && this.handleListBoundaryBackspace()) {
			event.preventDefault();
			return true;
		}
		if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
			return false;
		}
		event.preventDefault();
		return this.handleEnter();
	}

	/** Creates a Markdown paragraph for ordinary Enter and continues a list when applicable. */
	private handleEnter(): boolean {
		const source = this.getMarkdown();
		const selection = this.getSelection();
		const patch = getListEnterPatch(source, selection.start, selection.end)
			?? getParagraphEnterPatch(source, selection.start, selection.end);
		this.setMarkdown(patch.value);
		this.restoreSelection(patch.cursor, patch.cursor);
		this.notifyChange(patch.value);
		return true;
	}

	private handleListBoundaryBackspace(): boolean {
		const selection = this.getSelection();
		if (selection.start !== selection.end) return false;
		const source = this.getMarkdown();
		const patch = getListBoundaryBackspacePatch(source, selection.start);
		if (patch === null) return false;
		const value = patch.value;
		this.setMarkdown(value);
		this.restoreSelection(patch.cursor, patch.cursor);
		this.notifyChange(value);
		return true;
	}

	private getSelection(): { start: number; end: number } {
		const live = getEditorSelection(this.el);
		const selection = this.el.contains(this.el.ownerDocument.activeElement) ? live : this.savedSelection ?? live;
		this.savedSelection = selection;
		return selection;
	}

	private notifyChange(markdown: string, event?: InputEvent): void {
		this.options.onChange(markdown, this.getSelection(), event);
	}

	private notifySelectionChange(): void {
		this.options.onSelectionChange?.(this.getMarkdown(), this.getSelection());
	}

	/** Saves the current caret before a toolbar button can move focus away from the editor. */
	rememberSelectionBeforeToolbarAction(): void {
		const selection = getEditorSelection(this.el);
		const liveSelection = this.el.ownerDocument.getSelection();
		if (liveSelection !== null && this.el.contains(liveSelection.anchorNode)) {
			this.savedSelection = selection;
		}
	}

	private rememberSelection(): void {
		this.rememberSelectionBeforeToolbarAction();
	}

	private render(): void {
		this.isRendering = true;
		try {
			this.el.empty();
			for (const block of this.document.blocks) {
				renderBlock(this.el, block, this.options.resolveImageUrl);
			}
			if (this.document.trailingNewline) {
				renderTrailingNewline(this.el);
			}
		} finally {
			this.isRendering = false;
		}
	}

	private restoreSelection(start: number, end: number): void {
		const selection = this.el.ownerDocument.getSelection();
		if (selection === null) return;
		const startPoint = findTextPoint(this.el, start);
		const endPoint = findTextPoint(this.el, end);
		if (startPoint === null || endPoint === null) return;
		const range = this.el.ownerDocument.createRange();
		range.setStart(startPoint.node, startPoint.offset);
		range.setEnd(endPoint.node, endPoint.offset);
		selection.removeAllRanges();
		selection.addRange(range);
		this.savedSelection = { start, end };
		this.focus({ preventScroll: true });
	}
}

/** Keeps an editable final line in the current paragraph instead of creating a second paragraph. */
function renderTrailingNewline(container: HTMLElement): void {
	const last = container.lastElementChild;
	if (last?.matches("p") && (last.textContent ?? "").length > 0) {
		last.createEl("br");
		last.appendChild(last.ownerDocument.createTextNode(""));
		// Chromium needs a second terminal break to paint the empty final line.
		last.createEl("br", { attr: { "data-terminal-line-placeholder": "true" } });
		return;
	}
	const paragraph = container.createEl("p", { cls: "plain-memo-rich-editor-paragraph" });
	paragraph.createEl("br");
	paragraph.appendChild(paragraph.ownerDocument.createTextNode(""));
}

function renderBlock(container: HTMLElement, block: ComposerBlock, resolveImageUrl?: (source: string) => string | null): void {
	if (block.type === "raw") {
		const raw = container.createDiv({ cls: "plain-memo-rich-editor-raw" });
		raw.setText(block.value);
		return;
	}
	if (block.type === "paragraph") {
		const paragraph = container.createEl("p", { cls: "plain-memo-rich-editor-paragraph" });
		if (serializeComposerInline(block.inlines).length === 0) {
			paragraph.createEl("br");
			paragraph.appendChild(paragraph.ownerDocument.createTextNode(""));
		} else {
			renderInline(paragraph, block.inlines, resolveImageUrl);
		}
		return;
	}
	if (block.ordered) {
		renderListItems(container, true, block.items, block.items.every((item) => item.checked !== null), resolveImageUrl);
		return;
	}
	let groupStart = 0;
	while (groupStart < block.items.length) {
		const taskList = block.items[groupStart]?.checked !== null;
		let groupEnd = groupStart + 1;
		while (groupEnd < block.items.length && (block.items[groupEnd]?.checked !== null) === taskList) {
			groupEnd += 1;
		}
		renderListItems(container, block.ordered, block.items.slice(groupStart, groupEnd), taskList, resolveImageUrl);
		groupStart = groupEnd;
	}
}

function renderListItems(
	container: HTMLElement,
	ordered: boolean,
	items: readonly ComposerListItem[],
	taskList: boolean,
	resolveImageUrl?: (source: string) => string | null,
): void {
	const list = container.createEl(ordered ? "ol" : "ul", {
		// Ordered task lists must keep their number marker alongside the checkbox.
		cls: `plain-memo-rich-editor-list${taskList && !ordered ? " plain-memo-rich-editor-task-list" : ""}`,
	});
	for (const item of items) {
		const listItem = list.createEl("li", {
			cls: "plain-memo-rich-editor-list-item",
			attr: { "data-list-indent": item.indent },
		});
		if (item.checked !== null) {
			const checkbox = listItem.createEl("input", {
				attr: { type: "checkbox", "data-task-marker": item.checked },
			});
			checkbox.checked = item.checked !== " " && item.checked !== "-";
			checkbox.addEventListener("change", () => {
				checkbox.setAttr("data-task-marker", checkbox.checked ? "x" : " ");
				thisDocumentInput(container);
			});
		}
		renderInline(listItem, item.inlines, resolveImageUrl);
	}
}

function thisDocumentInput(element: HTMLElement): void {
	element.closest<HTMLElement>(".plain-memo-rich-editor")?.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderInline(container: HTMLElement, nodes: readonly ComposerInlineNode[], resolveImageUrl?: (source: string) => string | null): void {
	for (const node of nodes) {
		if (node.type === "text" || node.type === "raw") {
			const parts = node.value.split("\n");
			for (const [index, part] of parts.entries()) {
				if (index > 0) container.createEl("br");
				container.appendChild(container.ownerDocument.createTextNode(part));
			}
			continue;
		}
		if (node.type === "tag") {
			const tag = container.createSpan({ cls: "plain-memo-rich-editor-tag", text: node.source });
			tag.setAttr("data-source", node.source);
			tag.contentEditable = "false";
			// Keep an editable caret landing point after non-editable inline tags.
			container.appendChild(container.ownerDocument.createTextNode(""));
			continue;
		}
		const image = container.createEl("span", { cls: "plain-memo-rich-editor-image" });
		image.setAttr("data-source", node.source);
		image.contentEditable = "false";
		const url = resolveImageUrl?.(node.source) ?? null;
		if (url !== null) {
			image.createEl("img", { attr: { src: url, alt: node.value, loading: "lazy" } });
		} else {
			image.setText(node.source);
		}
		// Images are also non-editable inline nodes and need the same caret landing point.
		container.appendChild(container.ownerDocument.createTextNode(""));
	}
}

function serializeEditorDom(root: HTMLElement, previous: ComposerMarkdownDocument): ComposerMarkdownDocument {
	const blocks: ComposerBlock[] = [];
	const children = Array.from(root.children);
	for (const child of children) {
		if (child.matches("ol, ul")) {
			const ordered = child.tagName.toLowerCase() === "ol";
			const items: ComposerListItem[] = [];
			for (const listItem of Array.from(child.children)) {
				const checkbox = listItem.querySelector<HTMLInputElement>("input[data-task-marker]");
				const marker = checkbox?.getAttr("data-task-marker") as ComposerListItem["checked"] ?? null;
				items.push({
					indent: listItem.getAttr("data-list-indent") ?? "",
					checked: marker,
					inlines: serializeInlineDom(listItem, checkbox),
				});
			}
			blocks.push({ type: "list", ordered, items });
			continue;
		}
		if (child.hasClass("plain-memo-rich-editor-raw")) {
			blocks.push({ type: "raw", value: child.textContent ?? "" });
			continue;
		}
		blocks.push({ type: "paragraph", inlines: serializeInlineDom(child) });
	}
	const lastBlock = blocks[blocks.length - 1];
	const retainsUntypedTrailingLine = previous.trailingNewline
		&& lastBlock?.type === "paragraph"
		&& serializeComposerInline(lastBlock.inlines).length === 0;
	return { blocks, trailingNewline: retainsUntypedTrailingLine };
}

function serializeInlineDom(container: Element, ignored: Element | null = null): ComposerInlineNode[] {
	const nodes: ComposerInlineNode[] = [];
	const children = Array.from(container.childNodes).filter((child) => child !== ignored);
	const hasMeaningfulContent = children.some((child) => {
		if (child instanceof HTMLElement) {
			if (child.tagName.toLowerCase() === "br") return false;
			return child.getAttr("data-source") !== null || (child.textContent ?? "").length > 0;
		}
		return (child.textContent ?? "").length > 0;
	});
	if (!hasMeaningfulContent) {
		return [{ type: "text", value: "" }];
	}
	for (const child of children) {
		if (child instanceof HTMLElement && child.getAttr("data-terminal-line-placeholder") !== null) {
			continue;
		}
		if (child.nodeType === Node.TEXT_NODE) {
			nodes.push(...parseComposerInline(child.textContent ?? ""));
			continue;
		}
		if (!(child instanceof HTMLElement)) continue;
		if (child.tagName.toLowerCase() === "br") {
			nodes.push({ type: "text", value: "\n" });
			continue;
		}
		const source = child.getAttr("data-source");
		if (source !== null) {
			nodes.push(child.hasClass("plain-memo-rich-editor-tag")
				? { type: "tag", value: source.slice(1), source }
				: { type: "image", value: source, source });
			continue;
		}
		nodes.push(...parseComposerInline(child.textContent ?? ""));
	}
	return nodes.length > 0 ? nodes : [{ type: "text", value: "" }];
}

function getEditorSelection(root: HTMLElement): { start: number; end: number } {
	const selection = root.ownerDocument.getSelection();
	if (selection === null || selection.rangeCount === 0) {
		const length = serializeComposerMarkdownFromDom(root).length;
		return { start: length, end: length };
	}
	const range = selection.getRangeAt(0);
	return {
		start: getMarkdownPointOffset(root, range.startContainer, range.startOffset),
		end: getMarkdownPointOffset(root, range.endContainer, range.endOffset),
	};
}

function findTextPoint(root: HTMLElement, target: number): { node: Text; offset: number } | null {
	let offset = 0;
	for (const [index, block] of Array.from(root.children).entries()) {
		const blockLength = getDomBlockMarkdownLength(block);
		if (target <= offset + blockLength) {
			if (block.matches("ol, ul")) {
				let itemOffset = offset;
				for (const item of Array.from(block.children)) {
					const markerLength = getListMarkerLength(item);
					const contentLength = getElementTextLength(item);
					if (target <= itemOffset + markerLength + contentLength) {
						return findTextPointInElement(item, Math.max(0, target - itemOffset - markerLength));
					}
					itemOffset += markerLength + contentLength + 1;
				}
			} else {
				const localTarget = Math.max(0, target - offset);
				return findTextPointInElement(block, localTarget);
			}
		}
		offset += blockLength;
		if (index < root.children.length - 1) offset += getDomBlockSeparatorLength(root, index);
	}
	return findTextPointInElement(root, Number.POSITIVE_INFINITY);
}

function getMarkdownPointOffset(root: HTMLElement, container: Node, offset: number): number {
	let markdownOffset = 0;
	for (const [index, block] of Array.from(root.children).entries()) {
		if (block.contains(container) || block === container) {
		if (block.matches("ol, ul")) {
			if (container === block) {
				const items = Array.from(block.children);
				const boundaryIndex = Math.max(0, Math.min(offset, items.length));
				if (boundaryIndex < items.length) {
					const item = items[boundaryIndex];
					return markdownOffset + getListMarkerLength(item);
				}
				return markdownOffset + getDomBlockMarkdownLength(block);
			}
			for (const item of Array.from(block.children)) {
					const markerLength = getListMarkerLength(item);
					if (item.contains(container) || item === container) {
						return markdownOffset + markerLength + getNodeTextOffset(item, container, offset);
					}
					markdownOffset += markerLength + getElementTextLength(item) + 1;
				}
			} else {
				return markdownOffset + getNodeTextOffset(block, container, offset);
			}
		}
		markdownOffset += getDomBlockMarkdownLength(block);
		if (index < root.children.length - 1) markdownOffset += getDomBlockSeparatorLength(root, index);
	}
	return markdownOffset;
}

function getNodeTextOffset(root: Element, container: Node, offset: number): number {
	const range = root.ownerDocument.createRange();
	range.selectNodeContents(root);
	range.setEnd(container, offset);
	return getMarkdownNodeLength(range.cloneContents());
}

function getElementTextLength(element: Element): number {
	return getMarkdownNodeLength(element);
}

function getMarkdownNodeLength(node: Node): number {
	if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
	if (node instanceof Element) {
		if (node.getAttr("data-terminal-line-placeholder") !== null) return 0;
		if (node.tagName.toLowerCase() === "br") return 1;
		const source = node.getAttr("data-source");
		if (source !== null) return source.length;
	}
	return Array.from(node.childNodes).reduce((total, child) => total + getMarkdownNodeLength(child), 0);
}

function getListMarkerLength(item: Element): number {
	const indentLength = item.getAttr("data-list-indent")?.length ?? 0;
	const checkbox = item.querySelector<HTMLInputElement>("input[data-task-marker]");
	const list = item.parentElement;
	const index = list === null ? 0 : Array.from(list.children).indexOf(item);
	if (checkbox !== null) {
		return indentLength + (list?.tagName.toLowerCase() === "ol" ? `${index + 1}. [ ] `.length : 6);
	}
	return indentLength + (list?.tagName.toLowerCase() === "ol" ? `${index + 1}. `.length : 2);
}

function getDomBlockMarkdownLength(block: Element): number {
	if (!block.matches("ol, ul")) return getElementTextLength(block);
	return Array.from(block.children).reduce((total, item) => total + getListMarkerLength(item) + getElementTextLength(item), 0)
		+ Math.max(0, block.children.length - 1);
}

function getDomBlockSeparatorLength(root: HTMLElement, index: number): number {
	const current = root.children[index];
	const next = root.children[index + 1];
	if (current?.matches("p") && next?.matches("p")
		&& (current.textContent?.length ?? 0) > 0
		&& (next.textContent?.length ?? 0) > 0) {
		return 2;
	}
	return 1;
}

function findTextPointInElement(root: Element, target: number): { node: Text; offset: number } | null {
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let node = walker.nextNode();
	let last: Text | null = null;
	while (node !== null) {
		const textNode = node as Text;
		last = textNode;
		const range = root.ownerDocument.createRange();
		range.selectNodeContents(root);
		range.setEndBefore(textNode);
		const start = getMarkdownNodeLength(range.cloneContents());
		const textLength = textNode.textContent?.length ?? 0;
		if (!Number.isFinite(target) || target <= start + textLength) {
			return { node: textNode, offset: Math.max(0, Math.min(textLength, target - start)) };
		}
		node = walker.nextNode();
	}
	return last === null ? null : { node: last, offset: last.textContent?.length ?? 0 };
}

function serializeComposerMarkdownFromDom(root: HTMLElement): string {
	return serializeComposerMarkdown(serializeEditorDom(root, { blocks: [], trailingNewline: false }));
}

function serializeDomText(fragment: DocumentFragment): string {
	const wrapper = fragment.ownerDocument.createElement("div");
	wrapper.appendChild(fragment);
	return wrapper.textContent ?? "";
}
