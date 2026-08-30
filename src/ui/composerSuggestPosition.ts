export interface SuggestContentWidthOptions {
	includeScrollbarWidth?: boolean;
	extraWidth?: number;
}

interface ComposerTextSurface extends HTMLElement {
	value: string;
}

export function getTextareaCharacterRect(inputEl: ComposerTextSurface, index: number): DOMRect | null {
	const doc = inputEl.ownerDocument;
	const win = doc.defaultView;
	if (win === null) {
		return null;
	}
	const inputRect = inputEl.getBoundingClientRect();
	const computed = win.getComputedStyle(inputEl);
	const mirror = doc.body.createDiv({ cls: "plain-memo-textarea-mirror" });
	mirror.setCssProps({
		"--plain-memo-textarea-mirror-word-break": computed.wordBreak,
		"--plain-memo-textarea-mirror-box-sizing": computed.boxSizing,
		"--plain-memo-textarea-mirror-width": `${inputRect.width}px`,
		"--plain-memo-textarea-mirror-min-height": computed.minHeight,
		"--plain-memo-textarea-mirror-padding": computed.padding,
		"--plain-memo-textarea-mirror-border": computed.border,
		"--plain-memo-textarea-mirror-font": computed.font,
		"--plain-memo-textarea-mirror-line-height": computed.lineHeight,
		"--plain-memo-textarea-mirror-letter-spacing": computed.letterSpacing,
		"--plain-memo-textarea-mirror-text-transform": computed.textTransform,
		"--plain-memo-textarea-mirror-left": `${inputRect.left - inputEl.scrollLeft}px`,
		"--plain-memo-textarea-mirror-top": `${inputRect.top - inputEl.scrollTop}px`,
	});
	mirror.setText(inputEl.value.slice(0, index));
	const marker = mirror.createSpan({ text: inputEl.value.charAt(index) || "\u200b" });
	const rect = marker.getBoundingClientRect();
	mirror.detach();
	return rect;
}

export function measureSuggestionContentHeight(inputEl: ComposerTextSurface, container: HTMLElement, itemSelector: string): number {
	const win = inputEl.ownerDocument.defaultView;
	if (win === null) {
		return Math.ceil(container.scrollHeight || container.getBoundingClientRect().height);
	}
	const computed = win.getComputedStyle(container);
	const verticalInset =
		parseCssPixels(computed.paddingTop) +
		parseCssPixels(computed.paddingBottom) +
		parseCssPixels(computed.borderTopWidth) +
		parseCssPixels(computed.borderBottomWidth);
	const items = Array.from(container.querySelectorAll<HTMLElement>(itemSelector));
	if (items.length === 0) {
		return Math.ceil(container.scrollHeight || container.getBoundingClientRect().height);
	}
	const itemHeight = items.reduce((height, item) => height + item.getBoundingClientRect().height, 0);
	return Math.ceil(Math.max(container.scrollHeight, itemHeight + verticalInset));
}

export function measureSuggestionContentWidth(
	inputEl: ComposerTextSurface,
	container: HTMLElement,
	itemSelector: string,
	options: SuggestContentWidthOptions = {},
): number {
	const doc = inputEl.ownerDocument;
	const items = Array.from(container.querySelectorAll<HTMLElement>(itemSelector));
	if (items.length === 0) {
		return Math.ceil(container.scrollWidth || container.getBoundingClientRect().width);
	}
	const host = asHTMLElement(container.cloneNode(false), doc);
	if (host === null) {
		return Math.ceil(container.scrollWidth || container.getBoundingClientRect().width);
	}
	host.addClass("plain-memo-suggest-measure-host");
	doc.body.appendChild(host);
	let width = 0;
	for (const item of items) {
		const clone = asHTMLElement(item.cloneNode(true), doc);
		if (clone === null) {
			continue;
		}
		clone.addClass("plain-memo-suggest-measure-item");
		host.appendChild(clone);
		width = Math.max(width, clone.getBoundingClientRect().width);
	}
	host.detach();
	const win = doc.defaultView;
	if (win === null) {
		return Math.ceil(width);
	}
	const computed = win.getComputedStyle(container);
	const horizontalInset =
		parseCssPixels(computed.paddingLeft) +
		parseCssPixels(computed.paddingRight) +
		parseCssPixels(computed.borderLeftWidth) +
		parseCssPixels(computed.borderRightWidth);
	const scrollbarWidth = options.includeScrollbarWidth === true ? measureScrollbarWidth(doc) : 0;
	return Math.ceil(width + horizontalInset + scrollbarWidth + (options.extraWidth ?? 2));
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function asHTMLElement(value: Node, doc: Document): HTMLElement | null {
	const win = doc.defaultView;
	if (win !== null && value.instanceOf(win.HTMLElement)) {
		return value;
	}
	return null;
}

function parseCssPixels(value: string): number {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function measureScrollbarWidth(doc: Document): number {
	const outer = doc.body.createDiv({ cls: "plain-memo-scrollbar-measure-outer" });
	outer.createDiv({ cls: "plain-memo-scrollbar-measure-inner" });
	const scrollbarWidth = outer.offsetWidth - outer.clientWidth;
	outer.detach();
	return Math.max(0, scrollbarWidth);
}
