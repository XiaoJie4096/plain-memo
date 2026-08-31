import type { ComposerMarkdownDocument } from "./ComposerRichMarkdown";

export interface ComposerEditorSelection {
	start: number;
	end: number;
}

export function shouldRefreshInlinePresentation(
	event: InputEvent,
	document: ComposerMarkdownDocument,
	markdown: string,
	selectionStart = markdown.length,
): boolean {
	if (event.isComposing || event.inputType !== "insertText" || event.data === "\n" || !/\s/.test(event.data ?? "")) {
		return false;
	}
	if (document.blocks.some((block) => block.type === "paragraph" && block.inlines.some((node) => node.type === "tag"))) {
		return true;
	}
	const lineStart = markdown.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
	const linePrefix = markdown.slice(lineStart, selectionStart);
	return /^\s*(?:(?:[-*+]|\d+[.)。])\s+|(?:\[[ xX-]\]|\[\]|【】)\s+)$/.test(linePrefix);
}

/** Maps a selection through a Markdown presentation rewrite such as `【】 ` -> `- [ ] `. */
export function remapSelectionAfterNormalization(
	source: string,
	target: string,
	selection: ComposerEditorSelection,
): ComposerEditorSelection {
	if (source === target) return selection;
	let prefixLength = 0;
	while (prefixLength < source.length
		&& prefixLength < target.length
		&& source.charAt(prefixLength) === target.charAt(prefixLength)) {
		prefixLength += 1;
	}
	let suffixLength = 0;
	while (suffixLength < source.length - prefixLength
		&& suffixLength < target.length - prefixLength
		&& source.charAt(source.length - suffixLength - 1) === target.charAt(target.length - suffixLength - 1)) {
		suffixLength += 1;
	}
	const mapOffset = (offset: number): number => {
		if (offset <= prefixLength) return offset;
		if (offset >= source.length - suffixLength) {
			return target.length - (source.length - offset);
		}
		return target.length - suffixLength;
	};
	return {
		start: mapOffset(selection.start),
		end: mapOffset(selection.end),
	};
}
