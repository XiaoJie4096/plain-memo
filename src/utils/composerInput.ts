import { getMarkdownTaskEnterPatch, getMarkdownTaskEnterPatchAfterNativeNewline } from "./markdownTasks";

export interface TagQueryRange {
	from: number;
	to: number;
	query: string;
}

export interface TextReplacement {
	value: string;
	cursor: number;
}

export interface NativeListInputOptions {
	allowTextChangeWithNewline?: boolean;
	allowInsertedMarkerCorrection?: boolean;
}

export type ListFormatType = "bullet" | "ordered" | "task";

export interface TaskListShortcutEvent {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
}

export function getHashInsertionText(value: string, cursor: number): string {
	if (cursor <= 0) {
		return "#";
	}
	const previousChar = value.charAt(cursor - 1);
	return /\s/.test(previousChar) ? "#" : " #";
}

export function isTaskListShortcut(event: TaskListShortcutEvent): boolean {
	return (event.ctrlKey || event.metaKey)
		&& !event.altKey
		&& !event.shiftKey
		&& event.key.toLowerCase() === "l";
}

export function getTagQueryAtCursor(value: string, cursor: number): TagQueryRange | null {
	if (cursor < 0 || cursor > value.length) {
		return null;
	}
	let hashIndex = cursor - 1;
	while (hashIndex >= 0) {
		const char = value.charAt(hashIndex);
		if (char === "#") {
			break;
		}
		if (char === "]" || /\s/.test(char)) {
			return null;
		}
		hashIndex -= 1;
	}
	if (hashIndex < 0 || !isTagStart(value, hashIndex)) {
		return null;
	}
	return {
		from: hashIndex,
		to: cursor,
		query: value.slice(hashIndex + 1, cursor),
	};
}

export function replaceTagQueryWithSuggestion(value: string, range: TagQueryRange, tag: string): TextReplacement {
	const normalizedTag = tag.replace(/^#/, "");
	const replacement = `#${normalizedTag}`;
	const before = value.slice(0, range.from);
	const after = value.slice(range.to);
	const nextChar = after.charAt(0);
	const hasTrailingWhitespace = nextChar.length > 0 && /\s/.test(nextChar);
	if (hasTrailingWhitespace) {
		return {
			value: `${before}${replacement}${after}`,
			cursor: range.from + replacement.length + 1,
		};
	}
	return {
		value: `${before}${replacement} ${after}`,
		cursor: range.from + replacement.length + 1,
	};
}

/** Lets Enter create a new line once the typed tag already exactly matches the selected suggestion. */
export function isExactTagSuggestion(query: string, tag: string): boolean {
	return query.localeCompare(tag.replace(/^#/, ""), undefined, { sensitivity: "accent" }) === 0;
}

export function applyListFormatToText(value: string, start: number, end: number, type: ListFormatType): TextReplacement {
	const blockStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
	const nextLineBreak = value.indexOf("\n", end);
	const blockEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
	const before = value.slice(0, blockStart);
	const target = value.slice(blockStart, blockEnd);
	const after = value.slice(blockEnd);
	const lines = target.split("\n");
	const collapsedSelection = start === end;
	const currentLine = lines[0] ?? "";
	const currentContentStart = getListContentStart(currentLine);
	const currentContentOffset = Math.max(0, start - blockStart - currentContentStart);
	const formatted = lines.map((line, index) => {
		const match = line.match(/^(\s*)(?:[-*+]\s+|\d+[.)]\s+)?(.*)$/);
		const indent = match?.[1] ?? "";
		const content = match?.[2] ?? line.replace(/^\s+/, "");
		if (type === "task") {
			const taskMatch = line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX-])\]\s*(.*)$/);
			const taskIndent = taskMatch?.[1] ?? indent;
			const marker = taskMatch?.[2] ?? " ";
			const taskContent = taskMatch?.[3] ?? content;
			return `${taskIndent}- [${marker}] ${taskContent}`;
		}
		if (type === "bullet") {
			return `${indent}- ${content}`;
		}
		return `${indent}${index + 1}. ${content}`;
	});
	const formattedText = formatted.join("\n");
	const formattedCursor = collapsedSelection
		? blockStart + getFormattedListMarkerLength(formatted[0] ?? "") + currentContentOffset
		: blockStart + formattedText.length;
	return {
		value: `${before}${formattedText}${after}`,
		cursor: Math.min(blockStart + formattedText.length, formattedCursor),
	};
}

function getListContentStart(line: string): number {
	const task = line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+\[[ xX-]\]\s*/);
	if (task !== null) return task[0].length;
	const list = line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
	return list?.[0].length ?? 0;
}

function getFormattedListMarkerLength(line: string): number {
	// Measure the actual generated marker so ordered lists remain correct at 10+.
	return getListContentStart(line);
}

export function getListEnterPatch(value: string, start: number, end: number): TextReplacement | null {
	if (start !== end) {
		return null;
	}
	const task = getMarkdownTaskEnterPatch(value, start, end);
	if (task !== null) {
		return task;
	}
	const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
	const lineEnd = value.indexOf("\n", lineStart);
	const fullLineEnd = lineEnd === -1 ? value.length : lineEnd;
	const fullLine = value.slice(lineStart, fullLineEnd);
	const fullBullet = parseBulletListLine(fullLine);
	const fullOrdered = parseOrderedListLine(fullLine);
	// A caret can land inside a rendered checkbox/list marker. Recognize an
	// empty list from the complete line so Enter exits it without leaving marker
	// fragments or invisible spaces behind.
	if (fullBullet !== null && fullBullet.content.trim().length === 0
		&& start >= lineStart + fullBullet.indent.length && start <= fullLineEnd) {
		const valueAfterExit = `${value.slice(0, lineStart)}${fullBullet.indent}${preserveEmptyListRemainder(value, lineStart, fullLineEnd)}`;
		return {
			value: valueAfterExit,
			cursor: getEmptyListExitCursor(valueAfterExit, lineStart, fullBullet.indent.length),
		};
	}
	if (fullOrdered !== null && fullOrdered.content.trim().length === 0
		&& start >= lineStart + fullOrdered.indent.length && start <= fullLineEnd) {
		const valueAfterExit = `${value.slice(0, lineStart)}${fullOrdered.indent}${preserveEmptyListRemainder(value, lineStart, fullLineEnd)}`;
		return {
			value: valueAfterExit,
			cursor: getEmptyListExitCursor(valueAfterExit, lineStart, fullOrdered.indent.length),
		};
	}
	const line = value.slice(lineStart, start);
	const bullet = parseBulletListLine(line);
	const ordered = parseOrderedListLine(line);
	if (bullet === null && ordered === null) {
		return null;
	}
	if (bullet !== null) {
		const { indent, content } = bullet;
		if (content.trim().length === 0) {
			const valueAfterExit = `${value.slice(0, lineStart)}${indent}${preserveEmptyListRemainder(value, lineStart, fullLineEnd)}`;
			return {
				value: valueAfterExit,
				cursor: getEmptyListExitCursor(valueAfterExit, lineStart, indent.length),
			};
		}
		const insert = `\n${indent}- `;
		const cursor = start + insert.length;
		return {
			value: `${value.slice(0, start)}${insert}${value.slice(end)}`,
			cursor,
		};
	}
	if (ordered === null) {
		return null;
	}
	const { indent, number, content } = ordered;
	if (content.trim().length === 0) {
		const valueAfterExit = `${value.slice(0, lineStart)}${indent}${preserveEmptyListRemainder(value, lineStart, fullLineEnd)}`;
		return {
			value: valueAfterExit,
			cursor: getEmptyListExitCursor(valueAfterExit, lineStart, indent.length),
		};
	}
	const insert = `\n${indent}${number + 1}. `;
	const cursor = start + insert.length;
	return renumberFollowingOrderedList(
		`${value.slice(0, start)}${insert}${value.slice(end)}`,
		cursor,
		indent,
		number + 1,
	);
}

/** Replaces the current selection with a Markdown paragraph boundary. */
export function getParagraphEnterPatch(value: string, start: number, end: number): TextReplacement {
	const insert = "\n";
	return {
		value: `${value.slice(0, start)}${insert}${value.slice(end)}`,
		cursor: start + insert.length,
	};
}

/** Removes a list marker at the start of its content without joining the previous line. */
export function getListBoundaryBackspacePatch(value: string, cursor: number): TextReplacement | null {
	if (cursor < 0 || cursor > value.length) return null;
	const lineStart = value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
	const line = value.slice(lineStart, cursor);
	const nextLineBreak = value.indexOf("\n", cursor);
	const fullLine = value.slice(lineStart, nextLineBreak === -1 ? value.length : nextLineBreak);
	const marker = fullLine.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX-]\]\s+)?$/);
	const prefix = line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX-]\]\s+)?/);
	if (marker === null && prefix === null) return null;
	const markerLength = prefix?.[0].length ?? 0;
	// Native contenteditable can leave the caret inside the non-editable
	// checkbox marker after a bare task marker is rendered. Treat any caret
	// position within that empty marker as the list-boundary Backspace so the
	// whole task row is removed consistently.
	if (marker !== null && cursor >= lineStart + marker[1].length && cursor <= lineStart + fullLine.length) {
		const remainder = value.slice(lineStart + fullLine.length);
		const preservedRemainder = remainder;
		return {
			value: `${value.slice(0, lineStart)}${preservedRemainder}`,
			cursor: lineStart,
		};
	}
	if (cursor !== lineStart + markerLength) return null;
	const remainder = value.slice(cursor);
	const preservedRemainder = remainder;
	return {
		value: `${value.slice(0, lineStart)}${preservedRemainder}`,
		cursor: lineStart,
	};
}

export function getListEnterPatchAfterNativeNewline(value: string, start: number, end: number): TextReplacement | null {
	if (start !== end || start <= 0 || value.charAt(start - 1) !== "\n") {
		return null;
	}
	const task = getMarkdownTaskEnterPatchAfterNativeNewline(value, start, end);
	if (task !== null) {
		return task;
	}
	const newlineIndex = start - 1;
	const lineStart = value.lastIndexOf("\n", Math.max(0, newlineIndex - 1)) + 1;
	const line = value.slice(lineStart, newlineIndex);
	const bullet = parseBulletListLine(line);
	const ordered = parseOrderedListLine(line);
	if (bullet === null && ordered === null) {
		return null;
	}
	if (bullet !== null) {
		const { indent, content } = bullet;
		if (content.trim().length === 0) {
			const valueAfterExit = `${value.slice(0, lineStart)}${indent}${preserveEmptyListRemainder(value, lineStart, start)}`;
			return {
				value: valueAfterExit,
				cursor: getEmptyListExitCursor(valueAfterExit, lineStart, indent.length),
			};
		}
		const insert = `${indent}- `;
		const cursor = start + insert.length;
		return {
			value: `${value.slice(0, start)}${insert}${value.slice(start)}`,
			cursor,
		};
	}
	if (ordered === null) {
		return null;
	}
	const { indent, number, content } = ordered;
	if (content.trim().length === 0) {
		const valueAfterExit = `${value.slice(0, lineStart)}${indent}${preserveEmptyListRemainder(value, lineStart, start)}`;
		return {
			value: valueAfterExit,
			cursor: getEmptyListExitCursor(valueAfterExit, lineStart, indent.length),
		};
	}
	const insert = `${indent}${number + 1}. `;
	const cursor = start + insert.length;
	return renumberFollowingOrderedList(
		`${value.slice(0, start)}${insert}${value.slice(start)}`,
		cursor,
		indent,
		number + 1,
	);
}

/** Keeps the Markdown source aligned with the ordered list the user sees while editing. */
function renumberFollowingOrderedList(value: string, cursor: number, indent: string, currentNumber: number): TextReplacement {
	const lines = value.split("\n");
	let lineIndex = 0;
	let offset = 0;
	for (; lineIndex < lines.length; lineIndex += 1) {
		const lineLength = lines[lineIndex]?.length ?? 0;
		if (cursor <= offset + lineLength) {
			break;
		}
		offset += lineLength + 1;
	}
	let nextNumber = currentNumber + 1;
	for (let index = lineIndex + 1; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const match = line.match(/^(\s*)(\d+)([.)])(\s+.*)?$/);
		if (match === null || match[1] !== indent) {
			break;
		}
		lines[index] = `${indent}${nextNumber}${match[3]}${match[4] ?? ""}`;
		nextNumber += 1;
	}
	return { value: lines.join("\n"), cursor };
}

export function getListEnterPatchForNativeInput(
	previousValue: string,
	value: string,
	start: number,
	end: number,
	options: NativeListInputOptions = {},
): TextReplacement | null {
	if (options.allowInsertedMarkerCorrection === true) {
		const markerPatch = getListEnterPatchForNativeInsertedMarker(previousValue, value, start, end, options);
		if (markerPatch !== null) {
			return markerPatch;
		}
	}
	if (start !== end || start <= 0 || value.charAt(start - 1) !== "\n") {
		return null;
	}
	const withoutInsertedNewline = `${value.slice(0, start - 1)}${value.slice(start)}`;
	if (withoutInsertedNewline !== previousValue) {
		if (!options.allowTextChangeWithNewline || countLineBreaks(value) !== countLineBreaks(previousValue) + 1) {
			return null;
		}
	}
	return getListEnterPatchAfterNativeNewline(value, start, end);
}

function getListEnterPatchForNativeInsertedMarker(
	previousValue: string,
	value: string,
	start: number,
	end: number,
	options: NativeListInputOptions,
): TextReplacement | null {
	if (start !== end || start <= 0) {
		return null;
	}
	const markerLineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
	if (markerLineStart <= 0) {
		return null;
	}
	const markerLine = value.slice(markerLineStart, start);
	if (!isIncompleteListContinuationMarker(markerLine)) {
		return null;
	}
	const newlineIndex = markerLineStart - 1;
	const withoutInsertedMarker = `${value.slice(0, newlineIndex)}${value.slice(start)}`;
	if (withoutInsertedMarker !== previousValue) {
		if (!options.allowTextChangeWithNewline || countLineBreaks(value) !== countLineBreaks(previousValue) + 1) {
			return null;
		}
	}
	const expectedPatch = getListEnterPatch(withoutInsertedMarker, newlineIndex, newlineIndex);
	if (expectedPatch === null) {
		return null;
	}
	const correctedValue = `${value.slice(0, start)} ${value.slice(start)}`;
	const correctedCursor = start + 1;
	if (expectedPatch.value !== correctedValue || expectedPatch.cursor !== correctedCursor) {
		return null;
	}
	return {
		value: correctedValue,
		cursor: correctedCursor,
	};
}

function isIncompleteListContinuationMarker(line: string): boolean {
	return /^([ \t]*)(?:[-*+]|\d+[.)])$/.test(line) || /^([ \t]*)(?:[-*+]|\d+[.)])([ \t]+)\[ \]$/.test(line);
}

function countLineBreaks(value: string): number {
	let count = 0;
	for (let index = 0; index < value.length; index += 1) {
		if (value.charAt(index) === "\n") {
			count += 1;
		}
	}
	return count;
}

function preserveEmptyListRemainder(value: string, lineStart: number, lineEnd: number): string {
	const remainder = value.slice(lineEnd);
	return lineStart > 0 && remainder.length === 0 ? "\n" : remainder;
}

function getEmptyListExitCursor(value: string, lineStart: number, indentLength: number): number {
	return value.endsWith("\n") ? value.length : lineStart + indentLength;
}

function parseBulletListLine(line: string): { indent: string; content: string } | null {
	const markedLine = line.match(/^(\s*)[-*+]\s+(.*)$/);
	if (markedLine !== null) {
		return {
			indent: markedLine[1],
			content: markedLine[2],
		};
	}
	const emptyMarkerLine = line.match(/^(\s*)[-*+]$/);
	if (emptyMarkerLine === null) {
		return null;
	}
	return {
		indent: emptyMarkerLine[1],
		content: "",
	};
}

function parseOrderedListLine(line: string): { indent: string; number: number; content: string } | null {
	const markedLine = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
	if (markedLine !== null) {
		return {
			indent: markedLine[1],
			number: Number(markedLine[2]),
			content: markedLine[3],
		};
	}
	const emptyMarkerLine = line.match(/^(\s*)(\d+)[.)]$/);
	if (emptyMarkerLine === null) {
		return null;
	}
	return {
		indent: emptyMarkerLine[1],
		number: Number(emptyMarkerLine[2]),
		content: "",
	};
}

function isTagStart(value: string, hashIndex: number): boolean {
	if (hashIndex === 0) {
		return true;
	}
	return /[\s([{]/.test(value.charAt(hashIndex - 1));
}
