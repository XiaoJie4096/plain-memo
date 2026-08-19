import { AbstractInputSuggest, getAllTags, prepareFuzzySearch, renderResults } from "obsidian";
import type { App, SearchResult } from "obsidian";

import { getTagQueryAtCursor, isExactTagSuggestion, replaceTagQueryWithSuggestion } from "../utils/composerInput";
import {
	clamp,
	getTextareaCharacterRect,
	measureSuggestionContentHeight,
	measureSuggestionContentWidth,
} from "./composerSuggestPosition";
import { TagSuggestActivationState } from "./TagSuggestActivationState";

interface TagSuggestion {
	tag: string;
	result: SearchResult | null;
}

export interface KnomoTagSuggestOptions {
	onSuggestionSelected?: (replacement: { value: string; cursor: number }) => void;
	onSuggestionSettled?: (replacement: { value: string; cursor: number }) => void;
	getAnchorRect?: (offset: number) => DOMRect | null;
	/** The visible contenteditable host required by Obsidian's suggestion API. */
	suggestHostEl?: HTMLDivElement;
}

export class KnomoTagSuggest extends AbstractInputSuggest<TagSuggestion> {
	private tagsSnapshot: string[] | null = null;
	private popoverRepositionFrameId: number | null = null;
	private compositionRefreshFrameId: number | null = null;
	private emptyPopoverRetryCount = 0;
	private visibleSuggestions: TagSuggestion[] = [];
	private selectedSuggestionIndex = 0;
	private suppressActivationUntilInput = false;
	private acceptedCloseFrameId: number | null = null;
	private readonly activationState = new TagSuggestActivationState();

	constructor(
		app: App,
		private readonly inputEl: HTMLTextAreaElement,
		private readonly onInputChanged: () => void,
		private readonly options: KnomoTagSuggestOptions = {},
	) {
		super(app, options.suggestHostEl ?? inputEl as unknown as HTMLInputElement);
		this.limit = 0;
		this.inputEl.addEventListener("beforeinput", (event) => {
			if (event.isTrusted) {
				this.suppressActivationUntilInput = false;
			}
			this.activationState.handleBeforeInput({
				value: this.inputEl.value,
				selectionStart: this.inputEl.selectionStart,
				selectionEnd: this.inputEl.selectionEnd,
				inputType: event.inputType,
				data: event.data,
			});
			if (!this.activationState.isEnabled()) this.close();
		}, { capture: true });
		this.inputEl.addEventListener("focus", () => this.reset(), { capture: true });
		this.inputEl.addEventListener("click", () => this.reset(), { capture: true });
		this.inputEl.addEventListener("input", (event) => {
			if (event.isTrusted) {
				this.suppressActivationUntilInput = false;
			}
			this.refreshAfterInput();
		});
	}

	open(): void {
		this.emptyPopoverRetryCount = 0;
		super.open();
		this.hidePopoverUntilPositioned();
		this.queuePopoverReposition();
	}

	close(): void {
		this.clearPopoverReposition();
		this.clearCompositionRefresh();
		const container = this.getSuggestionContainer();
		this.showPositionedPopover(container);
		super.close();
		// AbstractInputSuggest can leave a detached suggestion container behind
		// when its host is a contenteditable element rather than a native input.
		// Remove that stale layer so it cannot keep focus or consume the next key.
		if (container?.hasClass("plain-memo-tag-suggest-popover") === true) {
			container.remove();
		}
		this.tagsSnapshot = null;
		this.emptyPopoverRetryCount = 0;
		this.visibleSuggestions = [];
		this.selectedSuggestionIndex = 0;
	}

	reset(): void {
		this.activationState.reset();
		this.close();
	}

	/**
	 * Shows candidates for a manually inserted trigger. Native rich-editor input
	 * already reaches AbstractInputSuggest's listener, so it must not be refreshed twice.
	 */
	openForCurrentTrigger(refreshSuggestions = true): void {
		if (this.suppressActivationUntilInput) {
			this.close();
			return;
		}
		this.activationState.enableExplicitly();
		if (refreshSuggestions) {
			this.refreshNativeSuggestions();
		}
		this.queuePopoverReposition();
		const container = this.getSuggestionContainer();
		if (container !== null) {
			container.addClass("plain-memo-tag-suggest-popover");
		}
	}

	/** Keeps selection synchronization after acceptance from reopening the same query. */
	markSuggestionAccepted(replacement?: { value: string; cursor: number }): void {
		if (this.acceptedCloseFrameId !== null) {
			this.inputEl.ownerDocument.defaultView?.cancelAnimationFrame(this.acceptedCloseFrameId);
			this.acceptedCloseFrameId = null;
		}
		this.suppressActivationUntilInput = true;
		this.reset();
		const win = this.inputEl.ownerDocument.defaultView;
		if (win !== null) {
			this.acceptedCloseFrameId = win.requestAnimationFrame(() => {
				this.acceptedCloseFrameId = null;
				this.close();
				if (replacement !== undefined && this.options.onSuggestionSettled !== undefined) {
					this.options.onSuggestionSettled(replacement);
				} else {
					this.options.suggestHostEl?.focus({ preventScroll: true });
				}
			});
		}
	}

	/** Allows the next real rich-editor input to activate suggestions again. */
	clearAcceptedSuggestionSuppression(): void {
		this.suppressActivationUntilInput = false;
	}

	/** Handles navigation when the visible input is the rich editor rather than the hidden textarea. */
	handleExternalKeydown(event: KeyboardEvent): boolean {
		if (!this.activationState.isEnabled() || getTagQueryAtCursor(this.inputEl.value, this.inputEl.selectionStart) === null) {
			// Obsidian keeps detached suggestion items alive. They must not consume
			// Enter once the caret has already left the active tag query.
			this.close();
			return false;
		}
		if (this.consumeExactTagEnter(event)) {
			return false;
		}
		const container = this.getSuggestionContainer();
		const items = container === null
			? []
			: Array.from(container.querySelectorAll<HTMLElement>(".suggestion-item"));
		if (container === null || !container.isConnected) {
			return false;
		}
		if (event.key === "Escape") {
			this.close();
			return true;
		}
		if (items.length === 0) {
			return false;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			const direction = event.key === "ArrowDown" ? 1 : -1;
			const nextIndex = (this.selectedSuggestionIndex + direction + items.length) % items.length;
			this.selectedSuggestionIndex = nextIndex;
			for (const [index, item] of items.entries()) {
				item.toggleClass("is-selected", index === nextIndex);
				item.setAttr("aria-selected", index === nextIndex ? "true" : "false");
			}
			return true;
		}
		if (event.key === "Enter" || event.key === "Tab") {
			const selected = this.visibleSuggestions[this.selectedSuggestionIndex] ?? this.visibleSuggestions[0];
			if (selected === undefined) {
				return false;
			}
			this.selectSuggestion(selected, event);
			return true;
		}
		return false;
	}

	/** Stops Obsidian from accepting an already complete tag when Enter should create a new line. */
	consumeExactTagEnter(event: KeyboardEvent): boolean {
		if (event.key !== "Enter" || event.shiftKey || event.isComposing || !this.activationState.isEnabled()) {
			return false;
		}
		const range = getTagQueryAtCursor(this.inputEl.value, this.inputEl.selectionStart);
		const selected = this.visibleSuggestions[this.selectedSuggestionIndex] ?? this.visibleSuggestions[0];
		if (range === null || selected === undefined || !isExactTagSuggestion(range.query, selected.tag)) {
			return false;
		}
		this.reset();
		return true;
	}

	/** Refreshes after an IME commits its final text, which may not emit a later normal input event. */
	handleCompositionEnd(): void {
		if (getTagQueryAtCursor(this.inputEl.value, this.inputEl.selectionStart) === null) {
			this.close();
			return;
		}
		this.activationState.enableExplicitly();
		this.clearCompositionRefresh();
		const win = this.inputEl.ownerDocument.defaultView;
		if (win === null) {
			this.refreshAfterInput();
			return;
		}
		this.compositionRefreshFrameId = win.requestAnimationFrame(() => {
			this.compositionRefreshFrameId = null;
			this.refreshAfterInput();
		});
	}

	/** Refreshes candidates after the hidden Markdown mirror has settled. */
	private refreshAfterInput(): void {
		if (!this.activationState.isEnabled() || getTagQueryAtCursor(this.inputEl.value, this.inputEl.selectionStart) === null) {
			this.close();
			return;
		}
		this.refreshNativeSuggestions();
	}

	/**
	 * Obsidian only gathers candidates from AbstractInputSuggest.onInputChange().
	 * Calling open() directly merely shows its empty container.
	 */
	private refreshNativeSuggestions(): void {
		const internal = this as unknown as { onInputChange?: () => void };
		internal.onInputChange?.();
	}

	protected getSuggestions(_query: string): TagSuggestion[] {
		if (!this.activationState.isEnabled()) {
			return [];
		}
		const range = getTagQueryAtCursor(this.inputEl.value, this.inputEl.selectionStart);
		if (range === null) {
			return [];
		}
		const tags = this.getTagsSnapshot();
		// Once the query already names an existing tag, Enter belongs to the
		// editor as a paragraph break. Keeping the identical suggestion open lets
		// AbstractInputSuggest consume Enter before the contenteditable receives it.
		if (range.query.length > 0 && tags.some((tag) => isExactTagSuggestion(range.query, tag))) {
			this.visibleSuggestions = [];
			this.selectedSuggestionIndex = 0;
			return [];
		}
		const suggestions = range.query.length === 0
			? tags.map((tag) => ({ tag, result: null }))
			: this.getFuzzySuggestions(tags, range.query);
		this.visibleSuggestions = suggestions;
		this.selectedSuggestionIndex = 0;
		if (suggestions.length > 0) {
			this.queuePopoverReposition();
		}
		return suggestions;
	}

	renderSuggestion(value: TagSuggestion, el: HTMLElement): void {
		if (value.result === null) {
			el.setText(value.tag);
			this.queuePopoverReposition();
			return;
		}
		el.empty();
		renderResults(el, value.tag, value.result);
		this.queuePopoverReposition();
	}

	selectSuggestion(value: TagSuggestion, _evt: MouseEvent | KeyboardEvent): void {
		const range = getTagQueryAtCursor(this.inputEl.value, this.inputEl.selectionStart);
		if (range === null) {
			this.close();
			return;
		}
		const next = replaceTagQueryWithSuggestion(this.inputEl.value, range, value.tag);
		// Stop the active query before notifying the rich editor. The callback may
		// synchronously mirror the replacement and move the caret for one frame.
		this.markSuggestionAccepted(next);
		if (this.options.onSuggestionSelected !== undefined) {
			this.options.onSuggestionSelected(next);
			return;
		}
		this.inputEl.value = next.value;
		this.inputEl.setSelectionRange(next.cursor, next.cursor);
		this.onInputChanged();
	}

	private hidePopoverUntilPositioned(): void {
		const container = this.getSuggestionContainer();
		if (container === null) {
			return;
		}
		container.addClass("plain-memo-tag-suggest-popover");
		container.addClass("plain-memo-tag-suggest-positioning");
	}

	private showPositionedPopover(container = this.getSuggestionContainer()): void {
		container?.removeClass("plain-memo-tag-suggest-positioning");
	}

	private getTagsSnapshot(): string[] {
		if (this.tagsSnapshot === null) {
			this.tagsSnapshot = this.getVaultTags();
		}
		return this.tagsSnapshot;
	}

	private getFuzzySuggestions(tags: string[], query: string): TagSuggestion[] {
		const search = prepareFuzzySearch(query);
		const suggestions: TagSuggestion[] = [];
		for (const tag of tags) {
			const result = search(tag);
			if (result !== null) {
				suggestions.push({ tag, result });
			}
		}
		return suggestions;
	}

	private getVaultTags(): string[] {
		const tags = new Set<string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (cache === null) {
				continue;
			}
			for (const tag of getAllTags(cache) ?? []) {
				const normalizedTag = tag.replace(/^#/, "");
				if (normalizedTag.length > 0) {
					tags.add(normalizedTag);
				}
			}
		}
		return Array.from(tags).sort((first, second) => first.localeCompare(second));
	}

	private queuePopoverReposition(): void {
		const win = this.inputEl.ownerDocument.defaultView;
		if (win === null) {
			this.repositionPopover();
			return;
		}
		if (this.popoverRepositionFrameId !== null) {
			return;
		}
		this.popoverRepositionFrameId = win.requestAnimationFrame(() => {
			this.popoverRepositionFrameId = null;
			this.repositionPopover();
		});
	}

	private repositionPopover(): void {
		const range = getTagQueryAtCursor(this.inputEl.value, this.inputEl.selectionStart);
		if (range === null) {
			return;
		}
		const anchor = this.options.getAnchorRect?.(range.to) ?? getTextareaCharacterRect(this.inputEl, range.to);
		const container = this.getSuggestionContainer();
		if (anchor === null || container === null) {
			return;
		}
		// AbstractInputSuggest may create the container before it renders its items.
		// Retry briefly so the first measurement is based on the real candidate width.
		const suggestionItems = container.querySelectorAll(".suggestion-item");
		if (suggestionItems.length === 0 && this.emptyPopoverRetryCount < 2) {
			this.emptyPopoverRetryCount += 1;
			this.queuePopoverReposition();
			return;
		}
		if (suggestionItems.length > 0) {
			this.emptyPopoverRetryCount = 0;
		}
		const layer = this.inputEl.closest(".plain-memo-mobile-composer-layer");
		if (layer !== null) {
			const win = this.inputEl.ownerDocument.defaultView;
			const viewport = win?.visualViewport ?? null;
			const viewportTop = viewport ? Math.max(0, viewport.offsetTop) : 0;
			const topGuard = 52;
			const gap = 8;
			const maxHeightLimit = 240;
			const availableAbove = Math.max(0, anchor.top - viewportTop - topGuard - gap);
			const maxHeight = Math.min(maxHeightLimit, availableAbove);
			const contentHeight = measureSuggestionContentHeight(this.inputEl, container, ".suggestion-item");
			const measuredHeight = Math.min(maxHeight, contentHeight > 0 ? contentHeight : maxHeight);
			container.addClass("plain-memo-tag-suggest-popover");
			const top = Math.max(viewportTop + topGuard, anchor.top - measuredHeight - gap);
			const inputRect = this.inputEl.getBoundingClientRect();
			const viewportLeft = viewport ? Math.max(0, viewport.offsetLeft) : 0;
			const viewportRight = viewport
				? viewport.offsetLeft + viewport.width
				: win?.innerWidth ?? this.inputEl.ownerDocument.documentElement.clientWidth;
			const viewportMargin = 12;
			const availableWidth = Math.max(0, viewportRight - viewportLeft - viewportMargin * 2);
			const contentWidth = measureSuggestionContentWidth(this.inputEl, container, ".suggestion-item");
			const targetWidth = contentWidth > 0 ? contentWidth + 44 : inputRect.width - 24;
			const width = Math.max(0, Math.min(targetWidth, availableWidth));
			const minLeft = viewportLeft + viewportMargin;
			const maxLeft = Math.max(minLeft, viewportRight - viewportMargin - width);
			const left = clamp(anchor.left, minLeft, maxLeft);
			this.setPopoverOffsetPosition(container, left, top, width, maxHeight);
			this.showPositionedPopover(container);
			return;
		}
		container.addClass("plain-memo-tag-suggest-popover");
		const win = this.inputEl.ownerDocument.defaultView;
		const viewport = win?.visualViewport ?? null;
		const viewportLeft = viewport ? Math.max(0, viewport.offsetLeft) : 0;
		const viewportRight = viewport
			? viewport.offsetLeft + viewport.width
			: win?.innerWidth ?? this.inputEl.ownerDocument.documentElement.clientWidth;
		const viewportMargin = 12;
		const availableWidth = Math.max(0, viewportRight - viewportLeft - viewportMargin * 2);
		const inputRect = this.inputEl.getBoundingClientRect();
		const contentWidth = measureSuggestionContentWidth(this.inputEl, container, ".suggestion-item", {
			includeScrollbarWidth: true,
			extraWidth: 12,
		});
		const targetWidth = contentWidth > 0 ? contentWidth : inputRect.width;
		const width = Math.max(0, Math.min(targetWidth, 320, availableWidth));
		const minLeft = viewportLeft + viewportMargin;
		const maxLeft = Math.max(minLeft, viewportRight - viewportMargin - width);
		const left = clamp(anchor.left, minLeft, maxLeft);
		const viewportTop = viewport ? Math.max(0, viewport.offsetTop) : 0;
		const viewportBottom = viewport
			? viewport.offsetTop + viewport.height
			: win?.innerHeight ?? this.inputEl.ownerDocument.documentElement.clientHeight;
		const gap = 8;
		const availableBelow = Math.max(0, viewportBottom - anchor.bottom - viewportMargin);
		const availableAbove = Math.max(0, anchor.top - viewportTop - viewportMargin);
		const contentHeight = measureSuggestionContentHeight(this.inputEl, container, ".suggestion-item");
		const placeAbove = contentHeight > availableBelow && availableAbove > availableBelow;
		const availableHeight = placeAbove ? availableAbove : availableBelow;
		const maxHeight = Math.min(240, availableHeight);
		const height = Math.min(maxHeight, contentHeight > 0 ? contentHeight : maxHeight);
		const top = placeAbove ? anchor.top - height - gap : anchor.bottom;
		this.setPopoverOffsetPosition(container, left, top, width, maxHeight);
		this.showPositionedPopover(container);
	}

	private setPopoverOffsetPosition(container: HTMLElement, left: number, top: number, width: number, maxHeight: number): void {
		container.setCssProps({
			"--plain-memo-suggest-translate-x": "0px",
			"--plain-memo-suggest-translate-y": "0px",
		});
		const currentRect = container.getBoundingClientRect();
		container.setCssProps({
			"--plain-memo-suggest-translate-x": `${Math.round(left - currentRect.left)}px`,
			"--plain-memo-suggest-translate-y": `${Math.round(top - currentRect.top)}px`,
			"--plain-memo-suggest-width": `${Math.round(width)}px`,
			"--plain-memo-suggest-max-height": `${Math.round(maxHeight)}px`,
		});
	}

	private clearPopoverReposition(): void {
		const win = this.inputEl.ownerDocument.defaultView;
		if (win === null || this.popoverRepositionFrameId === null) {
			this.popoverRepositionFrameId = null;
			return;
		}
		win.cancelAnimationFrame(this.popoverRepositionFrameId);
		this.popoverRepositionFrameId = null;
	}

	private clearCompositionRefresh(): void {
		const win = this.inputEl.ownerDocument.defaultView;
		if (win !== null && this.compositionRefreshFrameId !== null) {
			win.cancelAnimationFrame(this.compositionRefreshFrameId);
		}
		this.compositionRefreshFrameId = null;
	}

	private getSuggestionContainer(): HTMLElement | null {
		const internal = this as unknown as { suggestEl?: unknown; popover?: unknown };
		const directContainer = this.asHTMLElement(internal.suggestEl) ?? this.getContainerElement(internal.suggestEl) ?? this.getContainerElement(internal.popover);
		if (directContainer !== null) {
			return directContainer;
		}
		const containers = Array.from(this.inputEl.ownerDocument.querySelectorAll<HTMLElement>(".suggestion-container"));
		return containers.length > 0 ? containers[containers.length - 1] : null;
	}

	private getContainerElement(value: unknown): HTMLElement | null {
		if (value === null || typeof value !== "object") {
			return null;
		}
		const candidate = value as { containerEl?: unknown; el?: unknown };
		return this.asHTMLElement(candidate.containerEl) ?? this.asHTMLElement(candidate.el);
	}

	private asHTMLElement(value: unknown): HTMLElement | null {
		const win = this.inputEl.ownerDocument.defaultView;
		if (win === null || value === null || typeof value !== "object") {
			return null;
		}
		const candidate = value as { instanceOf?: (constructor: typeof HTMLElement) => boolean };
		return typeof candidate.instanceOf === "function" && candidate.instanceOf(win.HTMLElement) ? value as HTMLElement : null;
	}
}
